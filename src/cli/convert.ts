// File: src/cli/convert.ts
// Purpose: agent 向け CLI で Markdown を Pandoc 経由で変換する中核処理。
// Reason: Obsidian GUI なしで通常の Markdown→PDF/LaTeX/DOCX 変換を実行・dry-run できるようにするため。
//          pandoc 実行そのものは共通コア（pandocRun）へ委譲し、ここは input/defaults 解決と
//          出力パス決定に徹する。
// Related: src/cli/commands/convert.ts, src/cli/packTest.ts, src/cli/pandocRun.ts

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { DEFAULTS_FILE_NAME } from "../services/templatePackMeta";
import { normalizeFileForCli } from "./normalize";
import type { DuplicateLabel } from "../utils/crossrefLabels";
import { runPandocConvert, type PandocRunResult } from "./pandocRun";

export interface ConvertCliOptions {
  /** 入力 Markdown。 */
  input: string;
  /** 出力ファイル。未指定時は input の拡張子を format に応じて置換する。 */
  output?: string;
  /** 出力形式。未指定時は pdf。出力拡張子経由で pandoc の writer が決まる。 */
  format?: "pdf" | "latex" | "docx";
  /** Pandoc defaults file。 */
  defaults?: string;
  /** テンプレートフォルダ。pack 指定時に使う。 */
  folder?: string;
  /** テンプレートパック名。<folder>/<pack>/defaults.yaml を使う。 */
  pack?: string;
  /** Pandoc バイナリ。 */
  pandoc?: string;
  /** vault ルート（![[link]] 展開の探索範囲）。未指定時は入力 md のディレクトリ。 */
  vaultRoot?: string;
  /** 画像のスケール属性（例: width=0.8\\textwidth）。未指定時は属性省略。 */
  imageScale?: string;
  /** 中間ファイル（.aux/.log 等）を隔離する作業ディレクトリ。未指定時は OS temp 直下の専用 dir。
   *  未指定でも入力 md のディレクトリは汚さず、画像は --vault-root から解決する。 */
  workDir?: string;
  /** コマンドを表示するのみで実行しない。 */
  dryRun?: boolean;
}

export type ConvertCliStatus = PandocRunResult["status"];

export interface ConvertCliResult extends PandocRunResult {
  /** 入力 Markdown の絶対パス。 */
  input: string;
  /** 解決した defaults file（指定/pack 解決時）。 */
  defaultsUsed?: string;
  /** crossref ラベルの重複（normalizeForCli が検出）。pandoc 実行可否に影響しない観測情報。 */
  duplicateLabels?: DuplicateLabel[];
  /** dry-run 時の正規化後本文。agent が transclusion/WikiLink 等の正規化結果を観測する用。 */
  normalizedContent?: string;
}

/**
 * Markdown を変換する。input/defaults の存在確認 → defaults 解決 → 出力パス決定 →
 * 共通コア（runPandocConvert）で pandoc 実行。
 */
export async function convertMarkdownCli(options: ConvertCliOptions): Promise<ConvertCliResult> {
  const inputPath = path.resolve(options.input);
  const failed: ConvertCliResult = { status: "error", command: "", output: "", input: inputPath };

  if (!(await exists(inputPath))) {
    failed.error = `入力 Markdown が見つかりません: ${inputPath}`;
    return failed;
  }

  const defaultsPath = resolveDefaultsPath(options);
  if (defaultsPath && !(await exists(defaultsPath))) {
    failed.error = `defaults.yaml が見つかりません: ${defaultsPath}`;
    failed.defaultsUsed = defaultsPath;
    return failed;
  }

  const outputPath = options.output
    ? path.resolve(options.output)
    : defaultOutputPath(inputPath, options.format ?? "pdf");

  // vaultRoot は本文正規化とリソース解決で共有する（二重で同じ値を解決させない）。
  const vaultRoot = options.vaultRoot ? path.resolve(options.vaultRoot) : path.dirname(inputPath);
  // 本文を読み、正規化（GUI と同じパイプラインの CLI 版）して pandoc へ stdin で渡す。
  const rawContent = await fs.readFile(inputPath, "utf8");
  const normalized = await normalizeFileForCli({
    rawContent,
    filePath: inputPath,
    vaultRoot,
    imageScale: options.imageScale,
  });
  const content = normalized.content;

  // 中間ファイルを入力 md のディレクトリ（= vault）で汚さないよう、cwd を専用 workDir に隔離する。
  // 画像は --resource-path 経由で vaultRoot から解決する（cwd に依存しない）。
  const workDir = options.workDir ?? path.join(os.tmpdir(), `mdtex-convert-${Date.now()}`);
  const run = await runPandocConvert({
    input: inputPath,
    inputContent: content,
    defaultsPath,
    output: outputPath,
    // --format 明示時は -t で defaults の to: を上書き（未指定時は defaults に任せる）。
    writerFormat: options.format,
    resourcePath: vaultRoot,
    pandoc: options.pandoc,
    dryRun: options.dryRun,
    cwd: workDir,
    ensureDir: workDir,
  });

  const base = defaultsPath
    ? { ...run, input: inputPath, defaultsUsed: defaultsPath }
    : { ...run, input: inputPath };
  // normalizedContent は dry-run 時のみ（agent が正規化結果を観測する用途。実行結果には含めない）。
  return {
    ...base,
    duplicateLabels: normalized.duplicateLabels,
    ...(options.dryRun ? { normalizedContent: content } : {}),
  };
}

function resolveDefaultsPath(options: ConvertCliOptions): string | undefined {
  if (options.defaults) return path.resolve(options.defaults);
  if (!options.pack) return undefined;
  const folder = options.folder ?? "MdTex Templates";
  return path.resolve(folder, options.pack, DEFAULTS_FILE_NAME);
}

function defaultOutputPath(inputPath: string, format: "pdf" | "latex" | "docx"): string {
  const ext = format === "latex" ? ".tex" : `.${format}`;
  return path.join(path.dirname(inputPath), `${path.basename(inputPath, path.extname(inputPath))}${ext}`);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
