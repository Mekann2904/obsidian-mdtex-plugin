// File: src/utils/calloutTheme.test.ts
// Purpose: CALLOUT_PREAMBLE の構造的回帰ガード。
// Reason: \newtcolorbox オプション定義内の空行は LaTeX で \par となり、本文の
//   \begin{obsidiancallout} で pgfkeys が停止する実害バグの再発を防ぐ。
// Related: src/utils/calloutTheme.ts, src/services/calloutTheme.integration.test.ts

import { describe, expect, it } from "vitest";
import { CALLOUT_PREAMBLE } from "./calloutTheme";

describe("CALLOUT_PREAMBLE", () => {
  it("obsidiancallout オプション定義内に空行を含まない（\\par で pgfkeys が停止する回帰）", () => {
    // \newtcolorbox{obsidiancallout}[3]{% から対応する閉じ } までを抽出する。
    const startIdx = CALLOUT_PREAMBLE.indexOf("\\newtcolorbox{obsidiancallout}");
    expect(startIdx, "obsidiancallout 定義が存在する").toBeGreaterThan(-1);

    const afterStart = CALLOUT_PREAMBLE.slice(startIdx);
    // オプションブロックは "%\n" の後の単独 "}" で終わる。
    const endMatch = afterStart.match(/\n\}\n/);
    expect(endMatch, "オプションブロックが閉じている").not.toBeNull();
    const block = afterStart.slice(0, (endMatch!.index as number) + 2);

    // 各行について、空行（空白のみを含まない完全な空行）があってはならない。
    // コメント行 (% ...) は改行を吸収するため許容される。
    const blankLines: number[] = [];
    block.split("\n").forEach((line, i) => {
      if (line.trim() === "") blankLines.push(i);
    });

    expect(
      { blankLineCount: blankLines.length, blankLines },
      "オプション定義内に空行（\\par になる）が存在しないこと",
    ).toMatchObject({ blankLineCount: 0 });
  });

  it("obsidiancallout は3引数を取り、borderline west と title で #1/#2/#3 を参照する", () => {
    expect(CALLOUT_PREAMBLE).toContain("\\newtcolorbox{obsidiancallout}[3]{%");
    expect(CALLOUT_PREAMBLE).toContain("borderline west={3pt}{0pt}{#1}");
    expect(CALLOUT_PREAMBLE).toContain("title={#2\\hspace{0.5em}#3}");
  });
});
