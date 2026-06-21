// File: src/utils/frontmatter.test.ts
// Purpose: frontmatter の分離（YAML/TOML）と draft 要求読み取りの振る舞いを錨付けする
//   characterization test（architecture review 候補 3）。
// Reason: これまで convertService.detectDraftInFrontmatter（YAML のみ）と lintService の
//   frontmatter 分離（YAML+TOML）に分かれていた正規表現を frontmatter.ts に集約したため、
//   集約後の挙動が元と一致することを保証する。
// Related: src/utils/frontmatter.ts, src/services/convertService.ts, src/services/lintService.ts

import { describe, it, expect } from "vitest";
import { splitFrontmatter, isDraftRequested, resolveDraftRequest, parseDraftFlag } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("YAML frontmatter を raw/inner/body に分離する", () => {
    const md = "---\ntitle: Hi\ndraft: true\n---\n\n# Body\n";
    const split = splitFrontmatter(md);
    expect(split.format).toBe("yaml");
    expect(split.raw).toBe("---\ntitle: Hi\ndraft: true\n---\n");
    expect(split.inner).toBe("title: Hi\ndraft: true");
    expect(split.body).toBe("\n# Body\n");
  });

  it("TOML frontmatter を分離する", () => {
    const md = "+++\ntitle = 'Hi'\n+++\n\n# Body\n";
    const split = splitFrontmatter(md);
    expect(split.format).toBe("toml");
    expect(split.raw).toBe("+++\ntitle = 'Hi'\n+++\n");
    expect(split.inner).toBe("title = 'Hi'");
    expect(split.body).toBe("\n# Body\n");
  });

  it("frontmatter が無ければ none で body のみを返す", () => {
    const md = "# No frontmatter\nHello";
    const split = splitFrontmatter(md);
    expect(split.format).toBe("none");
    expect(split.raw).toBe("");
    expect(split.inner).toBe("");
    expect(split.body).toBe(md);
  });

  it("先頭以外の --- は frontmatter とみなさない", () => {
    const md = "# Title\n\n---\n\nnot frontmatter\n---\n";
    const split = splitFrontmatter(md);
    expect(split.format).toBe("none");
    expect(split.body).toBe(md);
  });

  it("TOML を ... で閉じる記法も認識する", () => {
    const md = "+++\nx = 1\n...\nbody";
    const split = splitFrontmatter(md);
    expect(split.format).toBe("toml");
    expect(split.body).toBe("body");
  });
});

describe("isDraftRequested", () => {
  it("mdtex.draft: true で draft を要求する", () => {
    expect(isDraftRequested("---\nmdtex.draft: true\n---\n# Body\n")).toBe(true);
  });

  it("mdtex.draft: false は draft しない", () => {
    expect(isDraftRequested("---\nmdtex.draft: false\n---\n# Body\n")).toBe(false);
  });

  it("mdtex.draft: (値省略) は true 扱い", () => {
    expect(isDraftRequested("---\nmdtex.draft:\n---\n# Body\n")).toBe(true);
  });

  it("mdtex: ブロック内の draft: true を読む", () => {
    const md = "---\nmdtex:\n  draft: true\n---\n# Body\n";
    expect(isDraftRequested(md)).toBe(true);
  });

  it("mdtex: ブロック内の draft: false を読む", () => {
    const md = "---\nmdtex:\n  draft: false\n---\n# Body\n";
    expect(isDraftRequested(md)).toBe(false);
  });

  it("mdtex: draft (単行) を true とみなす", () => {
    expect(isDraftRequested("---\nmdtex: draft\n---\n# Body\n")).toBe(true);
  });

  it("mdtex: ブロック内の - draft リスト要素を true とみなす", () => {
    const md = "---\nmdtex:\n  - draft\n---\n# Body\n";
    expect(isDraftRequested(md)).toBe(true);
  });

  it("frontmatter に mdtex が無ければ false", () => {
    expect(isDraftRequested("---\ntitle: Hi\n---\n# Body\n")).toBe(false);
  });

  it("frontmatter が無ければ false", () => {
    expect(isDraftRequested("# No frontmatter\n")).toBe(false);
  });

  it("別ブロックに draft があっても mdtex ブロック外なら無視する", () => {
    const md = "---\nother:\n  draft: true\nmdtex:\n  foo: 1\n---\n# Body\n";
    expect(isDraftRequested(md)).toBe(false);
  });

  it("TOML frontmatter は draft 対象外（元実装と同一挙動）", () => {
    const md = "+++\nmdtex.draft = true\n+++\n# Body\n";
    expect(isDraftRequested(md)).toBe(false);
  });

  it("0 は false 扱い", () => {
    expect(isDraftRequested("---\nmdtex.draft: 0\n---\n# Body\n")).toBe(false);
  });
});

