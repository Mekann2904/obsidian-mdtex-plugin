// File: src/utils/codelisting.integration.test.ts
// Purpose: DEFAULT_LATEX_PREAMBLE が Pandoc 3.8+ 形式の codelisting（キャプション付き
//   コードブロック）を含む文書を実際に PDF 生成できるか検証する。
// Reason: Pandoc 3.8 以降はキャプション付きコードブロックを \begin{codelisting}...で
//   出力し、codelisting 環境は newfloat による別途定義が必要。定義なしだと
//   「! LaTeX Error: Environment codelisting undefined.」で停止する回帰を、実際の
//   lualatex コンパイルで固定する。lualatex が無い環境（CI 等）では自動スキップ。
// 注意: DEFAULT_LATEX_PREAMBLE には unicode-math + amssymb の既知のシンボル衝突
//   （\eth 等）が別途存在する。本テストは codelisting 単体の検証に集中するため、
//   amssymb を除去した最小構成でコンパイルする（衝突は別 issue で扱う）。
// Related: src/MdTexPluginSettings.ts, src/utils/latexPreamble.test.ts

import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { DEFAULT_LATEX_PREAMBLE } from "../MdTexPluginSettings";
import { ensureCodelistingEnvironment } from "./latexPreamble";

function lualatexAvailable(): boolean {
  try {
    const res = spawnSync("lualatex", ["--version"], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

// lualatex の PDF コンパイルは（初回フォントキャッシュ構築等もあり）4–6s 程を要する。
// vitest 既定の testTimeout 5000ms では負荷時に timerace で落ちるため、十分な猶予を持たせる。
const LUALATEX_TEST_TIMEOUT = 30000;
const it_lua = (name: string, fn: () => void) =>
  (lualatexAvailable() ? it : it.skip)(name, fn, LUALATEX_TEST_TIMEOUT);

// DEFAULT_LATEX_PREAMBLE は --include-in-header 相当（\documentclass を持たない）。
// codelisting 検証に集中するため、別件の unicode-math/amssymb 衝突を回避して組み立てる。
function buildCompilableTex(): string {
  // amssymb 行を除去（unicode-math と衝突する \eth 等。別 issue 扱い）
  const preamble = DEFAULT_LATEX_PREAMBLE.replace(
    /\\usepackage\{amssymb\}\n/g,
    "",
  );
  return (
    `\\documentclass{article}\n${preamble}\n\\begin{document}\n` +
    // Pandoc 3.8+ が出力する形式（キャプション付きコードブロック）
    "\\begin{codelisting}[h]\n\\caption{サンプルコード}\\label{lst:example}\n" +
    "\\begin{lstlisting}[language=Python]\nprint(\"hello\")\n\\end{lstlisting}\n" +
    "\\end{codelisting}\n" +
    // キャプション無しコードブロック（従来形式）も併存確認
    "\\begin{lstlisting}[language=Python]\nprint(\"plain\")\n\\end{lstlisting}\n" +
    "\\end{document}\n"
  );
}

describe("DEFAULT_LATEX_PREAMBLE: codelisting の PDF コンパイル（lualatex）", () => {
  it_lua("キャプション付きコードブロック(codelisting)が PDF を生成する（undefined 停止しない）", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdtex-codelist-itest-"));
    try {
      const texPath = path.join(dir, "codelist.tex");
      fs.writeFileSync(texPath, buildCompilableTex(), "utf8");

      const res = spawnSync(
        "lualatex",
        ["-interaction=nonstopmode", "-halt-on-error", "codelist.tex"],
        { cwd: dir, stdio: "pipe", encoding: "utf8" },
      );

      const pdfPath = path.join(dir, "codelist.pdf");
      expect(
        res.status,
        `lualatex は終了コード0のはず。出力抜粋:\n${(res.stdout || "") + (res.stderr || "")}`.slice(0, 800),
      ).toBe(0);
      expect(fs.existsSync(pdfPath), "PDF が生成される").toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// 旧版からの移行等で codelisting 定義が欠けた独自プリアンブルが、
// ensureCodelistingEnvironment によって救済されることを実コンパイルで固定する。
// 「Environment codelisting undefined.」で停止しないことの回帰ガード。
describe("ensureCodelistingEnvironment: 独自プリアンブルの codelisting 補完（lualatex）", () => {
  it_lua("codelisting 未定義の独自プリアンブルでも PDF を生成する", () => {
    // DEFAULT_LATEX_PREAMBLE を使わず listings のみを持つ独自プリアンブルを模擬
    const customPreamble = [
      "\\usepackage{listings}",
      "\\lstset{basicstyle=\\ttfamily}",
    ].join("\n");
    const preamble = ensureCodelistingEnvironment(customPreamble);
    expect(preamble).toMatch(/\]\s*\{codelisting\}/);

    const tex =
      `\\documentclass{article}\n${preamble}\n\\begin{document}\n` +
      "\\begin{codelisting}[h]\n\\caption{sample}\\label{lst:ex}\n" +
      "\\begin{lstlisting}[language=Python]\nprint(\"hi\")\n\\end{lstlisting}\n" +
      "\\end{codelisting}\n\\end{document}\n";

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdtex-codelist-inject-"));
    try {
      const texPath = path.join(dir, "inject.tex");
      fs.writeFileSync(texPath, tex, "utf8");
      const res = spawnSync(
        "lualatex",
        ["-interaction=nonstopmode", "-halt-on-error", "inject.tex"],
        { cwd: dir, stdio: "pipe", encoding: "utf8" },
      );
      const pdfPath = path.join(dir, "inject.pdf");
      expect(
        res.status,
        `lualatex は終了コード0のはず。出力抜粋:\n${(res.stdout || "") + (res.stderr || "")}`.slice(0, 800),
      ).toBe(0);
      expect(fs.existsSync(pdfPath), "PDF が生成される").toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
