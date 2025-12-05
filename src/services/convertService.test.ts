// File: src/services/convertService.test.ts
// Purpose: convertCurrentPage の主要フローをモック付きで検証する。
// Reason: Obsidian 依存や pandoc 実行を避けつつ、通知と引数構築を確かめるため。
// Related: src/services/convertService.ts, src/utils/processRunner.ts, tests/__mocks__/obsidian.ts, vitest.config.ts

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { convertCurrentPage } from "./convertService";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "../MdTexPluginSettings";
import { Notice, App, FileSystemAdapter } from "obsidian";

vi.mock("../utils/processRunner", () => {
  return {
    runCommand: vi.fn(),
  };
});

import { runCommand } from "../utils/processRunner";

const mockedRunCommand = runCommand as unknown as ReturnType<typeof vi.fn>;

const noopLintFix = vi.fn(async () => {});

describe("convertCurrentPage", () => {
  beforeEach(() => {
    (global as any).window = { moment: { locale: () => "en" } };
    Notice.messages.length = 0;
    mockedRunCommand.mockReset();
  });

  afterEach(async () => {
    // 生成した一時ファイルは各テスト内で片付ける
  });

  it("アクティブファイルが無い場合は早期リターンする", async () => {
    const app = new App();
    app.workspace.getActiveFile = () => null;
    const ctx = {
      app,
      settings: { ...DEFAULT_SETTINGS },
      getActiveProfileSettings: () => DEFAULT_PROFILE,
    };

    await convertCurrentPage(ctx as any, { runMarkdownlintFix: noopLintFix }, "pdf");

    expect(mockedRunCommand).not.toHaveBeenCalled();
    expect(Notice.messages.pop()).toContain("No active file selected.");
  });

  it("Markdown を変換し runCommand が一度呼ばれる", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-test-"));
    const inputPath = path.join(tmpDir, "note.md");
    await fs.writeFile(inputPath, "# Title\nHello", "utf8");

    const app = new App();
    app.vault.adapter = new FileSystemAdapter(tmpDir);
    app.workspace.getActiveFile = () => ({ path: "note.md" });
    app.workspace.activeLeaf = null;

    const profile = { ...DEFAULT_PROFILE, outputDirectory: tmpDir };
    const settings = { ...DEFAULT_SETTINGS, profiles: { Default: profile }, activeProfile: "Default" };

    mockedRunCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await convertCurrentPage(
      { app, settings, getActiveProfileSettings: () => profile } as any,
      { runMarkdownlintFix: noopLintFix },
      "pdf"
    );

    expect(mockedRunCommand).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = mockedRunCommand.mock.calls[0];
    expect(cmd).toBe(profile.pandocPath);
    expect(args).toContain("--include-in-header");
    expect(args).toContain("-o");
    expect(opts?.input).toContain("Title");
    const lastNotice = Notice.messages.pop() || "";
    expect(lastNotice.toLowerCase()).toContain("generated");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("Pandoc が異常終了した場合はエラーノーティスを出す", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-test-err-"));
    const inputPath = path.join(tmpDir, "note.md");
    await fs.writeFile(inputPath, "# Title\nHello", "utf8");

    const app = new App();
    app.vault.adapter = new FileSystemAdapter(tmpDir);
    app.workspace.getActiveFile = () => ({ path: "note.md" });

    const profile = { ...DEFAULT_PROFILE, outputDirectory: tmpDir };
    const settings = { ...DEFAULT_SETTINGS, profiles: { Default: profile }, activeProfile: "Default" };

    mockedRunCommand.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "boom" });

    await convertCurrentPage(
      { app, settings, getActiveProfileSettings: () => profile } as any,
      { runMarkdownlintFix: noopLintFix },
      "pdf"
    );

    const lastNotice = Notice.messages.pop() || "";
    expect(lastNotice.toLowerCase()).toContain("pandoc");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
