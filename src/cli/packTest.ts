// File: src/cli/packTest.ts
// Purpose: テンプレートパックでサンプル原稿を実際に PDF 生成し、パックが組版可能か
//          検証する（pack test コマンドの中核）。
// Reason: エージェントが「パックを作った → validate → test で PDF 生成まで通す」ループを
//          完結できるようにする。pandoc 実行そのものは共通コア（pandocRun）へ委譲し、
//          ここは sample 解決・workDir 決定・keepArtifacts に徹する。
// Related: src/cli/index.ts, src/cli/pandocRun.ts, src/services/packAccess.ts

import * as os from "os";
import * as path from "path";
import { runCommand } from "../utils/processRunner";
import { DEFAULTS_FILE_NAME } from "../services/templatePackMeta";
import { normalizeFileForCli } from "./normalize";
import type { DuplicateLabel } from "../utils/crossrefLabels";
import { runPandocConvert, type PandocRunResult } from "./pandocRun";
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
  /** vault ルート（![[link]] 展開の探索範囲）。未指定時は sample.md のディレクトリ。 */
  vaultRoot?: string;
  /** 画像のスケール属性（例: width=0.8\\textwidth）。未指定時は属性省略。 */
  imageScale?: string;
  /** 中間 .tex をも保存する。 */
  keepArtifacts?: boolean;
  /** コマンドを表示するのみ（実行しない）。 */
  dryRun?: boolean;
}

/** pack test の実行結果。pandoc 実行の共通形状（PandocRunResult）を拡張する。 */
export interface PackTestResult extends PandocRunResult {
  pack: string;
  /** 実際に使ったサンプル原稿のパス。 */
  sampleUsed: string;
  /** keepArtifacts 時の .tex パス。 */
  texArtifact?: string;
  /** crossref ラベルの重複（normalizeForCli が検出）。観測情報。 */
  duplicateLabels?: DuplicateLabel[];
}

/**
 * pack test を実行する。defaults.yaml / sample.md の存在確認 → workDir 決定 →
 * 共通コア（runPandocConvert）で PDF 生成。keepArtifacts で .tex も追加生成する。
 */
export async function testPack(
  access: PackFileAccess,
  options: PackTestOptions,
): Promise<PackTestResult> {
  const { folder, pack } = options;
  const defaultsPath = path.resolve(folder, pack, DEFAULTS_FILE_NAME);
  const samplePath = options.sample
    ? path.resolve(options.sample)
    : path.resolve(folder, pack, SAMPLE_FILE_NAME);

  // 早期失敗（defaults/sample 不在）は runPandocConvert を経由しないため、output は未確定。
  // convert.ts の早期失敗と同じく空文字をセンティネルとして置く（PandocRunResult.output は必須）。
  const failed: PackTestResult = { pack, status: "error", command: "", output: "", sampleUsed: samplePath };

  if (!(await access.exists(defaultsPath))) {
    failed.error = `defaults.yaml が見つかりません: ${defaultsPath}`;
    return failed;
  }
  if (!(await access.exists(samplePath))) {
    failed.error = `サンプル原稿が見つかりません: ${samplePath}（--sample で指定、またはパックに sample.md を配置）`;
    return failed;
  }

  // cwd を sample.md のディレクトリではなく専用 temp にすることで、LaTeX の中間ファイル
  // （.aux/.log/.ltjruby 等）がサンプルパックを汚さない。画像は defaults.yaml の resource-path で解決する。
  const workDir = path.join(os.tmpdir(), `mdtex-test-${pack}-${Date.now()}`);
  const outputPath = options.output ? path.resolve(options.output) : path.join(workDir, `${pack}.pdf`);

  // sample を読み、正規化（GUI と同じパイプラインの CLI 版）して pandoc へ stdin で渡す。
  // vaultRoot（既定は sample.md のディレクトリ）を ![[link]] 展開の探索範囲とする。
  const rawSample = await access.readText(samplePath);
  const normalized = await normalizeFileForCli({
    rawContent: rawSample ?? "",
    filePath: samplePath,
    vaultRoot: options.vaultRoot,
    imageScale: options.imageScale,
  });
  const content = normalized.content;

  const run = await runPandocConvert({
    input: samplePath,
    inputContent: content,
    defaultsPath,
    output: outputPath,
    pandoc: options.pandoc,
    dryRun: options.dryRun,
    cwd: workDir,
    ensureDir: workDir,
  });

  const result: PackTestResult = {
    pack,
    sampleUsed: samplePath,
    ...run,
    duplicateLabels: normalized.duplicateLabels,
  };

  // keepArtifacts の .tex 生成も stdin で本文を渡す（共通コアと同じ本文経路）。
  if (run.status === "ok" && options.keepArtifacts) {
    const pandocBin = options.pandoc ?? "pandoc";
    const texPath = outputPath.replace(/\.pdf$/i, ".tex");
    const texRes = await runCommand(
      pandocBin,
      ["-d", defaultsPath, "-t", "latex", "-o", texPath],
      { cwd: workDir, input: content },
    );
    if (texRes.exitCode === 0) result.texArtifact = texPath;
  }

  return result;
}
