// File: src/utils/markdownTransforms.ts
// Purpose: Markdown変換時の置換処理を集約するユーティリティ。Obsidian API には VaultLike
//          （resolveLink / read）と ProfileLike（imageScale / searchDirectory）経由でアクセスし、
//          GUI/CLI 両対応の純粋ロジックにする（transclusion.ts と同じ抽象化パターン）。
// Reason: 変換サービスからロジックを切り出し、テストしやすくするため。app / profile への
//          依存を VaultLike / ProfileLike に抽象化し、CLI からも使えるようにする。
// Related: src/services/normalizeMarkdown.ts, src/utils/transclusion.ts, src/utils/vaultLike.ts

import type { VaultLike, ProfileLike } from "./vaultLike";

// stripObsidianComments は obsidian 非依存の純粋関数として別モジュールに切り出した（GUI/CLI 共有）。
export { stripObsidianComments } from "./stripObsidianComments";

export async function replaceWikiLinksAndCodeAsync(
  markdown: string,
  vault: VaultLike,
  profile: ProfileLike,
  sourcePath: string,
): Promise<string> {
  // 画像(![[...]]) とコードフェンスを1つの正規表現で扱う。コードフェンスは Pandoc
  // （fenced_code_attributes + --listings）へ委譲するため単独 capture を持たないが、
  // パターンに含めてコードブロック内の ![[...]] が最左最長マッチで保護されるようにする。
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

      const resolved = resolveLinkVault(vault, targetLink, sourcePath, profile.searchDirectory);
      if (!resolved) {
        result += fullMatch;
        continue;
      }

      if (resolved.extension.toLowerCase() === "md") {
        // 到達不能: 実パイプラインでは上位の expandTransclusions が .md 埋め込みを先に展開
        // 済みのため、ここへ .md が来ることはない。万が一残っていた場合は元の埋め込み記法を
        // そのまま出力して expandTransclusions の漏れを目立たせる（黙って誤展開しない）。
        result += fullMatch;
        continue;
      }

      // 画像（.md 以外）を標準 Markdown 画像記法へ。Pandoc が ![caption](path){#id width=...}
      // を reader で Image ノードへ正しくパースするため、TS は標準記法を吐くだけで LaTeX 化は
      // Pandoc/crossref に委ねる（ADR-005/Q4-1）。
      //   - label: pandoc-crossref は図参照に #fig:<name> を要求するため fig: 接頭辞を補完。
      //   - scale: profile.imageScale は "width=0.8\\textwidth" 形式の完全な属性値を想定。
      //   - latexPath: VaultLike の resolveLink が vault 相対・/ 区切りパスを返すのでそのまま使う。
      const rawCaption = (imageCaption || pipeCaption || "").trim();
      const captionPart = rawCaption || " "; // 空なら空白1つでキャプション省略を表現

      const labelAttr = imageLabel
        ? `#${imageLabel.startsWith("fig:") ? "" : "fig:"}${imageLabel}`
        : "";
      const scaleAttr = profile.imageScale || "";
      const attrs = [labelAttr, scaleAttr].filter(Boolean).join(" ");
      const attrBlock = attrs ? `{${attrs}}` : "";

      const imageMarkdown = `![${captionPart}](${resolved.path})${attrBlock}`;
      result += applyBlockquotePrefix(imageMarkdown, blockquotePrefix);
      continue;
    }

    // コードフェンスは画像以外の一致（fullMatch に丸ごと含まれる）。加工せずパススルー。
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
 * vault でリンク先が解決できた場合のみブラケットを外す（未解決はそのまま残す）。
 */
export function unwrapValidWikiLinks(markdown: string, vault: VaultLike, sourcePath: string): string {
  // ![[...]]（埋め込み・画像）を除外するため否定後読みを付ける
  const wikiLinkRegex = /(?<!!)\[\[(.*?)\]\]/g;
  const lines = markdown.split("\n");
  let inFence = false;

  // CommonMark 互換のフェンス開閉行: 0個以上の空白 + (``` または ~~~) 3本以上。
  const fenceLineRegex = /^\s*(`{3,}|~{3,})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fenceLineRegex.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    lines[i] = line.replace(wikiLinkRegex, (match, inner) => {
      // | alias や # heading / ^ blockId を除去してパス部のみで解決する（旧 getLinkTargetFile 相当）。
      const pathPart = inner.split("|")[0].split("#")[0].split("^")[0].trim();
      if (!pathPart) return match;
      const target = vault.resolveLink(pathPart, sourcePath);
      if (!target) return match;
      const aliasSplit = inner.split("|");
      if (aliasSplit.length > 1) return aliasSplit[1];
      return aliasSplit[0];
    });
  }

  return lines.join("\n");
}

/**
 * VaultLike でリンクを解決する。旧 resolveLinkFile の3段階（getFirstLinkpathDest →
 * getAbstractFileByPath → basename マッチ）を vault.resolveLink に集約し、searchDirectory が
 * あればその配下に限定する。
 */
function resolveLinkVault(
  vault: VaultLike,
  linktext: string,
  sourcePath: string,
  searchDirectory?: string,
): { path: string; extension: string } | null {
  const bare = linktext.split("|")[0].split("#")[0].split("^")[0].trim();
  if (!bare) return null;
  const resolved = vault.resolveLink(bare, sourcePath);
  if (!resolved) return null;
  if (searchDirectory && !isWithinDirectory(resolved.path, searchDirectory)) return null;
  return resolved;
}

function isWithinDirectory(filePath: string, directory: string): boolean {
  const dir = directory.endsWith("/") ? directory : directory + "/";
  return filePath === directory || filePath.startsWith(dir);
}
