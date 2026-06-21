// File: src/services/convertService.ts
// Purpose: Markdown→各フォーマット変換の中核ロジックを担当するサービス。
// Reason: プラグイン本体から変換処理を切り離し、責務を明確化するため。
// Related: src/MdTexPlugin.ts, src/services/lintService.ts, src/utils/markdownTransforms.ts

import { Notice, MarkdownView, FileSystemAdapter } from "obsidian";
import * as path from "path";
import * as fs from "fs/promises";
import { isDefaultsTemplateMode, ProfileSettings } from "../MdTexPluginSettings";
import {
  replaceWikiLinksAndCodeAsync,
  unwrapValidWikiLinks,
  stripObsidianComments,
} from "../utils/markdownTransforms";
import { resolveDraftRequest } from "../utils/frontmatter";
import { buildHeader } from "../utils/headerBuilder";
import { expandTransclusions } from "../utils/transclusion";
import { detectDuplicateLabels } from "../utils/crossrefLabels";
import type { PluginContext } from "./pluginContext";
import { rasterizeMermaidBlocks } from "../utils/mermaidRasterizer";
import { t } from "../lang/helpers";
import { OutputFormat } from "./pandocCommandBuilder";
import { invokePandoc } from "./pandocInvocation";
import { joinFsPath, normalizeResourcePathList } from "../utils/pathHelpers";
import { resolveDefaultsFilePath } from "./templatePackService";
import { cleanupTemporaryFiles } from "./tempFiles";


export interface ConvertDeps {
  runMarkdownlintFix: (ctx: PluginContext, targetPath: string) => Promise<void>;
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

  const leaf = ctx.app.workspace.activeLeaf;
  if (leaf && leaf.view instanceof MarkdownView) {
    const markdownView = leaf.view as MarkdownView;
    if (markdownView.file && markdownView.file.path === activeFile.path) {
      await markdownView.save();
    }
  }

  if (!activeFile.path.endsWith(".md")) {
    new Notice(t("notice_not_markdown"));
    return;
  }

  new Notice(t("notice_converting", [format.toUpperCase()]));

  const originalProfile = ctx.getActiveProfileSettings();

  const fileAdapter = ctx.app.vault.adapter as FileSystemAdapter;
  const vaultBasePath = fileAdapter.getBasePath();

  // ADR-008: defaults file のパスを解決する。
  // pack: テンプレートフォルダ内の選択中パック → vault 相対パスを絶対パスへ。
  // custom: 従来の defaultsFilePath（絶対パス）をそのまま。
  // buildPandocCommand は純粋関数のため、vault I/O を伴う解決はここで済ませ、
  // 解決済み絶対パスを defaultsFilePath にセットしたコピーを後段へ渡す
  //（直接ミューテーションは data.json 汚染を招くため避ける）。
  let effectiveDefaultsPath = "";
  if (isDefaultsTemplateMode(originalProfile)) {
    // ADR-008: pack モードでパックが解決できた場合のみ vault 相対→絶対変換する。
    // resolveDefaultsFilePath は pack 未解決時に空を返すため、空でなければ vault 相対パス。
    // custom モード、および pack 未選択のフォールバック（旧 data.json 互換）は
    // defaultsFilePath をそのまま使う（絶対パスを getFullPath に渡して二重化しない）。
    const resolved = resolveDefaultsFilePath(originalProfile);
    const isCustom = originalProfile.defaultsSelection === "custom";
    if (!isCustom && resolved) {
      effectiveDefaultsPath = fileAdapter.getFullPath(resolved);
    } else {
      effectiveDefaultsPath = originalProfile.defaultsFilePath?.trim() ?? "";
    }

    // ガードレール（ADR-007/008）: パス未指定/未解決なら変換前にブロックする。
    // `-d` に空パスを渡すと Pandoc が不可解なエラーを出すため、設定不備を通知して中断する。
    if (!effectiveDefaultsPath) {
      new Notice(t("notice_defaults_file_required"));
      return;
    }
  }
  const activeProfile = { ...originalProfile, defaultsFilePath: effectiveDefaultsPath };

  const inputFilePath = fileAdapter.getFullPath(activeFile.path);
  const baseName = path.basename(inputFilePath, ".md");
  const sourceDir = path.dirname(inputFilePath);

  const outputDir = activeProfile.outputDirectory || vaultBasePath;
  try {
    await fs.access(outputDir);
  } catch {
    new Notice(t("notice_output_dir_missing", [outputDir]));
    return;
  }

  const resourcePath = resolveResourcePath(activeProfile, vaultBasePath);

  const tempFileName = `${baseName.replace(/\s/g, "_")}.temp.md`;
  // lint 実行時の workingDir を元ノートと揃えるため、中間ファイルをソース側に置く
  const intermediateFilename = joinFsPath(sourceDir, tempFileName);
  const headerFileName = `${baseName.replace(/\s/g, "_")}.preamble.tex`;
  const headerFilePath = joinFsPath(outputDir, headerFileName);
  const mermaidTempDirs: string[] = [];

  const ext = format === "latex" ? ".tex" : `.${format}`;
  const outputFilename = joinFsPath(outputDir, `${baseName.replace(/\s/g, "_")}${ext}`);

  const cache = new Map<string, string>();

