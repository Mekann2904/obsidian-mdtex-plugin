// File: src/extensions/latexGhostText.ts
// Purpose: LaTeX コマンドの最有力候補をカーソル直後にゴーストテキストで表示し、Tabで確定できる拡張を提供する。
// Reason: Copilot 風のインライン補完体験を MdTex の LaTeX 補完に追加し、打鍵数を減らすため。
// Related: src/suggest/LatexEditorSuggest.ts, src/data/latexCommands.ts, src/MdTexPlugin.ts, styles.css

import { StateField, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType, keymap } from "@codemirror/view";
import { prepareFuzzySearch, sortSearchResults, SearchResult } from "obsidian";
import MdTexPlugin from "../MdTexPlugin";
import { LatexCommand, buildLatexCommands } from "../data/latexCommands";

interface TriggerContext {
  start: number;
  head: number;
  query: string;
  typedLength: number;
}

class GhostTextWidget extends WidgetType {
  constructor(private text: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = this.text;
    span.style.opacity = "0.45";
    span.style.pointerEvents = "none";
    span.style.transition = "opacity 120ms ease";
    span.classList.add("mdtex-ghost-text");
    return span;
  }
}

export function createLatexGhostTextExtension(plugin: MdTexPlugin) {
  let cachedYaml = "";
  let cachedCommands: LatexCommand[] = [];
  let suppressUntilPos: number | null = null;

  const getCommands = (): LatexCommand[] => {
    const yaml = plugin.settings?.latexCommandsYaml ?? "";
    if (yaml === cachedYaml && cachedCommands.length) return cachedCommands;
    cachedYaml = yaml;
    cachedCommands = buildLatexCommands(yaml);
    return cachedCommands;
  };

  const findTrigger = (view: EditorView): TriggerContext | null => {
    if (!plugin.settings?.enableLatexPalette) return null;
    const sel = view.state.selection.main;
    if (!sel.empty) return null;
    const head = sel.head;
    const line = view.state.doc.lineAt(head);
    const prefix = line.text.slice(0, head - line.from);
    const match = prefix.match(/\\([a-zA-Z0-9]*)$/);
    if (!match || match.index === undefined) return null;

    const start = line.from + match.index;
    const typedLength = head - start;
    const query = match[1];
    return { start, head, query, typedLength };
  };

  const pickTop = (query: string, commands: LatexCommand[]): LatexCommand | null => {
    if (!commands.length) return null;
    if (!query) return commands[0];

    const searchFn = prepareFuzzySearch(query);
    const results: { item: LatexCommand; match: SearchResult }[] = [];

    for (const cmd of commands) {
      const m1 = searchFn(cmd.cmd);
      const m2 = searchFn(cmd.desc);
      if (m1 || m2) {
        const best = m1 && m2 ? (m1.score < m2.score ? m2 : m1) : (m1 || m2)!;
        results.push({ item: cmd, match: best });
      }
    }

    if (!results.length) return null;
    sortSearchResults(results);
    return results[0].item;
  };

  const acceptSuggestion = (view: EditorView): boolean => {
    const ctx = findTrigger(view);
    if (!ctx) return false;

    const commands = getCommands();
    const candidate = pickTop(ctx.query, commands);
    if (!candidate) return false;

    if (ctx.typedLength >= candidate.cmd.length) return false;
    const rest = candidate.cmd.slice(ctx.typedLength);
    if (!rest.length) return false;

    const ahead = view.state.sliceDoc(ctx.head, ctx.head + rest.length);
    const commonLen = (() => {
      let i = 0;
      const max = Math.min(rest.length, ahead.length);
      while (i < max && rest[i] === ahead[i]) i++;
      return i;
    })();
    const remaining = rest.slice(commonLen);
    if (!remaining.length) return false;

    view.dispatch({ changes: { from: ctx.head, to: ctx.head, insert: remaining } });

    const offset = typeof candidate.cursorOffset === "number" ? candidate.cursorOffset : 0;
    const target = Math.max(0, ctx.start + candidate.cmd.length + offset);
    const clamped = Math.min(view.state.doc.length, target);

    view.dispatch({
      selection: { anchor: clamped, head: clamped },
      scrollIntoView: true,
    });

    suppressUntilPos = ctx.start + candidate.cmd.length;

    return true;
  };

  const ghostField = StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(_old, tr) {
      if (!plugin.settings?.enableLatexPalette) return Decoration.none;
      if (tr.docChanged) suppressUntilPos = null;
      const state = tr.state;
      const builder = new RangeSetBuilder<Decoration>();

      const head = state.selection.main.head;
      const line = state.doc.lineAt(head);
      const prefix = line.text.slice(0, head - line.from);
      const match = prefix.match(/\\([a-zA-Z0-9]*)$/);
      if (!match || match.index === undefined) return Decoration.none;

      const start = line.from + match.index;
      const typedLength = head - start;
      const query = match[1];
      if (suppressUntilPos !== null && head <= suppressUntilPos && head >= start) return Decoration.none;

      const commands = getCommands();
      const candidate = pickTop(query, commands);
      if (!candidate) return Decoration.none;

      if (typedLength >= candidate.cmd.length) return Decoration.none;
      const rest = candidate.cmd.slice(typedLength);
      if (!rest.length) return Decoration.none;

      const ahead = state.sliceDoc(head, head + rest.length);
      if (ahead === rest) return Decoration.none;
      const common = (() => {
        let i = 0;
        const max = Math.min(rest.length, ahead.length);
        while (i < max && rest[i] === ahead[i]) i++;
        return i;
      })();
      const display = rest.slice(common).split("\n")[0];
      if (!display.length) return Decoration.none;

      // 補完が先読みと完全一致する場合は非表示、部分一致時は残りだけ表示する

      builder.add(
        head,
        head,
        Decoration.widget({
          widget: new GhostTextWidget(display),
          side: 1,
        })
      );

      return builder.finish();
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const ghostKeymap = keymap.of([
    {
      key: "ArrowRight",
      run: (view) => acceptSuggestion(view),
    },
  ]);

  return [ghostField, ghostKeymap];
}
