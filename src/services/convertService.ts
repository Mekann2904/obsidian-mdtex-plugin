// File: src/services/convertService.ts
// Purpose: Markdown→各フォーマット変換の中核ロジックを担当するサービス。
// Reason: プラグイン本体から変換処理を切り離し、責務を明確化するため。
// Related: src/MdTexPlugin.ts, src/services/lintService.ts, src/utils/markdownTransforms.ts

import { Notice, MarkdownView, FileSystemAdapter } from "obsidian";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import { isDefaultsTemplateMode, ProfileSettings } from "../MdTexPluginSettings";
import {
  replaceWikiLinksAndCodeAsync,
  unwrapValidWikiLinks,
  stripObsidianComments,
} from "../utils/markdownTransforms";
import { buildHeader } from "../utils/headerBuilder";
import { CALLOUT_LUA_FILTER } from "../assets/callout-filter";
import { DOCX_TEX_LUA_FILTER } from "../assets/docxTexFilter";
import { MERMAID_STRIP_LUA_FILTER } from "../assets/mermaid-filter";
import { expandTransclusions } from "../utils/transclusion";
import { detectDuplicateLabels } from "../utils/crossrefLabels";
import type { PluginContext } from "./lintService";
import { rasterizeMermaidBlocks } from "../utils/mermaidRasterizer";
import { t } from "../lang/helpers";
import {
  buildPandocCommand,
  buildLabelMetadataYaml,
  OutputFormat,
  PandocCommandResult,
} from "./pandocCommandBuilder";
import { runCommand } from "../utils/processRunner";
import { joinFsPath, normalizeResourcePathList } from "../utils/pathHelpers";

import {
  resolveDefaultsFilePath,
  normalizeTemplateFolder,
} from "./templatePackService";
import {
  createTempFile,
  cleanupTemporaryFiles,
  isInsideBaseDir,
  TempFileArtifact,
} from "./tempFiles";


export interface ConvertDeps {
  runMarkdownlintFix: (ctx: PluginContext, targetPath: string) => Promise<void>;
}

function parseDraftFlag(extraArgs: string): { extras: string[]; isDraft: boolean } {
  if (!extraArgs || !extraArgs.trim()) return { extras: [], isDraft: false };

  let isDraft = false;
  const extras = extraArgs.split(/\s+/).filter(arg => {
    if (arg === "--draft") {
      isDraft = true;
      return false;
    }
    if (arg.startsWith("--draft=")) {
      const value = arg.split("=")[1]?.toLowerCase();
      isDraft = value !== "0" && value !== "false";
      return false;
    }
    return !!arg;
  });

  return { extras, isDraft };
}

