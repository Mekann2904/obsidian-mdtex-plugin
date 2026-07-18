// File: src/utils/transclusion.pure.test.ts
// Purpose: extractSection / applyBlockquotePrefix の純粋関数としての直接ユニットテスト。
// Reason: Q5-2 で export した純粋関数の境界ケースを、expandTransclusions 経由ではなく
//   直接呼び出して押さえる。FS 読込を伴わないため軽量かつ網羅的。
// Related: src/utils/transclusion.ts, docs/design-decisions.md (ADR-005/Q5-2), CONTEXT.md

import { describe, it, expect } from "vitest";
import { extractSection, applyBlockquotePrefix } from "./transclusion";

describe("extractSection: 純粋関数の直接テスト", () => {
  // ===== blockId 系 =====

  it("引数なし（heading/blockId とも undefined）は null を返す", () => {
    expect(extractSection("any content")).toBeNull();
    expect(extractSection("any content", undefined, undefined)).toBeNull();
  });

  it("blockId マッチ時は ^id の手前を行として返す", () => {
    const content = "line before\nwanted line ^myblock\nline after";
    expect(extractSection(content, undefined, "myblock")).toBe("wanted line");
  });

  it("blockId の行が ^id のみ（手前が空）は空文字を返す", () => {
    const content = "prev\n^onlyid\nnext";
    expect(extractSection(content, undefined, "onlyid")).toBe("");
  });

  it("blockId 非存在（heading 未指定）は null を返す", () => {
    const content = "no block here";
    expect(extractSection(content, undefined, "missing")).toBeNull();
  });

  it("blockId に正規表現メタ文字が含まれてもリテラル扱いする", () => {
    // blockId "a.b*" のドットとアスタリスクはリテラルとして扱われる
    const content = "content ^a.b*\nnext";
    expect(extractSection(content, undefined, "a.b*")).toBe("content");
  });

  it("blockId と heading が両方指定された場合は blockId を優先する", () => {
    const content = "# Heading\nbody\n^blockid";
    // blockId がマッチするので heading は無視される
    expect(extractSection(content, "Heading", "blockid")).toBe("");
  });

  // ===== heading 系 =====

  it("heading マッチ + 同レベル見出しで終端する", () => {
    const content = "# Title\nintro\n\n## Target\nwanted\n\n## Other\nunwanted";
    expect(extractSection(content, "Target")).toBe("wanted");
  });

  it("heading マッチ + より深い見出しは含む（同レベル/より浅いで切る）", () => {
    const content =
      "# H1\nh1body\n\n## Target\nwanted\n\n### Deeper\nalso wanted\n\n## Sibling\nnot";
    expect(extractSection(content, "Target")).toBe("wanted\n\n### Deeper\nalso wanted");
  });

  it("heading マッチ + より浅い見出しで終端する（H1 で切れる）", () => {
    const content = "## Target\nwanted\n\n# Back to H1\nnot";
    expect(extractSection(content, "Target")).toBe("wanted");
  });

  it("heading マッチ + 文書末尾まで（終了見出しなし）", () => {
    const content = "# First\nbefore\n\n## Last\nall the rest\nno end";
    expect(extractSection(content, "Last")).toBe("all the rest\nno end");
  });

  it("heading 非存在は null を返す", () => {
    const content = "# Real\nbody";
    expect(extractSection(content, "Missing")).toBeNull();
  });

  it("heading 名に正規表現メタ文字が含まれてもリテラル扱いする", () => {
    const content = "# A.B\nwanted\n\n# Other\nnot";
    expect(extractSection(content, "A.B")).toBe("wanted");
    // 念のため、メタ文字を含まない "AB" はマッチしないことも確認
    expect(extractSection(content, "AB")).toBeNull();
  });

  it("heading のレベル違い（# Target と ## Target）は最長マッチではなく最初のマッチ", () => {
    // ^(#+) は # 1つ以上を取り、level = マッチした # の数。
    // 同名で異なるレベルがある場合、最初に現れた方が採用される。
    const content = "## Target\nsecond level body\n# Target\nfirst level body";
    const result = extractSection(content, "Target");
    // 最初の ## Target がマッチ。level=2 なので # Target で終端。
    expect(result).toBe("second level body");
  });

  it("heading 行の前後の空白は許容される（\\s+ と \\s*$）", () => {
    // heading 引数側の空白は呼び出し元で trim される前提だが、
    // content 側の "#  Target  " のような空白は \s+ で吸収される
    const content = "#   Spaced  \nbody";
    expect(extractSection(content, "Spaced")).toBe("body");
  });
});

describe("applyBlockquotePrefix: 純粋関数の直接テスト", () => {
  it("prefix 末尾スペースありはそのまま使用する", () => {
    expect(applyBlockquotePrefix("text", "> ")).toBe("> text");
  });

  it("prefix 末尾スペースなしはスペースを補完する", () => {
    expect(applyBlockquotePrefix("text", ">")).toBe("> text");
  });

  it("複数行テキストは全行へ prefix を付与する", () => {
    expect(applyBlockquotePrefix("line1\nline2\nline3", "> ")).toBe("> line1\n> line2\n> line3");
  });

  it("空文字テキストは空行へ prefix を付与する", () => {
    expect(applyBlockquotePrefix("", "> ")).toBe("> ");
  });

  it("ネスト引用（>>）も文字列として扱われる", () => {
    expect(applyBlockquotePrefix("deep", ">>")).toBe(">> deep");
  });

  it("テキストが既に引用を含んでいても追加で付与する（重複チェックなし）", () => {
    // applyBlockquotePrefix は純粋に prefix を付けるだけで、既存の引用構造は関知しない
    expect(applyBlockquotePrefix("> existing", ">> ")).toBe(">> > existing");
  });

  it("prefix が空文字でもスペース1つが付く（仕様）", () => {
    // prefix="" の場合、endsWith(" ") が false なので `${prefix} ` = " " になる
    expect(applyBlockquotePrefix("text", "")).toBe(" text");
  });
});
