// File: src/MdTexPlugin.ts
// Purpose: プラグインのライフサイクルとコマンド登録を司るエントリーポイント。
// Reason: 各サービス・UI・サジェストを束ねる中核クラスとして存在する。
// Related: src/services/convertService.ts, src/services/lintService.ts, src/MdTexPluginSettingTab.ts, src/services/settingsService.ts

import { Plugin, Notice } from "obsidian";
import { PandocPluginSettings, ProfileSettings, DEFAULT_SETTINGS, DEFAULT_PROFILE } from "./MdTexPluginSettings";
import { PandocPluginSettingTab } from "./MdTexPluginSettingTab";
import { MyLabelEditorSuggest } from "./suggest/LabelEditorSuggest";
import { MyLabelSuggest } from "./suggest/LabelReferenceSuggest";
import { convertCurrentPage } from "./services/convertService";
import { lintCurrentNote, runMarkdownlintFix, PluginContext } from "./services/lintService";
import { loadSettings as loadSettingsService, saveSettings as saveSettingsService } from "./services/settingsService";

export default class MdTexPlugin extends Plugin {
  settings: PandocPluginSettings = DEFAULT_SETTINGS;

  getActiveProfileSettings(): ProfileSettings {
    const activeProfileName = this.settings.activeProfile;
    const profiles = this.settings.profiles || {};
    const found = profiles[activeProfileName];
    if (found) return found;

    const fallbackKey = Object.keys(profiles)[0];
    if (fallbackKey) return profiles[fallbackKey];

    // プロファイルが空の場合の最終フォールバック
    return DEFAULT_PROFILE;
  }

  async onload() {
    await this.loadSettings();
    this.debugLog("MdTexPlugin loaded");

    this.addSettingTab(new PandocPluginSettingTab(this.app, this));

    this.addRibbonIcon("file-text", "Convert current file (active profile)", () => this.runConversion("active"));

    this.addCommand({
      id: "mdtex-convert-pdf",
      name: "Convert current file to PDF",
      callback: () => this.runConversion("pdf"),
    });

    this.addCommand({
      id: "mdtex-convert-latex",
      name: "Convert current file to LaTeX",
      callback: () => this.runConversion("latex"),
    });

    this.registerEditorSuggest(new MyLabelEditorSuggest(this.app, this));
    this.registerEditorSuggest(new MyLabelSuggest(this.app, this));
    this.debugLog("MdTexPlugin: onload finished.");

    this.addCommand({
      id: "mdtex-lint-current-note",
      name: "Lint current note (markdownlint-cli2)",
      callback: () => this.runLint(),
    });

    this.addCommand({
      id: "mdtex-fix-current-note",
      name: "Apply markdownlint --fix to current note",
      callback: () => this.runLintFix(),
    });
  }

  async onunload() {
    this.debugLog("MdTexPlugin unloading...");
    await this.saveSettings();
    this.debugLog("MdTexPlugin: settings saved.");
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

  private async runConversion(format: "pdf" | "latex" | "active") {
    try {
      const formatToUse = format === "active" ? this.getActiveProfileSettings().outputFormat : format;
      await convertCurrentPage(this.buildContext(), { runMarkdownlintFix }, formatToUse);
      new Notice(`${formatToUse.toUpperCase()} conversion completed.`);
    } catch (error) {
      this.handleError("Conversion", error);
    }
  }

  private async runLint() {
    try {
      await lintCurrentNote(this.buildContext());
      new Notice("Lint completed.");
    } catch (error) {
      this.handleError("Lint", error);
    }
  }

  private async runLintFix() {
    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice("No active file to fix.");
        return;
      }
      await runMarkdownlintFix(this.buildContext(), activeFile.path);
      new Notice("markdownlint --fix applied.");
    } catch (error) {
      this.handleError("Lint fix", error);
    }
  }

  private handleError(context: string, error: unknown) {
    console.error(`MdTexPlugin ${context} failed:`, error);
    const message = error instanceof Error ? error.message : String(error);
    new Notice(`${context} failed: ${message}`);
  }

  private debugLog(...args: unknown[]) {
    if (!this.settings?.suppressDeveloperLogs) console.log("[MdTexPlugin]", ...args);
  }
}
