// File: src/services/convertService.ts
// Purpose: Markdown→各フォーマット変換の中核ロジックを担当するサービス。
// Reason: プラグイン本体から変換処理を切り離し、責務を明確化するため。
// Related: src/MdTexPlugin.ts, src/services/lintService.ts, src/utils/markdownTransforms.ts

import { Notice, MarkdownView, FileSystemAdapter } from "obsidian";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import { ProfileSettings } from "../MdTexPluginSettings";
import {
  replaceWikiLinksAndCodeAsync,
  unwrapValidWikiLinks,
  stripObsidianComments,
} from "../utils/markdownTransforms";
import { appendLabelOverrides, ensureCodelistingEnvironment } from "../utils/latexPreamble";
import { CALLOUT_PREAMBLE } from "../utils/calloutTheme";
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

export interface ConvertDeps {
  runMarkdownlintFix: (ctx: PluginContext, targetPath: string) => Promise<void>;
}

// Luaフィルタを一時生成（ディレクトリも返し、失敗時は片付ける）
async function createTempLuaFilter(): Promise<{ luaPath: string; tempDir: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-lua-"));
  try {
    const fileName = `callout-${Date.now()}-${Math.random().toString(16).slice(2)}.lua`;
    const luaPath = joinFsPath(tempDir, fileName);
    await fs.writeFile(luaPath, CALLOUT_LUA_FILTER, "utf8");
    return { luaPath, tempDir };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: false }).catch(() => {});
    throw error;
  }
}

// プロファイル既定値のラベル／接頭辞を Pandoc メタデータ YAML として一時生成する。
// 値が全て空なら null を返し、呼び出し側は --metadata-file を省略する。
async function createTempMetadataFile(
  profile: ProfileSettings,
): Promise<{ metadataPath: string; tempDir: string } | null> {
  const body = buildLabelMetadataYaml(profile);
  if (!body) return null;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-metadata-"));
  try {
    const fileName = `labels-${Date.now()}-${Math.random().toString(16).slice(2)}.yaml`;
    const metadataPath = joinFsPath(tempDir, fileName);
    await fs.writeFile(metadataPath, body, "utf8");
    return { metadataPath, tempDir };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: false }).catch(() => {});
    throw error;
  }
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

  const activeProfile = ctx.getActiveProfileSettings();
  const fileAdapter = ctx.app.vault.adapter as FileSystemAdapter;
  const vaultBasePath = fileAdapter.getBasePath();
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

    // ユーザー設定プリアンブルにコールアウト定義を付与する
    // プリアンブルは生 .tex として --include-in-header で渡すため、YAML(header-includes) 時代の
    // クリーニングは行わず、ユーザー設定 + コールアウト定義をそのまま素通りさせる。
    const baseHeader = activeProfile.headerIncludes || "";
    // Pandoc 3.8+ は --listings 時にキャプション付きコードブロックを \begin{codelisting} で
    // 出力する。codelisting 環境は DEFAULT_LATEX_PREAMBLE に定義済みだが、旧版からの移行等で
    // 独自プリアンブルを持つ場合は定義が欠け「Environment codelisting undefined.」で停止するため、
    // 欠けていれば冪等に補完する（コールアウト定義付与と同じ層で処理）。
    const withCallout = ensureCodelistingEnvironment(
      baseHeader.includes("obsidiancallout")
        ? baseHeader
        : `${baseHeader.trim()}\n\n${CALLOUT_PREAMBLE}`.trim(),
    );
    // crossref-ON 時はキャプション語／参照接頭辞をメタデータ経路
    // （--metadata-file / frontmatter）に一本化し、\renewcommand との二重管理を避ける。
    // crossref-OFF 時はメタデータの消費先がないため、プロファイル値で LaTeX ネイティブの
    // キャプション名（\figurename 等）を上書きするフォールバックを残す。
    const headerWithListings = activeProfile.usePandocCrossref
      ? withCallout
      : appendLabelOverrides(withCallout, {
          figureLabel: activeProfile.figureLabel,
          figPrefix: activeProfile.figPrefix,
          tableLabel: activeProfile.tableLabel,
          tblPrefix: activeProfile.tblPrefix,
          codeLabel: activeProfile.codeLabel,
          lstPrefix: activeProfile.lstPrefix,
          equationLabel: activeProfile.equationLabel,
          eqnPrefix: activeProfile.eqnPrefix,
        });

    //
    // LaTeX の \maketitle はタイトルページを強制的に plain スタイルにする。
    // ページ番号をオフにしても、plain スタイルのままだと1ページ目だけ数字が出る。
    // plain → empty に差し替えてタイトルページも無番号に統一する。
    const pageNumberSnippet = activeProfile.usePageNumber
      ? ""
      : "\\makeatletter\\let\\ps@plain\\ps@empty\\makeatother";

    const draftSnippet = draftRequested
      ? [
          "\\def\\isdraft{1}",
          "\\PassOptionsToPackage{draft}{graphicx}",
          "\\makeatletter\\Gin@drafttrue\\makeatother",
        ].join("\n")
      : "";

    const headerWithoutDraft = pageNumberSnippet
      ? `${pageNumberSnippet}\n${headerWithListings}`
      : headerWithListings;

    const headerWithDraftFlag = draftSnippet
      ? `${draftSnippet}\n${headerWithoutDraft}`
      : headerWithoutDraft;
    // LaTeX生ファイルとして include-in-header で渡す（Markdown経由のエスケープを防ぐ）
    await fs.writeFile(headerFilePath, `${headerWithDraftFlag}\n`, "utf8");

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
        console.warn(`[MdTex] Duplicate cross-reference labels:`, duplicates);
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

