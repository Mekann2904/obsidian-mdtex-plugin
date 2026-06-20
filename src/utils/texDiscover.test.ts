// File: src/utils/texDiscover.test.ts
// Purpose: TeX エンジン探索と latexEngine 正規化ロジックの単体テスト。
// Reason: クロスプラットフォーム探索とフルパス正規化を、fs をモックして検証する。
// Related: src/utils/texDiscover.ts

import { describe, expect, it } from "vitest";
import {
  TEX_ENGINE_NAMES,
  normalizeLatexEngine,
  getTexBinCandidates,
  expandGlob,
  discoverTexEngines,
  type TexFsLayer,
} from "./texDiscover";

/** メモリ上の仮想ファイルシステムを構築するテストヘルパー。 */
function memFs(paths: string[]): TexFsLayer {
  const set = new Set(paths);
  return {
    // 完全一致、またはそのパス配下にファイルがあれば「存在する」とみなす（ディレクトリ扱い）。
    existsSync: p =>
      set.has(p) ||
      paths.some(full => full.startsWith(p + "/") || full.startsWith(p + "\\")),
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

describe("normalizeLatexEngine", () => {
  it("POSIX フルパスから basename を取り、年度に依存しない正規形を返す", () => {
    expect(normalizeLatexEngine("/usr/local/texlive/2025/bin/universal-darwin/lualatex")).toBe("lualatex");
    expect(normalizeLatexEngine("/Library/TeX/texbin/latexmk")).toBe("latexmk");
  });

  it("Windows フルパスから basename を取り .exe を除去する", () => {
    expect(normalizeLatexEngine("C:\\texlive\\2024\\bin\\windows\\latexmk.exe")).toBe("latexmk");
    expect(normalizeLatexEngine("D:\\bin\\lualatex.EXE")).toBe("lualatex");
  });

  it("既に basename の場合はそのまま返す", () => {
    expect(normalizeLatexEngine("lualatex")).toBe("lualatex");
    expect(normalizeLatexEngine("latexmk")).toBe("latexmk");
  });

  it("前後の空白をトリムする", () => {
    expect(normalizeLatexEngine("  lualatex  ")).toBe("lualatex");
  });

  it("空文字・null/undefined は空文字を返す", () => {
    expect(normalizeLatexEngine("")).toBe("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeLatexEngine(undefined as any)).toBe("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeLatexEngine(null as any)).toBe("");
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
    expect(expandGlob("C:\\texlive\\*\\bin\\windows", fs)).toEqual(["C:\\texlive\\2024\\bin\\windows"]);
  });

  it("親ディレクトリが存在しない場合は空", () => {
    expect(expandGlob("/nonexistent/*/bin", memFs([]))).toEqual([]);
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
    const engines = out.map(e => e.engine).sort();
    expect(engines).toEqual(["latexmk", "lualatex", "pdflatex"]);
    expect(out.find(e => e.engine === "lualatex")?.binPath).toBe("/Library/TeX/texbin/lualatex");
  });

  it("異なるディレクトリの同一エンジン（別バージョン）は両方残す", () => {
    const fs = memFs([
      "/Library/TeX/texbin/lualatex",
      "/usr/local/texlive/2024/bin/universal-darwin/lualatex",
    ]);
    const out = discoverTexEngines("darwin", "", fs);
    const lualatexs = out.filter(e => e.engine === "lualatex");
    expect(lualatexs).toHaveLength(2);
    expect(lualatexs.map(e => e.dir)).toContain("/Library/TeX/texbin");
  });

  it("同一 binPath は重複除去する", () => {
    // /usr/local/bin が候補にも PATH にも入る構成で、同じファイルを2回引かない。
    const fs = memFs(["/usr/local/bin/lualatex"]);
    const out = discoverTexEngines("linux", "/usr/local/bin", fs);
    expect(out.filter(e => e.engine === "lualatex")).toHaveLength(1);
  });

  it("win32 では .exe を付けて探索する", () => {
    const fs = memFs(["C:\\texlive\\2024\\bin\\windows\\latexmk.exe"]);
    const out = discoverTexEngines("win32", "", fs);
    expect(out.find(e => e.engine === "latexmk")?.binPath).toBe("C:\\texlive\\2024\\bin\\windows\\latexmk.exe");
  });

  it("PATH 上のディレクトリも走査する", () => {
    const fs = memFs(["/custom/tex/lualatex"]);
    const out = discoverTexEngines("linux", "/custom/tex", fs);
    expect(out.find(e => e.engine === "lualatex")?.dir).toBe("/custom/tex");
  });

  it("TEX_ENGINE_NAMES は latexmk/lualatex/xelatex/pdflatex を含む", () => {
    expect(TEX_ENGINE_NAMES).toContain("latexmk");
    expect(TEX_ENGINE_NAMES).toContain("lualatex");
    expect(TEX_ENGINE_NAMES).toContain("xelatex");
    expect(TEX_ENGINE_NAMES).toContain("pdflatex");
  });
});
