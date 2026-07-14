// File: src/settings/PreambleModal.ts
// Purpose: LaTeX プリアンブル編集用の全画面モーダル。
// Reason: MdTexPluginSettingTab から独立クラスとして切り出し、設定タブ本体のファイルサイズを
//   縮める（thermo-nuclear review #2-NEW）。プリアンブル編集という独立した関心を1ファイルに持つ。
// Related: src/MdTexPluginSettingTab.ts

import { App, Modal } from "obsidian";
import { t } from "../lang/helpers";

export class PreambleModal extends Modal {
  private initial: string;
  private onSave: (val: string) => Promise<void> | void;

  constructor(app: App, initial: string, onSave: (val: string) => Promise<void> | void) {
    super(app);
    this.initial = initial;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("modal_preamble_title") });

    // 共通クラスでフォント等を統一しつつ、モーダル内は全高（70vh）で上書き。
    const area = contentEl.createEl("textarea", { text: this.initial, cls: "mdtex-code-area" });
    area.style.height = "70vh";
    area.style.lineHeight = "1.45";
    area.spellcheck = false;

    const note = contentEl.createEl("p", { text: t("modal_note") });
    note.style.opacity = "0.8";

    const buttons = contentEl.createDiv();
    buttons.style.display = "flex";
    buttons.style.justifyContent = "flex-end";
    buttons.style.gap = "8px";
    buttons.style.marginTop = "12px";

    const cancel = buttons.createEl("button", { text: t("modal_cancel") });
    cancel.onclick = () => this.close();

    const save = buttons.createEl("button", { text: t("modal_save") });
    save.classList.add("mod-cta");
    save.onclick = async () => {
      await this.onSave(area.value);
      this.close();
    };
  }
}
