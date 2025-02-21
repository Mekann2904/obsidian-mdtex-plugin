// MdTexPlugin.ts

import { App, Plugin, Notice, MarkdownView } from "obsidian";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { FileSystemAdapter } from "obsidian";

import { PandocPluginSettings, DEFAULT_SETTINGS } from "./MdTexPluginSettings";
import { PandocPluginSettingTab } from "./MdTexPluginSettingTab";

import { MyLabelEditorSuggest, MyLabelSuggest } from "./AutoComplete";

// ※ ここでは、replaceMermaidDiagrams 関数が返り値として
// { content: string, generatedPdfs: string[] } を返すことを想定しています。
import { replaceMermaidDiagrams } from "./Mermaid-PDF";

/**
 * メインプラグインクラス
 */
export default class PandocPlugin extends Plugin {
  settings: PandocPluginSettings;
  // 変換後のPDF（またはSVG）ファイルのパスを記録
  convertedSvgPdfs: string[] = [];
  // 追加: Mermaidで生成されたPDFのパスを記録
  convertedMermaidPdfs: string[] = [];

  async onload() {
    console.log("PandocPlugin loaded!");

    // 設定をロード
    await this.loadSettings();

    // 設定画面タブを追加
    this.addSettingTab(new PandocPluginSettingTab(this.app, this));

    // リボンアイコン（PDF変換）
    this.addRibbonIcon("file-text", "Convert to PDF", async () => {
      await this.convertCurrentPage(this.settings.outputFormat);
    });

    // PDF変換コマンド
    this.addCommand({
      id: "pandoc-plugin-convert-pdf",
      name: "Convert current file to PDF",
      callback: () => this.convertCurrentPage("pdf"),
    });

    // LaTeX変換コマンド
    this.addCommand({
      id: "pandoc-plugin-convert-latex",
      name: "Convert current file to LaTeX",
      callback: () => this.convertCurrentPage("latex"),
    });

    // ★ EditorSuggest を使ったオートコンプリートを登録
    console.log("[PandocPlugin] Registering AutoComplete (EditorSuggest)...");
    this.registerEditorSuggest(new MyLabelEditorSuggest(this.app));
    console.log("EditorSuggest: onload finished.");

    this.registerEditorSuggest(new MyLabelSuggest(this.app));
    console.log("MyLabelSuggest: onload finished.");
  }

  async convertCurrentPage(format: string) {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active file selected.");
      return;
    }

    // 直前の編集を保存
    const leaf = this.app.workspace.activeLeaf;
    if (leaf && leaf.view instanceof MarkdownView) {
      const markdownView = leaf.view as MarkdownView;
      if (markdownView.file && markdownView.file.path === activeFile.path) {
        await markdownView.save();
      }
    }

    // Markdown以外は対象外
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

    const fileAdapter = this.app.vault.adapter as FileSystemAdapter;
    const fallbackBasePath = fileAdapter.getBasePath();
    const outputDir = this.settings.outputDirectory?.trim() || fallbackBasePath;

    try {
      await fs.access(outputDir);
    } catch (err) {
      new Notice(`Output directory does not exist: ${outputDir}`);
      console.error(`Output directory does not exist: ${outputDir}`, err);
      return;
    }

    const inputFilePath = fileAdapter.getFullPath(activeFile.path);
    const baseName = path.basename(inputFilePath, ".md");

    const tempFileName = `${baseName.replace(/\s/g, "_")}.temp.md`;
    const intermediateFilename = path.join(outputDir, tempFileName);

    const ext = format === "latex" ? ".tex" : `.${format}`;
    const outputFilename = path.join(
      outputDir,
      `${baseName.replace(/\s/g, "_")}${ext}`
    );

