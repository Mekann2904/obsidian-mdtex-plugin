// File: src/utils/replaceWikiLinks.characterization.test.ts
// Purpose: replaceWikiLinksAndCodeAsync の現状振る舞いを characterization test として録音する。
// Reason: AST 基盤化リファクタリング（ADR-005/006）の前提となる安全網。
//   ![[...]] 画像/Markdown埋め込みの解決と、LaTeX 属性組み立て（Q4-1/Q4-3 で将来簡素化対象）
//   を含む全分岐を網羄する。現状出力（バグ含む可能性）をそのまま固定し、Q4 リファクタリングで
//   「簡素化が意図通り進んだ」ことの証明として snapshot 書き換えを許容する。
// Related: src/utils/markdownTransforms.ts, docs/design-decisions.md (ADR-005/006), CONTEXT.md

import { describe, it, expect } from "vitest";
import type { VaultLike } from "./vaultLike";
import { resolveLinkPath, extensionOf } from "./vaultLinking";
import { DEFAULT_PROFILE } from "../MdTexPluginSettings";
import { replaceWikiLinksAndCodeAsync } from "./markdownTransforms";
import type { ProfileSettings } from "../MdTexPluginSettings";

interface StubFile {
  path: string;       // vault 相対パス
  extension: string;
  content?: string;   // .md の場合の中身
}

// expandTransclusions と同じく、replaceWikiLinksAndCodeAsync は obsidian 非依存（VaultLike 注入）。
// stub は VaultLike を返す。変数名 app は呼び出し側の互換のため残す（実体は VaultLike）。
function makeStubApp(files: StubFile[], _vaultBase = "/vault"): VaultLike {
  const paths = files.map(f => f.path);
  return {
    resolveLink(linktext: string, sourcePath: string) {
      const bare = linktext.split("|")[0].split("#")[0].split("^")[0].trim();
      // リンク解決の正規実装（vaultLinking）に委譲。拡張子は path から導出。
      const p = resolveLinkPath(paths, bare, sourcePath);
      return p ? { path: p, extension: extensionOf(p) } : null;
    },
    async read() {
      return null;
    },
  };
}

function profile(overrides: Partial<ProfileSettings> = {}): ProfileSettings {
  return { ...DEFAULT_PROFILE, ...overrides };
}

