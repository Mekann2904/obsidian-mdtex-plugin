// File: src/utils/vaultLinking.ts
// Purpose: vault 内ファイル索引から Obsidian ライクなリンクを解決する純粋関数。fsVault
//          （CLI・fs）とテスト用 memVault が共有する唯一の matching 正規実装。
// Reason: リンク解決（拡張子省略・sourcePath 相対・shortest-path）が fsVault と複数のテスト
//          stub で別々に再実装され、意味が漂着していた（thermo-nuclear review #1）。本関数に
//          集約し、生産と test fake の一致を保証する。
// Related: src/cli/fsVault.ts, src/utils/vaultLike.ts

import * as path from "path";

/** パスの basename（最後の / 以降）。区切りは / と \ 両方を扱う。 */
export function basenameOf(p: string): string {
  const last = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return last >= 0 ? p.slice(last + 1) : p;
}

/** パスの拡張子（最後の . 以降・無ければ空）。隠しファイルの先頭ドットは拡張子とみなさない。 */
export function extensionOf(p: string): string {
  const dot = p.lastIndexOf(".");
  const slash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  if (dot <= slash) return "";
  return p.slice(dot + 1);
}

/** ファイルパス（vault 相対）が linkPath（拡張子省略可）に一致するか。 */
function matchesLink(filePath: string, linkPath: string): boolean {
  const base = basenameOf(filePath);
  const baseNoExt = base.replace(/\.\w+$/, "");
  return (
    filePath === linkPath ||
    filePath === linkPath + ".md" ||
    filePath.endsWith("/" + linkPath) ||
    filePath.endsWith("/" + linkPath + ".md") ||
    baseNoExt === linkPath ||
    base === linkPath
  );
}

/** sourcePath のディレクトリを基準に linkPath を相対解決する（Obsidian の近似）。 */
function resolveRelative(linkPath: string, sourcePath: string, fileSet: Set<string>): string | null {
  if (!sourcePath) return null;
  const slash = sourcePath.lastIndexOf("/");
  const dir = slash >= 0 ? sourcePath.slice(0, slash) : "";
  for (const candidate of [linkPath, linkPath + ".md"]) {
    const joined = dir ? dir + "/" + candidate : candidate;
    const norm = path.posix.normalize(joined);
    // vault ルートより上（.. で脱出）は不可。
    if (norm && !norm.startsWith("..") && fileSet.has(norm)) return norm;
  }
  return null;
}

/**
 * vault 相対ファイル一覧から linkPath を解決し、vault 相対パスを返す（未解決は null）。
 *
 * 1. sourcePath 相対（埋め込み元ファイルと同階層を優先）→ 2. 大域 basename + shortest-path の
 *    フォールバック。fsVault とテスト用 memVault が共有する正規実装（単一の真実源）。
 */
export function resolveLinkPath(
  files: readonly string[],
  linkPath: string,
  sourcePath: string,
): string | null {
  const relative = resolveRelative(linkPath, sourcePath, new Set(files));
  if (relative) return relative;
  const candidates = files.filter(p => matchesLink(p, linkPath));
  if (candidates.length === 0) return null;
  // shortest-path 一意性: パス階層が浅い順 → 同階層は辞書順で安定。
  candidates.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  return candidates[0];
}
