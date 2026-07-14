#!/usr/bin/env node
// File: src/cli/index.ts
// Purpose: mdtex CLI エントリ。LLM コーディングエージェントが MdTex を観測・実行する
//          ための誠実な道具（cli-for-agents 原則）。Obsidian に依存しない。
// Reason: GUI（Obsidian プラグイン）はエージェントから操作できない。CLI が MdTex を
//          扱う唯一の経路。推論・判断はエージェント（LLM）が担い、CLI は観測と実行に徹する。
// Related: src/cli/args.ts, src/cli/help.ts, src/cli/commands/pack.ts

import { flagString, parseArgs } from "./args";
import { convertHelp, doctorHelp, listHelp, newHelp, packHelp, testHelp, topHelp, validateHelp, VERSION } from "./help";
import { cmdPackList, cmdPackNew, cmdPackTest, cmdPackValidate } from "./commands/pack";
import { cmdConvert } from "./commands/convert";
import { cmdDoctor } from "./commands/doctor";

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
    return dispatchPack(positional, flags, { asJson, help, folder, strict });
  }

  if (cmd === "convert") {
    if (help) {
      process.stdout.write(convertHelp());
      return 0;
    }
    return cmdConvert(positional[1] ?? "", flags, folder, asJson);
  }

  if (cmd === "doctor") {
    if (help) {
      process.stdout.write(doctorHelp());
      return 0;
    }
    return cmdDoctor(asJson);
  }

  process.stderr.write(
    `Error: 不明なコマンド: ${cmd}\n  利用可能: mdtex pack, mdtex convert, mdtex doctor\n  mdtex --help で一覧\n`,
  );
  return 2;
}

interface DispatchOptions {
  asJson: boolean;
  help: boolean;
  folder: string;
  strict: boolean;
}

function dispatchPack(
  positional: string[],
  flags: Record<string, string | boolean>,
  opts: DispatchOptions,
): Promise<number> | number {
  const sub = positional[1];
  if (!sub) {
    process.stdout.write(packHelp());
    return 0;
  }
  if (sub === "list") {
    if (opts.help) {
      process.stdout.write(listHelp());
      return 0;
    }
    return cmdPackList(opts.folder, opts.asJson);
  }
  if (sub === "validate") {
    if (opts.help) {
      process.stdout.write(validateHelp());
      return 0;
    }
    const pack = positional[2] ?? "";
    return cmdPackValidate(pack, opts.folder, opts.asJson, opts.strict);
  }
  if (sub === "test") {
    if (opts.help) {
      process.stdout.write(testHelp());
      return 0;
    }
    const pack = positional[2] ?? "";
    return cmdPackTest(pack, opts.folder, {
      sample: flagString(flags, "sample"),
      output: flagString(flags, "output"),
      pandoc: flagString(flags, "pandoc"),
      vaultRoot: flagString(flags, "vault-root"),
      imageScale: flagString(flags, "image-scale"),
      keepArtifacts: flags["keep-artifacts"] === true,
      dryRun: flags["dry-run"] === true,
    }, opts.asJson);
  }
  if (sub === "new") {
    if (opts.help) {
      process.stdout.write(newHelp());
      return 0;
    }
    const name = positional[2] ?? "";
    return cmdPackNew(name, opts.folder, { engine: flagString(flags, "engine") }, opts.asJson);
  }
  process.stderr.write(
    `Error: 不明な pack サブコマンド: ${sub}\n  利用可能: list, validate, test, new\n  mdtex pack --help で一覧\n`,
  );
  return 2;
}

main()
  .then(code => process.exit(code))
  .catch(err => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  });
