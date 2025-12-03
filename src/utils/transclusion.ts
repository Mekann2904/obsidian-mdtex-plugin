// File: src/utils/transclusion.ts
// Purpose: ![[link]] 埋め込みの解決（Markdown展開またはファイルパス取得）を行うユーティリティ。
// Reason: Obsidian API を使ってリンク先の Markdown をインライン展開し、変換時に内容を取り込むため。
// Related: src/services/convertService.ts

import { App, TFile } from "obsidian";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

function parseLink(linkText: string): { path: string; heading?: string; blockId?: string } {
  const [pathAndFragment] = linkText.split("|");
  const [pathAndHeading, blockId] = pathAndFragment.split("^");
  const [path, heading] = pathAndHeading.split("#");
  return {
    path,
    heading: heading?.trim() || undefined,
    blockId: blockId?.trim() || undefined,
  };
}

/**
 * Markdown内の ![[...]] を展開する。Markdown以外の埋め込みはそのまま残す。
 * 簡易的な循環検出のため visited を使用。
 */
export async function expandTransclusions(
  markdown: string,
  app: App,
  sourcePath: string,
  visited: Set<string> = new Set()
): Promise<string> {
  const regex = /!\[\[(.*?)\]\]/g;
  let lastIndex = 0;
  let result = "";
  let m: RegExpExecArray | null;

  while ((m = regex.exec(markdown)) !== null) {
    const fullMatch = m[0];
    const inner = m[1];

    // 行頭からマッチ直前までを取得し、引用プレフィックス（> など）を検出する
    const lineStart = markdown.lastIndexOf("\n", m.index - 1) + 1;
    const before = markdown.substring(lineStart, m.index);
    const blockquoteMatch = before.match(/^\s*(>+\s*)$/);
    const blockquotePrefix = blockquoteMatch ? blockquoteMatch[1] : "";

    // プレフィックスを除いた部分を出力へ追加
    result += markdown.substring(lastIndex, lineStart);

    const parsed = parseLink(inner);
    const file = app.metadataCache.getFirstLinkpathDest(parsed.path, sourcePath);

    // 埋め込み先が見つからない・Markdown以外の場合はそのまま残す
    if (!file || !(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
      result += fullMatch;
      lastIndex = regex.lastIndex;
      continue;
    }

    const targetPath = file.path; // Vault 相対パス

    // 循環検出: 既に展開中ならプレースホルダーを追加してスキップ
    if (visited.has(targetPath)) {
      console.warn(`Circular reference detected: ${targetPath}`);
      result += "";
      lastIndex = regex.lastIndex;
      continue;
    }

    let content: string | null = null;
    try {
      content = await app.vault.read(file);
    } catch (e) {
      console.error(`Failed to read embedded file: ${file.path}`, e);
    }

    if (content === null) {
      result += fullMatch;
      lastIndex = regex.lastIndex;
      continue;
    }

    // 見出し (#heading) やブロック (^id) が指定されている場合は部分抽出を試みる
    let sliced = content;
    if (parsed.heading || parsed.blockId) {
      const extracted = extractSection(content, parsed.heading, parsed.blockId);
      if (extracted === null) {
        console.warn(`Section not found in ${targetPath}: ${parsed.heading || parsed.blockId}`);
        result += ""; // 消さずに空を入れておく
        lastIndex = regex.lastIndex;
        continue;
      } else {
        sliced = extracted;
      }
    }

    const newVisited = new Set(visited).add(targetPath);
    const expanded = await expandTransclusions(sliced, app, targetPath, newVisited);

    const withPrefix = blockquotePrefix ? applyBlockquotePrefix(expanded, blockquotePrefix) : expanded;
    result += withPrefix;
    lastIndex = regex.lastIndex;
  }

  // 残りの部分を追加
  result += markdown.substring(lastIndex);
  return result;
}

function extractSection(content: string, heading?: string, blockId?: string): string | null {
  if (blockId) {
    const blockRe = new RegExp(`^(.*)\\^${escapeRegExp(blockId)}\\s*$`, "m");
    const m = content.match(blockRe);
    if (m) return (m[1] || "").trim();
  }

  if (heading) {
    const headingRe = new RegExp(`^(#+)\\s+${escapeRegExp(heading)}\\s*$`, "m");
    const start = content.match(headingRe);
    if (!start || start.index === undefined) return null;
    const level = (start[1] || "").length;
    const rest = content.slice(start.index + start[0].length);
    const endRe = new RegExp(`^#{1,${level}}\\s+`, "m");
    const endMatch = rest.match(endRe);
    const endIndex = endMatch && endMatch.index !== undefined ? endMatch.index : rest.length;
    return rest.slice(0, endIndex).trim();
  }

  return null;
}

function applyBlockquotePrefix(text: string, prefix: string): string {
  const normalized = prefix.endsWith(" ") ? prefix : `${prefix} `;
  return text
    .split("\n")
    .map((line) => `${normalized}${line}`)
    .join("\n");
}
