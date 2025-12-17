// File: src/services/convertService.ts
// Purpose: Markdown→各フォーマット変換の中核ロジックを担当するサービス。
// Reason: プラグイン本体から変換処理を切り離し、責務を明確化するため。
// Related: src/MdTexPlugin.ts, src/services/lintService.ts, src/utils/markdownTransforms.ts

import { Notice, MarkdownView, FileSystemAdapter } from "obsidian";
import * as path from "path";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import { ProfileSettings } from "../MdTexPluginSettings";
import { replaceWikiLinksRecursivelyAsync, unwrapValidWikiLinks } from "../utils/markdownTransforms";
import { cleanLatexPreamble, appendLabelOverrides } from "../utils/latexPreamble";
import { CALLOUT_PREAMBLE } from "../utils/calloutTheme";
import { CALLOUT_LUA_FILTER } from "../assets/callout-filter";
import { expandTransclusions } from "../utils/transclusion";
import type { PluginContext } from "./lintService";
import { rasterizeMermaidBlocks } from "../utils/mermaidRasterizer";
import { t } from "../lang/helpers";
import { buildPandocCommand, OutputFormat, PandocCommandResult } from "./pandocCommandBuilder";
import { runCommand } from "../utils/processRunner";

export interface ConvertDeps {
  runMarkdownlintFix: (ctx: PluginContext, targetPath: string) => Promise<void>;
}

// Luaフィルタを一時生成
async function createTempLuaFilter(workingDir: string): Promise<string> {
  const fileName = `callout-${Date.now()}-${Math.random().toString(16).slice(2)}.lua`;
  const luaPath = path.join(workingDir, fileName);
  await fs.writeFile(luaPath, CALLOUT_LUA_FILTER, "utf8");
  return luaPath;
}

