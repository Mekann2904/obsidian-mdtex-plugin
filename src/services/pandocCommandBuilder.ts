// File: src/services/pandocCommandBuilder.ts
// Purpose: Pandoc 実行コマンドの生成を純粋関数として切り出す。
// Reason: コマンド生成をテストしやすくし、プロセス実行から分離するため。
// Related: src/services/convertService.ts, src/utils/processRunner.ts, src/MdTexPluginSettings.ts, vitest.config.ts

import { ProfileSettings } from "../MdTexPluginSettings";

export type OutputFormat = "pdf" | "latex" | "docx";

export interface PandocCommandOptions {
  profile: ProfileSettings;
  format: OutputFormat;
  outputPath: string;
  workingDir: string;
  inputPath?: string;
  headerPath?: string;
  extraArgs?: string[];
  luaFilters?: string[];
  resourcePath?: string;
  useStdin?: boolean;
}

export interface PandocCommandResult {
  command: string;
  args: string[];
}

export function buildPandocCommand(options: PandocCommandOptions): PandocCommandResult {
  const profile = options.profile;
  const args: string[] = [];

  if (!options.useStdin && options.inputPath) {
    args.push(options.inputPath);
  }

  args.push(...getInputFormatArgs(options.format));

  if (options.headerPath) {
    args.push("--include-in-header", options.headerPath);
  }

  args.push("-o", options.outputPath);

  if (options.format === "pdf") {
    args.push(`--pdf-engine=${profile.latexEngine}`);
    if (profile.documentClass === "beamer") args.push("-t", "beamer");
  } else if (options.format === "latex") {
    args.push("-t", "latex");
    if (profile.documentClass === "beamer") args.push("-t", "beamer");
  } else if (options.format === "docx") {
    args.push("-t", "docx");
  }

  if (options.luaFilters?.length) {
    for (const luaPath of options.luaFilters) {
      if (luaPath) args.push("--lua-filter", luaPath);
    }
  }

  args.push("--listings");

  const resourcePath = (options.resourcePath ?? profile.searchDirectory ?? "").trim() || options.workingDir;
  args.push("--resource-path", resourcePath);

  if (profile.usePandocCrossref) {
    const crossrefFilter = profile.pandocCrossrefPath.trim() || "pandoc-crossref";
    args.push("-F", crossrefFilter);
  }

  args.push("-M", `figureTitle=${profile.figureLabel}`);
  args.push("-M", `figPrefix=${profile.figPrefix}`);
  args.push("-M", `tableTitle=${profile.tableLabel}`);
  args.push("-M", `tblPrefix=${profile.tblPrefix}`);
  args.push("-M", `listingTitle=${profile.codeLabel}`);
  args.push("-M", `listing-title=${profile.codeLabel}`);
  args.push("-M", `lstPrefix=${profile.lstPrefix}`);
  args.push("-M", `eqnPrefix=${profile.eqnPrefix}`);

  if (profile.useMarginSize) args.push("-V", `geometry:margin=${profile.marginSize}`);
  if (!profile.usePageNumber) args.push("-V", "pagestyle=empty");

  if (profile.imageScale?.trim()) {
    args.push("-V", `graphics=${profile.imageScale}`);
  }

  args.push("-V", `fontsize=${profile.fontSize}`);
  args.push("-V", `documentclass=${profile.documentClass}`);
  if (profile.documentClassOptions?.trim()) args.push("-V", `classoption=${profile.documentClassOptions}`);

  args.push("--highlight-style=tango");

  const extraArgs = filterPandocExtrasForFormat(options.extraArgs || [], options.format);
  if (extraArgs.length) args.push(...extraArgs);

  if (profile.useStandalone) args.push("--standalone");

  const pandocPath = profile.pandocPath.trim() || "pandoc";
  return { command: pandocPath, args };
}

export function getInputFormatArgs(format: string): string[] {
  if (format === "docx") {
    return ["-f", "markdown+raw_html+fenced_divs+raw_attribute"];
  }
  return ["-f", "markdown"];
}

export function filterPandocExtrasForFormat(extras: string[], format: string): string[] {
  if (!extras.length) return [];
  return extras.filter((arg) => {
    if (format !== "docx" && arg.startsWith("--reference-doc")) return false;
    return true;
  });
}
