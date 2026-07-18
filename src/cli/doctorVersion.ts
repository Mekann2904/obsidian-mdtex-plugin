// File: src/cli/doctorVersion.ts
// Purpose: `mdtex doctor` の版取得。`parseVersionOutput`（純粋: 各バイナリの --version 出力
//          から版を抽出）と `resolveVersionSubprocess`（I/O: 子プロセスで --version を実行）。
// Reason: doctor が観測すべきは「発見できたか」に加えて「版は何か」。版の抽出パターンは各
//          バイナリで異なる（pandoc は "pandoc x.y.z"、lualatex は "Version x.y" 等）。
//          各パーサーを独立した純粋関数として実機出力を fixtures に検証し、I/O（子プロセス）
//          は resolveVersionSubprocess に隔離する。diagnoseEnvironment には parseVersionOutput
//          を使う resolveVersion を cmdDoctor 側で組み立てて注入する。
// Related: src/cli/doctorDiagnose.ts, src/cli/commands/doctor.ts

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** --version 子プロセスのタイムアウト（応答しないバイナリで doctor が止まらないように）。 */
export const VERSION_PROBE_TIMEOUT_MS = 5000;

/**
 * 各バイナリの最初の行から版を抽出するパーサー。実機の --version 出力を fixtures とする。
 * パターンは各バイナリで異なるため、名前で明示的に割り当てる（共通化は誤抽出の元）。
 */
const VERSION_PARSERS: Record<string, (firstLine: string) => string | null> = {
  // pandoc 3.7.0.2  → "3.7.0.2"
  pandoc: line => /^pandoc\s+(\S+)/.exec(line)?.[1] ?? null,
  // Latexmk, ... Version 4.83  → "4.83"
  latexmk: line => /Version\s+(\S+)/.exec(line)?.[1] ?? null,
  // This is LuaHBTeX, Version 1.18.0 (TeX Live 2024)  → "1.18.0"
  lualatex: line => /Version\s+(\S+)/.exec(line)?.[1] ?? null,
  // pandoc-crossref v0.3.20 git commit ...  → "0.3.20"
  "pandoc-crossref": line => /\bv(\d[\w.]*)/.exec(line)?.[1] ?? null,
  // markdownlint-cli2 v0.18.1 (markdownlint v0.38.0)  → "0.18.1"（最初の v版）
  "markdownlint-cli2": line => /\bv(\d[\d.]*)/.exec(line)?.[1] ?? null,
  // pdftoppm version 24.02.0  → "24.02.0"（poppler）
  pdftoppm: line => /version\s+(\S+)/.exec(line)?.[1] ?? null,
};

/**
 * バイナリ名と --version の stdout から版文字列を抽出する（純粋関数）。
 *
 * - stdout の最初の非空行を取り、名前に対応するパーサーを当てる。
 * - 未知のバイナリ名、空入力、パターン不合致は null（誤推測しない = 誠実）。
 */
export function parseVersionOutput(name: string, stdout: string): string | null {
  const parser = VERSION_PARSERS[name];
  if (!parser) return null;
  const firstLine = stdout.split(/\r?\n/).find(l => l.trim().length > 0);
  if (!firstLine) return null;
  return parser(firstLine);
}

/**
 * 子プロセスで `<binPath> --version` を実行し、版を抽出する（I/O）。
 *
 * プロセス起動失敗・タイムアウト・非ゼロ終了・解析失敗のいずれも null（doctor は止まらない）。
 * binPath は binDiscover が発見した実ファイルパスを前提とする。
 */
export async function resolveVersionSubprocess(
  name: string,
  binPath: string,
  timeoutMs: number = VERSION_PROBE_TIMEOUT_MS,
): Promise<string | null> {
  try {
    // pdftoppm（poppler）は --version でなく -v を使い、stderr に版を出すことがある。
    const args = name === "pdftoppm" ? ["-v"] : ["--version"];
    const { stdout, stderr } = await execFileAsync(binPath, args, { timeout: timeoutMs });
    return parseVersionOutput(name, stdout) ?? parseVersionOutput(name, stderr);
  } catch {
    return null;
  }
}
