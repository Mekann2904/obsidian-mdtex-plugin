// File: src/services/lintService.ts
// Purpose: markdownlint 実行と --fix 処理を提供するサービス層。
// Reason: プラグイン本体の責務を分離し、Lint 周辺処理を集約するため。
// Related: src/MdTexPlugin.ts, src/services/convertService.ts, src/MdTexPluginSettings.ts

import { Notice, MarkdownView, FileSystemAdapter, App } from "obsidian";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import { PandocPluginSettings, ProfileSettings } from "../MdTexPluginSettings";

export interface PluginContext {
  app: App;
  settings: PandocPluginSettings;
  getActiveProfileSettings(): ProfileSettings;
}

export async function lintCurrentNote(ctx: PluginContext) {
  const activeFile = ctx.app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice("No active file selected.");
    return;
  }
  if (!activeFile.path.endsWith(".md")) {
    new Notice("The active file is not a Markdown file.");
    return;
  }

  const leaf = ctx.app.workspace.activeLeaf;
  if (leaf && leaf.view instanceof MarkdownView) {
    const markdownView = leaf.view as MarkdownView;
    if (markdownView.file && markdownView.file.path === activeFile.path) {
      await markdownView.save();
    }
  }

  try {
    const fileAdapter = ctx.app.vault.adapter as FileSystemAdapter;
    const fullPath = fileAdapter.getFullPath(activeFile.path);
    const vaultRoot = fileAdapter.getBasePath();

    const cli = detectBrewMarkdownlintBin(ctx.settings);
    if (!cli) {
      new Notice("markdownlint-cli2が見つからない。設定でパスを指定すること。");
      return;
    }

    await new Promise<void>((resolve) => {
      const envPath = buildEnvPath();
      const child = spawn(cli, [fullPath], {
        shell: false,
        cwd: vaultRoot,
        stdio: "pipe",
        env: { ...process.env, PATH: envPath },
      });
      let out = "";
      let err = "";
      child.stdout?.on("data", (d) => { out += d.toString(); });
      child.stderr?.on("data", (d) => { err += d.toString(); });
      child.on("close", (code) => {
        if (out.trim()) console.log("markdownlint output:\n" + out);
        if (err.trim()) console.error("markdownlint error:\n" + err);
        new Notice(code === 0 ? "Lint完了: 問題なし" : `Lint完了: 指摘あり (code=${code})`);
        resolve();
      });
      child.on("error", (e) => {
        console.error(e);
        new Notice("markdownlint-cli2の起動に失敗。設定のパスとNodeのインストールを確認。");
        resolve();
      });
    });
  } catch (e: any) {
    console.error(e);
    new Notice(`Lintエラー: ${e?.message || e}`);
  }
}

export async function runMarkdownlintFix(ctx: PluginContext, targetPath: string): Promise<void> {
  const fileAdapter = ctx.app.vault.adapter as FileSystemAdapter;
  const vaultRoot = fileAdapter.getBasePath();
  const fullPath = path.isAbsolute(targetPath)
    ? targetPath
    : fileAdapter.getFullPath(targetPath);

  const cli = detectBrewMarkdownlintBin(ctx.settings);
  if (!cli) {
    new Notice("markdownlint-cli2が見つからない。設定でパスを指定すること。");
    return;
  }

  const original = await fs.readFile(fullPath, "utf8");
  const yamlMatch = original.match(/^(---[\t\x20]*\n[\s\S]*?\n---[\t\x20]*\n?)/);
  const tomlMatch = (!yamlMatch) ? original.match(/^(\+\+\+[\t\x20]*\n[\s\S]*?\n(\+\+\+|\.\.\.)[\t\x20]*\n?)/) : null;
  const frontMatter = yamlMatch?.[1] || tomlMatch?.[1] || "";
  const body = original.slice(frontMatter.length);

  if (frontMatter) {
    const tempBody = `${fullPath}.lintbody.md`;
    await fs.writeFile(tempBody, body, "utf8");
    await new Promise<void>((resolve) => {
      const child = spawn(cli, ["--fix", tempBody], {
        shell: false,
        cwd: vaultRoot,
        stdio: "pipe",
        env: { ...process.env, PATH: buildEnvPath() },
      });
      child.on("close", async () => {
        try {
          const fixedBody = await fs.readFile(tempBody, "utf8");
          await fs.writeFile(fullPath, frontMatter + fixedBody, "utf8");
        } finally {
          try { await fs.unlink(tempBody); } catch {}
        }
        resolve();
      });
      child.on("error", async () => {
        try { await fs.unlink(tempBody); } catch {}
        resolve();
      });
    });
    return;
  }

  await new Promise<void>((resolve) => {
    const child = spawn(cli, ["--fix", fullPath], {
      shell: false,
      cwd: vaultRoot,
      stdio: "pipe",
      env: { ...process.env, PATH: buildEnvPath() },
    });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

export function detectBrewMarkdownlintBin(settings: PandocPluginSettings): string | null {
  const configured = (settings.markdownlintCli2Path || "").trim();
  const candidates = [
    configured,
    "/opt/homebrew/bin/markdownlint-cli2",
    "/usr/local/bin/markdownlint-cli2",
    "/opt/homebrew/bin/markdownlint-cli",
    "/usr/local/bin/markdownlint-cli",
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (fsSync.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

const buildEnvPath = () => [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/opt/homebrew/opt/node/bin",
  "/usr/local/opt/node/bin",
  process.env.PATH || "",
].join(":");
