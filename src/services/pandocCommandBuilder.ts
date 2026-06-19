// File: src/services/pandocCommandBuilder.ts
// Purpose: Pandoc 実行コマンドの生成を純粋関数として切り出す。
// Reason: コマンド生成をテストしやすくし、プロセス実行から分離するため。
// Related: src/services/convertService.ts, src/utils/processRunner.ts, src/MdTexPluginSettings.ts, vitest.config.ts

import { isDefaultsTemplateMode, ProfileSettings } from "../MdTexPluginSettings";
import { normalizeFsPath, normalizeResourcePathList } from "../utils/pathHelpers";

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

  args.push(...getInputFormatArgs(options.format));

  // 文書テンプレート方式（ADR-007）: defaults 方式は defaults file（`-d`）に文書の「枠」を委譲する。
  // コマンドライン `-V` は defaults file より優先されてしまうため、documentclass 系の `-V` は
  // 後段で生成せず、枠の構築を完全に defaults file 側へ渡す。`-d` は他のコマンドライン引数より
  // 早い位置に置き、以降の明示引数（フォーマット・エンジン等）が defaults file を上書きする
  // 方向（MdTex が所有する項目が勝つ）にする。
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
    args.push(`--pdf-engine=${profile.latexEngine}`);
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
 * Pandoc の入力フォーマット引数（`-f`）を返す。
 *
 * 全出力形式（pdf/latex/docx）で共通の Markdown 拡張セットを明示する。
 * Pandoc 3.x のデフォルト `markdown` は `+raw_tex +raw_html +fenced_divs
 * +raw_attribute +fenced_code_attributes` をすべて ON で含むため、これらは
 * 挙動を変えない冗長な再指定になるが、プラグインが依存する構文
 * （生 LaTeX / `:::` fenced div / `{=latex}` `{=openxml}` raw block /
 * `{#lst:...}` コード属性）を Pandoc のバージョン差や設定ドリフトに
 * 依存せず安定して有効化するため明示する。
 *
 * `format` は歴史的に出力形式ごとの分岐に使われていた引数だが、現状は
 * すべて同じ結果を返す。呼び出し側（`buildPandocCommand`）の意図と API
 * 安定性を保つため受け取り続け、分岐は行わない。
 */
export function getInputFormatArgs(format: string): string[] {
  return ["-f", "markdown+raw_tex+raw_html+fenced_divs+raw_attribute+fenced_code_attributes"];
}

export function filterPandocExtrasForFormat(extras: string[], format: string): string[] {
  if (!extras.length) return [];
  return extras.filter(arg => {
    if (format !== "docx" && arg.startsWith("--reference-doc")) return false;
    return true;
  });
}
