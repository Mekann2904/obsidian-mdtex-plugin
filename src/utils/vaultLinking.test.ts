// File: src/utils/vaultLinking.test.ts
// Purpose: resolveLinkPath（リンク解決の正規実装）の直接検証。fsVault 経由のテストと重複
//          するが、本関数が生産と test fake の単一の真実源であるため専用に錨付けする。
// Related: src/utils/vaultLinking.ts, src/cli/fsVault.ts

import { describe, expect, it } from "vitest";
import { resolveLinkPath, basenameOf, extensionOf } from "./vaultLinking";

describe("resolveLinkPath", () => {
  it("拡張子省略リンクを解決する", () => {
    expect(resolveLinkPath(["sub.md", "main.md"], "sub", "main.md")).toBe("sub.md");
  });

  it("sourcePath 相対で同階層を優先する（大域 shortest-path より）", () => {
    expect(resolveLinkPath(["sub.md", "folder/main.md", "folder/sub.md"], "sub", "folder/main.md")).toBe(
      "folder/sub.md",
    );
  });

  it("./ と ../ の相対リンクを解決する", () => {
    expect(resolveLinkPath(["folder/main.md", "folder/sub.md"], "./sub", "folder/main.md")).toBe(
      "folder/sub.md",
    );
    expect(resolveLinkPath(["parent.md", "folder/main.md"], "../parent", "folder/main.md")).toBe(
      "parent.md",
    );
  });

  it("vault ルートより上への .. は解決せずフォールバック", () => {
    expect(resolveLinkPath(["main.md"], "../outside", "main.md")).toBeNull();
  });

  it("同名ノートは shortest-path（浅い階層・同階層は辞書順）", () => {
    expect(resolveLinkPath(["a/a.md", "b/a.md", "b/c/a.md"], "a", "main.md")).toBe("a/a.md");
  });

  it("未解決は null", () => {
    expect(resolveLinkPath(["main.md"], "missing", "main.md")).toBeNull();
  });
});

describe("basenameOf / extensionOf", () => {
  it("basename と拡張子を取り出す", () => {
    expect(basenameOf("a/b/c.md")).toBe("c.md");
    expect(extensionOf("a/b/c.md")).toBe("md");
    expect(extensionOf("archive.tar.gz")).toBe("gz"); // 最後の . 以降
    expect(extensionOf("Makefile")).toBe(""); // ドット無し
  });
});
