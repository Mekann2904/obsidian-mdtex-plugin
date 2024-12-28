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
    \\usepackage{setspace}
    
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

        // 中間ファイル名と出力ファイル名の生成
        const intermediateFilename = path.join(outputDir, `${baseName.replace(/\s/g, "_")}.temp.md`);
        const outputFilename = path.join(outputDir, `${baseName.replace(/\s/g, "_")}.pdf`);



        try {
            // 1. Markdownファイル読み込み
            let content = await fs.readFile(inputFilePath, "utf8");

            // 2. headerIncludes を先頭に挿入し、LaTeX パッケージ不足によるエラーを回避
            if (this.settings.headerIncludes) {
                content = this.settings.headerIncludes + "\n" + content;
            }

            // 3. 画像リンク・コードブロックの置換
            content = content.replace(
                /!\[\[([^\]]+)\]\](?:\{#([^\}]+)\})?(?:\[(.*?)\])?|```([a-zA-Z0-9.\-]*)(?:\:([^\n]+))?\n([\s\S]*?)```/g,
                (
                    match: string,
                    linkText: string,
                    label: string,
                    caption: string,
                    lang: string,
                    blockCaption: string,
                    code: string
                ) => {
                    if (linkText) {
                        // 画像リンクの処理
                        const foundPath = this.findFileSync(linkText, this.settings.searchDirectory);

                        if (foundPath) {
                            const resolvedPath = path.resolve(foundPath);
                            if (caption && label) {
                                return `![${caption}](${resolvedPath}){#${label}}`;
                            } else if (caption) {
                                return `![${caption}](${resolvedPath})`;
                            } else if (label) {
                                return `![](${resolvedPath}){#${label}}`;
                            }
                            return `![](${resolvedPath})`;
                        }
                        return match; // ファイルが見つからない場合はそのまま
                    } else if (code) {
                        // コードブロックの処理
                        const resolvedLang = lang || "zsh"; // 言語が指定されていない場合はデフォルト値 "text"
                        const formattedCaption = blockCaption ? `,caption={${blockCaption}}` : ""; // キャプションがない場合は空文字
                        return `\\begin{lstlisting}[language=${resolvedLang}${formattedCaption}]\n${code}\n\\end{lstlisting}`;
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
                `"${intermediateFilename}"`,
                "-o",
                `"${outputFilename}"`,
                "--pdf-engine=lualatex",   // 必須
                "-F", "pandoc-crossref",
                "-V", "geometry:margin=1in", // PDFのマージン設定
                "-V", "fontsize=12pt",      // フォントサイズの設定
                "--highlight-style=tango",   // シンタックスハイライトスタイル
                "-V", "documentclass=ltjsarticle", // 日本語用ドキュメントクラス
            ];            
			

            // const pandocProcess = spawn(command, args, {
            //     stdio: "inherit",
            //     shell: true,
            //     env: {
            //         ...process.env,
            //         // LaTeX環境のPATH
            //         PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
            //     },
            // });


            const pandocProcess = spawn(command, args, {
                stdio: ["pipe", "pipe", "pipe"], // 標準入出力をpipeに設定
                shell: true,
                env: {
                    ...process.env,
                    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", // LaTeX環境のPATH
                },
            });
            
            // 標準エラー出力をキャプチャ
            if (pandocProcess.stderr) {
                pandocProcess.stderr.on("data", (data) => {
                    const errorMessage = data.toString();
                    console.error(`Pandoc error: ${errorMessage}`);
                    new Notice(`Pandoc error: ${errorMessage}`);
                });
            }
            
            // 標準出力をキャプチャ（オプション：デバッグ用）
            if (pandocProcess.stdout) {
                pandocProcess.stdout.on("data", (data) => {
                    const outputMessage = data.toString();
                    console.log(`Pandoc output: ${outputMessage}`);
                });
            }
            

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