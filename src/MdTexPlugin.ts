// File: src/MdTexPlugin.ts
// Purpose: プラグインのライフサイクルとコマンド登録を司るエントリーポイント。
// Reason: 各サービス・UI・サジェストを束ねる中核クラスとして存在する。
// Related: src/services/convertService.ts, src/services/lintService.ts, src/MdTexPluginSettingTab.ts, src/services/settingsService.ts

import { App, Plugin } from "obsidian";
import { PandocPluginSettings, ProfileSettings, DEFAULT_SETTINGS } from "./MdTexPluginSettings";
import { PandocPluginSettingTab } from "./MdTexPluginSettingTab";
import { MyLabelEditorSuggest } from "./suggest/LabelEditorSuggest";
import { MyLabelSuggest } from "./suggest/LabelReferenceSuggest";
import { convertCurrentPage } from "./services/convertService";
import { lintCurrentNote, runMarkdownlintFix, PluginContext } from "./services/lintService";
import { loadSettings as loadSettingsService, saveSettings as saveSettingsService } from "./services/settingsService";

export default class PandocPlugin extends Plugin {
  settings: PandocPluginSettings = DEFAULT_SETTINGS;

  getActiveProfileSettings(): ProfileSettings {
    const activeProfileName = this.settings.activeProfile;
    return this.settings.profiles[activeProfileName];
  }

  async onload() {
    if (!this.settings?.suppressDeveloperLogs) console.log("PandocPlugin loaded!");

    await this.loadSettings();
    this.addSettingTab(new PandocPluginSettingTab(this.app, this));

    this.addRibbonIcon("file-text", "Convert to PDF using active profile", async () => {
      const format = this.getActiveProfileSettings().outputFormat;
      await convertCurrentPage(this.buildContext(), { runMarkdownlintFix }, format);
    });

    this.addCommand({
      id: "pandoc-plugin-convert-pdf",
      name: "Convert current file to PDF",
      callback: () => convertCurrentPage(this.buildContext(), { runMarkdownlintFix }, "pdf"),
    });

    this.addCommand({
      id: "pandoc-plugin-convert-latex",
      name: "Convert current file to LaTeX",
      callback: () => convertCurrentPage(this.buildContext(), { runMarkdownlintFix }, "latex"),
    });

    this.registerEditorSuggest(new MyLabelEditorSuggest(this.app, this));
    this.loadExternalStylesheet();
    this.registerEditorSuggest(new MyLabelSuggest(this.app, this));

    if (!this.settings.suppressDeveloperLogs) console.log("MdTexPlugin: onload finished.");

    this.addCommand({
      id: "mdtex-lint-current-note",
      name: "Lint current note (markdownlint-cli2)",
      callback: () => lintCurrentNote(this.buildContext()),
    });

    this.addCommand({
      id: "mdtex-fix-current-note",
      name: "現在ファイルにmarkdownlint --fixを適用",
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;
        await runMarkdownlintFix(this.buildContext(), activeFile.path);
      },
    });
  }

  async onunload() {
    if (!this.settings?.suppressDeveloperLogs) console.log("PandocPlugin unloading...");
    await this.saveSettings();
    if (!this.settings?.suppressDeveloperLogs) console.log("MdTexPlugin: settings saved.");
  }

  private buildContext(): PluginContext {
    return {
      app: this.app,
      settings: this.settings,
      getActiveProfileSettings: () => this.getActiveProfileSettings(),
    };
  }

  async loadSettings() {
    this.settings = await loadSettingsService(() => this.loadData());
  }

  async saveSettings() {
    await saveSettingsService(this.settings, (data) => this.saveData(data));
  }

  private loadExternalStylesheet() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = "styles.css";
    document.head.appendChild(link);
  }
}