// DOCX 出力用の AST ベース Lua フィルタ（DOCX_TEX_LUA_FILTER）を一時生成する。
// 従来の loose ファイル（tex-to-docx.lua）依存は廃止し、配布物（main.js）に埋め込んだ
// フィルタを実行時に一時ファイルへ書き出すことで、全環境で正しく適用されるようにする。
// 同パターンで Mermaid 言語削除フィルタ（MERMAID_STRIP_LUA_FILTER）も生成する。
async function createTempLuaFilterContent(
  content: string,
  prefix: string,
): Promise<{ luaPath: string; tempDir: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    const fileName = `${prefix}${Date.now()}-${Math.random().toString(16).slice(2)}.lua`;
    const luaPath = joinFsPath(tempDir, fileName);
    await fs.writeFile(luaPath, content, "utf8");
    return { luaPath, tempDir };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: false }).catch(() => {});
    throw error;
  }
}

async function createTempDocxFilter(): Promise<{ luaPath: string; tempDir: string }> {
  return createTempLuaFilterContent(DOCX_TEX_LUA_FILTER, "mdtex-docx-");
}

// Mermaid 言語削除フィルタ（pdf/latex 用）を一時生成する。
// 適用条件（enableExperimentalMermaid が無効）は buildPandocExecutionPlan 側で判定する。
async function createTempMermaidFilter(): Promise<{ luaPath: string; tempDir: string }> {
  return createTempLuaFilterContent(MERMAID_STRIP_LUA_FILTER, "mdtex-mermaid-");
}

async function isInsideBaseDir(target: string, base: string): Promise<boolean> {
  const [realTarget, realBase] = await Promise.all([
    fs.realpath(target).catch(() => path.resolve(target)),
    fs.realpath(base).catch(() => path.resolve(base)),
  ]);

  const normalize = (p: string) => path.resolve(p).replace(/[/\\]+/g, path.sep);
  const t = normalize(realTarget);
  const b = normalize(realBase);

  if (process.platform === "win32") {
    const tl = t.toLowerCase();
    const bl = b.toLowerCase();
    return tl === bl || tl.startsWith(bl + path.sep);
  }

  return t === b || t.startsWith(b + path.sep);
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
    luaFilters.push(created.luaPath);
    tempFiles.push(created.luaPath, created.tempDir);

    // 実験的 Mermaid 無効時: Mermaid コードブロックの言語を削除し、--listings の
    // unknown language 警告を防ぐ。従来の stripMermaidLanguage（TS 正規表現）に代わる
    // AST ベース処理（ADR-005）。
    if (params.stripMermaid) {
      const mermaid = await createTempMermaidFilter();
      luaFilters.push(mermaid.luaPath);
      tempFiles.push(mermaid.luaPath, mermaid.tempDir);
    }
  }

  if (params.format === "docx" && params.profile.enableAdvancedTexCommands) {
    const docxFilter = await createTempDocxFilter();
    luaFilters.push(docxFilter.luaPath);
    tempFiles.push(docxFilter.luaPath, docxFilter.tempDir);
  }

  // プロファイル既定値をメタデータとして渡し、文書 frontmatter で上書き可能にする。
  // ただし figureTitle / figPrefix 等は pandoc-crossref 専用メタデータなので、
  // crossref-OFF では消費先がなく無意味。その場合は LaTeX ネイティブの
  // \renewcommand フォールバック（convertCurrentPage 側）に任せ、不要な
  // 一時ファイル生成を避ける。
  const metadata = params.profile.usePandocCrossref
    ? await createTempMetadataFile(params.profile)
    : null;
  let metadataFile: string | undefined;
  if (metadata) {
    metadataFile = metadata.metadataPath;
    tempFiles.push(metadata.metadataPath, metadata.tempDir);
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

const TEMP_PREFIXES = ["mdtex-lua-", "mdtex-mermaid-", "mdtex-docx-", "mdtex-"];

async function cleanupTemporaryFiles(files: string[]) {
  if (!files?.length) return;

  const uniq = Array.from(new Set(files.map(f => path.resolve(f))));
  const tempRoot = path.resolve(os.tmpdir());
  const tempRootReal = await fs.realpath(tempRoot).catch(() => tempRoot);

  await Promise.allSettled(
    uniq.map(async file => {
      try {
        const resolved = path.resolve(file);
        if (!(await isInsideBaseDir(resolved, tempRootReal))) return;
        const base = path.basename(resolved);
        if (!TEMP_PREFIXES.some(p => base.startsWith(p))) return;
        await fs.rm(resolved, { recursive: true, force: false, maxRetries: 2, retryDelay: 100 });
      } catch (err: unknown) {
        const errorObj = err as { code?: string };
        if (errorObj.code !== "ENOENT") {
          console.warn(`Failed to delete temporary file: ${file}`, err);
        }
      }
    }),
  );
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
