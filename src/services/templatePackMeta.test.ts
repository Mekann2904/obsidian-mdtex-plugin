// File: src/services/templatePackMeta.test.ts
// Purpose: テンプレートパックメタデータの純粋ロジックを検証する（ADR-008）。
// Reason: YAML parse / 空メタ判定 / vault パス正規化は Obsidian I/O から独立した契約として固定するため。
// Related: src/services/templatePackMeta.ts, src/services/templatePackService.ts

import { describe, expect, it } from "vitest";
import {
  isEmptyPackMetadata,
  normalizeTemplateFolder,
  parsePackMetadata,
} from "./templatePackMeta";

describe("normalizeTemplateFolder", () => {
  it("前後の空白とスラッシュを除去する", () => {
    expect(normalizeTemplateFolder("  /MdTex Templates/  ")).toBe("MdTex Templates");
  });

  it("空文字・undefined を空にする", () => {
    expect(normalizeTemplateFolder("")).toBe("");
    expect(normalizeTemplateFolder(undefined as unknown as string)).toBe("");
  });

  it("ネストしたパスの先頭末尾スラッシュのみ除去し、中間は保持する", () => {
    expect(normalizeTemplateFolder("/Templates/MdTex/")).toBe("Templates/MdTex");
  });
});

describe("parsePackMetadata", () => {
  it("_mdtex.yaml にメタ宣言が無ければ空メタ（null ではない）", () => {
    const meta = parsePackMetadata("pdf-engine: lualatex\n");
    expect(meta).not.toBeNull();
    expect(isEmptyPackMetadata(meta)).toBe(true);
  });

  it("空文字・null は null", () => {
    expect(parsePackMetadata("")).toBeNull();
    expect(parsePackMetadata(null as unknown as string)).toBeNull();
  });

  it("title/description/engine のスカラーを読む（クォート付き）", () => {
    const yaml = `
pdf-engine: lualatex
_mdtex:
  title: "縦書き二段組（小説）"
  description: "青空文庫風ルビ・章扉。A5縦組。"
  engine: lualatex
variables:
  documentclass: ltjtarticle
`;
    const meta = parsePackMetadata(yaml);
    expect(meta).not.toBeNull();
    expect(meta!.title).toBe("縦書き二段組（小説）");
    expect(meta!.description).toBe("青空文庫風ルビ・章扉。A5縦組。");
    expect(meta!.engine).toBe("lualatex");
  });

  it("クォート無しのスカラーも読む", () => {
    const meta = parsePackMetadata("_mdtex:\n  title: 縦書き\n  engine: latexmk\n");
    expect(meta!.title).toBe("縦書き");
    expect(meta!.engine).toBe("latexmk");
  });

  it("requires の配列を読む", () => {
    const yaml = `_mdtex:
  requires:
    - ipsj.cls
    - ipsj_common.bst
`;
    const meta = parsePackMetadata(yaml);
    expect(meta!.requires).toEqual(["ipsj.cls", "ipsj_common.bst"]);
  });

  it("requires: [] は空配列", () => {
    const meta = parsePackMetadata("_mdtex:\n  requires: []\n");
    expect(meta!.requires).toEqual([]);
  });

  it("requires: （値なし）も空配列", () => {
    const meta = parsePackMetadata("_mdtex:\n  requires:\n");
    expect(meta!.requires).toEqual([]);
  });

  it("recommendedProfile のネストを読む（スペース含む pdfEngineOpts）", () => {
    const yaml = `_mdtex:
  recommendedProfile:
    citationMode: natbib
    latexEngine: latexmk
    pdfEngineOpts: "-latex=platex -pdfdvi"
`;
    const meta = parsePackMetadata(yaml);
    expect(meta!.recommendedProfile).toEqual({
      citationMode: "natbib",
      latexEngine: "latexmk",
      pdfEngineOpts: "-latex=platex -pdfdvi",
    });
  });

  it("citationMode の無効値は無視される", () => {
    const meta = parsePackMetadata(
      "_mdtex:\n  recommendedProfile:\n    citationMode: bibtex\n",
    );
    expect(meta!.recommendedProfile.citationMode).toBeUndefined();
  });

  it("コメント行と空行を無視する", () => {
    const yaml = `_mdtex:
  # タイトル
  title: コメントテスト

  engine: lualatex
`;
    const meta = parsePackMetadata(yaml);
    expect(meta!.title).toBe("コメントテスト");
    expect(meta!.engine).toBe("lualatex");
  });

  it("_mdtex: の後の別トップレベルキーでブロックを打ち切る", () => {
    // variables: は _mdtex の外なので title に variables の中身は混ざらない
    const yaml = `_mdtex:
  title: パック名
variables:
  documentclass: ltjsarticle
  title: 別のタイトル
`;
    const meta = parsePackMetadata(yaml);
    expect(meta!.title).toBe("パック名");
  });

  it("未知キーは無視される（将来拡張耐性）", () => {
    const meta = parsePackMetadata("_mdtex:\n  futureField: hoge\n  title: X\n");
    expect(meta!.title).toBe("X");
    // @ts-expect-error 未知キーは PackMetadata に存在しない
    expect((meta as { futureField?: string }).futureField).toBeUndefined();
  });

  it("複合: サンプルパック相当の完全なメタを読む", () => {
    const yaml = `# pLaTeX 専用クラス用
from: markdown
pdf-engine: latexmk
_mdtex:
  title: "pLaTeX 学会論文（ipsj 等の土台）"
  description: "pLaTeX/upLaTeX 専用クラスの土台。公式 .cls の手動配置が必要。"
  engine: latexmk
  requires:
    - ipsj.cls
  recommendedProfile:
    citationMode: natbib
    latexEngine: latexmk
    pdfEngineOpts: "-latex=platex -pdfdvi"
standalone: true
`;
    const meta = parsePackMetadata(yaml);
    expect(meta).toEqual({
      title: "pLaTeX 学会論文（ipsj 等の土台）",
      description: "pLaTeX/upLaTeX 専用クラスの土台。公式 .cls の手動配置が必要。",
      engine: "latexmk",
      requires: ["ipsj.cls"],
      recommendedProfile: {
        citationMode: "natbib",
        latexEngine: "latexmk",
        pdfEngineOpts: "-latex=platex -pdfdvi",
      },
    });
  });
});

describe("isEmptyPackMetadata", () => {
  it("null は空", () => {
    expect(isEmptyPackMetadata(null)).toBe(true);
  });

  it("全フィールド空は空", () => {
    expect(isEmptyPackMetadata({ requires: [], recommendedProfile: {} })).toBe(true);
  });

  it("title があれば空でない", () => {
    expect(isEmptyPackMetadata({ title: "X", requires: [], recommendedProfile: {} })).toBe(false);
  });

  it("requires があれば空でない", () => {
    expect(
      isEmptyPackMetadata({ requires: ["ipsj.cls"], recommendedProfile: {} }),
    ).toBe(false);
  });
});
