// File: src/cli/normalize.test.ts
// Purpose: normalizeForCli の検証。本文正規化パイプライン（stripObsidianComments +
//          expandTransclusions + detectDuplicateLabels）の統合を観測する。各ステップの
//          詳細は個別テストに委ね、ここでは「パイプラインが正しい順序・形状で結果を返す」
//          ことを検証する。expandTransclusions にはメモリ vault を注入する。
// Related: src/cli/normalize.ts, src/utils/stripObsidianComments.ts,
//          src/utils/crossrefLabels.ts, src/utils/transclusion.ts

import { describe, expect, it } from "vitest";
import { normalizeForCli } from "./normalize";
import type { VaultLike } from "../utils/vaultLike";

/** 空の vault（埋め込み無しのテスト用・何も解決しない）。 */
function emptyVault(): VaultLike {
  return { resolveLink: () => null, read: async () => null };
}

/** メモリ vault（files を解決するテスト用）。 */
function memVault(files: Record<string, string>): VaultLike {
  return {
    resolveLink(linkPath) {
      const found = Object.keys(files).find(p => {
        const base = p.slice(p.lastIndexOf("/") + 1);
        const baseNoExt = base.replace(/\.\w+$/, "");
        return (
          p === linkPath ||
          p === linkPath + ".md" ||
          p.endsWith("/" + linkPath) ||
          p.endsWith("/" + linkPath + ".md") ||
          baseNoExt === linkPath ||
          base === linkPath
        );
      });
      if (!found) return null;
      const dot = found.lastIndexOf(".");
      return { path: found, extension: dot >= 0 ? found.slice(dot + 1) : "" };
    },
    async read(filePath) {
      return files[filePath] ?? null;
    },
  };
}

describe("normalizeForCli", () => {
  it("Obsidian コメント (%% %%) を除去する", async () => {
    const result = await normalizeForCli("本文 %% 非表示コメント %% 続き", emptyVault(), "main.md");
    expect(result.content).not.toContain("非表示コメント");
    expect(result.content).toContain("本文");
    expect(result.content).toContain("続き");
  });

  it("crossref ラベルの重複を検出する", async () => {
    const md = "![[a.png]]{#fig:hoge}\n\n![[b.png]]{#fig:hoge}";
    const result = await normalizeForCli(md, emptyVault(), "main.md");
    expect(result.duplicateLabels).toEqual([{ label: "fig:hoge", count: 2 }]);
  });

  it("重複が無ければ空配列", async () => {
    const result = await normalizeForCli("普通の本文でラベルもない", emptyVault(), "main.md");
    expect(result.duplicateLabels).toEqual([]);
  });

  it("コメント無しの本文は content がそのまま（detectDuplicateLabels は content 不変）", async () => {
    const md = "![図](x.png){#fig:one}";
    const result = await normalizeForCli(md, emptyVault(), "main.md");
    expect(result.content).toBe(md);
  });

  it("![[link]] を vault 経由で展開する", async () => {
    const vault = memVault({ "sub.md": "## Sub content" });
    const result = await normalizeForCli("before\n![[sub]]\nafter", vault, "main.md");
    expect(result.content).toContain("## Sub content");
    expect(result.content).not.toContain("![[sub]]");
  });

  it("展開先のラベルはファイル名プレフィックスで別名になる（方式W・重複しない）", async () => {
    // メインは fig:hoge、埋め込み先は fig:sub-hoge にリライト → 同名でも衝突しない（方式W）
    const vault = memVault({ "sub.md": "![[x.png]]{#fig:hoge}" });
    const result = await normalizeForCli("![[y.png]]{#fig:hoge}\n\n![[sub]]", vault, "main.md");
    expect(result.content).toContain("{#fig:hoge}");
    expect(result.content).toContain("{#fig:sub-hoge}");
    expect(result.duplicateLabels).toEqual([]);
  });
});
