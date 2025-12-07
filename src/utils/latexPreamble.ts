// File: src/utils/latexPreamble.ts
// Purpose: LaTeXプリアンブル文字列のクリーニングとPandoc向けYAML整形を行うユーティリティを提供する。
// Reason: ユーザー設定のヘッダーから不要要素を除去し、安全にheader-includesへ渡すため。
// Related: src/services/convertService.ts, src/MdTexPluginSettings.ts, src/utils/markdownTransforms.ts

export function cleanLatexPreamble(latexCode: string): string {
  if (!latexCode) return "";

  const lines = latexCode.split("\n");

  const cleaned = lines
    .map((line) => {
      // 行中のエスケープされていない % 以降を削除（コメント扱い）
      const withoutComment = line.replace(/(?<!\\)%.*$/, "");
      return withoutComment.trim();
    })
    .filter((line) => {
      if (line === "") return false;
      if (line.startsWith("---")) return false;
      if (line.startsWith("header-includes:")) return false;
      if (line.startsWith("- |")) return false;
      return true;
    })
    .join("\n")
    .replace(/(\r?\n){2,}/g, "\n\n")
    .trim();

  return cleaned;
}

export function wrapLatexInYaml(latexCode: string): string {
  const body = latexCode.trim();
  if (!body) return "";
  const yamlItems = body
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
  return `---\nheader-includes:\n  - |\n${yamlItems}\n---\n`;
}

export const escapeForLatexCommand = (text: string): string =>
  text
    .replace(/\\/g, "\\textbackslash{}").replace(/\{/g, "\\{").replace(/\}/g, "\\}")
    .replace(/\^/g, "\\^").replace(/\~/g, "\\~{}").
    replace(/#/g, "\\#").replace(/%/g, "\\%")
    .replace(/&/g, "\\&").replace(/\$/g, "\\$")
    .replace(/_/g, "\\_");

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
  const safe = (val: string) => escapeForLatexCommand(val || "");

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

  const block = [
    latexCode.trim(),
    "\\makeatletter",
    ...overrides,
    "\\makeatother",
  ].filter(Boolean).join("\n\n");

  return block.trim();
}
