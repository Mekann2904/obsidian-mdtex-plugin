// File: src/extensions/latexGhostText.ts
// Purpose: LaTeX/ラベル用ゴーストテキストを CodeMirror 6 で一元管理し、Tab/ArrowRight で確定する拡張を提供する。
// Reason: StateField 競合や前方重複、コードブロック閉じカッコでの誤反応を解消し、画像・表・数式・コードフェンスにも安定してラベルサジェストを出すため。
// Related: src/data/latexCommands.ts, src/MdTexPlugin.ts

import {
  Extension,
  StateField,
  EditorState,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  keymap,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import MdTexPlugin from "../MdTexPlugin";
import { buildLatexCommands } from "../data/latexCommands";

interface GhostState {
  pos: number;
  display: string;
  insertText: string;
  replaceFrom: number;
  replaceTo: number;
  targetPos: number;
}

interface TriggerContext {
  start: number;
  head: number;
  query: string;
  kind: "command" | "label" | "context";
  candidateText?: string;
}

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.text;
    span.style.opacity = "0.5";
    span.style.pointerEvents = "none";
    span.className = "cm-latex-ghost-text";
    return span;
  }
}

export function createLatexGhostTextExtension(plugin: MdTexPlugin): Extension {
  let suppressUntilPos: number | null = null;
  const labelSuggestions = ["fig:", "tbl:", "eq:", "sec:", "lst:"];
  let cachedYaml = "";
  let cachedCommands: { cmd: string; desc: string; cursorOffset?: number }[] = [];

  const getCommands = () => {
    const yaml = plugin.settings?.latexCommandsYaml ?? "";
    if (yaml === cachedYaml && cachedCommands.length) return cachedCommands;
    cachedYaml = yaml;
    cachedCommands = buildLatexCommands(yaml);
    return cachedCommands;
  };

  const detectContext = (state: EditorState, line: any, head: number): TriggerContext | null => {
    const text = line.text;
    const relHead = head - line.from;

    // 既にラベルがある行は対象外（中身に空白や記号があっても検出）
    if (/\{#\s*[^}]+\}/.test(text)) return null;

    const mathMatch = text.match(/\$\$/);
    if (mathMatch && mathMatch.index !== undefined) {
      const mathEnd = mathMatch.index + 2;
      if (relHead >= mathEnd && /^\s*$/.test(text.slice(mathEnd, relHead))) {
        return {
          start: line.from + mathEnd,
          head,
          query: text.slice(mathEnd, relHead),
          kind: "context",
          candidateText: " {#eq:}",
        };
      }
    }

    // コードブロック: 既に {#lst:...} が書き始められているなら何もしない（未閉じでも抑止）
    const codeBlockMatch = text.match(/^(```|~~~)/);
    if (codeBlockMatch && relHead === text.length) {
      if (/\{#\s*lst\s*:/.test(text)) return null;
      const beforeText = state.sliceDoc(0, line.from);
      const fencesBefore = (beforeText.match(/^(```|~~~)/gm) || []).length;
      // 既に奇数回出現している場合、今回のフェンスは閉じ側とみなしてサジェストしない
      if (fencesBefore % 2 === 1) return null;
      return {
        start: line.from + text.length,
        head,
        query: "",
        kind: "context",
          candidateText: ' {#lst:caption=""}',
      };
    }

    const embedMatch = text.match(/!\[\[.*?\]\]/g);
    if (embedMatch) {
      const lastEmbed = embedMatch[embedMatch.length - 1];
      const lastIndex = text.lastIndexOf(lastEmbed);
      const embedEnd = lastIndex + lastEmbed.length;
      if (relHead >= embedEnd) {
        return {
          start: line.from + embedEnd,
          head,
          query: text.slice(embedEnd, relHead),
          kind: "context",
          candidateText: " {#fig:}",
        };
      }
    }

    const mdImgMatch = text.match(/!\[.*?\]\(.*?\)/g);
    if (mdImgMatch) {
      const lastEmbed = mdImgMatch[mdImgMatch.length - 1];
      const lastIndex = text.lastIndexOf(lastEmbed);
      const embedEnd = lastIndex + lastEmbed.length;
      if (relHead >= embedEnd) {
        return {
          start: line.from + embedEnd,
          head,
          query: text.slice(embedEnd, relHead),
          kind: "context",
          candidateText: " {#fig:}",
        };
      }
    }

    if (line.number > 1) {
      const prevLine = state.doc.line(line.number - 1);
      const prevText = prevLine.text.trim();
      if (prevText.startsWith("|")) {
        const trimmedCurrent = text.trimStart();
        // すでに {#tbl: ...} が含まれているなら出さない
        if (/\{#\s*tbl\s*:[^}]*\}/.test(text)) return null;
        if (trimmedCurrent.startsWith(":")) {
	return {
            start: line.from + text.length, // 常に末尾追記
            head,
            query: "",
            kind: "context",
          candidateText: " {#tbl:}",
          };
        }
      }
    }

    return null;
  };

  const findTrigger = (view: EditorView): TriggerContext | null => {
    if (!plugin.settings?.enableLatexPalette) return null;
    const sel = view.state.selection.main;
    if (!sel.empty) return null;

    const head = sel.head;
    const line = view.state.doc.lineAt(head);

    const ctx = detectContext(view.state, line, head);
    if (ctx) return ctx;

    const prefix = line.text.slice(0, head - line.from);

    const matchCmd = prefix.match(/\\([a-zA-Z0-9]*)$/);
    if (matchCmd && matchCmd.index !== undefined) {
      return {
        start: line.from + matchCmd.index,
        head,
        query: matchCmd[1],
        kind: "command",
      };
    }

    const matchLabel = prefix.match(/\{#([A-Za-z0-9:_-]*)$/);
    if (matchLabel && matchLabel.index !== undefined) {
      const typed = matchLabel[1];
      const candidate = labelSuggestions.find((s) => s.startsWith(typed)) ?? labelSuggestions[0];
      return {
        start: line.from + matchLabel.index + 2,
        head,
        query: typed,
        kind: "label",
        candidateText: candidate,
      };
    }

    return null;
  };

  const calculateGhostState = (view: EditorView): GhostState | null => {
    const ctx = findTrigger(view);
    if (!ctx) return null;

    if (suppressUntilPos !== null && ctx.head <= suppressUntilPos && ctx.head >= ctx.start) {
      return null;
    }

    let fullCandidate = "";
    if (ctx.kind === "command") {
      const commands = getCommands();
      const match = commands.find((c) => c.cmd.startsWith("\\" + ctx.query));
      if (!match) return null;
      fullCandidate = match.cmd;
    } else {
      fullCandidate = ctx.candidateText || "";
    }

    let rest = "";
    if (ctx.kind === "command") {
      const typed = "\\" + ctx.query;
      if (!fullCandidate.startsWith(typed)) return null;
      rest = fullCandidate.slice(typed.length);
    } else {
      if (ctx.query.length > fullCandidate.length) return null;
      if (!fullCandidate.startsWith(ctx.query)) return null;
      rest = fullCandidate.slice(ctx.query.length);
    }

    if (!rest) return null;

    const ahead = view.state.sliceDoc(ctx.head, ctx.head + rest.length);
    if (ahead === rest) return null;

    let common = 0;
    while (common < rest.length && common < ahead.length && rest[common] === ahead[common]) {
      common++;
    }

    const display = rest.slice(common).split("\n")[0];
    if (!display) return null;

    let targetPosRel = fullCandidate.length;
    if (ctx.kind === "context") {
      if (fullCandidate.includes('""')) {
        targetPosRel = fullCandidate.indexOf('""') + 1;
      } else if (fullCandidate.includes("}")) {
        targetPosRel = fullCandidate.length;
      }
    }

    const finalTargetPos = ctx.start + targetPosRel;

    return {
      pos: ctx.head,
      display,
      insertText: rest,
      replaceFrom: ctx.head,
      replaceTo: ctx.head + common,
      targetPos: finalTargetPos,
    };
  };

  const unifiedGhostField = StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(_old, tr) {
      if (tr.docChanged) suppressUntilPos = null;
      const mockView = { state: tr.state } as EditorView;
      const ghost = calculateGhostState(mockView);
      if (!ghost) return Decoration.none;

      return Decoration.set([
        Decoration.widget({
          widget: new GhostTextWidget(ghost.display),
          side: 1,
        }).range(ghost.pos),
      ]);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const ghostKeymap = keymap.of([
    {
      key: "Tab",
      run: (view) => {
        const ghost = calculateGhostState(view);
        if (!ghost) return false;

        view.dispatch({
          changes: { from: ghost.replaceFrom, to: ghost.replaceTo, insert: ghost.insertText },
          selection: { anchor: ghost.targetPos, head: ghost.targetPos },
          scrollIntoView: true,
        });

        suppressUntilPos = ghost.targetPos;
        return true;
      },
    },
    {
      key: "ArrowRight",
      run: (view) => {
        const ghost = calculateGhostState(view);
        if (!ghost) return false;

        view.dispatch({
          changes: { from: ghost.replaceFrom, to: ghost.replaceTo, insert: ghost.insertText },
          selection: { anchor: ghost.targetPos, head: ghost.targetPos },
          scrollIntoView: true,
        });

        suppressUntilPos = ghost.targetPos;
        return true;
      },
    },
  ]);

  return [unifiedGhostField, ghostKeymap];
}
