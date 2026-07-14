// File: src/utils/unwrapValidWikiLinks.characterization.test.ts
// Purpose: unwrapValidWikiLinks の現状振る舞いを characterization test として録音する。
// Reason: AST 基盤化リファクタリング（ADR-005/006）の前提となる安全網。
//   [[...]] をリンク先実在時にブラケット除去する処理の全分岐（フェンス保護・
//   埋め込み除外・エイリアス・heading/blockId 付き）を網羄する。
// Related: src/utils/markdownTransforms.ts, docs/design-decisions.md (ADR-005/006), CONTEXT.md

import { describe, it, expect } from "vitest";
import type { VaultLike } from "./vaultLike";
import { resolveLinkPath, extensionOf } from "./vaultLinking";
import { unwrapValidWikiLinks } from "./markdownTransforms";

// テスト用スタブ VaultLike: 指定したファイルパス群を「実在」として解決する。
// Obsidian 本物の getFirstLinkpathDest は拡張子なしのベース名（"note"）でも
// "note.md" を解決するため、スタブも同様に「ベース名が先頭から一致するファイル」を許容する。
// 変数名 app は呼び出し側の互換のため残す（実体は VaultLike）。
function makeStubApp(existingPaths: string[]): VaultLike {
  return {
    resolveLink(linktext: string, sourcePath: string) {
      const pathPart = linktext.split("|")[0].split("#")[0].split("^")[0].trim();
      const p = resolveLinkPath(existingPaths, pathPart, sourcePath);
      return p ? { path: p, extension: extensionOf(p) } : null;
    },
    async read() {
      return null;
    },
  };
}

describe("unwrapValidWikiLinks: characterization（現状振る舞いの録音）", () => {
  // ===== Q. 基本 =====

  it("Q1: 有効リンクをブラケット除去してテキスト化する", () => {
    const app = makeStubApp(["note.md"]);
    expect(unwrapValidWikiLinks("see [[note]] here", app, "src.md")).toMatchInlineSnapshot(`"see note here"`);
  });

  it("Q2: 無効リンク（未存在）はそのまま残す", () => {
    const app = makeStubApp([]);
    expect(unwrapValidWikiLinks("see [[missing]] here", app, "src.md")).toMatchInlineSnapshot(`"see [[missing]] here"`);
  });

  it("Q3: エイリアス [[note|alias]] は alias 側を使う", () => {
    const app = makeStubApp(["note.md"]);
    expect(unwrapValidWikiLinks("[[note|表示名]]", app, "src.md")).toMatchInlineSnapshot(`"表示名"`);
  });

  it("Q3b: エイリアスでリンク先未存在ならそのまま残す", () => {
    const app = makeStubApp([]);
    expect(unwrapValidWikiLinks("[[missing|alias]]", app, "src.md")).toMatchInlineSnapshot(`"[[missing|alias]]"`);
  });

  // ===== R. フェンス保護 =====

  it("R1: バッククォートフェンス内の [[...]] は保護する", () => {
    const app = makeStubApp(["note.md"]);
    const md = "```\n[[note]]\n```";
    expect(unwrapValidWikiLinks(md, app, "src.md")).toMatchInlineSnapshot(`
      "\`\`\`
      [[note]]
      \`\`\`"
    `);
  });

  it("R2: チルダフェンス ~~~ 内の [[...]] は保護する", () => {
    // 従来は /^```/ のみ判定し ~~~ を認識しないバグがあった（チルダ内が誤展開）。
    // 修正後は ~~~ もフェンスとして認識し保護する。
    const app = makeStubApp(["note.md"]);
    const md = "~~~\n[[note]]\n~~~";
    expect(unwrapValidWikiLinks(md, app, "src.md")).toMatchInlineSnapshot(`
      "~~~
      [[note]]
      ~~~"
    `);
  });

  it("R3: フェンス終了後の行でリンク展開が復帰する", () => {
    const app = makeStubApp(["note.md"]);
    const md = "```\n[[note]]\n```\n[[note]]";
    expect(unwrapValidWikiLinks(md, app, "src.md")).toMatchInlineSnapshot(`
      "\`\`\`
      [[note]]
      \`\`\`
      note"
    `);
  });

  it("R4: フェンス開閉の釣り合い（複数ブロック）", () => {
    const app = makeStubApp(["note.md"]);
    const md = "```\na\n```\n[[note]]\n```\nb\n```";
    expect(unwrapValidWikiLinks(md, app, "src.md")).toMatchInlineSnapshot(`
      "\`\`\`
      a
      \`\`\`
      note
      \`\`\`
      b
      \`\`\`"
    `);
  });

  // ===== S. 埋め込み除外 =====

  it("S1: ![[note]] 埋め込みは処理しない（否定後読み）", () => {
    const app = makeStubApp(["note.md"]);
    expect(unwrapValidWikiLinks("embed ![[note]] here", app, "src.md")).toMatchInlineSnapshot(`"embed ![[note]] here"`);
  });

  it("S2: [[note]] と ![[note]] が同行で両方正しく処理", () => {
    const app = makeStubApp(["note.md"]);
    expect(unwrapValidWikiLinks("[[note]] and ![[note]]", app, "src.md")).toMatchInlineSnapshot(`"note and ![[note]]"`);
  });

  // ===== T. 複数・heading/blockId 付き =====

  it("T1: 同行に複数リンク", () => {
    const app = makeStubApp(["a.md", "b.md"]);
    expect(unwrapValidWikiLinks("[[a]] and [[b]]", app, "src.md")).toMatchInlineSnapshot(`"a and b"`);
  });

  it("T2: [[a#heading]] heading 付き（テキストは全体）", () => {
    const app = makeStubApp(["a.md"]);
    expect(unwrapValidWikiLinks("[[a#intro]]", app, "src.md")).toMatchInlineSnapshot(`"a#intro"`);
  });

  it("T3: [[a^block]] blockId 付き", () => {
    const app = makeStubApp(["a.md"]);
    expect(unwrapValidWikiLinks("[[a^myblock]]", app, "src.md")).toMatchInlineSnapshot(`"a^myblock"`);
  });

  // ===== U. 境界 =====

  it("U1: 空リンク [[]] はそのまま残す", () => {
    const app = makeStubApp([]);
    expect(unwrapValidWikiLinks("empty [[]] link", app, "src.md")).toMatchInlineSnapshot(`"empty [[]] link"`);
  });

  it("U2: リンク無しのプレーンテキストはそのまま", () => {
    const app = makeStubApp(["note.md"]);
    expect(unwrapValidWikiLinks("just plain text", app, "src.md")).toMatchInlineSnapshot(`"just plain text"`);
  });

  it("U3: 単一 [ ]（ブラケット1つ）は処理しない", () => {
    const app = makeStubApp(["note.md"]);
    expect(unwrapValidWikiLinks("[not a link]", app, "src.md")).toMatchInlineSnapshot(`"[not a link]"`);
  });
});
