// File: src/services/conversionPaths.test.ts
// Purpose: buildConversionPaths の命名規則（空白置換・latex 拡張子・lint 中間体の要否）を検証する。
// Reason: app 非依存の純粋関数のため、interface 直接の単体テストで錨付けする（候補 C）。

import { describe, it, expect } from "vitest";
import { buildConversionPaths } from "./conversionPaths";

describe("buildConversionPaths", () => {
  it("latex 形式は .tex 拡張子、他は .<format> を出力に使う", () => {
    const base = buildConversionPaths({
      inputFilePath: "/vault/note.md",
      outputDir: "/vault/out",
      resourcePath: "/vault",
      format: "latex",
      lintEnabled: false,
    });
    expect(base.output).toBe("/vault/out/note.tex");

    const pdf = buildConversionPaths({
      inputFilePath: "/vault/note.md",
      outputDir: "/vault/out",
      resourcePath: "/vault",
      format: "pdf",
      lintEnabled: false,
    });
    expect(pdf.output).toBe("/vault/out/note.pdf");

    const docx = buildConversionPaths({
      inputFilePath: "/vault/note.md",
      outputDir: "/vault/out",
      resourcePath: "/vault",
      format: "docx",
      lintEnabled: false,
    });
    expect(docx.output).toBe("/vault/out/note.docx");
  });

  it("baseName の空白は _ に置換する", () => {
    const p = buildConversionPaths({
      inputFilePath: "/vault/my note.md",
      outputDir: "/vault/out",
      resourcePath: "/vault",
      format: "pdf",
      lintEnabled: false,
    });
    expect(p.output).toBe("/vault/out/my_note.pdf");
  });

  it("lint 有効時のみ中間ファイルパスを置き、ソース側に置く", () => {
    const on = buildConversionPaths({
      inputFilePath: "/vault/sub/note.md",
      outputDir: "/vault/out",
      resourcePath: "/vault",
      format: "pdf",
      lintEnabled: true,
    });
    expect(on.intermediate).toBe("/vault/sub/note.temp.md");

    const off = buildConversionPaths({
      inputFilePath: "/vault/sub/note.md",
      outputDir: "/vault/out",
      resourcePath: "/vault",
      format: "pdf",
      lintEnabled: false,
    });
    expect(off.intermediate).toBe("");
  });

  it("sourceDir は元 .md のディレクトリ、resourcePath はそのまま通す", () => {
    const p = buildConversionPaths({
      inputFilePath: "/vault/sub/note.md",
      outputDir: "/vault/out",
      resourcePath: "/vault/resources:/vault",
      format: "pdf",
      lintEnabled: false,
    });
    expect(p.sourceDir).toBe("/vault/sub");
    expect(p.resourcePath).toBe("/vault/resources:/vault");
  });
});
