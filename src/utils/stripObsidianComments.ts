// File: src/utils/stripObsidianComments.ts
// Purpose: Obsidian の `%% ... %%` コメントを Pandoc 受理前に除去する純粋関数。
//          obsidian 非依存（GUI/CLI 共有）。markdownTransforms.ts から切り出し。
// Reason: 純粋関数を obsidian 依存モジュールから解放し、CLI バンドルから直接 import できるようにするため。
// Related: src/utils/markdownTransforms.ts（re-export で後方互換）, src/services/normalizeMarkdown.ts, src/cli/convert.ts, src/utils/markdownScan.ts

import { findInlineCodeRanges } from "./markdownScan";

/**
 * Obsidian の `%% ... %%` コメントを Pandoc へ渡す前に取り除く。
 * コードフェンス内は手を付けない。
 */
export function stripObsidianComments(markdown: string): string {
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n"; // 元の改行を尊重
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];

  let inFence = false;
  let fenceMarker: "`" | "~" | null = null;
  let fenceLen = 0;

  let inComment = false;
  let inMathBlock = false;

  // 0–3空白 + （引用 > 可） + ``` または ~~~ をフェンスとみなす
  const fenceRegex = /^\s{0,3}(?:>\s*)*([`~]{3,})/;

  const buildProtectedRanges = (line: string): Array<[number, number]> => {
    // インラインコード区間は markdownScan の共有ヘルパで取得（canonical helper の再利用・thermo-nuclear review 第3ラウンド #1）。
    const ranges: Array<[number, number]> = [...findInlineCodeRanges(line)];

    // 行内の $$...$$ を保護（同一行で閉じる場合）
    let m: RegExpExecArray | null;
    const displayMathInline = /\$\$[^$]*?\$\$/g;
    while ((m = displayMathInline.exec(line))) {
      ranges.push([m.index, m.index + m[0].length]);
    }

    // 行内の $...$ を保護（単ドル記号、$$ は除外）
    const inlineMath = /\$(?!\$)[^$\n]*?(?<!\\)\$(?!\$)/g;
    while ((m = inlineMath.exec(line))) {
      ranges.push([m.index, m.index + m[0].length]);
    }

    return ranges.sort((a, b) => a[0] - b[0]);
  };

  const isInRanges = (pos: number, ranges: Array<[number, number]>): boolean =>
    ranges.some(([s, e]) => pos >= s && pos < e);

  for (const line of lines) {
    const protectedRanges = buildProtectedRanges(line);

    // 数式ブロック中は内容を素通ししつつ $$ を数えて閉じる
    if (inMathBlock) {
      let toggles = 0;
      let idx = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const pos = line.indexOf("$$", idx);
        if (pos === -1) break;
        if (!isInRanges(pos, protectedRanges)) toggles += 1;
        idx = pos + 2;
      }
      if (toggles % 2 === 1) inMathBlock = false;
      output.push(line);
      continue;
    }

    // コメント中はフェンスを無視して漏れを防ぐ
    let fenceHandled = false;
    if (!inComment) {
      const fenceMatch = fenceRegex.exec(line);
      if (fenceMatch) {
        const run = fenceMatch[1];
        const marker = run[0] as "`" | "~";
        const len = run.length;

        if (!inFence) {
          inFence = true;
          fenceMarker = marker;
          fenceLen = len;
        } else if (fenceMarker === marker && len >= fenceLen) {
          inFence = false;
          fenceMarker = null;
          fenceLen = 0;
        }
        output.push(line);
        fenceHandled = true;
        continue;
      }

      if (inFence) {
        output.push(line);
        continue;
      }
    }

    let lineOut = "";
    let cursor = 0;

    while (cursor < line.length) {
      const idx = line.indexOf("%%", cursor);
      if (idx === -1) {
        if (!inComment) lineOut += line.slice(cursor);
        break;
      }

      if (isInRanges(idx, protectedRanges)) {
        // 保護区間（インラインコード / 数式）に入った %% はコメント走査対象にしない。
        // 従来は区間終端まで読み飛ばすだけで lineOut へ出力しておらず、結果として
        // コード/数式の中身ごと出力から落ちていた（C1/C2/D2 のバグ）。
        // 修正: 保護区間は「そのまま出力に残す」べきなので、区間内容を lineOut へコピーする。
        const range = protectedRanges.find(([s, e]) => idx >= s && idx < e)!;
        if (!inComment && range[0] > cursor) {
          lineOut += line.slice(cursor, range[0]);
        }
        // コメント中でない限り、保護区間全体をそのまま出力へ残す。
        // コメント中の場合は区間内でコメントが始まっていることはない（%% は区間外でのみ開始）
        // ので、cursor を進めるだけで出力しない。
        if (!inComment) {
          lineOut += line.slice(range[0], range[1]);
        }
        cursor = range[1];
        continue;
      }

      if (!inComment) {
        lineOut += line.slice(cursor, idx);
        inComment = true;
        cursor = idx + 2;
        continue;
      }

      // コメント中: 最初に見つかった %% を終了とみなし、その後を処理継続
      inComment = false;
      cursor = idx + 2;
    }

    if (!inComment) {
      // コメントを閉じた同一行でフェンスが現れるケースをカバー
      if (!fenceHandled) {
        const fenceMatch = fenceRegex.exec(lineOut);
        if (fenceMatch) {
          const run = fenceMatch[1];
          const marker = run[0] as "`" | "~";
          const len = run.length;

          if (!inFence) {
            inFence = true;
            fenceMarker = marker;
            fenceLen = len;
          } else if (fenceMarker === marker && len >= fenceLen) {
            inFence = false;
            fenceMarker = null;
            fenceLen = 0;
          }
        }
      }

      // コメント除去後の lineOut に対して $$ トグル（フェンス外でのみ）
      let toggles = 0;
      let idx = 0;
      const protectedAfter = buildProtectedRanges(lineOut);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const pos = lineOut.indexOf("$$", idx);
        if (pos === -1) break;
        if (!isInRanges(pos, protectedAfter)) toggles += 1;
        idx = pos + 2;
      }
      if (toggles % 2 === 1) inMathBlock = !inMathBlock;

      output.push(lineOut);
    } else if (lineOut.length) {
      // コメント開始前に出力した分は残す
      output.push(lineOut);
    }
  }

  return output.join(newline);
}
