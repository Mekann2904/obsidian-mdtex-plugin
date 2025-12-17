// File: src/data/latexCommands.ts
// Purpose: FuzzySuggestModal で使う LaTeX コマンド型・デフォルト辞書・YAML パーサを提供する。
// Reason: コマンド定義を分離し、ユーザが YAML で上書きできるようにするため。
// Related: src/modal/LatexCommandModal.ts, src/MdTexPlugin.ts, src/MdTexPluginSettingTab.ts, docs/dev-latex-palette.md

import { parseYaml, Notice } from "obsidian";

export interface LatexCommand {
  cmd: string;
  desc: string;
  cursorOffset?: number;
}

export const LATEX_COMMANDS: LatexCommand[] = [
  { cmd: "\\clearpage", desc: "Flush floats and new page" },
  { cmd: "\\newpage", desc: "New page" },
  { cmd: "\\pagebreak", desc: "Page break with allowed stretch" },
  { cmd: "\\bigskip", desc: "Large vertical space" },
  { cmd: "\\medskip", desc: "Medium vertical space" },
  { cmd: "\\smallskip", desc: "Small vertical space" },
  { cmd: "\\vspace{}", desc: "Custom vertical space", cursorOffset: -1 },
  { cmd: "\\hspace{}", desc: "Custom horizontal space", cursorOffset: -1 },
  { cmd: "\\hfill", desc: "Horizontal fill" },
  { cmd: "\\noindent", desc: "No indentation" },
  { cmd: "\\\\", desc: "Line break" },
];

export const DEFAULT_LATEX_COMMANDS_YAML = `
- cmd: "\\clearpage"
  desc: "Flush floats and new page (改ページ・図表配置)"
- cmd: "\\newpage"
  desc: "New page (改ページ)"
- cmd: "\\pagebreak"
  desc: "Page break with allowed stretch (ページ分割: 伸縮可)"
- cmd: "\\bigskip"
  desc: "Large vertical space (大スペース)"
- cmd: "\\medskip"
  desc: "Medium vertical space (中スペース)"
- cmd: "\\smallskip"
  desc: "Small vertical space (小スペース)"
- cmd: "\\vspace{}"
  desc: "Custom vertical space (高さ指定)"
  cursorOffset: -1
- cmd: "\\hspace{}"
  desc: "Custom horizontal space (幅指定)"
  cursorOffset: -1
- cmd: "\\hfill"
  desc: "Horizontal fill (右寄せ等)"
- cmd: "\\noindent"
  desc: "No indentation (段落インデントなし)"
- cmd: "\\\\"
  desc: "Line break (強制改行)"`;

function escapeBareBackslashes(yamlText: string): string {
  // YAML のダブルクォート文字列はバックスラッシュをエスケープとして扱うため、
  // LaTeX コマンドのような先頭 1 文字バックスラッシュは "\c" と解釈されてパースに失敗する。
  // 既にエスケープ済みの "\\" ペアはそのまま残し、単発 "\" だけを "\\" に二重化する。
  let out = "";
  for (let i = 0; i < yamlText.length; i++) {
    const ch = yamlText[i];
    if (ch === "\\") {
      const next = yamlText[i + 1];
      if (next === "\\") {
        out += "\\\\";
        i += 1; // ペアをまるごと進める
      } else {
        out += "\\\\";
      }
    } else {
      out += ch;
    }
  }
  return out;
}

function sanitizeCommand(raw: any): LatexCommand | null {
  if (!raw || typeof raw.cmd !== "string" || typeof raw.desc !== "string") return null;
  const offset = typeof raw.cursorOffset === "number" ? raw.cursorOffset : undefined;
  return { cmd: raw.cmd, desc: raw.desc, cursorOffset: offset };
}

export function buildLatexCommands(yamlText?: string): LatexCommand[] {
  const source = yamlText?.trim().length ? yamlText : DEFAULT_LATEX_COMMANDS_YAML;
  const safeYaml = escapeBareBackslashes(source);
  try {
    const parsed = parseYaml(safeYaml);
    if (!Array.isArray(parsed)) return LATEX_COMMANDS;
    const mapped = parsed
      .map((item) => sanitizeCommand(item))
      .filter((v): v is LatexCommand => Boolean(v));
    return mapped.length ? mapped : LATEX_COMMANDS;
  } catch (error) {
    console.warn("MdTexPlugin: failed to parse latexCommandsYaml; fallback to defaults", error);
    new Notice("MdTexPlugin: YAML parse error in LaTeX commands. Falling back to defaults.");
    return LATEX_COMMANDS;
  }
}