function parseDraftFlag(extraArgs: string): { extras: string[]; isDraft: boolean } {
  if (!extraArgs || !extraArgs.trim()) return { extras: [], isDraft: false };

  let isDraft = false;
  const extras = extraArgs
    .split(/\s+/)
    .filter((arg) => {
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
    return path.isAbsolute(configured) ? configured : path.join(vaultBasePath, configured);
  }
  return vaultBasePath;
}

export async function convertCurrentPage(
  ctx: PluginContext,
  deps: ConvertDeps,
  format: OutputFormat
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
  } catch (err) {
    new Notice(t("notice_output_dir_missing", [outputDir]));
    return;
  }

  const resourcePath = resolveResourcePath(activeProfile, vaultBasePath);

  const tempFileName = `${baseName.replace(/\s/g, "_")}.temp.md`;
  // lint 実行時の workingDir を元ノートと揃えるため、中間ファイルをソース側に置く
  const intermediateFilename = path.join(sourceDir, tempFileName);
  const headerFileName = `${baseName.replace(/\s/g, "_")}.preamble.tex`;
  const headerFilePath = path.join(outputDir, headerFileName);
  const mermaidTempDirs: string[] = [];

  const ext = format === "latex" ? ".tex" : `.${format}`;
  const outputFilename = path.join(outputDir, `${baseName.replace(/\s/g, "_")}${ext}`);

  const cache = new Map<string, string>();

  try {
    let content = await fs.readFile(inputFilePath, "utf8");

    // 実験的Mermaidを使わない場合は、Pandoc listings が unknown language を吐かないよう
    // フェンス言語を外してプレーンコードとして扱う
    if (!ctx.settings.enableExperimentalMermaid) {
      content = stripMermaidLanguage(content);
    }

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

    // ユーザー設定プリアンブルにコールアウト定義を付与し、listing名の上書きを加える
    const baseHeader = activeProfile.headerIncludes || "";
    const withCallout = baseHeader.includes("obsidiancallout")
      ? baseHeader
      : `${baseHeader.trim()}\n\n${CALLOUT_PREAMBLE}`.trim();
    const cleanedHeader = cleanLatexPreamble(withCallout);
    const headerWithListings = appendLabelOverrides(cleanedHeader, {
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

    content = await replaceWikiLinksRecursivelyAsync(content, ctx.app, activeProfile, activeFile.path, cache);

    if (format === "docx") {
      content = content
        .replace(/\\textbf\{([^}]+)\}/g, '**$1**')
        .replace(/\\textit\{([^}]+)\}/g, '*$1*')
        .replace(/\\footnote\{([^}]+)\}/g, '^[$1]')
        .replace(/\\centerline\{([^}]+)\}/g, '::: {custom-style="Center"}\n$1\n:::')
        .replace(/\\rightline\{([^}]+)\}/g, '::: {custom-style="Right"}\n$1\n:::')
        .replace(/\\vspace\{[^}]+\}/g, '\n\n')
        .replace(/\\kenten\{([^}]+)\}/g, '[$1]{custom-style="Kenten"}')
        .replace(/\\newpage/g, '```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```')
        .replace(/\\clearpage/g, '```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```')
        .replace(/\\noindent/g, '');
    }

    const lintEnabled = ctx.settings.enableMarkdownlintFix;

    if (lintEnabled) {
      await fs.writeFile(intermediateFilename, content, "utf8");
      try {
        await deps.runMarkdownlintFix(ctx, intermediateFilename);
      } catch (e: any) {
        console.error(e);
        new Notice(t("notice_markdownlint_failed_continue"));
      }

      const success = await runPandoc(
        ctx,
        activeProfile,
        intermediateFilename,
        outputFilename,
        format,
        headerFilePath,
        pandocExtraArgs,
        sourceDir,
        resourcePath
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
        resourcePath
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
  } catch (error: any) {
    new Notice(t("notice_error_generating", [error?.message || error]));
  } finally {
    for (const dir of mermaidTempDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
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

// Mermaidフェンスをプレーンコードフェンスに落とし込む（listingsの unknown language 回避用）
function stripMermaidLanguage(md: string): string {
  return md.replace(/```mermaid[^\n]*\n([\s\S]*?)```/g, "```\n$1```");
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
  resourcePathOverride?: string
): Promise<boolean> {
  const plan = await buildPandocExecutionPlan({
    profile: activeProfile,
    format,
    headerFilePath,
    outputFile,
    workingDir: workingDirOverride ?? path.dirname(inputFile),
    inputPath: inputFile,
    pandocExtraArgs,
    resourcePath: resourcePathOverride,
  });

  try {
    return await executePandocCommand(plan, ctx, outputFile);
  } finally {
    await cleanupTemporaryFiles(plan.tempFiles);
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
  resourcePathOverride?: string
): Promise<boolean> {
  const plan = await buildPandocExecutionPlan({
    profile: activeProfile,
    format,
    headerFilePath,
    outputFile,
    workingDir,
    pandocExtraArgs,
    useStdin: true,
    resourcePath: resourcePathOverride,
  });

  try {
    return await executePandocCommand(plan, ctx, outputFile, inputContent);
  } finally {
    await cleanupTemporaryFiles(plan.tempFiles);
  }
}

interface PandocExecutionPlan {
  command: PandocCommandResult;
  tempFiles: string[];
  workingDir: string;
}

function resolveDocxLuaFilter(profile: ProfileSettings, format: OutputFormat): string | null {
  if (format !== "docx") return null;
  if (!profile.enableAdvancedTexCommands) return null;
  const luaFilterPath = profile.luaFilterPath.trim();
  if (!luaFilterPath) return null;
  return fsSync.existsSync(luaFilterPath) ? luaFilterPath : null;
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
}): Promise<PandocExecutionPlan> {
  const tempFiles: string[] = [];
  const luaFilters: string[] = [];

  if (params.format === "pdf" || params.format === "latex") {
    const tempLuaPath = await createTempLuaFilter(params.workingDir);
    luaFilters.push(tempLuaPath);
    tempFiles.push(tempLuaPath);
  }

  const docxLua = resolveDocxLuaFilter(params.profile, params.format);
  if (docxLua) luaFilters.push(docxLua);

  const command = buildPandocCommand({
    profile: params.profile,
    format: params.format,
    inputPath: params.useStdin ? undefined : params.inputPath,
    outputPath: params.outputFile,
    headerPath: params.headerFilePath,
    workingDir: params.workingDir,
    extraArgs: params.pandocExtraArgs,
    luaFilters,
    resourcePath: (params.resourcePath ?? params.profile.searchDirectory.trim()) || params.workingDir,
    useStdin: params.useStdin,
  });

  return { command, tempFiles, workingDir: params.workingDir };
}

async function cleanupTemporaryFiles(files: string[]) {
  for (const file of files) {
    try {
      await fs.unlink(file);
    } catch (err) {
      console.warn(`Failed to delete temporary file: ${file}`, err);
    }
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
  inputContent?: string
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
  } catch (error: any) {
    new Notice(t("notice_pandoc_launch_error", [error?.message ?? error]));
    return false;
  }
}
