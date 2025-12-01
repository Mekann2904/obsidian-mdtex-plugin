// File: src/utils/markdownTransforms.ts
// Purpose: Markdown変換時の置換・エスケープ処理を集約するユーティリティ。
// Reason: 変換サービスからロジックを切り出し、テストしやすくするため。
// Related: src/services/convertService.ts, src/services/lintService.ts, src/MdTexPlugin.ts

import { FileSystemAdapter, App, TFile } from "obsidian";
import * as path from "path";
import * as fsSync from "fs";
import { ProfileSettings } from "../MdTexPluginSettings";

export const escapeSpecialCharacters = (code: string): string =>
  code
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#")
    .replace(/~/g, "\\textasciitilde")
    .replace(/&/g, "\\&");

export function replaceWikiLinksAndCode(
  markdown: string,
  app: App,
  profile: ProfileSettings,
  sourcePath: string,
  inBlockquote = false
): string {
  return markdown.replace(
    /(^[ \t]*> ?)?!\[\[([^\]]+)\]\](?:\{#([^}]+)\})?(?:\[(.*?)\])?|```(?:([\w-]+))?(?:\s*\{([^}]*)\})?\n([\s\S]*?)```/gm,
    (match, blockquotePrefix, imageLink, imageLabel, imageCaption, codeLang, codeAttrs, codeBody) => {
      if (imageLink) {
        let targetLink = imageLink;
        let pipeCaption = "";
        if (imageLink.includes("|")) {
          const splitIdx = imageLink.lastIndexOf("|");
          targetLink = imageLink.substring(0, splitIdx);
          pipeCaption = imageLink.substring(splitIdx + 1);
        }

        const resolvedFile = resolveLinkFile(app, targetLink, sourcePath, profile.searchDirectory);
        if (!resolvedFile) return match;

        const adapter = app.vault.adapter as FileSystemAdapter;
        const vaultBase = adapter.getBasePath();
        const absPath = adapter.getFullPath(resolvedFile.path);
        const latexPath = absPath.startsWith(vaultBase)
          ? path.relative(vaultBase, absPath).split(path.sep).join("/")
          : absPath.split(path.sep).join("/");

        // Markdown ノートを画像扱いすると Pandoc が「Unknown graphics extension: .md」で落ちる。
        // 可能なら同期読み込みで内容をインライン展開し、画像・コードも含めて取り込む。
        if (resolvedFile.extension.toLowerCase() === "md") {
          try {
            const embedded = fsSync.readFileSync(absPath, "utf8");
            // 埋め込み先の中にさらに ![[...]] がある場合も処理するため再帰的に置換する。
            // sourcePath には Vault 相対パスを渡す必要があるため、再解決してから渡す。
            const vaultRelative = resolvedFile.path;

            const inlined = replaceWikiLinksRecursively(embedded, app, profile, vaultRelative, inBlockquote || !!blockquotePrefix);
            return applyBlockquotePrefix(inlined, blockquotePrefix);
          } catch (err) {
            const linkText = (imageCaption || pipeCaption || targetLink || "").trim() || targetLink;
            const fallback = `[${escapeSpecialCharacters(linkText)}](${latexPath})`;
            return applyBlockquotePrefix(fallback, blockquotePrefix);
          }
        }

        const isBlockquote = !!blockquotePrefix || inBlockquote;
        if (isBlockquote) {
          const widthOpt = profile.imageScale ? `{${profile.imageScale}}` : "{width=100%}";
          const caption = (imageCaption || pipeCaption || "").trim();
          const imageMarkdown = `![${escapeSpecialCharacters(caption)}](${latexPath})${widthOpt}`;
          return applyBlockquotePrefix(imageMarkdown, blockquotePrefix);
        }

        let labelPart = imageLabel ? `#${imageLabel.startsWith("fig:") ? "" : "fig:"}${imageLabel}` : "";
        const rawCaption = imageCaption || pipeCaption || " ";
        let captionPart = rawCaption.trim() ? escapeSpecialCharacters(rawCaption) : " ";
        const scalePart = profile.imageScale ? ` ${profile.imageScale}` : "";

        const imageMarkdown = `![${captionPart}](${latexPath}){${labelPart}${scalePart}}`;
        return applyBlockquotePrefix(imageMarkdown, blockquotePrefix);
      }

      if (codeBody) {
        // 言語も属性もない単なるフェンスは変換せずそのまま返す
        if (!codeLang && !codeAttrs) return match;

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
        return `\\begin{lstlisting}${optWrapped}\n${rawCode}\n\\end{lstlisting}`;
      }
      return match;
    }
  );
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
export function replaceWikiLinksRecursively(
  markdown: string,
  app: App,
  profile: ProfileSettings,
  sourcePath: string,
  inBlockquote = false,
  depth = 0
): string {
  if (depth > 5) return markdown;

  const transformed = replaceWikiLinksAndCode(markdown, app, profile, sourcePath, inBlockquote);
  if (transformed === markdown) return transformed;

  return replaceWikiLinksRecursively(transformed, app, profile, sourcePath, inBlockquote, depth + 1);
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
