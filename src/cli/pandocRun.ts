// File: src/cli/pandocRun.ts
// Purpose: Pandoc を1回実行して Markdown→PDF/LaTeX/DOCX 変換を行う共通コア。
// Reason: convert と pack test で同じ「引数構築 → dry-run → 実行 → exit code の結果写像」が
//          重複していたため、pandoc-convert 実行の知識を1箇所に集める。
// Related: src/cli/convert.ts, src/cli/packTest.ts, src/utils/processRunner.ts

import * as fs from "fs/promises";
import { runCommand } from "../utils/processRunner";

export type PandocRunStatus = "ok" | "error" | "dry-run";

/** pandoc-convert の実行結果（共通）。各コマンドはこれを拡張して返す。 */
export interface PandocRunResult {
  status: PandocRunStatus;
  /** 実行（または dry-run 表示）したコマンド文字列。 */
  command: string;
  /** 出力ファイルの絶対パス。 */
  output: string;
  /** エラーメッセージ（失敗時）。 */
  error?: string;
  /** Pandoc の stderr 末尾（失敗時、原因特定用）。 */
  stderrTail?: string;
}

export interface PandocRunParams {
  /** 入力 Markdown ファイルのパス。dry-run 表示・エラー文脈に使う。
   *  実行時の入力は inputContent を stdin で渡す（pandoc へファイルパスは渡さない）。 */
  input: string;
  /** 入力本文（正規化済み）。pandoc へ stdin で渡す。GUI と同じ本文経路でファイルを汚さない。 */
  inputContent: string;
  /** Pandoc defaults file。未指定時は -d を省く。 */
  defaultsPath?: string;
  /** 出力ファイル。 */
  output: string;
  /** 出力 writer 形式（pdf/latex/docx）。指定時は -t で defaults の to: を上書きする。 */
  writerFormat?: string;
  /** 画像等のリソース探索パス（通常 vaultRoot）。指定時は --resource-path を追加する。
   *  cwd を作業用 temp に隔離しても、画像を vault から解決できるようにする。 */
  resourcePath?: string;
  /** Pandoc バイナリ（既定: pandoc）。 */
  pandoc?: string;
  /** コマンドを表示するのみで実行しない。 */
  dryRun?: boolean;
  /** runCommand の cwd。 */
  cwd: string;
  /** 実行時に mkdir するディレクトリ（dry-run 時は作らない）。出力/cwd の确保用。 */
  ensureDir?: string;
}

/**
 * pandoc を1回起動して変換する。dry-run は実行せず status="dry-run" で返す。
 * 実行時は ensureDir を作ってから pandoc を起動し、exit code を結果に写す。
 * 例外は投げず、全て status/error に丸める（CLI の exit code 源をここに集中）。
 */
export async function runPandocConvert(params: PandocRunParams): Promise<PandocRunResult> {
  const pandocBin = params.pandoc ?? "pandoc";
  const baseArgs = params.defaultsPath ? ["-d", params.defaultsPath] : [];
  // -t は -d の後に置き、defaults file の to: を上書きする（pandoc は CLI 引数を defaults より優先）。
  const formatArgs = params.writerFormat ? ["-t", params.writerFormat] : [];
  // 画像リソースを cwd に依存せず vaultRoot から解決する。cwd を作業 temp に隔離しても壊れない。
  const resourceArgs = params.resourcePath ? ["--resource-path", params.resourcePath] : [];
  // 本文は常に stdin で渡す（input 引数は使わない）。GUI と同じ本文経路。
  const args = [...baseArgs, ...formatArgs, ...resourceArgs, "-o", params.output];
  // dry-run 表示は stdin 実行と等価な shell 表現（< input）で、agent がコピペ実行可能にする。
  const command = `${[pandocBin, ...args].join(" ")} < ${params.input}`;

  if (params.dryRun) {
    return { status: "dry-run", command, output: params.output };
  }

  try {
    if (params.ensureDir) {
      await fs.mkdir(params.ensureDir, { recursive: true });
    }
    const res = await runCommand(pandocBin, args, { cwd: params.cwd, input: params.inputContent });
    if (res.exitCode !== 0) {
      return {
        status: "error",
        command,
        output: params.output,
        error: `pandoc が終了コード ${res.exitCode} で失敗しました`,
        stderrTail: res.stderr.slice(-4000),
      };
    }
    return { status: "ok", command, output: params.output };
  } catch (e) {
    return {
      status: "error",
      command,
      output: params.output,
      error: `pandoc の実行に失敗: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
