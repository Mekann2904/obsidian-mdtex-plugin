// File: src/suggest/LabelReferenceSuggest.ts
// Purpose: [@xxx] 形式のラベル参照補完を提供する EditorSuggest 実装。
// Reason: ラベル抽出とサジェスト責務を分割し、可読性を高めるため。
// Related: src/suggest/LabelEditorSuggest.ts, src/suggest/labelParser.ts, src/MdTexPlugin.ts

import { EditorSuggest, EditorPosition, EditorSuggestContext, Editor, TFile, App, EventRef } from "obsidian";
import { extractLabels, LabelCompletion } from "./labelParser";

interface PandocPluginLike {
  settings: { suppressDeveloperLogs: boolean };
}

export class MyLabelSuggest extends EditorSuggest<LabelCompletion> {
  private labels: LabelCompletion[] = [];
  private plugin: PandocPluginLike | null = null;
  private fileModifyEventRef: EventRef | null = null;

  constructor(public app: App, plugin?: PandocPluginLike) {
    super(app);
    this.plugin = plugin || null;

    this.fileModifyEventRef = this.app.vault.on("modify", async (modifiedFile) => {
      if (modifiedFile instanceof TFile) {
        await this.updateLabels(modifiedFile);
      }
    });
  }

  private shouldSuppressLogs(): boolean {
    return this.plugin?.settings?.suppressDeveloperLogs || false;
  }

  public onunload() {
    if (this.fileModifyEventRef) {
      this.app.vault.offref(this.fileModifyEventRef);
      this.fileModifyEventRef = null;
    }
  }

  public onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestContext | null {
    const lineText = editor.getLine(cursor.line);
    const match = lineText.match(/(\[@[a-zA-Z0-9:_-]*\]?)/);
    if (!match || !match[0]) return null;

    const foundText = match[0];
    const startCh = lineText.indexOf(foundText);
    const endCh = startCh + foundText.length;
    const query = foundText.slice(2).replace(/\]$/, "");

    return {
      editor,
      file,
      query,
      start: { line: cursor.line, ch: startCh },
      end: { line: cursor.line, ch: endCh },
    };
  }

  getSuggestions(context: EditorSuggestContext): LabelCompletion[] {
    return this.labels.filter((item) => item.label.startsWith(context.query));
  }

  renderSuggestion(suggestion: LabelCompletion, el: HTMLElement): void {
    el.createDiv({ cls: "autocomplete-label", text: suggestion.label });
    if (suggestion.detail) {
      el.createDiv({ cls: "autocomplete-detail", text: suggestion.detail });
    }
  }

  selectSuggestion(suggestion: LabelCompletion): void {
    const { editor, start, end } = this.context ?? {};
    if (!editor || !start || !end) return;

    editor.replaceRange(`[@${suggestion.label}]`, start, end);
    editor.setCursor({ line: start.line, ch: start.ch + suggestion.label.length + 3 });
    this.close();
  }

  private async updateLabels(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);
      this.labels = extractLabels(content);
      if (!this.shouldSuppressLogs()) {
        console.log("[MyLabelSuggest:updateLabels] Updated labels:", this.labels);
      }
    } catch (err) {
      this.labels = [];
      console.error("[MyLabelSuggest:updateLabels] Failed to read file:", err);
    }
  }
}
