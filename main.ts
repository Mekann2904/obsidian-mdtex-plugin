import { Plugin, PluginSettingTab, Setting, Notice } from "obsidian";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { FileSystemAdapter, Workspace, MarkdownView } from "obsidian";


/**
 * プラグイン設定インタフェース
 */
interface PandocPluginSettings {
    pandocPath: string;            // Pandoc実行コマンド
    pandocExtraArgs: string;       // Pandocに渡す追加オプション（スペース区切り）
    searchDirectory: string;       // Vault内を探索する際のルートディレクトリ
    headerIncludes: string;        // LaTeXヘッダなどのカスタムインクルード
    outputDirectory: string;       // 出力先ディレクトリ（空欄の場合はVaultルート）
    deleteIntermediateFiles: boolean;  // PDF変換時に作成する中間ファイルを削除するか
    pandocCrossrefPath: string;    // pandoc-crossrefの実行ファイルパス
    imageScale: string;            // 画像のデフォルトスケール設定
    usePageNumber: boolean;        // PDF出力時にページ番号を付けるか
    marginSize: string;            // ページ余白サイズ
    fontSize: string;              // フォントサイズ
    outputFormat: string;          // デフォルト出力形式（pdf, latex, docxなど）
    latexEngine: string;           // LaTeXエンジン（lualatex, xelatex, platexなど）
    figureLabel: string;           // 図のラベル
    figPrefix: string;             // 図のプレフィックス
    tableLabel: string;            // 表のラベル
    tblPrefix: string;             // 表のプレフィックス
    codeLabel: string;             // コードのラベル
    lstPrefix: string;             // コードのプレフィックス
    equationLabel: string;         // 数式のラベル
    eqnPrefix: string;             // 数式のプレフィックス
}

/**
 * デフォルト設定
 */
const DEFAULT_HEADER_INCLUDES = `---
header-includes:
  - |
    \\usepackage{luatexja}
    \\usepackage{luatexja-fontspec} 
    \\usepackage{microtype}
    \\usepackage{parskip}
    \\usepackage{listings}
    \\usepackage{color}
    \\usepackage{setspace}
    \\usepackage{booktabs}
    \\usepackage{amsmath,amssymb}
    \\usepackage{mathtools}
    \\usepackage{hyperref}
    \\usepackage{cleveref}
    \\usepackage{autonum}
    \\usepackage{graphicx}
    \\usepackage{caption}
    
    \\lstset{
      frame=single,
      framesep=3pt,
      basicstyle=\\ttfamily\\scriptsize,
      keywordstyle=\\color{blue}\\bfseries,
      commentstyle=\\color{green!50!black},
      stringstyle=\\color{red},
      breaklines=true,
      numbers=left,
      numberstyle=\\tiny\\color{gray},
      stepnumber=1,
      tabsize=4
    }
    \\lstdefinelanguage{zsh}{
      morekeywords={ls, cd, pwd, echo, export, alias, unalias, function},
      sensitive=true,
      morecomment=[l]{\\#},
      morestring=[b]",
      morestring=[b]'
    }
---
`;

const DEFAULT_SETTINGS: PandocPluginSettings = {
    pandocPath: "pandoc",
    pandocExtraArgs: "",
    searchDirectory: "/Users/your-username/obsidian",
    headerIncludes: DEFAULT_HEADER_INCLUDES,
    outputDirectory: "",
    deleteIntermediateFiles: false,
    pandocCrossrefPath: "",
    imageScale: "width=0.8\\linewidth",
    usePageNumber: true,
    marginSize: "1in",
    fontSize: "12pt",
    outputFormat: "pdf",
    latexEngine: "lualatex",
    figureLabel: "Figure",      // 図のラベル (デフォルト: 英語)
    figPrefix: "Figure",        // 図のプレフィックス (デフォルト: 英語)
    tableLabel: "Table",        // 表のラベル (デフォルト: 英語)
    tblPrefix: "Table",         // 表のプレフィックス (デフォルト: 英語)
    codeLabel: "Code",          // コードのラベル (デフォルト: 英語)
    lstPrefix: "Code",          // コードのプレフィックス (デフォルト: 英語)
    equationLabel: "Equation",  // 数式のラベル (デフォルト: 英語)
    eqnPrefix: "Eq.",           // 数式のプレフィックス (デフォルト: 英語)
  };

