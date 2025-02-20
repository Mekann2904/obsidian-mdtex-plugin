// Mermaid-SVG.ts

import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Markdown内のMermaidブロックをSVGへ変換し、LaTeX用の書式に置換する。
 * @param markdown 元のMarkdown文字列
 * @returns 変換後のMarkdown文字列
 */
export async function replaceMermaidDiagrams(markdown: string): Promise<string> {
  // Mermaidブロックの正規表現（```mermaid で始まり、``` で終わる）
  const mermaidRegex = /```mermaid\s*\n([\s\S]+?)```/g;
  const promises: Promise<{ original: string; replacement: string }>[] = [];
  
  let match: RegExpExecArray | null;
  while ((match = mermaidRegex.exec(markdown)) !== null) {
    const fullMatch = match[0];
    const mermaidCode = match[1];
    promises.push(convertMermaidBlock(fullMatch, mermaidCode));
  }
  
  // 全ての変換が完了するまで待つ
  const replacements = await Promise.all(promises);
  let newMarkdown = markdown;
  for (const rep of replacements) {
    newMarkdown = newMarkdown.replace(rep.original, rep.replacement);
  }
  return newMarkdown;
}

/**
 * 1つのMermaidブロックをSVGに変換し、置換用のLaTeXコマンドを生成する。
 * ※ 一時ファイルの削除はPandocの処理後に実施するため、この関数では削除しません。
 * @param original 元のMermaidブロック全体
 * @param code Mermaidコード部分
 * @returns Promiseで置換対象文字列情報を返す
 */
async function convertMermaidBlock(
  original: string,
  code: string
): Promise<{ original: string; replacement: string }> {
  // 一意なファイル名を生成（例: mermaid-<timestamp>-<random>）
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const tempDir = os.tmpdir();
  const inputFilename = path.join(tempDir, `mermaid-${uniqueId}.mmd`);
  const outputFilename = path.join(tempDir, `mermaid-${uniqueId}.svg`);

  try {
    // Mermaidコードを一時ファイルに書き出し
    await fs.writeFile(inputFilename, code, "utf8");

    // mmdcコマンドを非同期で実行してSVGを生成
    await runMmdc(inputFilename, outputFilename);

    // 生成したSVGファイルのパスを、LaTeXの \includesvg コマンドで埋め込む形式に置換
    // ※ 一時ファイルの削除はPandoc処理後に実施するためここでは残します。
    const replacement = `\\includesvg{${outputFilename}}`;

    return { original, replacement };
  } catch (err) {
    console.error("Error converting Mermaid block:", err);
    // エラー時は元のブロックをそのまま残す
    return { original, replacement: original };
  }
}

/**
 * mmdcコマンドを実行してMermaidファイルからSVGファイルを生成する
 * @param inputFile 入力Mermaidファイルパス
 * @param outputFile 出力SVGファイルパス
 */
function runMmdc(inputFile: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // mmdcコマンドがパスにある前提
    const mmdc = spawn("mmdc", ["-i", inputFile, "-o", outputFile], {
      shell: true,
    });

    mmdc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`mmdc exited with code ${code}`));
      }
    });

    mmdc.on("error", (err) => {
      reject(err);
    });
  });
}
