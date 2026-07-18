// File: src/utils/binDiscover.test.ts
// Purpose: バイナリ探索（TeX エンジン・pandoc）と basename 正規化ロジックの単体テスト。
// Reason: クロスプラットフォーム探索とフルパス正規化を、fs をモックして検証する。
// Related: src/utils/binDiscover.ts

import { describe, expect, it } from "vitest";
import {
  TEX_ENGINE_NAMES,
  PANDOC_NAMES,
  PANDOC_CROSSREF_NAMES,
  MARKDOWNLINT_NAMES,
  normalizeBinName,
  normalizeLatexEngine,
  getTexBinCandidates,
  getPandocCandidates,
  getPandocCrossrefCandidates,
  getMarkdownlintCandidates,
  expandGlob,
  discoverBinaries,
  discoverTexEngines,
  discoverPandoc,
  discoverPandocCrossref,
  discoverMarkdownlint,
  type BinFsLayer,
} from "./binDiscover";

/** メモリ上の仮想ファイルシステムを構築するテストヘルパー。 */
function memFs(paths: string[]): BinFsLayer {
  const set = new Set(paths);
  return {
    // 完全一致、またはそのパス配下にファイルがあれば「存在する」とみなす（ディレクトリ扱い）。
    existsSync: p =>
      set.has(p) || paths.some(full => full.startsWith(p + "/") || full.startsWith(p + "\\")),
    readdirSync: p =>
      paths
        .filter(full => full.startsWith(p + "/") || full.startsWith(p + "\\"))
        .map(full => {
          const rest = full.slice(p.length + 1);
          return rest.split(/[\\/]/)[0];
        })
        .filter((v, i, arr) => arr.indexOf(v) === i),
  };
}

describe("normalizeBinName", () => {
  it("POSIX フルパスから basename を取り、年度に依存しない正規形を返す", () => {
    expect(normalizeBinName("/usr/local/texlive/2025/bin/universal-darwin/lualatex")).toBe(
      "lualatex",
    );
    expect(normalizeBinName("/Library/TeX/texbin/latexmk")).toBe("latexmk");
    expect(normalizeBinName("/opt/homebrew/bin/pandoc")).toBe("pandoc");
  });

  it("Windows フルパスから basename を取り .exe を除去する", () => {
    expect(normalizeBinName("C:\\texlive\\2024\\bin\\windows\\latexmk.exe")).toBe("latexmk");
    expect(normalizeBinName("D:\\bin\\lualatex.EXE")).toBe("lualatex");
    expect(normalizeBinName("C:\\Program Files\\Pandoc\\pandoc.exe")).toBe("pandoc");
  });

  it("既に basename の場合はそのまま返す", () => {
    expect(normalizeBinName("lualatex")).toBe("lualatex");
    expect(normalizeBinName("pandoc")).toBe("pandoc");
  });

  it("前後の空白をトリムする", () => {
    expect(normalizeBinName("  pandoc  ")).toBe("pandoc");
  });

  it("空文字・null/undefined は空文字を返す", () => {
    expect(normalizeBinName("")).toBe("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeBinName(undefined as any)).toBe("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeBinName(null as any)).toBe("");
  });
});

describe("ドメインエイリアス（normalizeLatexEngine）", () => {
  it("normalizeBinName と同じ挙動を持つ", () => {
    expect(normalizeLatexEngine("/usr/local/bin/lualatex")).toBe("lualatex");
  });
});

describe("getTexBinCandidates", () => {
  it("darwin は /Library/TeX/texbin と TeX Live 公式配置を返す", () => {
    const c = getTexBinCandidates("darwin");
    expect(c).toContain("/Library/TeX/texbin");
    expect(c.some(p => p.includes("universal-darwin"))).toBe(true);
  });

  it("linux は /usr/local/bin と TeX Live 公式配置を返す", () => {
    const c = getTexBinCandidates("linux");
    expect(c).toContain("/usr/local/bin");
    expect(c).toContain("/usr/bin");
    expect(c.some(p => p.includes("x86_64-linux"))).toBe(true);
  });

  it("win32 は TeX Live の規定配置を返す", () => {
    const c = getTexBinCandidates("win32");
    expect(c.some(p => p.includes("texlive") && p.includes("bin\\windows"))).toBe(true);
  });

  it("未知のプラットフォームは空配列を返す", () => {
    expect(getTexBinCandidates("freebsd" as NodeJS.Platform)).toEqual([]);
  });
});

