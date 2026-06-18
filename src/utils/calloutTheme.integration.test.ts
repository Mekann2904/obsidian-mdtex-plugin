// File: src/utils/calloutTheme.integration.test.ts
// Purpose: CALLOUT_PREAMBLE が callout 使用時に実際に LaTeX(PDF) 生成できるか検証する。
// Reason: \newtcolorbox オプション内の空行が \par となり、本文の \begin{obsidiancallout}
//   で "Paragraph ended before \pgfkeys@addpath was complete" が発生して PDF 生成が
//   停止する回帰（callout 使用文書でのみ発火）を、実際の lualatex コンパイルで固定する。
//   ユニットテストの構造ガード(calloutTheme.test.ts)と違い、こちらは挙動を検証する
//   正しい seam。lualatex が無い環境（CI 等）では自動スキップする。
// Related: src/utils/calloutTheme.ts, src/services/docxTexFilter.integration.test.ts

import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { CALLOUT_PREAMBLE } from "./calloutTheme";

function lualatexAvailable(): boolean {
  try {
    const res = spawnSync("lualatex", ["--version"], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

const it_lua = lualatexAvailable() ? it : it.skip;

// CALLOUT_PREAMBLE は --include-in-header 相当（\documentclass を持たない）なので、
// コンパイル可能な .tex に組み立てるために最小の documentclass で包む。
function buildCompilableTex(): string {
  return `\\documentclass{article}\n${CALLOUT_PREAMBLE}\n\\begin{document}\n` +
    "\\begin{obsidiancallout}{callout-memo}{}{Memo}\n" +
    "This is a memo callout body.\n" +
    "\\end{obsidiancallout}\n" +
    "\\begin{obsidiancallout}{callout-warning}{}{Warning}\n" +
    "This is a warning callout body.\n" +
    "\\end{obsidiancallout}\n" +
    "\\end{document}\n";
}

describe("CALLOUT_PREAMBLE: callout の PDF コンパイル（lualatex）", () => {
  it_lua("callout(memo/warning) を含む文書が PDF を生成する（pgfkeys 停止しない）", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdtex-callout-itest-"));
    try {
      const texPath = path.join(dir, "callout.tex");
      fs.writeFileSync(texPath, buildCompilableTex(), "utf8");

      const res = spawnSync(
        "lualatex",
        ["-interaction=nonstopmode", "-halt-on-error", "callout.tex"],
        { cwd: dir, stdio: "pipe", encoding: "utf8" },
      );

      const pdfPath = path.join(dir, "callout.pdf");
      expect(
        res.status,
        `lualatex は終了コード0のはず。stderr/log 抜粋:\n${(res.stdout || "") + (res.stderr || "")}`.slice(0, 800),
      ).toBe(0);
      expect(fs.existsSync(pdfPath), "PDF が生成される").toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
