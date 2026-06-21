// File: src/utils/frontmatter.ts
// Purpose: Markdown 文書の frontmatter（YAML `---` / TOML `+++`）の分離と、draft 要求の解決
//   （`--draft` 引数 + frontmatter の `mdtex.draft`）を 1 箇所で担う。これまで frontmatter の分離が
//   convertService（YAML のみ）と lintService（YAML+TOML）で別々の正規表現として重複し、draft 判定
//   （引数 parseDraftFlag / frontmatter detectDraft）の所有者も不在だったのを集約する（候補 3）。
// Reason: frontmatter の境界認識は処理境界（lint の本文分離・draft の読み取り・Pandoc へのメタデータ優先度）
//   に直結するが、同一概念に adapter が 2 つあった。1 つの seam に集約し、テスト面を 1 つにする。
//   開区切りの正規表現は CRLF（\r\n）と LF（\n）両方を許容する（元 draft 実装が \s* で許容していた
//   \r を、lint 由来の [\t\x20]* への統一で誤って落としていた後退を修正）。
// Related: src/services/convertService.ts, src/services/lintService.ts

/**
 * 文書冒頭の frontmatter 形式。
 * - "yaml": `---` で囲まれた YAML ブロック
 * - "toml": `+++` ... `+++` / `...` で囲まれた TOML ブロック
 * - "none": frontmatter なし
 */
export type FrontmatterFormat = "yaml" | "toml" | "none";

/**
 * frontmatter の分離結果。
 * - `raw`: 区切り文字を含む frontmatter ブロック全体。存在しないときは ""。
 *   lint 等で「frontmatter を温存して本文だけ処理」する呼び出し側がそのまま prepend できる形。
 * - `inner`: 区切り文字を除いた中身。draft 読み取り等の構文解析に使う。
 * - `body`: frontmatter 以降の本文。
 * - `format`: frontmatter の形式。
 */
export interface FrontmatterSplit {
  raw: string;
  inner: string;
  body: string;
  format: FrontmatterFormat;
}

const NO_FRONTMATTER: FrontmatterSplit = { raw: "", inner: "", body: "", format: "none" };

// 冒頭の frontmatter を認識する。YAML は `---`、TOML は `+++` で囲む。
// 区切り行の直後にはタブ/水平空白のみを許容し（CommonMark 互換）、行終端は CRLF/LF 両方を許容する。
const YAML_FRONTMATTER = /^(---[\t\x20]*\r?\n)([\s\S]*?)\r?\n(---[\t\x20]*\r?\n?)/;
const TOML_FRONTMATTER = /^(\+\+\+[\t\x20]*\r?\n)([\s\S]*?)\r?\n(\+\+\+|\.\.\.)[\t\x20]*\r?\n?/;

/**
 * 文書を frontmatter ブロックと本文に分離する（YAML / TOML 両対応）。
 *
 * 純粋関数。frontmatter が無ければ `format: "none"` で `raw`/`inner` が空の `body` のみを返す。
 */
export function splitFrontmatter(markdown: string): FrontmatterSplit {
  if (!markdown) return { ...NO_FRONTMATTER, body: markdown };

  const yamlMatch = markdown.match(YAML_FRONTMATTER);
  if (yamlMatch) {
    const raw = yamlMatch[0];
    return { raw, inner: yamlMatch[2], body: markdown.slice(raw.length), format: "yaml" };
  }

  const tomlMatch = markdown.match(TOML_FRONTMATTER);
  if (tomlMatch) {
    const raw = tomlMatch[0];
    return { raw, inner: tomlMatch[2], body: markdown.slice(raw.length), format: "toml" };
  }

  return { ...NO_FRONTMATTER, body: markdown };
}

