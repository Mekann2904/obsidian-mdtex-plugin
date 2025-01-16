// PandocPlugin.ts

import { Plugin, Notice, MarkdownView } from "obsidian";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { FileSystemAdapter } from "obsidian";

import { PandocPluginSettings, DEFAULT_SETTINGS } from "./MdTexPluginSettings";
import { PandocPluginSettingTab } from "./MdTexPluginSettingTab";

/**
 * メインプラグインクラス
 */
export default class PandocPlugin extends Plugin {
  settings: PandocPluginSettings;

  async onload() {
    // 設定をロード
    await this.loadSettings();

    // 設定画面を追加
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
      // ディレクトリが存在するか確認
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
        await fs.unlink(intermediateFilename);
        console.log(`Intermediate file deleted: ${intermediateFilename}`);
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
      // バックスラッシュは最初にまとめて置換
      .replace(/\\/g, "\\textbackslash{}")
      // 以下、LaTeX で特別な意味を持つ文字をすべてエスケープ
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
   * 画像リンク・コードブロックなどの置換処理
   * 安定性を重視し、極力簡潔に実装する。
   *
   * ※ 特にコードブロックで `{#lst:XXX caption="YYY"}` のような記法を検出し、
   *    listings 用に label={lst:XXX}, caption={YYY} を注入するようにした。
   */
  replaceWikiLinksAndCode(markdown: string): string {
    return markdown.replace(
      // Wikiリンク画像 or コードブロックを検出する正規表現
      // 例: ```python {#lst:label caption="example"} ... ```
      /!\[\[([^\]]+)\]\](?:\{#([^}]+)\})?(?:\[(.*?)\])?|```(\w+)(?:\s*\{([^}]*)\})?\n([\s\S]*?)```/g,
      (
        match: string,
        imageLink: string,
        imageLabel: string,
        imageCaption: string,
        codeLang: string,
        codeAttrs: string, // {#lst:foo caption="bar"}
        codeBody: string
      ) => {
        // --- 画像リンク ---
        if (imageLink) {
          const foundPath = this.findFileSync(
            imageLink,
            this.settings.searchDirectory
          );
          if (!foundPath) {
            // 見つからない場合はオリジナルをそのまま返す
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

          // 画像の最終形
          return `![${captionPart}](${resolvedPath}){${labelPart}${scalePart}}`;
        }

        // --- コードブロック ---
        if (codeBody) {
          // 特殊文字をすべてエスケープ
          const escapedCode = this.escapeSpecialCharacters(codeBody);
          // コードブロックの言語設定がない場合はデフォルト zsh
          const resolvedLang = codeLang || "zsh";

          // 追加属性 (e.g. #lst:label caption="例" )
          let labelOption = "";
          let captionOption = "";

          if (codeAttrs) {
            // 1) label={lst:xxx} を抽出
            // 2) caption={...} を抽出
            // 例: #lst:la caption="コード例"
            //     -> label={lst:la}, caption={コード例}

            // labelを正規表現で探す (#lst:xxx)
            const labelMatch = codeAttrs.match(/#lst:([\w-]+)/);
            if (labelMatch) {
              labelOption = `,label={lst:${labelMatch[1]}}`;
            }

            // captionを正規表現で探す (caption="...")
            const captionMatch = codeAttrs.match(/caption\s*=\s*"(.*?)"/);
            if (captionMatch) {
              // 中身をエスケープ
              const c = this.escapeSpecialCharacters(captionMatch[1]);
              captionOption = `,caption={${c}}`;
            }
          }

          // listings パッケージ用の lstlisting 環境を出力
          // label=..., caption=... をオプションに付加する
          return `\\begin{lstlisting}[language=${resolvedLang}${labelOption}${captionOption}]\n${escapedCode}\n\\end{lstlisting}`;
        }

        // 該当しなければ元の文字列をそのまま返す
        return match;
      }
    );
  }

  /**
   * Pandocを非同期で実行
   * @param inputFile  - 中間ファイル(.temp.md)へのパス
   * @param outputFile - 出力ファイル(.pdf, .tex, .docx等)へのパス
   * @param format     - 出力形式(pdf, latex等)
   * @returns 成功したかどうか（boolean）
   */
  async runPandoc(
    inputFile: string,
    outputFile: string,
    format: string
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      // pandocパス（設定から取得、未設定時は "pandoc"）
      const pandocPath = this.settings.pandocPath.trim() || "pandoc";
      const command = `"${pandocPath}"`;

      // 引数をまとめる
      const args = [
        `"${inputFile}"`,
        "-o",
        `"${outputFile}"`,
      ];

      // フォーマットに応じたオプション
      if (format === "pdf") {
        args.push(`--pdf-engine=${this.settings.latexEngine}`);
      } else if (format === "latex") {
        args.push("-t", "latex");
      }

      // --listings を追加（listings パッケージ利用）
      args.push("--listings");

      // pandoc-crossref をフィルタとして呼び出す
      const crossrefFilter =
        this.settings.pandocCrossrefPath.trim() || "pandoc-crossref";
      args.push("-F", `"${crossrefFilter}"`);

      // pandoc-crossref オプション
      args.push("-M", "listings=true");
      args.push("-M", `figureTitle=${this.settings.figureLabel}`);
      args.push("-M", `figPrefix=${this.settings.figPrefix}`);
      args.push("-M", `tableTitle=${this.settings.tableLabel}`);
      args.push("-M", `tblPrefix=${this.settings.tblPrefix}`);
      args.push("-M", `listingTitle=${this.settings.codeLabel}`);
      args.push("-M", `lstPrefix=${this.settings.lstPrefix}`);
      args.push("-M", `eqnPrefix=${this.settings.eqnPrefix}`);

      // PDFオプション等
      args.push("-V", `geometry:margin=${this.settings.marginSize}`);
      if (!this.settings.usePageNumber) {
        args.push("-V", "pagestyle=empty");
      }
      args.push("-V", `fontsize=${this.settings.fontSize}`);
      args.push("-V", "documentclass=ltjsarticle");
      args.push("--highlight-style=tango");

      // その他の追加オプションがあれば
      if (this.settings.pandocExtraArgs.trim() !== "") {
        const extra = this.settings.pandocExtraArgs.split(/\s+/);
        args.push(...extra);
      }

      console.log("Running pandoc with args:", args);

      // spawn で Pandoc を実行
      const pandocProcess = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        env: { ...process.env, PATH: process.env.PATH ?? "" },
      });

      // stderr
      pandocProcess.stderr?.on("data", (data) => {
        const errorMessage = data.toString().trim();
        console.error(`Pandoc error: ${errorMessage}`);
        new Notice(`Pandoc error: ${errorMessage}`);
      });

      // stdout (デバッグ用)
      pandocProcess.stdout?.on("data", (data) => {
        console.log(`Pandoc output: ${data.toString()}`);
      });

      // close イベント
      pandocProcess.on("close", (code) => {
        if (code === 0) {
          new Notice(`Successfully generated: ${outputFile}`);
          resolve(true);
        } else {
          console.error(`Pandoc process exited with code ${code}`);
          if (code === 83) {
            new Notice(
              `Error: Pandoc exited with code 83.\n` +
              `Check if "${crossrefFilter}" is installed and in PATH or set correctly.`
            );
          } else if (code === 127) {
            new Notice(
              `Error: Pandoc exited with code 127.\n` +
              `Check if pandoc or filters are in PATH.`
            );
          } else {
            new Notice(`Error: Pandoc process exited with code ${code}`);
          }
          resolve(false);
        }
      });

      // プロセス起動エラー
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
          // 大文字小文字を無視して一致するかを判定
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
}
