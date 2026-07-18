// File: src/services/lintService.test.ts
// Purpose: lintService が外部ツール起動を深い module（binDiscover / texPath / processRunner）へ
//   委譲し、markdownlint 固有の意味（--fix の frontmatter dance・Notice 判定）だけを所有しているかを
//   検証する（architecture review 候補 C1）。
// Reason: 従来 lintService は spawn ×3 と macOS 硬coded の bin 解決（detectBrewMarkdownlintBin）を
//   持ち、単体テストが 0 件だった。runCommand モック 1 つでテスト面が揃うことを錨付けする。
// Related: src/services/lintService.ts, src/utils/processRunner.ts, src/utils/binDiscover.ts

import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { lintCurrentNote, runMarkdownlintFix } from "./lintService";
import { DEFAULT_SETTINGS } from "../MdTexPluginSettings";
import { Notice, App, TFile, MarkdownView } from "obsidian";
import type { PluginContext } from "./pluginContext";

// processRunner の runCommand をモック: lintService は起動知識を runCommand へ委譲するので、
// これ 1 つでプロセス起動を制御できる（spawn 直書き 3 箇所をモックする必要はない）。
vi.mock("../utils/processRunner", () => ({
  runCommand: vi.fn(),
}));

import { runCommand } from "../utils/processRunner";
const mockedRunCommand = runCommand as unknown as ReturnType<typeof vi.fn>;

function makeCtx(overrides: Partial<PluginContext["settings"]> = {}): PluginContext {
  const app = new App();
  return {
    app,
    settings: { ...DEFAULT_SETTINGS, suppressDeveloperLogs: true, ...overrides },
    getActiveProfileSettings: () => ({}) as never,
  };
}

/**
 * テスト用のアクティブファイル付き ctx を作る。app.vault.adapter.getFullPath が vault 相対 →
 * 絶対パス変換を担い、workspace.getActiveFile / activeLeaf がファイルを返す。
 */
function makeCtxWithFile(fileAbsPath: string, vaultRoot: string): PluginContext {
  const ctx = makeCtx();
  const rel = path.relative(vaultRoot, fileAbsPath);
  const fakeFile = new TFile(rel);
  (ctx.app.workspace.getActiveFile as unknown as () => unknown) = () => fakeFile;
  const view = new MarkdownView();
  view.file = { path: rel };
  // activeLeaf が未定義だと save 経路に入らないので、読み取り専用で十分に仕込む
  (ctx.app as unknown as { activeLeaf?: unknown }).activeLeaf = { view };
  return ctx;
}

describe("lintService: 外部ツール起動の委譲（候補 C1）", () => {
  beforeEach(() => {
    (global as unknown as { window?: { moment: { locale: () => string } } }).window = {
      moment: { locale: () => "en" },
    };
    Notice.messages.length = 0;
    mockedRunCommand.mockReset();
    mockedRunCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
  });

  describe("bin 解決", () => {
    it("設定に markdownlintCli2Path があればそれを尊重する（UI と実行で同じ答え）", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-lint-"));
      const target = path.join(tmpDir, "note.md");
      await fs.writeFile(target, "# hi\n", "utf8");

      const ctx = makeCtxWithFile(target, tmpDir);
      ctx.settings.markdownlintCli2Path = "/custom/markdownlint-cli2";

      await lintCurrentNote(ctx);

      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
      expect(mockedRunCommand.mock.calls[0][0]).toBe("/custom/markdownlint-cli2");

      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("exit code != 0 で warn Notice を出す（起動は runCommand へ委譲）", async () => {
      // bin 解決の未検出経路（resolveMarkdownlintBin が空を返す）は discoverMarkdownlint が本物
      // fs を使うためテスト環境依存となり、ここでは検証しない。代わりに runCommand の結果から
      // Notice を正しく分岐させる経路（exit 0 → ok / exit != 0 → warn）を検証し、起動知識が
      // processRunner へ委譲されていることを綱付けする。
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-lint-"));
      const target = path.join(tmpDir, "note.md");
      await fs.writeFile(target, "# hi\n", "utf8");

      const ctx = makeCtxWithFile(target, tmpDir);
      ctx.settings.markdownlintCli2Path = "/custom/markdownlint-cli2";
      mockedRunCommand.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "warn" });

      await lintCurrentNote(ctx);

      // runCommand が 1 回呼ばれ、その exit code で Notice が分岐する
      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
      expect(Notice.messages.some(m => /code=1|issues found/i.test(m ?? ""))).toBe(true);

      await fs.rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("runMarkdownlintFix: frontmatter 分離", () => {
    it("frontmatter 付き文書は本文だけ --fix し、frontmatter + 修正本文 を書き戻す", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-lintfix-"));
      const target = path.join(tmpDir, "note.md");
      const frontmatter = "---\ntitle: hi\n---\n";
      const body = "# title\n";
      await fs.writeFile(target, frontmatter + body, "utf8");

      const ctx = makeCtxWithFile(target, tmpDir);
      ctx.settings.markdownlintCli2Path = "/custom/markdownlint-cli2";

      // --fix が「temp body を修正した」ことをシミュレート: temp ファイルを読み込んで書き換える。
      // lintService は runCommand 終了後に temp body を読み直すので、ここで書き換えておく。
      mockedRunCommand.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("--fix")) {
          const tempBodyPath = args[args.length - 1];
          await fs.writeFile(tempBodyPath, "# title fixed\n", "utf8");
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      });

      await runMarkdownlintFix(ctx, target);

      const result = await fs.readFile(target, "utf8");
      // frontmatter は温存され、本文だけ修正される
      expect(result).toBe("---\ntitle: hi\n---\n# title fixed\n");

      // runCommand は --fix 1 回だけ（frontmatter 分離経路）
      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
      const fixArgs = mockedRunCommand.mock.calls[0][1] as string[];
      expect(fixArgs[0]).toBe("--fix");
      // temp body へのパスが渡る（元ファイルではない）
      expect(fixArgs[1]).toContain(".lintbody.md");

      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("frontmatter 無しの文書は元ファイルへ直接 --fix する", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-lintfixnofm-"));
      const target = path.join(tmpDir, "note.md");
      await fs.writeFile(target, "# title\n", "utf8");

      const ctx = makeCtxWithFile(target, tmpDir);
      ctx.settings.markdownlintCli2Path = "/custom/markdownlint-cli2";

      await runMarkdownlintFix(ctx, target);

      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
      const [, args] = mockedRunCommand.mock.calls[0] as [string, string[]];
      expect(args[0]).toBe("--fix");
      // 元ファイルへ直接（temp body は作らない）
      expect(args[1]).toBe(target);

      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("--fix が reject しても temp body を片付け、例外を伝播しない（パイプラインを止めない）", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-lintfixerr-"));
      const target = path.join(tmpDir, "note.md");
      await fs.writeFile(target, "---\na: 1\n---\n# t\n", "utf8");

      const ctx = makeCtxWithFile(target, tmpDir);
      ctx.settings.markdownlintCli2Path = "/custom/markdownlint-cli2";

      const tempPaths: string[] = [];
      mockedRunCommand.mockImplementation(async (_cmd: string, args: string[]) => {
        tempPaths.push(args[args.length - 1]);
        throw new Error("spawn failed");
      });

      // reject を投げずに完了する（変換パイプラインを止めない）
      await expect(runMarkdownlintFix(ctx, target)).resolves.toBeUndefined();

      // temp body が片付いている
      for (const p of tempPaths) {
        await expect(fs.access(p)).rejects.toThrow();
      }

      await fs.rm(tmpDir, { recursive: true, force: true });
    });
  });
});
