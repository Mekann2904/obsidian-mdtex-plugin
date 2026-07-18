// File: src/cli/normalize.test.ts
// Purpose: 共有 normalizeMarkdown パイプライン（stripObsidianComments +
//          expandTransclusions + unwrapValidWikiLinks + replaceWikiLinksAndCodeAsync +
//          detectDuplicateLabels）の統合を観測する。各ステップの詳細は個別テストに委ね、
//          ここでは「パイプラインが正しい順序・形状で結果を返す」ことを検証する。
//          thermo-nuclear review #1: CLI 専用パイプライン（normalizeForCli）は廃止され、
//          GUI と同じ normalizeMarkdown を CLI も呼ぶようになったため、本テストは
//          normalizeMarkdown を直接（fsVault 相当の memVault で）駆動する。
// Related: src/services/normalizeMarkdown.ts, src/cli/normalize.ts,
//          src/utils/{stripObsidianComments,crossrefLabels,transclusion,markdownTransforms}.ts

import { describe, expect, it } from "vitest";
import { normalizeMarkdown } from "../services/normalizeMarkdown";
import type { VaultLike, ProfileLike } from "../utils/vaultLike";
import { resolveLinkPath, extensionOf } from "../utils/vaultLinking";

/** 空の vault（埋め込み無しのテスト用・何も解決しない）。 */
function emptyVault(): VaultLike {
  return { resolveLink: () => null, read: async () => null };
}

/** メモリ vault（files を解決するテスト用）。リンク解決は正規実装（vaultLinking）に委譲。 */
function memVault(files: Record<string, string>): VaultLike {
  const paths = Object.keys(files);
  return {
    resolveLink(linkPath, sourcePath) {
      const p = resolveLinkPath(paths, linkPath, sourcePath);
      return p ? { path: p, extension: extensionOf(p) } : null;
    },
    async read(filePath) {
      return files[filePath] ?? null;
    },
  };
}

/**
 * normalizeMarkdown を CLI と同じ依存構成（lint/mermaid/draft なし）で呼ぶ薄い wrapper。
 * GUI も CLI も通る正規化パイプラインの順序・形状を、obsidian 非依存の memVault で検証する。
 */
async function runNormalize(
  content: string,
  vault: VaultLike,
  profile: ProfileLike,
  sourcePath: string,
) {
  return normalizeMarkdown({
    content,
    vault,
    sourcePath,
    // CLI 構成: profile だけ渡し、rasterizeMermaid / lint / pandocExtraArgs は省略 → 該当ステップがスキップされる。
    profile,
  });
}

const noProfile: ProfileLike = {};

describe("normalizeMarkdown via CLI-style config", () => {
  it("Obsidian コメント (%% %%) を除去する", async () => {
    const result = await runNormalize("本文 %% 非表示コメント %% 続き", emptyVault(), noProfile, "main.md");
    expect(result.content).not.toContain("非表示コメント");
    expect(result.content).toContain("本文");
    expect(result.content).toContain("続き");
  });

  it("crossref ラベルの重複を検出する", async () => {
    const md = "![[a.png]]{#fig:hoge}\n\n![[b.png]]{#fig:hoge}";
    const result = await runNormalize(md, emptyVault(), noProfile, "main.md");
    expect(result.duplicateLabels).toEqual([{ label: "fig:hoge", count: 2 }]);
  });

  it("重複が無ければ空配列", async () => {
    const result = await runNormalize("普通の本文でラベルもない", emptyVault(), noProfile, "main.md");
    expect(result.duplicateLabels).toEqual([]);
  });

  it("![[link]] を vault 経由で展開する", async () => {
    const vault = memVault({ "sub.md": "## Sub content" });
    const result = await runNormalize("before\n![[sub]]\nafter", vault, noProfile, "main.md");
    expect(result.content).toContain("## Sub content");
    expect(result.content).not.toContain("![[sub]]");
  });

  it("展開先のラベルはファイル名プレフィックスで別名になる（方式W・重複しない）", async () => {
    const vault = memVault({ "sub.md": "![[x.png]]{#fig:hoge}" });
    const result = await runNormalize("![[y.png]]{#fig:hoge}\n\n![[sub]]", vault, noProfile, "main.md");
    expect(result.content).toContain("{#fig:hoge}");
    expect(result.content).toContain("{#fig:sub-hoge}");
    expect(result.duplicateLabels).toEqual([]);
  });

  it("有効な [[WikiLink]] のブラケットを除去する", async () => {
    const vault = memVault({ "note.md": "# Note" });
    const result = await runNormalize("see [[note]] here", vault, noProfile, "main.md");
    expect(result.content).toContain("see note here");
    expect(result.content).not.toContain("[[note]]");
  });

  it("![[image.png]] を標準画像記法に変換し profile.imageScale を適用する", async () => {
    const vault = memVault({ "img.png": "" });
    const result = await runNormalize(
      "text ![[img.png]] end",
      vault,
      { imageScale: "width=0.5\\textwidth" },
      "main.md",
    );
    expect(result.content).toContain("![ ](img.png){width=0.5\\textwidth}");
    expect(result.content).not.toContain("![[img.png]]");
  });
});
