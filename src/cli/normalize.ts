// File: src/cli/normalize.ts
// Purpose: CLI 変換前の本文正規化パイプライン（GUI の normalizeMarkdown の CLI 版）。
// Reason: convert / packTest が正規化ステップを直接インラインで持つと、ステップ追加で
//          呼び出し側に spaghetti 成長する。正規化知識を1箇所に集約し、GUI と共有する
//          normalizeMarkdown（plan.md L3 / VaultLike 抽象化）への移行地点にする。
// Related: src/utils/stripObsidianComments.ts, src/utils/crossrefLabels.ts,
//          src/services/normalizeMarkdown.ts, src/cli/convert.ts, src/cli/packTest.ts

import * as path from "path";
import { stripObsidianComments } from "../utils/stripObsidianComments";
import { detectDuplicateLabels, type DuplicateLabel } from "../utils/crossrefLabels";
import { expandTransclusions } from "../utils/transclusion";
import { unwrapValidWikiLinks, replaceWikiLinksAndCodeAsync } from "../utils/markdownTransforms";
import type { VaultLike, ProfileLike } from "../utils/vaultLike";
import { makeFsVault } from "./fsVault";

/** CLI 正規化の結果。content は pandoc へ渡す本文、duplicateLabels は crossref 重複。 */
export interface NormalizeForCliResult {
  content: string;
  duplicateLabels: DuplicateLabel[];
}

/**
 * CLI 変換前の本文正規化。GUI の normalizeMarkdown のステップのうち、obsidian 非依存で
 * 実現可能なものを段階的に追加する:
 *   1. stripObsidianComments（%% コメント除去）
 *   2. expandTransclusions（![[link]] 展開）
 *   3. unwrapValidWikiLinks（有効な [[WikiLink]] のブラケット除去）
 *   4. replaceWikiLinksAndCodeAsync（![[image]] の標準画像記法化・profile.imageScale 適用）
 *   5. detectDuplicateLabels（crossref ラベル重複検出）
 * 今後 lint / draft を追加し、最終的に GUI と共有パイプラインへ。
 *
 * draft 要求（resolveDraftRequest）は CLI に pandocExtraArgs / header 反映経路が無く
 * 設計判断が要るため未統合（別スライス）。
 */
export async function normalizeForCli(
  rawContent: string,
  vault: VaultLike,
  profile: ProfileLike,
  sourcePath: string,
): Promise<NormalizeForCliResult> {
  let content = stripObsidianComments(rawContent);
  content = await expandTransclusions(content, vault, sourcePath, new Map());
  content = unwrapValidWikiLinks(content, vault, sourcePath);
  content = await replaceWikiLinksAndCodeAsync(content, vault, profile, sourcePath);
  const duplicateLabels = detectDuplicateLabels(content);
  return { content, duplicateLabels };
}

/**
 * ファイルベースの CLI 正規化入り口。convert / packTest の共通フロー（vaultRoot 解決 →
 * fsVault 構築 → sourcePath（vault 相対）→ ProfileLike 組み立て → normalizeForCli）を集約し、
 * 両呼び出し元の重複を除去する。normalizeForCli（純粋）の I/O つなぎ合わせ版。
 */
export interface NormalizeForCliFileOptions {
  rawContent: string;
  filePath: string;
  vaultRoot?: string;
  imageScale?: string;
}

export async function normalizeFileForCli(opts: NormalizeForCliFileOptions): Promise<NormalizeForCliResult> {
  const vaultRoot = opts.vaultRoot ? path.resolve(opts.vaultRoot) : path.dirname(opts.filePath);
  const vault = await makeFsVault(vaultRoot);
  const sourcePath = path.relative(vaultRoot, opts.filePath) || path.basename(opts.filePath);
  const profile: ProfileLike = opts.imageScale ? { imageScale: opts.imageScale } : {};
  return normalizeForCli(opts.rawContent, vault, profile, sourcePath);
}
