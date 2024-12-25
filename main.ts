import { Plugin, PluginSettingTab, Setting, Notice } from "obsidian";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { FileSystemAdapter } from "obsidian";

interface PandocPluginSettings {
    pandocPath: string;
    searchDirectory: string;
    headerIncludes: string;
    outputDirectory: string;
    deleteIntermediateFiles: boolean; // 中間ファイル削除フラグ
}

const DEFAULT_HEADER_INCLUDES = `---
header-includes:
  - |
    \\usepackage{listings}
    \\usepackage{color}
    \\lstset{
      basicstyle=\\ttfamily\\fontsize{7pt}{8pt}\\selectfont,
      frame=single,
      breaklines=true,
      keepspaces=true,
    }
---
`;

const DEFAULT_SETTINGS: PandocPluginSettings = {
    pandocPath: "pandoc",
    searchDirectory: "/Users/your-username/obsidian",
    headerIncludes: DEFAULT_HEADER_INCLUDES,
    outputDirectory: "", // デフォルトはVaultのルートディレクトリ
    deleteIntermediateFiles: false, // 中間ファイル削除デフォルトOFF
};

export default class PandocPlugin extends Plugin {
    settings: PandocPluginSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new PandocPluginSettingTab(this.app, this));

        // リボンアイコン押下時の処理
        this.addRibbonIcon("file-text", "Convert to PDF", async () => {
            await this.convertCurrentPageToPDF();
        });
    }

    /**
     * 現在アクティブなMarkdownファイルをPDFへ変換
     */
    async convertCurrentPageToPDF() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("No active file selected.");
            return;
        }

        // 拡張子チェック
        if (!activeFile.path.endsWith(".md")) {
            new Notice("The active file is not a Markdown file.");
            return;
        }

        new Notice("Converting to PDF...");

        // FileSystemAdapter としてアダプタを取得
        const fileAdapter = this.app.vault.adapter as FileSystemAdapter;

        // getFullPath / getBasePath は FileSystemAdapter 特有のメソッド
        const inputFilePath = fileAdapter.getFullPath(activeFile.path);
        const baseName = path.basename(inputFilePath, ".md");

        // 出力ディレクトリ確認
        const outputDir = this.settings.outputDirectory || fileAdapter.getBasePath();
        try {
            await fs.access(outputDir); // ディレクトリ存在チェック
        } catch {
            new Notice(`Output directory does not exist: ${outputDir}`);
            console.error(`Output directory does not exist: ${outputDir}`);
            return;
        }

        const intermediateFilename = path.join(outputDir, `${baseName}.temp.md`);
        const outputFilename = path.join(outputDir, `${baseName}.pdf`);

        try {
            // 1. Markdownファイル読み込み
            let content = await fs.readFile(inputFilePath, "utf8");

            // 2. headerIncludes を先頭に挿入し、LaTeX パッケージ不足によるエラーを回避
            if (this.settings.headerIncludes) {
                content = this.settings.headerIncludes + "\n" + content;
            }

			// 3. 画像リンク・コードブロックの置換
			// replace のコールバックを同期的にし、ファイル検索も同期で行う
			content = content.replace(
				/!\[\[([^\]]+)\]\](?:\{#([^\}]+)\})?(?:\[(.*?)\])?|\`\`\`([a-zA-Z0-9:\-.]*)\n([\s\S]*?)\`\`\`/g,
				(match: string, linkText: string, label: string, caption: string, lang: string, code: string, filename: string, codeLabel: string,) => {
					if (linkText) {
						// 同期的にファイル探索
						const foundPath = this.findFileSync(linkText, this.settings.searchDirectory);

						if (foundPath) {
							const resolvedPath = path.resolve(foundPath);
							// キャプションとラベルの有無に応じて構築
							if (caption && label) {
								return `![${caption}](${resolvedPath}){#${label}}`;
							} else if (caption) {
								return `![${caption}](${resolvedPath})`;
							} else if (label) {
								return `![Image caption.](${resolvedPath}){#${label}}`;
							}
							return `![](${resolvedPath})`;
						}
						return match; // ファイルが見つからない場合、元のマッチを保持
					} else if (lang && code) {
						// コードブロックの処理
						return `\\begin{lstlisting}[caption=${lang || "code"}]\n${code}\n\\end{lstlisting}`;
					}
					return match;
				}
			);

            // 4. 中間ファイルとして保存
            await fs.writeFile(intermediateFilename, content, "utf8");

            // 5. Pandocコマンド実行
            const pandocPath = this.settings.pandocPath;
            const command = `"${pandocPath}"`;
            const args = [
                intermediateFilename,
                "-o",
                outputFilename,
				"-F", 
				"pandoc-crossref",
				"--pdf-engine=lualatex",
                "-V",
                "documentclass=ltjsarticle",
                "--verbose",
            ];
			

            const pandocProcess = spawn(command, args, {
                stdio: "inherit",
                shell: true,
                env: {
                    ...process.env,
                    // LaTeX環境のPATH
                    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
                },
            });

            // 終了時の処理
            pandocProcess.on("close", async (code) => {
                if (code === 0) {
                    new Notice(`PDF generated successfully: ${outputFilename}`);

                    // 中間ファイル削除（設定がONの場合）
                    if (this.settings.deleteIntermediateFiles) {
                        await fs.unlink(intermediateFilename);
                        console.log(`Intermediate file deleted: ${intermediateFilename}`);
                    }
                } else {
                    console.error(`Pandoc process exited with code ${code}`);
                    new Notice(`Error: Pandoc process exited with code ${code}`);
                }
            });

            // エラー発生時の処理
            pandocProcess.on("error", (err) => {
                console.error("Error launching Pandoc:", err);
                new Notice(`Error launching Pandoc: ${err.message}`);
            });
        } catch (error: any) {
            console.error("Error generating PDF:", error.message);
            new Notice(`Error generating PDF: ${error.message}`);
        }
    }

    /**
     * 同期的に searchDirectory を探索し、ファイル名が合致するもののフルパスを返す
     * （サブディレクトリの再帰探索が必要なら適宜追加）
     */
	findFileSync(filename: string, searchDirectory: string): string | null {
		try {
			const entries = fsSync.readdirSync(searchDirectory, { withFileTypes: true }); // ディレクトリ内容を取得
	
			for (const entry of entries) {
				const fullPath = path.join(searchDirectory, entry.name);
	
				if (entry.isDirectory()) {
					// サブディレクトリを再帰的に探索
					const result = this.findFileSync(filename, fullPath);
					if (result) return result; // 見つかったらそのまま返す
				} else if (entry.name.toLowerCase() === filename.toLowerCase()) {
					// ファイル名が一致した場合、そのフルパスを返す
					return fullPath;
				}
			}
		} catch (error) {
			console.error(`Error reading directory: ${searchDirectory}`, error);
		}
	
		return null; // 見つからない場合は null を返す
	}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