  try {
    let content = await fs.readFile(inputFilePath, "utf8");

    // Obsidianコメント (%% ... %%) をPDF等に出さないよう事前に除去
    content = stripObsidianComments(content);

    // Mermaid コードブロックの言語削除は TS 正規表現（stripMermaidLanguage）から
    // Lua フィルタ（MERMAID_STRIP_LUA_FILTER）へ移行した（ADR-005）。
    // 適用判定は pandocInvocation.buildPandocExecutionPlan の stripMermaid フラグで行うため、
    // ここでの前処理は不要。

    // draft 要求（--draft 引数 + frontmatter の mdtex.draft）を1箇所で解決する（候補 3）。
    // draft は LaTeX（graphicx）にだけ伝えるもので Pandoc 引数ではないため、ここで抜いて
    // ヘッダの draftSnippet に反映させる。
    const { pandocExtraArgs, draftRequested } = resolveDraftRequest(
      activeProfile.pandocExtraArgs,
      content,
    );

    // トランスクルージョン (![[...]]) を先に展開（キャッシュ共有）
    content = await expandTransclusions(content, ctx.app, activeFile.path, cache);

    // Mermaidコードブロックを一時PNG化し、PDFでも確実に図が描かれるようにする
    if (ctx.settings.enableExperimentalMermaid) {
      const mermaidResult = await rasterizeMermaidBlocks(content, {
        app: ctx.app,
        sourcePath: activeFile.path,
        imageScale: activeProfile.imageScale,
        suppressLogs: ctx.settings.suppressDeveloperLogs,
      });
      content = mermaidResult.content;
      mermaidTempDirs.push(...mermaidResult.cleanupDirs);
    }

    // markdownlint --fix は Markdown フェンス構造を保ったまま走らせたいので、
    // LaTeX 置換より先に実行する。
    const lintEnabled = ctx.settings.enableMarkdownlintFix;
    if (lintEnabled) {
      await fs.writeFile(intermediateFilename, content, "utf8");
      try {
        await deps.runMarkdownlintFix(ctx, intermediateFilename);
        content = await fs.readFile(intermediateFilename, "utf8");
      } catch (e: unknown) {
        console.error(e);
        new Notice(t("notice_markdownlint_failed_continue"));
        // lint 失敗時は元の content をそのまま使う
      }
    }

    // ヘッダ（--include-in-header の中身）の組み立ては純粋関数 buildHeader に切り出している。
    // 文書テンプレート方式（ADR-007）の分岐、CALLOUT_PREAMBLE 付与、codelisting 補完、
    // label overrides、ページ番号スニペット、draft スニペットの各段とその根拠は
    // buildHeader 側に集約済み（issue #51）。ここでは方式の解決と draft フラグだけ渡す。
    // defaults 方式は文書の「枠」（プリアンブル本体・キャプション名・ページ番号）を defaults
    // file 側で管理する一方、CALLOUT_PREAMBLE / codelisting / draftSnippet は MdTex 固有
    // レイヤとして方式に関わらず buildHeader 内で維持する。
    const mode = isDefaultsTemplateMode(activeProfile) ? "defaults" : "builtin";
    const headerContent = buildHeader(activeProfile, { mode, draft: draftRequested });
    // LaTeX生ファイルとして include-in-header で渡す（Markdown経由のエスケープを防ぐ）
    await fs.writeFile(headerFilePath, `${headerContent}\n`, "utf8");

    // 有効な WikiLink のみ [[ ]] を外してテキストにする
    content = unwrapValidWikiLinks(content, ctx.app, activeFile.path);

    content = await replaceWikiLinksAndCodeAsync(
      content,
      ctx.app,
      activeProfile,
      activeFile.path,
    );

    // 方式W: crossref ラベルの重複検出。メイン文書内のユーザーミス、および
    // 同一ファイル複数回埋め込みによる crossref 制約衝突を、Pandoc 実行前に検出して
    // 分かりやすく通知する（ADR-005 関連）。GHC の CallStack ではなく日本語で原因を示す。
    const duplicates = detectDuplicateLabels(content);
    if (duplicates.length > 0) {
      const summary = duplicates
        .map(d => `${d.label} (${d.count}回)`)
        .join(", ");
      new Notice(t("notice_duplicate_labels", [summary]));
      if (!ctx.settings.suppressDeveloperLogs) {
        console.warn(
          `[MdTex] Duplicate cross-reference labels: ${duplicates.map(d => `${d.label}(${d.count})`).join(", ")}`,
          duplicates,
        );
      }
      return;
    }

    // NOTE: docx 出力時の LaTeX コマンド処理は文字列の正規表現逆変換では行わない。
    // `[^}]+` 系パターンは波括弧のネスト・`\{` エスケープ・複数行・オプション引数に対応できず、
    // ネストした LaTeX（例: \footnote{\textbf{重要}}）を破壊するため。
    // 代わりに Pandoc の AST を直接処理する Lua フィルタ（DOCX_TEX_LUA_FILTER）へ一本化し、
    // pandocInvocation（buildPandocExecutionPlan）で実行時に一時ファイルとして渡す。

    // Pandoc 起動は入力方式（stdin/file）の分岐を隠した深い module（invokePandoc）に委譲する
    // （architecture review 候補 2 + 4）。本文は常に stdin で渡し、lint の有無で Pandoc への
    // 入力経路が変わることはない。lint は純粋に上記の content への前処理ステップとなった。
    const success = await invokePandoc({
      ctx,
      profile: activeProfile,
      format,
      inputContent: content,
      outputFile: outputFilename,
      headerFilePath,
      workingDir: path.dirname(inputFilePath),
      resourcePath,
      pandocExtraArgs,
      stripMermaid: !ctx.settings.enableExperimentalMermaid,
    });

    if (success && activeProfile.deleteIntermediateFiles) {
      try {
        // intermediateFilename は lint 有効時にのみ作られるため、そのときだけ削除する
        if (lintEnabled) await fs.unlink(intermediateFilename);
        await fs.unlink(headerFilePath);
      } catch (err) {
        console.warn(`Failed to delete intermediate files`, err);
      }
    }
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
