// File: src/utils/latexPreamble.ts
// Purpose: LaTeXプリアンブルの組み立て（相互参照ラベル名上書き・codelisting 補完）を行うユーティリティを提供する。
// Reason: ユーザー設定のプリアンブル + コールアウト定義に対し、安全にラベル上書きを追記するため。
//   また Pandoc 3.8+ が必要とする codelisting 浮動体環境の定義が欠けている場合は冪等に補完する。
// Related: src/services/convertService.ts, src/MdTexPluginSettings.ts, src/utils/latexEscape.ts

import { escapeLatex } from "./latexEscape";

export interface LabelOverrides {
  figureLabel: string;
  figPrefix: string;
  tableLabel: string;
  tblPrefix: string;
  codeLabel: string;
  lstPrefix: string;
  equationLabel: string;
  eqnPrefix: string;
}

export function appendLabelOverrides(latexCode: string, labels: LabelOverrides): string {
  const safe = (val: string) => escapeLatex(val || "");

  const overrides: string[] = [
    labels.figureLabel ? `\\renewcommand{\\figurename}{${safe(labels.figureLabel)}}` : "",
    labels.tableLabel ? `\\renewcommand{\\tablename}{${safe(labels.tableLabel)}}` : "",
    labels.codeLabel ? `\\renewcommand{\\lstlistingname}{${safe(labels.codeLabel)}}` : "",
    labels.lstPrefix ? `\\renewcommand{\\lstlistlistingname}{${safe(labels.lstPrefix)}}` : "",
    labels.equationLabel
      ? `\\providecommand{\\equationautorefname}{${safe(labels.equationLabel)}}\\renewcommand{\\equationautorefname}{${safe(labels.equationLabel)}}`
      : "",
  ].filter(Boolean);

  if (!overrides.length) return latexCode.trim();

  const block = [latexCode.trim(), "\\makeatletter", ...overrides, "\\makeatother"]
    .filter(Boolean)
    .join("\n\n");

  return block.trim();
}

/**
 * Pandoc 3.8+ の --listings 互換 codelisting 浮動体環境の定義ブロック。
 * DEFAULT_LATEX_PREAMBLE に含まれるものと同等。
 */
const CODELISTING_ENV_SNIPPET = `% codelisting 浮動体環境（Pandoc 3.8+ の --listings 互換）
% Pandoc 3.8 以降はキャプション付きコードブロックを \\begin{codelisting}...\\end{codelisting}
% として出力するが、codelisting 環境は listings パッケージに含まれず newfloat で別途
% 定義が必要。これがないと「! LaTeX Error: Environment codelisting undefined.」で停止する。
\\usepackage{newfloat}
\\DeclareFloatingEnvironment[
  fileext=lol,
  listname={List of Listings},
  name=Listing
]{codelisting}`;

/**
 * ユーザー設定プリアンブルに codelisting 浮動体環境の定義が無ければ補完する。
 *
 * Pandoc 3.8+ は --listings 指定時にキャプション付きコードブロックを
 * \begin{codelisting}...\end{codelisting} として出力するが、codelisting 環境は
 * listings パッケージに含まれず newfloat による別途定義が必要。
 * DEFAULT_LATEX_PREAMBLE には定義済みだが、独自プリアンブル（旧版からの移行や
 * 「デフォルトにリセット」未実施の環境）では欠けることがあり、その場合
 * 「! LaTeX Error: Environment codelisting undefined.」で PDF 生成が停止する。
 * 本関数は定義が無い場合のみ冪等に補完し、既存定義は尊重する。
 */
export function ensureCodelistingEnvironment(preamble: string): string {
  const trimmed = (preamble ?? "").trim();
  if (!trimmed) return CODELISTING_ENV_SNIPPET;

  // 宣言は複数行にまたがり得るため、空白を正規化してから定義有無を判定する。
  const flat = trimmed.replace(/\s+/g, " ");
  const defined =
    /\\(Declare|Setup)FloatingEnvironment(?:\[[^\]]*\])?\{codelisting\}/.test(flat) ||
    /\\newenvironment\{codelisting\}/.test(flat);

  return defined ? trimmed : `${trimmed}\n\n${CODELISTING_ENV_SNIPPET}`.trim();
}
