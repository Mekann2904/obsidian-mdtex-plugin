// File: src/services/pandocCommandBuilder.test.ts
// Purpose: Pandoc コマンド生成ロジックの期待動作をユニットテストで検証する。
// Reason: フラグ組み立ての退行を防ぎ、フォーマット別挙動を保証するため。
// Related: src/services/pandocCommandBuilder.ts, src/services/profileManager.ts, vitest.config.ts, plans.md

import { describe, expect, it } from "vitest";
import {
  buildPandocCommand,
  buildLabelMetadataYaml,
  buildLatexSearchEnv,
} from "./pandocCommandBuilder";
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
});

describe("ラベルメタデータのメタデータ-file 移行", () => {
  it("buildPandocCommand は -M でキャプション語／接頭辞を渡さない（frontmatter 上書きを阻害しない）", () => {
    // コマンドライン -M は frontmatter より常に優先されてしまうため、文書ごとの上書きを
    // 可能にするには -M を廃止し --metadata-file に寄せる必要がある。これを回帰防止のため検証する。
    const profile = createDefaultProfile();
    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    // 削除対象の 8 項目（legacy kebab の listing-title 含む）が残っていないこと
    for (const key of [
      "figureTitle",
      "figPrefix",
      "tableTitle",
      "tblPrefix",
      "listingTitle",
      "listing-title",
      "lstPrefix",
      "eqnPrefix",
    ]) {
      const asM = `-M ${key}=`;
      expect(result.args.some(a => a.startsWith(asM))).toBe(false);
    }
    expect(result.args).not.toContain("-M");
  });

  it("buildPandocCommand は metadataFile 指定時に --metadata-file を展開する", () => {
    const profile = createDefaultProfile();
    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
      metadataFile: "/tmp/mdtex-metadata-1/labels.yaml",
    });

    const idx = result.args.indexOf("--metadata-file");
    expect(idx).toBeGreaterThan(-1);
    expect(result.args[idx + 1]).toBe("/tmp/mdtex-metadata-1/labels.yaml");
  });

  it("metadataFile 未指定時は --metadata-file を渡さない", () => {
    const profile = createDefaultProfile();
    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });
    expect(result.args).not.toContain("--metadata-file");
  });

  it("buildLabelMetadataYaml はプロファイル既定値を crossref メタデータキーにマップする", () => {
    const profile = createDefaultProfile();
    profile.figureLabel = "図";
    profile.figPrefix = "図";
    profile.tableLabel = "表";
    profile.tblPrefix = "表";
    profile.codeLabel = "コード";
    profile.lstPrefix = "コード";
    profile.eqnPrefix = "式";

    const yaml = buildLabelMetadataYaml(profile);

    expect(yaml).toContain('figureTitle: "図"');
    expect(yaml).toContain('figPrefix: "図"');
    expect(yaml).toContain('tableTitle: "表"');
    expect(yaml).toContain('tblPrefix: "表"');
    expect(yaml).toContain('listingTitle: "コード"');
    expect(yaml).toContain('lstPrefix: "コード"');
    expect(yaml).toContain('eqnPrefix: "式"');
    // equationLabel は crossref の Title 系キーに対応しないため含まれない
    expect(yaml).not.toContain("equation");
    // legacy kebab キーは含まれない
    expect(yaml).not.toContain("listing-title");
  });

  it("buildLabelMetadataYaml は空の値を省略し、全空なら空文字列を返す", () => {
    const partial = createDefaultProfile();
    partial.figPrefix = "";
    partial.tblPrefix = "   ";
    const partialYaml = buildLabelMetadataYaml(partial);
    expect(partialYaml).not.toContain("figPrefix");
    expect(partialYaml).not.toContain("tblPrefix");
    expect(partialYaml).toContain('figureTitle: "Figure"');

    const empty = createDefaultProfile();
    empty.figureLabel = "";
    empty.figPrefix = "";
    empty.tableLabel = "";
    empty.tblPrefix = "";
    empty.codeLabel = "";
    empty.lstPrefix = "";
    empty.eqnPrefix = "";
    expect(buildLabelMetadataYaml(empty)).toBe("");
  });

  it("buildLabelMetadataYaml はダブルクオートとバックスラッシュをエスケープする", () => {
    const profile = createDefaultProfile();
    profile.figureLabel = 'a"b\\c';
    const yaml = buildLabelMetadataYaml(profile);
    // YAML 二重引用符内で " と \\ がエスケープされていること
    expect(yaml).toContain('figureTitle: "a\\"b\\\\c"');
  });
});

