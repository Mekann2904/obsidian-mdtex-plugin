// File: src/services/convertService.ts
// Purpose: Markdown→各フォーマット変換の中核ロジックを担当するサービス。
// Reason: プラグイン本体から変換処理を切り離し、責務を明確化するため。
// Related: src/MdTexPlugin.ts, src/services/lintService.ts, src/utils/markdownTransforms.ts

import { Notice, MarkdownView, FileSystemAdapter } from "obsidian";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import { ProfileSettings } from "../MdTexPluginSettings";
import { replaceWikiLinksRecursively, unwrapValidWikiLinks } from "../utils/markdownTransforms";
import { cleanLatexPreamble, appendListingOverrides } from "../utils/latexPreamble";
import { CALLOUT_PREAMBLE } from "../utils/calloutTheme";
import { CALLOUT_LUA_FILTER } from "../assets/callout-filter";
import { expandTransclusions } from "../utils/transclusion";
import type { PluginContext } from "./lintService";

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

// 入力形式の指定を統一管理するヘルパー
function getInputFormatArgs(format: string): string[] {
  if (format === "docx") {
    return ["-f", "markdown+raw_html+fenced_divs+raw_attribute"];
  }
  return ["-f", "markdown"];
}

function addCommonPandocArgs(args: string[], activeProfile: ProfileSettings, format: string, inputDir: string) {
  if (format === "pdf") {
    args.push(`--pdf-engine=${activeProfile.latexEngine}`);
    if (activeProfile.documentClass === "beamer") args.push("-t", "beamer");
  } else if (format === "latex") {
    args.push("-t", "latex");
    if (activeProfile.documentClass === "beamer") args.push("-t", "beamer");
  } else if (format === "docx") {
    args.push("-t", "docx");
    if (activeProfile.enableAdvancedTexCommands) {
      const luaFilterPath = activeProfile.luaFilterPath.trim();
      if (luaFilterPath && fsSync.existsSync(luaFilterPath)) {
        args.push("--lua-filter", luaFilterPath);
      }
    }
  }
  args.push("--listings");

  const resourcePath = activeProfile.searchDirectory.trim()
    ? activeProfile.searchDirectory.trim()
    : inputDir;
  args.push("--resource-path", resourcePath);

  if (activeProfile.usePandocCrossref) {
    const crossrefFilter = activeProfile.pandocCrossrefPath.trim() || "pandoc-crossref";
    args.push("-F", crossrefFilter);
  }

  args.push("-M", `figureTitle=${activeProfile.figureLabel}`);
  args.push("-M", `figPrefix=${activeProfile.figPrefix}`);
  args.push("-M", `tableTitle=${activeProfile.tableLabel}`);
  args.push("-M", `tblPrefix=${activeProfile.tblPrefix}`);
  args.push("-M", `listingTitle=${activeProfile.codeLabel}`);
  args.push("-M", `listing-title=${activeProfile.codeLabel}`);
  args.push("-M", `lstPrefix=${activeProfile.lstPrefix}`);
  args.push("-M", `eqnPrefix=${activeProfile.eqnPrefix}`);

  if (activeProfile.useMarginSize) args.push("-V", `geometry:margin=${activeProfile.marginSize}`);
  if (!activeProfile.usePageNumber) args.push("-V", "pagestyle=empty");

  args.push("-V", `fontsize=${activeProfile.fontSize}`);
  args.push("-V", `documentclass=${activeProfile.documentClass}`);
  if (activeProfile.documentClassOptions?.trim()) args.push("-V", `classoption=${activeProfile.documentClassOptions}`);

  args.push("--highlight-style=tango");

  if (activeProfile.pandocExtraArgs.trim()) {
    const extras = activeProfile.pandocExtraArgs.split(/\s+/);
    const filtered = extras.filter((arg) => {
      if (format !== "docx" && arg.startsWith("--reference-doc")) return false;
      return true;
    });
    args.push(...filtered);
  }
  if (activeProfile.useStandalone) args.push("--standalone");
}

