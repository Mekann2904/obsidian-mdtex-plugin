// File: src/utils/bibstyleResolve.ts
// Purpose: natbib + bibtex の bibstyle 衝突を反応型に解決する純粋関数群（ADR-009）。
// Reason: 学会公式クラス（ACL 等）が \bibliographystyle を内蔵し、Pandoc の --natbib が挿入する
//          \bibliographystyle{plainnat} と衝突して bibtex が "Illegal, another \bibstyle" で
//          死ぬ問題を、クラスを知らなくても解決する。.aux の実態を見て分岐するため汎用。
// Related: src/services/convertService.ts, src/services/pandocCommandBuilder.ts, CONTEXT.md (bibstyle 衝突)

/**
 * LaTeX の `.aux` ファイルから `\bibstyle{...}` エントリを抽出する（ADR-009）。
 *
 * `.aux` 内の `\bibstyle{X}` 行（bibtex が参照スタイルとして読む）を全て抜き出し、
 * スタイル名（`X`）の配列を返す。Pandoc は `\bibliographystyle{plainnat}` を `.aux` に
 * `\bibstyle{plainnat}` として書き、クラス（例: acl.sty）は自身の `\bibliographystyle{acl_natbib}`
 * 実行で `\bibstyle{acl_natbib}` を書く。両方存在すると衝突する。
 *
 * 純粋関数: `.aux` のテキスト内容をそのまま受け取り、I/O を持たない。
 */
export function extractAuxBibstyles(auxContent: string): string[] {
  const styles: string[] = [];
  // \bibstyle{NAME} を捕捉。NAME は bst ファイル名（空白/括弧なし）を想定。
  const re = /\\bibstyle\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(auxContent ?? "")) !== null) {
    const name = m[1].trim();
    if (name) styles.push(name);
  }
  return styles;
}

/**
 * `.aux` の bibstyle 一覧から、クラス/パッケージが自身の bibstyle を提供しているか判定する（ADR-009）。
 *
 * Pandoc の `--natbib` は常に `\bibstyle{plainnat}` を1つ出す。したがって plainnat **以外**の
 * bibstyle が1つでもあれば、それはクラス/パッケージ由来と断定できる（ユーザーが `-V biblio-style`
 * で独自 bst を指定した場合も同様で、その場合も plainnat を除去してユーザー指定を生かすのが正しい）。
 *
 * true のとき呼び出し側は `\bibliographystyle{plainnat}` 行を `.tex` から除去する。
 * plainnat のみ、または bibstyle が無い場合は false（何もしない）。
 */
export function hasClassProvidedBibstyle(auxBibstyles: string[]): boolean {
  return auxBibstyles.some(s => s !== "plainnat");
}

/**
 * LaTeX ソース（`.tex`）から `\bibliographystyle{plainnat}` 行を除去する（ADR-009）。
 *
 * 反応型解決の適用フェーズで使う。Pandoc が `--natbib` 時に出す plainnat 行だけを（行単位で）
 * 取り除く。ユーザーが本文の raw LaTeX で書いた `\bibliographystyle{...}` や、plainnat 以外の
 * スタイル指定は触らない。行頭の空白と行末を許容し、取り除いた行の改行も消す。
 */
export function stripPlainnatBibstyle(texContent: string): string {
  // \bibliographystyle{plainnat} のみ（引数が plainnat ちょうど）を行から除去。
  // {plainnat} の直後に % コメントや他のトークンが続く行は触らない（誤爆回避）。
  return (texContent ?? "")
    .split("\n")
    .filter(line => !/^\s*\\bibliographystyle\{plainnat\}\s*$/.test(line))
    .join("\n");
}
