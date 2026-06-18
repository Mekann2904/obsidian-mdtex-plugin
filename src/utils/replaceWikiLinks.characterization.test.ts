// File: src/utils/replaceWikiLinks.characterization.test.ts
// Purpose: replaceWikiLinksAndCodeAsync の現状振る舞いを characterization test として録音する。
// Reason: AST 基盤化リファクタリング（ADR-005/006）の前提となる安全網。
//   ![[...]] 画像/Markdown埋め込みの解決と、LaTeX 属性組み立て（Q4-1/Q4-3 で将来簡素化対象）
//   を含む全分岐を網羄する。現状出力（バグ含む可能性）をそのまま固定し、Q4 リファクタリングで
//   「簡素化が意図通り進んだ」ことの証明として snapshot 書き換えを許容する。
// Related: src/utils/markdownTransforms.ts, docs/design-decisions.md (ADR-005/006), CONTEXT.md

import { describe, it, expect } from "vitest";
import { App, TFile, FileSystemAdapter } from "obsidian";
import { DEFAULT_PROFILE } from "../MdTexPluginSettings";
import { replaceWikiLinksAndCodeAsync } from "./markdownTransforms";
import type { ProfileSettings } from "../MdTexPluginSettings";

interface StubFile {
  path: string;       // vault 相対パス
  extension: string;
  content?: string;   // .md の場合の中身
}

