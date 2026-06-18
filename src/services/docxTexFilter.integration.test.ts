// File: src/services/docxTexFilter.integration.test.ts
// Purpose: DOCX 変換用 Lua フィルタ（DOCX_TEX_LUA_FILTER）が、実 Pandoc でネストした
//   LaTeX を破壊せず AST へ正しく変換できるか、生成 docx の中間表現（XML）まで含めて検証する。
// Reason: 従来の正規表現逆変換は `[^}]+` パターンのため波括弧ネスト・`\{` エスケープに
//   破綻していた（issue #37）。runCommand をモックせず、生成 docx を展開して XML を確認する
//   統合テストにより、AC「ネストした LaTeX が docx でも崩れず太字が保持され脚注が生成される」
//   を回帰テストとして固定する。Pandoc が無い環境（CI 等）では自動スキップする。
// Related: src/assets/docxTexFilter.ts, src/services/pandocCommandBuilder.ts,
//   src/services/pandocInputFormat.integration.test.ts, vitest.config.ts

import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { DOCX_TEX_LUA_FILTER } from "../assets/docxTexFilter";

// プラグインが docx 変換で依存する Pandoc 入力フォーマット指定（pandocCommandBuilder 参照）。
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

function unzipAvailable(): boolean {
  try {
    const res = spawnSync("unzip", ["-v"], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

interface FilterSandbox {
  dir: string;
  lua: string;
}

function makeFilterSandbox(): FilterSandbox {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdtex-docxtest-"));
  const lua = path.join(dir, "docx-tex.lua");
  fs.writeFileSync(lua, DOCX_TEX_LUA_FILTER, "utf8");
  return { dir, lua };
}

function runPandoc(args: string[], input?: string) {
  return spawnSync("pandoc", args, { encoding: "utf8", input });
}

// AST JSON を再帰的に走査し、検証に必要な要素の有無を集計する。
interface AstFacts {
  strongCount: number;
  emphCount: number;
  underlineCount: number;
  noteCount: number;
  codeCount: number;
  openxmlInlineCount: number;
  openxmlBlockCount: number;
  texRawInlineCount: number;
  noteStrongCount: number; // Note 配下の Strong
}

function collectAstFacts(ast: { blocks?: unknown[] }): AstFacts {
  const facts: AstFacts = {
    strongCount: 0,
    emphCount: 0,
    underlineCount: 0,
    noteCount: 0,
    codeCount: 0,
    openxmlInlineCount: 0,
    openxmlBlockCount: 0,
    texRawInlineCount: 0,
    noteStrongCount: 0,
  };

  const isNoteEnv = { value: false };

  const walkInline = (inline: { t?: string; c?: unknown }) => {
    if (!inline || typeof inline !== "object") return;
    const t = inline.t;
    if (t === "Strong") {
      facts.strongCount += 1;
      if (isNoteEnv.value) facts.noteStrongCount += 1;
    } else if (t === "Emph") {
      facts.emphCount += 1;
    } else if (t === "Underline") {
      facts.underlineCount += 1;
    } else if (t === "Code") {
      facts.codeCount += 1;
    } else if (t === "RawInline" && Array.isArray(inline.c)) {
      const fmt = String((inline.c as unknown[])[0]);
      if (fmt === "openxml") facts.openxmlInlineCount += 1;
      if (fmt === "tex") facts.texRawInlineCount += 1;
    }

    if (t === "Note") {
      facts.noteCount += 1;
      const prev = isNoteEnv.value;
      isNoteEnv.value = true;
      const blocks = (inline.c as unknown[]) ?? [];
      if (Array.isArray(blocks)) for (const b of blocks) walkBlock(b);
      isNoteEnv.value = prev;
      return;
    }

    if (Array.isArray(inline.c)) for (const child of inline.c) walkInline(child as never);
  };

  const walkBlock = (block: unknown) => {
    const b = block as { t?: string; c?: unknown };
    if (!b || typeof b !== "object") return;
    if (b.t === "RawBlock" && Array.isArray(b.c)) {
      const fmt = String((b.c as unknown[])[0]);
      if (fmt === "openxml") facts.openxmlBlockCount += 1;
    }
    if (b.t === "Para" && Array.isArray(b.c)) {
      for (const inline of b.c) walkInline(inline as never);
    }
    if (b.t === "Div" && Array.isArray(b.c)) {
      const inner = (b.c as unknown[])[1];
      if (Array.isArray(inner)) for (const child of inner) walkBlock(child);
    }
  };

  walkBlock({ t: "Dummy", c: [ast.blocks] });
  for (const block of ast.blocks ?? []) walkBlock(block);
  return facts;
}

describe.skipIf(!pandocAvailable())(
  "DOCX TeX Lua フィルタ: 実 Pandoc での AST 変換回帰テスト",
  () => {
    it("ネストした \\footnote{\\textbf{重要}な注釈で \\texttt{code}} が Note として生成され内部の太字が保持される", () => {
      const sandbox = makeFilterSandbox();
      try {
        const md = "本文 \\footnote{\\textbf{重要}な注釈で \\texttt{code} も含む} 末尾\n";
        const res = runPandoc(
          ["-f", INPUT_FORMAT, "--lua-filter", sandbox.lua, "-t", "json"],
          md,
        );
        expect(res.status).toBe(0);

        const ast = JSON.parse(res.stdout) as { blocks?: unknown[] };
        const facts = collectAstFacts(ast);

        // 脚注が生成され、その中に太字とコードが保持されている（issue の破綻例の回帰）
        expect(facts.noteCount).toBe(1);
        expect(facts.noteStrongCount).toBe(1);
        expect(facts.codeCount).toBe(1);
        // 文字列破壊の痕跡（不均衡な強調記号等）は RawInline [tex] に漏れなく残らない
        expect(facts.texRawInlineCount).toBe(0);
      } finally {
        fs.rmSync(sandbox.dir, { recursive: true, force: true });
      }
    });

    it("\\textbf{外側\\textit{内側}戻り} が Strong>Emph の正しいネスト構造になる", () => {
      const sandbox = makeFilterSandbox();
      try {
        const md = "\\textbf{外側\\textit{内側}戻り}\n";
        const res = runPandoc(
          ["-f", INPUT_FORMAT, "--lua-filter", sandbox.lua, "-t", "json"],
          md,
        );
        expect(res.status).toBe(0);

        const ast = JSON.parse(res.stdout) as { blocks?: unknown[] };
        const facts = collectAstFacts(ast);

        expect(facts.strongCount).toBe(1);
        expect(facts.emphCount).toBe(1);
        expect(facts.texRawInlineCount).toBe(0);
      } finally {
        fs.rmSync(sandbox.dir, { recursive: true, force: true });
      }
    });

    it("\\textcolor{red}{...} と \\underline{...} がそれぞれ openxml run / Underline になる", () => {
      const sandbox = makeFilterSandbox();
      try {
        const md = "\\textcolor{red}{赤い \\textbf{太} 混在} と \\underline{下線}\n";
        const res = runPandoc(
          ["-f", INPUT_FORMAT, "--lua-filter", sandbox.lua, "-t", "json"],
          md,
        );
        expect(res.status).toBe(0);

        const ast = JSON.parse(res.stdout) as { blocks?: unknown[] };
        const facts = collectAstFacts(ast);

        // textcolor は色付き openxml run へ（文字列破壊なし）
        expect(facts.openxmlInlineCount).toBe(1);
        expect(facts.underlineCount).toBe(1);
      } finally {
        fs.rmSync(sandbox.dir, { recursive: true, force: true });
      }
    });

    it("\\newpage / \\clearpage が openxml のページ区切り RawBlock になる", () => {
      const sandbox = makeFilterSandbox();
      try {
        const md = "前\n\n\\newpage\n\n中\n\n\\clearpage\n\n後\n";
        const res = runPandoc(
          ["-f", INPUT_FORMAT, "--lua-filter", sandbox.lua, "-t", "json"],
          md,
        );
        expect(res.status).toBe(0);

        const ast = JSON.parse(res.stdout) as { blocks?: unknown[] };
        const facts = collectAstFacts(ast);

        expect(facts.openxmlBlockCount).toBe(2);
      } finally {
        fs.rmSync(sandbox.dir, { recursive: true, force: true });
      }
    });
  },
);

describe.skipIf(!pandocAvailable() || !unzipAvailable())(
  "DOCX TeX Lua フィルタ: 生成 docx の中間表現（XML）検証",
  () => {
    function generateDocx(markdown: string): string {
      const sandbox = makeFilterSandbox();
      const outDocx = path.join(sandbox.dir, "out.docx");
      const res = runPandoc(
        ["-f", INPUT_FORMAT, "--lua-filter", sandbox.lua, "-o", outDocx],
        markdown,
      );
      expect(res.status).toBe(0);
      return outDocx;
    }

    function readZipEntry(docxPath: string, entry: string): string {
      const res = spawnSync("unzip", ["-p", docxPath, entry], { encoding: "utf8" });
      expect(res.status).toBe(0);
      return res.stdout;
    }

    it("太字/斜体/下線 が docx の run プロパティとして出力される", () => {
      const docx = generateDocx("\\textbf{太} \\textit{斜} \\underline{下}\n");
      try {
        const xml = readZipEntry(docx, "word/document.xml");
        expect(xml).toMatch(/<w:b[ /]/);
        expect(xml).toMatch(/<w:i[ /]/);
        expect(xml).toMatch(/<w:u\s+w:val="single"/);
      } finally {
        fs.rmSync(path.dirname(docx), { recursive: true, force: true });
      }
    });

    it("ネストした脚注が footnotes.xml に本文として生成され内部の太字が保持される", () => {
      const docx = generateDocx("本文 \\footnote{脚注の\\textbf{中身}} です。\n");
      try {
        const documentXml = readZipEntry(docx, "word/document.xml");
        expect(documentXml).toMatch(/footnoteReference/);

        // 脚注本文は太字部分で run が分割されるため、各トークンと太字プロパティを個別に検証する
        const footnotesXml = readZipEntry(docx, "word/footnotes.xml");
        expect(footnotesXml).toContain("脚注の");
        expect(footnotesXml).toContain("中身");
        expect(footnotesXml).toMatch(/<w:b[ /]/);
      } finally {
        fs.rmSync(path.dirname(docx), { recursive: true, force: true });
      }
    });

    it("\\textcolor が docx の色付き run として出力される", () => {
      const docx = generateDocx("\\textcolor{red}{赤字}\n");
      try {
        const xml = readZipEntry(docx, "word/document.xml");
        expect(xml).toMatch(/<w:color\s+w:val="red"/);
      } finally {
        fs.rmSync(path.dirname(docx), { recursive: true, force: true });
      }
    });

    it("\\newpage が docx のページ区切りとして出力される", () => {
      const docx = generateDocx("前\n\n\\newpage\n\n後\n");
      try {
        const xml = readZipEntry(docx, "word/document.xml");
        expect(xml).toMatch(/w:type="page"/);
      } finally {
        fs.rmSync(path.dirname(docx), { recursive: true, force: true });
      }
    });
  },
);