export async function convertCurrentPage(
  ctx: PluginContext,
  deps: ConvertDeps,
  format: string
) {
  const startedAt = Date.now();

  const activeFile = ctx.app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice("No active file selected.");
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
    new Notice("The active file is not a Markdown file.");
    return;
  }

  new Notice(`Converting to ${format.toUpperCase()}...`);

  const activeProfile = ctx.getActiveProfileSettings();
  const fileAdapter = ctx.app.vault.adapter as FileSystemAdapter;
  const inputFilePath = fileAdapter.getFullPath(activeFile.path);
  const baseName = path.basename(inputFilePath, ".md");

  const outputDir = activeProfile.outputDirectory || fileAdapter.getBasePath();
  try {
    await fs.access(outputDir);
  } catch (err) {
    new Notice(`Output directory does not exist: ${outputDir}`);
    return;
  }

  const tempFileName = `${baseName.replace(/\s/g, "_")}.temp.md`;
  const intermediateFilename = path.join(outputDir, tempFileName);
  const headerFileName = `${baseName.replace(/\s/g, "_")}.preamble.tex`;
  const headerFilePath = path.join(outputDir, headerFileName);

  const ext = format === "latex" ? ".tex" : `.${format}`;
  const outputFilename = path.join(outputDir, `${baseName.replace(/\s/g, "_")}${ext}`);

  try {
    let content = await fs.readFile(inputFilePath, "utf8");

    // トランスクルージョン (![[...]]) を先に展開
    content = await expandTransclusions(content, ctx.app, activeFile.path);

    // ユーザー設定プリアンブルにコールアウト定義を付与し、listing名の上書きを加える
    const baseHeader = activeProfile.headerIncludes || "";
    const withCallout = baseHeader.includes("obsidiancallout")
      ? baseHeader
      : `${baseHeader.trim()}\n\n${CALLOUT_PREAMBLE}`.trim();
    const cleanedHeader = cleanLatexPreamble(withCallout);
    const headerWithListings = appendListingOverrides(cleanedHeader, activeProfile.codeLabel, activeProfile.lstPrefix);
    // LaTeX生ファイルとして include-in-header で渡す（Markdown経由のエスケープを防ぐ）
    await fs.writeFile(headerFilePath, `${headerWithListings}\n`, "utf8");

    // 有効な WikiLink のみ [[ ]] を外してテキストにする
    content = unwrapValidWikiLinks(content, ctx.app, activeFile.path);

    content = replaceWikiLinksRecursively(content, ctx.app, activeProfile, activeFile.path);

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
        new Notice("markdownlint-cli2実行に失敗。処理を継続。");
      }

      const success = await runPandoc(ctx, activeProfile, intermediateFilename, outputFilename, format, headerFilePath);

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
        headerFilePath
      );

      if (success && activeProfile.deleteIntermediateFiles) {
        try {
          await fs.unlink(headerFilePath);
        } catch (err) {
          console.warn(`Failed to delete header file: ${headerFilePath}`, err);
        }
      }

      if (!success) {
        new Notice("Pandoc failed when using stdin pathway.");
      }
    }
  } catch (error: any) {
    new Notice(`Error generating output: ${error?.message || error}`);
  } finally {
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
  format: string,
  headerFilePath: string
): Promise<boolean> {
  const pandocPath = activeProfile.pandocPath.trim() || "pandoc";
  const inputFormat = getInputFormatArgs(format);
  const args = [inputFile, ...inputFormat, "--include-in-header", headerFilePath, "-o", outputFile];
  const cwd = path.dirname(inputFile);

  let tempLuaPath: string | null = null;
  try {
    if (format === "pdf" || format === "latex") {
      tempLuaPath = await createTempLuaFilter(cwd);
      args.push("--lua-filter", tempLuaPath);
    }

    addCommonPandocArgs(args, activeProfile, format, cwd);

    if (!ctx.settings.suppressDeveloperLogs) {
      console.log("Running pandoc with args:", args);
    }

    const success = await new Promise<boolean>((resolve) => {
      const pandocProcess = spawn(pandocPath, args, {
        stdio: "pipe",
        shell: false,
        cwd,
        env: { ...process.env, PATH: process.env.PATH ?? "" },
      });

      handlePandocProcess(pandocProcess, outputFile, ctx, resolve);
    });

    return success;
  } catch (error: any) {
    new Notice(`Error launching Pandoc: ${error?.message ?? error}`);
    return false;
  } finally {
    if (tempLuaPath) {
      try { await fs.unlink(tempLuaPath); } catch {}
    }
  }
}

async function runPandocWithStdin(
  ctx: PluginContext,
  activeProfile: ProfileSettings,
  inputContent: string,
  outputFile: string,
  format: string,
  workingDir: string,
  headerFilePath: string
): Promise<boolean> {
  const pandocPath = activeProfile.pandocPath.trim() || "pandoc";
  const inputFormat = getInputFormatArgs(format);
  const args = [...inputFormat, "--include-in-header", headerFilePath, "-o", outputFile];

  let tempLuaPath: string | null = null;
  try {
    if (format === "pdf" || format === "latex") {
      tempLuaPath = await createTempLuaFilter(workingDir);
      args.push("--lua-filter", tempLuaPath);
    }

    addCommonPandocArgs(args, activeProfile, format, workingDir);

    if (!ctx.settings.suppressDeveloperLogs) {
      console.log("Running pandoc (stdin) with args:", args);
    }

    const success = await new Promise<boolean>((resolve) => {
      const pandocProcess = spawn(pandocPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        cwd: workingDir,
        env: { ...process.env, PATH: process.env.PATH ?? "" },
      });

      pandocProcess.stdin?.write(inputContent);
      pandocProcess.stdin?.end();

      handlePandocProcess(pandocProcess, outputFile, ctx, resolve);
    });

    return success;
  } catch (error: any) {
    new Notice(`Error launching Pandoc: ${error?.message ?? error}`);
    return false;
  } finally {
    if (tempLuaPath) {
      try { await fs.unlink(tempLuaPath); } catch {}
    }
  }
}

function handlePandocProcess(
  proc: ChildProcess,
  outputFile: string,
  ctx: PluginContext,
  resolve: (value: boolean) => void
) {
  proc.stderr?.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) {
      console.warn(`Pandoc stderr: ${msg}`);
      new Notice(`Pandoc: ${msg.substring(0, 100)}...`);
    }
  });

  proc.stdout?.on("data", (data) => {
    if (!ctx.settings.suppressDeveloperLogs) {
      console.log(`Pandoc Output: ${data.toString()}`);
    }
  });

  proc.on("close", (code) => {
    if (code === 0) {
      new Notice(`Successfully generated: ${path.basename(outputFile)}`);
      resolve(true);
    } else {
      new Notice(`Error: Pandoc process exited with code ${code}`);
      resolve(false);
    }
  });

  proc.on("error", (err) => {
    new Notice(`Error launching Pandoc: ${err.message}`);
    resolve(false);
  });
}
