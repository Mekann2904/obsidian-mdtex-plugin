// File: src/cli/doctorVersion.test.ts
// Purpose: parseVersionOutput の検証。各バイナリの実機 --version 出力を fixtures とし、
//          版抽出パターンが壊れていないか観測する（出力形式変更を検知）。
// Related: src/cli/doctorVersion.ts

import { describe, expect, it } from "vitest";
import { parseVersionOutput } from "./doctorVersion";

describe("parseVersionOutput — 実機出力からの版抽出", () => {
  it("pandoc: 'pandoc 3.7.0.2' → 3.7.0.2", () => {
    expect(parseVersionOutput("pandoc", "pandoc 3.7.0.2\nFeatures: +libs\n")).toBe("3.7.0.2");
  });

  it("latexmk: '... Version 4.83' → 4.83", () => {
    expect(
      parseVersionOutput("latexmk", "Latexmk, John Collins, 31 Jan. 2024. Version 4.83\n"),
    ).toBe("4.83");
  });

  it("lualatex: 'This is LuaHBTeX, Version 1.18.0 (TeX Live 2024)' → 1.18.0", () => {
    expect(
      parseVersionOutput("lualatex", "This is LuaHBTeX, Version 1.18.0 (TeX Live 2024)\n"),
    ).toBe("1.18.0");
  });

  it("pandoc-crossref: 'pandoc-crossref v0.3.20 ...' → 0.3.20", () => {
    expect(
      parseVersionOutput(
        "pandoc-crossref",
        "pandoc-crossref v0.3.20 git commit UNKNOWN (UNKNOWN) built with Pandoc v3.7.0.2\n",
      ),
    ).toBe("0.3.20");
  });

  it("markdownlint-cli2: 最初の v版を採用（2つ目を拾わない）", () => {
    expect(
      parseVersionOutput("markdownlint-cli2", "markdownlint-cli2 v0.18.1 (markdownlint v0.38.0)\n"),
    ).toBe("0.18.1");
  });
});

describe("parseVersionOutput — 境界", () => {
  it("未知のバイナリ名は null（誤推測しない）", () => {
    expect(parseVersionOutput("unknown-bin", "something 1.0\n")).toBeNull();
  });

  it("パターンに合致しない行は null", () => {
    expect(parseVersionOutput("pandoc", "garbage no version here\n")).toBeNull();
  });

  it("空文字列入力は null", () => {
    expect(parseVersionOutput("pandoc", "")).toBeNull();
  });

  it("最初の非空行を対象にする（先頭の空行を飛ばす）", () => {
    expect(parseVersionOutput("pandoc", "\n\npandoc 3.7.0.2\n")).toBe("3.7.0.2");
  });
});
