// File: src/utils/headerBuilder.ts
// Purpose: --include-in-header に渡す LaTeX ヘッダ全体を組み立てる純粋関数を提供する。
// Reason: convertCurrentPage の orchestration（Pandoc 実行・I/O・例外処理）からヘッダ構築
//   ロジックを分離し、段階ごとの意味（codelisting 補完・callout preamble・label overrides・
//   ページ番号スニペット・draft スニペット）を独立してテスト可能にするため（issue #51）。
// Related: src/services/convertService.ts, src/utils/latexPreamble.ts, src/utils/calloutTheme.ts, src/MdTexPluginSettings.ts

import { ProfileSettings } from "../MdTexPluginSettings";
import { appendLabelOverrides, ensureCodelistingEnvironment } from "./latexPreamble";
import { CALLOUT_PREAMBLE } from "./calloutTheme";

/**
 * ヘッダ組み立てに必要なオプション。
 *
 * - `mode`: 文書テンプレート方式（ADR-007）。`"defaults"` のとき文書の「枠」（プリアンブル
 *   本体・キャプション名・ページ番号）は defaults file 側で管理するため、これらの段を
 *   スキップし、CALLOUT_PREAMBLE と codelisting 補完だけを残す。
 * - `draft`: draft モードか（`--draft` 引数または frontmatter `mdtex.draft`）。true のとき
 *   graphicx draft スニペットをヘッダ先頭に付与する。
 */
export interface BuildHeaderOptions {
  mode: "builtin" | "defaults";
  draft: boolean;
}

/**
 * --include-in-header に渡す LaTeX ヘッダ全体を組み立てる純粋関数（issue #51）。
 *
 * 以下の 5 段階の変換を順に適用し、1 つの文字列にまとめる:
 * 1. baseHeader        : ユーザー設定プリアンブル（defaults 方式では空）
 * 2. withCallout       : Obsidian コールアウト定義（CALLOUT_PREAMBLE）の付与と、codelisting
 *                        浮動体環境（Pandoc 3.8+ の --listings 互換）の補完
 * 3. headerWithListings: crossref-OFF 時のキャプション語 \renewcommand フォールバック
 * 4. pageNumberSnippet : usePageNumber=OFF 時の plain→empty 差し替え（タイトルページ無番号化）
 * 5. draftSnippet      : draft モード時の graphicx draft スニペット
 *
 * 方式（mode）の意味付けと各段の根拠は関数内のコメントを参照。純粋関数のため
 * I/O を持たず、ユニットテストで header 内容を直接検証できる。
 *
 * @returns ヘッダファイルに書き出す LaTeX 文字列（末尾改行は含まない。呼び出し側で付与）
 */
export function buildHeader(
  profile: ProfileSettings,
  options: BuildHeaderOptions,
): string {
  const { mode, draft } = options;
  const isDefaultsMode = mode === "defaults";

  // --- 1. baseHeader ---
  // defaults 方式では headerIncludes も defaults file 側の include-in-header で管理するため
  // 空扱いとし、CALLOUT_PREAMBLE と codelisting 定義だけを残す。
  const baseHeader = isDefaultsMode ? "" : profile.headerIncludes || "";

  // --- 2. withCallout（callout preamble 付与 + codelisting 補完）---
  // ユーザー設定プリアンブルにコールアウト定義を付与する。プリアンブルは生 .tex として
  // --include-in-header で渡すため、YAML(header-includes) 時代のクリーニングは行わず、
  // ユーザー設定 + コールアウト定義をそのまま素通りさせる。既に obsidiancallout が含まれて
  // いる場合は二重定義を避けて追加しない。
  const withCalloutBase = baseHeader.includes("obsidiancallout")
    ? baseHeader
    : `${baseHeader.trim()}\n\n${CALLOUT_PREAMBLE}`.trim();
  // Pandoc 3.8+ は --listings 時にキャプション付きコードブロックを \begin{codelisting} で
  // 出力する。codelisting 環境は DEFAULT_LATEX_PREAMBLE に定義済みだが、旧版からの移行等で
  // 独自プリアンブルを持つ場合は定義が欠け「Environment codelisting undefined.」で停止するため、
  // 欠けていれば冪等に補完する。defaults 方式でも --listings を常時付与するため補完は維持する。
  const withCallout = ensureCodelistingEnvironment(withCalloutBase);

  // --- 3. headerWithListings（label overrides）---
  // crossref-ON 時はキャプション語／参照接頭辞をメタデータ経路（--metadata-file /
  // frontmatter）に一本化し、\renewcommand との二重管理を避ける。crossref-OFF 時は
  // メタデータの消費先がないため、プロファイル値で LaTeX ネイティブのキャプション名
  // （\figurename 等）を上書きするフォールバックを残す。defaults 方式ではキャプション名も
  // defaults file 側で管理するため appendLabelOverrides はスキップする（builtin + crossref-OFF
  // のみ注入）。
  const headerWithListings =
    isDefaultsMode || profile.usePandocCrossref
      ? withCallout
      : appendLabelOverrides(withCallout, {
          figureLabel: profile.figureLabel,
          figPrefix: profile.figPrefix,
          tableLabel: profile.tableLabel,
          tblPrefix: profile.tblPrefix,
          codeLabel: profile.codeLabel,
          lstPrefix: profile.lstPrefix,
          equationLabel: profile.equationLabel,
          eqnPrefix: profile.eqnPrefix,
        });

  // --- 4. pageNumberSnippet ---
  // LaTeX の \maketitle はタイトルページを強制的に plain スタイルにする。ページ番号を
  // オフにしても、plain スタイルのままだと1ページ目だけ数字が出る。plain → empty に
  // 差し替えてタイトルページも無番号に統一する。defaults 方式ではページ番号制御も
  // defaults file 側で管理するためスキップする。
  const pageNumberSnippet =
    isDefaultsMode || profile.usePageNumber
      ? ""
      : "\\makeatletter\\let\\ps@plain\\ps@empty\\makeatother";

  // --- 5. draftSnippet ---
  // draft モード時、graphicx に draft オプションを渡して画像をプレースホルダ化する。
  const draftSnippet = draft
    ? [
        "\\def\\isdraft{1}",
        "\\PassOptionsToPackage{draft}{graphicx}",
        "\\makeatletter\\Gin@drafttrue\\makeatother",
      ].join("\n")
    : "";

  // 結合: draft スニペット → ページ番号スニペット → 本体 の順。
  // いずれも独立した LaTeX 文であり順序依存がないため、存在する段だけ改行で繋ぐ
  //（headerWithListings は常に非空なので join 結果が空になることはない）。
  return [draftSnippet, pageNumberSnippet, headerWithListings]
    .filter(Boolean)
    .join("\n");
}
