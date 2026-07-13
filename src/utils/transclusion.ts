// File: src/utils/transclusion.ts
// Purpose: ![[link]] 埋め込みの解決（Markdown展開またはファイルパス取得）を行うユーティリティ。
// Reason: リンク先の Markdown をインライン展開し、変換時に内容を取り込むため。Obsidian API には
//          VaultLike 抽象（resolveLink / read）経由でアクセスし、本 module を GUI/CLI 両対応の純粋
//          ロジックにする（prototype 検証済み・src/cli/prototype/NOTES.md 参照）。
// Related: src/utils/vaultLike.ts, src/services/obsidianVaultLike.ts, src/utils/markdownTransforms.ts

import type { VaultLike } from "./vaultLike";
import { namespacedRewrite, stripLabelDefinitions } from "./crossrefLabels";

function escapeRegExp(value: string): string {
  // 文字クラス内でエスケープが必要なのは ] と \ のみ（他は文字クラス内でリテラル扱い）。
  // 従来は [\\]\\] と二重エスケープしており文字クラス解釈が壊れていた（環境によって
  // ブロックID のメタ文字がリテラル扱いされずマッチ失敗するバグ）。
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
 *
 * 方式W/γ: expanded Set で「文書全体で既出のファイル」を追跡し、同一ファイルの
 * 2回目以降の埋め込みでは crossref ラベル定義だけを除去する（内容は表示）。
 * これにより同一ファイル複数回埋め込みでも crossref の Duplicate label が起きず、
 * かつ両方の埋め込みが内容を表示する（ユーザーの意図を尊重）。
 */
export async function expandTransclusions(
  markdown: string,
  vault: VaultLike,
  sourcePath: string,
  cache: Map<string, string>,
  visited: Set<string> = new Set(),
  expanded: Set<string> = new Set(),
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

    // プレフィックスを除いた部分を出力へ追加。
    // 従来は無条件で lineStart までしか足さず、行頭〜埋め込み直前（before）に含まれる
    // 引用プレフィックス「以外」のテキストもろとも消えていた（J2/J3/M3 のバグ）。
    // 修正: 引用プレフィックスが検出された場合のみ行頭まで足し（プレフィックスは別途
    // applyBlockquotePrefix で再付与）、それ以外は m.index まで足して before のテキストを残す。
    if (blockquotePrefix) {
      result += markdown.substring(lastIndex, lineStart);
    } else {
      result += markdown.substring(lastIndex, m.index);
    }

    const parsed = parseLink(inner);
    const resolved = vault.resolveLink(parsed.path, sourcePath);

    // 埋め込み先が見つからない・Markdown以外の場合はそのまま残す
    if (!resolved || resolved.extension.toLowerCase() !== "md") {
      result += fullMatch;
      lastIndex = regex.lastIndex;
      continue;
    }

    const targetPath = resolved.path; // Vault 相対パス

    // 循環検出: 既に展開中ならプレースホルダーを追加してスキップ
    if (visited.has(targetPath)) {
      console.warn(`Circular reference detected: ${targetPath}`);
      result += "";
      lastIndex = regex.lastIndex;
      continue;
    }

    let content: string | null = cache.get(targetPath) ?? null;

    if (content === null) {
      try {
        content = await vault.read(targetPath);
        if (content !== null) cache.set(targetPath, content);
      } catch (e) {
        console.error(`Failed to read embedded file: ${targetPath}`, e);
      }
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
    const expandedContent = await expandTransclusions(sliced, vault, targetPath, cache, newVisited, expanded);

    // 方式W: 埋め込み先の crossref ラベルと参照にファイル名プレフィックスを付与し、
    // 別ファイル由来の同名ラベル衝突を自動解決する（ADR-005 関連）。
    // メイン文書（この関数の最上位呼び出し）のラベルはリライトせず、埋め込み先のみ。
    // これにより各ファイルを単独変換したときと同じラベル名で動作し、かつ複数ファイルを
    // 埋め込んでも crossref の Duplicate label が起きない。
    const isFirstOccurrence = !expanded.has(targetPath);
    expanded.add(targetPath);

    let namespaced = namespacedRewrite(expandedContent, targetPath);

    // 選択肢γ: 同一ファイルが2回目以降に埋め込まれた場合、ラベル「定義」だけ除去する。
    // 内容（画像含む）と参照は残す。これにより同一ファイル複数回埋め込みでも:
    // - 両方の埋め込みが内容を表示する（ユーザーの意図を尊重）
    // - crossref ラベルは1回だけ定義される（Duplicate label 解消）
    // - 参照は1回目の実体を指す（自然）
    if (!isFirstOccurrence) {
      namespaced = stripLabelDefinitions(namespaced);
    }

    const withPrefix = blockquotePrefix
      ? applyBlockquotePrefix(namespaced, blockquotePrefix)
      : namespaced;
    result += withPrefix;
    lastIndex = regex.lastIndex;
  }

  // 残りの部分を追加
  result += markdown.substring(lastIndex);
  return result;
}

export function extractSection(content: string, heading?: string, blockId?: string): string | null {
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

export function applyBlockquotePrefix(text: string, prefix: string): string {
  const normalized = prefix.endsWith(" ") ? prefix : `${prefix} `;
  return text
    .split("\n")
    .map(line => `${normalized}${line}`)
    .join("\n");
}