describe("getPandocCandidates", () => {
  it("darwin は Homebrew / MacPorts / 公式 pkg の配置を返す", () => {
    const c = getPandocCandidates("darwin");
    expect(c).toContain("/usr/local/bin");
    expect(c).toContain("/opt/homebrew/bin");
    expect(c).toContain("/opt/local/bin");
  });

  it("linux は /usr/bin と Homebrew on Linux を返す", () => {
    const c = getPandocCandidates("linux");
    expect(c).toContain("/usr/bin");
    expect(c).toContain("/home/linuxbrew/.linuxbrew/bin");
  });

  it("win32 は Program Files 配下の Pandoc を返す", () => {
    const c = getPandocCandidates("win32");
    expect(c).toContain("C:\\Program Files\\Pandoc");
    expect(c).toContain("C:\\Program Files (x86)\\Pandoc");
  });

  it("未知のプラットフォームは空配列を返す", () => {
    expect(getPandocCandidates("freebsd" as NodeJS.Platform)).toEqual([]);
  });
});

describe("expandGlob", () => {
  it("glob 無しは存在する場合そのまま、無い場合空", () => {
    const fs = memFs(["/Library/TeX/texbin/lualatex"]);
    expect(expandGlob("/Library/TeX/texbin", fs)).toEqual(["/Library/TeX/texbin"]);
    expect(expandGlob("/nope", fs)).toEqual([]);
  });

  it("POSIX の * glob を展開する", () => {
    const fs = memFs([
      "/usr/local/texlive/2024/bin/universal-darwin/lualatex",
      "/usr/local/texlive/2025/bin/universal-darwin/lualatex",
    ]);
    const out = expandGlob("/usr/local/texlive/*/bin/universal-darwin", fs).sort();
    expect(out).toEqual([
      "/usr/local/texlive/2024/bin/universal-darwin",
      "/usr/local/texlive/2025/bin/universal-darwin",
    ]);
  });

  it("Windows のバックスラッシュ glob を展開する", () => {
    const fs = memFs(["C:\\texlive\\2024\\bin\\windows\\latexmk.exe"]);
    expect(expandGlob("C:\\texlive\\*\\bin\\windows", fs)).toEqual([
      "C:\\texlive\\2024\\bin\\windows",
    ]);
  });

  it("親ディレクトリが存在しない場合は空", () => {
    expect(expandGlob("/nonexistent/*/bin", memFs([]))).toEqual([]);
  });
});

describe("discoverBinaries（共通）", () => {
  it("候補ディレクトリと PATH 上の両方から複数名のバイナリを発見する", () => {
    const fs = memFs(["/usr/local/bin/pandoc", "/usr/local/bin/latexmk"]);
    const out = discoverBinaries(["pandoc", "latexmk"], ["/usr/local/bin"], "linux", "", fs);
    const names = out.map(b => b.name).sort();
    expect(names).toEqual(["latexmk", "pandoc"]);
    expect(out.find(b => b.name === "pandoc")?.binPath).toBe("/usr/local/bin/pandoc");
  });

  it("同一 binPath は重複除去する（候補と PATH で同一ファイルを2回引かない）", () => {
    const fs = memFs(["/usr/local/bin/pandoc"]);
    const out = discoverBinaries(["pandoc"], ["/usr/local/bin"], "linux", "/usr/local/bin", fs);
    expect(out.filter(b => b.name === "pandoc")).toHaveLength(1);
  });
});

