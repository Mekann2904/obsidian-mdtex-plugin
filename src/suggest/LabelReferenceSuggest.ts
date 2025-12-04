// File: src/suggest/LabelReferenceSuggest.ts
// Purpose: [@xxx] 形式のラベル参照補完を提供する EditorSuggest 実装。
// Reason: ラベル抽出とサジェスト責務を分割し、可読性を高めるため。
// Related: src/suggest/LabelEditorSuggest.ts, src/suggest/labelParser.ts, src/MdTexPlugin.ts

import {
  EditorSuggest,
  EditorPosition,
  EditorSuggestContext,
  Editor,
  TFile,
  App,
  EventRef,
  debounce,
  MarkdownView,
} from "obsidian";
import { extractLabels, LabelCompletion } from "./labelParser";

interface PandocPluginLike {
  settings: { suppressDeveloperLogs: boolean };
}

export class MyLabelSuggest extends EditorSuggest<LabelCompletion> {
  private labels: LabelCompletion[] = [];
  private plugin: PandocPluginLike | null = null;
  private eventRefs: EventRef[] = [];
  private debouncedUpdateLabels: (file: TFile, editor?: Editor) => void;

  constructor(public app: App, plugin?: PandocPluginLike) {
    super(app);
    this.plugin = plugin || null;

    this.debouncedUpdateLabels = debounce(this.updateLabelsProcess.bind(this), 300, false);

    const editorChangeRef = this.app.workspace.on("editor-change", (_editor, info) => {
      if (info?.file instanceof TFile) {
        this.debouncedUpdateLabels(info.file, _editor);
      }
    });
    this.eventRefs.push(editorChangeRef);

    const activeLeafRef = this.app.workspace.on("active-leaf-change", () => {
      this.triggerUpdateForActiveView();
    });
    this.eventRefs.push(activeLeafRef);

    this.triggerUpdateForActiveView();
  }

  private shouldSuppressLogs(): boolean {
    return this.plugin?.settings?.suppressDeveloperLogs || false;
  }

  private triggerUpdateForActiveView() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view && view.file) {
      this.updateLabelsProcess(view.file, view.editor);
    }
  }

  public onunload() {
    this.eventRefs.forEach((ref) => this.app.workspace.offref(ref));
    this.eventRefs = [];
  }

  public onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestContext | null {
    const linePrefix = editor.getLine(cursor.line).substring(0, cursor.ch);
    const match = linePrefix.match(/\[@([a-zA-Z0-9:_\-./]*)$/);
    if (!match) return null;

    const matchText = match[0];
    const query = match[1];
    const startCh = cursor.ch - matchText.length;

    return {
      editor,
      file,
      query,
      start: { line: cursor.line, ch: startCh },
      end: cursor,
    };
  }

  getSuggestions(context: EditorSuggestContext): LabelCompletion[] {
    const query = context.query.toLowerCase();

    return this.labels
      .filter((item) => item.label.toLowerCase().includes(query))
      .sort((a, b) => {
        const aLower = a.label.toLowerCase();
        const bLower = b.label.toLowerCase();

        const aStarts = aLower.startsWith(query);
        const bStarts = bLower.startsWith(query);

        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        return aLower.localeCompare(bLower);
      });
  }

  renderSuggestion(suggestion: LabelCompletion, el: HTMLElement): void {
    el.empty();
    el.addClass("mdtex-fzf-item");
    const row = el.createDiv({ cls: "mdtex-fzf-content" });
    row.createDiv({ cls: "mdtex-fzf-cmd" }).setText(suggestion.label);
    row.createDiv({ cls: "mdtex-fzf-desc" }).setText(suggestion.detail || "");
  }

  selectSuggestion(suggestion: LabelCompletion): void {
    const context = this.context;
    if (!context) return;
    const { editor, start, end } = context;

    const replacement = `[@${suggestion.label}]`;
    editor.replaceRange(replacement, start, end);
    editor.setCursor({ line: start.line, ch: start.ch + replacement.length });
    this.close();
  }

  private async updateLabelsProcess(file: TFile, editor?: Editor): Promise<void> {
    const active = this.app.workspace.getActiveFile();
    if (!active || active.path !== file.path) return;

    try {
      const content = editor ? editor.getValue() : await this.app.vault.read(file);
      this.labels = extractLabels(content);
      if (!this.shouldSuppressLogs()) {
        console.log(
          `[MyLabelSuggest:updateLabels] ${file.basename}: ${this.labels.length} labels (Source: ${editor ? "Editor" : "Vault"})`
        );
      }
    } catch (err) {
      console.error("[MyLabelSuggest:updateLabels] Failed to read file:", err);
    }
  }
}