function detectDraftInFrontmatter(markdown: string): boolean {
  const fmMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return false;

  const yaml = fmMatch[1];
  const lines = yaml.split(/\r?\n/);

  let inMdtexBlock = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // mdtex: draft: true  もしくは mdtex: draft (boolean省略)
    if (/^mdtex\.draft\s*:/i.test(line)) {
      const val = line.split(":")[1]?.trim() || "true";
      return val.toLowerCase() !== "false" && val !== "0";
    }

    // mdtex:
    if (/^mdtex\s*:/i.test(line)) {
      inMdtexBlock = true;
      const val = line.split(":")[1]?.trim();
      if (val) {
        // 単行で mdtex: draft と書かれた場合を true とみなす
        return val.toLowerCase() !== "false" && val !== "0";
      }
      continue;
    }

    // インデントされた mdtex ブロック内の draft: true
    if (inMdtexBlock && /^draft\s*:/i.test(line)) {
      const val = line.split(":")[1]?.trim() || "true";
      return val.toLowerCase() !== "false" && val !== "0";
    }

    if (inMdtexBlock && /^-\s*(draft|true|1|yes)$/i.test(line)) {
      return true;
    }

    // 別ブロックに移行したらリセット
    if (!raw.startsWith(" ") && !raw.startsWith("\t")) {
      inMdtexBlock = false;
    }
  }

  return false;
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
    // 適用判定は buildPandocExecutionPlan の stripMermaid フラグで行うため、
    // ここでの前処理は不要。

    // mdtex固有の --draft フラグをPandoc引数から分離してLaTeXにだけ伝える
    const { extras: pandocExtraArgs, isDraft } = parseDraftFlag(activeProfile.pandocExtraArgs);
    const frontmatterDraft = detectDraftInFrontmatter(content);
    const draftRequested = isDraft || frontmatterDraft;

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
    // buildPandocExecutionPlan で実行時に一時ファイルとして渡す。

    if (lintEnabled) {
      // markdownlint 後の内容を Pandoc に渡すため、再度中間ファイルへ書き戻す
      await fs.writeFile(intermediateFilename, content, "utf8");

      const success = await runPandoc(
        ctx,
        activeProfile,
        intermediateFilename,
        outputFilename,
        format,
        headerFilePath,
        pandocExtraArgs,
        sourceDir,
        resourcePath,
      );

      if (success && activeProfile.deleteIntermediateFiles) {
        try {
          await fs.unlink(intermediateFilename);
          await fs.unlink(headerFilePath);
        } catch (err) {
          console.warn(`Failed to delete intermediate file: ${intermediateFilename}`, err);
        }
      }
    } else {
      const success = await runPandocWithStdin(
        ctx,
        activeProfile,
        content,
        outputFilename,
        format,
        path.dirname(inputFilePath),
        headerFilePath,
        pandocExtraArgs,
        resourcePath,
      );

      if (success && activeProfile.deleteIntermediateFiles) {
        try {
          await fs.unlink(headerFilePath);
        } catch (err) {
          console.warn(`Failed to delete header file: ${headerFilePath}`, err);
        }
      }

      if (!success) {
        new Notice(t("notice_pandoc_stdin_failed"));
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    new Notice(t("notice_error_generating", [errorMessage]));
  } finally {
    const tempRoot = path.resolve(os.tmpdir());
    const tempRootReal = await fs.realpath(tempRoot).catch(() => tempRoot);

    for (const dir of mermaidTempDirs) {
      try {
        const resolved = path.resolve(dir);
        const insideTemp = await isInsideBaseDir(resolved, tempRootReal);
        if (!insideTemp) {
          console.warn(`Skip removing non-temp directory: ${dir}`);
          continue;
        }
        const base = path.basename(resolved);
        if (!base.startsWith("mdtex-mermaid-") || resolved === tempRootReal) {
          console.warn(`Skip removing suspicious temp dir: ${dir}`);
          continue;
        }
        const stat = await fs.lstat(resolved).catch(() => null);
        if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
          console.warn(`Skip removing non-directory or symlink: ${dir}`);
          continue;
        }
        // OSの一時領域に限定して安全に削除する
        await fs.rm(resolved, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 });
      } catch (err) {
        console.warn(`Failed to remove temporary Mermaid dir: ${dir}`, err);
      }
    }

    const elapsed = Date.now() - startedAt;
    if (!ctx.settings.suppressDeveloperLogs) {
      console.log(`[MdTex] convert ${format.toUpperCase()} completed in ${elapsed} ms`);
    }
  }
}

async function runPandoc(
  ctx: PluginContext,
  activeProfile: ProfileSettings,
  inputFile: string,
  outputFile: string,
  format: OutputFormat,
  headerFilePath: string,
  pandocExtraArgs: string[],
  workingDirOverride?: string,
  resourcePathOverride?: string,
): Promise<boolean> {
  let plan: PandocExecutionPlan | null = null;

  try {
    plan = await buildPandocExecutionPlan({
      profile: activeProfile,
      format,
      headerFilePath,
      outputFile,
      workingDir: workingDirOverride ?? path.dirname(inputFile),
      inputPath: inputFile,
      pandocExtraArgs,
      resourcePath: resourcePathOverride,
      stripMermaid: !ctx.settings.enableExperimentalMermaid,
    });

    return await executePandocCommand(plan, ctx, outputFile);
  } finally {
    await cleanupTemporaryFiles(plan?.tempFiles ?? []);
  }
}

