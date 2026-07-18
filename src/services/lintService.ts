// File: src/services/lintService.ts
// Purpose: markdownlint-cli2 の実行と --fix 処理を提供するサービス層。
// Reason: プラグイン本体の責務を分離し、Lint 周辺処理を集約するため。
// Related: src/MdTexPlugin.ts, src/services/convertService.ts, src/MdTexPluginSettings.ts,
//          src/utils/binDiscover.ts, src/utils/texPath.ts, src/utils/processRunner.ts
//
// 外部ツール起動の知識（bin 発見・PATH 強化・プロセス起動）は、それぞれ深い module
// （binDiscover / texPath / processRunner）へ委譲する（architecture review 候補 C1）。
// 本 module は markdownlint 固有の意味（--fix の frontmatter 分離・temp body 再結合・終了時の
// Notice 判定）だけを残し、OS 毎の挙動や stdio 収集を自前で持たない。

import { Notice, FileSystemAdapter } from "obsidian";
import * as path from "path";
import * as fs from "fs/promises";
import { PandocPluginSettings } from "../MdTexPluginSettings";
import { t } from "../lang/helpers";
import { PluginContext } from "./pluginContext";
import { splitFrontmatter } from "../utils/frontmatter";
import {
  discoverMarkdownlint,
  getMarkdownlintCandidates,
} from "../utils/binDiscover";
import { augmentPathString } from "../utils/texPath";
import { runCommand } from "../utils/processRunner";
import { saveActiveMarkdownViewIfMatching } from "./activeView";

/**
 * markdownlint-cli2 の実行バイナリを解決する。
 *
 * 設定（`markdownlintCli2Path`）が空でなければそれをそのまま尊重する（ユーザー明示指定・
 * 設定タブの自動検出ドロップダウンで選んだ binPath）。空の場合は binDiscover のクロス
 * プラットフォーム探索（候補ディレクトリ + PATH 走査）で最初に見つかったものを使う。
 * いずれも得られなければ空文字を返し、呼び出し側で「未検出」の Notice に出す。
 *
 * 従来の detectBrewMarkdownlintBin（macOS Homebrew 硬coded）に代わり、UI（SettingTab）と
 * 実行（本関数）で bin 解決の答えが一致する（architecture review 候補 C1）。
 */
function resolveMarkdownlintBin(settings: PandocPluginSettings): string {
  const configured = (settings.markdownlintCli2Path || "").trim();
  if (configured) return configured;

  const found = discoverMarkdownlint(process.platform, process.env.PATH ?? "");
  return found.length > 0 ? found[0].binPath : "";
}

/**
 * markdownlint 実行用の env を構築する。
 *
 * Obsidian（GUI アプリ）の process.env.PATH は /opt/homebrew/opt/node/bin 等（Homebrew node の
 * npm グローバル bin）を含まないことがある。getMarkdownlintCandidates で得た候補ディレクトリを
 * augmentPathString で存在するものだけ PATH の先頭に追加する。従来 lintService が硬coded で
 * 持っていた buildEnvPath の知識を、texPath の共通機構へ集約する（候補 C1）。
 */
function resolveMarkdownlintEnv(): NodeJS.ProcessEnv {
  // markdownlint 候補は glob を含まない（getMarkdownlintCandidates は単純パスのリスト）ため、
  // augmentPathString を TeX（augmentPathForTex が内部で expandGlob）と同じ素直な形で呼ぶ。
  const augmented = augmentPathString(
    process.env.PATH ?? "",
    getMarkdownlintCandidates(process.platform),
  );
  return { ...process.env, PATH: augmented };
}

/**
 * 指定したファイル（vault 絶対パス）に対して markdownlint-cli2 を実行し、結果を Notice で出す。
 * --fix は掛けない（診断のみ）。
 */
