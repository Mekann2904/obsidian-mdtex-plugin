// File: src/services/diagnosticService.ts
// Purpose: LaTeX/Pandoc の stderr を解析して行番号付きエラー情報を生成する。
// Reason: エディタへのエラー表示をテストしやすい純粋関数で提供するため。
// Related: src/services/convertService.ts, src/services/diagnosticService.test.ts, src/extensions (CodeMirror lint 連携予定), plans.md

export interface LatexError {
  line: number;
  message: string;
}

/**
 * Pandoc/LaTeX の stderr 出力からエラー行とメッセージを抽出する。
 * 行番号はヘッダー行数を差し引いて Markdown 側の位置に補正する。
 */
export function parseLatexDiagnostics(stderr: string, headerLineCount: number = 0): LatexError[] {
  if (!stderr) return [];

  const errors: LatexError[] = [];
  const regex = /^l\.(\d+)\s*(.*)$/gm; // 例: "l.10 \\unknowncmd"

  let match: RegExpExecArray | null;
  while ((match = regex.exec(stderr)) !== null) {
    const rawLine = parseInt(match[1], 10);
    const message = (match[2] || "LaTeX Error").trim();
    const sourceLine = rawLine - headerLineCount;

    // ヘッダー内の行は無視し、本文以降のみ返す
    if (sourceLine > 0) {
      errors.push({ line: sourceLine, message });
    }
  }

  return errors;
}

/** ヘッダー文字列の行数を改行コード差異を吸収して数える。 */
export function countHeaderLines(headerContent: string): number {
  if (!headerContent) return 0;
  return headerContent.split(/\r\n|\r|\n/).length;
}
