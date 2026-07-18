// File: src/services/citationPipeline.test.ts
// Purpose: citation パイプラインの純粋関数（resolveLatexInvocation）の単体テスト（ADR-009）。
// Reason: 2フェーズ実行の前段（latexmk 引数と draft エンジンの解決）が正しいことを保証する。
//          実行部（runCommand / runReactiveLatexPhase）は実 Pandoc/LaTeX が必要なため integration
//          系だが、エンジン解決は純粋で検証可能。
// Related: src/services/citationPipeline.ts

import { describe, expect, it } from "vitest";
import { resolveLatexInvocation } from "./citationPipeline";
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
