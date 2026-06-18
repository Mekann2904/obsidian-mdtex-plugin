// File: src/utils/markdownTransforms.ts
// Purpose: Markdown変換時の置換・エスケープ処理を集約するユーティリティ。
// Reason: 変換サービスからロジックを切り出し、テストしやすくするため。
// Related: src/services/convertService.ts, src/services/lintService.ts, src/MdTexPlugin.ts, src/utils/transclusion.ts

import { FileSystemAdapter, App, TFile } from "obsidian";
import * as path from "path";
import { ProfileSettings } from "../MdTexPluginSettings";
import { getLinkTargetFile } from "./linkUtils";

/**
 * Obsidian の `%% ... %%` コメントを Pandoc へ渡す前に取り除く。
 * コードフェンス内は手を付けない。
 */
export function stripObsidianComments(markdown: string): string {
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n"; // 元の改行を尊重
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];

  let inFence = false;
  let fenceMarker: "`" | "~" | null = null;
  let fenceLen = 0;

  let inComment = false;
  let inMathBlock = false;

  // 0–3空白 + （引用 > 可） + ``` または ~~~ をフェンスとみなす
  const fenceRegex = /^\s{0,3}(?:>\s*)*([`~]{3,})/;

  const buildProtectedRanges = (line: string): Array<[number, number]> => {
    const ranges: Array<[number, number]> = [];

    // インラインコード: 開きと同じ本数のバッククォートで閉じるものだけを保護
    let i = 0;
    while (i < line.length) {
      if (line[i] !== "`") {
        i += 1;
        continue;
      }
      let j = i;
      while (j < line.length && line[j] === "`") j += 1;
      const openLen = j - i;
      let k = j;
      let closed = false;
      while (k < line.length) {
        if (line[k] !== "`") {
          k += 1;
          continue;
        }
        let l = k;
        while (l < line.length && line[l] === "`") l += 1;
        const closeLen = l - k;
        if (closeLen === openLen) {
          ranges.push([i, l]);
          i = l;
          closed = true;
          break;
        }
        k = l;
      }
      if (!closed) i = j;
    }

    // 行内の $$...$$ を保護（同一行で閉じる場合）
    let m: RegExpExecArray | null;
    const displayMathInline = /\$\$[^$]*?\$\$/g;
    while ((m = displayMathInline.exec(line))) {
      ranges.push([m.index, m.index + m[0].length]);
    }

    // 行内の $...$ を保護（単ドル記号、$$ は除外）
    const inlineMath = /\$(?!\$)[^$\n]*?(?<!\\)\$(?!\$)/g;
    while ((m = inlineMath.exec(line))) {
      ranges.push([m.index, m.index + m[0].length]);
    }

    return ranges.sort((a, b) => a[0] - b[0]);
  };

  const isInRanges = (pos: number, ranges: Array<[number, number]>): boolean =>
    ranges.some(([s, e]) => pos >= s && pos < e);

  for (const line of lines) {
    const protectedRanges = buildProtectedRanges(line);

    // 数式ブロック中は内容を素通ししつつ $$ を数えて閉じる
    if (inMathBlock) {
      let toggles = 0;
      let idx = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const pos = line.indexOf("$$", idx);
        if (pos === -1) break;
        if (!isInRanges(pos, protectedRanges)) toggles += 1;
        idx = pos + 2;
      }
      if (toggles % 2 === 1) inMathBlock = false;
      output.push(line);
      continue;
    }

    // コメント中はフェンスを無視して漏れを防ぐ
    let fenceHandled = false;
    if (!inComment) {
      const fenceMatch = fenceRegex.exec(line);
      if (fenceMatch) {
        const run = fenceMatch[1];
        const marker = run[0] as "`" | "~";
        const len = run.length;

        if (!inFence) {
          inFence = true;
          fenceMarker = marker;
          fenceLen = len;
        } else if (fenceMarker === marker && len >= fenceLen) {
          inFence = false;
          fenceMarker = null;
          fenceLen = 0;
        }
        output.push(line);
        fenceHandled = true;
        continue;
      }

      if (inFence) {
        output.push(line);
        continue;
      }
    }

    let lineOut = "";
    let cursor = 0;

    while (cursor < line.length) {
      const idx = line.indexOf("%%", cursor);
      if (idx === -1) {
        if (!inComment) lineOut += line.slice(cursor);
        break;
      }

      if (isInRanges(idx, protectedRanges)) {
        // 保護区間（インラインコード / 数式）に入った %% はコメント走査対象にしない。
        // 従来は区間終端まで読み飛ばすだけで lineOut へ出力しておらず、結果として
        // コード/数式の中身ごと出力から落ちていた（C1/C2/D2 のバグ）。
        // 修正: 保護区間は「そのまま出力に残す」べきなので、区間内容を lineOut へコピーする。
        const range = protectedRanges.find(([s, e]) => idx >= s && idx < e)!;
        if (!inComment && range[0] > cursor) {
          lineOut += line.slice(cursor, range[0]);
        }
        // コメント中でない限り、保護区間全体をそのまま出力へ残す。
        // コメント中の場合は区間内でコメントが始まっていることはない（%% は区間外でのみ開始）
        // ので、cursor を進めるだけで出力しない。
        if (!inComment) {
          lineOut += line.slice(range[0], range[1]);
        }
        cursor = range[1];
        continue;
      }

      if (!inComment) {
        lineOut += line.slice(cursor, idx);
        inComment = true;
        cursor = idx + 2;
        continue;
      }

      // コメント中: 最初に見つかった %% を終了とみなし、その後を処理継続
      inComment = false;
      cursor = idx + 2;
    }

    if (!inComment) {
      // コメントを閉じた同一行でフェンスが現れるケースをカバー
      if (!fenceHandled) {
        const fenceMatch = fenceRegex.exec(lineOut);
        if (fenceMatch) {
          const run = fenceMatch[1];
          const marker = run[0] as "`" | "~";
          const len = run.length;

          if (!inFence) {
            inFence = true;
            fenceMarker = marker;
            fenceLen = len;
          } else if (fenceMarker === marker && len >= fenceLen) {
            inFence = false;
            fenceMarker = null;
            fenceLen = 0;
          }
        }
      }

      // コメント除去後の lineOut に対して $$ トグル（フェンス外でのみ）
      let toggles = 0;
      let idx = 0;
      const protectedAfter = buildProtectedRanges(lineOut);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const pos = lineOut.indexOf("$$", idx);
        if (pos === -1) break;
        if (!isInRanges(pos, protectedAfter)) toggles += 1;
        idx = pos + 2;
      }
      if (toggles % 2 === 1) inMathBlock = !inMathBlock;

      output.push(lineOut);
    } else if (lineOut.length) {
      // コメント開始前に出力した分は残す
      output.push(lineOut);
    }
  }

  return output.join(newline);
}

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

