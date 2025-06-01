// MdTexPlugin.ts

import { App, Plugin, Notice, MarkdownView, FileSystemAdapter } from "obsidian";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";

import { PandocPluginSettings, ProfileSettings, DEFAULT_SETTINGS, DEFAULT_PROFILE } from "./MdTexPluginSettings";
import { PandocPluginSettingTab } from "./MdTexPluginSettingTab";

// ※ ここでは、replaceMermaidDiagrams 関数が返り値として
// { content: string, generatedPdfs: string[] } を返すことを想定しています。
import { replaceMermaidDiagrams } from "./Mermaid-PDF";

/**
 * メインプラグインクラス
 */
export default class PandocPlugin extends Plugin {
  settings: PandocPluginSettings;

  /**
   * 現在アクティブなプロファイルの設定を取得するヘルパーメソッド
   */
  getActiveProfileSettings(): ProfileSettings {
    const activeProfileName = this.settings.activeProfile;
    return this.settings.profiles[activeProfileName];
  }

  async onload() {
    console.log("PandocPlugin loaded!");
    await this.loadSettings();
    this.addSettingTab(new PandocPluginSettingTab(this.app, this));

    this.addRibbonIcon("file-text", "Convert to PDF using active profile", async () => {
      const format = this.getActiveProfileSettings().outputFormat;
      await this.convertCurrentPage(format);
    });

    this.addCommand({
      id: "pandoc-plugin-convert-pdf",
      name: "Convert current file to PDF",
      callback: () => this.convertCurrentPage("pdf"),
    });

    this.addCommand({
      id: "pandoc-plugin-convert-latex",
      name: "Convert current file to LaTeX",
      callback: () => this.convertCurrentPage("latex"),
    });

    this.registerEditorSuggest(new MyLabelEditorSuggest(this.app));
    this.loadExternalStylesheet();
    this.registerEditorSuggest(new MyLabelSuggest(this.app));
    console.log("MdTexPlugin: onload finished.");
  }

  async convertCurrentPage(format: string) {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active file selected.");
      return;
    }

    const leaf = this.app.workspace.activeLeaf;
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

    // mermaidCliPath が設定されている場合、念のため PATH に追加
    if (this.settings.mermaidCliPath && typeof this.settings.mermaidCliPath === "string") {
      const mermaidDir = path.dirname(this.settings.mermaidCliPath);
      const currentPath = process.env.PATH ?? "";
      if (!currentPath.includes(mermaidDir)) {
        process.env.PATH = mermaidDir + ":" + currentPath;
        console.log("Updated PATH to include mermaidCliPath directory:", mermaidDir);
      }
    }

    new Notice(`Converting to ${format.toUpperCase()}...`);

    const activeProfile = this.getActiveProfileSettings();
    const fileAdapter = this.app.vault.adapter as FileSystemAdapter;
    const fallbackBasePath = fileAdapter.getBasePath();
    const outputDir = this.settings.outputDirectory?.trim() || fallbackBasePath;

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
      if (activeProfile.headerIncludes) {
        content = activeProfile.headerIncludes + "\n" + content;
      }
      content = this.replaceWikiLinksAndCode(content);
      await fs.writeFile(intermediateFilename, content, "utf8");

      const success = await this.runPandoc(intermediateFilename, outputFilename, format);