describe("replaceWikiLinksAndCodeAsync: characterization（現状振る舞いの録音）", () => {
  // ===== V. 画像基本 =====

  it("V1: 単純画像 ![[img.png]] をパス解決して標準画像記法へ", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync(
      "before ![[img.png]] after",
      app,
      profile(),
      "src.md",
    );
    expect(out).toMatchInlineSnapshot(`"before ![ ](assets/img.png){width=0.8\\textwidth} after"`);
  });

  it("V2: pipe キャプション ![[img.png|cap]]", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("![[img.png|図1]]", app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`"![図1](assets/img.png){width=0.8\\textwidth}"`);
  });

  it("V3: 角括弧キャプション ![[img.png]][cap]", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("![[img.png]][Figure 1]", app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`"![Figure 1](assets/img.png){width=0.8\\textwidth}"`);
  });

  it("V4: ラベル ![[img.png]]{#lbl} に fig: 接頭辞を付与", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("![[img.png]]{#demo}", app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`"![ ](assets/img.png){#fig:demo width=0.8\\textwidth}"`);
  });

  it("V5: ラベル fig: 付きは重複付与しない", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("![[img.png]]{#fig:demo}", app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`"![ ](assets/img.png){#fig:demo width=0.8\\textwidth}"`);
  });

  it("V6: キャプション + ラベル併用（separator が入る）", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync(
      "![[img.png|タイトル]]{#lbl}",
      app,
      profile({ imageScale: "0.5" }),
      "src.md",
    );
    expect(out).toMatchInlineSnapshot(`"![タイトル](assets/img.png){#fig:lbl 0.5}"`);
  });

  // ===== W. パス解決 =====

  it("W1: vault 内パスは vault 相対へ", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }], "/vault");
    const out = await replaceWikiLinksAndCodeAsync("![[img.png]]", app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`"![ ](assets/img.png){width=0.8\\textwidth}"`);
  });

  it("W3: 解決失敗はそのまま残す", async () => {
    const app = makeStubApp([]);
    const out = await replaceWikiLinksAndCodeAsync("![[missing.png]]", app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`"![[missing.png]]"`);
  });

  // ===== X. Markdown 埋め込み =====

  it("X1: ![[note.md]] は未処理で残す（トランスクルージョンは expandTransclusions に委譲）", async () => {
    // Q5-1: .md 埋め込みの再帰展開は transclusion.ts の expandTransclusions に集約し、
    // この関数では扱わない。実パイプラインでは上位の expandTransclusions が先に展開済み
    // なので、ここへ .md が来ることは原理上ない。万が一残っていた場合は元の記法を残して
    // expandTransclusions の漏れを目立たせる（黙って誤展開しない）。
    const app = makeStubApp([
      { path: "note.md", extension: "md", content: "# Title\nbody" },
    ]);
    const out = await replaceWikiLinksAndCodeAsync("![[note.md]]", app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`"![[note.md]]"`);
  });

  it("X2: .md は未処理で残す（キャプション/alias付きも含む）", async () => {
    // X1 と同じ理由。フォールバック展開も .md 再帰も行わない。
    const app = makeStubApp([{ path: "note.md", extension: "md" }]);
    const out = await replaceWikiLinksAndCodeAsync(
      "![[note.md|参照名]]",
      app,
      profile(),
      "src.md",
    );
    expect(out).toMatchInlineSnapshot(`"![[note.md|参照名]]"`);
  });

  // ===== Y. 引用内 =====

  it("Y1: > ![[img.png]] は引用プレフィックス付き標準画像記法", async () => {
    // 従来は引用内画像を別扱い（width=100% デフォルト）していたが、imageScale デフォルト値の
    // 存在でデッドコード化しておりコメントと不一致だったため廃止（ADR-005）。
    // 現在は引用の有無にかかわらず一律の標準記法。applyBlockquotePrefix が > を行ごとに付与。
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("> ![[img.png]]", app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`"> ![ ](img.png){width=0.8\\textwidth}"`);
  });

  it("Y3: ネスト引用 >> ![[img.png]]", async () => {
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync(">> ![[img.png]]", app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`">> ![ ](img.png){width=0.8\\textwidth}"`);
  });

  // ===== Z. imageScale =====

  it("Z1: scale 設定ありで画像に scale が付く", async () => {
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync(
      "![[img.png]]",
      app,
      profile({ imageScale: "0.75" }),
      "src.md",
    );
    expect(out).toMatchInlineSnapshot(`"![ ](img.png){0.75}"`);
  });

  it("Z2: scale 設定なし", async () => {
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("![[img.png]]", app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`"![ ](img.png){width=0.8\\textwidth}"`);
  });

  // ===== AA. フェンス保護 =====

  it("AA1: コードフェンスはパススルー", async () => {
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const md = "```\ncode\n```";
    const out = await replaceWikiLinksAndCodeAsync(md, app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`
      "\`\`\`
      code
      \`\`\`"
    `);
  });

  it("AA2: コードフェンス内の ![[...]] は保護される（最左最長マッチ）", async () => {
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const md = "```\n![[img.png]]\n```";
    const out = await replaceWikiLinksAndCodeAsync(md, app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`
      "\`\`\`
      ![[img.png]]
      \`\`\`"
    `);
  });

  // ===== AB. 境界 =====

  it("AB1: 同行に複数画像", async () => {
    const app = makeStubApp([
      { path: "a.png", extension: "png" },
      { path: "b.png", extension: "png" },
    ]);
    const out = await replaceWikiLinksAndCodeAsync("![[a.png]] and ![[b.png]]", app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`"![ ](a.png){width=0.8\\textwidth} and ![ ](b.png){width=0.8\\textwidth}"`);
  });

  it("AB2: キャプション・ラベルともに無い画像（captionPart=空白）", async () => {
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("![[img.png]]", app, profile(), "src.md");
    expect(out).toMatchInlineSnapshot(`"![ ](img.png){width=0.8\\textwidth}"`);
  });
});
