// File: src/services/citationPipeline.test.ts
// Purpose: citation パイプラインの純粋関数（エンジン解決・.tex コマンド構築）の単体テスト（ADR-009）。
// Reason: 2フェーズ実行の前段（コマンド組み立て）が正しいことを保証する。実行部（runCommand）は
//          実 Pandoc/LaTeX が必要なため integration 系だが、コマンド組み立ては純粋で検証可能。
// Related: src/services/citationPipeline.ts

import { describe, expect, it } from "vitest";
import { resolveLatexInvocation, buildCitationTexCommand } from "./citationPipeline";
import { createDefaultProfile } from "./profileManager";

describe("resolveLatexInvocation（ADR-009）", () => {
  it("latexEngine=latexmk のとき pdfEngineOpts を latexmk 引数に使い、draft エンジンを推定する", () => {
    const profile = createDefaultProfile();
    profile.latexEngine = "latexmk";
    profile.pdfEngineOpts = "-lualatex -interaction=nonstopmode";
    const { latexmkArgs, draftEngine } = resolveLatexInvocation(profile);
    expect(latexmkArgs).toEqual(["-lualatex", "-interaction=nonstopmode"]);
    expect(draftEngine).toBe("lualatex");
  });

  it("latexEngine=latexmk で pdfEngineOpts に -xelatex なら draft エンジンは xelatex", () => {
    const profile = createDefaultProfile();
    profile.latexEngine = "latexmk";
    profile.pdfEngineOpts = "-xelatex";
    const { latexmkArgs, draftEngine } = resolveLatexInvocation(profile);
    expect(latexmkArgs).toEqual(["-xelatex"]);
    expect(draftEngine).toBe("xelatex");
  });

  it("latexEngine=latexmk で pdfEngineOpts 空なら draft エンジンは lualatex（既定）", () => {
    const profile = createDefaultProfile();
    profile.latexEngine = "latexmk";
    profile.pdfEngineOpts = "";
    const { draftEngine } = resolveLatexInvocation(profile);
    expect(draftEngine).toBe("lualatex");
  });

  it("latexEngine=lualatex のとき latexmk -lualatex に変換し draft エンジンは lualatex", () => {
    const profile = createDefaultProfile();
    profile.latexEngine = "lualatex";
    const { latexmkArgs, draftEngine } = resolveLatexInvocation(profile);
    expect(latexmkArgs).toEqual(["-lualatex"]);
    expect(draftEngine).toBe("lualatex");
  });

  it("latexEngine=xelatex のとき latexmk -xelatex に変換する", () => {
    const profile = createDefaultProfile();
    profile.latexEngine = "xelatex";
    const { latexmkArgs, draftEngine } = resolveLatexInvocation(profile);
    expect(latexmkArgs).toEqual(["-xelatex"]);
    expect(draftEngine).toBe("xelatex");
  });

  it("latexEngine にフルパスが入力されても basename に正規化する（年度更新耐性）", () => {
    const profile = createDefaultProfile();
    profile.latexEngine = "/usr/local/texlive/2025/bin/universal-darwin/lualatex";
    const { latexmkArgs, draftEngine } = resolveLatexInvocation(profile);
    expect(latexmkArgs).toEqual(["-lualatex"]);
    expect(draftEngine).toBe("lualatex");
  });

  it("latexEngine に latexmk のフルパスが入力されても latexmk として扱う", () => {
    const profile = createDefaultProfile();
    profile.latexEngine = "/Library/TeX/texbin/latexmk";
    profile.pdfEngineOpts = "-lualatex";
    const { latexmkArgs, draftEngine } = resolveLatexInvocation(profile);
    expect(latexmkArgs).toEqual(["-lualatex"]);
    expect(draftEngine).toBe("lualatex");
  });

  it("latexEngine に Windows フルパス＋.exe が入力されても basename に正規化する", () => {
    const profile = createDefaultProfile();
    profile.latexEngine = "C:\\texlive\\2024\\bin\\windows\\latexmk.exe";
    profile.pdfEngineOpts = "-lualatex";
    const { latexmkArgs } = resolveLatexInvocation(profile);
    expect(latexmkArgs).toEqual(["-lualatex"]);
  });
});

describe("buildCitationTexCommand（ADR-009）", () => {
  it("format=latex で standalone .tex を生成するコマンドを構築する", () => {
    const profile = createDefaultProfile();
    profile.citationMode = "natbib";
    const cmd = buildCitationTexCommand({
      profile,
      useStdin: false,
      inputPath: "/tmp/in.md",
      texOutputPath: "/tmp/out.tex",
      pdfOutputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });
    // .tex 出力なので -t latex、--pdf-engine 系は出ない
    expect(cmd.args).toContain("-t");
    expect(cmd.args).toContain("latex");
    expect(cmd.args.some(a => a.startsWith("--pdf-engine"))).toBe(false);
    // natbib は .tex 生成でも意味がある（\citep 変換）
    expect(cmd.args).toContain("--natbib");
    expect(cmd.args).toContain("/tmp/out.tex");
  });

  it("useStdin のとき inputPath を渡さず -o のみ", () => {
    const profile = createDefaultProfile();
    const cmd = buildCitationTexCommand({
      profile,
      useStdin: true,
      inputContent: "body",
      texOutputPath: "/tmp/out.tex",
      pdfOutputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });
    expect(cmd.args).not.toContain("/tmp/in.md");
    expect(cmd.args).toContain("/tmp/out.tex");
  });
});
