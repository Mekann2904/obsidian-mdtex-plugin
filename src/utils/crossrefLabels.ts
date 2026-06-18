// File: src/utils/crossrefLabels.ts
// Purpose: pandoc-crossref のラベル（{#fig:X} 等）と参照（[@fig:X]）の名前空間化・
//   重複検出のための共通処理を提供する。
// Reason: 別ファイルをトランスクルージョンで埋め込むと、crossref のラベル名前空間が
//   グローバル（文書全体で一意）なため同名ラベルが衝突する（ADR-005 関連）。
//   埋め込み先のラベルに「ファイル名プレフィックス」を付与することで別ファイル由来の
//   衝突を自動解決し、同一ファイル内の重複は detectDuplicateLabels で検出して通知する。
// Related: src/utils/transclusion.ts, src/suggest/labelParser.ts, src/suggest/LabelReferenceSuggest.ts,
//   src/services/convertService.ts, docs/design-decisions.md (ADR-005), CONTEXT.md

// crossref が扱う接頭辞。ユーザー明示の {#prefix:id} のみ対象（自動採番は含まない）。
export const CROSSREF_PREFIXES = ["fig", "tbl", "lst", "eq", "sec"] as const;
export type CrossrefPrefix = (typeof CROSSREF_PREFIXES)[number];

const PREFIX_ALTERNATIVES = CROSSREF_PREFIXES.join("|");

/**
 * ファイル名からラベルプレフィックス用の slug を生成する。
 * 例: "mdtex_test_sub.md" → "mdtex_test_sub"
 *     "docs/notes/sub.md" → "sub"（basename のみ使用）
 *
 * basename のみを使う理由: フルパスだと長くなりすぎ、補完で読みにくくなるため。
 * ファイル名の衝突（同 basename 別ディレクトリ）は稀で、その場合は重複検出が警告する。
 */
