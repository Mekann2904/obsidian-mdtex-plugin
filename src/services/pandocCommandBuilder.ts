// File: src/services/pandocCommandBuilder.ts
// Purpose: Pandoc 実行コマンドの生成を純粋関数として切り出す。
// Reason: コマンド生成をテストしやすくし、プロセス実行から分離するため。
// Related: src/services/convertService.ts, src/utils/processRunner.ts, src/MdTexPluginSettings.ts, vitest.config.ts

import { isDefaultsTemplateMode, ProfileSettings } from "../MdTexPluginSettings";
import { normalizeFsPath, normalizeResourcePathList } from "../utils/pathHelpers";
import { normalizeLatexEngine } from "../utils/texDiscover";
import * as path from "path";

export type OutputFormat = "pdf" | "latex" | "docx";

export interface PandocCommandOptions {
  profile: ProfileSettings;
  format: OutputFormat;
  outputPath: string;
  workingDir: string;
  inputPath?: string;
  headerPath?: string;
  // プロファイル既定値のラベル／接頭辞を Pandoc メタデータとして渡す一時 YAML のパス。
  // `-M` ではなく `--metadata-file` 経由にすることで、文書の frontmatter が
  // プロファイル既定値より優先される（Pandoc の precedence: frontmatter > metadata-file）。
  metadataFile?: string;
  extraArgs?: string[];
  luaFilters?: string[];
  resourcePath?: string;
  useStdin?: boolean;
}

export interface PandocCommandResult {
  command: string;
  args: string[];
}

export function buildPandocCommand(options: PandocCommandOptions): PandocCommandResult {
  const profile = options.profile;
  const args: string[] = [];

  if (!options.useStdin && options.inputPath) {
    args.push(normalizeFsPath(options.inputPath));
  }

  args.push(...INPUT_FORMAT_ARGS);

  // 文書テンプレート方式（ADR-007 / ADR-008）: defaults 方式は defaults file（`-d`）に文書の「枠」を委譲する。
  // コマンドライン `-V` は defaults file より優先されてしまうため、documentclass 系の `-V` は
  // 後段で生成せず、枠の構築を完全に defaults file 側へ渡す。`-d` は他のコマンドライン引数より
  // 早い位置に置き、以降の明示引数（フォーマット・エンジン等）が defaults file を上書きする
  // 方向（MdTex が所有する項目が勝つ）にする。
  //
  // profile.defaultsFilePath には、呼び出し側（convertService）が ADR-008 のパス解決
  // （pack: vault 相対→絶対、custom: そのまま）を済ませた最終パスが入っている前提。
  // 純粋関数を保つため、vault I/O を伴う解決はここでは行わない。
  const isDefaults = isDefaultsTemplateMode(profile);
  if (isDefaults) {
    const defaultsPath = profile.defaultsFilePath?.trim();
    if (defaultsPath) args.push("-d", normalizeFsPath(defaultsPath));
  }

  if (options.metadataFile) {
    args.push("--metadata-file", normalizeFsPath(options.metadataFile));
  }

  if (options.headerPath) {
    args.push("--include-in-header", normalizeFsPath(options.headerPath));
  }

  args.push("-o", normalizeFsPath(options.outputPath));

  if (options.format === "pdf") {
    // latexEngine にフルパスが入力されても basename に正規化する（年度更新耐性）。
    // Pandoc は basename を PATH から探す（buildTexAwareEnv で TeX bin が PATH に追加済み）。
    const engineBare = normalizeLatexEngine(profile.latexEngine) || "lualatex";
    args.push(`--pdf-engine=${engineBare}`);
    // ADR-009: latexmk 等の PDF エンジンに追加オプションを渡す。各トークンを
    // --pdf-engine-opt=<token> に展開する（latexmk のサブエンジン指定 -lualatex 等に使用）。
    for (const opt of tokenizePdfEngineOpts(profile.pdfEngineOpts)) {
      args.push(`--pdf-engine-opt=${opt}`);
    }
    // defaults 方式では beamer ターゲット（`-t beamer`）も defaults file の `to:` で管理するため、
    // documentClass 由来の `-t beamer` 生成をスキップする。builtin 方式は現状どおり。
    if (!isDefaults && profile.documentClass === "beamer") args.push("-t", "beamer");
  } else if (options.format === "latex") {
    args.push("-t", "latex");
    if (!isDefaults && profile.documentClass === "beamer") args.push("-t", "beamer");
  } else if (options.format === "docx") {
    args.push("-t", "docx");
  }

  if (options.luaFilters?.length) {
    for (const luaPath of options.luaFilters) {
      if (luaPath) args.push("--lua-filter", normalizeFsPath(luaPath));
    }
  }

  args.push("--listings");

  const resourcePath =
    (options.resourcePath ?? profile.searchDirectory ?? "").trim() || options.workingDir;
  args.push("--resource-path", normalizeResourcePathList(resourcePath));

  if (profile.usePandocCrossref) {
    const crossrefFilter = profile.pandocCrossrefPath.trim() || "pandoc-crossref";
    args.push("-F", crossrefFilter);
  }

  // 図・表・コード・数式のキャプション語／参照接頭辞は `--metadata-file` 経由で
  // プロファイル既定値を渡す。コマンドライン `-M` で渡すと frontmatter より優先
  // されてしまい文書ごとの上書きが効かなくなるため、metadata-file に一本化する。
  // YAML の生成は buildLabelMetadataYaml、ファイル化は buildPandocExecutionPlan が担う。

  // builtin 方式のみ: documentclass / geometry / fontsize 等の `-V` を GUI 設定値から生成する。
  // defaults 方式は defaults file 側で `variables:` を管理するため、これらの `-V` 生成をスキップ
  // する（Pandoc の precedence でコマンドライン `-V` が defaults file を上書きする衝突を回避）。
  if (!isDefaults) {
    if (profile.useMarginSize) args.push("-V", `geometry:margin=${profile.marginSize}`);
    if (!profile.usePageNumber) args.push("-V", "pagestyle=empty");

    if (profile.imageScale?.trim()) {
      args.push("-V", `graphics=${profile.imageScale}`);
    }

    args.push("-V", `fontsize=${profile.fontSize}`);
    args.push("-V", `documentclass=${profile.documentClass}`);
    if (profile.documentClassOptions?.trim())
      args.push("-V", `classoption=${profile.documentClassOptions}`);
  }

  args.push("--highlight-style=tango");

  // ADR-009: citation モードで Markdown の @key / [@key] を LaTeX の引用コマンドへ変換する。
  // --natbib は defaults file で指定できない（実証: Unknown option "natbib"）ためコマンドライン必須。
  // natbib モードは学会公式クラス（acl.sty / acmart 等）が \RequirePackage{natbib} で内蔵する
  // natbib と協調する。bibstyle 衝突の回避は defaults file 側のテンプレート（template:）で行う。
  if (profile.citationMode === "natbib") {
    args.push("--natbib");
  } else if (profile.citationMode === "citeproc") {
    args.push("--citeproc");
  }

  const extraArgs = filterPandocExtrasForFormat(options.extraArgs || [], options.format);
  if (extraArgs.length) args.push(...extraArgs);

  // defaults 方式では standalone 制御も defaults file（`standalone:`）で管理する。これにより
  // `standalone: false` で本文フラグメントを出力するユースケース（CONTEXT.md）が実現できる。
  // builtin 方式は現状どおり GUI の useStandalone で `--standalone` を制御する。
  if (!isDefaults && profile.useStandalone) args.push("--standalone");

  const pandocPath = profile.pandocPath.trim() || "pandoc";
  return { command: pandocPath, args };
}

