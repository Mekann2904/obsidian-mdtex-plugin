// MdTexPluginSettingTab.ts

// PandocPluginSettinクラスが実装
// SettingTabを通じてユーザが入力・変更するUIを作成
// 関連:MdTexPluginSettings.ts, MdTexPlugin.ts

//import { PandocPluginSettings } from "./MdTexPluginSettings";
import { PluginSettingTab, Setting } from "obsidian";
import type PandocPlugin from "./MdTexPlugin";

/**
 * 設定タブクラス
 * SettingTabを通じてユーザが入力・変更するUIを作成
 */
export class PandocPluginSettingTab extends PluginSettingTab {
  plugin: PandocPlugin;
  language: "en" | "jp";

  constructor(app: any, plugin: PandocPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.language = "jp"; // デフォルトは日本語
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

    // 字句（日本語/英語）の切り替えのための辞書
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
      documentClass: {
        en: "Document class for LaTeX output.ltjsarticle, ltjsreport, ltjsbook",
        jp: "LaTeX出力のドキュメントクラス。例:ltjsarticle, ltjsreport, ltjsbook",
      },
      outputFormat: {
        en: "Default output format (pdf, latex, docx...).",
        jp: "デフォルト出力形式（pdf, latex, docxなど）。",
      },
      latexEngine: {
        en: "LaTeX engine (lualatex, xelatex...).",
        jp: "LaTeXエンジン（lualatex, xelatexなど）。",
      },
      inkscapePath: {
        en: "Path to Inkscape (for SVG conversion).",
        jp: "Inkscapeのパス（SVG変換用）。",
      },
      mermaidCliPath: {
        en: "Path to Mermaid CLI (for SVG conversion).",
        jp: "Mermaid CLIのパス（SVG変換用）。",
      },
    };

    // 辞書のキーから翻訳を取得するヘルパー
    const t = (key: keyof typeof desc) => desc[key][this.language];

    // 各種設定項目を追加していく
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

    // 図のラベルとプレフィックス
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

    // 表のラベルとプレフィックス
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

    // コードのラベルとプレフィックス
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

    // 数式のラベルとプレフィックス
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

    // 画像スケール
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

    // ページ番号
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

    // 余白サイズ
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

      // ドキュメントクラス
      new Setting(containerEl)
      .setName(this.language === "jp" ? "ドキュメントクラス" : "Document Class")
      .setDesc(t("documentClass"))
      .addText((text) =>
        text
          .setValue(this.plugin.settings.documentClass)
          .onChange(async (value) => {
            this.plugin.settings.documentClass = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // フォントサイズ
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

    // 出力形式
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

    // LaTeXエンジン
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

    // Inkscapeパス
    new Setting(containerEl)
      .setName(this.language === "jp" ? "Inkscapeパス" : "Inkscape Path")
      .setDesc(t("inkscapePath"))
      .addText((text) =>
        text
          .setValue(this.plugin.settings.inkscapePath)
          .onChange(async (value) => {
            this.plugin.settings.inkscapePath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // Mermaid CLIパス
    new Setting(containerEl)
      .setName(this.language === "jp" ? "Mermaid CLIパス" : "Mermaid CLI Path")
      .setDesc(t("mermaidCliPath"))
      .addText((text) =>  
        text
          .setValue(this.plugin.settings.mermaidCliPath)
          .onChange(async (value) => {
            this.plugin.settings.mermaidCliPath = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}