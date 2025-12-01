// File: src/utils/markdownTransforms.ts
// Purpose: Markdown変換時の置換・エスケープ処理を集約するユーティリティ。
// Reason: 変換サービスからロジックを切り出し、テストしやすくするため。
// Related: src/services/convertService.ts, src/services/lintService.ts, src/MdTexPlugin.ts

import { FileSystemAdapter, App, TFile } from "obsidian";
import * as path from "path";
import { ProfileSettings } from "../MdTexPluginSettings";

export const escapeSpecialCharacters = (code: string): string =>
  code
    .replace(/\\/g, "\\textbackslash{}").replace(/\$/g, "\\$").replace(/%/g, "\\%")
    .replace(/#/g, "\\#").replace(/_/g, "\\_").replace(/{/g, "\\{").replace(/}/g, "\\}")
    .replace(/\^/g, "\\^{}").replace(/~/g, "\\textasciitilde").replace(/&/g, "\\&");

export function replaceWikiLinksAndCode(
  markdown: string,
  app: App,
  profile: ProfileSettings,
  sourcePath: string
): string {
  return markdown.replace(
    /!\[\[([^\]]+)\]\](?:\{#([^}]+)\})?(?:\[(.*?)\])?|```(?:([\w-]+))?(?:\s*\{([^}]*)\})?\n([\s\S]*?)```/g,
    (match, imageLink, imageLabel, imageCaption, codeLang, codeAttrs, codeBody) => {
      if (imageLink) {
        let targetLink = imageLink;
        let pipeCaption = "";
        if (imageLink.includes("|")) {
          const splitIdx = imageLink.lastIndexOf("|");
          targetLink = imageLink.substring(0, splitIdx);
          pipeCaption = imageLink.substring(splitIdx + 1);
        }

        const resolvedPath = resolveLinkPath(app, targetLink, sourcePath, profile.searchDirectory);
        if (!resolvedPath) return match;

        const adapter = app.vault.adapter as FileSystemAdapter;
        const vaultBase = adapter.getBasePath();
        const latexPath = resolvedPath.startsWith(vaultBase)
          ? path.relative(vaultBase, resolvedPath).split(path.sep).join("/")
          : resolvedPath;
        let labelPart = imageLabel ? `#${imageLabel.startsWith("fig:") ? "" : "fig:"}${imageLabel}` : "";
        const rawCaption = imageCaption || pipeCaption || " ";
        let captionPart = rawCaption.trim() ? escapeSpecialCharacters(rawCaption) : " ";
        const scalePart = profile.imageScale ? ` ${profile.imageScale}` : "";

        return `![${captionPart}](${latexPath}){${labelPart}${scalePart}}`;
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
  if (mapped === undefined) return codeLang;
  if (mapped === "") return undefined; // treat as no language to avoid listings error
  return mapped;
}

function resolveLinkPath(
  app: App,
  linktext: string,
  sourcePath: string,
  searchDirectory?: string
): string | null {
  const adapter = app.vault.adapter as FileSystemAdapter;
  const cached = app.metadataCache.getFirstLinkpathDest(linktext, sourcePath);
  if (cached) return adapter.getFullPath(cached.path);

  const direct = app.vault.getAbstractFileByPath(linktext);
  if (direct instanceof TFile) return adapter.getFullPath(direct.path);

  const targetName = path.posix.basename(linktext).toLowerCase();
  const files = app.vault.getFiles();
  const match = files.find((file) => {
    if (searchDirectory && !adapter.getFullPath(file.path).startsWith(searchDirectory)) return false;
    return path.posix.basename(file.path).toLowerCase() === targetName;
  });
  if (match) return adapter.getFullPath(match.path);

  return null;
}
