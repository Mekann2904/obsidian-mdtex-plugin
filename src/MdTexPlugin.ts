// File: src/MdTexPlugin.ts
// Purpose: プラグインのライフサイクルとコマンド登録を司るエントリーポイント。
// Reason: 各サービス・UI・サジェストを束ねる中核クラスとして存在する。
// Related: src/services/convertService.ts, src/services/lintService.ts, src/MdTexPluginSettingTab.ts, src/services/settingsService.ts

import { Plugin, Notice } from "obsidian";
import { Extension } from "@codemirror/state";
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
import { OutputFormat } from "./services/pandocCommandBuilder";

export default class MdTexPlugin extends Plugin {
  settings: PandocPluginSettings = DEFAULT_SETTINGS;
  private latexSuggest: LatexEditorSuggest | null = null;
  private ghostExtension: Extension | null = null;
   private statusBarItem: HTMLElement | null = null;

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

    this.statusBarItem = this.addStatusBarItem();
    this.updateStatus(t("status_ready"));

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

    if (this.settings.enableLatexGhost) {
      this.ghostExtension = createLatexGhostTextExtension(this);
      this.registerEditorExtension(this.ghostExtension);
    }

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
    this.updateStatus("");
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
    const startedAt = Date.now();
    try {
      const preferred = format === "active" ? this.getActiveProfileSettings().outputFormat : format;
      const formatToUse: OutputFormat =
        preferred === "latex" || preferred === "docx" ? preferred : "pdf";

      this.updateStatus(t("status_converting", [formatToUse.toUpperCase()]));

      await convertCurrentPage(this.buildContext(), { runMarkdownlintFix }, formatToUse);
      new Notice(t("notice_convert_done", [formatToUse.toUpperCase()]));
      const elapsed = Date.now() - startedAt;
      this.updateStatus(t("status_done", [formatToUse.toUpperCase(), elapsed]));
    } catch (error) {
      this.updateStatus(t("status_error", [format.toUpperCase()]));
      this.handleError("Conversion", error);
    }
  }

  private async runLint() {
    const startedAt = Date.now();
    this.updateStatus(t("status_linting"));
    try {
      await lintCurrentNote(this.buildContext());
      new Notice(t("notice_lint_done"));
      const elapsed = Date.now() - startedAt;
      this.updateStatus(t("status_done", ["LINT", elapsed]));
    } catch (error) {
      this.updateStatus(t("status_error", ["LINT"]));
      this.handleError("Lint", error);
    }
  }

  private async runLintFix() {
    const startedAt = Date.now();
    this.updateStatus(t("status_fixing"));
    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice(t("notice_no_active_file_fix"));
        this.updateStatus(t("status_ready"));
        return;
      }
      await runMarkdownlintFix(this.buildContext(), activeFile.path);
      new Notice(t("notice_fix_done"));
      const elapsed = Date.now() - startedAt;
      this.updateStatus(t("status_done", ["FIX", elapsed]));
    } catch (error) {
      this.updateStatus(t("status_error", ["FIX"]));
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

  private updateStatus(text: string) {
    if (!this.statusBarItem) return;
    const el = this.statusBarItem as HTMLElement & { setText?: (value: string) => void };
    if (el.setText) {
      el.setText(text);
    } else {
      el.textContent = text;
    }
  }

  private getLatexCommands() {
    return buildLatexCommands(this.settings?.latexCommandsYaml);
  }
}