export function fileSlug(filePath: string): string {
  const basename = filePath.split("/").pop() ?? filePath;
  const withoutExt = basename.replace(/\.[^.]+$/, "");
  // ラベル文字として安全な文字のみ残す（crossref ラベルは [a-zA-Z0-9:_-]）
  return withoutExt.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * 元のラベル（prefix:id 形式）にファイル名プレフィックスを付与する。
 * 例: namespacedLabel("fig", "hoge", "mdtex_test_sub.md") → "fig:mdtex_test_sub-hoge"
 *
 * 生成規則: {prefix}:{fileSlug}-{originalId}
 * 既にファイル名プレフィックスが付与済み（二重リライト）は避けないが、
 * 埋め込み先が入れ子で展開される場合のみ呼ばれるため、メイン文書のラベルは通過しない。
 */
export function namespacedLabel(
  labelPrefix: CrossrefPrefix,
  labelId: string,
  sourceFilePath: string,
): string {
  return `${labelPrefix}:${fileSlug(sourceFilePath)}-${labelId}`;
}

// {#fig:hoge} / {#lst:demo caption="..."} のような属性ブロックからラベルを抽出する。
// capture: [0]=全体 [1]=prefix [2]=id [3]=caption(任意)
const LABEL_ATTR_REGEX = new RegExp(
  `\\{#(${PREFIX_ALTERNATIVES}):([a-zA-Z0-9:_-]+)(?:\\s+caption="([^"]*)")?(?=\\s|\\})`,
);

export interface ExtractedLabel {
  prefix: CrossrefPrefix;
  id: string;
  caption?: string;
  // 元の {#...} 文字列全体（リライト時の置換元として使用）
  raw: string;
  // マッチした全体文字列中の開始/終了位置（リライト時の位置特定用）
  index: number;
  endIndex: number;
}

/**
 * Markdown から {#prefix:id} 形式のラベルをすべて抽出する。
 * コードフェンス内・インラインコード内はスキップする（誤検知防止）。
 * ただし「フェンス開始行自体に付与された {#lst:...} 属性」（Pandoc のキャプション付きコードブロック）
 * はブロックのラベルなので抽出対象とする。
 */
export function extractRawLabels(markdown: string): ExtractedLabel[] {
  const results: ExtractedLabel[] = [];
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  // フェンス開始/閉じ行: 0個以上の空白 + (``` または ~~~) 3本以上。
  const fenceLineRegex = /^\s*(`{3,}|~{3,})/;

  for (const line of lines) {
    const isFenceLine = fenceLineRegex.test(line);
    if (isFenceLine) {
      // フェンス開始行に付与された {#lst:...} は抽出対象（コードブロックのラベル）。
      // 但し「フェンスの内部」に入った後は除外。
      if (!inFence) {
        pushLabelsFromLine(line, results);
      }
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    pushLabelsFromLine(line, results);
  }
  return results;
}

// 1行からインラインコードを保護しつつ {#prefix:id} を抽出して results へ push する。
function pushLabelsFromLine(line: string, results: ExtractedLabel[]): void {
  const inlineCodeRanges: Array<[number, number]> = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      i += 1;
      continue;
    }
    let j = i;
    while (j < line.length && line[j] === "`") j += 1;
    const openLen = j - i;
    let k = j;
    let closed = false;
    while (k < line.length) {
      if (line[k] !== "`") {
        k += 1;
        continue;
      }
      let l = k;
      while (l < line.length && line[l] === "`") l += 1;
      if (l - k === openLen) {
        inlineCodeRanges.push([i, l]);
        i = l;
        closed = true;
        break;
      }
      k = l;
    }
    if (!closed) i = j;
  }
  const isProtected = (pos: number) =>
    inlineCodeRanges.some(([s, e]) => pos >= s && pos < e);

  let m: RegExpExecArray | null;
  const global = new RegExp(LABEL_ATTR_REGEX.source, "g");
  while ((m = global.exec(line)) !== null) {
    if (isProtected(m.index)) continue;
    const prefix = m[1] as CrossrefPrefix;
    results.push({
      prefix,
      id: m[2],
      caption: m[3],
      raw: m[0],
      index: m.index,
      endIndex: m.index + m[0].length,
    });
  }
}

/**
 * 埋め込み先ファイルの内容に含まれるラベルと参照を、ファイル名プレフィックス付きへリライトする。
 *
 * - {#fig:hoge} → {#fig:{slug}-hoge}（caption 等の追加属性は保持）
 * - [@fig:hoge] → [@fig:{slug}-hoge]
 *
 * 同一ファイル内で labels と refs を一貫してリライトするため、メイン文書は
 * （sourceFilePath が与えられない限り）そのまま通過する。
 */
export function namespacedRewrite(content: string, sourceFilePath: string): string {
  const slug = fileSlug(sourceFilePath);
  const prefixPattern = `(${PREFIX_ALTERNATIVES})`;

  // 1) ラベル属性 {#prefix:id ...} の id 部分へ slug を付与
  //    caption="..." 等の後続属性を保持するため、id のみ置換する。
  const labelRegex = new RegExp(
    `\\{#(${prefixPattern}):([a-zA-Z0-9:_-]+)(\\s+caption="(.*?)")?(\\s+[^}]*)?\\}`,
    "g",
  );
  let out = content.replace(
    labelRegex,
    (full, p1: string, _p2: string, id: string, capGroup: string | undefined) => {
      // 二重リライト防止: 既に slug- で始まっていたらそのまま
      if (id.startsWith(`${slug}-`)) return full;
      const newId = `${slug}-${id}`;
      const capPart = capGroup ?? "";
      return `{#${p1}:${newId}${capPart}}`;
    },
  );

  // 2) 参照 [@prefix:id] / @prefix:id の id 部分へ slug を付与
  //    [@fig:hoge] 形式（角括弧付き）と裸の @fig:hoge 両方をカバー。
  //    ただし @fig:{slug}-hoge のように既に slug 付きならスキップ。
  //    capture グループ: [1]=@prefix: 全体 [2]=id
  const refRegex = new RegExp(
    `(@(?:${PREFIX_ALTERNATIVES}):)([a-zA-Z0-9:_-]+)`,
    "g",
  );
  out = out.replace(refRegex, (full, atPrefix: string, id: string) => {
    if (id.startsWith(`${slug}-`)) return full;
    return `${atPrefix}${slug}-${id}`;
  });

  return out;
}

export interface DuplicateLabel {
  label: string; // "fig:hoge" 形式
  count: number;
}

/**
 * 最終 Markdown からラベルを抽出し、重複（同一ラベルの複数回出現）を検出する。
 * メイン文書内のユーザーミスも、同一ファイル複数回埋め込みによる crossref 制約衝突も
 * どちらもここで検出される。
 */
export function detectDuplicateLabels(markdown: string): DuplicateLabel[] {
  const labels = extractRawLabels(markdown);
  const counts = new Map<string, number>();
  for (const l of labels) {
    const key = `${l.prefix}:${l.id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([label, count]) => ({ label, count }));
}