export async function lintCurrentNote(ctx: PluginContext) {
  const activeFile = ctx.app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice(t("notice_no_active_file"));
    return;
  }
  if (!activeFile.path.endsWith(".md")) {
    new Notice(t("notice_not_markdown"));
    return;
  }

  await saveActiveMarkdownViewIfMatching(ctx.app, activeFile);

  const cli = resolveMarkdownlintBin(ctx.settings);
  if (!cli) {
    new Notice(t("notice_markdownlint_missing"));
    return;
  }

  const fileAdapter = ctx.app.vault.adapter as FileSystemAdapter;
  const fullPath = fileAdapter.getFullPath(activeFile.path);
  const vaultRoot = fileAdapter.getBasePath();

  try {
    const result = await runCommand(cli, [fullPath], {
      cwd: vaultRoot,
      env: resolveMarkdownlintEnv(),
    });
    if (result.stdout.trim()) console.log("markdownlint output:\n" + result.stdout);
    if (result.stderr.trim()) console.error("markdownlint error:\n" + result.stderr);
    new Notice(
      result.exitCode === 0 ? t("notice_lint_ok") : t("notice_lint_warn_code", [result.exitCode]),
    );
  } catch (e: unknown) {
    console.error(e);
    new Notice(t("notice_markdownlint_launch_failed"));
  }
}

/**
 * 指定ファイルに対して markdownlint-cli2 --fix を実行する。
 *
 * frontmatter がある場合、markdownlint が frontmatter を書き換えるのを防ぐため、本文だけを
 * 一時ファイルへ切り出して --fix を掛け、元ファイルへ frontmatter + 修正済み本文 として書き戻す。
 * frontmatter が無ければ元ファイルに直接 --fix を掛ける。
 *
 * いずれの経路もプロセス起動は runCommand に委譲する（stdio 収集・env・exit code 処理を自前で
 * 持たない）。変換パイプライン（convertService）から呼ばれる。
 */
export async function runMarkdownlintFix(ctx: PluginContext, targetPath: string): Promise<void> {
  const fileAdapter = ctx.app.vault.adapter as FileSystemAdapter;
  const vaultRoot = fileAdapter.getBasePath();
  const fullPath = path.isAbsolute(targetPath) ? targetPath : fileAdapter.getFullPath(targetPath);

  const cli = resolveMarkdownlintBin(ctx.settings);
  if (!cli) {
    new Notice(t("notice_markdownlint_missing"));
    return;
  }

  const original = await fs.readFile(fullPath, "utf8");
  const { raw: frontMatter, body } = splitFrontmatter(original);

  // frontmatter がある場合: 本文だけ --fix して書き戻す。frontmatter のメタデータを
  // markdownlint に破壊されないための必須の舞踏（これが本 service の core の意味）。
  if (frontMatter) {
    const tempBody = `${fullPath}.lintbody.md`;
    await fs.writeFile(tempBody, body, "utf8");
    // runCommand が reject（起動失敗）しても temp body を片付け、例外を伝播しない（変換パイプ
    // ラインを止めない。従来の child.on("error") で resolve() していた挙動と一致）。
    // writeFile を try 本体へ置くことで、成功時のみ書き戻す（reject なら到達しない = 元ファイル不改変）。
    // 失敗追跡用の状態フラグを置かずに済む。
    try {
      await runCommand(cli, ["--fix", tempBody], {
        cwd: vaultRoot,
        env: resolveMarkdownlintEnv(),
      });
      const fixedBody = await fs.readFile(tempBody, "utf8");
      await fs.writeFile(fullPath, frontMatter + fixedBody, "utf8");
    } catch (e) {
      // --fix 失敗は呼び出し側（convertService）の変換パイプラインを止めない。ログだけ残す。
      console.debug("markdownlint --fix failed:", e);
    } finally {
      // 成否にかかわらず temp body を片付ける
      try {
        await fs.unlink(tempBody);
      } catch (e) {
        console.debug("Failed to delete temp file:", e);
      }
    }
    return;
  }

  // frontmatter 無し: 元ファイルへ直接 --fix。
  try {
    await runCommand(cli, ["--fix", fullPath], {
      cwd: vaultRoot,
      env: resolveMarkdownlintEnv(),
    });
  } catch (e) {
    // --fix 失敗は呼び出し側（convertService）の変換パイプラインを止めない。ログだけ残す。
    console.debug("markdownlint --fix failed:", e);
  }
}
