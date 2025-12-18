// File: src/Mermaid-PDF.ts
// Purpose: MermaidコードブロックをPDFへ変換し、Markdown内リンクへ差し替える補助処理。
// Reason: 変換パイプラインでMermaid図を自動生成する必要があるため。
// Related: src/services/convertService.ts, src/utils/markdownTransforms.ts, src/MdTexPlugin.ts

import { spawn } from "child_process";
import { promises as fs } from "fs";
import { joinFsPath } from "./utils/pathHelpers";

/**
 * Markdown内のMermaidブロックをPDFへ変換し、
 * 中間ファイルでは `![[xxxxx.pdf]]` 形式に置換する。
 *
 * @param markdown 元のMarkdown文字列
 * @param outputDir 生成したPDFを配置するディレクトリ
 * @param mermaidCliPath mmdc のフルパス（設定されていなければ処理をスキップ）
 * @returns 変換後のMarkdown文字列と生成されたPDFの絶対パス配列
 */
export async function replaceMermaidDiagrams(
  markdown: string,
  outputDir: string,
  mermaidCliPath?: string
): Promise<{ content: string; generatedPdfs: string[] }> {
  if (!mermaidCliPath) {
    console.warn("mermaidCliPath not provided; skipping Mermaid PDF conversion.");
    return { content: markdown, generatedPdfs: [] };
  }

  // ```mermaid ... ``` のブロックを検出
  const mermaidRegex = /```mermaid\s*\n([\s\S]+?)```/g;
  const promises: Promise<{ original: string; replacement: string; generatedPdf: string | null }>[] = [];

  let match: RegExpExecArray | null;
  while ((match = mermaidRegex.exec(markdown)) !== null) {
    const fullMatch = match[0];
    const mermaidCode = match[1];
    promises.push(convertMermaidBlock(fullMatch, mermaidCode, outputDir, mermaidCliPath));
  }

  // 全ての変換が完了するまで待つ
  const replacements = await Promise.all(promises);
  let newMarkdown = markdown;
  const generatedPdfs: string[] = [];
  for (const rep of replacements) {
    newMarkdown = newMarkdown.replace(rep.original, rep.replacement);
    if (rep.generatedPdf) {
      generatedPdfs.push(rep.generatedPdf);
    }
  }
  return { content: newMarkdown, generatedPdfs };
}

/**
 * 1つのMermaidブロックを mmdc の --pdfFit オプションでPDFに変換
 * 結果として `![[xxx.pdf]]` 形式に置換する
 */
async function convertMermaidBlock(
  original: string,
  code: string,
  outputDir: string,
  mermaidCliPath: string
): Promise<{ original: string; replacement: string; generatedPdf: string | null }> {
  // 一意なファイル名
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const pdfFilename = `mermaid-${uniqueId}.pdf`;
  const outputFilename = joinFsPath(outputDir, pdfFilename);

  try {
    // 一時的な .mmd ファイルを作成
    const mmdFilename = joinFsPath(outputDir, `mermaid-${uniqueId}.mmd`);
    await fs.writeFile(mmdFilename, code, "utf8");

    // mmdc で PDF を生成（--pdfFit）
    // コマンド例: mmdc --pdfFit -i input.mmd -o output.pdf
    await runMmdcWithPdfFit(mmdFilename, outputFilename, mermaidCliPath);

    // 成功したら、Obsidian の Wiki リンク形式に置換
    const replacement = `![[${pdfFilename}]]`;
    return { original, replacement, generatedPdf: outputFilename };
  } catch (err) {
    console.error("Error converting Mermaid block:", err);
    // エラー時は元のブロックをそのまま残し、PDFの生成は無視する
    return { original, replacement: original, generatedPdf: null };
  }
}

/**
 * mmdc コマンドを --pdfFit オプションで実行する
 */
function runMmdcWithPdfFit(
  inputFile: string,
  outputFile: string,
  mermaidCliPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // --pdfFit -i input.mmd -o output.pdf
    const args = ["--pdfFit", "-i", inputFile, "-o", outputFile];
    console.log("Running mmdc with args:", args);

    const proc = spawn(mermaidCliPath, args, {
      shell: true,
      env: process.env,
    });

    proc.stdout?.on("data", (data) => {
      console.log("mmdc stdout:", data.toString());
    });
    proc.stderr?.on("data", (data) => {
      console.error("mmdc stderr:", data.toString());
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`mmdc exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}
