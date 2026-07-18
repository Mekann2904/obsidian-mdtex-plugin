// File: src/services/convertService.ts
// Purpose: Markdown→各フォーマット変換の中核ロジックを担当するサービス。
// Reason: プラグイン本体から変換処理を切り離し、責務を明確化するため。
// Related: src/MdTexPlugin.ts, src/services/lintService.ts, src/services/normalizeMarkdown.ts,
//          src/services/conversionPaths.ts, src/utils/markdownTransforms.ts

import { Notice, FileSystemAdapter } from "obsidian";
import * as path from "path";
import * as fs from "fs/promises";
import { isDefaultsTemplateMode, ProfileSettings } from "../MdTexPluginSettings";
import { buildHeader } from "../utils/headerBuilder";
import type { PluginContext } from "./pluginContext";
import { normalizeMarkdown } from "./normalizeMarkdown";
import { buildConversionPaths } from "./conversionPaths";
import { t } from "../lang/helpers";
import { OutputFormat } from "./pandocCommandBuilder";
import { invokePandoc } from "./pandocInvocation";
import { joinFsPath, normalizeResourcePathList } from "../utils/pathHelpers";
import { resolveDefaultsFilePath } from "./templatePackService";
import { cleanupTemporaryFiles } from "./tempFiles";
import { saveActiveMarkdownViewIfMatching } from "./activeView";
import { makeObsidianVault } from "./obsidianVaultLike";
import { rasterizeMermaidBlocks } from "../utils/mermaidRasterizer";


export interface ConvertDeps {
  runMarkdownlintFix: (ctx: PluginContext, targetPath: string) => Promise<void>;
}

/**
 * ADR-008: defaults 方式の defaults file パスを解決する（convertCurrentPage から切り出し・純粋関数）。
 *
 * - pack: resolveDefaultsFilePath が返す vault 相対パスを getFullPath で絶対パスへ。
 * - custom: defaultsFilePath（絶対パス）をそのまま（getFullPath に渡して二重化しない）。
 * - 非 defaults 方式: 空パス（呼び出し側は defaults 不要として扱う）。
 *
 * パス未指定/未解決は { error: "missing" } で表し、呼び出し側で Notice/中断する。
 * getFullPath（vault 相対→絶対）を inject し、パス計算と vault I/O を分離する
 * （thermo-nuclear review 第3ラウンド #4: convertCurrentPage 冒頭の35行を実装詳細から解放）。
 */
function resolveEffectiveDefaultsPath(
  profile: ProfileSettings,
  getFullPath: (vaultRelative: string) => string,
): { path: string } | { error: "missing" } {
  if (!isDefaultsTemplateMode(profile)) return { path: "" };
  const resolved = resolveDefaultsFilePath(profile);
  const isCustom = profile.defaultsSelection === "custom";
  const path = !isCustom && resolved
    ? getFullPath(resolved)
    : (profile.defaultsFilePath?.trim() ?? "");
  return path ? { path } : { error: "missing" };
}

function resolveResourcePath(profile: ProfileSettings, vaultBasePath: string): string {
  const configured = profile.searchDirectory?.trim();
  if (configured) {
    const resolved = path.isAbsolute(configured)
      ? configured
      : joinFsPath(vaultBasePath, configured);
    return normalizeResourcePathList(resolved);
  }
  return normalizeResourcePathList(vaultBasePath);
}

