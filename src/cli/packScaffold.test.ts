// File: src/cli/packScaffold.test.ts
// Purpose: pack new の中核（純粋テンプレート生成 + scaffoldPack の I/O）を検証する。
// Reason: 新パック作成の契約（4ファイル生成・engine 反映・上書き防止・name 未指定エラー）
//          を固定する。純粋関数は文字列内容で、scaffoldPack は実 fs（tmp）で検証。
// Related: src/cli/packScaffold.ts, src/cli/fsTemplatePack.ts

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  buildScaffoldFiles,
  defaultsYamlFor,
  metaYamlFor,
  preambleTexFor,
  sampleMdFor,
  scaffoldPack,
  type ScaffoldFileAccess,
} from "./packScaffold";

describe("defaultsYamlFor", () => {
  it("engine を pdf-engine に反映する", () => {
    expect(defaultsYamlFor("lualatex")).toContain("pdf-engine: lualatex");
    expect(defaultsYamlFor("latexmk")).toContain("pdf-engine: latexmk");
  });

  it("standalone と include-in-header を含む", () => {
    const c = defaultsYamlFor("lualatex");
    expect(c).toContain("to: pdf");
    expect(c).toContain("standalone: true");
    expect(c).toContain("include-in-header: ${.}/preamble.tex");
  });
});

describe("metaYamlFor", () => {
  it("title/description/engine を宣言する", () => {
    const c = metaYamlFor("論文A", "lualatex");
    expect(c).toContain('title: "論文A"');
    expect(c).toContain("description:");
    expect(c).toContain("engine: lualatex");
    expect(c).toContain("latexEngine: lualatex");
  });
});

describe("sampleMdFor", () => {
  it("パック名の見出しと数式・コード・表を含む", () => {
    const c = sampleMdFor("論文A");
    expect(c).toContain("# 論文A");
    expect(c).toContain("$E = mc^2$");
    expect(c).toContain("print(\"hello, mdtex\")");
    expect(c).toContain("| A | B |");
  });
});

describe("preambleTexFor", () => {
  it("パック名のコメントを含む", () => {
    expect(preambleTexFor("論文A")).toContain("論文A のプリアンブル");
  });
});

describe("buildScaffoldFiles", () => {
  it("defaults / _mdtex / sample / preamble の4ファイルを返す", () => {
    const files = buildScaffoldFiles({ folder: "x", name: "論文A" });
    const names = files.map(f => f.relativePath);
    expect(names).toEqual(["defaults.yaml", "_mdtex.yaml", "sample.md", "preamble.tex"]);
  });

  it("engine 未指定は lualatex になる", () => {
    const files = buildScaffoldFiles({ folder: "x", name: "P" });
    expect(files[0].content).toContain("pdf-engine: lualatex");
  });

  it("engine 指定を反映する", () => {
    const files = buildScaffoldFiles({ folder: "x", name: "P", engine: "latexmk" });
    expect(files[0].content).toContain("pdf-engine: latexmk");
    expect(files[1].content).toContain("engine: latexmk");
  });
});

describe("scaffoldPack", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-scaffold-"));
  });
  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  function fsAccess(): ScaffoldFileAccess {
    return {
      async exists(p) {
        try {
          await fs.access(p);
          return true;
        } catch {
          return false;
        }
      },
      async ensureDir(p) {
        await fs.mkdir(p, { recursive: true });
      },
      async writeText(p, c) {
        await fs.writeFile(p, c, "utf8");
      },
    };
  }

  it("パックフォルダに4ファイルを生成する", async () => {
    const folder = path.join(tmpRoot, "MdTex Templates");
    const result = await scaffoldPack(fsAccess(), { folder, name: "論文A" });

    expect(result.ok).toBe(true);
    expect(result.createdFiles).toEqual(["defaults.yaml", "_mdtex.yaml", "sample.md", "preamble.tex"]);
    for (const f of result.createdFiles) {
      const p = path.join(folder, "論文A", f);
      const stat = await fs.stat(p);
      expect(stat.isFile()).toBe(true);
    }
  });

  it("既存パックは上書きしない（安全）", async () => {
    const folder = path.join(tmpRoot, "MdTex Templates");
    const first = await scaffoldPack(fsAccess(), { folder, name: "論文A" });
    expect(first.ok).toBe(true);

    const second = await scaffoldPack(fsAccess(), { folder, name: "論文A" });
    expect(second.ok).toBe(false);
    expect(second.message).toContain("既に存在");
  });

  it("name 未指定は ok:false", async () => {
    const result = await scaffoldPack(fsAccess(), { folder: tmpRoot, name: "" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("未指定");
  });
});
