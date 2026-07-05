// File: src/cli/packTest.ts
// Purpose: テンプレートパックでサンプル原稿を実際に PDF 生成し、パックが組版可能か
//          検証する（pack test コマンドの中核）。Pandoc を直接呼び出す。
// Reason: エージェントが「パックを作った → validate → test で PDF 生成まで通す」ループを
//          完結できるようにする。SKILL.md の Pandoc 直接実行スニペットを CLI 化。
// Related: src/cli/index.ts, src/utils/processRunner.ts, src/services/packAccess.ts

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { runCommand } from "../utils/processRunner";
import { DEFAULTS_FILE_NAME } from "../services/templatePackMeta";
import type { PackFileAccess } from "../services/packAccess";

/** パック内に置かれるサンプル原稿の慣習名。 */
const SAMPLE_FILE_NAME = "sample.md";

export interface PackTestOptions {
  folder: string;
  pack: string;
  /** サンプル原稿のパス（指定無ければパック内 sample.md）。 */
  sample?: string;
  /** 出力 PDF パス（指定無ければ temp）。 */
  output?: string;
  /** Pandoc バイナリ（指定無ければ PATH の pandoc）。 */
  pandoc?: string;
  /** 中間 .tex をも保存する。 */
  keepArtifacts?: boolean;
  /** コマンドを表示するのみ（実行しない）。 */
  dryRun?: boolean;
}

export type PackTestStatus = "ok" | "error" | "dry-run";

export interface PackTestResult {
  pack: string;
  status: PackTestStatus;
  /** 実行（または dry-run 表示）したコマンド文字列。 */
  command: string;
  /** 実際に使ったサンプル原稿のパス。 */
  sampleUsed: string;
  /** 生成 PDF のパス（成功時 / dry-run）。 */
  output?: string;
  /** keepArtifacts 時の .tex パス。 */
  texArtifact?: string;
  /** エラーメッセージ（失敗時）。 */
  error?: string;
  /** Pandoc の stderr 末尾（失敗時、原因特定用）。 */
  stderrTail?: string;
}

/**
 * pack test を実行する。defaults.yaml / sample.md の存在確認 → Pandoc 呼び出し。
 * dryRun の場合はコマンドを構築して実行せず status="dry-run" で返す。
 */
export async function testPack(
  access: PackFileAccess,
  options: PackTestOptions,
): Promise<PackTestResult> {
  const { folder, pack } = options;
  const defaultsPath = path.resolve(folder, pack, DEFAULTS_FILE_NAME);
  const samplePath = options.sample ? path.resolve(options.sample) : path.resolve(folder, pack, SAMPLE_FILE_NAME);

  const result: PackTestResult = {
    pack,
    status: "error",
    command: "",
    sampleUsed: samplePath,
  };

  if (!(await access.exists(defaultsPath))) {
    result.error = `defaults.yaml が見つかりません: ${defaultsPath}`;
    return result;
  }
  if (!(await access.exists(samplePath))) {
    result.error = `サンプル原稿が見つかりません: ${samplePath}（--sample で指定、またはパックに sample.md を配置）`;
    return result;
  }

  const pandocBin = options.pandoc ?? "pandoc";
  const workDir = path.join(os.tmpdir(), `mdtex-test-${pack}-${Date.now()}`);
  const outputPath = options.output
    ? path.resolve(options.output)
    : path.join(workDir, `${pack}.pdf`);

  const args = [samplePath, "-d", defaultsPath, "-o", outputPath];
  result.command = [pandocBin, ...args].join(" ");
  result.output = outputPath;

  if (options.dryRun) {
    result.status = "dry-run";
    return result;
  }

  // 実行時のみ作業ディレクトリを作る。cwd を sample.md のディレクトリではなく
  // 専用 temp にすることで、LaTeX の中間ファイル（.aux/.log/.ltjruby 等）が
  // サンプルパックを汚さない。画像は defaults.yaml の resource-path で解決する。
  await fs.mkdir(workDir, { recursive: true });

  try {
    const res = await runCommand(pandocBin, args, { cwd: workDir });
    if (res.exitCode !== 0) {
      result.status = "error";
      result.error = `pandoc が終了コード ${res.exitCode} で失敗しました`;
      result.stderrTail = res.stderr.slice(-2000);
      return result;
    }
    if (options.keepArtifacts) {
      const texPath = outputPath.replace(/\.pdf$/i, ".tex");
      const texRes = await runCommand(
        pandocBin,
        [samplePath, "-d", defaultsPath, "-t", "latex", "-o", texPath],
        { cwd: workDir },
      );
      if (texRes.exitCode === 0) result.texArtifact = texPath;
    }
    result.status = "ok";
    return result;
  } catch (e) {
    result.status = "error";
    result.error = `pandoc の実行に失敗: ${e instanceof Error ? e.message : String(e)}`;
    return result;
  }
}
