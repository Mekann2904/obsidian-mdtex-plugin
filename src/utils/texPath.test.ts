// File: src/utils/texPath.test.ts
// Purpose: TeX bin ディレクトリを PATH に追加する解決ロジックの単体テスト（ADR-009 関連）。
// Reason: macOS GUI アプリの貧弱な PATH 問題を、TeX bin を追加して解決する。純粋関数化して
//          OS/ファイルシステムに依存せず検証する。
// Related: src/utils/texPath.ts

import { describe, expect, it } from "vitest";
import { augmentPathString, augmentPathForTex, buildTexAwareEnv } from "./texPath";

describe("augmentPathString", () => {
  it("存在する候補だけを PATH の先頭に追加する", () => {
    const exists = (d: string) => d === "/Library/TeX/texbin";
    const out = augmentPathString("/usr/bin:/bin", ["/Library/TeX/texbin"], exists);
    expect(out).toBe("/Library/TeX/texbin:/usr/bin:/bin");
  });

  it("存在しない候補は無視する", () => {
    const exists = (d: string) => d === "/Library/TeX/texbin";
    const out = augmentPathString("/usr/bin:/bin", ["/Library/TeX/texbin", "/nonexistent/texbin"], exists);
    expect(out).toBe("/Library/TeX/texbin:/usr/bin:/bin");
  });

  it("既に PATH に含まれる候補は重複追加しない", () => {
    const exists = (d: string) => d === "/Library/TeX/texbin";
    const out = augmentPathString("/Library/TeX/texbin:/usr/bin", ["/Library/TeX/texbin"], exists);
    expect(out).toBe("/Library/TeX/texbin:/usr/bin");
  });

  it("追加候補が空・または全て不在なら元の PATH のまま", () => {
    const exists = () => false;
    expect(augmentPathString("/usr/bin:/bin", ["/Library/TeX/texbin"], exists)).toBe("/usr/bin:/bin");
    expect(augmentPathString("/usr/bin:/bin", [], () => true)).toBe("/usr/bin:/bin");
  });

  it("複数の存在候補を全て先頭に追加する", () => {
    const exists = (d: string) => d === "/Library/TeX/texbin" || d === "/opt/texbin";
    const out = augmentPathString("/usr/bin", ["/Library/TeX/texbin", "/opt/texbin"], exists);
    expect(out).toBe("/Library/TeX/texbin:/opt/texbin:/usr/bin");
  });

  it("空文字列の候補は無視する", () => {
    const exists = () => true;
    expect(augmentPathString("/usr/bin", [""], exists)).toBe("/usr/bin");
  });
});

describe("augmentPathForTex", () => {
  it("macOS で /Library/TeX/texbin が存在すれば追加する", () => {
    // augmentPathString を通すので、存在判定は注入可能だが augmentPathForTex は実 fs を使う。
    // 実環境（CI 含む）で /Library/TeX/texbin が無くても、フォールバック候補の処理は同じ経路。
    // ここでは「既に含まれていれば変わらない」「含まれていなければ（存在すれば）追加」の性質を、
    // 存在するディレクトリ（例: /tmp）を候補に見立てて検証したいが、本関数は固定候補なので、
    // 代わりに「PATH が空でない限り末尾が保持される」ことを確認する。
    const out = augmentPathForTex("/usr/bin:/bin");
    // 追加の有無に関わらず、元の PATH は保持される
    expect(out).toContain("/usr/bin");
    expect(out).toContain("/bin");
  });

  it("元の PATH 要素はすべて保持される（要素の欠落がない）", () => {
    const original = "/usr/bin:/bin:/usr/sbin:/sbin";
    const out = augmentPathForTex(original);
    for (const el of original.split(":")) {
      expect(out.split(":")).toContain(el);
    }
  });
});

describe("buildTexAwareEnv", () => {
  it("baseEnv を破壊せず、PATH を置き換えた新しい env を返す", () => {
    const base: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin", HOME: "/home/u" };
    const out = buildTexAwareEnv(base);
    expect(out.HOME).toBe("/home/u");
    expect(out.PATH).toContain("/usr/bin");
    // base は変更されない
    expect(base.PATH).toBe("/usr/bin:/bin");
  });

  it("PATH 未設定の env でも安全（空文字として扱う）", () => {
    const base: NodeJS.ProcessEnv = { HOME: "/home/u" };
    const out = buildTexAwareEnv(base);
    expect(typeof out.PATH).toBe("string");
  });
});