    try {
      // (1) Markdown読み込み
      let content = await fs.readFile(inputFilePath, "utf8");

      // (2) ヘッダ挿入
      if (this.settings.headerIncludes) {
        content = this.settings.headerIncludes + "\n" + content;
      }

      // (2.5) MermaidブロックをPDFに変換（--pdfFit）
      // ※ replaceMermaidDiagrams を修正して、返り値に generatedPdfs を含めるようにしてください。
      const mermaidResult = await replaceMermaidDiagrams(content, outputDir, this.settings.mermaidCliPath);
      content = mermaidResult.content;
      this.convertedMermaidPdfs = mermaidResult.generatedPdfs || [];

      // (3) Wikiリンク→標準リンク、コードブロック置換
      content = this.replaceWikiLinksAndCode(content);

      // (3.5) SVG画像をInkscapeでベクターPDFに変換
      content = await this.processSvgImagesWithInkscape(content, outputDir);

      // (4) 中間ファイル書き込み
      await fs.writeFile(intermediateFilename, content, "utf8");

      // (5) Pandoc実行
      const success = await this.runPandoc(
        intermediateFilename,
        outputFilename,
        format
      );

      // (6) 不要ファイルを削除
      if (success && this.settings.deleteIntermediateFiles) {
        try {
          await fs.unlink(intermediateFilename);
          console.log(`Intermediate file deleted: ${intermediateFilename}`);
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
      console.error("Error generating output:", error?.message || error);
      new Notice(`Error generating output: ${error?.message || error}`);
    }
  }

  private escapeSpecialCharacters(code: string): string {
    return code
      .replace(/\\/g, "\\textbackslash{}")
      .replace(/\$/g, "\\$")
      .replace(/%/g, "\\%")
      .replace(/#/g, "\\#")
      .replace(/_/g, "\\_")
      .replace(/{/g, "\\{")
      .replace(/}/g, "\\}")
      .replace(/\^/g, "\\^{}")
      .replace(/~/g, "\\textasciitilde")
      .replace(/&/g, "\\&");
  }

  replaceWikiLinksAndCode(markdown: string): string {
    return markdown.replace(
      /!\[\[([^\]]+)\]\](?:\{#([^}]+)\})?(?:\[(.*?)\])?|```(\w+)(?:\s*\{([^}]*)\})?\n([\s\S]*?)```/g,
      (
        match: string,
        imageLink: string,
        imageLabel: string,
        imageCaption: string,
        codeLang: string,
        codeAttrs: string,
        codeBody: string
      ) => {
        // 画像リンク
        if (imageLink) {
          const foundPath = this.findFileSync(
            imageLink,
            this.settings.searchDirectory
          );
          if (!foundPath) {
            return match;
          }
          const resolvedPath = path.resolve(foundPath);
          let labelPart = "";
          let captionPart = imageCaption || "";
          if (imageLabel) {
            if (!imageLabel.startsWith("fig:")) {
              imageLabel = "fig:" + imageLabel;
            }
            labelPart = `#${imageLabel}`;
            if (!captionPart.trim()) {
              captionPart = " ";
            }
          }
          const scalePart = this.settings.imageScale
            ? ` ${this.settings.imageScale}`
            : "";
          return `![${captionPart}](${resolvedPath}){${labelPart}${scalePart}}`;
        }

        // コードブロック
        if (codeBody) {
          if (codeLang && codeLang.toLowerCase() === "mermaid") {
            // Mermaid は PDF に変換済み
            return "";
          }
          const escapedCode = this.escapeSpecialCharacters(codeBody);
          const resolvedLang = codeLang || "zsh";
          let labelOption = "";
          let captionOption = "";
          if (codeAttrs) {
            const labelMatch = codeAttrs.match(/#lst:([\w-]+)/);
            if (labelMatch) {
              labelOption = `,label={lst:${labelMatch[1]}}`;
            }
            const captionMatch = codeAttrs.match(/caption\s*=\s*"(.*?)"/);
            if (captionMatch) {
              const c = this.escapeSpecialCharacters(captionMatch[1]);
              captionOption = `,caption={${c}}`;
            }
          }
          return `\\begin{lstlisting}[language=${resolvedLang}${labelOption}${captionOption}]\n${escapedCode}\n\\end{lstlisting}`;
        }

        return match;
      }
    );
  }

  async processSvgImagesWithInkscape(
    markdown: string,
    outputDir: string
  ): Promise<string> {
    const regex = /!\[([^\]]*)\]\(([^)]+\.svg)\)(\{[^}]+\})?/gi;
    let match: RegExpExecArray | null;
    let newMarkdown = markdown;
    while ((match = regex.exec(markdown)) !== null) {
      const altText = match[1];
      const svgPath = match[2];
      const attributes = match[3] || "";
      try {
        const pdfPath = await this.convertSvgToPdfWithInkscape(svgPath, outputDir);
        this.convertedSvgPdfs.push(pdfPath);
        const newImageMarkdown = `![${altText}](${pdfPath})${attributes}`;
        newMarkdown = newMarkdown.replace(match[0], newImageMarkdown);
      } catch (err) {
        console.error("Error converting SVG with Inkscape:", err);
        newMarkdown = newMarkdown.replace(match[0], "");
        new Notice(`Failed to convert SVG ${svgPath}; link removed.`);
      }
    }
    return newMarkdown;
  }

  async convertSvgToPdfWithInkscape(
    inputSvg: string,
    outputDir: string
  ): Promise<string> {
    const absInputSvg = path.resolve(inputSvg);
    const dirToUse = outputDir.trim() || path.dirname(absInputSvg);
    const baseName = path.basename(absInputSvg, path.extname(absInputSvg));
    const outputPdf = path.join(dirToUse, baseName + ".pdf");

    return new Promise<string>((resolve, reject) => {
      const inkscapePathSetting = this.settings.inkscapePath?.trim();
      if (!inkscapePathSetting) {
        console.log("Inkscape path is empty. Skipping conversion for:", inputSvg);
        resolve(inputSvg);
        return;
      }
      const args = [absInputSvg, "--export-type=pdf", "--export-filename", outputPdf];
      console.log("Running Inkscape with args:", args);

      const proc = spawn(inkscapePathSetting, args, {
        shell: false,
        env: process.env,
      });

      proc.on("error", (err) => {
        console.error("Error running Inkscape:", err);
        reject(err);
      });
      proc.stderr.on("data", (data) => {
        console.error("Inkscape stderr:", data.toString());
      });
      proc.on("close", (code) => {
        if (code === 0) {
          console.log("Inkscape conversion successful:", outputPdf);
          resolve(outputPdf);
        } else {
          reject(new Error("Inkscape process exited with code " + code));
        }
      });
    });
  }

  async runPandoc(
    inputFile: string,
    outputFile: string,
    format: string
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const pandocPath = this.settings.pandocPath.trim() || "pandoc";
      const command = `"${pandocPath}"`;
      const args = [`"${inputFile}"`, "-o", `"${outputFile}"`];
      if (format === "pdf") {
        args.push(`--pdf-engine=${this.settings.latexEngine}`);
      } else if (format === "latex") {
        args.push("-t", "latex");
      }
      args.push("--listings");
      const crossrefFilter = this.settings.pandocCrossrefPath.trim() || "pandoc-crossref";
      args.push("-F", `"${crossrefFilter}"`);
      args.push("-M", "listings=true");
      args.push("-M", `figureTitle=${this.settings.figureLabel}`);
      args.push("-M", `figPrefix=${this.settings.figPrefix}`);
      args.push("-M", `tableTitle=${this.settings.tableLabel}`);
      args.push("-M", `tblPrefix=${this.settings.tblPrefix}`);
      args.push("-M", `listingTitle=${this.settings.codeLabel}`);
      args.push("-M", `lstPrefix=${this.settings.lstPrefix}`);
      args.push("-M", `eqnPrefix=${this.settings.eqnPrefix}`);
      args.push("-V", `geometry:margin=${this.settings.marginSize}`);
      if (!this.settings.usePageNumber) {
        args.push("-V", "pagestyle=empty");
      }
      args.push("-V", `fontsize=${this.settings.fontSize}`);
      args.push("-V", `documentclass=${this.settings.documentClass}`);
      args.push("--highlight-style=tango");
      if (this.settings.pandocExtraArgs.trim() !== "") {
        const extra = this.settings.pandocExtraArgs.split(/\s+/);
        args.push(...extra);
      }

      console.log("Running pandoc with args:", args);

      const pandocProcess = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        env: { ...process.env, PATH: process.env.PATH ?? "" },
      });

