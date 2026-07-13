// File: src/services/normalizeMarkdown.ts
// Purpose: Obsidian 記法 → Pandoc 受理可能 Markdown への本文正規化パイプライン（8 step）
//   を 1 つの深い module にまとめる。
// Reason: これまで各 step（stripObsidianComments / resolveDraftRequest / expandTransclusions /
//   rasterizeMermaidBlocks / markdownlint --fix / unwrapValidWikiLinks /
//   replaceWikiLinksAndCodeAsync / detectDuplicateLabels）は純粋関数として個別テストされていたが、
//   「どう順序付けて呼ぶか」という本当のバグ現場（lint は置換より先＝フェンス保護、
//   transclusion は wikilink より先、draft は header 構築より先）が convertCurrentPage の
//   180 行の手続きの頭の中にしかいなかった（architecture review 候補 A）。
//   順序・transclusion キャッシュ・lint 中間ファイル lifecycle を本 module の implementation に隠し、
//   interface を通して 1 つの test surface で検証できるようにする。
// Related: src/services/convertService.ts, src/services/conversionPaths.ts,
//   src/utils/markdownTransforms.ts, src/utils/transclusion.ts, src/utils/mermaidRasterizer.ts,
//   src/utils/frontmatter.ts, src/utils/crossrefLabels.ts

import { Notice, App } from "obsidian";
import * as fs from "fs/promises";
import { ProfileSettings } from "../MdTexPluginSettings";
import {
  replaceWikiLinksAndCodeAsync,
  unwrapValidWikiLinks,
  stripObsidianComments,
} from "../utils/markdownTransforms";
import { resolveDraftRequest } from "../utils/frontmatter";
import { expandTransclusions } from "../utils/transclusion";
import { makeObsidianVault } from "./obsidianVaultLike";
import { rasterizeMermaidBlocks } from "../utils/mermaidRasterizer";
import { detectDuplicateLabels, type DuplicateLabel } from "../utils/crossrefLabels";
import type { ConversionPaths } from "./conversionPaths";
import { t } from "../lang/helpers";

/**
 * normalizeMarkdown への要求。
 *
 * 依存の表面を最小化する（leverage）: PluginContext そのものではなく、正規化に必要な
 * app / profile / 設定フラグ / lint 関数 / 作業パスだけを受け取る。lintFix は
 * `(targetPath) => Promise<void>` に窄め、本 module を PluginContext の知識から自由にする。
 */
export interface NormalizeRequest {
  /** 正規化前の生本文（frontmatter 含む） */
  content: string;
  app: App;
  sourcePath: string;
  profile: ProfileSettings;
  /** 実験的 Mermaid（PNG ラスタライズ）を有効化するか */
  enableExperimentalMermaid: boolean;
  /** 開発者ログを抑制するか */
  suppressDeveloperLogs: boolean;
  /** markdownlint --fix を走らせる関数（lint 有効時のみ）。中間ファイルパスを受け取る。 */
  lintFix?: (targetPath: string) => Promise<void>;
  /** 作業パス（paths.intermediate を lint 中間体として使う） */
  paths: ConversionPaths;
  /** lint 中間体（.temp.md）を削除せず残すか（profile.deleteIntermediateFiles の否定）。
   *  後方互換: deleteIntermediateFiles=false（既定）のとき true にして .temp.md を残す。 */
  keepLintIntermediate?: boolean;
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
 * lint 中間ファイル（.temp.md）の lifecycle も内側で完結する。
 */
export async function normalizeMarkdown(req: NormalizeRequest): Promise<NormalizeResult> {
  const { app, sourcePath, profile, paths } = req;
  const cache = new Map<string, string>();
  const cleanupDirs: string[] = [];

  let content = req.content;

  // 1. Obsidian コメント (%% %%) 除去。Pandoc が構文認識できない唯一の記法で、reader の前
  //    に消さないと壊れるため、パイプラインの最初に置く（ADR-006）。
  content = stripObsidianComments(content);

  // 2. draft 要求（--draft 引数 + frontmatter の mdtex.draft）を1箇所で解決する。
  //    draft は LaTeX（graphicx）にだけ伝えるもので Pandoc 引数ではないため、ここで抜いて
  //    pandocExtraArgs から分離し、draft フラグを buildHeader 側へ伝播する。
  const { pandocExtraArgs, draftRequested } = resolveDraftRequest(
    profile.pandocExtraArgs,
    content,
  );

  // 3. トランスクルージョン (![[...]]) を先に展開（キャッシュを後段と共有）。
  content = await expandTransclusions(content, makeObsidianVault(app), sourcePath, cache);

  // 4. Mermaid コードブロックを一時 PNG 化し、PDF でも確実に図が描かれるようにする
  //    （実験的機能が有効な場合のみ）。
  if (req.enableExperimentalMermaid) {
    const mermaidResult = await rasterizeMermaidBlocks(content, {
      app,
      sourcePath,
      imageScale: profile.imageScale,
      suppressLogs: req.suppressDeveloperLogs,
    });
    content = mermaidResult.content;
    cleanupDirs.push(...mermaidResult.cleanupDirs);
  }

  // 5. markdownlint --fix。Markdown フェンス構造を保ったまま走らせたいので、LaTeX 置換より
  //    先に実行する（順序不変条件）。本文を中間ファイルに書き、deps の lintFix で --fix し、
  //    読み戻す。lint 失敗時は元の content をそのまま使う（変換パイプラインを止めない）。
  //    中間ファイルの lifecycle は本 step で完結させる。
  if (req.lintFix && paths.intermediate) {
    const intermediate = paths.intermediate;
    try {
      await fs.writeFile(intermediate, content, "utf8");
      try {
        await req.lintFix(intermediate);
        content = await fs.readFile(intermediate, "utf8");
      } catch (e: unknown) {
        console.error(e);
        new Notice(t("notice_markdownlint_failed_continue"));
        // lint 失敗時は pre-lint の content をそのまま使う
      }
    } finally {
      if (!req.keepLintIntermediate) {
        try {
          await fs.unlink(intermediate);
        } catch {
          // 中間ファイルが無ければ無視（ENOENT は正常系）
        }
      }
    }
  }

  // 6. 有効な WikiLink のみ [[ ]] を外してテキストにする。
  content = unwrapValidWikiLinks(content, app, sourcePath);

  // 7. WikiLink / 埋め込み画像を標準 Markdown 記法へ。
  content = await replaceWikiLinksAndCodeAsync(content, app, profile, sourcePath);

  // 8. crossref ラベルの重複検出（方式W）。メイン文書内のユーザーミス、および同一ファイル
  //    複数回埋め込みによる crossref 制約衝突を、Pandoc 実行前に検出する（ADR-005 関連）。
  //    Notice/中断の判断は呼び出し側に委ねる（本 module は検出と報告のみ）。
  const duplicateLabels = detectDuplicateLabels(content);

  return { content, pandocExtraArgs, draftRequested, duplicateLabels, cleanupDirs };
}