describe("文書テンプレート方式（ADR-007）", () => {
  it("defaults 方式は -d を渡し、documentclass 系の 6 つの -V を生成しない", () => {
    // Pandoc の precedence でコマンドライン -V が defaults file を上書きしてしまうため、
    // defaults 方式では -d で枠を委譲しつつ documentclass 系の -V 生成をスキップする。
    const profile = createDefaultProfile();
    profile.documentTemplateMode = "defaults";
    profile.defaultsFilePath = "/vault/defaults.yaml";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    const dIdx = result.args.indexOf("-d");
    expect(dIdx).toBeGreaterThan(-1);
    expect(result.args[dIdx + 1]).toBe("/vault/defaults.yaml");

    // 6 つの -V が含まれないこと
    expect(result.args).not.toContain("documentclass=ltjarticle");
    expect(result.args).not.toContain("fontsize=11pt");
    expect(result.args.some(a => a.startsWith("geometry:margin="))).toBe(false);
    expect(result.args.some(a => a.startsWith("graphics="))).toBe(false);
    expect(result.args).not.toContain("pagestyle=empty");
    expect(result.args.some(a => a.startsWith("classoption="))).toBe(false);
  });

  it("defaults 方式は pdf-engine / pdf-engine-opts を CLI で上書きしない", () => {
    // defaults.yaml の `pdf-engine` / `pdf-engine-opts` に委譲する。
    // コマンドライン `--pdf-engine` は defaults file より優先されるため、ここで出すと
    // テンプレートパック（例: pLaTeX 学会論文の latexmk + -latex=platex + -pdfdvi）を壊す。
    const profile = createDefaultProfile();
    profile.documentTemplateMode = "defaults";
    profile.defaultsFilePath = "/vault/defaults.yaml";
    profile.latexEngine = "lualatex";
    profile.pdfEngineOpts = "-interaction=nonstopmode";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args.some(a => a.startsWith("--pdf-engine="))).toBe(false);
    expect(result.args.some(a => a.startsWith("--pdf-engine-opt="))).toBe(false);
  });

  it("defaults 方式は useStandalone=true でも --standalone を付与しない", () => {
    // standalone 制御も defaults file の standalone: に委譲する（本文フラグメント出力のため）。
    const profile = createDefaultProfile();
    profile.documentTemplateMode = "defaults";
    profile.defaultsFilePath = "/vault/defaults.yaml";
    profile.useStandalone = true;

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args).not.toContain("--standalone");
  });

  it("defaults + documentClass=beamer でも documentClass 由来の -t beamer を付与しない", () => {
    // beamer ターゲットも defaults file の to: で管理するためスキップする。
    const profile = createDefaultProfile();
    profile.documentTemplateMode = "defaults";
    profile.defaultsFilePath = "/vault/defaults.yaml";
    profile.documentClass = "beamer";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args.indexOf("beamer")).toBe(-1);
  });

  it("defaults 方式で defaultsFilePath が空なら -d を渡さない（呼び出し側でガード）", () => {
    const profile = createDefaultProfile();
    profile.documentTemplateMode = "defaults";
    profile.defaultsFilePath = "   ";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args).not.toContain("-d");
  });

  it("builtin 方式は -d を渡さず、従来どおり -V と --standalone を生成する（回帰）", () => {
    const profile = createDefaultProfile();
    profile.documentTemplateMode = "builtin";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args).not.toContain("-d");
    expect(result.args).toContain("documentclass=ltjarticle");
    expect(result.args).toContain("fontsize=11pt");
    expect(result.args).toContain("--standalone");
  });
});

describe("citation モード（ADR-009）", () => {
  it("citationMode=none のとき引用フラグを一切付与しない", () => {
    const profile = createDefaultProfile();
    profile.citationMode = "none";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args).not.toContain("--natbib");
    expect(result.args).not.toContain("--citeproc");
  });

  it("citationMode=natbib のとき --natbib を付与する（defaults file では指定不可なため CLI 必須）", () => {
    const profile = createDefaultProfile();
    profile.citationMode = "natbib";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args).toContain("--natbib");
    expect(result.args).not.toContain("--citeproc");
  });

  it("citationMode=citeproc のとき --citeproc を付与する", () => {
    const profile = createDefaultProfile();
    profile.citationMode = "citeproc";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args).toContain("--citeproc");
    expect(result.args).not.toContain("--natbib");
  });
});