// vaultBase を固定し、ファイル解決・読み込みをスタブ化する。
// adapter.getFullPath で vaultBase + path を返し、resolveLinkFile の3段階解決
// （getFirstLinkpathDest → getAbstractFileByPath → basename マッチ）を模倣する。
function makeStubApp(files: StubFile[], vaultBase = "/vault"): App {
  const byPath = new Map(files.map(f => [f.path, f]));
  const byBasenameLower = new Map<string, StubFile>();
  for (const f of files) {
    byBasenameLower.set(f.path.split("/").pop()!.toLowerCase(), f);
  }

  const app = new App();

  // resolveLinkFile の第1段階: getFirstLinkpathDest
  (app.metadataCache as unknown as { getFirstLinkpathDest: unknown }).getFirstLinkpathDest = (
    linktext: string,
  ) => {
    const bare = linktext.split("|")[0].split("#")[0].split("^")[0].trim();
    const lp = bare.toLowerCase();
    // 完全パス優先、次に basename（拡張子なし許容: "img" が "img.png" にマッチ）
    const hit =
      byPath.get(bare) ??
      (() => {
        const basename = lp.split("/").pop()!;
        return [...byBasenameLower.values()].find(f => {
          const fb = f.path.split("/").pop()!.toLowerCase();
          return fb === basename || fb.startsWith(basename + ".");
        });
      })();
    if (!hit) return null;
    const tf = new TFile(hit.path);
    (tf as unknown as { extension: string }).extension = hit.extension;
    return tf;
  };

  // resolveLinkFile の第2段階: getAbstractFileByPath（完全パス）
  (app.vault as unknown as { getAbstractFileByPath: unknown }).getAbstractFileByPath = (
    p: string,
  ) => {
    const hit = byPath.get(p);
    if (!hit) return null;
    const tf = new TFile(hit.path);
    (tf as unknown as { extension: string }).extension = hit.extension;
    return tf;
  };

  // resolveLinkFile の第3段階: getFiles（basename マッチ）
  (app.vault as unknown as { getFiles: unknown }).getFiles = () => {
    return files.map(f => {
      const tf = new TFile(f.path);
      (tf as unknown as { extension: string }).extension = f.extension;
      return tf;
    });
  };

  // readFileCached: vault.read
  (app.vault as unknown as { read: unknown }).read = async (file: TFile) => {
    const stub = byPath.get(file.path);
    if (!stub || stub.content === undefined) throw new Error(`stub miss: ${file.path}`);
    return stub.content;
  };

  // adapter: FileSystemAdapter（getBasePath / getFullPath）
  (app.vault as unknown as { adapter: unknown }).adapter = new FileSystemAdapter(vaultBase);

  return app;
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
      new Map(),
    );
    expect(out).toMatchInlineSnapshot(`"before ![ ](assets/img.png){width=0.8\\textwidth} after"`);
  });

  it("V2: pipe キャプション ![[img.png|cap]]", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("![[img.png|図1]]", app, profile(), "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"![図1](assets/img.png){width=0.8\\textwidth}"`);
  });

  it("V3: 角括弧キャプション ![[img.png]][cap]", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("![[img.png]][Figure 1]", app, profile(), "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"![Figure 1](assets/img.png){width=0.8\\textwidth}"`);
  });

  it("V4: ラベル ![[img.png]]{#lbl} に fig: 接頭辞を付与", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("![[img.png]]{#demo}", app, profile(), "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"![ ](assets/img.png){#fig:demo width=0.8\\textwidth}"`);
  });

  it("V5: ラベル fig: 付きは重複付与しない", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("![[img.png]]{#fig:demo}", app, profile(), "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"![ ](assets/img.png){#fig:demo width=0.8\\textwidth}"`);
  });

  it("V6: キャプション + ラベル併用（separator が入る）", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync(
      "![[img.png|タイトル]]{#lbl}",
      app,
      profile({ imageScale: "0.5" }),
      "src.md",
      new Map(),
    );
    expect(out).toMatchInlineSnapshot(`"![タイトル](assets/img.png){#fig:lbl 0.5}"`);
  });

  // ===== W. パス解決 =====

  it("W1: vault 内パスは vault 相対へ", async () => {
    const app = makeStubApp([{ path: "assets/img.png", extension: "png" }], "/vault");
    const out = await replaceWikiLinksAndCodeAsync("![[img.png]]", app, profile(), "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"![ ](assets/img.png){width=0.8\\textwidth}"`);
  });

  it("W3: 解決失敗はそのまま残す", async () => {
    const app = makeStubApp([]);
    const out = await replaceWikiLinksAndCodeAsync("![[missing.png]]", app, profile(), "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"![[missing.png]]"`);
  });

  // ===== X. Markdown 埋め込み =====

  it("X1: ![[note.md]] は中身を再帰展開する", async () => {
    const app = makeStubApp([
      { path: "note.md", extension: "md", content: "# Title\nbody" },
    ]);
    const out = await replaceWikiLinksAndCodeAsync("![[note.md]]", app, profile(), "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`
      "# Title
      body"
    `);
  });

  it("X2: 埋め込み読み込み失敗はフォールバックリンクへ", async () => {
    // read が例外を投ぐスタブ（content 未設定）
    const app = makeStubApp([{ path: "note.md", extension: "md" }]);
    const out = await replaceWikiLinksAndCodeAsync(
      "![[note.md|参照名]]",
      app,
      profile(),
      "src.md",
      new Map(),
    );
    expect(out).toMatchInlineSnapshot(`"[参照名](note.md)"`);
  });

  // ===== Y. 引用内 =====

  it("Y1: > ![[img.png]] は引用プレフィックス付き標準画像記法", async () => {
    // 従来は引用内画像を別扱い（width=100% デフォルト）していたが、imageScale デフォルト値の
    // 存在でデッドコード化しておりコメントと不一致だったため廃止（ADR-005）。
    // 現在は引用の有無にかかわらず一律の標準記法。applyBlockquotePrefix が > を行ごとに付与。
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("> ![[img.png]]", app, profile(), "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"> ![ ](img.png){width=0.8\\textwidth}"`);
  });

  it("Y2: inBlockquote=true でも画像は引用分岐せず一律の標準記法", async () => {
    // inBlockquote は .md 埋め込み再帰の引用継承用。画像ブランチでは効かない（統一記法）。
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync(
      "![[img.png]]",
      app,
      profile({ imageScale: "0.5" }),
      "src.md",
      new Map(),
      true,
    );
    expect(out).toMatchInlineSnapshot(`"![ ](img.png){0.5}"`);
  });

  it("Y3: ネスト引用 >> ![[img.png]]", async () => {
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync(">> ![[img.png]]", app, profile(), "src.md", new Map());
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
      new Map(),
    );
    expect(out).toMatchInlineSnapshot(`"![ ](img.png){0.75}"`);
  });

  it("Z2: scale 設定なし", async () => {
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("![[img.png]]", app, profile(), "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"![ ](img.png){width=0.8\\textwidth}"`);
  });

  // ===== AA. フェンス保護 =====

  it("AA1: コードフェンスはパススルー", async () => {
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const md = "```\ncode\n```";
    const out = await replaceWikiLinksAndCodeAsync(md, app, profile(), "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`
      "\`\`\`
      code
      \`\`\`"
    `);
  });

  it("AA2: コードフェンス内の ![[...]] は保護される（最左最長マッチ）", async () => {
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const md = "```\n![[img.png]]\n```";
    const out = await replaceWikiLinksAndCodeAsync(md, app, profile(), "src.md", new Map());
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
    const out = await replaceWikiLinksAndCodeAsync("![[a.png]] and ![[b.png]]", app, profile(), "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"![ ](a.png){width=0.8\\textwidth} and ![ ](b.png){width=0.8\\textwidth}"`);
  });

  it("AB2: キャプション・ラベルともに無い画像（captionPart=空白）", async () => {
    const app = makeStubApp([{ path: "img.png", extension: "png" }]);
    const out = await replaceWikiLinksAndCodeAsync("![[img.png]]", app, profile(), "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"![ ](img.png){width=0.8\\textwidth}"`);
  });
});
