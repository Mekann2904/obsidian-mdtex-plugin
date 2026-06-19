// File: src/assets/mermaidFilter.integration.test.ts
// Purpose: mermaid コードブロックの言語削除を Lua フィルタで実現できるか、実 Pandoc で検証する。
// Reason: stripMermaidLanguage（TS 正規表現）を Lua フィルタへ移行する前の前提検証。
//   「--listings 指定時に言語なしコードブロックが unknown language 警告を出さず、
//    言語あり mermaid ブロックと同じくプレーン lstlisting として出力されるか」
//   を確認する。Pandoc が無い環境では自動スキップ。
// Related: src/assets/mermaid-filter.ts（移行後に作成）, src/services/convertService.ts,
//   src/services/docxTexFilter.integration.test.ts, docs/design-decisions.md (ADR-005)

import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// 移行予定の Lua フィルタ: CodeBlock の言語が mermaid の場合、言語属性を削除する。
const MERMAID_STRIP_LUA = `
function CodeBlock(el)
  if el.classes:includes("mermaid") then
    -- 言語クラスをすべて削除し、プレーンコードブロックにする
    local newAttrs = pandoc.Attr(el.identifier, {}, el.attributes)
    return pandoc.CodeBlock(el.text, newAttrs)
  end
  return nil
end
`;

const INPUT_FORMAT =
  "markdown+raw_tex+raw_html+fenced_divs+raw_attribute+fenced_code_attributes";

function pandocAvailable(): boolean {
  try {
    const res = spawnSync("pandoc", ["--version"], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

const it_pandoc = pandocAvailable() ? it : it.skip;

function runPandoc(args: string[], input?: string) {
  return spawnSync("pandoc", args, { encoding: "utf8", input });
}

describe("mermaid 言語削除 Lua フィルタ: 実 Pandoc 検証", () => {
  it_pandoc("ベースライン: 言語あり mermaid は --listings で警告/エラーの元になる", () => {
    // 現状の stripMermaidLanguage が回避しようとしている問題を再現。
    // mermaid 言語付きを --listings で LaTeX 出力すると lstlisting に language= が付く。
    const md = "```mermaid\ngraph LR\nA-->B\n```\n";
    const res = runPandoc(
      ["-f", INPUT_FORMAT, "-t", "latex", "--listings"],
      md,
    );
    expect(res.status).toBe(0);
    // lstlisting が生成されること
    expect(res.stdout).toContain("lstlisting");
  });

  it_pandoc("言語なしコードブロックは --listings で言語指定なし lstlisting になる", () => {
    // stripMermaidLanguage の目標状態: 言語指定なし。
    const md = "```\ngraph LR\nA-->B\n```\n";
    const res = runPandoc(
      ["-f", INPUT_FORMAT, "-t", "latex", "--listings"],
      md,
    );
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("lstlisting");
    // language= Mermaid のような言語指定が出力されないこと
    expect(res.stdout).not.toMatch(/language\s*=\s*[Mm]ermaid/);
  });

  it_pandoc("Lua フィルタで mermaid 言語を削除できる（LaTeX 出力が言語なしと一致）", () => {
    // 移行の核心検証: mermaid 言語付き + Lua フィルタ の出力が、
    // 言語なしコードブロックの出力と（lstlisting 部分で）一致するか。
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mdtex-mermaid-"));
    const lua = path.join(sandbox, "mermaid.lua");
    fs.writeFileSync(lua, MERMAID_STRIP_LUA, "utf8");
    try {
      const withLangFiltered = runPandoc(
        ["-f", INPUT_FORMAT, "-t", "latex", "--listings", "--lua-filter", lua],
        "```mermaid\ngraph LR\nA-->B\n```\n",
      );
      const noLang = runPandoc(
        ["-f", INPUT_FORMAT, "-t", "latex", "--listings"],
        "```\ngraph LR\nA-->B\n```\n",
      );
      expect(withLangFiltered.status).toBe(0);
      expect(noLang.status).toBe(0);
      // 両者の lstlisting ブロックが一致すること（言語削除が成功した証明）
      expect(withLangFiltered.stdout).toBe(noLang.stdout);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it_pandoc("Lua フィルタは mermaid 以外のコードブロック（python 等）に触れない", () => {
    // 副作用確認: 他言語のコードブロックの言語属性は保持される。
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mdtex-mermaid-"));
    const lua = path.join(sandbox, "mermaid.lua");
    fs.writeFileSync(lua, MERMAID_STRIP_LUA, "utf8");
    try {
      const res = runPandoc(
        ["-f", INPUT_FORMAT, "-t", "latex", "--listings", "--lua-filter", lua],
        "```python\nprint('hi')\n```\n",
      );
      expect(res.status).toBe(0);
      // python の言語指定が保持されていること
      expect(res.stdout).toMatch(/[Pp]ython/);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it_pandoc("Lua フィルタは複数の mermaid ブロックをすべて処理する", () => {
    // 複数ブロック・間にテキストがある場合も漏れなく処理されるか。
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mdtex-mermaid-"));
    const lua = path.join(sandbox, "mermaid.lua");
    fs.writeFileSync(lua, MERMAID_STRIP_LUA, "utf8");
    try {
      const md = [
        "# Title",
        "",
        "```mermaid",
        "graph LR",
        "A-->B",
        "```",
        "",
        "text between",
        "",
        "```mermaid",
        "sequenceDiagram",
        "A->>B: Hi",
        "```",
        "",
      ].join("\n");
      const filtered = runPandoc(
        ["-f", INPUT_FORMAT, "-t", "latex", "--listings", "--lua-filter", lua],
        md,
      );
      expect(filtered.status).toBe(0);
      // language= Mermaid が一切出現しないこと（両ブロックとも処理された証明）
      expect(filtered.stdout).not.toMatch(/language\s*=\s*[Mm]ermaid/);
      // lstlisting が2つ生成されること
      const count = (filtered.stdout.match(/\\begin\{lstlisting\}/g) || []).length;
      expect(count).toBe(2);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
