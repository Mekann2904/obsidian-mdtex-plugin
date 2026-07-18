// File: src/services/cliSetup.ts
// Purpose: プラグイン同梱の cli.js を PATH の通った場所へリンクし、`mdtex` コマンドを
//          設定タブのワンクリックで利用可能にする。
// Reason: mdtex CLI はプラグイン配布 ZIP に同梱（release.yml）されるが、PATH への登録は
//          ユーザー作業。symlink 1本で setup を完結させ、cli-for-agents の導入障壁を下げる。
// Related: src/MdTexPluginSettingTab.ts（ボタンから呼ぶ）, .github/workflows/release.yml（cli.js 同梱）

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export interface CliSetupResult {
  ok: boolean;
  /** 作成した mdtex のパス（~/.local/bin/mdtex 等）。失敗時は目標パス。 */
  targetPath: string;
  /** symlink（推奨・更新追従）or copy（symlink 不可時の fallback）。 */
  method: "symlink" | "copy";
  /** targetDir が PATH に含まれるか。false なら shell rc への追記が必要。 */
  inPath: boolean;
  /** ユーザー向けメッセージ（成功確認手順 / PATH 追加案内 / エラー内容）。 */
  message: string;
}

export interface CliSetupDeps {
  /** ホームディレクトリ（既定: os.homedir）。テスト用注入。 */
  home?: string;
  /** env（既定: process.env）。PATH 判定用。テスト用注入。 */
  env?: NodeJS.ProcessEnv;
}

/**
 * setup の推奨ターゲットディレクトリ（~/.local/bin）。XDG 準拠・ユーザー書き込み可能。
 * 純粋関数（テスト容易）。
 */
export function cliTargetDir(home: string): string {
  return path.join(home, ".local", "bin");
}

/** mdtex のターゲットファイル名（Windows は .cmd ラッパー、それ以外は mdtex）。純粋関数。 */
export function cliTargetName(): string {
  return process.platform === "win32" ? "mdtex.cmd" : "mdtex";
}

/**
 * targetDir が PATH 環境変数に含まれるか。純粋関数。
 * PATH は区切り文字（Unix: ':' / Windows: ';'）で分割し、絶対パスで比較する。
 */
export function isInPath(targetDir: string, env: NodeJS.ProcessEnv): boolean {
  const pathVar = env.PATH ?? env.Path ?? "";
  if (!pathVar) return false;
  const target = path.resolve(targetDir);
  return pathVar.split(path.delimiter).some(p => {
    try {
      return path.resolve(p) === target;
    } catch {
      return false;
    }
  });
}

/**
 * プラグイン同梱の cli.js（pluginCliPath）への symlink を ~/.local/bin/mdtex に作る。
 * 既存のリンク/ファイルがあれば除去してから再作成（プラグイン更新後の再 setup に対応）。
 * symlink 不可（Windows 非特権・一部 FS）のときは copy に fallback。Unix では chmod +x。
 * 例外は投げず、全て CliSetupResult に丸める（UI の通知源をここに集中）。
 */
export async function setupCli(pluginCliPath: string, deps: CliSetupDeps = {}): Promise<CliSetupResult> {
  const home = deps.home ?? os.homedir();
  const env = deps.env ?? process.env;
  const isWin = process.platform === "win32";
  const targetDir = cliTargetDir(home);
  const target = path.join(targetDir, cliTargetName());

  // プラグイン同梱 cli.js の存在確認（古いバージョン・開発中で無ければ失敗）。
  try {
    await fs.access(pluginCliPath);
  } catch {
    return {
      ok: false,
      targetPath: target,
      method: "copy",
      inPath: false,
      message: `CLI が見つかりません: ${pluginCliPath}\nプラグインを最新版に更新してください（配布 ZIP に cli.js が同梙されています）。`,
    };
  }

  try {
    await fs.mkdir(targetDir, { recursive: true });
    // 既存のリンク/ファイルを除去（更新時の再 setup）。無ければ無視。
    await fs.rm(target, { force: true });

    let method: "symlink" | "copy";
    if (isWin) {
      // Windows は symlink が特権必須なので、.cmd ラッパーを生成して copy 扱い。
      await fs.writeFile(target, windowsWrapper(pluginCliPath));
      method = "copy";
    } else {
      try {
        await fs.symlink(pluginCliPath, target);
        method = "symlink";
      } catch {
        // symlink 不可なら copy に fallback（プラグイン更新時は手動再 setup が必要）。
        await fs.copyFile(pluginCliPath, target);
        method = "copy";
      }
      await fs.chmod(target, 0o755);
    }

    const inPath = isInPath(targetDir, env);
    const message = inPath
      ? `mdtex コマンドを設定しました: ${target}（${method}）。新規ターミナルで \`mdtex --version\` を確認してください。`
      : `mdtex コマンドを設定しました: ${target}（${method}）。\n⚠ ${targetDir} が PATH にありません。shell 設定（.zshrc / .bashrc）に \`export PATH="$HOME/.local/bin:$PATH"\` を追記してください。`;

    return { ok: true, targetPath: target, method, inPath, message };
  } catch (e) {
    return {
      ok: false,
      targetPath: target,
      method: "copy",
      inPath: false,
      message: `CLI セットアップに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Windows 用 .cmd ラッパー。cli.js を node で起動する。 */
function windowsWrapper(pluginCliPath: string): string {
  // バックスラッシュをエスケープ（.cmd 内で）
  const p = pluginCliPath.replace(/\\/g, "\\\\");
  return `@echo off\r\nnode "${p}" %*\r\n`;
}
