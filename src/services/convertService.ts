// File: src/services/convertService.ts
// Purpose: Markdown→各フォーマット変換の中核ロジックを担当するサービス。
// Reason: プラグイン本体から変換処理を切り離し、責務を明確化するため。
// Related: src/MdTexPlugin.ts, src/services/lintService.ts, src/utils/markdownTransforms.ts

import { Notice, MarkdownView, FileSystemAdapter } from "obsidian";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import { PandocPluginSettings, ProfileSettings } from "../MdTexPluginSettings";
import { replaceWikiLinksAndCode } from "../utils/markdownTransforms";
import type { PluginContext } from "./lintService";

const escapeForLatexCommand = (text: string) =>
  text
    .replace(/\\/g, "\\textbackslash{}").replace(/\{/g, "\\{").replace(/\}/g, "\\}")
    .replace(/\^/g, "\\^").replace(/\~/g, "\\~{}")
    .replace(/#/g, "\\#").replace(/%/g, "\\%")
    .replace(/&/g, "\\&").replace(/\$/g, "\\$");

function appendListingNamesToHeader(header: string, profile: ProfileSettings): string {
  // Babel/Polyglossia が \begin{document} で上書きするため、遅延適用する
  const nameCmd = `  - |\n    \\AtBeginDocument{\\renewcommand{\\lstlistingname}{${escapeForLatexCommand(profile.codeLabel)}}}`;
  const listCmd = `  - |\n    \\AtBeginDocument{\\renewcommand{\\lstlistlistingname}{${escapeForLatexCommand(profile.lstPrefix)}}}`;

  if (header.includes("header-includes")) {
    const closing = header.lastIndexOf("\n---");
    if (closing !== -1) {
      const before = header.slice(0, closing);
      const after = header.slice(closing); // includes closing ---
      return `${before}\n${nameCmd}\n${listCmd}${after}`;
    }
    return `${header}\nheader-includes:\n${nameCmd}\n${listCmd}`;
  }
  // 万一 header-includes ブロックが無い場合は新規で作成
  return `---\nheader-includes:\n${nameCmd}\n${listCmd}\n---\n\n${header}`;
}

export interface ConvertDeps {
  runMarkdownlintFix: (ctx: PluginContext, targetPath: string) => Promise<void>;
}

export async function convertCurrentPage(
  ctx: PluginContext,
  deps: ConvertDeps,
  format: string
) {
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

  const ext = format === "latex" ? ".tex" : `.${format}`;
  const outputFilename = path.join(outputDir, `${baseName.replace(/\s/g, "_")}${ext}`);

  try {
    let content = await fs.readFile(inputFilePath, "utf8");

    // headerIncludes が空でも listings のラベル設定を YAML で必ず注入する
    const headerStr = activeProfile.headerIncludes || "";
    const headerWithListingNames = appendListingNamesToHeader(headerStr, activeProfile);
    // 複数 YAML ブロックは pandoc がマージするため単純結合でよい
    content = headerWithListingNames + "\n" + content;

    content = replaceWikiLinksAndCode(content, ctx.app, activeProfile);

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

    await fs.writeFile(intermediateFilename, content, "utf8");

    if (ctx.settings.enableMarkdownlintFix) {
      try {
        await deps.runMarkdownlintFix(ctx, intermediateFilename);
      } catch (e: any) {
        console.error(e);
        new Notice("markdownlint-cli2実行に失敗。処理を継続。");
      }
    }

    const success = await runPandoc(ctx, activeProfile, intermediateFilename, outputFilename, format);

    if (success && activeProfile.deleteIntermediateFiles) {
      try {
        await fs.unlink(intermediateFilename);
      } catch (err) {
        console.warn(`Failed to delete intermediate file: ${intermediateFilename}`, err);
      }
    }
  } catch (error: any) {
    new Notice(`Error generating output: ${error?.message || error}`);
  }
}

async function runPandoc(
  ctx: PluginContext,
  activeProfile: ProfileSettings,
  inputFile: string,
  outputFile: string,
  format: string
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const pandocPath = activeProfile.pandocPath.trim() || "pandoc";
    const command = `"${pandocPath}"`;

    const args = [`"${inputFile}"`, "-o", `"${outputFile}"`];

    if (format === "pdf") {
      args.push(`--pdf-engine=${activeProfile.latexEngine}`);
      if (activeProfile.documentClass === "beamer") args.push("-t", "beamer");
    } else if (format === "latex") {
      args.push("-t", "latex");
      if (activeProfile.documentClass === "beamer") args.push("-t", "beamer");
    } else if (format === "docx") {
      args.push("-f", "markdown+raw_html+fenced_divs+raw_attribute");
      args.push("-t", "docx");
      if (activeProfile.enableAdvancedTexCommands) {
        const luaFilterPath = activeProfile.luaFilterPath.trim();
        if (luaFilterPath && fsSync.existsSync(luaFilterPath)) {
          args.push("--lua-filter", luaFilterPath);
        }
      }
    }
    args.push("--listings");

    if (activeProfile.usePandocCrossref) {
      const crossrefFilter = activeProfile.pandocCrossrefPath.trim() || "pandoc-crossref";
      args.push("-F", `"${crossrefFilter}"`);
    }

    args.push("-M", `figureTitle=${activeProfile.figureLabel}`);
    args.push("-M", `figPrefix=${activeProfile.figPrefix}`);
    args.push("-M", `tableTitle=${activeProfile.tableLabel}`);
    args.push("-M", `tblPrefix=${activeProfile.tblPrefix}`);
    // listingsパッケージの見出し: pandocテンプレートは hyphen 形式を期待することがある
    // listings見出し（pandocテンプレートは listing-title を参照）。
    args.push("-M", `listingTitle=${activeProfile.codeLabel}`);
    args.push("-M", `listing-title=${activeProfile.codeLabel}`);
    // pandoc-crossref プレフィックス
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
        // docx専用オプションをPDF/LaTeXでは除外
        if (format !== "docx" && arg.startsWith("--reference-doc")) return false;
        return true;
      });
      args.push(...filtered);
    }
    if (activeProfile.useStandalone) args.push("--standalone");

    if (!ctx.settings.suppressDeveloperLogs) {
      console.log("Running pandoc with args:", args);
    }

    const pandocProcess = spawn(command, args, { stdio: "pipe", shell: true, env: { ...process.env, PATH: process.env.PATH ?? "" } });

    pandocProcess.stderr?.on("data", (data) => {
      const msg = data.toString().trim();
      new Notice(`Pandoc error: ${msg}`);
      console.error(`Pandoc error: ${msg}`);
    });
    pandocProcess.stdout?.on("data", (data) => {
      if (!ctx.settings.suppressDeveloperLogs) {
        console.log(`Pandoc output: ${data.toString()}`);
      }
    });
    pandocProcess.on("close", (code) => {
      if (code === 0) {
        new Notice(`Successfully generated: ${outputFile}`);
        resolve(true);
      } else {
        new Notice(`Error: Pandoc process exited with code ${code}`);
        resolve(false);
      }
    });
    pandocProcess.on("error", (err) => {
      new Notice(`Error launching Pandoc: ${err.message}`);
      resolve(false);
    });
  });
}
