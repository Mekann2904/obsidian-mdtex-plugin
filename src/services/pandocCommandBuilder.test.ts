// File: src/services/pandocCommandBuilder.test.ts
// Purpose: Pandoc コマンド生成ロジックの期待動作をユニットテストで検証する。
// Reason: フラグ組み立ての退行を防ぎ、フォーマット別挙動を保証するため。
// Related: src/services/pandocCommandBuilder.ts, src/services/profileManager.ts, vitest.config.ts, plans.md

import { describe, expect, it } from "vitest";
import { buildPandocCommand, getInputFormatArgs, OutputFormat } from "./pandocCommandBuilder";
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

  it("resourcePath オーバーライドをそのまま --resource-path に使う", () => {
    const profile = createDefaultProfile();
    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp/workdir",
      resourcePath: "/vault/root",
    });

    expect(result.args).toContain("--resource-path");
    expect(result.args).toContain("/vault/root");
  });

  it("pdf/latex/docx の全形式で入力フォーマット引数が一致する", () => {
    // リファクタ前は docx のみ markdown+raw_html+fenced_divs+raw_attribute、
    // pdf/latex は素の markdown と非対称だった。全形式で同一の -f を返すことを検証する。
    const formats: OutputFormat[] = ["pdf", "latex", "docx"];
    const specs = formats.map(fmt => getInputFormatArgs(fmt).join(" "));

    expect(new Set(specs).size).toBe(1);
    const [flag, spec] = getInputFormatArgs("docx");
    expect(flag).toBe("-f");
    expect(spec).toBe(specs[0].split(" ")[1]);
  });

  it("buildPandocCommand が全形式で同一の入力フォーマット引数を展開する", () => {
    const profile = createDefaultProfile();
    const formats: OutputFormat[] = ["pdf", "latex", "docx"];
    const builtSpecs = formats.map(fmt => {
      const result = buildPandocCommand({
        profile,
        format: fmt,
        outputPath: "/tmp/out",
        workingDir: "/tmp",
      });
      const idx = result.args.indexOf("-f");
      expect(idx).toBeGreaterThan(-1);
      return result.args[idx + 1];
    });

    expect(new Set(builtSpecs).size).toBe(1);
  });

  it("統一された入力フォーマットが生 LaTeX / fenced div / raw block / コード属性の拡張を明示する", () => {
    // プラグインが依存する構文を Pandoc のデフォルトに依存せず安定有効化するため、
    // 必須拡張を明示することを検証する（各拡張を無効化すると対応構文がパースされない）。
    const [, spec] = getInputFormatArgs("pdf");
    expect(spec.startsWith("markdown")).toBe(true);
    for (const ext of [
      "+raw_tex", // 生 LaTeX (\clearpage 等) のパース
      "+raw_html", // インライン HTML のパース
      "+fenced_divs", // ::: fenced div のパース
      "+raw_attribute", // {=latex} {=openxml} raw block のパース
      "+fenced_code_attributes", // {#lst:... caption=...} コード属性のパース
    ]) {
      expect(spec).toContain(ext);
    }
  });
});
