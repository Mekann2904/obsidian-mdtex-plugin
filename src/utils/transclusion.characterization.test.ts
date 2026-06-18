// File: src/utils/transclusion.characterization.test.ts
// Purpose: extractSection / expandTransclusions の現状振る舞いを characterization test として録音する。
// Reason: AST 基盤化リファクタリング（ADR-005/006）の前提となる安全網。
//   Q5-2 の合意に基づき、expandTransclusions の FS 読込は注入可能なインターフェースへ
//   抽象化してからテストする。本ファイルではまず純粋関数 extractSection を完全網羅し、
//   次に expandTransclusions をスタブ化した App で録音する。
// Related: src/utils/transclusion.ts, docs/design-decisions.md (ADR-005/006), CONTEXT.md

import { describe, it, expect } from "vitest";
import { App, TFile } from "obsidian";
import { expandTransclusions } from "./transclusion";

// extractSection は export されていないため、expandTransclusions 経由で観測する。
// 純粋関数として直接テストしたい場合は後続のリファクタリング（Q5-2 の抽象化）で
// export を整える。本ファイルでは現状の public API の振る舞いを録音する。

// ---- テスト用スタブ App の構築 ----

interface StubFile {
  path: string;
  extension: string;
  content: string;
}

function makeStubApp(files: StubFile[], sourcePath = "src.md"): App {
  const byPath = new Map(files.map(f => [f.path, f]));
  const byBasename = new Map<string, StubFile>();
  for (const f of files) {
    byBasename.set(f.path.split("/").pop()!.toLowerCase(), f);
  }

  const app = new App();
  // getFirstLinkpathDest(linktext, sourcePath): linktext から TFile インスタンスを返す
  // instanceof TFile チェックを通すため、ダミーオブジェクトではなく new TFile() で生成する。
  (app.metadataCache as unknown as { getFirstLinkpathDest: unknown }).getFirstLinkpathDest = (
    linktext: string,
  ) => {
    const [pathPart] = linktext.split("|");
    const bare = pathPart.split("#")[0].split("^")[0].trim();
    // 完全パス優先、次に basename
    const hit = byPath.get(bare) ?? byBasename.get(bare.split("/").pop()!.toLowerCase());
    if (!hit) return null;
    // extension は TFile のプロパティにはないが、テスト用に付与する。
    // 本物の TFile は metadataCache 経由で extension を解決するが、モックでは直接持たせる。
    const tf = new TFile(hit.path);
    (tf as unknown as { extension: string }).extension = hit.extension;
    return tf;
  };
  (app.vault as unknown as { read: unknown }).read = async (file: TFile) => {
    const stub = byPath.get(file.path);
    if (!stub) throw new Error(`stub miss: ${file.path}`);
    return stub.content;
  };
  return app;
}

