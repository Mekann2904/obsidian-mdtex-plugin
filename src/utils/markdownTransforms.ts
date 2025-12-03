// File: src/utils/markdownTransforms.ts
// Purpose: Markdown変換時の置換・エスケープ処理を集約するユーティリティ。
// Reason: 変換サービスからロジックを切り出し、テストしやすくするため。
// Related: src/services/convertService.ts, src/services/lintService.ts, src/MdTexPlugin.ts, src/utils/transclusion.ts

import { FileSystemAdapter, App, TFile } from "obsidian";
import * as path from "path";
import { ProfileSettings } from "../MdTexPluginSettings";
import { getLinkTargetFile } from "./linkUtils";

export const escapeSpecialCharacters = (code: string): string =>
  code
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#")
    .replace(/~/g, "\\textasciitilde")
    .replace(/&/g, "\\&");

export async function replaceWikiLinksAndCodeAsync(
  markdown: string,
  app: App,
  profile: ProfileSettings,
  sourcePath: string,
  cache: Map<string, string>,
  inBlockquote = false
): Promise<string> {
  const regex = /(^[ \t]*> ?)?!\[\[([^\]]+)\]\](?:\{#([^}]+)\})?(?:\[(.*?)\])?|```(?:([\w-]+))?(?:\s*\{([^}]*)\})?\n([\s\S]*?)```/gm;
  let result = "";
  let lastIndex = 0;

  while (true) {
    const match = regex.exec(markdown);
    if (!match) break;

    const [
      fullMatch,
      blockquotePrefix,
      imageLink,
      imageLabel,
      imageCaption,
      codeLang,
      codeAttrs,
      codeBody,
    ] = match;
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
        try {
          const vaultRelative = resolvedFile.path;
          const embedded = await readFileCached(app, resolvedFile, cache);
          const inlined = await replaceWikiLinksRecursivelyAsync(
            embedded,
            app,
            profile,
            vaultRelative,
            cache,
            inBlockquote || !!blockquotePrefix
          );
          result += applyBlockquotePrefix(inlined, blockquotePrefix);
          continue;
        } catch (err) {
          const linkText = (imageCaption || pipeCaption || targetLink || "").trim() || targetLink;
          const fallback = `[${escapeSpecialCharacters(linkText)}](${latexPath})`;
          result += applyBlockquotePrefix(fallback, blockquotePrefix);
          continue;
        }
      }

      const isBlockquote = !!blockquotePrefix || inBlockquote;
      if (isBlockquote) {
        const widthOpt = profile.imageScale ? `{${profile.imageScale}}` : "{width=100%}";
        const caption = (imageCaption || pipeCaption || "").trim();
        const imageMarkdown = `![${escapeSpecialCharacters(caption)}](${latexPath})${widthOpt}`;
        result += applyBlockquotePrefix(imageMarkdown, blockquotePrefix);
        continue;
      }

      const labelPart = imageLabel ? `#${imageLabel.startsWith("fig:") ? "" : "fig:"}${imageLabel}` : "";
      const rawCaption = imageCaption || pipeCaption || " ";
      const captionPart = rawCaption.trim() ? escapeSpecialCharacters(rawCaption) : " ";
      const scalePart = profile.imageScale ? ` ${profile.imageScale}` : "";

      const imageMarkdown = `![${captionPart}](${latexPath}){${labelPart}${scalePart}}`;
      result += applyBlockquotePrefix(imageMarkdown, blockquotePrefix);
      continue;
    }

    if (codeBody) {
      if (!codeLang && !codeAttrs) {
        result += fullMatch;
        continue;
      }

      const rawCode = codeBody.trimEnd();
      const resolvedLang = normalizeListingLanguage(codeLang);
      let labelOption = "", captionOption = "", langOption = "";
      if (codeAttrs) {
        const labelMatch = codeAttrs.match(/#lst:([\w-]+)/);
        if (labelMatch) labelOption = `,label={lst:${labelMatch[1]}}`;
        const captionMatch = codeAttrs.match(/caption\s*=\s*"(.*?)"/);
        if (captionMatch) captionOption = `,caption={${escapeSpecialCharacters(captionMatch[1])}}`;
      }
      if (resolvedLang) langOption = `language=${resolvedLang}`;
      const options = [langOption, labelOption.slice(1), captionOption.slice(1)].filter(Boolean).join(",");
      const optWrapped = options ? `[${options}]` : "";
      result += `\\begin{lstlisting}${optWrapped}\n${rawCode}\n\\end{lstlisting}`;
      continue;
    }

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
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

/**
 * ![[...]] とコードフェンスの置換を収束するまで繰り返す簡易ループ。
 * 最大5回で打ち切り、循環や極端なネストを防ぐ。
 */
export async function replaceWikiLinksRecursivelyAsync(
  markdown: string,
  app: App,
  profile: ProfileSettings,
  sourcePath: string,
  cache: Map<string, string>,
  inBlockquote = false,
  depth = 0
): Promise<string> {
  if (depth > 5) return markdown;

  const transformed = await replaceWikiLinksAndCodeAsync(markdown, app, profile, sourcePath, cache, inBlockquote);
  if (transformed === markdown) return transformed;

  return replaceWikiLinksRecursivelyAsync(transformed, app, profile, sourcePath, cache, inBlockquote, depth + 1);
}

/**
 * 有効な WikiLink だけ [[ ]] を外してテキストにする。コードフェンス内は手を付けない。
 */
export function unwrapValidWikiLinks(markdown: string, app: App, sourcePath: string): string {
  // ![[...]]（埋め込み・画像）を除外するため否定後読みを付ける
  const wikiLinkRegex = /(?<!\!)\[\[(.*?)\]\]/g;
  const lines = markdown.split("\n");
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
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

function normalizeListingLanguage(codeLang: string | undefined): string | undefined {
  if (!codeLang) return undefined;
  const lang = codeLang.toLowerCase();
  const mapping: Record<string, string> = {
    python: "Python",
    py: "Python",
    bash: "bash",
    sh: "bash",
    zsh: "bash",
    javascript: "JavaScript",
    js: "JavaScript",
    typescript: "JavaScript",
    ts: "JavaScript",
    json: "JavaScript",
    html: "HTML",
    css: "CSS",
    c: "C",
    cpp: "C++",
    java: "Java",
    text: "",
    plain: "",
  };
  const mapped = mapping[lang];
  if (mapped === "") return undefined;
  return mapped || codeLang;
}

function resolveLinkFile(
  app: App,
  linktext: string,
  sourcePath: string,
  searchDirectory?: string
): TFile | null {
  const cached = app.metadataCache.getFirstLinkpathDest(linktext, sourcePath);
  if (cached instanceof TFile) return cached;

  const direct = app.vault.getAbstractFileByPath(linktext);
  if (direct instanceof TFile) return direct;

  const targetName = path.posix.basename(linktext).toLowerCase();
  const files = app.vault.getFiles();
  const match = files.find((file) => {
    if (searchDirectory && !file.path.startsWith(searchDirectory)) return false;
    return file.name.toLowerCase() === targetName;
  });
  return match || null;
}

async function readFileCached(app: App, file: TFile, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(file.path);
  if (cached !== undefined) return cached;

  const content = await app.vault.read(file);
  cache.set(file.path, content);
  return content;
}
