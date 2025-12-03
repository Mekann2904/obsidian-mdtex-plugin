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

export function appendListingOverrides(latexCode: string, codeLabel: string, lstPrefix: string): string {
  const nameCmd = escapeForLatexCommand(codeLabel);
  const listCmd = escapeForLatexCommand(lstPrefix);

  const overrides = `\\makeatletter
\\AtBeginDocument{
  \\renewcommand{\\lstlistingname}{${nameCmd}}
  \\renewcommand{\\lstlistlistingname}{${listCmd}}
}
\\makeatother`;

  return [latexCode.trim(), overrides].filter(Boolean).join("\n\n");
}
