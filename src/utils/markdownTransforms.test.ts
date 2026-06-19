// File: src/utils/markdownTransforms.test.ts
// Purpose: replaceWikiLinksAndCodeAsync のコードブロック処理が Pandoc ネイティブ
//   （fenced_code_attributes + --listings）へ委譲されているかを検証する。
// Reason: コードフェンスが自前で \begin{lstlisting} へ変換されず、入力記法
//   （標準 / 非標準(Obsidian) / プレーン）を問わずそのままパススルーされること、
//   およびコードブロック内の ![[...]] 画像/WikiLink が置換対象から保護されることを
//   保証するため。実際の lstlisting 生成は pandocInputFormat.integration.test.ts で
//   実 Pandoc を通じて検証する。
// Related: src/utils/markdownTransforms.ts, src/services/pandocCommandBuilder.ts,
//   src/services/pandocInputFormat.integration.test.ts, vitest.config.ts

import { describe, expect, it } from "vitest";
import { App } from "obsidian";
import { DEFAULT_PROFILE } from "../MdTexPluginSettings";
import { replaceWikiLinksAndCodeAsync } from "./markdownTransforms";

describe("replaceWikiLinksAndCodeAsync: コードブロックの Pandoc ネイティブ委譲", () => {
  // コードブロックのみを扱うため WikiLink 解決は走らない。app/profile は最低限のスタブ。
  const app = new App();
  const profile = DEFAULT_PROFILE;

  async function run(md: string): Promise<string> {
    return replaceWikiLinksAndCodeAsync(md, app, profile, "test.md");
  }

  it("プレーンコードブロックをそのままパススルーする", async () => {
    const md = "```\ndef hello():\n    pass\n```";
    expect(await run(md)).toBe(md);
  });

  it("標準記法の属性付きコードブロックを lstlisting に変換せずパススルーする", async () => {
    const md = '```{#lst:demo .python caption="Hello World"}\nprint("hi")\n```';
    const out = await run(md);
    expect(out).toBe(md);
    expect(out).not.toContain("\\begin{lstlisting}");
    expect(out).not.toContain("language=Python");
  });

  it("非標準(Obsidian)記法（言語の直後に属性）もパススルーする", async () => {
    const md = '```python{#lst:demo caption="Hello World"}\nprint("hi")\n```';
    const out = await run(md);
    expect(out).toBe(md);
    expect(out).not.toContain("\\begin{lstlisting}");
  });

  it("未知言語（mermaid 等）もエラーなくパススルーする", async () => {
    const md = "```mermaid\ngraph LR\nA-->B\n```";
    expect(await run(md)).toBe(md);
  });

  it("コードブロック内の ![[...]] 画像/WikiLink は置換対象にしない（保護）", async () => {
    const md = "```python\n![[inside_code.png]]\nprint(x)\n```";
    const out = await run(md);
    // フェンス全体が保持され、内側の ![[...]] は未解釈のまま残る
    expect(out).toBe(md);
    expect(out).toContain("![[inside_code.png]]");
  });

  it("キャプション内の特殊文字（% & #）を事前エスケープしない（Pandoc へ委譲）", async () => {
    const md = '```{#lst:x .python caption="100% sure & #1"}\nx=1\n```';
    const out = await run(md);
    expect(out).toBe(md);
    expect(out).not.toContain("\\%");
    expect(out).not.toContain("\\&");
    expect(out).not.toContain("\\#");
  });
});
