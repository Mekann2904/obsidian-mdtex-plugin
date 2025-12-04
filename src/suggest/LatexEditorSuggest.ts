// File: src/suggest/LatexEditorSuggest.ts
// Purpose: バックスラッシュ入力をトリガーに LaTeX コマンドをインライン補完する EditorSuggest を提供する。
// Reason: fzfライクな絞り込みをカーソル位置で行い、即時挿入の体験を向上させるため。
// Related: src/data/latexCommands.ts, src/modal/LatexCommandModal.ts, src/MdTexPlugin.ts, styles.css

import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
  prepareFuzzySearch,
  sortSearchResults,
  SearchResult,
} from "obsidian";
import { LatexCommand, buildLatexCommands } from "../data/latexCommands";
import MdTexPlugin from "../MdTexPlugin";

interface LatexCommandMatch extends LatexCommand {
  match?: SearchResult;
}

export class LatexEditorSuggest extends EditorSuggest<LatexCommandMatch> {
  private commands: LatexCommand[] = [];

  constructor(app: App, private plugin: MdTexPlugin) {
    super(app);
    this.updateCommands();
  }

  public updateCommands() {
    this.commands = buildLatexCommands(this.plugin.settings?.latexCommandsYaml);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    if (!this.plugin.settings?.enableLatexPalette) return null;
    const line = editor.getLine(cursor.line);
    const prefix = line.substring(0, cursor.ch);
    const match = prefix.match(/\\([a-zA-Z0-9]*)$/);
    if (!match || match.index === undefined) return null;

    return {
      start: { line: cursor.line, ch: match.index },
      end: cursor,
      query: match[1],
    };
  }

  getSuggestions(context: EditorSuggestContext): LatexCommandMatch[] {
    if (!this.plugin.settings?.enableLatexPalette) return [];
    const query = context.query;
    if (!query) return this.commands.map((c) => ({ ...c }));

    const searchFn = prepareFuzzySearch(query);
    const results: { item: LatexCommandMatch; match: SearchResult }[] = [];

    for (const cmd of this.commands) {
      const m1 = searchFn(cmd.cmd);
      const m2 = searchFn(cmd.desc);
      if (m1 || m2) {
        const best = m1 && m2 ? (m1.score < m2.score ? m2 : m1) : (m1 || m2)!;
        results.push({ item: { ...cmd, match: best }, match: best });
      }
    }

    sortSearchResults(results);
    return results.map((r) => r.item);
  }

  renderSuggestion(item: LatexCommandMatch, el: HTMLElement): void {
    el.empty();
    el.addClass("mdtex-fzf-item");

    const row = el.createDiv({ cls: "mdtex-fzf-content" });
    row.createDiv({ cls: "mdtex-fzf-cmd" }).setText(item.cmd);
    row.createDiv({ cls: "mdtex-fzf-desc" }).setText(item.desc);
  }

  selectSuggestion(item: LatexCommandMatch): void {
    const ctx = this.context;
    if (!ctx) return;
    const { editor, start, end } = ctx;

    editor.replaceRange(item.cmd, start, end);
    const insertEnd = { line: start.line, ch: start.ch + item.cmd.length };

    if (typeof item.cursorOffset === "number") {
      const target = {
        line: insertEnd.line,
        ch: Math.max(0, insertEnd.ch + item.cursorOffset),
      };
      editor.setCursor(target);
    } else {
      editor.setCursor(insertEnd);
    }

    this.close();
  }
}
