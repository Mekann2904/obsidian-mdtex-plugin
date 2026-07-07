// File: src/cli/normalize.ts
// Purpose: CLI 変換前の本文正規化パイプライン（GUI の normalizeMarkdown の CLI 版）。
// Reason: convert / packTest が正規化ステップを直接インラインで持つと、ステップ追加で
//          呼び出し側に spaghetti 成長する。正規化知識を1箇所に集約し、GUI と共有する
//          normalizeMarkdown（plan.md L3 / VaultLike 抽象化）への移行地点にする。
// Related: src/utils/stripObsidianComments.ts, src/services/normalizeMarkdown.ts, src/cli/convert.ts, src/cli/packTest.ts

import { stripObsidianComments } from "../utils/stripObsidianComments";

/**
 * CLI 変換前の本文正規化。現在は GUI normalizeMarkdown の第1ステップ（%% コメント除去）のみ。
 * 今後 lint / transclusion / WikiLink を段階的に追加し、最終的に GUI と共有パイプラインへ。
 */
export function normalizeForCli(rawContent: string): string {
  return stripObsidianComments(rawContent);
}