async function runPandocWithStdin(
  ctx: PluginContext,
  activeProfile: ProfileSettings,
  inputContent: string,
  outputFile: string,
  format: OutputFormat,
  workingDir: string,
  headerFilePath: string,
  pandocExtraArgs: string[],
  resourcePathOverride?: string,
): Promise<boolean> {
  let plan: PandocExecutionPlan | null = null;

  try {
    plan = await buildPandocExecutionPlan({
      profile: activeProfile,
      format,
      headerFilePath,
      outputFile,
      workingDir,
      pandocExtraArgs,
      useStdin: true,
      resourcePath: resourcePathOverride,
      stripMermaid: !ctx.settings.enableExperimentalMermaid,
    });

    return await executePandocCommand(plan, ctx, outputFile, inputContent);
  } finally {
    await cleanupTemporaryFiles(plan?.tempFiles ?? []);
  }
}

interface PandocExecutionPlan {
  command: PandocCommandResult;
  tempFiles: string[];
  workingDir: string;
}

// 変換パイプラインで使う一時 Lua/YAML ファイルは、生成プリミティブ（createTempFile）の
// 薄いラッパとして統一する。mkdtemp + writeFile + cleanup-on-error は tempFiles.ts に集約済み。
// 各フィルタは配布物（main.js）に埋め込んだ文字列定数を実行時に一時ファイルへ書き出し、
// 全環境で正しく適用されるようにする（loose ファイル依存は廃止）。

// Obsidian コールアウト変換用 Lua フィルタ（pdf/latex 常時適用）。
async function createTempLuaFilter(): Promise<TempFileArtifact> {
  return createTempFile(CALLOUT_LUA_FILTER, "mdtex-lua-", "lua");
}

// DOCX 出力用の AST ベース Lua フィルタ（DOCX_TEX_LUA_FILTER）。
async function createTempDocxFilter(): Promise<TempFileArtifact> {
  return createTempFile(DOCX_TEX_LUA_FILTER, "mdtex-docx-", "lua");
}

// Mermaid 言語削除フィルタ（pdf/latex 用）。適用条件（enableExperimentalMermaid が無効）は
// buildPandocExecutionPlan 側で判定する（ADR-005）。
async function createTempMermaidFilter(): Promise<TempFileArtifact> {
  return createTempFile(MERMAID_STRIP_LUA_FILTER, "mdtex-mermaid-", "lua");
}

// プロファイル既定値のラベル／接頭辞を Pandoc メタデータ YAML として一時生成する。
// 値が全て空なら null を返し、呼び出し側は --metadata-file を省略する。
async function createTempMetadataFile(profile: ProfileSettings): Promise<TempFileArtifact | null> {
  const body = buildLabelMetadataYaml(profile);
  if (!body) return null;
  return createTempFile(body, "mdtex-metadata-", "yaml");
}

