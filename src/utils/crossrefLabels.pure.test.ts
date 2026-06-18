// File: src/utils/crossrefLabels.pure.test.ts
// Purpose: crossrefLabels の純粋関数（fileSlug, namespacedLabel, namespacedRewrite,
//   extractRawLabels, detectDuplicateLabels）の直接ユニットテスト。
// Reason: 方式W（ファイル名プレフィックスによる名前空間化）のコアロジックを、
//   FS 読込を伴わない純粋関数として押さえる。expandTransclusions / extractLabels /
//   detectDuplicateLabels がこれらに依存し、リライト名の一貫性を保証する。
// Related: src/utils/crossrefLabels.ts, docs/design-decisions.md (ADR-005), CONTEXT.md

import { describe, it, expect } from "vitest";
import {
  fileSlug,
  namespacedLabel,
  namespacedRewrite,
  extractRawLabels,
  detectDuplicateLabels,
} from "./crossrefLabels";

describe("fileSlug", () => {
  it("拡張子を除去した basename を返す", () => {
    expect(fileSlug("mdtex_test_sub.md")).toBe("mdtex_test_sub");
    expect(fileSlug("docs/notes/sub.md")).toBe("sub");
  });

  it("ラベルに安全でない文字は _ へ置換する", () => {
    expect(fileSlug("my note.md")).toBe("my_note");
    expect(fileSlug("a.b.c.md")).toBe("a_b_c");
  });
});

describe("namespacedLabel", () => {
  it("prefix:slug-id 形式を生成する", () => {
    expect(namespacedLabel("fig", "hoge", "mdtex_test_sub.md")).toBe("fig:mdtex_test_sub-hoge");
    expect(namespacedLabel("lst", "demo", "code.md")).toBe("fig:code-demo".replace("fig", "lst"));
  });

  it("basename のみを使う", () => {
    expect(namespacedLabel("tbl", "data", "deep/nested/table.md")).toBe("tbl:table-data");
  });
});

describe("namespacedRewrite", () => {
  it("ラベル {#fig:hoge} を slug 付きへリライトする", () => {
    const out = namespacedRewrite("![[x.png]]{#fig:hoge}", "mdtex_test_sub.md");
    expect(out).toContain("#fig:mdtex_test_sub-hoge");
  });

  it("caption 属性を保持したままリライトする", () => {
    const out = namespacedRewrite(
      '```{#lst:demo caption="Hello"}\ncode\n```',
      "code.md",
    );
    expect(out).toContain("#lst:code-demo");
    expect(out).toContain('caption="Hello"');
  });

  it("参照 [@fig:hoge] もリライトする", () => {
    const out = namespacedRewrite("see [@fig:hoge] here", "mdtex_test_sub.md");
    expect(out).toContain("[@fig:mdtex_test_sub-hoge]");
  });

  it("裸の参照 @fig:hoge もリライトする", () => {
    const out = namespacedRewrite("see @fig:hoge here", "mdtex_test_sub.md");
    expect(out).toContain("@fig:mdtex_test_sub-hoge");
  });

  it("全接頭辞（fig/tbl/lst/eq/sec）を対象にする", () => {
    const md = "{#fig:a}\n{#tbl:b}\n{#lst:c}\n{#eq:d}\n{#sec:e}";
    const out = namespacedRewrite(md, "f.md");
    expect(out).toContain("#fig:f-a");
    expect(out).toContain("#tbl:f-b");
    expect(out).toContain("#lst:f-c");
    expect(out).toContain("#eq:f-d");
    expect(out).toContain("#sec:f-e");
  });

  it("既に slug 付きのラベルは二重リライトしない", () => {
    const out = namespacedRewrite("{#fig:sub-hoge}", "mdtex_test_sub.md");
    // slug は "mdtex_test_sub" だが id "sub-hoge" は "mdtex_test_sub-" で始まらないので
    // リライトされる。二重リライト防止は「同じ slug」の場合のみ。
    // このテストは異なる slug なのでリライトされることを確認。
    expect(out).toContain("#fig:mdtex_test_sub-sub-hoge");
  });

  it("同じ slug なら二重リライトしない", () => {
    // 既に mdtex_test_sub-hoge なら、mdtex_test_sub.md で再度リライトしない
    const out = namespacedRewrite("{#fig:mdtex_test_sub-hoge}", "mdtex_test_sub.md");
    expect(out).toBe("{#fig:mdtex_test_sub-hoge}");
  });

  it("メイン文書扱い（slug なし）は通過しないが、この関数自体は常に slug を付ける", () => {
    // namespacedRewrite は常にリライトする。メイン文書を除外するのは呼び出し側の責務。
    const out = namespacedRewrite("{#fig:hoge}", "main.md");
    expect(out).toContain("#fig:main-hoge");
  });
});

