// File: src/utils/headerBuilder.test.ts
// Purpose: buildHeader 純粋関数が 5 段階（codelisting 補完 / callout preamble / label
//   overrides / page number snippet / draft snippet）を正しく組み立てることを検証する。
// Reason: convertCurrentPage から切り出したヘッダ構築ロジックを、I/O や Pandoc 実行に
//   依存せず header 内容単位でテスト可能にするため（issue #51）。
// Related: src/utils/headerBuilder.ts, src/services/convertService.ts, src/utils/latexPreamble.ts

import { describe, expect, it } from "vitest";
import { buildHeader } from "./headerBuilder";
import { DEFAULT_PROFILE, DEFAULT_LATEX_PREAMBLE } from "../MdTexPluginSettings";
import { CALLOUT_PREAMBLE } from "./calloutTheme";
import type { ProfileSettings } from "../MdTexPluginSettings";

// DEFAULT_PROFILE をベースに任意フィールドだけ上書きするヘルパー。
function profile(overrides: Partial<ProfileSettings> = {}): ProfileSettings {
  return { ...DEFAULT_PROFILE, ...overrides };
}

describe("buildHeader", () => {
  it("callout preamble と codelisting 補完を常に含む（方式/crossref/ページ番号に関わらない共通レイヤ）", () => {
    // MdTex 固有レイヤ: CALLOUT_PREAMBLE（obsidiancallout 定義）と codelisting 環境定義は
    // 方式に関わらず維持される。これらは --include-in-header の最低限の内容。
    const out = buildHeader(profile(), { mode: "builtin", draft: false });
    expect(out).toContain("obsidiancallout"); // CALLOUT_PREAMBLE 由来
    expect(out).toContain("\\usepackage{newfloat}"); // codelisting 補完
    expect(out).toMatch(/\]\s*\{codelisting\}/);
  });

  it("末尾改行を含まない（呼び出し側が付与する）", () => {
    const out = buildHeader(profile(), { mode: "builtin", draft: false });
    expect(out.endsWith("\n")).toBe(false);
  });

  describe("label overrides（crossref / defaults 方式の分岐）", () => {
    it("builtin + crossref-ON では \\renewcommand を注入しない（メタデータ経路に一本化）", () => {
      const out = buildHeader(
        profile({ usePandocCrossref: true }),
        { mode: "builtin", draft: false },
      );
      expect(out).not.toContain("\\renewcommand{\\figurename}");
      expect(out).not.toContain("\\renewcommand{\\tablename}");
    });

    it("builtin + crossref-OFF ではプロファイル値で \\renewcommand を注入するフォールバック", () => {
      const out = buildHeader(
        profile({
          usePandocCrossref: false,
          figureLabel: "図",
          tableLabel: "表",
        }),
        { mode: "builtin", draft: false },
      );
      expect(out).toContain("\\renewcommand{\\figurename}{図}");
      expect(out).toContain("\\renewcommand{\\tablename}{表}");
      // makeatletter で安全に囲まれる
      expect(out).toContain("\\makeatletter");
      expect(out).toContain("\\makeatother");
    });

    it("defaults 方式ではキャプション名も defaults file 側で管理するため \\renewcommand を注入しない", () => {
      const out = buildHeader(
        profile({ usePandocCrossref: false, figureLabel: "図" }),
        { mode: "defaults", draft: false },
      );
      expect(out).not.toContain("\\renewcommand{\\figurename}");
    });
  });

  describe("baseHeader（方式によるプリアンブル本体の扱い）", () => {
    it("builtin 方式では headerIncludes（DEFAULT_LATEX_PREAMBLE 本体）を含む", () => {
      const out = buildHeader(profile(), { mode: "builtin", draft: false });
      // DEFAULT_LATEX_PREAMBLE の目印（luatexja-fontspec）が含まれる
      expect(out).toContain("luatexja-fontspec");
    });

    it("defaults 方式では headerIncludes（baseHeader）を含まず、CALLOUT+codelisting のみ", () => {
      // defaults 方式はプリアンブル本体を defaults file 側で管理するため、baseHeader は空扱い。
      const out = buildHeader(profile(), { mode: "defaults", draft: false });
      expect(out).not.toContain("luatexja-fontspec"); // baseHeader（DEFAULT_LATEX_PREAMBLE）は含まない
      // MdTex 固有レイヤは維持
      expect(out).toContain("obsidiancallout");
      expect(out).toContain("\\usepackage{newfloat}");
    });

    it("headerIncludes が既に obsidiancallout を含む場合はコールアウト定義を二重付与しない", () => {
      // ユーザーが独自プリアンブルで既にコールアウト定義を持つ場合、CALLOUT_PREAMBLE を
      // 重ねて追加しないことを検証する。
      const customHeaderIncludes = "% my custom preamble\n\\newtcolorbox{obsidiancallout}[1]{}";
      const out = buildHeader(
        profile({ headerIncludes: customHeaderIncludes }),
        { mode: "builtin", draft: false },
      );
      // CALLOUT_PREAMBLE の固有目印（fontawesome5 / callout-bg）は追加されない
      expect(out).not.toContain("fontawesome5");
      expect(out).not.toContain("callout-bg");
      // ユーザー定義はそのまま残る
      expect(out).toContain("my custom preamble");
    });

    it("headerIncludes に obsidiancallout が無い場合は CALLOUT_PREAMBLE を付与する", () => {
      const out = buildHeader(
        profile({ headerIncludes: "% minimal preamble\n\\usepackage{listings}" }),
        { mode: "builtin", draft: false },
      );
      // CALLOUT_PREAMBLE の固有目印が含まれる
      expect(out).toContain("fontawesome5");
      expect(out).toContain("obsidiancallout");
    });
  });

  describe("pageNumberSnippet（タイトルページ無番号化）", () => {
    it("usePageNumber=true ではページ番号スニペットを注入しない", () => {
      const out = buildHeader(
        profile({ usePageNumber: true }),
        { mode: "builtin", draft: false },
      );
      expect(out).not.toContain("\\let\\ps@plain\\ps@empty");
    });

    it("usePageNumber=false では plain→empty 差し替えスニペットを注入する", () => {
      // ページ番号をオフにしても \maketitle の plain スタイルだと1ページ目に数字が出るため、
      // plain を empty に差し替えてタイトルページも無番号に統一する。
      const out = buildHeader(
        profile({ usePageNumber: false }),
        { mode: "builtin", draft: false },
      );
      expect(out).toContain("\\makeatletter\\let\\ps@plain\\ps@empty\\makeatother");
    });

    it("defaults 方式ではページ番号制御も defaults file 側のためスニペットを注入しない", () => {
      const out = buildHeader(
        profile({ usePageNumber: false }),
        { mode: "defaults", draft: false },
      );
      expect(out).not.toContain("\\let\\ps@plain\\ps@empty");
    });
  });

  describe("draftSnippet（graphicx draft 化）", () => {
    it("draft=false では draft スニペットを含まない", () => {
      const out = buildHeader(profile(), { mode: "builtin", draft: false });
      expect(out).not.toContain("\\def\\isdraft{1}");
      expect(out).not.toContain("\\Gin@drafttrue");
    });

    it("draft=true では graphicx draft スニペットをヘッダ先頭に付与する", () => {
      const out = buildHeader(profile(), { mode: "builtin", draft: true });
      expect(out).toContain("\\def\\isdraft{1}");
      expect(out).toContain("\\PassOptionsToPackage{draft}{graphicx}");
      expect(out).toContain("\\makeatletter\\Gin@drafttrue\\makeatother");
      // draft スニペットは本体より前に来る
      expect(out.indexOf("\\def\\isdraft{1}")).toBeLessThan(out.indexOf("obsidiancallout"));
    });
  });

  describe("段の組み合わせ（統合）", () => {
    it("crossref-OFF + ページ番号OFF + draft を全て同時に指定したヘッダを組み立てる", () => {
      // 全段が有効になる設定での構造を検証。順序は draft → pageNumberSnippet → 本体。
      const out = buildHeader(
        profile({
          usePandocCrossref: false,
          usePageNumber: false,
          figureLabel: "図",
        }),
        { mode: "builtin", draft: true },
      );

      const draftIdx = out.indexOf("\\def\\isdraft{1}");
      const pageIdx = out.indexOf("\\let\\ps@plain\\ps@empty");
      const labelIdx = out.indexOf("\\renewcommand{\\figurename}{図}");
      const calloutIdx = out.indexOf("obsidiancallout");

      expect(draftIdx).toBeGreaterThan(-1);
      expect(pageIdx).toBeGreaterThan(-1);
      expect(labelIdx).toBeGreaterThan(-1);
      expect(calloutIdx).toBeGreaterThan(-1);

      // draft → pageNumberSnippet → (label overrides / callout) の順
      expect(draftIdx).toBeLessThan(pageIdx);
      expect(pageIdx).toBeLessThan(calloutIdx);
    });
  });

  describe("convertCurrentPage の既存挙動との後方互換（回帰ガード）", () => {
    it("DEFAULT_PROFILE は既に codelisting 定義済みのため ensureCodelistingEnvironment は冪等", () => {
      // DEFAULT_LATEX_PREAMBLE には codelisting 定義が含まれるため、補完で二重定義しない。
      const out = buildHeader(profile(), { mode: "builtin", draft: false });
      // DeclareFloatingEnvironment は1回だけ
      const matches = out.match(/\\DeclareFloatingEnvironment/g) || [];
      expect(matches.length).toBe(1);
    });

    it("DEFAULT_PROFILE の builtin 既定ヘッダは callout+codelisting+preamble 本体 を含む", () => {
      // デフォルト設定で生成されるヘッダの構成要素をスナップショット的に担保。
      const out = buildHeader(profile(), { mode: "builtin", draft: false });
      expect(out).toContain(DEFAULT_LATEX_PREAMBLE.trim().slice(0, 40)); // preamble 本体の先頭
      expect(out).toContain("obsidiancallout");
      expect(out).toContain("\\usepackage{newfloat}");
    });

    it("CALLOUT_PREAMBLE の内容が builtin 既定で含まれる（fontawesome5 等）", () => {
      const out = buildHeader(profile(), { mode: "builtin", draft: false });
      expect(out).toContain("fontawesome5");
      expect(out).toContain(CALLOUT_PREAMBLE.trim().slice(0, 30));
    });
  });
});
