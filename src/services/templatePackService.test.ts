// File: src/services/templatePackService.test.ts
// Purpose: テンプレートパック管理サービスの副作用境界に近い純粋契約を検証する（ADR-008）。
// Reason: vault I/O を含む listTemplatePacks / scaffoldSampleTemplatePacks は実 Obsidian が要るため、
//          defaults path 解決と requires 空入力のショートサーキットに絞ってユニットテストする。
// Related: src/services/templatePackService.ts

import { describe, expect, it } from "vitest";
import { checkPackRequirements, resolveDefaultsFilePath } from "./templatePackService";
import { DEFAULT_PROFILE, ProfileSettings } from "../MdTexPluginSettings";

function profile(overrides: Partial<ProfileSettings> = {}): ProfileSettings {
  return { ...DEFAULT_PROFILE, ...overrides };
}

describe("resolveDefaultsFilePath", () => {
  it("custom モードは defaultsFilePath をそのまま返す", () => {
    const p = profile({
      documentTemplateMode: "defaults",
      defaultsSelection: "custom",
      defaultsFilePath: "/abs/path/defaults.yaml",
    });
    expect(resolveDefaultsFilePath(p)).toBe("/abs/path/defaults.yaml");
  });

  it("custom モードで defaultsFilePath が空なら空を返す", () => {
    const p = profile({
      documentTemplateMode: "defaults",
      defaultsSelection: "custom",
      defaultsFilePath: "",
    });
    expect(resolveDefaultsFilePath(p)).toBe("");
  });

  it("pack モードでパック選択済みなら <folder>/<pack>/defaults.yaml を返す", () => {
    const p = profile({
      documentTemplateMode: "defaults",
      defaultsSelection: "pack",
      templateFolder: "MdTex Templates",
      selectedTemplatePack: "縦書き二段組",
    });
    expect(resolveDefaultsFilePath(p)).toBe("MdTex Templates/縦書き二段組/defaults.yaml");
  });

  it("pack モードでパック未選択なら空を返す", () => {
    const p = profile({
      documentTemplateMode: "defaults",
      defaultsSelection: "pack",
      templateFolder: "MdTex Templates",
      selectedTemplatePack: "",
    });
    expect(resolveDefaultsFilePath(p)).toBe("");
  });

  it("pack モードでフォルダ未設定なら空を返す", () => {
    const p = profile({
      documentTemplateMode: "defaults",
      defaultsSelection: "pack",
      templateFolder: "",
      selectedTemplatePack: "縦書き二段組",
    });
    expect(resolveDefaultsFilePath(p)).toBe("");
  });

  it("pack モードのパスはテンプレートフォルダの前後空白を正規化して使う", () => {
    const p = profile({
      documentTemplateMode: "defaults",
      defaultsSelection: "pack",
      templateFolder: "  MdTex Templates/  ",
      selectedTemplatePack: "情報系論文風",
    });
    expect(resolveDefaultsFilePath(p)).toBe("MdTex Templates/情報系論文風/defaults.yaml");
  });
});

describe("checkPackRequirements", () => {
  // vault I/O を含むが、純粋なパス計算と requires 空のショートサーキットは app 無しで検証。
  it("requires が空なら即座に空配列を返す（app 不要）", async () => {
    const missing = await checkPackRequirements(
      null as unknown as Parameters<typeof checkPackRequirements>[0],
      "MdTex Templates",
      "パック",
      { requires: [], recommendedProfile: {} },
    );
    expect(missing).toEqual([]);
  });

  it("metadata が null なら空配列", async () => {
    const missing = await checkPackRequirements(
      null as unknown as Parameters<typeof checkPackRequirements>[0],
      "MdTex Templates",
      "パック",
      null,
    );
    expect(missing).toEqual([]);
  });
});