      if (success && activeProfile.deleteIntermediateFiles) {
        try {
          await fs.unlink(intermediateFilename);
        } catch (err) {
          console.warn(`Failed to delete intermediate file: ${intermediateFilename}`, err);
        }
        for (const pdf of this.convertedSvgPdfs) {
          try {
            await fs.unlink(pdf);
            console.log(`Converted SVG PDF deleted: ${pdf}`);
          } catch (err) {
            console.warn(`Failed to delete converted SVG PDF: ${pdf}`, err);
          }
        }
        for (const pdf of this.convertedMermaidPdfs) {
          try {
            await fs.unlink(pdf);
            console.log(`Converted Mermaid PDF deleted: ${pdf}`);
          } catch (err) {
            console.warn(`Failed to delete converted Mermaid PDF: ${pdf}`, err);
          }
        }
        this.convertedSvgPdfs = [];
        this.convertedMermaidPdfs = [];
      }
    } catch (error: any) {
      new Notice(`Error generating output: ${error?.message || error}`);
    }
  }

  private escapeSpecialCharacters(code: string): string {
    return code
      .replace(/\\/g, "\\textbackslash{}")
      .replace(/\$/g, "\\$").replace(/%/g, "\\%").replace(/#/g, "\\#")
      .replace(/_/g, "\\_").replace(/{/g, "\\{").replace(/}/g, "\\}")
      .replace(/\^/g, "\\^{}").replace(/~/g, "\\textasciitilde")
      .replace(/&/g, "\\&");
  }

  replaceWikiLinksAndCode(markdown: string): string {
    const activeProfile = this.getActiveProfileSettings();
    return markdown.replace(
      /!\[\[([^\]]+)\]\](?:\{#([^}]+)\})?(?:\[(.*?)\])?|```(\w+)(?:\s*\{([^}]*)\})?\n([\s\S]*?)```/g,
      (match, imageLink, imageLabel, imageCaption, codeLang, codeAttrs, codeBody) => {
        if (imageLink) {
          const searchDir = activeProfile.searchDirectory || (this.app.vault.adapter as FileSystemAdapter).getBasePath();
          const foundPath = this.findFileSync(imageLink, searchDir);
          if (!foundPath) return match;
          
          const resolvedPath = path.resolve(foundPath);
          let labelPart = imageLabel ? `#${imageLabel.startsWith("fig:") ? "" : "fig:"}${imageLabel}` : "";
          let captionPart = imageCaption || " ";
          const scalePart = activeProfile.imageScale ? ` ${activeProfile.imageScale}` : "";

          return `![${captionPart}](${resolvedPath}){${labelPart}${scalePart}}`;
        }

        if (codeBody) {
          const escapedCode = this.escapeSpecialCharacters(codeBody);
          const resolvedLang = codeLang || "zsh";
          let labelOption = "", captionOption = "";
          if (codeAttrs) {
            const labelMatch = codeAttrs.match(/#lst:([\w-]+)/);
            if (labelMatch) labelOption = `,label={lst:${labelMatch[1]}}`;
            const captionMatch = codeAttrs.match(/caption\s*=\s*"(.*?)"/);
            if (captionMatch) captionOption = `,caption={${this.escapeSpecialCharacters(captionMatch[1])}}`;
          }
          return `\\begin{lstlisting}[language=${resolvedLang}${labelOption}${captionOption}]\n${escapedCode}\n\\end{lstlisting}`;
        }
        return match;
      }
    );
  }

  async runPandoc(inputFile: string, outputFile: string, format: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const activeProfile = this.getActiveProfileSettings();
      const pandocPath = activeProfile.pandocPath.trim() || "pandoc";
      const command = `"${pandocPath}"`;
      const args = [`"${inputFile}"`, "-o", `"${outputFile}"`];
      if (format === "pdf") {
        args.push(`--pdf-engine=${activeProfile.latexEngine}`);
        if (activeProfile.documentClass === "beamer") args.push("-t", "beamer");
      } else if (format === "latex") {
        args.push("-t", "latex");
        if (activeProfile.documentClass === "beamer") args.push("-t", "beamer");
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
      args.push("-M", `listingTitle=${activeProfile.codeLabel}`);
      args.push("-M", `lstPrefix=${activeProfile.lstPrefix}`);
      args.push("-M", `eqnPrefix=${activeProfile.eqnPrefix}`);

      if (activeProfile.useMarginSize) args.push("-V", `geometry:margin=${activeProfile.marginSize}`);
      if (!activeProfile.usePageNumber) args.push("-V", "pagestyle=empty");
      
      args.push("-V", `fontsize=${activeProfile.fontSize}`);
      args.push("-V", `documentclass=${activeProfile.documentClass}`);
      if (activeProfile.documentClassOptions?.trim()) args.push("-V", `classoption=${activeProfile.documentClassOptions}`);
      
      args.push("--highlight-style=tango");

      if (activeProfile.pandocExtraArgs.trim()) args.push(...activeProfile.pandocExtraArgs.split(/\s+/));
      if (activeProfile.useStandalone) args.push("--standalone");

      console.log("Running pandoc with args:", args);

      const pandocProcess = spawn(command, args, { stdio: "pipe", shell: true, env: { ...process.env, PATH: process.env.PATH ?? "" } });

      pandocProcess.stderr?.on("data", (data) => new Notice(`Pandoc error: ${data.toString().trim()}`));
      pandocProcess.stdout?.on("data", (data) => console.log(`Pandoc output: ${data.toString()}`));
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

  findFileSync(filename: string, searchDirectory: string): string | null {
    try {
      const entries = fsSync.readdirSync(searchDirectory, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(searchDirectory, entry.name);
        if (entry.isDirectory()) {
          const result = this.findFileSync(filename, fullPath);
          if (result) return result;
        } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
          return fullPath;
        }
      }
    } catch (err) {
      // console.error(`Error reading directory: ${searchDirectory}`, err);
    }
    return null;
  }

  async loadSettings() {
    let loadedData = await this.loadData();
    // 旧バージョンからの移行処理
    if (loadedData && !loadedData.profiles) {
      console.log("Migrating settings to new profile format.");
      const oldSettings = loadedData;
      loadedData = {
          profiles: { 'Default': { ...DEFAULT_PROFILE, ...oldSettings } },
          activeProfile: 'Default'
      };
    }
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private loadExternalStylesheet() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = "styles.css";
    document.head.appendChild(link);
  }
}