/**
 * frontmatter（`mdtex.draft` / `mdtex:` ブロック内 `draft`）から draft 要求を読む。
 *
 * `--draft` 引数由来の判定はここではなく呼び出し側（convertService の parseDraftFlag）で行う。
 * 本関数は文書 frontmatter のみを見る。YAML frontmatter のみ対応（元実装と同一挙動）。
 *
 * 読み取る書き方:
 * - `mdtex.draft: true` / `mdtex.draft: false`（ドット記法）
 * - `mdtex:` ブロック直下の `draft: true`（インデントされたマップ）
 * - `mdtex: draft`（単行・boolean 省略で true 扱い）
 * - `mdtex:` ブロック内のリスト要素 `- draft` / `- true` / `- 1` / `- yes`
 *
 * 純粋関数。
 */
export function isDraftRequested(markdown: string): boolean {
  const split = splitFrontmatter(markdown);
  if (split.format !== "yaml") return false;

  const lines = split.inner.split(/\r?\n/);
  let inMdtexBlock = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // mdtex: draft: true  もしくは mdtex: draft (boolean省略)
    if (/^mdtex\.draft\s*:/i.test(line)) {
      const val = line.split(":")[1]?.trim() || "true";
      return isAffirmative(val);
    }

    // mdtex:（ブロック開始、または単行で値を持つ）
    if (/^mdtex\s*:/i.test(line)) {
      inMdtexBlock = true;
      const val = line.split(":")[1]?.trim();
      if (val) {
        // 単行で mdtex: draft と書かれた場合を true とみなす
        return isAffirmative(val);
      }
      continue;
    }

    // インデントされた mdtex ブロック内の draft: true
    if (inMdtexBlock && /^draft\s*:/i.test(line)) {
      const val = line.split(":")[1]?.trim() || "true";
      return isAffirmative(val);
    }

    if (inMdtexBlock && /^-\s*(draft|true|1|yes)$/i.test(line)) {
      return true;
    }

    // 別ブロックに移行したらリセット
    if (!raw.startsWith(" ") && !raw.startsWith("\t")) {
      inMdtexBlock = false;
    }
  }

  return false;
}

/** YAML の boolean 値文字列を「draft 有効」かどうかに変換する（false/0 以外は true）。 */
function isAffirmative(value: string): boolean {
  return value.toLowerCase() !== "false" && value !== "0";
}

/**
 * draft 解決の結果。draft の所有者を frontmatter.ts 1 箇所に集約する（候補 3）。
 */
export interface DraftResolution {
  /** draft フラグ（`--draft` / `--draft=`）を除去した残りの Pandoc 追加引数 */
  pandocExtraArgs: string[];
  /** draft 要求があるか（`--draft` 引数 OR frontmatter の `mdtex.draft`） */
  draftRequested: boolean;
}

/**
 * Pandoc 追加引数（スペース区切り）から `--draft` / `--draft=<bool>` を抜き出し、残りを返す。
 * draft は LaTeX（graphicx）にだけ伝えるもので Pandoc 引数ではないため、Pandoc 起動前に分離する。
 *
 * 純粋関数。
 */
export function parseDraftFlag(extraArgs: string): { extras: string[]; isDraft: boolean } {
  if (!extraArgs || !extraArgs.trim()) return { extras: [], isDraft: false };

  let isDraft = false;
  const extras = extraArgs.split(/\s+/).filter(arg => {
    if (arg === "--draft") {
      isDraft = true;
      return false;
    }
    if (arg.startsWith("--draft=")) {
      const value = arg.split("=")[1]?.toLowerCase();
      isDraft = value !== "0" && value !== "false";
      return false;
    }
    return !!arg;
  });

  return { extras, isDraft };
}

/**
 * draft 要求を1箇所で解決する（`--draft` 引数 + frontmatter の `mdtex.draft`）。
 * draft の所有者を明確にするため、引数解析（parseDraftFlag）と frontmatter 読み取り
 * （isDraftRequested）を統合した単一の入口を提供する（候補 3）。
 *
 * 純粋関数。
 */
export function resolveDraftRequest(extraArgs: string, markdown: string): DraftResolution {
  const { extras, isDraft } = parseDraftFlag(extraArgs);
  return { pandocExtraArgs: extras, draftRequested: isDraft || isDraftRequested(markdown) };
}