describe("splitFrontmatter / isDraftRequested の CRLF 対応", () => {
  // 修正の直接契機: 元 detectDraftInFrontmatter は \s* で \r を許容していたが、lint 由来の
  // [\t\x20]* への正規表現統一で \r を落とし、CRLF ノートで draft 検出が壊れていた（P0）。
  it("CRLF の YAML frontmatter を分離する", () => {
    const md = "---\r\ntitle: Hi\r\ndraft: true\r\n---\r\n\r\n# Body\r\n";
    const split = splitFrontmatter(md);
    expect(split.format).toBe("yaml");
    expect(split.raw).toBe("---\r\ntitle: Hi\r\ndraft: true\r\n---\r\n");
    expect(split.inner).toBe("title: Hi\r\ndraft: true");
    expect(split.body).toBe("\r\n# Body\r\n");
  });

  it("CRLF frontmatter の mdtex.draft: true を検出する（後退回帰）", () => {
    expect(isDraftRequested("---\r\nmdtex.draft: true\r\n---\r\n# Body\r\n")).toBe(true);
  });

  it("CRLF frontmatter の mdtex: ブロック内 draft も検出する", () => {
    const md = "---\r\nmdtex:\r\n  draft: true\r\n---\r\n# Body\r\n";
    expect(isDraftRequested(md)).toBe(true);
  });

  it("CRLF の TOML frontmatter も分離する", () => {
    const md = "+++\r\nx = 1\r\n+++\r\nbody\r\n";
    const split = splitFrontmatter(md);
    expect(split.format).toBe("toml");
    expect(split.body).toBe("body\r\n");
  });
});

describe("parseDraftFlag", () => {
  it("--draft を抜き出して isDraft=true にする", () => {
    expect(parseDraftFlag("--draft --foo")).toEqual({ extras: ["--foo"], isDraft: true });
  });

  it("--draft=true / --draft=false を解釈する", () => {
    expect(parseDraftFlag("--draft=true").isDraft).toBe(true);
    expect(parseDraftFlag("--draft=false").isDraft).toBe(false);
    expect(parseDraftFlag("--draft=0").isDraft).toBe(false);
    expect(parseDraftFlag("--draft=1").isDraft).toBe(true);
  });

  it("draft 以外の引数はそのまま残る", () => {
    expect(parseDraftFlag("--foo bar --baz").extras).toEqual(["--foo", "bar", "--baz"]);
  });

  it("空文字列なら空配列・非 draft", () => {
    expect(parseDraftFlag("")).toEqual({ extras: [], isDraft: false });
    expect(parseDraftFlag("   ")).toEqual({ extras: [], isDraft: false });
  });
});

describe("resolveDraftRequest", () => {
  it("引数の --draft と frontmatter の mdtex.draft を統合する", () => {
    // どちらかが true なら draftRequested は true
    const md = "---\nmdtex.draft: true\n---\n# Body\n";
    const r = resolveDraftRequest("--draft --foo", md);
    expect(r.draftRequested).toBe(true);
    expect(r.pandocExtraArgs).toEqual(["--foo"]); // --draft は抜かれる
  });

  it("両方 false なら draftRequested=false", () => {
    const r = resolveDraftRequest("--foo", "# no frontmatter");
    expect(r.draftRequested).toBe(false);
    expect(r.pandocExtraArgs).toEqual(["--foo"]);
  });

  it("frontmatter だけ true でも draftRequested=true", () => {
    const md = "---\nmdtex.draft: true\n---\n# Body\n";
    expect(resolveDraftRequest("", md).draftRequested).toBe(true);
  });
});
