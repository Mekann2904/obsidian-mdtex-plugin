// File: src/cli/doctorReport.test.ts
// Purpose: formatDoctorText の検証。report 入力から人間向けテキストのキー要素が現れるか観測する。
//          完全文字列マッチは避け（レイアウト変更で脆い）、状態ラベル・各名前・✓/✗・集計を含有で検証。
// Related: src/cli/doctorReport.ts, src/cli/doctorDiagnose.ts

import { describe, expect, it } from "vitest";
import { formatDoctorText } from "./doctorReport";
import { DOCTOR_BIN_SPECS, type DiagnosticEntry, type DiagnosticReport } from "./doctorDiagnose";

/** DOCTOR_BIN_SPECS を雛形に entries を組み立てる（デフォルトは全発見・版 1.0）。 */
function makeEntries(overrides: Record<string, Partial<DiagnosticEntry>> = {}): DiagnosticEntry[] {
  return DOCTOR_BIN_SPECS.map(spec => ({
    name: spec.name,
    required: spec.required,
    purpose: spec.purpose,
    found: true,
    binPath: `/bin/${spec.name}`,
    version: "1.0",
    versionError: null,
    ...overrides[spec.name],
  }));
}

describe("formatDoctorText", () => {
  it("全発見の report に状態 ok と全バイナリ名と集計を含む", () => {
    const report: DiagnosticReport = {
      status: "ok",
      entries: makeEntries(),
      summary: { total: 5, found: 5, requiredMissing: 0, optionalMissing: 0 },
    };
    const text = formatDoctorText(report);
    expect(text).toContain("状態: ok");
    expect(text).toContain("5/5 発見");
    for (const name of ["pandoc", "latexmk", "lualatex", "pandoc-crossref", "markdownlint-cli2"]) {
      expect(text).toContain(name);
    }
  });

  it("未発見バイナリに ✗ を付け、発見済みには ✓ を付ける", () => {
    const report: DiagnosticReport = {
      status: "degraded",
      entries: makeEntries({
        "pandoc-crossref": { found: false, binPath: null, version: null },
      }),
      summary: { total: 5, found: 4, requiredMissing: 0, optionalMissing: 1 },
    };
    const text = formatDoctorText(report);
    expect(text).toContain("✗");
    expect(text).toContain("✓");
    expect(text).toContain("状態: degraded");
  });

  it("errors 状態のラベルを出す", () => {
    const report: DiagnosticReport = {
      status: "errors",
      entries: makeEntries({ lualatex: { found: false, binPath: null, version: null } }),
      summary: { total: 5, found: 4, requiredMissing: 1, optionalMissing: 0 },
    };
    expect(formatDoctorText(report)).toContain("状態: errors");
  });

  it("版取得失敗の versionError を行末に添える", () => {
    const report: DiagnosticReport = {
      status: "ok",
      entries: makeEntries({ pandoc: { versionError: "版を取得できませんでした" } }),
      summary: { total: 5, found: 5, requiredMissing: 0, optionalMissing: 0 },
    };
    expect(formatDoctorText(report)).toContain("版を取得できませんでした");
  });

  it("未発見バイナリは (未発見) を表示する", () => {
    const report: DiagnosticReport = {
      status: "degraded",
      entries: makeEntries({ "pandoc-crossref": { found: false, binPath: null, version: null } }),
      summary: { total: 5, found: 4, requiredMissing: 0, optionalMissing: 1 },
    };
    expect(formatDoctorText(report)).toContain("(未発見)");
  });
});
