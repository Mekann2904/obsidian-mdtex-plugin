// File: src/suggest/LabelEditorSuggest.ts
// Purpose: {#fig:} などのラベル補完を提供する EditorSuggest 実装。
// Reason: 本体から補完ロジックを分離し、責務を限定するため。
// Related: src/suggest/LabelReferenceSuggest.ts, src/suggest/labelParser.ts, src/MdTexPlugin.ts

import { EditorSuggest, EditorPosition, EditorSuggestContext, Editor, TFile, App } from "obsidian";

interface PandocPluginLike {
  settings: { suppressDeveloperLogs: boolean };
}

export interface MyCompletion {
  label: string;
  detail?: string;
}

export class MyLabelEditorSuggest extends EditorSuggest<MyCompletion> {
  public app: App;
  private suppressNextTrigger = false;
  private plugin: PandocPluginLike | null = null;

  constructor(app: App, plugin?: PandocPluginLike) {
    super(app);
    this.app = app;
    this.plugin = plugin || null;
    if (!this.shouldSuppressLogs()) {
      console.log("MyLabelEditorSuggest initialized.");
    }
  }

  private shouldSuppressLogs(): boolean {
    return this.plugin?.settings?.suppressDeveloperLogs || false;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestContext | null {
    if (this.suppressNextTrigger) {
      this.suppressNextTrigger = false;
      return null;
    }

    const line = editor.getLine(cursor.line);
    const match = line.match(/(\{#[a-zA-Z0-9:]*\}?)/);
    if (!match || !match[0]) return null;

    const foundText = match[0];
    const startCh = line.indexOf(foundText);
    const endCh = startCh + foundText.length;

    if (endCh < line.length) {
      const nextChar = line[endCh];
      if (nextChar?.match(/[\w]/) || nextChar?.match(/[^a-zA-Z0-9]/)) return null;
    }

    return {
      editor,
      file,
      query: foundText,
      start: { line: cursor.line, ch: startCh },
      end: { line: cursor.line, ch: endCh },
    };
  }

  getSuggestions(context: EditorSuggestContext): MyCompletion[] {
    const allSuggestions: MyCompletion[] = [
      { label: "{#fig:}", detail: "Figure Label" },
      { label: "{#tbl:}", detail: "Table Label" },
      { label: "{#lst: caption=\"\"}", detail: "Code Label" },
      { label: "{#eq:}", detail: "Equation Label" },
    ];

    const queryWithoutCurly = context.query.replace(/\}$/, "");
    return allSuggestions.filter((item) => item.label.startsWith(queryWithoutCurly));
  }

  renderSuggestion(suggestion: MyCompletion, el: HTMLElement): void {
    el.createDiv({ cls: "autocomplete-label", text: suggestion.label });
    if (suggestion.detail) {
      el.createDiv({ cls: "autocomplete-detail", text: suggestion.detail });
    }
  }

  selectSuggestion(suggestion: MyCompletion): void {
    const { editor, start, end } = this.context ?? {};
    if (!editor || !start || !end) return;

    editor.replaceRange(suggestion.label, start, end);

    const colonIndex = suggestion.label.indexOf(":");
    if (colonIndex !== -1) {
      editor.setCursor({ line: start.line, ch: start.ch + colonIndex + 1 });
    }

    this.close();
    this.suppressNextTrigger = true;
  }
}
