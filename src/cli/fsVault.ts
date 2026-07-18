// File: src/cli/fsVault.ts
// Purpose: VaultLike の CLI（fs）実装。フォルダを再帰スキャンしてファイル index を構築し、
//          resolveLink / read で Obsidian の vault アクセスをエミュレートする。
// Reason: Step1（749c450）で expandTransclusions は VaultLike で obsidian 非依存になった。
//          CLI で ![[link]] 展開を動かすには VaultLike の fs 実装が必要。リンク解決の正規
//          ロジック（相対・拡張子省略・shortest-path）は vaultLinking.ts に集約し、本 module
//          は fs 固有の I/O（index 構築・ファイル読み込み）に専念する。
// Related: src/utils/vaultLike.ts, src/utils/vaultLinking.ts, src/utils/transclusion.ts

import * as fs from "fs/promises";
import * as path from "path";
import type { VaultLike } from "../utils/vaultLike";
import { resolveLinkPath, extensionOf } from "../utils/vaultLinking";

/**
 * rootDir を vault ルートとする fs 版 VaultLike を構築する。
 *
 * 起動時に rootDir を再帰スキャンしてファイル一覧（vault 相対・/ 区切り）を index 化する。
 * resolveLink は vaultLinking.resolveLinkPath（正規実装）に委譲。read は index 外のパス
 * （../ による rootDir 脱出を含む）を拒否してから読む（path traversal ガード）。
 *
 * 注意: ファイル追加・削除後は index が更新されない（構築時スナップショット）。CLI の
 * 1回実行（convert / pack test）では問題ない。常駐プロセスで使う場合は再構築が必要。
 */
export async function makeFsVault(rootDir: string): Promise<VaultLike> {
  const files = await collectFiles(rootDir, "");
  const fileSet = new Set(files);

  return {
    resolveLink(linkPath, sourcePath) {
      const resolved = resolveLinkPath(files, linkPath, sourcePath);
      return resolved ? { path: resolved, extension: extensionOf(resolved) } : null;
    },
    async read(filePath) {
      // index 外のパスは拒否（../ で rootDir を脱出する攻撃経路も含む）。
      if (!fileSet.has(filePath)) return null;
      try {
        return await fs.readFile(path.join(rootDir, filePath), "utf8");
      } catch {
        return null;
      }
    },
  };
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
