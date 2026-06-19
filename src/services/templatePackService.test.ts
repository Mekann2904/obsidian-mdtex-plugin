// File: src/services/templatePackService.test.ts
// Purpose: テンプレートパック管理の純粋ロジック（パス正規化・解決）を検証する（ADR-008）。
// Reason: vault I/O を含む listTemplatePacks / scaffoldSampleTemplatePacks は実 Obsidian が要るため、
//          純粋関数（normalizeTemplateFolder / resolveDefaultsFilePath）に絞ってユニットテストする。
// Related: src/services/templatePackService.ts

import { describe, expect, it } from "vitest";
import {
  normalizeTemplateFolder,
  resolveDefaultsFilePath,
} from "./templatePackService";
import { DEFAULT_PROFILE, ProfileSettings } from "../MdTexPluginSettings";

function profile(overrides: Partial<ProfileSettings> = {}): ProfileSettings {
  return { ...DEFAULT_PROFILE, ...overrides };
}

describe("normalizeTemplateFolder", () => {
  it("前後の空白とスラッシュを除去する", () => {
    expect(normalizeTemplateFolder("  /MdTex Templates/  ")).toBe("MdTex Templates");
  });

  it("空文字・undefined を空にする", () => {
    expect(normalizeTemplateFolder("")).toBe("");
    expect(normalizeTemplateFolder(undefined as unknown as string)).toBe("");
  });

  it("ネストしたパスの先頭末尾スラッシュのみ除去し、中間は保持する", () => {
    expect(normalizeTemplateFolder("/Templates/MdTex/")).toBe("Templates/MdTex");
  });
});

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
