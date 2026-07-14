// File: src/cli/normalize.ts
// Purpose: CLI 変換前の本文正規化パイプライン（GUI の normalizeMarkdown の CLI 版）。
// Reason: convert / packTest が正規化ステップを直接インラインで持つと、ステップ追加で
//          呼び出し側に spaghetti 成長する。正規化知識を1箇所に集約し、GUI と共有する
//          normalizeMarkdown（plan.md L3 / VaultLike 抽象化）への移行地点にする。
// Related: src/utils/stripObsidianComments.ts, src/utils/crossrefLabels.ts,
//          src/services/normalizeMarkdown.ts, src/cli/convert.ts, src/cli/packTest.ts

import { stripObsidianComments } from "../utils/stripObsidianComments";
import { detectDuplicateLabels, type DuplicateLabel } from "../utils/crossrefLabels";
import { expandTransclusions } from "../utils/transclusion";
import type { VaultLike } from "../utils/vaultLike";

/** CLI 正規化の結果。content は pandoc へ渡す本文、duplicateLabels は crossref 重複。 */
export interface NormalizeForCliResult {
  content: string;
  duplicateLabels: DuplicateLabel[];
}

/**
 * CLI 変換前の本文正規化。GUI の normalizeMarkdown のステップのうち、obsidian 非依存で
 * 実現可能なものを段階的に追加する:
 *   1. stripObsidianComments（%% コメント除去）— GUI と同じ純粋関数を共有
 *   2. expandTransclusions（![[link]] 展開）— VaultLike で GUI と同じ純粋ロジックを共有
 *   3. detectDuplicateLabels（crossref ラベル重複検出）— 展開後の本文で content 不変・重複を報告
 * 今後 lint / WikiLink を追加し、最終的に GUI と共有パイプラインへ。
 *
 * draft 要求（resolveDraftRequest）は CLI に pandocExtraArgs / header 反映経路が無く
 * 設計判断が要るため未統合（別スライス）。
 */
export async function normalizeForCli(
  rawContent: string,
  vault: VaultLike,
  sourcePath: string,
): Promise<NormalizeForCliResult> {
  let content = stripObsidianComments(rawContent);
  content = await expandTransclusions(content, vault, sourcePath, new Map());
  const duplicateLabels = detectDuplicateLabels(content);
  return { content, duplicateLabels };
}
