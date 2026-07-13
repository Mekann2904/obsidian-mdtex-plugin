// File: src/services/obsidianVaultLike.ts
// Purpose: Obsidian App を VaultLike に適応させる thin adapter。GUI 側で expandTransclusions
//          等の obsidian 非依存ロジックを呼ぶために使う。
// Reason: transclusion.ts を VaultLike で純粋化したことで、GUI は App を VaultLike に包んで
//          渡す必要がある。getFirstLinkpathDest / vault.read をそのまま呼び、GUI のリンク解決
//          ルール（shortest-path 等）を1ミリも変えない（characterization test で錨付け）。
// Related: src/utils/vaultLike.ts, src/utils/transclusion.ts, src/services/normalizeMarkdown.ts,
//          src/suggest/LabelReferenceSuggest.ts

import { App, TFile } from "obsidian";
import type { VaultLike } from "../utils/vaultLike";

/**
 * Obsidian App を VaultLike に包む（GUI 版）。CLI 版は fs で別実装する（将来の Step 2）。
 * resolveLink は getFirstLinkpathDest に、read は vault.read に委譲し、GUI 挙動を保持する。
 */
export function makeObsidianVault(app: App): VaultLike {
  return {
    resolveLink(linkPath, sourcePath) {
      const file = app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
      if (!file || !(file instanceof TFile)) return null;
      return { path: file.path, extension: file.extension };
    },
    async read(filePath) {
      const file = app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return null;
      try {
        return await app.vault.read(file);
      } catch {
        return null;
      }
    },
  };
}
