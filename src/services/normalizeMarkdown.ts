// File: src/services/normalizeMarkdown.ts
// Purpose: Obsidian 記法 → Pandoc 受理可能 Markdown への本文正規化パイプライン（8 step）
//   を 1 つの深い module にまとめる。GUI・CLI 両方から呼ばれる唯一の正規化経路。
// Reason: これまで各 step（stripObsidianComments / resolveDraftRequest / expandTransclusions /
//   rasterizeMermaidBlocks / markdownlint --fix / unwrapValidWikiLinks /
//   replaceWikiLinksAndCodeAsync / detectDuplicateLabels）は純粋関数として個別テストされていたが、
//   「どう順序付けて呼ぶか」という本当のバグ現場（lint は置換より先＝フェンス保護、
//   transclusion は wikilink より先、draft は header 構築より先）が呼び出し側の手続きの頭の中に
//   しかいなかった（architecture review 候補 A）。順序・transclusion キャッシュ・lint 中間ファイル
//   lifecycle を本 module の implementation に隠し、interface を通して 1 つの test surface で検証できる
//   ようにする。
//   さらに Obsidian App 依存を取り除き、VaultLike + injectable な mermaid/lint 通知にしたことで
//   CLI（normalizeForCli）の並列パイプラインを廃止し、順序不変条件をこの1箇所に集約した
//   （thermo-nuclear review #1: 2系統の手同期を解消）。
// Related: src/services/convertService.ts, src/services/conversionPaths.ts,
//   src/utils/markdownTransforms.ts, src/utils/transclusion.ts, src/utils/mermaidRasterizer.ts,
//   src/utils/frontmatter.ts, src/utils/crossrefLabels.ts, src/cli/normalize.ts

import * as fs from "fs/promises";
import type { VaultLike, ProfileLike } from "../utils/vaultLike";
import {
  replaceWikiLinksAndCodeAsync,
  unwrapValidWikiLinks,
  stripObsidianComments,
} from "../utils/markdownTransforms";
import { resolveDraftRequest } from "../utils/frontmatter";
import { expandTransclusions } from "../utils/transclusion";
import { detectDuplicateLabels, type DuplicateLabel } from "../utils/crossrefLabels";

/**
 * normalizeMarkdown への要求。
 *
 * 依存の表面を最小化する（leverage）: PluginContext や ProfileSettings そのものではなく、正規化に
 * 必要な vault / profile / オプショナルな mermaid・lint だけを受け取る。Obsidian App に依存しないため
 * GUI と CLI が同一パイプラインを共用でき、順序不変条件がこの module 1箇所に集約される
 * （thermo-nuclear review #1）。
 *
 * ステップの要否は「依存を渡したか」で表現し、boolean フラグとの二重指定を持たない:
 * - `rasterizeMermaid` を渡せばステップ4を実行（= enableExperimentalMermaid フラグは不要）。
 * - `lint` を渡せばステップ5を実行（フィールド揃いを型で強制し、静かなスキップを防ぐ）。
 * - `profile` は ProfileLike（imageScale / searchDirectory）。ProfileSettings は構造的にこれを満たす。
 */
export interface NormalizeRequest {
  /** 正規化前の生本文（frontmatter 含む） */
  content: string;
  /** ファイル解決・読み込みの抽象（GUI: makeObsidianVault / CLI: makeFsVault）。 */
  vault: VaultLike;
  sourcePath: string;
  /** 画像の width 属性・リンク検索範囲。ProfileSettings は構造的にこれを満たす。 */
  profile: ProfileLike;
  /** Pandoc 追加引数（スペース区切り）。未指定（CLI 等）時は空扱いで draft 解決のみ走る。 */
  pandocExtraArgs?: string;
  /** Mermaid ラスタライズ関数。渡したときのみステップ4を実行（GUI のみ注入）。 */
  rasterizeMermaid?: (content: string) => Promise<{ content: string; cleanupDirs: string[] }>;
  /** markdownlint --fix 設定。渡したときのみステップ5を実行。フィールド揃いを型で強制。 */
  lint?: {
    fix: (targetPath: string) => Promise<void>;
    intermediatePath: string;
    /** lint --fix が失敗したときの通知（GUI は Notice、CLI は省略＝console.error のみ）。 */
    onFailure?: () => void;
    /** lint 中間体（.temp.md）を削除せず残すか（deleteIntermediateFiles=false のとき true）。 */
    keepIntermediate?: boolean;
  };
}

/**
 * 正規化の結果。
 * - `content`: Pandoc へ stdin で渡す最終本文。
 * - `pandocExtraArgs`: `--draft` を除去した残りの Pandoc 追加引数。
 * - `draftRequested`: buildHeader へ伝播する draft フラグ（--draft 引数 OR frontmatter）。
 * - `duplicateLabels`: crossref ラベル重複（空なら続行可能）。Notice/中断は呼び出し側が判断。
 * - `cleanupDirs`: mermaid ラスタライズの一時ディレクトリ（呼び出し側の finally で cleanup）。
 */
