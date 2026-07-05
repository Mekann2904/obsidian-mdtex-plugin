#!/usr/bin/env node
// File: src/cli/index.ts
// Purpose: mdtex CLI エントリ。LLM コーディングエージェントが MdTex を観測・実行する
//          ための誠実な道具（cli-for-agents 原則）。Obsidian に依存しない。
// Reason: GUI（Obsidian プラグイン）はエージェントから操作できない。CLI が MdTex を
//          扱う唯一の経路。推論・判断はエージェント（LLM）が担い、CLI は観測と実行に徹する。
// Related: src/cli/fsTemplatePack.ts, src/services/templatePackService.ts, esbuild.config.mjs

import {
  listTemplatePacksFs,
  readPackMetadataFs,
  testPackFs,
  validatePackFs,
} from "./fsTemplatePack";

// esbuild の define で package.json の version を注入（未定義時は dev）。
declare const CLI_VERSION: string | undefined;
const VERSION: string =
  typeof CLI_VERSION !== "undefined" ? CLI_VERSION : "dev";

// === 引数パーサー（自前最小・依存増やさない）===============================

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

/**
 * argv を positional と flags に分ける。
 *  --flag value / --flag=value / --flag（boolean）/ -h（short）を扱う。
 *  インタラクティブなプロンプトは出さない（エージェントのデッドロック回避）。
 */
function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq >= 0) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        i += 1;
        continue;
      }
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[name] = next;
        i += 2;
        continue;
      }
      flags[name] = true;
      i += 1;
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      flags[arg.slice(1)] = true;
      i += 1;
      continue;
    }
    positional.push(arg);
    i += 1;
  }
  return { positional, flags };
}

function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

// === ヘルプ（cli-for-agents: 各階層に examples）============================

function topHelp(): string {
  return `mdtex ${VERSION} — Obsidian Markdown を Pandoc/LuaLaTeX で組版する CLI
（LLM コーディングエージェント向けの誠実な道具）

Usage: mdtex <command> [subcommand] [options]

Commands:
  pack      テンプレートパックの管理（list / validate）
  profile   プロファイル管理                                [予定]
  convert   Markdown を PDF/LaTeX/DOCX に変換              [予定]
  doctor    環境診断（pandoc / latex の発見と版）           [予定]

Global options:
  --json        構造化出力（エージェント向け）
  --help, -h    ヘルプ
  --version, -V バージョン

Examples:
  mdtex pack list
  mdtex pack validate 縦書き二段組
  mdtex pack validate pLaTeX学会論文 --strict --json

詳細は各コマンドの --help を参照（例: mdtex pack --help）。
`;
}

function packHelp(): string {
  return `mdtex pack — テンプレートパックの管理

Usage: mdtex pack <subcommand> [options]

Subcommands:
  list       パック一覧（_mdtex の title/description 付き）
  validate   パックの検証（defaults 構文 + メタ + requires チェック）
  test       サンプル原稿で PDF 生成テスト

Options:
  --folder <path>  テンプレートフォルダ（既定: MdTex Templates）

Examples:
  mdtex pack list
  mdtex pack list --folder ./templates --json
  mdtex pack validate 縦書き二段組
  mdtex pack validate pLaTeX学会論文 --strict
`;
}

function listHelp(): string {
  return `mdtex pack list — パック一覧

Usage: mdtex pack list [--folder <path>] [--json]

Options:
  --folder <path>  テンプレートフォルダ（既定: MdTex Templates）
  --json           構造化出力（name/title/description/engine の配列）

Examples:
  mdtex pack list
  mdtex pack list --json
`;
}

function validateHelp(): string {
  return `mdtex pack validate — パックの検証

Usage: mdtex pack validate <pack> [--folder <path>] [--strict] [--json]

引数:
  <pack>           パック名（テンプレートフォルダ直下のサブフォルダ名）

Options:
  --folder <path>  テンプレートフォルダ（既定: MdTex Templates）
  --strict         警告（メタ未宣言・requires 不足）をエラー扱い
  --json           構造化出力

Exit codes:
  0  検証成功
  1  警告あり（--strict 未使用時）
  2  エラー（defaults 読めない、--strict で警告が昇格）

Examples:
  mdtex pack validate 縦書き二段組
  mdtex pack validate pLaTeX学会論文 --strict
  mdtex pack validate pLaTeX学会論文 --json
`;
}

function testHelp(): string {
  return `mdtex pack test — サンプル原稿で PDF 生成テスト

Usage: mdtex pack test <pack> [--folder <path>] [--sample <file>] [--output <path>] [--pandoc <path>] [--dry-run] [--keep-artifacts] [--json]

引数:
  <pack>              パック名

Options:
  --folder <path>     テンプレートフォルダ（既定: MdTex Templates）
  --sample <file>     サンプル原稿（指定無ければパック内 sample.md）
  --output <path>     出力 PDF（指定無ければ temp）
  --pandoc <path>     Pandoc バイナリ（指定無ければ PATH の pandoc）
  --dry-run           コマンドを表示するのみ（実行しない）
  --keep-artifacts    中間 .tex も保存
  --json              構造化出力

Exit codes:
  0  PDF 生成成功 / dry-run
  2  エラー（defaults/sample 無し、pandoc 失敗）

Examples:
  mdtex pack test 縦書き二段組
  mdtex pack test 縦書き二段組 --dry-run
  mdtex pack test 縦書き二段組 --keep-artifacts --json
`;
}

// === コマンド実装 =========================================================

