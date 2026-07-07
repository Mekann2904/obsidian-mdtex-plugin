// File: src/utils/markdownTransforms.ts
// Purpose: Markdown変換時の置換・エスケープ処理を集約するユーティリティ。
// Reason: 変換サービスからロジックを切り出し、テストしやすくするため。
// Related: src/services/convertService.ts, src/services/lintService.ts, src/MdTexPlugin.ts, src/utils/transclusion.ts

import { FileSystemAdapter, App, TFile } from "obsidian";
import * as path from "path";
import { ProfileSettings } from "../MdTexPluginSettings";
import { getLinkTargetFile } from "./linkUtils";

// stripObsidianComments は obsidian 非依存の純粋関数として別モジュールに切り出した（GUI/CLI 共有）。
export { stripObsidianComments } from "./stripObsidianComments";

export async function replaceWikiLinksAndCodeAsync(
  markdown: string,
  app: App,
  profile: ProfileSettings,
  sourcePath: string,
): Promise<string> {
  // 画像(![[...]]) とコードフェンスを1つの正規表現で扱う。
  // コードフェンスは Pandoc（fenced_code_attributes + --listings）へ委譲するため
  // 単独の capture を持たないが、パターンに含めておくことでコードブロック内の
  // ![[...]] 画像/WikiLink が最左最長マッチで保護され置換対象にならない。
  const regex =
    /(^[ \t]*> ?)?!\[\[([^\]]+)\]\](?:\{#([^}]+)\})?(?:\[(.*?)\])?|```(?:[\w-]+)?(?:\s*\{[^}]*\})?\n(?:[\s\S]*?)```/gm;
  let result = "";
  let lastIndex = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const match = regex.exec(markdown);
    if (!match) break;

    const [fullMatch, blockquotePrefix, imageLink, imageLabel, imageCaption] = match;
    result += markdown.slice(lastIndex, match.index);
    lastIndex = regex.lastIndex;

    if (imageLink) {
      let targetLink = imageLink;
      let pipeCaption = "";
      if (imageLink.includes("|")) {
        const splitIdx = imageLink.lastIndexOf("|");
        targetLink = imageLink.substring(0, splitIdx);
        pipeCaption = imageLink.substring(splitIdx + 1);
      }

      const resolvedFile = resolveLinkFile(app, targetLink, sourcePath, profile.searchDirectory);
      if (!resolvedFile) {
        result += fullMatch;
        continue;
      }

      const adapter = app.vault.adapter as FileSystemAdapter;
      const vaultBase = adapter.getBasePath();
      const absPath = adapter.getFullPath(resolvedFile.path);
      const latexPath = absPath.startsWith(vaultBase)
        ? path.relative(vaultBase, absPath).split(path.sep).join("/")
        : absPath.split(path.sep).join("/");

      if (resolvedFile.extension.toLowerCase() === "md") {
        // 到達不能: 実パイプラインでは上位の expandTransclusions（transclusion.ts）が
        // すべての .md 埋め込みを先に展開済みのため、ここへ .md が来ることはない。
        // 従来は独自の再帰展開（replaceWikiLinksRecursivelyAsync）を抱え expandTransclusions
        // と重複していたが、Q5-1 でトランスクルージョン展開を transclusion.ts に集約し
        // こちらは削除した。安全のため、万が一 .md が残っていた場合は元の埋め込み記法を
        // そのまま出力して expandTransclusions の漏れを目立たせる（黙って誤展開しない）。
        result += fullMatch;
        continue;
      }

      // 画像（.md 以外）を標準 Markdown の画像記法へ変換する。
      // Pandoc は ![caption](path){#id width=...} を reader で Image ノードへ正しくパースするため、
      // TS は標準記法を吐くだけで LaTeX 化は Pandoc/crossref に委ねる（ADR-005/Q4-1）。
      //   - label: pandoc-crossref は図参照に #fig:<name> を要求するため、fig: 接頭辞を補完する。
      //     これは Pandoc の構文解釈ではなく crossref の参照解決要件で、TS が担う唯一の変換。
      //   - scale: profile.imageScale は "width=0.8\\textwidth" 形式の完全な属性値を想定。
      //   - caption: Pandoc が Markdown として解釈し出力フォーマット向けにエスケープするため、
      //     TS 側の escapeLatex は行わない（Q4-3）。
      // 引用の有無にかかわらず一律に標準記法を吐く。引用プレフィックスの付与は
      // applyBlockquotePrefix が行ごとに行う（blockquotePrefix は行頭 > を検出した場合のみ設定）。
      // 従来は inBlockquote で引用内画像を別扱い（width=100% デフォルト）していたが、
      // この分岐は imageScale デフォルト値の存在で事実上デッドコード化しており、
      // コメントと実装が不一致だったため廃止した（ADR-005）。
      const rawCaption = (imageCaption || pipeCaption || "").trim();
      const captionPart = rawCaption || " "; // 空なら空白1つでキャプション省略を表現

      const labelAttr = imageLabel
        ? `#${imageLabel.startsWith("fig:") ? "" : "fig:"}${imageLabel}`
        : "";
      const scaleAttr = profile.imageScale || "";
      const attrs = [labelAttr, scaleAttr].filter(Boolean).join(" ");
      const attrBlock = attrs ? `{${attrs}}` : "";

      const imageMarkdown = `![${captionPart}](${latexPath})${attrBlock}`;
      result += applyBlockquotePrefix(imageMarkdown, blockquotePrefix);
      continue;
    }

    // コードフェンスは画像以外の一致（fullMatch に丸ごと含まれる）。
    // lstlisting 生成は Pandoc へ委譲するため加工せずパススルーする。
    result += fullMatch;
  }

  result += markdown.slice(lastIndex);
  return result;
}

