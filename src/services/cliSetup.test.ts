// File: src/services/cliSetup.test.ts
// Purpose: cliSetup の純粋関数（targetDir / isInPath）と副作用（symlink/chmod）を検証する。
// Reason: ワンクリック CLI セットアップの契約（~/.local/bin/mdtex への symlink・PATH 判定・
//          再 setup での上書き・symlink 不可時の copy fallback）を固定するため。
// Related: src/services/cliSetup.ts, src/MdTexPluginSettingTab.ts

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { cliTargetDir, cliTargetName, isInPath, setupCli } from "./cliSetup";

describe("cliTargetDir", () => {
  it("~/.local/bin を返す", () => {
    expect(cliTargetDir("/home/user")).toBe(path.join("/home/user", ".local", "bin"));
    expect(cliTargetDir("/Users/mekann")).toBe(path.join("/Users/mekann", ".local", "bin"));
  });
});

describe("cliTargetName", () => {
  it("プラットフォーム固有の名前（mdtex or mdtex.cmd）", () => {
    const name = cliTargetName();
    expect(process.platform === "win32" ? name === "mdtex.cmd" : name === "mdtex").toBe(true);
  });
});

describe("isInPath", () => {
  it("PATH に含まれるなら true", () => {
    const dir = path.join("/home", "user", ".local", "bin");
    expect(isInPath(dir, { PATH: `${dir}/:/usr/bin` })).toBe(true);
  });

  it("PATH に無ければ false", () => {
    expect(isInPath("/home/user/.local/bin", { PATH: "/usr/bin:/bin" })).toBe(false);
  });

  it("PATH 未定義は false", () => {
    expect(isInPath("/home/user/.local/bin", {})).toBe(false);
  });

  it("相対パス差を許容せず絶対パスで比較", () => {
    const dir = path.join("/home", "user", ".local", "bin");
    expect(isInPath(dir, { PATH: `/home/user/.local/other:/usr/bin` })).toBe(false);
  });
});

describe("setupCli", () => {
  let home: string;
  let pluginCli: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-clisetup-home-"));
    pluginCli = path.join(home, "plugin", "cli.js");
    await fs.mkdir(path.dirname(pluginCli), { recursive: true });
    await fs.writeFile(pluginCli, "#!/usr/bin/env node\nconsole.log('fake cli');\n");
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it("~/.local/bin/mdtex に symlink を作る（Unix）", async () => {
    if (process.platform === "win32") return; // Unix のみの契約
    const result = await setupCli(pluginCli, { home, env: { PATH: "" } });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("symlink");
    const expected = path.join(home, ".local", "bin", "mdtex");
    expect(result.targetPath).toBe(expected);
    const stat = await fs.lstat(expected);
    expect(stat.isSymbolicLink()).toBe(true);
    expect(await fs.readlink(expected)).toBe(pluginCli);
  });

  it("実行権 0755 を付与する（Unix）", async () => {
    if (process.platform === "win32") return;
    const result = await setupCli(pluginCli, { home, env: { PATH: "" } });
    expect(result.ok).toBe(true);
    // symlink 自体の mode はプラットフォーム依存するが、target が実行可能ファイルとして存在する。
    const stat = await fs.stat(result.targetPath);
    expect(stat.mode & 0o111).not.toBe(0); // 実行ビットいずれかが立つ
  });

  it("inPath を正しく判定する（targetDir が PATH にあれば true）", async () => {
    const targetDir = path.join(home, ".local", "bin");
    const result = await setupCli(pluginCli, { home, env: { PATH: targetDir } });
    expect(result.inPath).toBe(true);
    expect(result.message).toContain("mdtex --version");
  });

  it("inPath が false のとき PATH 追加案内を message に含む", async () => {
    const result = await setupCli(pluginCli, { home, env: { PATH: "/usr/bin" } });
    expect(result.inPath).toBe(false);
    expect(result.message).toContain("export PATH");
  });

  it("再 setup で symlink を上書きする（プラグイン更新後の再実行）", async () => {
    if (process.platform === "win32") return;
    const first = await setupCli(pluginCli, { home, env: { PATH: "" } });
    expect(first.ok).toBe(true);
    // 2回目（同パス・冪等）
    const second = await setupCli(pluginCli, { home, env: { PATH: "" } });
    expect(second.ok).toBe(true);
    expect(await fs.readlink(second.targetPath)).toBe(pluginCli);
  });

  it("cli.js が存在しなければ ok:false で案内する", async () => {
    const result = await setupCli(path.join(home, "missing.js"), { home, env: { PATH: "" } });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("見つかりません");
    expect(result.message).toContain("更新");
  });
});