describe("discoverTexEngines", () => {
  it("darwin で /Library/TeX/texbin 配下のエンジンを発見する", () => {
    const fs = memFs([
      "/Library/TeX/texbin/lualatex",
      "/Library/TeX/texbin/latexmk",
      "/Library/TeX/texbin/pdflatex",
    ]);
    const out = discoverTexEngines("darwin", "", fs);
    const names = out.map(e => e.name).sort();
    expect(names).toEqual(["latexmk", "lualatex", "pdflatex"]);
    expect(out.find(e => e.name === "lualatex")?.binPath).toBe("/Library/TeX/texbin/lualatex");
  });

  it("異なるディレクトリの同一エンジン（別バージョン）は両方残す", () => {
    const fs = memFs([
      "/Library/TeX/texbin/lualatex",
      "/usr/local/texlive/2024/bin/universal-darwin/lualatex",
    ]);
    const out = discoverTexEngines("darwin", "", fs);
    const lualatexs = out.filter(e => e.name === "lualatex");
    expect(lualatexs).toHaveLength(2);
    expect(lualatexs.map(e => e.dir)).toContain("/Library/TeX/texbin");
  });

  it("win32 では .exe を付けて探索する", () => {
    const fs = memFs(["C:\\texlive\\2024\\bin\\windows\\latexmk.exe"]);
    const out = discoverTexEngines("win32", "", fs);
    expect(out.find(e => e.name === "latexmk")?.binPath).toBe(
      "C:\\texlive\\2024\\bin\\windows\\latexmk.exe",
    );
  });

  it("PATH 上のディレクトリも走査する", () => {
    const fs = memFs(["/custom/tex/lualatex"]);
    const out = discoverTexEngines("linux", "/custom/tex", fs);
    expect(out.find(e => e.name === "lualatex")?.dir).toBe("/custom/tex");
  });

  it("TEX_ENGINE_NAMES は latexmk/lualatex/xelatex/pdflatex を含む", () => {
    expect(TEX_ENGINE_NAMES).toContain("latexmk");
    expect(TEX_ENGINE_NAMES).toContain("lualatex");
    expect(TEX_ENGINE_NAMES).toContain("xelatex");
    expect(TEX_ENGINE_NAMES).toContain("pdflatex");
  });
});

describe("discoverPandoc", () => {
  it("darwin で Homebrew (Apple Silicon) 配置の pandoc を発見する", () => {
    const fs = memFs(["/opt/homebrew/bin/pandoc"]);
    const out = discoverPandoc("darwin", "", fs);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("pandoc");
    expect(out[0].binPath).toBe("/opt/homebrew/bin/pandoc");
    expect(out[0].dir).toBe("/opt/homebrew/bin");
  });

  it("linux で /usr/bin 配置の pandoc を発見する", () => {
    const fs = memFs(["/usr/bin/pandoc"]);
    const out = discoverPandoc("linux", "", fs);
    expect(out.find(b => b.name === "pandoc")?.dir).toBe("/usr/bin");
  });

  it("win32 では Program Files の pandoc.exe を発見する", () => {
    const fs = memFs(["C:\\Program Files\\Pandoc\\pandoc.exe"]);
    const out = discoverPandoc("win32", "", fs);
    expect(out.find(b => b.name === "pandoc")?.binPath).toBe(
      "C:\\Program Files\\Pandoc\\pandoc.exe",
    );
  });

  it("PATH 上のディレクトリも走査する（候補配置になくても発見できる）", () => {
    const fs = memFs(["/Users/me/.local/bin/pandoc"]);
    const out = discoverPandoc("darwin", "/Users/me/.local/bin", fs);
    expect(out.find(b => b.name === "pandoc")?.dir).toBe("/Users/me/.local/bin");
  });

  it("同一 binPath は重複除去する（候補と PATH が同じディレクトリを指す場合）", () => {
    const fs = memFs(["/usr/local/bin/pandoc"]);
    const out = discoverPandoc("darwin", "/usr/local/bin", fs);
    expect(out.filter(b => b.name === "pandoc")).toHaveLength(1);
  });

  it("PANDOC_NAMES は pandoc を含む", () => {
    expect(PANDOC_NAMES).toContain("pandoc");
  });

  it("何も無ければ空配列を返す", () => {
    expect(discoverPandoc("darwin", "", memFs([]))).toEqual([]);
  });
});

