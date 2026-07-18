// File: src/services/activeView.ts
// Purpose: 「アクティブな Markdown View が対象ファイルなら保存する」という前処理を
//   1箇所に集約する。
// Reason: convertService.convertCurrentPage と lintService.lintCurrentNote が同一の
//   8行ブロック（activeLeaf 取得 → MarkdownView チェック → save）を持っていた
//   （thermo-nuclear review #6）。保存の前提条件（対象ファイルがアクティブビューのファイルと
//   同一の場合だけ保存）の意味が2箇所に漂着するのを防ぐため、共通 helper にする。
// Related: src/services/convertService.ts, src/services/lintService.ts, src/services/pluginContext.ts

import { MarkdownView } from "obsidian";
import type { App, TFile } from "obsidian";

/**
 * アクティブリーフが対象ファイルを開いた MarkdownView なら、そのビューを保存する。
 *
 * 変換や Lint の直前に呼んで、エディタ上の編集中バッファをファイルへ反映させる。
 * 対象ファイルがアクティブビューでない場合は何もしない（別ファイルの保存を避ける）。
 */
export async function saveActiveMarkdownViewIfMatching(
  app: App,
  activeFile: TFile,
): Promise<void> {
  const leaf = app.workspace.activeLeaf;
  if (leaf && leaf.view instanceof MarkdownView) {
    const markdownView = leaf.view;
    if (markdownView.file && markdownView.file.path === activeFile.path) {
      await markdownView.save();
    }
  }
}
