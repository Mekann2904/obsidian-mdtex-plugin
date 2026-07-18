// File: src/cli/normalize.ts
// Purpose: CLI 変換前の本文正規化入り口。GUI と共有する normalizeMarkdown（src/services/normalizeMarkdown.ts）
//   を fsVault + injectable な依存で呼ぶ薄い adapter。
// Reason: かつて CLI 専用の normalizeForCli（5 step）が GUI の normalizeMarkdown（8 step）と並列に存在し、
//   「ステップ順序は両者で同期する前提」という手同期になっていた。normalizeMarkdown を Obsidian
//   App 非依存（VaultLike + injectable mermaid/lint）にしたことで、CLI は同じパイプラインを呼び、
//   順序不変条件を1箇所（normalizeMarkdown）に集約した（thermo-nuclear review #1）。
//   CLI は draft/lint/mermaid を持たないため、それらの依存（pandocExtraArgs/lintFix/rasterizeMermaid）
//   を省略して呼ぶ = 該当ステップが自動的にスキップされる。
// Related: src/services/normalizeMarkdown.ts, src/cli/convert.ts, src/cli/packTest.ts, src/cli/fsVault.ts

import * as path from "path";
import { normalizeMarkdown, type NormalizeResult } from "../services/normalizeMarkdown";
import type { DuplicateLabel } from "../utils/crossrefLabels";
import { makeFsVault } from "./fsVault";

/** CLI 正規化の結果。content は pandoc へ渡す本文、duplicateLabels は crossref 重複。 */
export interface NormalizeForCliResult {
  content: string;
  duplicateLabels: DuplicateLabel[];
}

/**
 * ファイルベースの CLI 正規化入り口。convert / packTest の共通フロー（vaultRoot 解決 →
 * fsVault 構築 → sourcePath（vault 相対）→ 共有 normalizeMarkdown 呼び出し）を集約する。
 *
 * CLI は lint / mermaid / draft を扱わないため、normalizeMarkdown の対応する依存を省略する。
 * これらのステップが不要な場合は normalizeMarkdown 側で自動的にスキップされ、GUI と同じ
 * 「stripComments → expandTransclusions → unwrapValidWikiLinks → replaceWikiLinksAndCodeAsync →
 * detectDuplicateLabels」の順序で走る（lint/mermaid/draft は CLI では no-op）。
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

  const result: NormalizeResult = await normalizeMarkdown({
    content: opts.rawContent,
    vault,
    sourcePath,
    // CLI は画像スケールのみ profile として渡す。pandocExtraArgs / rasterizeMermaid / lint は
    // 渡さない = draft / mermaid / lint ステップが自動的にスキップされる（boolean フラグ不要）。
    profile: opts.imageScale ? { imageScale: opts.imageScale } : {},
  });

  return { content: result.content, duplicateLabels: result.duplicateLabels };
}
