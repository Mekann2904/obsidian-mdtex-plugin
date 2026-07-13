// File: src/utils/vaultLike.ts
// Purpose: expandTransclusions 等の本文正規化ステップが Obsidian API に依存せずに
//          ファイル解決・読み込みを行うための抽象 interface。GUI（Obsidian App）と
//          CLI（fs）で実装を差し替え、純粋ロジックを両者で共有する。
// Reason: expandTransclusions は app.metadataCache.getFirstLinkpathDest / app.vault.read に
//          依存していたため CLI から使えなかった。この interface で app 依存を2点
//          （resolveLink / read）に抽象化し、transclusion.ts を obsidian 非依存の純粋
//          モジュールにする（prototype 検証済み・src/cli/prototype/NOTES.md 参照）。
// Related: src/utils/transclusion.ts, src/services/obsidianVaultLike.ts,
//          src/cli/prototype/NOTES.md

/**
 * vault（ファイル群）へのアクセス抽象。expandTransclusions が Obsidian App に依存せず
 * ファイル解決と読み込みを行うための最小界面。
 *
 * - resolveLink: リンク文字列（![[...]] の中身・拡張子省略可）→ 対象ファイルの
 *   { path, extension }。未解決は null。Obsidian の getFirstLinkpathDest に相当
 *   （shortest-path 解決・拡張子補完を実装側で担う）。
 * - read: vault 相対パス → 本文。読めなければ null（throw しない）。
 */
export interface VaultLike {
  resolveLink(linkPath: string, sourcePath: string): { path: string; extension: string } | null;
  read(filePath: string): Promise<string | null>;
}
