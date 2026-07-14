// File: src/cli/fsVault.ts
// Purpose: VaultLike の CLI（fs）実装。フォルダを再帰スキャンしてファイル index を構築し、
//          resolveLink（拡張子省略・shortest-path）と read で Obsidian の vault アクセスを
//          エミュレートする。expandTransclusions を CLI から使うための adapter。
// Reason: Step1（749c450）で expandTransclusions は VaultLike で obsidian 非依存になった。
//          CLI で ![[link]] 展開を動かすには、VaultLike の fs 実装が必要。プロトタイプ
//          （src/cli/prototype/NOTES.md）で検証した resolveLink の境界（拡張子省略・
//          shortest-path）を本実装に持ち込む。
// Related: src/utils/vaultLike.ts, src/utils/transclusion.ts, src/cli/prototype/NOTES.md

import * as fs from "fs/promises";
import * as path from "path";
import type { VaultLike } from "../utils/vaultLike";

/**
 * rootDir を vault ルートとする fs 版 VaultLike を構築する。
 *
 * 起動時に rootDir を再帰スキャンしてファイル一覧（vault 相対・/ 区切り）を index 化する。
 * resolveLink はこの index から拡張子省略・shortest-path で候補を探す（Obsidian の
 * getFirstLinkpathDest の簡易再現）。read は index の相対パスを rootDir 付きで読む。
 *
 * 注意: ファイル追加・削除後は index が更新されない（構築時スナップショット）。CLI の
 * 1回実行（convert / pack test）では問題ない。常駐プロセスで使う場合は再構築が必要。
 */
export async function makeFsVault(rootDir: string): Promise<VaultLike> {
  const files = await collectFiles(rootDir, "");
  const fileSet = new Set(files);

  return {
    resolveLink(linkPath, _sourcePath) {
      // sourcePath からの相対解決は将来拡張。現状は basename + shortest-path。
      const candidates = files.filter(p => matchesLink(p, linkPath));
      if (candidates.length === 0) return null;
      // shortest-path 一意性: パス階層が浅い順 → 同階層は辞書順で安定。
      candidates.sort(
        (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
      );
      const picked = candidates[0];
      return { path: picked, extension: extensionOf(picked) };
    },
    async read(filePath) {
      if (!fileSet.has(filePath)) return null;
      try {
        return await fs.readFile(path.join(rootDir, filePath), "utf8");
      } catch {
        return null;
      }
    },
  };
}

/** ファイルパス（vault 相対）が linkPath（拡張子省略可）に一致するか。 */
function matchesLink(filePath: string, linkPath: string): boolean {
  const base = basename(filePath);       // "sub.md"
  const baseNoExt = base.replace(/\.\w+$/, ""); // "sub"
  return (
    filePath === linkPath
    || filePath === linkPath + ".md"
    || filePath.endsWith("/" + linkPath)
    || filePath.endsWith("/" + linkPath + ".md")
    || baseNoExt === linkPath
    || base === linkPath
  );
}

/** パスの basename（最後の / 以降）。区切りは / に正規化して扱う（index は / 区切り）。 */
function basename(p: string): string {
  const last = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return last >= 0 ? p.slice(last + 1) : p;
}

/** パスの拡張子（最後の . 以降・無ければ空）。 */
function extensionOf(p: string): string {
  const dot = p.lastIndexOf(".");
  const slash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  // ドットがスラッシュより前（隠しファイル .git 等）なら拡張子無し。
  if (dot <= slash) return "";
  return p.slice(dot + 1);
}

/** rootDir を再帰スキャンし、ファイルの vault 相対パス（/ 区切り）一覧を返す。 */
async function collectFiles(base: string, rel: string): Promise<string[]> {
  const full = rel ? path.join(base, ...rel.split("/")) : base;
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(full, { withFileTypes: true });
  } catch {
    return [];
  }
  const result: string[] = [];
  for (const e of entries) {
    // 常に / 区切りで相対パスを構築（クロスプラットフォームのため）。
    const childRel = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) {
      result.push(...(await collectFiles(base, childRel)));
    } else {
      result.push(childRel);
    }
  }
  return result;
}
