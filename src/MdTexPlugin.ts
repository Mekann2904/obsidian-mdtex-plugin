// File: src/MdTexPlugin.ts
// Purpose: プラグインのライフサイクルとコマンド登録を司るエントリーポイント。
// Reason: 各サービス・UI・サジェストを束ねる中核クラスとして存在する。
// Related: src/services/convertService.ts, src/services/lintService.ts, src/MdTexPluginSettingTab.ts, src/services/settingsService.ts

import { Plugin, Notice } from "obsidian";
import { PandocPluginSettings, ProfileSettings, DEFAULT_SETTINGS, DEFAULT_PROFILE } from "./MdTexPluginSettings";
import { PandocPluginSettingTab } from "./MdTexPluginSettingTab";
import { MyLabelEditorSuggest } from "./suggest/LabelEditorSuggest";
import { MyLabelSuggest } from "./suggest/LabelReferenceSuggest";
import { LatexEditorSuggest } from "./suggest/LatexEditorSuggest";
import { convertCurrentPage } from "./services/convertService";
import { lintCurrentNote, runMarkdownlintFix, PluginContext } from "./services/lintService";
import { loadSettings as loadSettingsService, saveSettings as saveSettingsService } from "./services/settingsService";
import { t } from "./lang/helpers";
import { LatexCommandModal } from "./modal/LatexCommandModal";
import { buildLatexCommands } from "./data/latexCommands";
import { createLatexGhostTextExtension } from "./extensions/latexGhostText";

export default class MdTexPlugin extends Plugin {
  settings: PandocPluginSettings = DEFAULT_SETTINGS;
  private latexSuggest: LatexEditorSuggest | null = null;

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

    this.addRibbonIcon("file-text", t("ribbon_convert_active"), () => this.runConversion("active"));

    this.addCommand({
      id: "mdtex-convert-pdf",
      name: t("cmd_convert_pdf"),
      callback: () => this.runConversion("pdf"),
    });

    this.addCommand({
      id: "mdtex-convert-latex",
      name: t("cmd_convert_latex"),
      callback: () => this.runConversion("latex"),
    });

    this.addCommand({
      id: "mdtex-open-latex-command-palette",
      name: t("cmd_open_latex_palette"),
      icon: "function-square",
      editorCallback: (editor) => {
        if (!this.settings.enableLatexPalette) {
          new Notice(t("notice_latex_palette_disabled"));
          return;
        }
        new LatexCommandModal(this.app, editor, this.getLatexCommands()).open();
      },
    });

    this.registerEditorExtension(createLatexGhostTextExtension(this));

    this.latexSuggest = new LatexEditorSuggest(this.app, this);
    this.registerEditorSuggest(this.latexSuggest);

    this.registerEditorSuggest(new MyLabelEditorSuggest(this.app, this));
    this.registerEditorSuggest(new MyLabelSuggest(this.app, this));
    this.debugLog("MdTexPlugin: onload finished.");

    this.addCommand({
      id: "mdtex-lint-current-note",
      name: t("cmd_lint"),
      callback: () => this.runLint(),
    });

    this.addCommand({
      id: "mdtex-fix-current-note",
      name: t("cmd_fix"),
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
    this.latexSuggest?.updateCommands();
  }

  private async runConversion(format: "pdf" | "latex" | "active") {
    try {
      const formatToUse = format === "active" ? this.getActiveProfileSettings().outputFormat : format;
      await convertCurrentPage(this.buildContext(), { runMarkdownlintFix }, formatToUse);
      new Notice(t("notice_convert_done", [formatToUse.toUpperCase()]));
    } catch (error) {
      this.handleError("Conversion", error);
    }
  }

  private async runLint() {
    try {
      await lintCurrentNote(this.buildContext());
      new Notice(t("notice_lint_done"));
    } catch (error) {
      this.handleError("Lint", error);
    }
  }

  private async runLintFix() {
    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice(t("notice_no_active_file_fix"));
        return;
      }
      await runMarkdownlintFix(this.buildContext(), activeFile.path);
      new Notice(t("notice_fix_done"));
    } catch (error) {
      this.handleError("Lint fix", error);
    }
  }

  private handleError(context: string, error: unknown) {
    console.error(`MdTexPlugin ${context} failed:`, error);
    const message = error instanceof Error ? error.message : String(error);
    new Notice(t("notice_operation_failed", [context, message]));
  }

  private debugLog(...args: unknown[]) {
    if (!this.settings?.suppressDeveloperLogs) console.log("[MdTexPlugin]", ...args);
  }

  private getLatexCommands() {
    return buildLatexCommands(this.settings?.latexCommandsYaml);
  }
}