/**
 * プロファイルのラベル／接頭辞設定を Pandoc（pandoc-crossref）のメタデータ YAML に直す。
 *
 * プロファイル項目と Pandoc/crossref メタデータキーの対応は以下のとおり。
 *   figureLabel -> figureTitle （図キャプション語）
 *   figPrefix   -> figPrefix   （図の参照接頭辞）
 *   tableLabel  -> tableTitle  （表キャプション語）
 *   tblPrefix   -> tblPrefix   （表の参照接頭辞）
 *   codeLabel   -> listingTitle（コードキャプション語）
 *   lstPrefix   -> lstPrefix   （コードの参照接頭辞）
 *   eqnPrefix   -> eqnPrefix   （数式の参照接頭辞）
 *
 * なお `equationLabel`（"Equation"）は crossref に対応する Title 系メタデータキーが
 * 存在しないためここには含まない。crossref-OFF 時の LaTeX ネイティブキャプション
 * フォールバック（`appendLabelOverrides`）経由でのみ意味を持つ。
 *
 * すべての値が空の場合は空文字列を返す（呼び出し側で metadata-file を省略する）。
 * 返す YAML は `--metadata-file` に渡すため、文書 frontmatter よりも優先度が低く、
 * frontmatter > プロファイル既定値 のフォールバックが自然に成立する。
 */
