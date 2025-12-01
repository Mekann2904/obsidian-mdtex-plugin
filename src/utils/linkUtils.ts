// File: src/utils/linkUtils.ts
// Purpose: WikiLink のリンク先ファイル存在チェックを提供するユーティリティ。
// Reason: 有効なリンクのみブラケット除去する際に、Obsidian のメタデータで検証するため。
// Related: src/utils/markdownTransforms.ts, src/services/convertService.ts

import { App, TFile } from "obsidian";

/**
 * WikiLink が指すファイルが実在するか確認し、存在する場合は TFile を返す。
 * エイリアス (|) や 見出し (#) は除去してパス部のみで解決する。
 */
export function getLinkTargetFile(app: App, linkText: string, sourcePath: string): TFile | null {
  const pathPart = linkText.split("|")[0].split("#")[0].split("^")[0];
  if (!pathPart.trim()) return null;

  const file = app.metadataCache.getFirstLinkpathDest(pathPart, sourcePath);
  return file instanceof TFile ? file : null;
}