function applyBlockquotePrefix(text: string, blockquotePrefix?: string): string {
  if (!blockquotePrefix) return text;
  const prefix = blockquotePrefix.endsWith(" ") ? blockquotePrefix : `${blockquotePrefix} `;
  return text
    .split("\n")
    .map(line => `${prefix}${line}`)
    .join("\n");
}

/**
 * 有効な WikiLink だけ [[ ]] を外してテキストにする。コードフェンス内は手を付けない。
 */
export function unwrapValidWikiLinks(markdown: string, app: App, sourcePath: string): string {
  // ![[...]]（埋め込み・画像）を除外するため否定後読みを付ける
  const wikiLinkRegex = /(?<!!)\[\[(.*?)\]\]/g;
  const lines = markdown.split("\n");
  let inFence = false;

  // CommonMark 互換のフェンス開閉行: 0個以上の空白 + (``` または ~~~) 3本以上。
  // 従来は /^```/ のみ判定しチルダフェンス（~~~）を認識しないバグがあった
  // （チルダフェンス内の [[...]] が誤って展開されていた）。
  const fenceLineRegex = /^\s*(`{3,}|~{3,})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fenceLineRegex.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    lines[i] = line.replace(wikiLinkRegex, (match, inner) => {
      const target = getLinkTargetFile(app, inner, sourcePath);
      if (!target) return match;
      const aliasSplit = inner.split("|");
      if (aliasSplit.length > 1) return aliasSplit[1];
      return aliasSplit[0];
    });
  }

  return lines.join("\n");
}

function resolveLinkFile(
  app: App,
  linktext: string,
  sourcePath: string,
  searchDirectory?: string,
): TFile | null {
  const cached = app.metadataCache.getFirstLinkpathDest(linktext, sourcePath);
  if (cached instanceof TFile) return cached;

  const direct = app.vault.getAbstractFileByPath(linktext);
  if (direct instanceof TFile) return direct;

  const targetName = path.posix.basename(linktext).toLowerCase();
  const files = app.vault.getFiles();
  const match = files.find(file => {
    if (searchDirectory && !file.path.startsWith(searchDirectory)) return false;
    return file.name.toLowerCase() === targetName;
  });
  return match || null;
}

