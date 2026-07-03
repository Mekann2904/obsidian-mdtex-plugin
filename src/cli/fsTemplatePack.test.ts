// File: src/cli/fsTemplatePack.test.ts
// Purpose: CLI の fs 版テンプレートパック操作（list / read / validate）を検証する。
// Reason: templatePackService の純粋関数（parsePackMetadata）は既テスト済み。ここでは
//          fs I/O の統合と validatePackFs の strict/warning ロジックを検証する。
// Related: src/cli/fsTemplatePack.ts, src/services/templatePackMeta.ts

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  listTemplatePacksFs,
  readPackMetadataFs,
  validatePackFs,
} from "./fsTemplatePack";

async function makeTempVault(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "mdtex-cli-test-"));
}

async function writePack(
  vault: string,
  pack: string,
  files: Record<string, string>,
): Promise<void> {
  const packDir = path.join(vault, pack);
  await fs.mkdir(packDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(packDir, name), content);
  }
}

const META_OK = `_mdtex:
  title: "テストパック"
  description: "検証用"
  engine: lualatex
  requires:
    - extra.cls
  recommendedProfile:
    citationMode: none
    latexEngine: lualatex
`;

describe("listTemplatePacksFs", () => {
  let vault: string;
  beforeEach(async () => {
    vault = await makeTempVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it("defaults.yaml を含むフォルダだけをパックとして認識する", async () => {
    await writePack(vault, "パックA", { "defaults.yaml": "from: markdown\n" });
    await fs.mkdir(path.join(vault, "パックB")); // defaults.yaml 無し → パックでない
    await fs.writeFile(path.join(vault, "README.md"), ""); // 直下ファイル → パックでない
    const packs = await listTemplatePacksFs(vault);
    expect(packs).toEqual(["パックA"]);
  });

  it("存在しないフォルダは空配列（例外なし）", async () => {
    expect(await listTemplatePacksFs(path.join(vault, "ない"))).toEqual([]);
  });

  it("空文字フォルダは空配列", async () => {
    expect(await listTemplatePacksFs("")).toEqual([]);
  });
});

describe("readPackMetadataFs", () => {
  let vault: string;
  beforeEach(async () => {
    vault = await makeTempVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it("_mdtex: を読む", async () => {
    await writePack(vault, "P", { "defaults.yaml": META_OK });
    const meta = await readPackMetadataFs(vault, "P");
    expect(meta?.title).toBe("テストパック");
    expect(meta?.requires).toEqual(["extra.cls"]);
  });

  it("_mdtex: 無しは null", async () => {
    await writePack(vault, "P", { "defaults.yaml": "from: markdown\n" });
    expect(await readPackMetadataFs(vault, "P")).toBeNull();
  });

  it("defaults.yaml 無しは null", async () => {
    await fs.mkdir(path.join(vault, "P"));
    expect(await readPackMetadataFs(vault, "P")).toBeNull();
  });
});

describe("validatePackFs", () => {
  let vault: string;
  beforeEach(async () => {
    vault = await makeTempVault();
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it("全て揃っている → OK（errors/warnings 空）", async () => {
    await writePack(vault, "P", {
      "defaults.yaml": META_OK,
      "extra.cls": "% dummy class",
    });
    const v = await validatePackFs(vault, "P", false);
    expect(v.status).toBe("ok");
    expect(v.defaultsReadable).toBe(true);
    expect(v.hasMetadata).toBe(true);
    expect(v.missingRequires).toEqual([]);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it("requires 不足 → 警告（strict=false）", async () => {
    await writePack(vault, "P", { "defaults.yaml": META_OK }); // extra.cls 無し
    const v = await validatePackFs(vault, "P", false);
    expect(v.missingRequires).toEqual(["extra.cls"]);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual(["必須ファイル不足: extra.cls"]);
    expect(v.status).toBe("warnings");
  });

  it("requires 不足 + strict → エラー", async () => {
    await writePack(vault, "P", { "defaults.yaml": META_OK });
    const v = await validatePackFs(vault, "P", true);
    expect(v.errors).toEqual(["必須ファイル不足: extra.cls"]);
    expect(v.warnings).toEqual([]);
    expect(v.status).toBe("errors");
  });

  it("メタ未宣言 → 警告（strict=false）", async () => {
    await writePack(vault, "P", { "defaults.yaml": "from: markdown\n" });
    const v = await validatePackFs(vault, "P", false);
    expect(v.hasMetadata).toBe(false);
    expect(v.warnings.length).toBe(1);
    expect(v.warnings[0]).toContain("_mdtex");
    expect(v.status).toBe("warnings");
  });

  it("defaults.yaml 無し → エラー", async () => {
    await fs.mkdir(path.join(vault, "P"));
    const v = await validatePackFs(vault, "P", false);
    expect(v.defaultsReadable).toBe(false);
    expect(v.errors.length).toBe(1);
    expect(v.status).toBe("errors");
  });
});