/**
 * 設定画面 (SettingTab)
 */
class PandocPluginSettingTab extends PluginSettingTab {
    plugin: PandocPlugin;
    language: "en" | "jp"; // 言語

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
            .setDesc("Switch between English and Japanese.\n\n英語と日本語を切り替えます。")
            .addToggle(toggle =>
                toggle
                    .setValue(this.language === "jp")
                    .onChange(value => {
                        this.language = value ? "jp" : "en";
                        this.display();
                    })
            );

        const descriptions = {
            pandocPath: {
                en: "Specify the path to the Pandoc executable.",
                jp: "Pandoc実行ファイルへのパスを指定してください。",
            },
            searchDirectory: {
                en: "Directory to search for linked files.",
                jp: "リンクされたファイルを検索するディレクトリを指定してください。",
            },
            headerIncludes: {
                en: "Specify custom LaTeX header includes.",
                jp: "カスタムLaTeXヘッダーを指定してください。",
            },
            outputDirectory: {
                en: "Directory to save the generated PDF. Leave blank to use the Vault root.",
                jp: "生成されたPDFを保存するディレクトリを指定してください。\n空欄の場合はVaultのルートディレクトリが使用されます。",
            },
            deleteIntermediateFiles: {
                en: "Automatically delete intermediate Markdown files after PDF generation.",
                jp: "PDF生成後に中間Markdownファイルを自動的に削除します。",
            },
        };

        new Setting(containerEl)
            .setName("Pandoc Path")
            .setDesc(descriptions.pandocPath[this.language])
            .addText(text =>
                text
                    .setValue(this.plugin.settings.pandocPath)
                    .onChange(async value => {
                        this.plugin.settings.pandocPath = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Search Directory")
            .setDesc(descriptions.searchDirectory[this.language])
            .addText(text =>
                text
                    .setValue(this.plugin.settings.searchDirectory)
                    .onChange(async value => {
                        this.plugin.settings.searchDirectory = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Header Includes")
            .setDesc(descriptions.headerIncludes[this.language])
            .addTextArea(textArea =>
                textArea
                    .setValue(this.plugin.settings.headerIncludes)
                    .onChange(async value => {
                        this.plugin.settings.headerIncludes = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Output Directory")
            .setDesc(descriptions.outputDirectory[this.language])
            .addText(text =>
                text
                    .setValue(this.plugin.settings.outputDirectory)
                    .onChange(async value => {
                        this.plugin.settings.outputDirectory = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Delete Intermediate Files")
            .setDesc(descriptions.deleteIntermediateFiles[this.language])
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.deleteIntermediateFiles)
                    .onChange(async value => {
                        this.plugin.settings.deleteIntermediateFiles = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}