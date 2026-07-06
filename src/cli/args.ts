// File: src/cli/args.ts
// Purpose: mdtex CLI の最小 argv パーサ。
// Reason: コマンド実装と引数解釈を分け、index.ts を dispatch に集中させるため。

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

/**
 * argv を positional と flags に分ける。
 * --flag value / --flag=value / --flag（boolean）/ -h（short）を扱う。
 * インタラクティブなプロンプトは出さない（エージェントのデッドロック回避）。
 */
export function parseArgs(argv: string[]): ParsedArgs {
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

export function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}