export async function convertCurrentPage(
  ctx: PluginContext,
  deps: ConvertDeps,
  format: OutputFormat,
) {
  const startedAt = Date.now();

  const activeFile = ctx.app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice(t("notice_no_active_file"));
    return;
  }

  await saveActiveMarkdownViewIfMatching(ctx.app, activeFile);

  if (!activeFile.path.endsWith(".md")) {
    new Notice(t("notice_not_markdown"));
    return;
  }

  new Notice(t("notice_converting", [format.toUpperCase()]));

  const originalProfile = ctx.getActiveProfileSettings();

  const fileAdapter = ctx.app.vault.adapter as FileSystemAdapter;
  const vaultBasePath = fileAdapter.getBasePath();

  // ADR-008: defaults file のパス解決（pack: vault 相対→絶対 / custom: そのまま）を純粋関数
  // resolveEffectiveDefaultsPath に委譲する。getFullPath（vault I/O）は inject して純粋性を保つ。
  const defaultsResolved = resolveEffectiveDefaultsPath(originalProfile, p =>
    fileAdapter.getFullPath(p),
  );
  // ガードレール（ADR-007/008）: defaults 方式でパス未指定/未解決なら変換前にブロックする。
  // `-d` に空パスを渡すと Pandoc が不可解なエラーを出すため、設定不備を通知して中断する。
  if ("error" in defaultsResolved) {
    new Notice(t("notice_defaults_file_required"));
    return;
  }
  // 非 defaults 方式は path が空（defaults 不要）。解決済みパスをコピーに載せて後段へ渡す
  //（直接ミューテーションは data.json 汚染を招くため避ける）。
  const activeProfile = defaultsResolved.path
    ? { ...originalProfile, defaultsFilePath: defaultsResolved.path }
    : originalProfile;

  const inputFilePath = fileAdapter.getFullPath(activeFile.path);

  const outputDir = activeProfile.outputDirectory || vaultBasePath;
  try {
    await fs.access(outputDir);
  } catch {
    new Notice(t("notice_output_dir_missing", [outputDir]));
    return;
  }

  const resourcePath = resolveResourcePath(activeProfile, vaultBasePath);

  const lintEnabled = ctx.settings.enableMarkdownlintFix;
  // 作業パス群（入力・出力・lint 中間体・header）の命名知識を buildConversionPaths に集約する
  // （architecture review 候補 C）。app 非依存の純粋関数で構築する。
  const paths = buildConversionPaths({
    inputFilePath,
    outputDir,
    resourcePath,
    format,
    lintEnabled,
  });
  const mermaidTempDirs: string[] = [];

  try {
    const rawContent = await fs.readFile(inputFilePath, "utf8");

    // 本文正規化パイプライン（8 step の順序・transclusion キャッシュ・lint 中間ファイル
    // lifecycle）を深い module（normalizeMarkdown）に委譲する（architecture review 候補 A）。
    // 呼び出し側は生本文を渡し、最終本文・draft フラグ・重複ラベル・cleanup 対象を受け取る。
    // normalizeMarkdown は Obsidian App に依存しない（VaultLike + injectable mermaid/lint 通知）ため、
    // CLI も同一パイプラインを共用する（thermo-nuclear review #1）。
    const normalized = await normalizeMarkdown({
      content: rawContent,
      vault: makeObsidianVault(ctx.app),
      sourcePath: activeFile.path,
      profile: activeProfile,
      pandocExtraArgs: activeProfile.pandocExtraArgs,
      // Mermaid は enableExperimentalMermaid のときだけ callback を注入（未注入＝ステップ4スキップ）。
      rasterizeMermaid: ctx.settings.enableExperimentalMermaid
        ? content =>
            rasterizeMermaidBlocks(content, {
              app: ctx.app,
              sourcePath: activeFile.path,
              imageScale: activeProfile.imageScale,
              suppressLogs: ctx.settings.suppressDeveloperLogs,
            })
        : undefined,
      // lint は enableMarkdownlintFix のときだけオブジェクトを注入（未注入＝ステップ5スキップ）。
      lint: lintEnabled
        ? {
            fix: target => deps.runMarkdownlintFix(ctx, target),
            intermediatePath: paths.intermediate,
            onFailure: () => new Notice(t("notice_markdownlint_failed_continue")),
            keepIntermediate: !activeProfile.deleteIntermediateFiles,
          }
        : undefined,
    });
    mermaidTempDirs.push(...normalized.cleanupDirs);

    // 方式W: crossref ラベルの重複検出。メイン文書内のユーザーミス、および
    // 同一ファイル複数回埋め込みによる crossref 制約衝突を、Pandoc 実行前に検出して
    // 分かりやすく通知する（ADR-005 関連）。GHC の CallStack ではなく日本語で原因を示す。
    // 検出は normalizeMarkdown が行い、通知/中断の判断はここ（オーケストレーション層）で行う。
    if (normalized.duplicateLabels.length > 0) {
      const summary = normalized.duplicateLabels
        .map(d => `${d.label} (${d.count}回)`)
        .join(", ");
      new Notice(t("notice_duplicate_labels", [summary]));
      if (!ctx.settings.suppressDeveloperLogs) {
        console.warn(
          `[MdTex] Duplicate cross-reference labels: ${normalized.duplicateLabels.map(d => `${d.label}(${d.count})`).join(", ")}`,
          normalized.duplicateLabels,
        );
      }
      return;
    }

    // ヘッダ（--include-in-header の中身）の組み立ては純粋関数 buildHeader に切り出している。
    // 文書テンプレート方式（ADR-007）の分岐、CALLOUT_PREAMBLE 付与、codelisting 補完、
    // label overrides、ページ番号スニペット、draft スニペットの各段とその根拠は
    // buildHeader 側に集約済み（issue #51）。ここでは方式の解決と draft フラグだけ渡す。
    // defaults 方式は文書の「枠」（プリアンブル本体・キャプション名・ページ番号）を defaults
    // file 側で管理する一方、CALLOUT_PREAMBLE / codelisting / draftSnippet は MdTex 固有
    // レイヤとして方式に関わらず buildHeader 内で維持する。
    const mode = isDefaultsTemplateMode(activeProfile) ? "defaults" : "builtin";
    const headerContent = buildHeader(activeProfile, { mode, draft: normalized.draftRequested });

    // NOTE: docx 出力時の LaTeX コマンド処理は文字列の正規表現逆変換では行わない。
    // `[^}]+` 系パターンは波括弧のネスト・`\{` エスケープ・複数行・オプション引数に対応できず、
    // ネストした LaTeX（例: \footnote{\textbf{重要}}）を破壊するため。
    // 代わりに Pandoc の AST を直接処理する Lua フィルタ（DOCX_TEX_LUA_FILTER）へ一本化し、
    // pandocInvocation（buildPandocExecutionPlan）で実行時に一時ファイルとして渡す。

    // Pandoc 起動は入力方式（stdin/file）の分岐を隠した深い module（invokePandoc）に委譲する
    // （architecture review 候補 2 + 4）。本文は常に stdin で渡し、lint の有無で Pandoc への
    // 入力経路が変わることはない。lint は normalizeMarkdown 内の前処理ステップとなった。
    // header ファイルの生成・cleanup も invokePandoc 配下に統一した（候補 B）。呼び出し側は
    // buildHeader の結果（headerContent）を渡すだけで、header ファイルのパスを知らない。
    await invokePandoc({
      ctx,
      profile: activeProfile,
      format,
      inputContent: normalized.content,
      outputFile: paths.output,
      headerContent,
      workingDir: paths.sourceDir,
      resourcePath: paths.resourcePath,
      pandocExtraArgs: normalized.pandocExtraArgs,
      stripMermaid: !ctx.settings.enableExperimentalMermaid,
    });

    // NOTE: lint 中間ファイル（.temp.md）の cleanup は normalizeMarkdown が所有する
    // （keepLintIntermediate = !deleteIntermediateFiles で残すか制御）。header の cleanup も
    // invokePandoc 配下に統一され（候補 B）、常に消される。両中間ファイルの lifecycle が
    // それぞれの深い module に局所化された。
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    new Notice(t("notice_error_generating", [errorMessage]));
  } finally {
    // mermaid の一時ディレクトリも Lua/YAML フィルタと同じ安全な cleanup seam を通す
    // （architecture review 候補 1）。mermaidRasterizer は "mdtex-mermaid-" prefix で生成し、
    // この prefix は tempFiles.TEMP_PREFIXES に既に登録済みのため、OS 一時領域 + prefix の
    // 二重検査が cleanupTemporaryFiles 内で効く。手書きの realpath/lstat/rm は不要になった。
    await cleanupTemporaryFiles(mermaidTempDirs);

    const elapsed = Date.now() - startedAt;
    if (!ctx.settings.suppressDeveloperLogs) {
      console.log(`[MdTex] convert ${format.toUpperCase()} completed in ${elapsed} ms`);
    }
  }
}
