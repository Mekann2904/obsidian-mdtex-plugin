// File: src/cli/convert.ts
// Purpose: agent 向け CLI で Markdown を Pandoc 経由で変換する中核処理。
// Reason: Obsidian GUI なしで通常の Markdown→PDF/LaTeX/DOCX 変換を実行・dry-run できるようにするため。
//          pandoc 実行そのものは共通コア（pandocRun）へ委譲し、ここは input/defaults 解決と
//          出力パス決定に徹する。
// Related: src/cli/commands/convert.ts, src/cli/packTest.ts, src/cli/pandocRun.ts

import * as fs from "fs/promises";
import * as path from "path";
import { DEFAULTS_FILE_NAME } from "../services/templatePackMeta";
import { normalizeForCli } from "./normalize";
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
  /** コマンドを表示するのみで実行しない。 */
  dryRun?: boolean;
}

export type ConvertCliStatus = PandocRunResult["status"];

export interface ConvertCliResult extends PandocRunResult {
  /** 入力 Markdown の絶対パス。 */
  input: string;
  /** 解決した defaults file（指定/pack 解決時）。 */
  defaultsUsed?: string;
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

  // 本文を読み、正規化（GUI と同じパイプラインの CLI 版）して pandoc へ stdin で渡す。
  const rawContent = await fs.readFile(inputPath, "utf8");
  const content = normalizeForCli(rawContent);

  const run = await runPandocConvert({
    input: inputPath,
    inputContent: content,
    defaultsPath,
    output: outputPath,
    pandoc: options.pandoc,
    dryRun: options.dryRun,
    cwd: path.dirname(inputPath),
    ensureDir: path.dirname(outputPath),
  });

  return defaultsPath ? { ...run, input: inputPath, defaultsUsed: defaultsPath } : { ...run, input: inputPath };
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