/**
 * メインプラグインクラス
 */
export default class PandocPlugin extends Plugin {
    settings: PandocPluginSettings;

    async onload() {
        // 設定をロード
        await this.loadSettings();
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

        // **追加: 直前の編集を保存**
        // obsidianの保存にタイムラグがあるため、直前の編集内容を保存する
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

        // Noticeで変換開始を通知
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

        // 中間ファイル
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

            // (3) 画像リンク・コードブロック置換
            //     安定性向上: 例外発生時も中断されないようにtry/catchをネストせず最上位で対応
            content = this.replaceWikiLinksAndCode(content);

            // (4) 中間ファイル書き込み
            await fs.writeFile(intermediateFilename, content, "utf8");

            // (5) Pandoc実行
            const success = await this.runPandoc(intermediateFilename, outputFilename, format);

            // (6) 成功 & 中間ファイル削除（設定がtrueの場合）
            if (success && this.settings.deleteIntermediateFiles) {
                await fs.unlink(intermediateFilename);
                console.log(`Intermediate file deleted: ${intermediateFilename}`);
            }
        } catch (error: any) {
            // 例外発生時の対処（ファイルI/Oなど）
            console.error("Error generating output:", error?.message || error);
            new Notice(`Error generating output: ${error?.message || error}`);
        }
    }

    /**
     * 画像リンク・コードブロックなどの置換処理
     * 安定性を重視し、極力簡潔に実装する。
     */
    replaceWikiLinksAndCode(markdown: string): string {
        return markdown.replace(
            // Wikiリンク画像 or コードブロック
            /!\[\[([^\]]+)\]\](?:\{#([^}]+)\})?(?:\[(.*?)\])?|```(\w*)(?::([^\n]+))?\n([\s\S]*?)```/g,
            (
                match: string,
                imageLink: string,
                imageLabel: string,
                imageCaption: string,
                codeLang: string,
                codeCaption: string,
                codeBody: string
            ) => {
                // --- 画像リンク ---
                if (imageLink) {
                    // 検索してファイルパス取得
                    const foundPath = this.findFileSync(imageLink, this.settings.searchDirectory);
                    if (!foundPath) {
                        // 見つからない場合はそのまま
                        return match;
                    }

                    const resolvedPath = path.resolve(foundPath);
                    // ラベルがあれば fig: を付ける
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
                    // スケール設定
                    const scalePart = this.settings.imageScale
                        ? ` ${this.settings.imageScale}`
                        : "";

                    // ![キャプション](パス){#fig:label width=0.8\linewidth}
                    return `![${captionPart}](${resolvedPath}){${labelPart}${scalePart}}`;
                }

                // --- コードブロック ---
                // 言語が対応していない場合は、zshをデフォルトとする
                // 詳しくはhttps://ja.overleaf.com/learn/latex/Code_listing#Supported_languages
                if (codeBody) {
                    const resolvedLang = codeLang || "zsh";
                    const formattedCaption = codeCaption
                        ? `,caption={${codeCaption}}`
                        : "";
                    return `\\begin{lstlisting}[language=${resolvedLang}${formattedCaption}]\n${codeBody}\n\\end{lstlisting}`;
                }

                // 合致しなければそのまま
                return match;
            }
        );
    }

    /**
     * Pandocを非同期で実行する関数
     * @returns 成功したかどうかのboolean
     */
    async runPandoc(
        inputFile: string,
        outputFile: string,
        format: string
    ): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            // pandocパス
            const pandocPath = this.settings.pandocPath.trim() || "pandoc";
            const command = `"${pandocPath}"`;

            // 引数をまとめる
            const args = [
                `"${inputFile}"`,
                "-o",
                `"${outputFile}"`,
            ];

            // フォーマットに応じて
            if (format === "pdf") {
                args.push(`--pdf-engine=${this.settings.latexEngine}`);
            } else if (format === "latex") {
                args.push("-t", "latex");
            }

            // --listings を追加
            // (コードブロックをpandoc-crossrefで処理した場合にスタイルを適用させるため)
            args.push("--listings");

            // pandoc-crossref
            const crossrefFilter = this.settings.pandocCrossrefPath.trim() || "pandoc-crossref";
            args.push("-F", `"${crossrefFilter}"`);
            args.push("-M", "listings=true");//同様にlistingsを有効するのに必要
            args.push("-M", `figureTitle=${this.settings.figureLabel}`); // 図のタイトル
            args.push("-M", `figPrefix=${this.settings.figPrefix}`); // 図のプレフィックス
            args.push("-M", `tableTitle=${this.settings.tableLabel}`); // 表のタイトル
            args.push("-M", `tblPrefix=${this.settings.tblPrefix}`); // 表のプレフィックス
            args.push("-M", `listingTitle=${this.settings.codeLabel}`); // コードのタイトル
            args.push("-M", `lstPrefix=${this.settings.lstPrefix}`); // コードのプレフィックス
            args.push("-M", `eqnPrefix=${this.settings.eqnPrefix}`); // 式のプレフィックス
            

            // PDFオプションなど
            args.push("-V", `geometry:margin=${this.settings.marginSize}`);
            if (!this.settings.usePageNumber) {
                args.push("-V", "pagestyle=empty");
            }
            args.push("-V", `fontsize=${this.settings.fontSize}`);
            args.push("-V", "documentclass=ltjsarticle");
            args.push("--highlight-style=tango");

            // 追加オプション
            if (this.settings.pandocExtraArgs.trim() !== "") {
                const extra = this.settings.pandocExtraArgs.split(/\s+/);
                args.push(...extra);
            }

            console.log("Running pandoc with args:", args);

            // spawn
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

            // stdout(デバッグ)
            pandocProcess.stdout?.on("data", (data) => {
                console.log(`Pandoc output: ${data.toString()}`);
            });

            // close
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

                // ディレクトリなら再帰探索
                if (entry.isDirectory()) {
                    const result = this.findFileSync(filename, fullPath);
                    if (result) return result;
                } else {
                    // 大文字小文字を無視して一致するか
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
        // 設定をロード（エラー時はデフォルトで置き換え）
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

/**
 * 設定タブクラス
 */
class PandocPluginSettingTab extends PluginSettingTab {
    plugin: PandocPlugin;
    language: "en" | "jp";

    constructor(app: any, plugin: PandocPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.language = "jp"; // デフォルト日本語
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Pandoc Plugin Settings" });

        // 言語トグル
        new Setting(containerEl)
            .setName("Language / 言語")
            .setDesc("Switch between English and Japanese. / 英語と日本語を切り替えます。")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.language === "jp")
                    .onChange((value) => {
                        this.language = value ? "jp" : "en";
                        this.display();
                    })
            );

        const desc = {
            pandocPath: {
                en: "Path to the Pandoc executable.",
                jp: "Pandoc実行ファイルのパスを指定します。",
            },
            pandocExtraArgs: {
                en: "Extra arguments for Pandoc (space-separated).",
                jp: "Pandocに渡す追加オプション（スペース区切り）。",
            },
            searchDirectory: {
                en: "Root directory for searching images/files.",
                jp: "画像等を検索するルートディレクトリ。",
            },
            headerIncludes: {
                en: "Custom LaTeX header includes (YAML).",
                jp: "カスタムLaTeXヘッダ（YAML形式）。",
            },
            outputDirectory: {
                en: "Directory for generated files (blank = vault root).",
                jp: "生成ファイルを保存するディレクトリ（空欄=Vaultルート）。",
            },
            deleteIntermediateFiles: {
                en: "Delete .temp.md after conversion.",
                jp: "変換後に一時Markdownファイルを削除。",
            },
            pandocCrossrefPath: {
                en: "Path to pandoc-crossref (blank = from PATH).",
                jp: "pandoc-crossrefのパス（空欄=PATHから検索）。",
            },
            figureLabel: {
                en: "Label for figures (e.g. Figure).",
                jp: "図のラベル（例：図）。",
            },
            figPrefix: {
                en: "Prefix for figures (e.g. Fig.).",
                jp: "図のプレフィックス（例：図）。",
            },
            tableLabel: {
                en: "Label for tables (e.g. Table).",
                jp: "表のラベル（例：表）。",
            },
            tblPrefix: {
                en: "Prefix for tables (e.g. Tbl.).",
                jp: "表のプレフィックス（例：表）。",
            },
            codeLabel: {
                en: "Label for code blocks (e.g. Code).",
                jp: "コードブロックのラベル（例：コード）。",
            },
            lstPrefix: {
                en: "Prefix for code blocks (e.g. Code).",
                jp: "コードブロックのプレフィックス（例：コード）。",
            },
            equationLabel: {
                en: "Label for equations (e.g. Equation).",
                jp: "数式のラベル（例：式）。",
            },
            eqnPrefix: {
                en: "Prefix for equations (e.g. Eq.).",
                jp: "数式のプレフィックス（例：式）。",
            },
            imageScale: {
                en: "Default image scale (e.g. width=0.8\\linewidth).",
                jp: "画像のデフォルトスケール（例：width=0.8\\linewidth）。",
            },
            usePageNumber: {
                en: "Enable page numbering in PDF.",
                jp: "PDFにページ番号を付ける。",
            },
            marginSize: {
                en: "Margin size (e.g. 1in, 20mm).",
                jp: "余白サイズ（例：1in、20mm）。",
            },
            fontSize: {
                en: "Font size (e.g. 12pt).",
                jp: "フォントサイズ（例：12pt）。",
            },
            outputFormat: {
                en: "Default output format (pdf, latex, docx...).",
                jp: "デフォルト出力形式（pdf, latex, docxなど）。",
            },
            latexEngine: {
                en: "LaTeX engine (lualatex, xelatex...).",
                jp: "LaTeXエンジン（lualatex, xelatexなど）。",
            },
        };

        const t = (key: keyof typeof desc) => desc[key][this.language];

        // 各種設定
        new Setting(containerEl)
            .setName(this.language === "jp" ? "Pandocパス" : "Pandoc Path")
            .setDesc(t("pandocPath"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.pandocPath)
                    .onChange(async (value) => {
                        this.plugin.settings.pandocPath = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(
                this.language === "jp" ? "Pandoc追加オプション" : "Pandoc Extra Args"
            )
            .setDesc(t("pandocExtraArgs"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.pandocExtraArgs)
                    .onChange(async (value) => {
                        this.plugin.settings.pandocExtraArgs = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(this.language === "jp" ? "検索ディレクトリ" : "Search Directory")
            .setDesc(t("searchDirectory"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.searchDirectory)
                    .onChange(async (value) => {
                        this.plugin.settings.searchDirectory = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(this.language === "jp" ? "ヘッダIncludes" : "Header Includes")
            .setDesc(t("headerIncludes"))
            .addTextArea((textArea) =>
                textArea
                    .setValue(this.plugin.settings.headerIncludes)
                    .onChange(async (value) => {
                        this.plugin.settings.headerIncludes = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(
                this.language === "jp" ? "出力ディレクトリ" : "Output Directory"
            )
            .setDesc(t("outputDirectory"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.outputDirectory)
                    .onChange(async (value) => {
                        this.plugin.settings.outputDirectory = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(
                this.language === "jp" ? "中間ファイルを削除" : "Delete Intermediate Files"
            )
            .setDesc(t("deleteIntermediateFiles"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.deleteIntermediateFiles)
                    .onChange(async (value) => {
                        this.plugin.settings.deleteIntermediateFiles = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(
                this.language === "jp" ? "pandoc-crossrefパス" : "pandoc-crossref Path"
            )
            .setDesc(t("pandocCrossrefPath"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.pandocCrossrefPath)
                    .onChange(async (value) => {
                        this.plugin.settings.pandocCrossrefPath = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        // 図のラベルとプレフィックス設定
        new Setting(containerEl)
            .setName(this.language === "jp" ? "図のラベル" : "Figure Label")
            .setDesc(t("figureLabel"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.figureLabel)
                    .onChange(async (value) => {
                        this.plugin.settings.figureLabel = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(this.language === "jp" ? "図のプレフィックス" : "Figure Prefix")
            .setDesc(t("figPrefix"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.figPrefix)
                    .onChange(async (value) => {
                        this.plugin.settings.figPrefix = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        // 表のラベルとプレフィックス設定
        new Setting(containerEl)
            .setName(this.language === "jp" ? "表のラベル" : "Table Label")
            .setDesc(t("tableLabel"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.tableLabel)
                    .onChange(async (value) => {
                        this.plugin.settings.tableLabel = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(this.language === "jp" ? "表のプレフィックス" : "Table Prefix")
            .setDesc(t("tblPrefix"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.tblPrefix)
                    .onChange(async (value) => {
                        this.plugin.settings.tblPrefix = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        // コードのラベルとプレフィックス設定
        new Setting(containerEl)
            .setName(this.language === "jp" ? "コードのラベル" : "Code Label")
            .setDesc(t("codeLabel"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.codeLabel)
                    .onChange(async (value) => {
                        this.plugin.settings.codeLabel = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(this.language === "jp" ? "コードのプレフィックス" : "Code Prefix")
            .setDesc(t("lstPrefix"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.lstPrefix)
                    .onChange(async (value) => {
                        this.plugin.settings.lstPrefix = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        // 数式のラベルとプレフィックス設定
        new Setting(containerEl)
            .setName(this.language === "jp" ? "数式のラベル" : "Equation Label")
            .setDesc(t("equationLabel"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.equationLabel)
                    .onChange(async (value) => {
                        this.plugin.settings.equationLabel = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(this.language === "jp" ? "数式のプレフィックス" : "Equation Prefix")
            .setDesc(t("eqnPrefix"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.eqnPrefix)
                    .onChange(async (value) => {
                        this.plugin.settings.eqnPrefix = value.trim();
                        await this.plugin.saveSettings();
                    })
            );


        new Setting(containerEl)
            .setName(this.language === "jp" ? "画像スケール" : "Image Scale")
            .setDesc(t("imageScale"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.imageScale)
                    .onChange(async (value) => {
                        this.plugin.settings.imageScale = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(this.language === "jp" ? "ページ番号" : "Enable Page Numbering")
            .setDesc(t("usePageNumber"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.usePageNumber)
                    .onChange(async (value) => {
                        this.plugin.settings.usePageNumber = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(this.language === "jp" ? "余白サイズ" : "Margin Size")
            .setDesc(t("marginSize"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.marginSize)
                    .onChange(async (value) => {
                        this.plugin.settings.marginSize = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(this.language === "jp" ? "フォントサイズ" : "Font Size")
            .setDesc(t("fontSize"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.fontSize)
                    .onChange(async (value) => {
                        this.plugin.settings.fontSize = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(this.language === "jp" ? "出力形式" : "Output Format")
            .setDesc(t("outputFormat"))
            .addDropdown((drop) =>
                drop
                    .addOption("pdf", "pdf")
                    .addOption("latex", "latex")
                    .addOption("docx", "docx")
                    .setValue(this.plugin.settings.outputFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.outputFormat = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(this.language === "jp" ? "LaTeXエンジン" : "LaTeX Engine")
            .setDesc(t("latexEngine"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.latexEngine)
                    .onChange(async (value) => {
                        this.plugin.settings.latexEngine = value.trim();
                        await this.plugin.saveSettings();
                    })
            );
    }
}