async function buildPandocExecutionPlan(params: {
  profile: ProfileSettings;
  format: OutputFormat;
  headerFilePath: string;
  outputFile: string;
  workingDir: string;
  pandocExtraArgs: string[];
  inputPath?: string;
  useStdin?: boolean;
  resourcePath?: string;
  // Mermaid 言語削除フィルタを適用するか（enableExperimentalMermaid が無効な場合 true）。
  // pdf/latex 出力でのみ意味を持ち、--listings の unknown language 警告を防ぐ（ADR-005）。
  stripMermaid?: boolean;
}): Promise<PandocExecutionPlan> {
  const tempFiles: string[] = [];
  const luaFilters: string[] = [];

  if (params.format === "pdf" || params.format === "latex") {
    const created = await createTempLuaFilter();
    luaFilters.push(created.filePath);
    tempFiles.push(created.filePath, created.tempDir);

    // 実験的 Mermaid 無効時: Mermaid コードブロックの言語を削除し、--listings の
    // unknown language 警告を防ぐ。従来の stripMermaidLanguage（TS 正規表現）に代わる
    // AST ベース処理（ADR-005）。
    if (params.stripMermaid) {
      const mermaid = await createTempMermaidFilter();
      luaFilters.push(mermaid.filePath);
      tempFiles.push(mermaid.filePath, mermaid.tempDir);
    }
  }

  if (params.format === "docx" && params.profile.enableAdvancedTexCommands) {
    const docxFilter = await createTempDocxFilter();
    luaFilters.push(docxFilter.filePath);
    tempFiles.push(docxFilter.filePath, docxFilter.tempDir);
  }

  // プロファイル既定値をメタデータとして渡し、文書 frontmatter で上書き可能にする。
  // ただし figureTitle / figPrefix 等は pandoc-crossref 専用メタデータなので、
  // crossref-OFF では消費先がなく無意味。その場合は LaTeX ネイティブの
  // \renewcommand フォールバック（convertCurrentPage 側）に任せ、不要な
  // 一時ファイル生成を避ける。
  // defaults 方式ではキャプション語／参照接頭辞も defaults file 側の `metadata:` で管理する。
  // コマンドライン `--metadata-file` は defaults file より優先されてしまうため、defaults 方式
  // では生成をスキップし、precedence 衝突を回避する（builtin 方式は従来どおり crossref-ON のみ生成）。
  const metadata =
    params.profile.usePandocCrossref && !isDefaultsTemplateMode(params.profile)
      ? await createTempMetadataFile(params.profile)
      : null;
  let metadataFile: string | undefined;
  if (metadata) {
    metadataFile = metadata.filePath;
    tempFiles.push(metadata.filePath, metadata.tempDir);
  }

  try {
    const command = buildPandocCommand({
      profile: params.profile,
      format: params.format,
      inputPath: params.useStdin ? undefined : params.inputPath,
      outputPath: params.outputFile,
      headerPath: params.headerFilePath,
      metadataFile,
      workingDir: params.workingDir,
      extraArgs: params.pandocExtraArgs,
      luaFilters,
      resourcePath:
        (params.resourcePath ?? params.profile.searchDirectory.trim()) || params.workingDir,
      useStdin: params.useStdin,
    });

    return { command, tempFiles, workingDir: params.workingDir };
  } catch (error) {
    await cleanupTemporaryFiles(tempFiles);
    throw error;
  }
}

function createPandocNoticeHandlers(ctx: PluginContext) {
  const NOTICE_LIMIT = 1;
  let noticeCount = 0;
  let overflowNotified = false;

  return {
    onStdout: (data: string) => {
      if (!ctx.settings.suppressDeveloperLogs) {
        console.log(`Pandoc Output: ${data.trim()}`);
      }
    },
    onStderr: (data: string) => {
      const msg = data.toString().trim();
      if (!msg) return;
      if (!ctx.settings.suppressDeveloperLogs) {
        console.warn(`Pandoc stderr: ${msg}`);
      }
      if (noticeCount < NOTICE_LIMIT) {
        new Notice(t("notice_pandoc_stderr", [msg.substring(0, 100)]));
        noticeCount += 1;
      } else if (!overflowNotified) {
        new Notice(t("notice_pandoc_more_logs"));
        overflowNotified = true;
      }
    },
  };
}

async function executePandocCommand(
  plan: PandocExecutionPlan,
  ctx: PluginContext,
  outputFile: string,
  inputContent?: string,
): Promise<boolean> {
  const handlers = createPandocNoticeHandlers(ctx);

  try {
    const result = await runCommand(plan.command.command, plan.command.args, {
      cwd: plan.workingDir,
      env: { ...process.env, PATH: process.env.PATH ?? "" },
      input: inputContent,
      onStdout: handlers.onStdout,
      onStderr: handlers.onStderr,
    });

    if (result.exitCode === 0) {
      new Notice(t("notice_generated", [path.basename(outputFile)]));
      return true;
    }

    new Notice(t("notice_pandoc_exit_code", [result.exitCode]));
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    new Notice(t("notice_pandoc_launch_error", [errorMessage]));
    return false;
  }
}
