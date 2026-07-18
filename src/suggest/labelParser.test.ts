// File: src/suggest/labelParser.test.ts
// Purpose: extractLabels が lexing kernel（crossrefLabels.extractRawLabels）の結果を正しく
//   suggester 用へ投影するかを検証する（architecture review 候補 C2）。特に、従来 labelParser
//   側に欠けていた sec 接頭辞と fence/inline-code 保護が kernel 経由で入ってきているかを錨付けする。
// Reason: 接頭辞集合・保護ルールが 2 adapter で drift していたのを解消した結果、[@sec:intro] が
//   補完候補に出るようになったこと、コードフェンス内の {#fig:x} が誤抽出されないことを保証する。
// Related: src/suggest/labelParser.ts, src/utils/crossrefLabels.ts

import { describe, it, expect } from "vitest";
import { extractLabels } from "./labelParser";

describe("extractLabels: lexing kernel への委譲（候補 C2）", () => {
  it("fig/tbl/lst/eq/sec の全接頭辞を抽出する（sec が drift で欠落していたのを解消）", () => {
    const md = [
      "{#fig:alpha}",
      "{#tbl:bravo}",
      "{#lst:charlie}",
      "{#eq:delta}",
      "{#sec:echo}",
    ].join("\n");
    const labels = extractLabels(md).map(l => l.label);
    expect(labels).toEqual(
      expect.arrayContaining(["fig:alpha", "tbl:bravo", "lst:charlie", "eq:delta", "sec:echo"]),
    );
  });

  it("コードフェンス内の {#fig:x} は抽出しない（fence 保護が kernel 経由で効く）", () => {
    const md = ["```", "{#fig:inside}", "```", "", "{#fig:outside}"].join("\n");
    const labels = extractLabels(md).map(l => l.label);
    expect(labels).toEqual(["fig:outside"]);
  });

  it("インラインコード内の {#fig:x} は抽出しない（inline-code 保護）", () => {
    const md = "see `{#fig:incode}` inline — but {#fig:real} is real";
    const labels = extractLabels(md).map(l => l.label);
    expect(labels).toEqual(["fig:real"]);
  });

  it("caption 属性が detail に投影される", () => {
    const md = '{#fig:cat caption="図1"}';
    const labels = extractLabels(md);
    expect(labels).toHaveLength(1);
    expect(labels[0].label).toBe("fig:cat");
    expect(labels[0].detail).toBe("図1");
  });

  it("caption 無しのとき detail は 'Label of type <prefix>' になる", () => {
    const md = "{#lst:nocap}";
    const labels = extractLabels(md);
    expect(labels[0].detail).toBe("Label of type lst");
  });

  it("フェンス開始行に付与された {#lst:...} は抽出する（コードブロックのラベル）", () => {
    const md = '```python {#lst:py caption="スクリプト"}\nprint(1)\n```';
    const labels = extractLabels(md);
    expect(labels.map(l => l.label)).toEqual(["lst:py"]);
    expect(labels[0].detail).toBe("スクリプト");
  });

  it("同一ラベルの重複出現は 1 件に畳む", () => {
    const md = "{#fig:dup}\n\n{#fig:dup}";
    const labels = extractLabels(md);
    expect(labels).toHaveLength(1);
  });
});
