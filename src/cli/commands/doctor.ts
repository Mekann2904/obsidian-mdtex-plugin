// File: src/cli/commands/doctor.ts
// Purpose: `mdtex doctor` コマンド実装。diagnoseEnvironment（純粋）に実行環境
//          （process.platform / PATH）と版取得（resolveVersionSubprocess）を注入して
//          DiagnosticReport を組み立て、text/JSON を出力し exit code を返す。
// Reason: CLI command 層は I/O のつなぎ合わせに徹し、判断ロジック（status 集計・版抽出・整形）
//          を doctorDiagnose / doctorVersion / doctorReport の純粋関数に委ねる。exit code は
//          pack validate と統一（errors→2 / degraded→1 / ok→0）。
// Related: src/cli/doctorDiagnose.ts, src/cli/doctorVersion.ts, src/cli/doctorReport.ts,
//          src/cli/index.ts

import { diagnoseEnvironment } from "../doctorDiagnose";
import { formatDoctorText } from "../doctorReport";
import { resolveVersionSubprocess } from "../doctorVersion";

export async function cmdDoctor(asJson: boolean): Promise<number> {
  // process.env.PATH は Node がプラットフォーム差異（Windows は Path）を吸収する。
  const pathEnv = process.env.PATH ?? "";
  const report = await diagnoseEnvironment(process.platform, pathEnv, resolveVersionSubprocess);

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(formatDoctorText(report));
  }

  return report.status === "errors" ? 2 : report.status === "degraded" ? 1 : 0;
}
