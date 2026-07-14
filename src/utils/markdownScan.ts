// File: src/utils/markdownScan.ts
// Purpose: Markdown 行レベル構文の読み取りヘルパ（インラインコード区間検出・CommonMark
//   フェンス開閉行判定）を1箇所に集約する。
// Reason: crossrefLabels.ts（ラベル抽出/除去）と markdownTransforms.ts（WikiLink アンラップ）が
//   同じバッククォート長マッチングループ（約30行）と同じフェンス行正規表現をそれぞれ再実装し、
//   intra-file でも inter-file でも重複していた（thermo-nuclear review #2 / #5）。
//   「インラインコード内か」「フェンス行か」の意味が漂着しないよう、単一の真実源にする。
// Related: src/utils/crossrefLabels.ts, src/utils/markdownTransforms.ts

/**
 * 1行内のインラインコード区間（`code` / ``code`` 等）の [start, end) を全て返す。
 *
 * 開きバッククォートの本数と同じ本数の閉じバッククォートの対のみを区間とする
 * （CommonMark のコードスパン規則の近似）。crossrefLabels の2関数で同一だった
 * バッククォート長マッチングループをここへ集約した。
 */
export function findInlineCodeRanges(line: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
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
        ranges.push([i, l]);
        i = l;
        closed = true;
        break;
      }
      k = l;
    }
    if (!closed) i = j;
  }
  return ranges;
}

/**
 * findInlineCodeRanges の結果から「位置 pos がインラインコード内か」を判定する述語を作る。
 * ラベル抽出/除去の誤爆防止（コード内の {#fig:x} を触らない）に使う。
 */
export function makeInlineCodeGuard(
  ranges: Array<[number, number]>,
): (pos: number) => boolean {
  return pos => ranges.some(([s, e]) => pos >= s && pos < e);
}

/**
 * CommonMark 互換のフェンス開閉行（行頭に0個以上の空白 + (``` または ~~~) 3本以上）か。
 *
 * crossrefLabels と markdownTransforms で同一だった `^\s*(`{3,}|~{3,})` を1箇所に集約した。
 * 開き・閉じの区別は持たない（行単位の形状判定のみ）。
 */
const FENCE_LINE_REGEX = /^\s*(`{3,}|~{3,})/;
export function isFenceLine(line: string): boolean {
  return FENCE_LINE_REGEX.test(line);
}