export interface NormalizeResult {
  content: string;
  pandocExtraArgs: string[];
  draftRequested: boolean;
  duplicateLabels: DuplicateLabel[];
  cleanupDirs: string[];
}

/**
 * Obsidian 記法 → Pandoc 受理可能 Markdown へ本文を正規化する。
 *
 * 8 step の順序不変条件を本 module の implementation に隠す（locality）。呼び出し側は
 * 生本文を渡し、最終本文・draft フラグ・重複ラベル・cleanup 対象を受け取る（leverage）。
 * lint 中間ファイル（.temp.md）の lifecycle も内側で完結する。Obsidian App に依存しないため
 * GUI・CLI で共用する唯一のパイプライン（thermo-nuclear review #1）。
 */
export async function normalizeMarkdown(req: NormalizeRequest): Promise<NormalizeResult> {
  const { vault, sourcePath } = req;
  const cache = new Map<string, string>();
  const cleanupDirs: string[] = [];

  let content = req.content;

  // 1. Obsidian コメント (%% %%) 除去。Pandoc が構文認識できない唯一の記法で、reader の前
  //    に消さないと壊れるため、パイプラインの最初に置く（ADR-006）。
  content = stripObsidianComments(content);

  // 2. draft 要求（--draft 引数 + frontmatter の mdtex.draft）を1箇所で解決する。
  //    draft は LaTeX（graphicx）にだけ伝えるもので Pandoc 引数ではないため、ここで抜いて
  //    pandocExtraArgs から分離し、draft フラグを buildHeader 側へ伝播する。
  //    CLI は pandocExtraArgs を持たないが、空文字で呼べば extras=[]/draft=frontmatter 由来となり
  //    CLI が結果の content/duplicateLabels を使う上で無害（pandocExtraArgs 結果は CLI は消費しない）。
  const { pandocExtraArgs, draftRequested } = resolveDraftRequest(
    req.pandocExtraArgs ?? "",
    content,
  );

  // 3. トランスクルージョン (![[...]]) を先に展開（キャッシュを後段と共有）。
  content = await expandTransclusions(content, vault, sourcePath, cache);

  // 4. Mermaid コードブロックを一時 PNG 化し、PDF でも確実に図が描かれるようにする。
  //    rasterizeMermaid が注入されている場合のみ（GUI のみ）。CLI は注入しない＝このステップは no-op。
  //    「有効か」を boolean ではなく callback の有無で表現し、二重指定・静かなスキップを防ぐ
  //    （thermo-nuclear review #1-NEW）。
  if (req.rasterizeMermaid) {
    const mermaidResult = await req.rasterizeMermaid(content);
    content = mermaidResult.content;
    cleanupDirs.push(...mermaidResult.cleanupDirs);
  }

  // 5. markdownlint --fix。Markdown フェンス構造を保ったまま走らせたいので、LaTeX 置換より
  //    先に実行する（順序不変条件）。本文を中間ファイルに書き、lint.fix で --fix し、読み戻す。
  //    lint 失敗時は元の content をそのまま使い、lint.onFailure で呼び出し側に通知する（GUI は Notice）。
  //    中間ファイルの lifecycle は本 step で完結させる。lint オブジェクトの有無でステップ要否を表現
  //    （fix/intermediatePath は必須フィールドなので、片方忘れによる静かなスキップは起らない）。
  if (req.lint) {
    const { fix, intermediatePath: intermediate, onFailure, keepIntermediate } = req.lint;
    try {
      await fs.writeFile(intermediate, content, "utf8");
      try {
        await fix(intermediate);
        content = await fs.readFile(intermediate, "utf8");
      } catch (e: unknown) {
        console.error(e);
        onFailure?.();
        // lint 失敗時は pre-lint の content をそのまま使う
      }
    } finally {
      if (!keepIntermediate) {
        try {
          await fs.unlink(intermediate);
        } catch {
          // 中間ファイルが無ければ無視（ENOENT は正常系）
        }
      }
    }
  }

  // 6. 有効な WikiLink のみ [[ ]] を外してテキストにする。
  content = unwrapValidWikiLinks(content, vault, sourcePath);

  // 7. WikiLink / 埋め込み画像を標準 Markdown 記法へ。imageScale / searchDirectory は profile から。
  content = await replaceWikiLinksAndCodeAsync(content, vault, req.profile, sourcePath);

  // 8. crossref ラベルの重複検出（方式W）。メイン文書内のユーザーミス、および同一ファイル
  //    複数回埋め込みによる crossref 制約衝突を、Pandoc 実行前に検出する（ADR-005 関連）。
  //    Notice/中断の判断は呼び出し側に委ねる（本 module は検出と報告のみ）。
  const duplicateLabels = detectDuplicateLabels(content);

  return { content, pandocExtraArgs, draftRequested, duplicateLabels, cleanupDirs };
}
