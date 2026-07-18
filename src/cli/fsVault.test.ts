// File: src/cli/fsVault.test.ts
// Purpose: makeFsVault（CLI 版 VaultLike）の検証。tmp ディレクトリでファイル配置を作り、
//          resolveLink（拡張子省略・shortest-path）と read を観測する。
//          プロトタイプ（src/cli/prototype/vaultlike.test.ts）のメモリ版と同じ期待を fs で。
// Related: src/cli/fsVault.ts, src/utils/vaultLike.ts

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { makeFsVault } from "./fsVault";

describe("makeFsVault", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-fsvault-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function write(rel: string, content: string): Promise<void> {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }

  it("単純リンク sub を sub.md に解決し、本文を読む", async () => {
    await write("sub.md", "# Sub");
    await write("main.md", "main");
    const vault = await makeFsVault(dir);
    const resolved = vault.resolveLink("sub", "main.md");
    expect(resolved?.path).toBe("sub.md");
    expect(resolved?.extension).toBe("md");
    expect(await vault.read("sub.md")).toBe("# Sub");
  });

  it("サブフォルダ folder/note を解決する", async () => {
    await write("folder/note.md", "deep note");
    const vault = await makeFsVault(dir);
    expect(vault.resolveLink("folder/note", "main.md")?.path).toBe("folder/note.md");
  });

  it("同名ノートは shortest-path（浅い階層・同階層は辞書順）を解決する", async () => {
    await write("a/a.md", "shallow");
    await write("b/a.md", "deep");
    await write("b/c/a.md", "deepest");
    const vault = await makeFsVault(dir);
    expect(vault.resolveLink("a", "main.md")?.path).toBe("a/a.md");
  });

  it("非 .md（画像）の extension を返す", async () => {
    await write("img.png", "BIN");
    const vault = await makeFsVault(dir);
    expect(vault.resolveLink("img.png", "main.md")?.extension).toBe("png");
  });

  it("未解決は null を返す", async () => {
    await write("main.md", "main");
    const vault = await makeFsVault(dir);
    expect(vault.resolveLink("missing", "main.md")).toBeNull();
  });

  it("read 失敗は null（throw しない）", async () => {
    const vault = await makeFsVault(dir);
    expect(await vault.read("nonexistent.md")).toBeNull();
  });

  it("拡張子付きリンク ![[sub.md]] も解決する", async () => {
    await write("sub.md", "content");
    const vault = await makeFsVault(dir);
    expect(vault.resolveLink("sub.md", "main.md")?.path).toBe("sub.md");
  });

  // --- sourcePath 相対解決（Obsidian の getFirstLinkpathDest 挙動の近似）---

  it("sourcePath 相対で同階層のノートを優先する（大域 shortest-path より優先）", async () => {
    // root の sub.md（depth 1）より、埋め込み元と同階層の folder/sub.md を優先
    await write("sub.md", "shallow but unrelated");
    await write("folder/main.md", "main");
    await write("folder/sub.md", "sibling");
    const vault = await makeFsVault(dir);
    expect(vault.resolveLink("sub", "folder/main.md")?.path).toBe("folder/sub.md");
  });

  it("./ 明示的相対リンクを解決する", async () => {
    await write("folder/main.md", "m");
    await write("folder/sub.md", "s");
    const vault = await makeFsVault(dir);
    expect(vault.resolveLink("./sub", "folder/main.md")?.path).toBe("folder/sub.md");
  });

  it(".. 親ディレクトリへの相対リンクを解決する", async () => {
    await write("parent.md", "p");
    await write("folder/main.md", "m");
    const vault = await makeFsVault(dir);
    expect(vault.resolveLink("../parent", "folder/main.md")?.path).toBe("parent.md");
  });

  it("vault ルートより上への .. は解決せずフォールバック", async () => {
    // sourcePath がルート直下なら ../x は vault 外 → null → 大域マッチも無ければ null
    await write("main.md", "m");
    const vault = await makeFsVault(dir);
    expect(vault.resolveLink("../outside", "main.md")).toBeNull();
  });
});
