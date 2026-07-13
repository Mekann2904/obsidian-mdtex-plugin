// File: src/cli/doctorReport.ts
// Purpose: `mdtex doctor` の人間向けテキスト整形（純粋関数）。DiagnosticReport → 文字列。
//          JSON 出力は cmdDoctor が直接 JSON.stringify する（pack validate と同じ）ので、
//          本 module は text のみ扱う。
// Reason: 整形ロジックを cmdDoctor の I/O から切り離し、report 入力で検証可能にする。
//          アライメント（桁揃え）は名前の最大幅に合わせて計算する。エージェントは --json を
//          使うため、text は人間が一目で状態を掴める簡潔な表にする（cli-for-agents 原則）。
// Related: src/cli/doctorDiagnose.ts, src/cli/commands/doctor.ts

import type { DiagnosticReport, DiagnosticStatus } from "./doctorDiagnose";

/** status → 人間向けラベル（状態行に表示）。 */
function statusLabel(status: DiagnosticStatus): string {
  switch (status) {
    case "ok":
      return "ok（全バイナリ発見）";
    case "degraded":
      return "degraded（必須は揃いましたがオプションが不足）";
    case "errors":
      return "errors（必須バイナリが不足・PDF 変換不可）";
  }
}

/**
 * DiagnosticReport を人間向けテキストに整形する（純粋関数）。
 *
 * - 状態行（statusLabel）→ 各エントリの表（✓/✗ + 名前 + 必須/オプ + 版 + パス）→ 集計行。
 * - 未発見は版を「—」・パスを「(未発見)」・先頭に ✗。
 * - 版取得失敗（versionError）は行末に理由を添える。
 * - 集計行は found/total と必須・オプションの内訳を出す。
 */
export function formatDoctorText(report: DiagnosticReport): string {
  const lines: string[] = [];
  lines.push("mdtex doctor — 環境診断");
  lines.push("");
  lines.push(`状態: ${statusLabel(report.status)}`);
  lines.push("");

  const nameWidth = Math.max(...report.entries.map(e => e.name.length));
  for (const e of report.entries) {
    const req = e.required ? "必須" : "オプ";
    const ver = e.version ?? (e.found ? "???" : "—");
    const path = e.binPath ?? "(未発見)";
    const mark = e.found ? "✓" : "✗";
    const tail = e.versionError ? `  (${e.versionError})` : "";
    lines.push(`${mark} ${e.name.padEnd(nameWidth)}  ${req}  ${ver}  ${path}${tail}`);
  }

  lines.push("");
  const reqTotal = report.entries.filter(e => e.required).length;
  const reqFound = report.entries.filter(e => e.required && e.found).length;
  const optTotal = report.entries.filter(e => !e.required).length;
  const optFound = report.entries.filter(e => !e.required && e.found).length;
  lines.push(
    `集計: ${report.summary.found}/${report.summary.total} 発見（必須 ${reqFound}/${reqTotal}・オプション ${optFound}/${optTotal}）`,
  );

  return lines.join("\n") + "\n";
}
