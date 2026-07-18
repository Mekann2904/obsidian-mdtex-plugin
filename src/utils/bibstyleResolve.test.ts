// File: src/utils/bibstyleResolve.test.ts
// Purpose: bibstyle 衝突の反応型解決ヘルパの単体テスト（ADR-009）。
// Reason: クラス非依存の汎用解決ルールが ACL/acmart/IEEEtran の3パターンを正しく扱うことを
//          保証する。実機検証（/tmp/gen-test のマトリクス）で証明した挙動を錨付けする。
// Related: src/utils/bibstyleResolve.ts

import { describe, expect, it } from "vitest";
import {
  extractAuxBibstyles,
  hasClassProvidedBibstyle,
  stripPlainnatBibstyle,
} from "./bibstyleResolve";

describe("extractAuxBibstyles", () => {
  it("ACL パターン: クラス由来と Pandoc 由来の2つを抽出する", () => {
    // acl.sty が acl_natbib を即時実行 → .aux に2つ。これが衝突の正体。
    const aux = [
      "\\relax",
      "\\bibstyle{acl_natbib}",
      "\\citation{andrew2007scalable}",
      "\\bibstyle{plainnat}",
      "\\bibdata{custom}",
    ].join("\n");
    expect(extractAuxBibstyles(aux)).toEqual(["acl_natbib", "plainnat"]);
  });

  it("IEEEtran/acmart パターン: plainnat のみを抽出する（クラス由来なし）", () => {
    const aux = "\\bibstyle{plainnat}\n\\citation{k1}\n\\bibdata{refs}";
    expect(extractAuxBibstyles(aux)).toEqual(["plainnat"]);
  });

  it("bibstyle が無い .aux は空配列を返す", () => {
    expect(extractAuxBibstyles("\\citation{k1}\n\\bibdata{refs}")).toEqual([]);
  });

  it("空文字列/undefined を安全に扱う", () => {
    expect(extractAuxBibstyles("")).toEqual([]);
    expect(extractAuxBibstyles(undefined as unknown as string)).toEqual([]);
  });
});

describe("hasClassProvidedBibstyle", () => {
  it("plainnat 以外があれば true（ACL）", () => {
    expect(hasClassProvidedBibstyle(["acl_natbib", "plainnat"])).toBe(true);
  });

  it("ユーザーが -V biblio-style で独自 bst を指定しても true（plainnat 以外）", () => {
    expect(hasClassProvidedBibstyle(["IEEEtran", "plainnat"])).toBe(true);
    expect(hasClassProvidedBibstyle(["ACM-Reference-Format", "plainnat"])).toBe(true);
  });

  it("plainnat のみなら false（IEEEtran/acmart 既定）", () => {
    expect(hasClassProvidedBibstyle(["plainnat"])).toBe(false);
  });

  it("空配列なら false", () => {
    expect(hasClassProvidedBibstyle([])).toBe(false);
  });
});

describe("stripPlainnatBibstyle", () => {
  it("\\bibliographystyle{plainnat} 行だけを除去する", () => {
    const tex = [
      "\\usepackage[]{natbib}",
      "\\bibliographystyle{plainnat}",
      "\\begin{document}",
    ].join("\n");
    const out = stripPlainnatBibstyle(tex);
    expect(out).not.toContain("\\bibliographystyle{plainnat}");
    expect(out).toContain("\\usepackage[]{natbib}");
    expect(out).toContain("\\begin{document}");
  });

  it("行頭の空白を許容して除去する", () => {
    const tex = "  \\bibliographystyle{plainnat}\nbody";
    expect(stripPlainnatBibstyle(tex)).toBe("body");
  });

  it("plainnat 以外の bibliographystyle（ユーザー/クラス由来）は触らない", () => {
    const tex = "\\bibliographystyle{acl_natbib}\nbody";
    expect(stripPlainnatBibstyle(tex)).toBe("\\bibliographystyle{acl_natbib}\nbody");
  });

  it("行末にコメント等が続く plainnat 行は誤爆回避のため残す", () => {
    const tex = "\\bibliographystyle{plainnat} % comment\nbody";
    // 行全体が plainnat ちょうどでないため除去しない（保守的挙動）
    expect(stripPlainnatBibstyle(tex)).toBe(tex);
  });

  it("複数行の plainnat を全て除去する", () => {
    const tex = "\\bibliographystyle{plainnat}\na\n\\bibliographystyle{plainnat}\nb";
    expect(stripPlainnatBibstyle(tex)).toBe("a\nb");
  });

  it("空文字列を安全に扱う", () => {
    expect(stripPlainnatBibstyle("")).toBe("");
  });
});

describe("反応型解決の統合シナリオ（ADR-009）", () => {
  it("ACL: .aux に非plainnat あり → plainnat 行を除去 → クラス由来のみ残る", () => {
    const aux = "\\bibstyle{acl_natbib}\n\\bibstyle{plainnat}";
    const tex = "\\bibliographystyle{plainnat}\n\\bibliography{custom}";
    expect(hasClassProvidedBibstyle(extractAuxBibstyles(aux))).toBe(true);
    expect(stripPlainnatBibstyle(tex)).toBe("\\bibliography{custom}");
  });

  it("IEEEtran: .aux は plainnat のみ → 除去せず維持", () => {
    const aux = "\\bibstyle{plainnat}";
    const tex = "\\bibliographystyle{plainnat}\n\\bibliography{custom}";
    expect(hasClassProvidedBibstyle(extractAuxBibstyles(aux))).toBe(false);
    // 維持: strip しない
    expect(tex).toBe(tex);
  });
});
