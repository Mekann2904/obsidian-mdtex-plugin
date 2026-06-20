// File: src/assets/sampleTemplatePacks.ts
// Purpose: main.js に埋め込むサンプルテンプレートパックの定義（ADR-008）。
// Reason: 初回起動時に vault のテンプレートフォルダへ展開する。各ファイルは esbuild の
//          text loader で文字列として取り込むため、内容の $ や \ をエスケープ不要にする。
// Related: src/services/templatePackService.ts, src/assets/sample-packs/*,
//          esbuild.config.mjs

import tateDefaults from "./sample-packs/縦書き二段組/defaults.yaml";
import tateTemplate from "./sample-packs/縦書き二段組/tate-twocolumn.tex";
import tatePreamble from "./sample-packs/縦書き二段組/preamble.tex";
import tateRuby from "./sample-packs/縦書き二段組/aozora-ruby.lua";

import infoDefaults from "./sample-packs/情報系論文風/defaults.yaml";
import infoTemplate from "./sample-packs/情報系論文風/info-paper.tex";
import infoPreamble from "./sample-packs/情報系論文風/preamble.tex";
import infoTable from "./sample-packs/情報系論文風/simple-table.lua";

import platexDefaults from "./sample-packs/pLaTeX学会論文/defaults.yaml";
import platexTemplate from "./sample-packs/pLaTeX学会論文/template.tex";
import platexPreamble from "./sample-packs/pLaTeX学会論文/preamble.tex";
import platexSanitize from "./sample-packs/pLaTeX学会論文/sanitize-images.lua";
import platexTable from "./sample-packs/pLaTeX学会論文/simple-table.lua";
import platexCode from "./sample-packs/pLaTeX学会論文/code-blocks.lua";
import platexSample from "./sample-packs/pLaTeX学会論文/sample.md";

import skillDoc from "./templateDocs/SKILL.md";
import readmeDoc from "./templateDocs/README.md";

export interface SampleTemplateFile {
  /** テンプレートパックフォルダ内での相対ファイル名。 */
  name: string;
  /** ファイルの内容。 */
  content: string;
}

export interface SampleTemplatePack {
  /** テンプレートパック名（＝テンプレートフォルダ直下のサブフォルダ名）。 */
  name: string;
  /** パックを構成するファイル一覧。`defaults.yaml` を必ず含む。 */
  files: SampleTemplateFile[];
}

export const SAMPLE_TEMPLATE_PACKS: SampleTemplatePack[] = [
  {
    name: "縦書き二段組",
    files: [
      { name: "defaults.yaml", content: tateDefaults },
      { name: "tate-twocolumn.tex", content: tateTemplate },
      { name: "preamble.tex", content: tatePreamble },
      { name: "aozora-ruby.lua", content: tateRuby },
    ],
  },
  {
    name: "情報系論文風",
    files: [
      { name: "defaults.yaml", content: infoDefaults },
      { name: "info-paper.tex", content: infoTemplate },
      { name: "preamble.tex", content: infoPreamble },
      { name: "simple-table.lua", content: infoTable },
    ],
  },
  {
    // pLaTeX 専用クラス（情報処理学会 ipsj 等）用の土台。LuaLaTeX で動くクラス
    // （ltjsarticle / 情報系論文風）ではなく、pLaTeX/upLaTeX 専用 .cls を使う場合。
    // ipsj.cls は著作権で同梱できないため、ユーザーに公式配布物を配置してもらう
    // （defaults.yaml のコメントに手順）。partial 全除外の自前テンプレで pTeX 非互換
    // パッケージを回避し、3 つの Lua フィルタで pLaTeX+dvi 経路特有の問題を解決する。
    name: "pLaTeX学会論文",
    files: [
      { name: "defaults.yaml", content: platexDefaults },
      { name: "template.tex", content: platexTemplate },
      { name: "preamble.tex", content: platexPreamble },
      { name: "sanitize-images.lua", content: platexSanitize },
      { name: "simple-table.lua", content: platexTable },
      { name: "code-blocks.lua", content: platexCode },
      { name: "sample.md", content: platexSample },
    ],
  },
];

/**
 * テンプレートフォルダ直下に置くガイド文書（ADR-008 の拡張）。
 *
 * SKILL.md（パック自作ガイド）と README.md（使い方）を、テンプレートフォルダの
 * 初回 scaffold 時に展開する。パック（defaults.yaml を含むサブフォルダ）とは違い、
 * これらはフォルダ直下のファイルでパック扱いされない。sampleTemplatePacks と同じく
 * 「存在しない場合だけ作る」原則で、ユーザー編集を上書きしない。
 */
export const TEMPLATE_DOC_FILES: SampleTemplateFile[] = [
  { name: "SKILL.md", content: skillDoc },
  { name: "README.md", content: readmeDoc },
];
