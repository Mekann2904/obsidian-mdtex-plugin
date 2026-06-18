// File: src/utils/latexEscape.ts
// Purpose: LaTeX 特殊文字のエスケープ処理を一元化する。
// Reason: 変換パイプライン（キャプション・リンクテキスト・Listingキャプション）と
//   プリアンブル組み立て（相互参照ラベル上書き）でほぼ同機能のエスケープ関数が
//   重複していたのを一本化し、エスケープ対象の不整合を防ぐため。
// Related: src/utils/latexPreamble.ts, src/utils/markdownTransforms.ts

const LATEX_ESCAPE_MAP: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "^": "\\textasciicircum{}",
  "~": "\\textasciitilde{}",
  "#": "\\#",
  "%": "\\%",
  "&": "\\&",
  "$": "\\$",
  "_": "\\_",
};

/**
 * 文字列中の LaTeX 特殊文字をリテラル出力させるためにエスケープする。
 * 単一パスで元の文字ごとに置換するため、`\textbackslash{}` の `{}` `}` が
 * 再エスケープされることはない。
 */
export const escapeLatex = (text: string): string =>
  text.replace(/[\\{}^~#%&$_]/g, ch => LATEX_ESCAPE_MAP[ch] ?? ch);
