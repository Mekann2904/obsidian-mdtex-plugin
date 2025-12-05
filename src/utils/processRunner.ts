// File: src/utils/processRunner.ts
// Purpose: 外部コマンド実行をラップし、テスト容易なインターフェースを提供する。
// Reason: spawn 依存を集約し、モックやスタブで差し替えやすくするため。
// Related: src/services/convertService.ts, src/services/pandocCommandBuilder.ts, src/services/lintService.ts, vitest.config.ts

import { spawn, SpawnOptions } from "child_process";

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string | Buffer;
  stdio?: SpawnOptions["stdio"];
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export interface RunCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCommand(
  cmd: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<RunCommandResult> {
  return new Promise<RunCommandResult>((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "pipe",
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      options.onStdout?.(text);
    });

    child.stderr?.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      options.onStderr?.(text);
    });

    if (options.input !== undefined && child.stdin) {
      child.stdin.write(options.input);
      child.stdin.end();
    }

    child.on("error", (err) => reject(err));

    child.on("close", (code) => {
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}
