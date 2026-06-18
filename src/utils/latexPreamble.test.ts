// File: src/utils/latexPreamble.test.ts
// Purpose: DEFAULT_LATEX_PREAMBLE の構造的回帰ガード。
// Reason: Pandoc 3.8+ はキャプション付きコードブロックを \begin{codelisting} で出力するが、
//   codelisting 環境は listings パッケージに含まれず newfloat で別途定義が必要。
//   定義が欠けると「! LaTeX Error: Environment codelisting undefined.」で PDF 生成が停止する。
// Related: src/MdTexPluginSettings.ts, src/utils/codelisting.integration.test.ts

import { describe, expect, it } from "vitest";
import { DEFAULT_LATEX_PREAMBLE } from "../MdTexPluginSettings";
import { ensureCodelistingEnvironment } from "./latexPreamble";

describe("DEFAULT_LATEX_PREAMBLE: codelisting 浮動体", () => {
  it("newfloat をロードし codelisting 環境を DeclareFloatingEnvironment で定義する", () => {
    expect(DEFAULT_LATEX_PREAMBLE).toContain("\\usepackage{newfloat}");
    expect(DEFAULT_LATEX_PREAMBLE).toContain(
      "\\DeclareFloatingEnvironment",
    );
    // codelisting 環境名が定義対象に含まれる
    expect(DEFAULT_LATEX_PREAMBLE).toMatch(/\]\s*\{codelisting\}/);
  });

  it("listings パッケージをロードする（codelisting の中身は lstlisting で描画）", () => {
    expect(DEFAULT_LATEX_PREAMBLE).toContain("\\usepackage{listings}");
  });
});

describe("ensureCodelistingEnvironment", () => {
  it("codelisting 未定義のプリアンブルに newfloat + DeclareFloatingEnvironment を補完する", () => {
    const out = ensureCodelistingEnvironment("\\usepackage{listings}\n");
    expect(out).toContain("\\usepackage{newfloat}");
    expect(out).toMatch(/\]\s*\{codelisting\}/);
    // 元の内容を破壊しない
    expect(out).toContain("\\usepackage{listings}");
  });

  it("DEFAULT_LATEX_PREAMBLE は既に定義済みのため変更しない（冪等）", () => {
    expect(ensureCodelistingEnvironment(DEFAULT_LATEX_PREAMBLE)).toBe(
      DEFAULT_LATEX_PREAMBLE.trim(),
    );
  });

  it("複数行にまたがる DeclareFloatingEnvironment 定義を検出してスキップする", () => {
    const pre = [
      "\\usepackage{newfloat}",
      "\\DeclareFloatingEnvironment[",
      "  fileext=lol,",
      "  listname={List of Listings},",
      "  name=Listing",
      "]{codelisting}",
    ].join("\n");
    expect(ensureCodelistingEnvironment(pre)).toBe(pre.trim());
  });

  it("\\\newenvironment{codelisting} で定義されている場合もスキップする", () => {
    const pre = "\\newenvironment{codelisting}{\\bfseries}{}";
    expect(ensureCodelistingEnvironment(pre)).toBe(pre.trim());
  });

  it("空文字列には定義ブロックのみを返す", () => {
    const out = ensureCodelistingEnvironment("");
    expect(out).toContain("\\usepackage{newfloat}");
    expect(out).toMatch(/\]\s*\{codelisting\}/);
  });
});