export function buildLabelMetadataYaml(profile: ProfileSettings): string {
  const quote = (v: string) => '"' + (v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  const entries: Array<[string, string]> = [
    ["figureTitle", profile.figureLabel],
    ["figPrefix", profile.figPrefix],
    ["tableTitle", profile.tableLabel],
    ["tblPrefix", profile.tblPrefix],
    ["listingTitle", profile.codeLabel],
    ["lstPrefix", profile.lstPrefix],
    ["eqnPrefix", profile.eqnPrefix],
  ];
  const lines = entries
    .filter(([, v]) => (v ?? "").trim() !== "")
    .map(([k, v]) => `${k}: ${quote(v)}`);
  return lines.length ? lines.join("\n") + "\n" : "";
}

/**
 * Pandoc の入力フォーマット引数（`-f`）。
 *
 * 全出力形式（pdf/latex/docx）で共通の Markdown 拡張セットを明示する。
 * Pandoc 3.x のデフォルト `markdown` は `+raw_tex +raw_html +fenced_divs
 * +raw_attribute +fenced_code_attributes` をすべて ON で含むため、これらは
 * 挙動を変えない冗長な再指定になるが、プラグインが依存する構文
 * （生 LaTeX / `:::` fenced div / `{=latex}` `{=openxml}` raw block /
 * `{#lst:...}` コード属性）を Pandoc のバージョン差や設定ドリフトに
 * 依存せず安定して有効化するため明示する。
 */
const INPUT_FORMAT_ARGS: readonly string[] = [
  "-f",
  "markdown+raw_tex+raw_html+fenced_divs+raw_attribute+fenced_code_attributes",
];

export function filterPandocExtrasForFormat(extras: string[], format: string): string[] {
  if (!extras.length) return [];
  return extras.filter(arg => {
    if (format !== "docx" && arg.startsWith("--reference-doc")) return false;
    return true;
  });
}

/**
 * pdfEngineOpts（スペース区切り文字列）をトークン配列に分割する（ADR-009）。
 *
 * 空白・空トークンを除外する。latexmk のサブエンジン指定（`-lualatex`）や latexmk 固有
 * オプション（`-interaction=nonstopmode`）など、トークン内に空白を含まない単純なフラグ・値を
 * 想定する。各トークンは `--pdf-engine-opt=<token>` として Pandoc に渡される。
 */
function tokenizePdfEngineOpts(opts: string): string[] {
  return (opts ?? "")
    .split(/\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * defaults 方式で選択中テンプレートパックのフォルダを LaTeX の検索パスに注入する（ADR-009）。
 *
 * 学会公式クラス（`acl.sty` / `acmart` 等）や `.bst` / `.bib` をパック内に配置した際、LaTeX
 * （および bibtex）がこれらを発見できるように `TEXINPUTS` / `BIBINPUTS` / `BSTINPUTS` にパック
 * フォルダを追記する。TeX の検索パスは**末尾セパレータで「標準パスも併せて検索」を意味する**
 * ため、必ず末尾にセパレータを付ける（付けないと kpsewhich の標準パスが見えなくなる）。
 *
 * 純粋関数: 既存の環境変数は `existingEnv` で注入可能（既定は `process.env`）。`platform` も
 * 外から渡せ、POSIX は `:`・Windows は `;` をセパレータに使う。defaults 方式でない、または
 * `defaultsFilePath` が空のときは空オブジェクトを返す（呼び出し側で空なら上書きしない）。
 *
 * `defaultsFilePath` は呼び出し側（convertService）が ADR-008 のパス解決を済ませた
 * **解決済み絶対パス**が入っている前提。純粋関数を保つため、vault I/O を伴う解決は行わない。
 */
export function buildLatexSearchEnv(
  profile: ProfileSettings,
  platform: NodeJS.Platform,
  existingEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (!isDefaultsTemplateMode(profile)) return {};
  const defaultsPath = profile.defaultsFilePath?.trim();
  if (!defaultsPath) return {};

  // platform に応じて posix / win32 の path API を使い分ける。Node の既定の path は実行 OS
  // 依存で、darwin 上で Windows パスを dirname すると `.` になる（純粋関数テストで顕在化）。
  // 区切り文字（delimiter）も OS 依存（POSIX は ':'、Windows は ';'）。
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const packDir = pathApi.dirname(defaultsPath);
  const sep = pathApi.delimiter;
  return {
    TEXINPUTS: appendSearchPath(existingEnv.TEXINPUTS, packDir, sep),
    BIBINPUTS: appendSearchPath(existingEnv.BIBINPUTS, packDir, sep),
    BSTINPUTS: appendSearchPath(existingEnv.BSTINPUTS, packDir, sep),
  };
}

/**
 * TeX の検索パス変数の既存値の末尾に `dir` を追加し、さらにセパレータで終える。
 * `existing` が undefined / 空文字のときは `dir` 単独＋末尾セパレータを返す。
 */
function appendSearchPath(
  existing: string | undefined,
  dir: string,
  sep: string,
): string {
  const base = existing && existing.length > 0 ? existing + sep : "";
  return `${base}${dir}${sep}`;
}