      pandocProcess.stderr?.on("data", (data) => {
        const errorMessage = data.toString().trim();
        console.error(`Pandoc error: ${errorMessage}`);
        new Notice(`Pandoc error: ${errorMessage}`);
      });
      pandocProcess.stdout?.on("data", (data) => {
        console.log(`Pandoc output: ${data.toString()}`);
      });
      pandocProcess.on("close", (code) => {
        if (code === 0) {
          new Notice(`Successfully generated: ${outputFile}`);
          resolve(true);
        } else {
          console.error(`Pandoc process exited with code ${code}`);
          if (code === 83) {
            new Notice(
              `Error: Pandoc exited with code 83.\nCheck if "${crossrefFilter}" is installed.`
            );
          } else if (code === 127) {
            new Notice(
              `Error: Pandoc exited with code 127.\nCheck if pandoc/crossref are in PATH.`
            );
          } else {
            new Notice(`Error: Pandoc process exited with code ${code}`);
          }
          resolve(false);
        }
      });
      pandocProcess.on("error", (err) => {
        console.error("Error launching Pandoc:", err);
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
        } else {
          if (entry.name.toLowerCase() === filename.toLowerCase()) {
            return fullPath;
          }
        }
      }
    } catch (err) {
      console.error(`Error reading directory: ${searchDirectory}`, err);
    }
    return null;
  }

  async loadSettings() {
    try {
      const loaded = await this.loadData();
      this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    } catch (err) {
      console.error("Error loading settings:", err);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings() {
    try {
      await this.saveData(this.settings);
    } catch (err) {
      console.error("Error saving settings:", err);
      new Notice("Error saving settings. Check console for details.");
    }
  }
}
