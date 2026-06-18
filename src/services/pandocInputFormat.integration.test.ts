// File: src/services/pandocInputFormat.integration.test.ts
// Purpose: 統一された入力フォーマット引数が、実際の Pandoc で生 LaTeX /
//   fenced div / {=latex}{=openxml} raw block / コード属性を正しくパースできるかを検証する。
// Reason: コマンド構築の単体テストだけでは拡張の「意味」を検証できないため、
//   実 Pandoc を通じた回帰テストを置く。Pandoc が無い環境（CI 等）では自動スキップする。
// Related: src/services/pandocCommandBuilder.ts, src/services/pandocCommandBuilder.test.ts, vitest.config.ts

import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildPandocCommand, OutputFormat } from "./pandocCommandBuilder";
import { createDefaultProfile } from "./profileManager";

function pandocAvailable(): boolean {
  try {
    const res = spawnSync("pandoc", ["--version"], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

// `-f` の値（入力フォーマット指定）を構築済み引数から取り出す。
function extractInputFormatSpec(args: string[]): string {
  const shortIdx = args.indexOf("-f");
  if (shortIdx >= 0 && shortIdx + 1 < args.length) return args[shortIdx + 1];
  const longIdx = args.findIndex(a => a.startsWith("--from="));
  if (longIdx >= 0) return args[longIdx].slice("--from=".length);
  throw new Error("input format spec (-f/--from=) not found in pandoc args");
}

interface AstSummary {
  rawBlockFormats: Set<string>;
  rawInlineFormats: Set<string>;
  divCount: number;
  codeBlockIds: string[];
}

// Pandoc の native JSON AST から検証に必要な要素を集計する。
function summarizeAst(ast: { blocks?: unknown[] }): AstSummary {
  const summary: AstSummary = {
    rawBlockFormats: new Set<string>(),
    rawInlineFormats: new Set<string>(),
    divCount: 0,
    codeBlockIds: [],
  };

  const collectInline = (inline: { t?: string; c?: unknown }) => {
    if (inline?.t === "RawInline" && Array.isArray(inline.c)) {
      summary.rawInlineFormats.add(String((inline.c as unknown[])[0]));
    }
  };

  const walk = (blocks: unknown[]) => {
    for (const block of blocks) {
      const b = block as { t?: string; c?: unknown };
      if (!b || typeof b !== "object") continue;
      if (b.t === "RawBlock" && Array.isArray(b.c)) {
        summary.rawBlockFormats.add(String((b.c as unknown[])[0]));
      } else if (b.t === "Div" && Array.isArray(b.c)) {
        summary.divCount += 1;
        const inner = (b.c as unknown[])[1];
        if (Array.isArray(inner)) walk(inner as unknown[]);
      } else if (b.t === "CodeBlock" && Array.isArray(b.c)) {
        const attr = (b.c as unknown[])[0];
        if (Array.isArray(attr)) summary.codeBlockIds.push(String((attr as unknown[])[0]));
      } else if (b.t === "Para" && Array.isArray(b.c)) {
        for (const inline of b.c as unknown[]) collectInline(inline as { t?: string; c?: unknown });
      }
    }
  };

  walk(Array.isArray(ast.blocks) ? ast.blocks : []);
  return summary;
}

// 検証用 Markdown: 全出力形式で必要な構文を網羅する。
const SNIPPET = [
  "\\clearpage",
  "",
  "::: center",
  "centered text here",
  ":::",
  "",
  "```{=latex}",
  "\\textbf{raw latex block}",
  "```",
  "",
  "`<b>raw html inline</b>`{=html}",
  "",
  "```{=openxml}",
  "<w:p><w:r><w:t>raw openxml block</w:t></w:r></w:p>",
  "```",
  "",
  '```{#lst:demo caption="captioned"}',
  'print("hi")',
  "```",
  "",
].join("\n");

describe.skipIf(!pandocAvailable())(
  "入力フォーマット統一: 実 Pandoc での構文パース回帰テスト",
  () => {
    const formats: OutputFormat[] = ["pdf", "latex", "docx"];

    it("全形式のビルド結果が同一の入力フォーマット引数を持つ", () => {
      const profile = createDefaultProfile();
      const specs = formats.map(fmt =>
        extractInputFormatSpec(
          buildPandocCommand({
            profile,
            format: fmt,
            outputPath: path.join(os.tmpdir(), "out"),
            workingDir: os.tmpdir(),
          }).args,
        ),
      );
      expect(new Set(specs).size).toBe(1);
    });

    it.each(formats)(
      "形式 %s で生 LaTeX / fenced div / raw block / コード属性がパースされる",
      format => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mdtex-fmt-"));
        const mdPath = path.join(tmpDir, "snippet.md");
        fs.writeFileSync(mdPath, SNIPPET, "utf8");

        try {
          const profile = createDefaultProfile();
          const args = buildPandocCommand({
            profile,
            format,
            outputPath: path.join(tmpDir, "out"),
            workingDir: tmpDir,
          }).args;
          const spec = extractInputFormatSpec(args);

          // 構築した -f 指定で実 Pandoc を動かし、AST を検証する。
          const result = spawnSync("pandoc", ["-f", spec, "-t", "json", mdPath], {
            encoding: "utf8",
          });
          expect(result.status).toBe(0);
          expect(result.stdout).not.toBe("");

          const ast = JSON.parse(result.stdout) as { blocks?: unknown[] };
          const summary = summarizeAst(ast);

          // raw_tex: \clearpage が raw TeX ブロックとして認識される
          expect(summary.rawBlockFormats.has("tex")).toBe(true);
          // fenced_divs: ::: center が Div として認識される
          expect(summary.divCount).toBeGreaterThanOrEqual(1);
          // raw_attribute: {=latex} raw block が認識される
          expect(summary.rawBlockFormats.has("latex")).toBe(true);
          // raw_attribute: {=openxml} raw block が認識される
          expect(summary.rawBlockFormats.has("openxml")).toBe(true);
          // raw_html + raw_attribute: `{=html}` インライン raw が認識される
          expect(summary.rawInlineFormats.has("html")).toBe(true);
          // fenced_code_attributes: {#lst:demo caption=...} がコード属性付きで認識される
          expect(summary.codeBlockIds).toContain("lst:demo");
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      },
    );
  },
);

describe.skipIf(!pandocAvailable())(
  "コードブロック委譲: 実 Pandoc --listings での lstlisting 生成回帰テスト",
  () => {
    // 標準記法 / 非標準(Obsidian)記法 / JS系(listings 非対応) の3パターン。
    // これらは MdTex 側で自前変換せず Pandoc へパススルーするため、--listings
    // ライタが language=/caption=/label= を正しく生成するかを検証する。
    const CODE_SNIPPETS = [
      '```{#lst:std .python caption="standard caption"}',
      'print("standard")',
      "```",
      "",
      '```python{#lst:obs caption="obsidian caption"}',
      'print("obsidian")',
      "```",
      "",
      "```{#lst:js .javascript}",
      "console.log(1)",
      "```",
      "",
    ].join("\n");

    it("標準/非標準(Obsidian)記法とも language=/caption=/label= を生成し、JS系は language= を出力しない", () => {
      const profile = createDefaultProfile();
      const spec = extractInputFormatSpec(
        buildPandocCommand({
          profile,
          format: "latex",
          outputPath: path.join(os.tmpdir(), "out"),
          workingDir: os.tmpdir(),
        }).args,
      );

      // プラグインと同じ -f 指定 + --listings で latex へ変換する
      const result = spawnSync("pandoc", ["-f", spec, "-t", "latex", "--listings"], {
        input: CODE_SNIPPETS,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stdout).not.toBe("");
      const out = result.stdout;

      // 標準記法: language=Python + caption + label
      expect(out).toContain("language=Python");
      expect(out).toContain("label=lst:std");
      expect(out).toContain("caption={standard caption}");
      // 非標準(Obsidian)記法も同一出力（言語の直後属性を Pandoc が認識）
      expect(out).toContain("label=lst:obs");
      expect(out).toContain("caption={obsidian caption}");

      // JS系: --listings は skylighting 互換でないため language= を出力しない（純粋委譲の受入）
      expect(out).toContain("label=lst:js");
      expect(out).not.toContain("language=JavaScript");
      // python 2ブロックのみが language= を持ち、JSブロックは持たない
      expect((out.match(/language=Python/g) || []).length).toBe(2);
      expect((out.match(/\\begin\{lstlisting\}/g) || []).length).toBe(3);
    });
  },
);