describe("PDF エンジン追加オプション（ADR-009）", () => {
  it("pdfEngineOpts をスペース区切りで --pdf-engine-opt に展開する（latexmk サブエンジン用）", () => {
    const profile = createDefaultProfile();
    profile.latexEngine = "latexmk";
    profile.pdfEngineOpts = "-lualatex -interaction=nonstopmode";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args).toContain("--pdf-engine=latexmk");
    expect(result.args).toContain("--pdf-engine-opt=-lualatex");
    expect(result.args).toContain("--pdf-engine-opt=-interaction=nonstopmode");
  });

  it("pdfEngineOpts が空のとき --pdf-engine-opt を付与しない", () => {
    const profile = createDefaultProfile();
    profile.pdfEngineOpts = "";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args.some(a => a.startsWith("--pdf-engine-opt"))).toBe(false);
  });

  it("format=latex のとき pdfEngineOpts を無視する（PDF エンジン以外では無意味）", () => {
    const profile = createDefaultProfile();
    profile.latexEngine = "latexmk";
    profile.pdfEngineOpts = "-lualatex";

    const result = buildPandocCommand({
      profile,
      format: "latex",
      outputPath: "/tmp/out.tex",
      workingDir: "/tmp",
    });

    expect(result.args.some(a => a.startsWith("--pdf-engine-opt"))).toBe(false);
  });

  it("latexEngine にフルパスが入力されても --pdf-engine を basename に正規化する（年度更新耐性）", () => {
    const profile = createDefaultProfile();
    profile.latexEngine = "/usr/local/texlive/2025/bin/universal-darwin/lualatex";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args).toContain("--pdf-engine=lualatex");
    expect(result.args.some(a => a.startsWith("--pdf-engine=/"))).toBe(false);
  });

  it("latexEngine が空のとき --pdf-engine の既定は lualatex", () => {
    const profile = createDefaultProfile();
    profile.latexEngine = "";

    const result = buildPandocCommand({
      profile,
      format: "pdf",
      outputPath: "/tmp/out.pdf",
      workingDir: "/tmp",
    });

    expect(result.args).toContain("--pdf-engine=lualatex");
  });
});

describe("LaTeX 検索パス注入（ADR-009: buildLatexSearchEnv）", () => {
  it("defaults 方式のとき defaultsFilePath の dirname を TEXINPUTS/BIBINPUTS/BSTINPUTS に追記する", () => {
    const profile = createDefaultProfile();
    profile.documentTemplateMode = "defaults";
    profile.defaultsFilePath = "/vault/MdTex Templates/ACL/defaults.yaml";

    const env = buildLatexSearchEnv(profile, "darwin", {});

    expect(env.TEXINPUTS).toContain("/vault/MdTex Templates/ACL");
    expect(env.BIBINPUTS).toContain("/vault/MdTex Templates/ACL");
    expect(env.BSTINPUTS).toContain("/vault/MdTex Templates/ACL");
  });

  it("末尾セパレータを付けて標準パスも検索させる（TeX の検索パス規約）", () => {
    const profile = createDefaultProfile();
    profile.documentTemplateMode = "defaults";
    profile.defaultsFilePath = "/vault/pack/defaults.yaml";

    const env = buildLatexSearchEnv(profile, "darwin", {});

    // POSIX は ':'、末尾に ':' があると標準パスも検索する
    expect(env.TEXINPUTS).toBe("/vault/pack:");
  });

  it("Windows では ';' をセパレータに使う", () => {
    const profile = createDefaultProfile();
    profile.documentTemplateMode = "defaults";
    profile.defaultsFilePath = "C:\\vault\\pack\\defaults.yaml";

    const env = buildLatexSearchEnv(profile, "win32", {});

    expect(env.TEXINPUTS).toBe("C:\\vault\\pack;");
  });

  it("既存の検索パスがあればパックフォルダを末尾に連結する", () => {
    const profile = createDefaultProfile();
    profile.documentTemplateMode = "defaults";
    profile.defaultsFilePath = "/vault/pack/defaults.yaml";

    const env = buildLatexSearchEnv(profile, "darwin", {
      TEXINPUTS: "/usr/local/texlive:",
      BIBINPUTS: undefined,
      BSTINPUTS: "",
    });

    expect(env.TEXINPUTS).toBe("/usr/local/texlive::/vault/pack:");
    // undefined / 空文字の既存値は無視してパックフォルダだけ
    expect(env.BIBINPUTS).toBe("/vault/pack:");
    expect(env.BSTINPUTS).toBe("/vault/pack:");
  });

  it("builtin 方式のときは空オブジェクトを返す（注入しない）", () => {
    const profile = createDefaultProfile();
    profile.documentTemplateMode = "builtin";

    const env = buildLatexSearchEnv(profile, "darwin", {});

    expect(env).toEqual({});
  });

  it("defaults 方式でも defaultsFilePath が空なら空オブジェクトを返す", () => {
    const profile = createDefaultProfile();
    profile.documentTemplateMode = "defaults";
    profile.defaultsFilePath = "   ";

    const env = buildLatexSearchEnv(profile, "darwin", {});

    expect(env).toEqual({});
  });
});
