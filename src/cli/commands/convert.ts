// File: src/cli/commands/convert.ts
// Purpose: `mdtex convert` コマンド実装。
// Reason: agent が Obsidian GUI なしで通常の Markdown→PDF/LaTeX/DOCX 変換を実行できるようにするため。
//          convert 固有の flag 解釈・検証・表示はこのコマンド内に集約する。

import { flagString } from "../args";
import { convertMarkdownCli } from "../convert";

export type ConvertFormat = "pdf" | "latex" | "docx";

function parseFormat(raw: string | undefined): ConvertFormat | undefined {
  if (raw === undefined) return undefined;
  if (raw === "pdf" || raw === "latex" || raw === "docx") return raw;
  return undefined;
}

/**
 * `mdtex convert` のエントリ。flag 解釈・検証・変換・表示・exit code を1箇所で担う。
 */
export async function cmdConvert(
  input: string,
  flags: Record<string, string | boolean>,
  folder: string,
  asJson: boolean,
): Promise<number> {
  if (!input) {
    process.stderr.write(
      "Error: 入力 Markdown が未指定です。\n  mdtex convert <input.md> --output <out.pdf>\n",
    );
    return 2;
  }

  const rawFormat = flagString(flags, "format");
  if (rawFormat !== undefined && parseFormat(rawFormat) === undefined) {
    process.stderr.write("Error: --format は pdf / latex / docx のいずれかを指定してください。\n");
    return 2;
  }
  const format = parseFormat(rawFormat);

  const result = await convertMarkdownCli({
    input,
    output: flagString(flags, "output"),
    format,
    defaults: flagString(flags, "defaults"),
    folder,
    pack: flagString(flags, "pack"),
    pandoc: flagString(flags, "pandoc"),
    dryRun: flags["dry-run"] === true,
  });

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    if (result.status === "dry-run") {
      process.stdout.write(`(dry-run) ${result.command}\n`);
    } else if (result.status === "ok") {
      process.stdout.write(`✓ 変換成功: ${result.output}\n`);
    } else {
      process.stderr.write(`✗ ${result.error}\n`);
      if (result.stderrTail) process.stderr.write(`--- pandoc stderr ---\n${result.stderrTail}\n`);
    }
    // 重複ラベル警告は status 行の後に（観測情報・pandoc 実行可否とは独立）。
    for (const d of result.duplicateLabels ?? []) {
      process.stderr.write(`⚠ crossref ラベル重複: ${d.label} (${d.count}回)\n`);
    }
  }

  return result.status === "error" ? 2 : 0;
}
