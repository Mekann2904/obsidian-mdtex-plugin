// File: src/services/profileManager.test.ts
// Purpose: プロファイル追加・削除・マイグレーションの純粋ロジックを検証する。
// Reason: UI からの操作結果が正しく state へ反映されることを保証するため。
// Related: src/services/profileManager.ts, src/services/settingsService.ts, src/MdTexPluginSettingTab.ts, plans.md

import { describe, expect, it } from "vitest";
import { addProfile, removeProfile, migrateSettings, createDefaultProfile } from "./profileManager";

describe("profileManager", () => {
  it("addProfile は元の state を汚さず新しいプロファイルを作成する", () => {
    const baseProfile = createDefaultProfile();
    baseProfile.outputFormat = "latex";
    const state = { profiles: { Default: baseProfile }, activeProfile: "Default" };

    const next = addProfile(state, "Draft", baseProfile);

    expect(Object.keys(state.profiles)).toEqual(["Default"]);
    expect(next.activeProfile).toBe("Draft");
    expect(next.profiles.Draft.outputFormat).toBe("latex");
  });

  it("removeProfile はアクティブを残存プロファイルへフォールバックする", () => {
    const baseProfile = createDefaultProfile();
    const altProfile = { ...baseProfile, outputFormat: "docx" };
    const state = {
      profiles: { Default: baseProfile, Docx: altProfile },
      activeProfile: "Docx",
    };

    const next = removeProfile(state, "Docx");

    expect(next.activeProfile).toBe("Default");
    expect(next.profiles.Docx).toBeUndefined();
    expect(Object.keys(next.profiles)).toContain("Default");
  });

  it("migrateSettings は旧フォーマットのデータをデフォルト値で埋める", () => {
    const migrated = migrateSettings({
      enableMarkdownlintFix: true,
      profilesArray: [{ name: "Legacy", pandocExtraArgs: "--draft", pandocPath: "custom-pandoc" }],
    });

    expect(migrated.profiles.Legacy.pandocPath).toBe("custom-pandoc");
    expect(migrated.profiles.Legacy.pandocExtraArgs).toBe("--draft");
    expect(migrated.profiles.Legacy.equationLabel).toBeDefined();
    expect(migrated.enableMarkdownlintFix).toBe(true);
  });
});