describe("expandTransclusions / extractSection: characterization（現状振る舞いの録音）", () => {
  // ===== J. 基本 =====

  it("J1: 単純 .md 埋め込みを展開する", async () => {
    const app = makeStubApp([
      { path: "src.md", extension: "md", content: "# Src\nbefore\n![[target.md]]\nafter" },
      { path: "target.md", extension: "md", content: "# Target\nembedded content" },
    ]);
    const out = await expandTransclusions(
      "# Src\nbefore\n![[target.md]]\nafter",
      app,
      "src.md",
      new Map(),
    );
    expect(out).toMatchInlineSnapshot(`
      "# Src
      before
      # Target
      embedded content
      after"
    `);
  });

  it("J2: 画像（.png）は未展開で残す", async () => {
    const app = makeStubApp([
      { path: "src.md", extension: "md", content: "text" },
      { path: "img.png", extension: "png", content: "" },
    ]);
    const out = await expandTransclusions("before ![[img.png]] after", app, "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"before ![[img.png]] after"`);
  });

  it("J3: 存在しないファイルはそのまま残す", async () => {
    const app = makeStubApp([{ path: "src.md", extension: "md", content: "text" }]);
    const out = await expandTransclusions("x ![[missing.md]] y", app, "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"x ![[missing.md]] y"`);
  });

  // ===== K. 循環・深度 =====

  it("K1: 自己参照を検出して空にする", async () => {
    const app = makeStubApp([
      { path: "src.md", extension: "md", content: "self ![[src.md]] end" },
    ]);
    const out = await expandTransclusions("self ![[src.md]] end", app, "src.md", new Map());
    expect(out).toMatchInlineSnapshot(`"self self  end end"`);
  });

  it("K2: 相互参照（A→B→A）で循環を検出する", async () => {
    const app = makeStubApp([
      { path: "a.md", extension: "md", content: "A ![[b.md]] A" },
      { path: "b.md", extension: "md", content: "B ![[a.md]] B" },
    ]);
    const out = await expandTransclusions("![[a.md]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`"A B  B A"`);
  });

  it("K3: ダイヤモンド参照（A→B,C / B→D / C→D）で D は2回展開される", async () => {
    const app = makeStubApp([
      { path: "a.md", extension: "md", content: "A1 ![[b.md]] A2 ![[c.md]] A3" },
      { path: "b.md", extension: "md", content: "B ![[d.md]]" },
      { path: "c.md", extension: "md", content: "C ![[d.md]]" },
      { path: "d.md", extension: "md", content: "D" },
    ]);
    const out = await expandTransclusions("![[a.md]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`"A1 B D A2 C D A3"`);
  });

  // ===== L. セクション抽出（extractSection 経由観測）=====

  it("L1: ![[note#heading]] で見出しセクションを抽出する", async () => {
    const app = makeStubApp([
      {
        path: "note.md",
        extension: "md",
        content: "# Title\nintro\n\n## Target\nwanted\n\n## Other\nunwanted",
      },
    ]);
    const out = await expandTransclusions("![[note.md#Target]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`"wanted"`);
  });

  it("L2: ![[note^blockId]] でブロックを抽出する", async () => {
    const app = makeStubApp([
      {
        path: "note.md",
        extension: "md",
        content: "line before\nwanted line ^myblock\nline after",
      },
    ]);
    const out = await expandTransclusions("![[note.md^myblock]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`"wanted line"`);
  });

  it("L3: 存在しない heading は空になる", async () => {
    const app = makeStubApp([{ path: "note.md", extension: "md", content: "# Real\nbody" }]);
    const out = await expandTransclusions("![[note.md#Missing]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`""`);
  });

  it("L4: heading 抽出でより深い見出しは含む（同レベルで切る）", async () => {
    const app = makeStubApp([
      {
        path: "note.md",
        extension: "md",
        content:
          "# H1\nh1body\n\n## Target\nwanted\n\n### Deeper\nalso wanted\n\n## Sibling\nnot wanted",
      },
    ]);
    const out = await expandTransclusions("![[note.md#Target]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`
      "wanted

      ### Deeper
      also wanted"
    `);
  });

  it("L5: heading 抽出で文書末尾まで（終了見出しなし）", async () => {
    const app = makeStubApp([
      {
        path: "note.md",
        extension: "md",
        content: "# First\nbefore\n\n## Last\nall the rest\nno end",
      },
    ]);
    const out = await expandTransclusions("![[note.md#Last]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`
      "all the rest
      no end"
    `);
  });

  it("L6: heading 名に正規表現メタ文字（escapeRegExp 効果）", async () => {
    const app = makeStubApp([
      {
        path: "note.md",
        extension: "md",
        content: "# A.B\nwanted\n\n# Other\nnot",
      },
    ]);
    const out = await expandTransclusions("![[note.md#A.B]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`"wanted"`);
  });

  // ===== M. 引用プレフィックス伝播 =====

  it("M1: > ![[note]] で展開内容に引用プレフィックスを伝播する", async () => {
    const app = makeStubApp([
      { path: "note.md", extension: "md", content: "line1\nline2" },
    ]);
    const out = await expandTransclusions("> ![[note.md]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`
      "> line1
      > line2"
    `);
  });

  it("M2: ネスト引用 >> ![[note]]", async () => {
    const app = makeStubApp([
      { path: "note.md", extension: "md", content: "deep content" },
    ]);
    const out = await expandTransclusions(">> ![[note.md]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`">> deep content"`);
  });

  it("M3: 行頭以外の前置テキストがあると引用プレフィックスは付かない", async () => {
    const app = makeStubApp([
      { path: "note.md", extension: "md", content: "content" },
    ]);
    const out = await expandTransclusions("text ![[note.md]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`"text content"`);
  });

  // ===== O. parseLink 境界 =====

  it("O1: path|alias の alias は展開内容に影響しない", async () => {
    const app = makeStubApp([
      { path: "note.md", extension: "md", content: "real content" },
    ]);
    const out = await expandTransclusions("![[note.md|表示名]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`"real content"`);
  });

  it("O2: path#heading|alias（heading + alias）", async () => {
    const app = makeStubApp([
      {
        path: "note.md",
        extension: "md",
        content: "# Sec\nbody\n\n# Other\nx",
      },
    ]);
    const out = await expandTransclusions("![[note.md#Sec|表示]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`"body"`);
  });

  // ===== 追加境界: 複数埋め込み・ネスト =====

  it("P1: 同一行に複数の埋め込み", async () => {
    const app = makeStubApp([
      { path: "a.md", extension: "md", content: "A" },
      { path: "b.md", extension: "md", content: "B" },
    ]);
    const out = await expandTransclusions("![[a.md]] and ![[b.md]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`"A and B"`);
  });

  it("P2: ネストした埋め込み（A が B を埋め込み、B が C を埋め込み）", async () => {
    const app = makeStubApp([
      { path: "a.md", extension: "md", content: "A1 ![[b.md]] A2" },
      { path: "b.md", extension: "md", content: "B1 ![[c.md]] B2" },
      { path: "c.md", extension: "md", content: "C" },
    ]);
    const out = await expandTransclusions("![[a.md]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`"A1 B1 C B2 A2"`);
  });

  // ===== W. 方式W: crossref ラベルのファイル名プレフィックス付与 =====

  it("W1: 埋め込み先の {#fig:hoge} にファイル名プレフィックスが付く", async () => {
    // 別ファイル由来の同名ラベル衝突を自動解決する（方式W）。
    const app = makeStubApp([
      { path: "sub.md", extension: "md", content: "![[x.png]]{#fig:hoge}" },
    ]);
    const out = await expandTransclusions("![[sub.md]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`"![[x.png]]{#fig:sub-hoge}"`);
  });

  it("W2: 埋め込み先内の参照 [@fig:hoge] もプレフィックス付与される", async () => {
    // ラベルと参照が一貫してリライトされ、自己完結参照が壊れない。
    const app = makeStubApp([
      {
        path: "sub.md",
        extension: "md",
        content: "![[x.png]]{#fig:hoge}\n\nsee [@fig:hoge]",
      },
    ]);
    const out = await expandTransclusions("![[sub.md]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`
      "![[x.png]]{#fig:sub-hoge}

      see [@fig:sub-hoge]"
    `);
  });

  it("W3: メイン文書のラベルはプレフィックス付与されない（ユーザー体験維持）", async () => {
    const app = makeStubApp([
      { path: "sub.md", extension: "md", content: "![[y.png]]{#fig:sub-only}" },
    ]);
    // メインに直接書いたラベルはそのまま、埋め込み先だけプレフィックス付与
    const out = await expandTransclusions(
      "![[z.png]]{#fig:main}\n\n![[sub.md]]",
      app,
      "root.md",
      new Map(),
    );
    expect(out).toMatchInlineSnapshot(`
      "![[z.png]]{#fig:main}

      ![[y.png]]{#fig:sub-only}"
    `);
  });

  it("W4: 別ファイル同名ラベルが衝突しない（方式W の核心）", async () => {
    // sub1.md と sub2.md がそれぞれ {#fig:hoge} を持っていても、ファイル名で区別される。
    const app = makeStubApp([
      { path: "sub1.md", extension: "md", content: "![[a.png]]{#fig:hoge}" },
      { path: "sub2.md", extension: "md", content: "![[b.png]]{#fig:hoge}" },
    ]);
    const out = await expandTransclusions(
      "![[sub1.md]]\n\n![[sub2.md]]",
      app,
      "root.md",
      new Map(),
    );
    expect(out).toMatchInlineSnapshot(`
      "![[a.png]]{#fig:sub1-hoge}

      ![[b.png]]{#fig:sub2-hoge}"
    `);
  });

  it("W5: 全接頭辞（fig/tbl/lst/eq/sec）がプレフィックス付与対象", async () => {
    const app = makeStubApp([
      {
        path: "sub.md",
        extension: "md",
        content: "{#fig:a}\n{#tbl:b}\n{#lst:c}\n{#eq:d}\n{#sec:e}",
      },
    ]);
    const out = await expandTransclusions("![[sub.md]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`
      "{#fig:sub-a}
      {#tbl:sub-b}
      {#lst:sub-c}
      {#eq:sub-d}
      {#sec:sub-e}"
    `);
  });

  it("W6: caption 属性付き {#lst:demo caption=...} も保持してプレフィックス付与", async () => {
    const app = makeStubApp([
      {
        path: "sub.md",
        extension: "md",
        content: '```{#lst:demo caption="Hello"}\ncode\n```',
      },
    ]);
    const out = await expandTransclusions("![[sub.md]]", app, "root.md", new Map());
    expect(out).toMatchInlineSnapshot(`
      "\`\`\`{#lst:sub-demo caption="Hello"}
      code
      \`\`\`"
    `);
  });
});
