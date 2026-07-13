// File: src/cli/doctorDiagnose.test.ts
// Purpose: diagnoseEnvironment の振る舞い検証。発見（fsLayer モック）と版取得
//          （resolveVersion モック）を注入し、status 集計ロジックを観測する。
// Related: src/cli/doctorDiagnose.ts

import { describe, expect, it } from "vitest";
import { diagnoseEnvironment, DOCTOR_BIN_SPECS } from "./doctorDiagnose";
import type { BinFsLayer } from "../utils/binDiscover";

/** binDiscover.test.ts と同じ構造のメモリ fs（重複を許さず独立させるため再定義）。 */
function memFs(paths: string[]): BinFsLayer {
  const set = new Set(paths);
  return {
    existsSync: p =>
      set.has(p) || paths.some(full => full.startsWith(p + "/") || full.startsWith(p + "\\")),
    readdirSync: p =>
      paths
        .filter(full => full.startsWith(p + "/") || full.startsWith(p + "\\"))
        .map(full => full.slice(p.length + 1).split(/[\\/]/)[0])
        .filter((v, i, arr) => arr.indexOf(v) === i),
  };
}

/** macOS で全バイナリが発見できる典型例の fs。 */
function fullMacFs(): BinFsLayer {
  return memFs([
    "/opt/homebrew/bin/pandoc",
    "/Library/TeX/texbin/latexmk",
    "/Library/TeX/texbin/lualatex",
    "/usr/local/bin/pandoc-crossref",
    "/usr/local/bin/markdownlint-cli2",
  ]);
}

describe("diagnoseEnvironment — 版取得", () => {
  it("発見できたバイナリの版を resolveVersion から取り込む", async () => {
    const resolveVersion = async (name: string): Promise<string | null> =>
      name === "pandoc" ? "3.7.0.2" : null;
    const report = await diagnoseEnvironment("darwin", "", resolveVersion, fullMacFs());
    const pandoc = report.entries.find(e => e.name === "pandoc");
    expect(pandoc?.version).toBe("3.7.0.2");
    expect(pandoc?.versionError).toBeNull();
  });

  it("版取得に失敗（null）しても found は true のまま・versionError に理由が入る", async () => {
    const report = await diagnoseEnvironment("darwin", "", async () => null, fullMacFs());
    const pandoc = report.entries.find(e => e.name === "pandoc");
    expect(pandoc?.found).toBe(true);
    expect(pandoc?.version).toBeNull();
    expect(pandoc?.versionError).not.toBeNull();
  });

  it("未発見バイナリは resolveVersion を呼ばない（発見した名前だけ呼ぶ）", async () => {
    const calls: string[] = [];
    const resolveVersion = async (name: string): Promise<string | null> => {
      calls.push(name);
      return null;
    };
    // pandoc だけ発見（残り4つは未発見）
    const fs = memFs(["/opt/homebrew/bin/pandoc"]);
    await diagnoseEnvironment("darwin", "", resolveVersion, fs);
    expect(calls).toEqual(["pandoc"]);
  });
});

describe("diagnoseEnvironment — status 集計", () => {
  it("全バイナリが発見できれば status=ok", async () => {
    const report = await diagnoseEnvironment("darwin", "", async () => null, fullMacFs());
    expect(report.status).toBe("ok");
    expect(report.summary).toEqual({
      total: 5,
      found: 5,
      requiredMissing: 0,
      optionalMissing: 0,
    });
    expect(report.entries).toHaveLength(DOCTOR_BIN_SPECS.length);
    expect(report.entries.every(e => e.found)).toBe(true);
  });

  it("必須バイナリが1つでも欠落すれば status=errors", async () => {
    // lualatex 無し（pandoc/latexmk はあり）
    const fs = memFs([
      "/opt/homebrew/bin/pandoc",
      "/Library/TeX/texbin/latexmk",
      "/usr/local/bin/pandoc-crossref",
      "/usr/local/bin/markdownlint-cli2",
    ]);
    const report = await diagnoseEnvironment("darwin", "", async () => null, fs);
    expect(report.status).toBe("errors");
    expect(report.summary.requiredMissing).toBe(1);
    expect(report.entries.find(e => e.name === "lualatex")?.found).toBe(false);
  });

  it("必須は揃ったがオプションが欠落すれば status=degraded", async () => {
    // 必須3つはあり、オプション2つなし
    const fs = memFs([
      "/opt/homebrew/bin/pandoc",
      "/Library/TeX/texbin/latexmk",
      "/Library/TeX/texbin/lualatex",
    ]);
    const report = await diagnoseEnvironment("darwin", "", async () => null, fs);
    expect(report.status).toBe("degraded");
    expect(report.summary).toEqual({
      total: 5,
      found: 3,
      requiredMissing: 0,
      optionalMissing: 2,
    });
  });
});
