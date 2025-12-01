// File: src/utils/markdownTransforms.ts
// Purpose: Markdown変換時の置換・エスケープ処理を集約するユーティリティ。
// Reason: 変換サービスからロジックを切り出し、テストしやすくするため。
// Related: src/services/convertService.ts, src/services/lintService.ts, src/MdTexPlugin.ts

import { FileSystemAdapter, App } from "obsidian";
import * as path from "path";
import * as fsSync from "fs";
import { ProfileSettings } from "../MdTexPluginSettings";

export const escapeSpecialCharacters = (code: string): string =>
  code
    .replace(/\\/g, "\\textbackslash{}").replace(/\$/g, "\\$").replace(/%/g, "\\%")
    .replace(/#/g, "\\#").replace(/_/g, "\\_").replace(/{/g, "\\{").replace(/}/g, "\\}")
    .replace(/\^/g, "\\^{}").replace(/~/g, "\\textasciitilde").replace(/&/g, "\\&");

export function replaceWikiLinksAndCode(
  markdown: string,
  app: App,
  profile: ProfileSettings
): string {
  return markdown.replace(
    /!\[\[([^\]]+)\]\](?:\{#([^}]+)\})?(?:\[(.*?)\])?|```(\w+)(?:\s*\{([^}]*)\})?\n([\s\S]*?)```/g,
    (match, imageLink, imageLabel, imageCaption, codeLang, codeAttrs, codeBody) => {
      if (imageLink) {
        const searchDir = profile.searchDirectory || (app.vault.adapter as FileSystemAdapter).getBasePath();
        const foundPath = findFileSync(imageLink, searchDir);
        if (!foundPath) return match;

        const resolvedPath = path.resolve(foundPath);
        let labelPart = imageLabel ? `#${imageLabel.startsWith("fig:") ? "" : "fig:"}${imageLabel}` : "";
        let captionPart = imageCaption || " ";
        const scalePart = profile.imageScale ? ` ${profile.imageScale}` : "";

        return `![${captionPart}](${resolvedPath}){${labelPart}${scalePart}}`;
      }

      if (codeBody) {
        const escapedCode = escapeSpecialCharacters(codeBody);
        const resolvedLang = codeLang || "zsh";
        let labelOption = "", captionOption = "";
        if (codeAttrs) {
          const labelMatch = codeAttrs.match(/#lst:([\w-]+)/);
          if (labelMatch) labelOption = `,label={lst:${labelMatch[1]}}`;
          const captionMatch = codeAttrs.match(/caption\s*=\s*"(.*?)"/);
          if (captionMatch) captionOption = `,caption={${escapeSpecialCharacters(captionMatch[1])}}`;
        }
        return `\\begin{lstlisting}[language=${resolvedLang}${labelOption}${captionOption}]\n${escapedCode}\n\\end{lstlisting}`;
      }
      return match;
    }
  );
}

export function findFileSync(filename: string, searchDirectory: string): string | null {
  try {
    const entries = fsSync.readdirSync(searchDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(searchDirectory, entry.name);
      if (entry.isDirectory()) {
        const result = findFileSync(filename, fullPath);
        if (result) return result;
      } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
        return fullPath;
      }
    }
  } catch (_) {}
  return null;
}
