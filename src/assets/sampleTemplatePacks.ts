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
];
