// MdTexPlugin.ts

import { App, Plugin, Notice, MarkdownView, FileSystemAdapter } from "obsidian";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
// markdownlint は動的importで解決（Obsidian環境のPATH差異を回避）

import { PandocPluginSettings, ProfileSettings, DEFAULT_SETTINGS, DEFAULT_PROFILE } from "./MdTexPluginSettings";
import { PandocPluginSettingTab } from "./MdTexPluginSettingTab";

import {MyLabelEditorSuggest,MyLabelSuggest } from "./AutoComplete";

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

  /**
   * プラグイン読み込み時の処理
   */
  async onload() {
    if (!this.settings?.suppressDeveloperLogs) {
      console.log("PandocPlugin loaded!");
    }
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

    this.registerEditorSuggest(new MyLabelEditorSuggest(this.app, this));
    this.loadExternalStylesheet();
    this.registerEditorSuggest(new MyLabelSuggest(this.app, this));
    if (!this.settings.suppressDeveloperLogs) {
      console.log("MdTexPlugin: onload finished.");
    }

    // Lint current note with markdownlint-cli2
    this.addCommand({
      id: "mdtex-lint-current-note",
      name: "Lint current note (markdownlint-cli2)",
      callback: () => this.lintCurrentNote(),
    });
  }


  async onunload() {
    if (!this.settings?.suppressDeveloperLogs) {
      console.log("PandocPlugin unloading...");
    }
    await this.saveSettings();
    if (!this.settings?.suppressDeveloperLogs) {
      console.log("MdTexPlugin: settings saved.");
    }
  }

  /**
   * 現在アクティブなMarkdownファイルを markdownlint-cli2 で解析
   * - ルールはVaultルートの設定ファイル（例: .markdownlint.yaml / .markdownlint-cli2.yaml）を自動検出
   * - 結果はNoticeとコンソールに出力
   */
  async lintCurrentNote() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active file selected.");
      return;
    }
    if (!activeFile.path.endsWith(".md")) {
      new Notice("The active file is not a Markdown file.");
      return;
    }

    // 可能なら保存してから実行
    const leaf = this.app.workspace.activeLeaf;
    if (leaf && leaf.view instanceof MarkdownView) {
      const markdownView = leaf.view as MarkdownView;
      if (markdownView.file && markdownView.file.path === activeFile.path) {
        await markdownView.save();
      }
    }

    try {
      const fileAdapter = this.app.vault.adapter as FileSystemAdapter;
      const fullPath = fileAdapter.getFullPath(activeFile.path);
      const vaultRoot = fileAdapter.getBasePath();

      const cli = this.detectBrewMarkdownlintBin();
      if (!cli) {
        new Notice("markdownlint-cli2が見つからない。設定でパスを指定すること。");
        return;
      }

      await new Promise<void>((resolve) => {
        const envPath = [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/opt/homebrew/opt/node/bin",
          "/usr/local/opt/node/bin",
          process.env.PATH || "",
        ].join(":");
        const child = spawn(cli, [fullPath], {
          shell: false,
          cwd: vaultRoot,
          stdio: "pipe",
          env: { ...process.env, PATH: envPath },
        });
        let out = "";
        let err = "";
        child.stdout?.on("data", (d) => { out += d.toString(); });
        child.stderr?.on("data", (d) => { err += d.toString(); });
        child.on("close", (code) => {
          if (out.trim()) console.log("markdownlint output:\n" + out);
          if (err.trim()) console.error("markdownlint error:\n" + err);
          new Notice(code === 0 ? "Lint完了: 問題なし" : `Lint完了: 指摘あり (code=${code})`);
          resolve();
        });
        child.on("error", (e) => {
          console.error(e);
          new Notice("markdownlint-cli2の起動に失敗。設定のパスとNodeのインストールを確認。");
          resolve();
        });
      });
    } catch (e: any) {
      console.error(e);
      new Notice(`Lintエラー: ${e?.message || e}`);
    }
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

    new Notice(`Converting to ${format.toUpperCase()}...`);

    const activeProfile = this.getActiveProfileSettings();
    const fileAdapter = this.app.vault.adapter as FileSystemAdapter;
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
      if (activeProfile.headerIncludes) {
        content = activeProfile.headerIncludes + "\n" + content;
      }
      content = this.replaceWikiLinksAndCode(content);
      // docx変換時にTeXコマンドを置換
      if (format === "docx") {
        content = content
          // \textbf{...} → **...**
          .replace(/\\textbf\{([^}]+)\}/g, '**$1**')
          // \textit{...} → *...*
          .replace(/\\textit\{([^}]+)\}/g, '*$1*')
          // \footnote{...} → ^[...]
          .replace(/\\footnote\{([^}]+)\}/g, '^[$1]')
          // \centerline{...} → ::: {custom-style="Center"}
          .replace(/\\centerline\{([^}]+)\}/g, '::: {custom-style="Center"}\n$1\n:::')
          // \rightline{...} → ::: {custom-style="Right"}
          .replace(/\\rightline\{([^}]+)\}/g, '::: {custom-style="Right"}\n$1\n:::')
          // \vspace{...} → 空行
          .replace(/\\vspace\{[^}]+\}/g, '\n\n')
          // \kenten{...} → [語]{custom-style="Kenten"}
          .replace(/\\kenten\{([^}]+)\}/g, '[$1]{custom-style="Kenten"}')
          // \newpage/\clearpage → OpenXML改ページ
          .replace(/\\newpage/g, '```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```')
          .replace(/\\clearpage/g, '```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```')
          // \noindent → 削除
          .replace(/\\noindent/g, '');
      }
      await fs.writeFile(intermediateFilename, content, "utf8");

      // 事前Lint（--fix）: 元ファイルではなく中間ファイルに適用
      if (this.settings.enableMarkdownlintFix) {
        try {
          await this.runMarkdownlintFix(intermediateFilename);
        } catch (e: any) {
          console.error(e);
          new Notice("markdownlint-cli2実行に失敗。処理を継続。");
        }
      }

      const success = await this.runPandoc(intermediateFilename, outputFilename, format);

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

  private escapeSpecialCharacters(code: string): string {
    return code
      .replace(/\\/g, "\\textbackslash{}")
      .replace(/\$/g, "\\$").replace(/%/g, "\\%").replace(/#/g, "\\#")
      .replace(/_/g, "\\_").replace(/{/g, "\\{").replace(/}/g, "\\}")
      .replace(/\^/g, "\\^{}").replace(/~/g, "\\textasciitilde")
      .replace(/&/g, "\\&");
  }

  /**
   * markdownlint-cli2 --fix を実行してファイルの自動修正を試みる
   */
  private async runMarkdownlintFix(targetPath: string): Promise<void> {
    const fileAdapter = this.app.vault.adapter as FileSystemAdapter;
    const vaultRoot = fileAdapter.getBasePath();
    const fullPath = path.isAbsolute(targetPath)
      ? targetPath
      : fileAdapter.getFullPath(targetPath);

    const cli = this.detectBrewMarkdownlintBin();
    if (!cli) {
      new Notice("markdownlint-cli2が見つからない。設定でパスを指定すること。");
      return;
    }

    const original = await fs.readFile(fullPath, "utf8");
    // YAMLフロントマターを保護（先頭の --- ... --- ブロック）
    const yamlMatch = original.match(/^(---[\t\x20]*\n[\s\S]*?\n---[\t\x20]*\n?)/);
    const tomlMatch = (!yamlMatch) ? original.match(/^(\+\+\+[\t\x20]*\n[\s\S]*?\n(\+\+\+|\.\.\.)[\t\x20]*\n?)/) : null;
    const frontMatter = yamlMatch?.[1] || tomlMatch?.[1] || "";
    const body = original.slice(frontMatter.length);

    if (frontMatter) {
      // 本文のみ一時ファイルで--fix実行
      const tempBody = `${fullPath}.lintbody.md`;
      await fs.writeFile(tempBody, body, "utf8");
      await new Promise<void>((resolve) => {
        const envPath = [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/opt/homebrew/opt/node/bin",
          "/usr/local/opt/node/bin",
          process.env.PATH || "",
        ].join(":");
        const child = spawn(cli, ["--fix", tempBody], {
          shell: false,
          cwd: vaultRoot,
          stdio: "pipe",
          env: { ...process.env, PATH: envPath },
        });
        child.on("close", async () => {
          try {
            const fixedBody = await fs.readFile(tempBody, "utf8");
            await fs.writeFile(fullPath, frontMatter + fixedBody, "utf8");
          } finally {
            try { await fs.unlink(tempBody); } catch {}
          }
          resolve();
        });
        child.on("error", async () => {
          try { await fs.unlink(tempBody); } catch {}
          resolve();
        });
      });
      return;
    }

    // フロントマターが無い場合はファイル全体に--fixを適用
    await new Promise<void>((resolve) => {
      const envPath = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/opt/homebrew/opt/node/bin",
        "/usr/local/opt/node/bin",
        process.env.PATH || "",
      ].join(":");
      const child = spawn(cli, ["--fix", fullPath], {
        shell: false,
        cwd: vaultRoot,
        stdio: "pipe",
        env: { ...process.env, PATH: envPath },
      });
      child.on("close", () => resolve());
      child.on("error", () => resolve());
    });
  }

  // 旧解決関数（Node/ローカル.bin）は不要になったため削除

  /**
   * Homebrewの標準パスからmarkdownlint CLIを探索
   * - 優先: markdownlint-cli2
   * - 次点: markdownlint-cli
   */
  private detectBrewMarkdownlintBin(): string | null {
    const configured = (this.settings.markdownlintCli2Path || "").trim();
    const candidates = [
      configured,
      "/opt/homebrew/bin/markdownlint-cli2",
      "/usr/local/bin/markdownlint-cli2",
      "/opt/homebrew/bin/markdownlint-cli",
      "/usr/local/bin/markdownlint-cli",
    ].filter(Boolean) as string[];
    for (const p of candidates) {
      try {
        if (fsSync.existsSync(p)) return p;
      } catch (_) {}
    }
    return null;
  }

  /**
   * Vaultルートでmarkdownlint設定を探索して読み込む
   */
  private async loadMarkdownlintConfig(vaultRoot: string): Promise<any> {
    const candidates = [
      ".markdownlint.yaml",
      ".markdownlint.yml",
      ".markdownlint.jsonc",
      ".markdownlint.json",
    ].map((name) => path.join(vaultRoot, name));

    for (const p of candidates) {
      try {
        await fs.access(p);
        const dynImport: any = (new Function("s", "return import(s)"));
        const { readConfig } = await dynImport("markdownlint/promise");
        const cfg = await readConfig(p);
        if (!this.settings.suppressDeveloperLogs) {
          console.log("Loaded markdownlint config:", p);
        }
        return cfg as any;
      } catch (_) {
        // continue
      }
    }
    // デフォルト
    return { default: true } as any;
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
      } else if (format === "docx") {
        args.push("-f", "markdown+raw_html+fenced_divs+raw_attribute");
        args.push("-t", "docx");
        
        // 高度なTeXコマンド変換が有効な場合のみLuaフィルタを適用
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

      if (!this.settings.suppressDeveloperLogs) {
        console.log("Running pandoc with args:", args);
      }

      const pandocProcess = spawn(command, args, { stdio: "pipe", shell: true, env: { ...process.env, PATH: process.env.PATH ?? "" } });

      pandocProcess.stderr?.on("data", (data) => {
        const msg = data.toString().trim();
        new Notice(`Pandoc error: ${msg}`);
        console.error(`Pandoc error: ${msg}`);
      });
      pandocProcess.stdout?.on("data", (data) => {
        if (!this.settings.suppressDeveloperLogs) {
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
    
    if (!loadedData) {
      this.settings = Object.assign({}, DEFAULT_SETTINGS);
      return;
    }

    // profilesArrayがあればそれを優先
    if (loadedData && Array.isArray(loadedData.profilesArray)) {
      const profilesObj: { [key: string]: ProfileSettings } = {};
      for (const p of loadedData.profilesArray) {
        const name = p.name || 'Default';
        profilesObj[name] = { ...DEFAULT_PROFILE, ...p };
      }
      loadedData = {
        profiles: profilesObj,
        activeProfile: loadedData.currentProfileName || loadedData.activeProfile || Object.keys(profilesObj)[0] || 'Default',
        suppressDeveloperLogs: loadedData.suppressDeveloperLogs !== undefined ? loadedData.suppressDeveloperLogs : DEFAULT_SETTINGS.suppressDeveloperLogs,
        enableMarkdownlintFix: loadedData.enableMarkdownlintFix !== undefined ? loadedData.enableMarkdownlintFix : DEFAULT_SETTINGS.enableMarkdownlintFix,
        markdownlintCli2Path: loadedData.markdownlintCli2Path !== undefined ? loadedData.markdownlintCli2Path : DEFAULT_SETTINGS.markdownlintCli2Path,
      } as any;
    } else if (loadedData && Array.isArray(loadedData.profiles)) {
      // profiles: [{name: 'xxx', ...}, ...] → { name: ProfileSettings, ... }
      const profilesObj: { [key: string]: ProfileSettings } = {};
      for (const p of loadedData.profiles) {
        const name = p.name || 'Default';
        profilesObj[name] = { ...DEFAULT_PROFILE, ...p };
      }
      loadedData = {
        profiles: profilesObj,
        activeProfile: loadedData.currentProfileName || loadedData.activeProfile || Object.keys(profilesObj)[0] || 'Default',
        suppressDeveloperLogs: loadedData.suppressDeveloperLogs !== undefined ? loadedData.suppressDeveloperLogs : DEFAULT_SETTINGS.suppressDeveloperLogs,
        enableMarkdownlintFix: loadedData.enableMarkdownlintFix !== undefined ? loadedData.enableMarkdownlintFix : DEFAULT_SETTINGS.enableMarkdownlintFix,
        markdownlintCli2Path: loadedData.markdownlintCli2Path !== undefined ? loadedData.markdownlintCli2Path : DEFAULT_SETTINGS.markdownlintCli2Path,
      } as any;
    } else if (loadedData && !loadedData.profiles) {
      // 旧バージョンからの移行処理
      console.log("Migrating settings to new profile format.");
      const oldSettings = loadedData;
      loadedData = {
          profiles: { 'Default': { ...DEFAULT_PROFILE, ...oldSettings } },
          activeProfile: 'Default',
          suppressDeveloperLogs: loadedData.suppressDeveloperLogs !== undefined ? loadedData.suppressDeveloperLogs : DEFAULT_SETTINGS.suppressDeveloperLogs,
          enableMarkdownlintFix: loadedData.enableMarkdownlintFix !== undefined ? loadedData.enableMarkdownlintFix : DEFAULT_SETTINGS.enableMarkdownlintFix,
          markdownlintCli2Path: loadedData.markdownlintCli2Path !== undefined ? loadedData.markdownlintCli2Path : DEFAULT_SETTINGS.markdownlintCli2Path,
      } as any;
    } else {
      // 通常の読み込み処理
      loadedData = {
        ...loadedData,
        suppressDeveloperLogs: loadedData.suppressDeveloperLogs !== undefined ? loadedData.suppressDeveloperLogs : DEFAULT_SETTINGS.suppressDeveloperLogs,
      };
    }
    
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
  }

  async saveSettings() {
    // 連想配列→配列
    const profilesArray = Object.entries(this.settings.profiles).map(([name, data]) => ({ name, ...data }));
    // 保存用データ
    const saveData = {
      ...this.settings,
      profilesArray,
    };
    await this.saveData(saveData);
  }

  private loadExternalStylesheet() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = "styles.css";
    document.head.appendChild(link);
  }
}
