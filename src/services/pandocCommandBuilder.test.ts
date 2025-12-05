// File: src/services/pandocCommandBuilder.test.ts
// Purpose: Pandoc コマンド生成ロジックの期待動作をユニットテストで検証する。
// Reason: フラグ組み立ての退行を防ぎ、フォーマット別挙動を保証するため。
// Related: src/services/pandocCommandBuilder.ts, src/services/profileManager.ts, vitest.config.ts, plans.md

import { describe, expect, it } from "vitest";
import { buildPandocCommand } from "./pandocCommandBuilder";
import { createDefaultProfile } from "./profileManager";

describe("buildPandocCommand", () => {
  it("指定した pandocPath と PDF 用エンジンを反映する", () => {
    const profile = createDefaultProfile();
    profile.pandocPath = "/usr/local/bin/custom-pandoc";
    profile.latexEngine = "xelatex";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      inputPath: "/tmp/input.md",
      outputPath: "/tmp/output.pdf",
      headerPath: "/tmp/header.tex",
      workingDir: "/tmp",
      extraArgs: [],
    });

    expect(result.command).toBe("/usr/local/bin/custom-pandoc");
    expect(result.args).toContain("--pdf-engine=xelatex");
    expect(result.args).toContain("/tmp/input.md");
    expect(result.args).toContain("/tmp/output.pdf");
  });

  it("beamer ドキュメントクラスでは beamer ターゲットと変数を付与する", () => {
    const profile = createDefaultProfile();
    profile.documentClass = "beamer";

    const result = buildPandocCommand({
      profile,
      format: "latex",
      inputPath: "/tmp/note.md",
      outputPath: "/tmp/note.tex",
      headerPath: "/tmp/header.tex",
      workingDir: "/tmp",
      extraArgs: [],
    });

    expect(result.args).toContain("-t");
    expect(result.args).toContain("beamer");
    expect(result.args).toContain("documentclass=beamer");
  });

  it("Docx では lua-filter を受け取り、reference-doc も許容する", () => {
    const profile = createDefaultProfile();

    const result = buildPandocCommand({
      profile,
      format: "docx",
      outputPath: "/tmp/out.docx",
      workingDir: "/tmp",
      luaFilters: ["/tmp/filter.lua"],
      extraArgs: ["--reference-doc=template.docx", "--standalone"],
    });

    expect(result.args).toContain("-t");
    expect(result.args).toContain("docx");
    expect(result.args).toContain("/tmp/filter.lua");
    expect(result.args).toContain("--reference-doc=template.docx");
  });

  it("マージンと画像スケールを -V フラグとして展開する", () => {
    const profile = createDefaultProfile();
    profile.useMarginSize = true;
    profile.marginSize = "30mm";
    profile.imageScale = "width=0.6\\textwidth";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args).toContain("geometry:margin=30mm");
    expect(result.args).toContain("graphics=width=0.6\\textwidth");
  });
});