describe("discoverPandocCrossref", () => {
  it("pandoc と同じ候補配置から pandoc-crossref を発見する（darwin）", () => {
    const fs = memFs(["/usr/local/bin/pandoc-crossref"]);
    const out = discoverPandocCrossref("darwin", "", fs);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("pandoc-crossref");
    expect(out[0].binPath).toBe("/usr/local/bin/pandoc-crossref");
  });

  it("Windows では Program Files\\Pandoc 配下の .exe を発見する", () => {
    const fs = memFs(["C:\\Program Files\\Pandoc\\pandoc-crossref.exe"]);
    const out = discoverPandocCrossref("win32", "", fs);
    expect(out.find(b => b.name === "pandoc-crossref")?.binPath).toBe(
      "C:\\Program Files\\Pandoc\\pandoc-crossref.exe",
    );
  });

  it("PATH 上にあっても発見できる", () => {
    const fs = memFs(["/home/me/bin/pandoc-crossref"]);
    const out = discoverPandocCrossref("linux", "/home/me/bin", fs);
    expect(out.find(b => b.name === "pandoc-crossref")?.dir).toBe("/home/me/bin");
  });

  it("getPandocCrossrefCandidates は pandoc と同じ候補を返す", () => {
    expect(getPandocCrossrefCandidates("darwin")).toEqual(getPandocCandidates("darwin"));
    expect(getPandocCrossrefCandidates("win32")).toEqual(getPandocCandidates("win32"));
  });

  it("getMarkdownlintCandidates は macOS/Linux で /usr/local/bin を返す", () => {
    expect(getMarkdownlintCandidates("darwin")).toContain("/usr/local/bin");
    expect(getMarkdownlintCandidates("linux")).toContain("/usr/bin");
  });

  it("PANDOC_CROSSREF_NAMES は pandoc-crossref を含む", () => {
    expect(PANDOC_CROSSREF_NAMES).toContain("pandoc-crossref");
  });
});

describe("discoverMarkdownlint", () => {
  it("darwin で /usr/local/bin の markdownlint-cli2 を発見する", () => {
    const fs = memFs(["/usr/local/bin/markdownlint-cli2"]);
    const out = discoverMarkdownlint("darwin", "", fs);
    expect(out.find(b => b.name === "markdownlint-cli2")?.dir).toBe("/usr/local/bin");
  });

  it("Windows では .cmd シムを発見する（npm グローバルの .cmd 拡張子）", () => {
    // markdownlint-cli2 の Windows シムは .exe ではなく .cmd。拡張子候補の一般化が効いているか。
    const fs = memFs(["C:\\Users\\me\\AppData\\Roaming\\npm\\markdownlint-cli2.cmd"]);
    const out = discoverMarkdownlint("win32", "C:\\Users\\me\\AppData\\Roaming\\npm", fs);
    expect(out.find(b => b.name === "markdownlint-cli2")?.binPath).toBe(
      "C:\\Users\\me\\AppData\\Roaming\\npm\\markdownlint-cli2.cmd",
    );
  });

  it("Windows で .exe と .cmd 両方あっても最初に見つかった1件だけ採用する", () => {
    const fs = memFs(["C:\\bin\\markdownlint-cli2.exe", "C:\\bin\\markdownlint-cli2.cmd"]);
    const out = discoverMarkdownlint("win32", "C:\\bin", fs);
    expect(out.filter(b => b.name === "markdownlint-cli2")).toHaveLength(1);
  });

  it("PATH 上の nvm bin ディレクトリからも発見できる", () => {
    const fs = memFs(["/home/me/.nvm/versions/node/v20.0.0/bin/markdownlint-cli2"]);
    const out = discoverMarkdownlint("linux", "/home/me/.nvm/versions/node/v20.0.0/bin", fs);
    expect(out.find(b => b.name === "markdownlint-cli2")?.dir).toBe(
      "/home/me/.nvm/versions/node/v20.0.0/bin",
    );
  });

  it("MARKDOWNLINT_NAMES は markdownlint-cli2 を含む", () => {
    expect(MARKDOWNLINT_NAMES).toContain("markdownlint-cli2");
  });
});
