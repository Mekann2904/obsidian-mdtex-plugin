// File: src/cli/normalize.test.ts
// Purpose: normalizeForCli の検証。本文正規化パイプライン（stripObsidianComments +
//          detectDuplicateLabels）の統合を観測する。各ステップの詳細は個別テストに委ね、
//          ここでは「パイプラインが正しい順序・形状で結果を返す」ことを検証する。
// Related: src/cli/normalize.ts, src/utils/stripObsidianComments.ts, src/utils/crossrefLabels.ts

import { describe, expect, it } from "vitest";
import { normalizeForCli } from "./normalize";

describe("normalizeForCli", () => {
  it("Obsidian コメント (%% %%) を除去する", () => {
    const result = normalizeForCli("本文 %% 非表示コメント %% 続き");
    expect(result.content).not.toContain("非表示コメント");
    expect(result.content).toContain("本文");
    expect(result.content).toContain("続き");
  });

  it("crossref ラベルの重複を検出する", () => {
    const md = "![[a.png]]{#fig:hoge}\n\n![[b.png]]{#fig:hoge}";
    const result = normalizeForCli(md);
    expect(result.duplicateLabels).toEqual([{ label: "fig:hoge", count: 2 }]);
  });

  it("重複が無ければ空配列", () => {
    const result = normalizeForCli("普通の本文でラベルもない");
    expect(result.duplicateLabels).toEqual([]);
  });

  it("コメント無しの本文は content がそのまま（detectDuplicateLabels は content 不変）", () => {
    const md = "![図](x.png){#fig:one}";
    const result = normalizeForCli(md);
    expect(result.content).toBe(md);
  });
});
