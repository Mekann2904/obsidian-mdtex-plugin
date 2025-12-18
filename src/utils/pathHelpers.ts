// File: src/utils/pathHelpers.ts
// Purpose: パス操作を集約し、OS間で一貫した区切り文字を提供する。
// Reason: Windows と Unix でのセパレータ差異による不具合を避けるため。
// Related: src/services/convertService.ts, src/Mermaid-PDF.ts, src/utils/mermaidRasterizer.ts

import * as path from "path";

/**
 * OS 標準のセパレータへ正規化した結合パスを返す。
 */
export function joinFsPath(...segments: string[]): string {
  return path.normalize(path.join(...segments.filter(Boolean)));
}

/**
 * 既存パスを OS 標準の区切りに揃える。
 */
export function normalizeFsPath(target: string): string {
  return path.normalize(target);
}

/**
 * Markdown 等で必要な POSIX 形式へ変換する（バックスラッシュ→スラッシュ）。
 */
export function toPosixPath(target: string): string {
  return target.replace(/\\/g, "/");
}

/**
 * Pandoc `--resource-path` などの「パスリスト」（OS依存のデリミタ区切り）を安全に正規化する。
 */
export function normalizeResourcePathList(list: string): string {
  return list
    .split(path.delimiter)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(normalizeFsPath)
    .join(path.delimiter);
}
