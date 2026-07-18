// File: src/services/conversionPaths.ts
// Purpose: 1 回の変換実行で使う作業パス群（入力・出力・lint 中間体・header・リソースパス）
//   を 1 つの値として構築する純粋関数を提供する。
// Reason: これまで 9 個の派生パス（inputFilePath / baseName / sourceDir / outputDir /
//   resourcePath / tempFileName / intermediateFilename / headerFilePath / outputFilename）
//   の命名知識が convertCurrentPage の局所変数として 180 行の関数の行間に散在していた
//   （architecture review 候補 C）。命名規則（空白→_, latex→.tex 拡張子選択, 中間体の置き場）
//   を 1 箇所に集め、app 依存なしでテスト可能にする。
// Related: src/services/convertService.ts, src/services/normalizeMarkdown.ts, src/utils/pathHelpers.ts

import * as path from "path";
import { joinFsPath } from "../utils/pathHelpers";
import type { OutputFormat } from "./pandocCommandBuilder";

/**
 * 1 回の変換実行の作業レイアウト。
 *
 * どのファイルがどこへ落ちるかの知識をこの値 1 つにまとめる（locality）。呼び出し側は
 * `buildConversionPaths` で構築した値をそのまま使う。app（Obsidian API）には依存しないため、
 * 純粋関数として単体テスト可能。
 */
export interface ConversionPaths {
  /** 元 .md の絶対パス */
  input: string;
  /** 出力ファイル（.pdf / .tex / .docx）の絶対パス */
  output: string;
  /** markdownlint --fix 用の中間ファイル（ソース側に置く）。lint 無効時は空文字。 */
  intermediate: string;
  /** 元 .md の属するディレクトリ（Pandoc の workingDir） */
  sourceDir: string;
  /** 出力ディレクトリ（access チェック済みの前提） */
  outputDir: string;
  /** --resource-path（呼び出し側で searchDirectory/vault 解決済みのもの） */
  resourcePath: string;
}

export interface BuildConversionPathsArgs {
  /** 元 .md の絶対パス */
  inputFilePath: string;
  /** 出力ディレクトリの絶対パス */
  outputDir: string;
  /** 解決済みリソースパス（searchDirectory または vaultRoot） */
  resourcePath: string;
  /** 出力形式（latex のとき拡張子 .tex、他は .<format>） */
  format: OutputFormat;
  /** markdownlint --fix を走らせるか（中間ファイルパスの要否） */
  lintEnabled: boolean;
}

/**
 * 変換実行の作業パス群を構築する純粋関数。
 *
 * 命名規則（baseName の空白→_ 置換・latex の .tex 拡張子・lint 中間体の命名）をここ 1 箇所に集約する。
 * app 非依存・I/O なし。deletion test: これを削除すると命名知識が convertCurrentPage の行間に
 * 再出現する = 本物の module。
 */
export function buildConversionPaths(args: BuildConversionPathsArgs): ConversionPaths {
  const baseName = path.basename(args.inputFilePath, ".md").replace(/\s/g, "_");
  const sourceDir = path.dirname(args.inputFilePath);

  const tempFileName = `${baseName}.temp.md`;
  const intermediate = args.lintEnabled ? joinFsPath(sourceDir, tempFileName) : "";

  const ext = args.format === "latex" ? ".tex" : `.${args.format}`;
  const output = joinFsPath(args.outputDir, `${baseName}${ext}`);

  return {
    input: args.inputFilePath,
    output,
    intermediate,
    sourceDir,
    outputDir: args.outputDir,
    resourcePath: args.resourcePath,
  };
}