async function cmdPackList(folder: string, asJson: boolean): Promise<number> {
  const packs = await listTemplatePacksFs(folder);

  if (asJson) {
    const items = await Promise.all(
      packs.map(async name => {
        const meta = await readPackMetadataFs(folder, name);
        return {
          name,
          title: meta?.title ?? null,
          description: meta?.description ?? null,
          engine: meta?.engine ?? null,
        };
      }),
    );
    process.stdout.write(JSON.stringify({ ok: true, packs: items }, null, 2) + "\n");
    return 0;
  }

  if (packs.length === 0) {
    const f = folder || "MdTex Templates";
    process.stdout.write(`（パックが見つかりません: ${f}）\n`);
    return 0;
  }
  for (const name of packs) {
    const meta = await readPackMetadataFs(folder, name);
    if (meta?.title) {
      process.stdout.write(`${name}  — ${meta.title}\n`);
    } else {
      process.stdout.write(`${name}\n`);
    }
  }
  return 0;
}

async function cmdPackValidate(
  pack: string,
  folder: string,
  asJson: boolean,
  strict: boolean,
): Promise<number> {
  if (!pack) {
    process.stderr.write(
      "Error: パック名が未指定です。\n  mdtex pack validate <pack>\n  例: mdtex pack validate 縦書き二段組\n",
    );
    return 2;
  }

  const validation = await validatePackFs(folder, pack, strict);

  if (asJson) {
    // status が JSON / exit code の唯一の源（ok 廃止: exit code とのズレを防ぐ）。
    process.stdout.write(JSON.stringify(validation, null, 2) + "\n");
  } else {
    // text 出力（人間向け・簡潔）
    process.stdout.write(`パック: ${pack}\n`);
    process.stdout.write(`defaults.yaml: ${validation.defaultsReadable ? "OK" : "NG（読めません）"}\n`);
    process.stdout.write(`メタ(_mdtex): ${validation.hasMetadata ? "あり" : "なし"}\n`);
    if (validation.missingRequires.length > 0) {
      process.stdout.write(`必須ファイル不足: ${validation.missingRequires.join(", ")}\n`);
    }
    if (validation.metadata?.engine) {
      process.stdout.write(`想定エンジン: ${validation.metadata.engine}\n`);
    }
    for (const w of validation.warnings) process.stdout.write(`⚠ ${w}\n`);
    for (const e of validation.errors) process.stderr.write(`✗ ${e}\n`);
    if (validation.status === "ok") process.stdout.write("✓ OK\n");
  }

  return validation.status === "errors" ? 2 : validation.status === "warnings" ? 1 : 0;
}

async function cmdPackTest(
  pack: string,
  folder: string,
  opts: { sample?: string; output?: string; pandoc?: string; keepArtifacts: boolean; dryRun: boolean },
  asJson: boolean,
): Promise<number> {
  if (!pack) {
    process.stderr.write(
      "Error: パック名が未指定です。\n  mdtex pack test <pack>\n  例: mdtex pack test 縦書き二段組\n",
    );
    return 2;
  }

  const result = await testPackFs({ folder, pack, ...opts });

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (result.status === "dry-run") {
    process.stdout.write(`(dry-run) ${result.command}\n`);
  } else {
    process.stdout.write(`パック: ${pack}\n`);
    process.stdout.write(`サンプル: ${result.sampleUsed}\n`);
    if (result.status === "ok") {
      process.stdout.write(`✓ PDF 生成成功: ${result.output}\n`);
      if (result.texArtifact) process.stdout.write(`  .tex: ${result.texArtifact}\n`);
    } else {
      process.stderr.write(`✗ ${result.error}\n`);
      if (result.stderrTail)
        process.stderr.write(`--- pandoc stderr ---\n${result.stderrTail}\n`);
    }
  }

  return result.status === "error" ? 2 : 0;
}

// === dispatch =============================================================

async function main(): Promise<number> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const asJson = flags.json === true;
  const help = flags.help === true || flags.h === true;
  const folder = flagString(flags, "folder") ?? "MdTex Templates";
  const strict = flags.strict === true;

  if (flags.version === true || flags.V === true) {
    process.stdout.write(`mdtex ${VERSION}\n`);
    return 0;
  }

  const cmd = positional[0];

  if (!cmd) {
    process.stdout.write(topHelp());
    return 0;
  }

  if (cmd === "pack") {
    const sub = positional[1];
    if (!sub) {
      process.stdout.write(packHelp());
      return 0;
    }
    if (sub === "list") {
      if (help) {
        process.stdout.write(listHelp());
        return 0;
      }
      return cmdPackList(folder, asJson);
    }
    if (sub === "validate") {
      if (help) {
        process.stdout.write(validateHelp());
        return 0;
      }
      const pack = positional[2] ?? "";
      return cmdPackValidate(pack, folder, asJson, strict);
    }
    if (sub === "test") {
      if (help) {
        process.stdout.write(testHelp());
        return 0;
      }
      const pack = positional[2] ?? "";
      return cmdPackTest(pack, folder, {
        sample: flagString(flags, "sample"),
        output: flagString(flags, "output"),
        pandoc: flagString(flags, "pandoc"),
        keepArtifacts: flags["keep-artifacts"] === true,
        dryRun: flags["dry-run"] === true,
      }, asJson);
    }
    process.stderr.write(
      `Error: 不明な pack サブコマンド: ${sub}\n  mdtex pack --help で一覧\n`,
    );
    return 2;
  }

  process.stderr.write(`Error: 不明なコマンド: ${cmd}\n  mdtex --help で一覧\n`);
  return 2;
}

main()
  .then(code => process.exit(code))
  .catch(err => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  });
