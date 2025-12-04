// File: src/modal/LatexCommandModal.ts
// Purpose: LaTeX コマンドをファジー検索できる FuzzySuggestModal 実装を提供する。
// Reason: 大量のコマンドをショートカット起動で素早く挿入する UX を実現するため。
// Related: src/data/latexCommands.ts, src/MdTexPlugin.ts, src/lang/locale/en.ts, src/lang/locale/ja.ts

import { App, Editor, FuzzyMatch, FuzzySuggestModal } from "obsidian";
import { LatexCommand } from "../data/latexCommands";

export class LatexCommandModal extends FuzzySuggestModal<LatexCommand> {
  private readonly editor: Editor;
  private readonly commands: LatexCommand[];

  constructor(app: App, editor: Editor, commands: LatexCommand[]) {
    super(app);
    this.editor = editor;
    this.commands = commands;
    this.setPlaceholder("Search LaTeX command... (e.g. frac, alpha)");
    this.modalEl.addClass("mdtex-latex-fzf");
  }

  getItems(): LatexCommand[] {
    return this.commands;
  }

  getItemText(item: LatexCommand): string {
    return `${item.cmd} ${item.desc}`;
  }

  renderSuggestion(item: FuzzyMatch<LatexCommand>, el: HTMLElement): void {
    el.empty();
    const container = el.createDiv({ cls: "mdtex-latex-suggest" });
    container.createDiv({ cls: "mdtex-latex-suggest__prompt" }).setText(">");
    container.createDiv({ cls: "mdtex-latex-suggest__cmd" }).setText(item.item.cmd);
    container.createDiv({ cls: "mdtex-latex-suggest__desc" }).setText(item.item.desc);
  }

  onChooseItem(item: LatexCommand): void {
    const cursor = this.editor.getCursor();
    this.editor.replaceRange(item.cmd, cursor);

    if (typeof item.cursorOffset === "number") {
      const insertEndOffset = this.editor.posToOffset({ line: cursor.line, ch: cursor.ch + item.cmd.length });
      const targetOffset = Math.max(0, insertEndOffset + item.cursorOffset);
      const targetPos = this.editor.offsetToPos(targetOffset);
      this.editor.setCursor(targetPos);
      return;
    }

    this.editor.setCursor({ line: cursor.line, ch: cursor.ch + item.cmd.length });
  }
}
