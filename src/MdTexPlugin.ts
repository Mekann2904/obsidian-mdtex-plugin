import { App, Plugin, Notice, MarkdownView } from "obsidian";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { FileSystemAdapter } from "obsidian";

import { PandocPluginSettings, DEFAULT_SETTINGS } from "./MdTexPluginSettings";
import { PandocPluginSettingTab } from "./MdTexPluginSettingTab";


import {MyLabelEditorSuggest,MyLabelSuggest } from "./AutoComplete";

/**
 * メインプラグインクラス
 */
export default class PandocPlugin extends Plugin {
  settings: PandocPluginSettings;

  /**
   * プラグイン読み込み時の処理
   */
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

    // スタイルシートをロード
    this.loadExternalStylesheet();

  console.log("MdTexPlugin: Stylesheet added.");

    // MyLabelSuggest
    this.registerEditorSuggest(new MyLabelSuggest(this.app));
    console.log("MyLabelSuggest: onload finished.");
  }

  /**
   * 現在アクティブなMarkdownファイルを指定フォーマットへ変換
   * @param format "pdf"|"latex"|"docx"など
   */
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

    new Notice(`Converting to ${format.toUpperCase()}...`);

    const fileAdapter = this.app.vault.adapter as FileSystemAdapter;
    const inputFilePath = fileAdapter.getFullPath(activeFile.path);
    const baseName = path.basename(inputFilePath, ".md");

    // 出力ディレクトリ
    const outputDir = this.settings.outputDirectory || fileAdapter.getBasePath();
    try {
      await fs.access(outputDir);
    } catch (err) {
      new Notice(`Output directory does not exist: ${outputDir}`);
      console.error(`Output directory does not exist: ${outputDir}`, err);
      return;
    }

    // 中間ファイル（.temp.md）
    const tempFileName = `${baseName.replace(/\s/g, "_")}.temp.md`;
    const intermediateFilename = path.join(outputDir, tempFileName);

    // 出力ファイル
    const ext = format === "latex" ? ".tex" : `.${format}`;
    const outputFilename = path.join(
      outputDir,
      `${baseName.replace(/\s/g, "_")}${ext}`
    );

    try {
      // (1) Markdown読み込み
      let content = await fs.readFile(inputFilePath, "utf8");

      // (2) LaTeXヘッダなどを先頭に挿入
      if (this.settings.headerIncludes) {
        content = this.settings.headerIncludes + "\n" + content;
      }

      // (3) 画像リンク・コードブロック置換（自動エスケープ含む）
      content = this.replaceWikiLinksAndCode(content);

      // (4) 中間ファイル書き込み
      await fs.writeFile(intermediateFilename, content, "utf8");

      // (5) Pandoc実行
      const success = await this.runPandoc(
        intermediateFilename,
        outputFilename,
        format
      );

      // (6) 成功 & 中間ファイル削除（設定がtrueの場合）
      if (success && this.settings.deleteIntermediateFiles) {
        try {
          await fs.unlink(intermediateFilename);
          console.log(`Intermediate file deleted: ${intermediateFilename}`);
        } catch (err) {
          console.warn(`Failed to delete intermediate file: ${intermediateFilename}`, err);
        }
      }
    } catch (error: any) {
      console.error("Error generating output:", error?.message || error);
      new Notice(`Error generating output: ${error?.message || error}`);
    }
  }

  /**
   * 特殊文字をエスケープする関数
   * LaTeX のコンパイルが通るように、よく問題を起こす文字を置換する。
   */
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

  /**
   * Wikiリンクやコードブロックを置換
   * 安定性を重視し、極力簡潔に実装する。
   */
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
        // 画像リンク処理
        if (imageLink) {
          const foundPath = this.findFileSync(
            imageLink,
            this.settings.searchDirectory
          );
          if (!foundPath) {
            // 見つからない場合はオリジナルを返す
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

        // コードブロック処理
        if (codeBody) {
          // エスケープ
          const escapedCode = this.escapeSpecialCharacters(codeBody);
          // 言語の指定が無い場合は zsh
          const resolvedLang = codeLang || "zsh";

          // 追加属性
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

        // なにも該当しなければそのまま
        return match;
      }
    );
  }

  /**
   * Pandocを非同期で実行
   */
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

      const crossrefFilter =
        this.settings.pandocCrossrefPath.trim() || "pandoc-crossref";
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
      args.push("-V", "documentclass=ltjsarticle");
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

      // 標準エラー
      pandocProcess.stderr?.on("data", (data) => {
        const errorMessage = data.toString().trim();
        console.error(`Pandoc error: ${errorMessage}`);
        new Notice(`Pandoc error: ${errorMessage}`);
      });

      // 標準出力
      pandocProcess.stdout?.on("data", (data) => {
        console.log(`Pandoc output: ${data.toString()}`);
      });

      // プロセス完了時の処理
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

  /**
   * 同期的に searchDirectory を探索し、ファイル名が合致したらフルパスを返す
   */
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

  /**
   * 設定をロード
   */
  async loadSettings() {
    try {
      const loaded = await this.loadData();
      this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    } catch (err) {
      console.error("Error loading settings:", err);
      // ロードに失敗した場合、デフォルト設定を使用
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * 設定をセーブ
   */
  async saveSettings() {
    try {
      await this.saveData(this.settings);
    } catch (err) {
      console.error("Error saving settings:", err);
      new Notice("Error saving settings. Check console for details.");
    }
  }


  /**
   * 外部CSSファイルをロードするメソッド
   */
  private loadExternalStylesheet() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = "styles.css"; // 必要に応じてパスを調整
    document.head.appendChild(link);
    console.log("MdTexPlugin: External stylesheet loaded.");
  }
}
