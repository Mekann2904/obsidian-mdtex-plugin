// File: src/settings/templatePackPanel.ts
// Purpose: テンプレートパックのメタ情報パネル描画を設定タブ本体から分離する。
// Reason: MdTexPluginSettingTab が巨大化し、pack metadata / requires / recommended profile の責務まで抱えていたため。
// Related: src/MdTexPluginSettingTab.ts, src/services/templatePackService.ts

import { App, Notice } from "obsidian";
import type MdTexPlugin from "../MdTexPlugin";
import type { ProfileSettings } from "../MdTexPluginSettings";
import { t } from "../lang/helpers";
import { checkPackRequirements } from "../services/templatePackService";
import {
  isEmptyPackMetadata,
  type PackMetadata,
  type PackRecommendedProfile,
} from "../services/templatePackMeta";

export interface TemplatePackPanelContext {
  app: App;
  plugin: MdTexPlugin;
  containerEl: HTMLElement;
  currentProfile: ProfileSettings;
  packName: string;
  metadata: PackMetadata | null;
  refresh: () => Promise<void> | void;
}

/**
 * 選択中テンプレートパックのメタ情報パネルを描画する（ADR-008 拡張）。
 *
 * - title/description/engine の表示
 * - requires の不足ファイル警告（SKILL.md 導線付き）
 * - recommendedProfile と現在のプロファイルの差分 → 「推奨設定を適用」ボタン
 */
export async function renderTemplatePackInfoPanel(ctx: TemplatePackPanelContext): Promise<void> {
  const { app, plugin, containerEl, currentProfile, packName, metadata, refresh } = ctx;
  if (!metadata || isEmptyPackMetadata(metadata)) return;

  const panel = containerEl.createDiv({ cls: "mdtex-pack-info" });

  if (metadata.title || metadata.description) {
    if (metadata.title) {
      panel.createEl("div", { text: metadata.title, cls: "mdtex-pack-info-title" });
    }
    if (metadata.description) {
      panel.createEl("div", {
        text: metadata.description,
        cls: "mdtex-pack-info-description",
      });
    }
  }

  if (metadata.engine) {
    panel.createDiv({ text: t("setting_pack_info_engine", [metadata.engine]), cls: "mdtex-pack-info-engine" });
  }

  const missing = await checkPackRequirements(
    app,
    currentProfile.templateFolder,
    packName,
    metadata,
  );
  if (missing.length > 0) {
    const warn = panel.createDiv({ cls: "mdtex-pack-warning" });
    warn.createEl("div", { text: t("pack_requires_missing", [missing.join(", ")]) });
    warn.createEl("div", { text: t("pack_requires_hint"), cls: "mdtex-pack-warning-hint" });
    const btnRow = warn.createDiv({ cls: "mdtex-pack-warning-actions" });
    const btn = btnRow.createEl("button", { text: t("button_open_skill_doc") });
    btn.onclick = async () => {
      await openPackGuide(app, currentProfile.templateFolder);
    };
  }

  const rec = metadata.recommendedProfile;
  if (collectRecommendedDiff(currentProfile, rec).length > 0) {
    const recRow = panel.createDiv({ cls: "mdtex-pack-recommended-actions" });
    const applyBtn = recRow.createEl("button", { text: t("button_apply_recommended") });
    applyBtn.classList.add("mod-cta");
    applyBtn.onclick = async () => {
      applyRecommendedProfile(currentProfile, rec);
      await plugin.saveSettings();
      new Notice(t("notice_recommended_applied"));
      await refresh();
    };
  }
}

/** テンプレートフォルダ直下の SKILL.md（パック自作ガイド）を開く。無ければ通知。 */
async function openPackGuide(app: App, templateFolder: string): Promise<void> {
  const folder = (templateFolder ?? "").trim().replace(/^\/+|\/+$/g, "");
  const skillPath = folder ? `${folder}/SKILL.md` : "SKILL.md";
  const file = app.vault.getAbstractFileByPath(skillPath);
  if (!file) {
    new Notice(t("notice_skill_not_found"));
    return;
  }
  await app.workspace.openLinkText(skillPath, "", false);
}

function collectRecommendedDiff(profile: ProfileSettings, rec: PackRecommendedProfile): string[] {
  const diff: string[] = [];
  if (rec.citationMode && profile.citationMode !== rec.citationMode) {
    diff.push(`citationMode: ${rec.citationMode}`);
  }
  const recEngine = rec.latexEngine?.trim();
  if (recEngine && (profile.latexEngine ?? "").trim() !== recEngine) {
    diff.push(`latexEngine: ${recEngine}`);
  }
  const recOpts = rec.pdfEngineOpts?.trim();
  if (recOpts && (profile.pdfEngineOpts ?? "").trim() !== recOpts) {
    diff.push(`pdfEngineOpts: ${recOpts}`);
  }
  return diff;
}

/** パック推奨プロファイルを現在のプロファイルに反映する（非 NULL 項目のみ）。 */
function applyRecommendedProfile(profile: ProfileSettings, rec: PackRecommendedProfile): void {
  if (rec.citationMode) profile.citationMode = rec.citationMode;
  if (rec.latexEngine?.trim()) profile.latexEngine = rec.latexEngine.trim();
  if (rec.pdfEngineOpts?.trim()) profile.pdfEngineOpts = rec.pdfEngineOpts.trim();
}