describe("extractRawLabels", () => {
  it("各接頭辞のラベルを抽出する", () => {
    const md = "{#fig:a}\n{#tbl:b}\n{#lst:c}";
    const labels = extractRawLabels(md);
    expect(labels.map(l => `${l.prefix}:${l.id}`)).toEqual(["fig:a", "tbl:b", "lst:c"]);
  });

  it("caption を抽出する", () => {
    const md = '```{#lst:demo caption="Hello World"}\ncode\n```';
    const labels = extractRawLabels(md);
    expect(labels[0].caption).toBe("Hello World");
  });

  it("width 等の追加属性付きラベルも抽出する（回帰: replaceWikiLinksAndCodeAsync が width= を付与）", () => {
    // 実パイプラインで replaceWikiLinksAndCodeAsync が {#fig:x} → {#fig:x width=0.8\\textwidth}
    // へ変換するため、width= 付きでも抽出できなければならない（さもないと重複検出が壊れる）。
    const md = "![cap](a.png){#fig:hoge width=0.8\\textwidth}";
    const labels = extractRawLabels(md);
    expect(labels.map(l => `${l.prefix}:${l.id}`)).toEqual(["fig:hoge"]);
  });

  it("コードフェンス内の {#fig:...} は抽出しない", () => {
    const md = "```\n{#fig:inside}\n```\n{#fig:outside}";
    const labels = extractRawLabels(md);
    expect(labels.map(l => l.id)).toEqual(["outside"]);
  });

  it("チルダフェンス内も抽出しない", () => {
    const md = "~~~\n{#fig:inside}\n~~~\n{#fig:outside}";
    const labels = extractRawLabels(md);
    expect(labels.map(l => l.id)).toEqual(["outside"]);
  });

  it("インラインコード内の {#fig:...} は抽出しない", () => {
    const md = "see `{#fig:code}` and {#fig:real}";
    const labels = extractRawLabels(md);
    expect(labels.map(l => l.id)).toEqual(["real"]);
  });
});

describe("detectDuplicateLabels", () => {
  it("同一ラベルの複数回出現を検出する", () => {
    const md = "![[a.png]]{#fig:hoge}\n\n![[b.png]]{#fig:hoge}";
    const dups = detectDuplicateLabels(md);
    expect(dups).toEqual([{ label: "fig:hoge", count: 2 }]);
  });

  it("重複なしの場合は空配列", () => {
    const md = "![[a.png]]{#fig:a}\n\n![[b.png]]{#fig:b}";
    expect(detectDuplicateLabels(md)).toEqual([]);
  });

  it("異なる接頭辞の同名は重複とみなさない", () => {
    const md = "{#fig:hoge}\n{#tbl:hoge}";
    expect(detectDuplicateLabels(md)).toEqual([]);
  });

  it("3回以上の出現も検出する", () => {
    const md = "{#fig:x}\n{#fig:x}\n{#fig:x}";
    const dups = detectDuplicateLabels(md);
    expect(dups).toEqual([{ label: "fig:x", count: 3 }]);
  });

  it("コードフェンス内は重複カウントに含めない", () => {
    const md = "```\n{#fig:x}\n```\n{#fig:x}";
    // フェンス内は抽出されないので、実質1回 → 重複なし
    expect(detectDuplicateLabels(md)).toEqual([]);
  });
});
