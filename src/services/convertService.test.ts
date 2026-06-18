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
import { Notice, App, FileSystemAdapter, TFile } from "obsidian";
import type { PluginContext } from "./lintService";

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
    (global as unknown as { window?: { moment: { locale: () => string } } }).window = {
      moment: { locale: () => "en" },
    };
    Notice.messages.length = 0;
    mockedRunCommand.mockReset();
  });

  afterEach(async () => {
    // 生成した一時ファイルは各テスト内で片付ける
  });

  it("アクティブファイルが無い場合は早期リターンする", async () => {
    const app = new App();
    app.workspace.getActiveFile = () => null;
    const ctx: PluginContext = {
      app,
      settings: { ...DEFAULT_SETTINGS },
      getActiveProfileSettings: () => DEFAULT_PROFILE,
    };

    await convertCurrentPage(ctx, { runMarkdownlintFix: noopLintFix }, "pdf");

    expect(mockedRunCommand).not.toHaveBeenCalled();
    expect(Notice.messages.pop()).toContain("No active file selected.");
  });

  it("Markdown を変換し runCommand が一度呼ばれる", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-test-"));
    const inputPath = path.join(tmpDir, "note.md");
    await fs.writeFile(inputPath, "# Title\nHello", "utf8");

    const app = new App();
    app.vault.adapter = new FileSystemAdapter(tmpDir);
    app.workspace.getActiveFile = () => ({ path: "note.md" }) as TFile;
    app.workspace.activeLeaf = null;

    const profile = { ...DEFAULT_PROFILE, outputDirectory: tmpDir };
    const settings = {
      ...DEFAULT_SETTINGS,
      profiles: { Default: profile },
      activeProfile: "Default",
    };
    const ctx: PluginContext = {
      app,
      settings,
      getActiveProfileSettings: () => profile,
    };

    mockedRunCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await convertCurrentPage(ctx, { runMarkdownlintFix: noopLintFix }, "pdf");

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

  it("crossref-ON ではプリアンブルに \\renewcommand を注入せず --metadata-file でメタデータを渡す", async () => {
    // frontmatter 優先を実現するため、crossref-ON 時はキャプション語をメタデータ経路
    // （--metadata-file / frontmatter）に一本化し、\renewcommand との二重管理を解消する。
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-test-xref-on-"));
    const inputPath = path.join(tmpDir, "note.md");
    await fs.writeFile(inputPath, "# Title\nHello", "utf8");

    const app = new App();
    app.vault.adapter = new FileSystemAdapter(tmpDir);
    app.workspace.getActiveFile = () => ({ path: "note.md" }) as TFile;
    app.workspace.activeLeaf = null;

    const profile = { ...DEFAULT_PROFILE, outputDirectory: tmpDir, usePandocCrossref: true };
    const settings = { ...DEFAULT_SETTINGS, profiles: { Default: profile }, activeProfile: "Default" };
    const ctx: PluginContext = { app, settings, getActiveProfileSettings: () => profile };

    mockedRunCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await convertCurrentPage(ctx, { runMarkdownlintFix: noopLintFix }, "pdf");

    const [, args] = mockedRunCommand.mock.calls[0];
    expect(args).toContain("--metadata-file");

    const preamble = await fs.readFile(path.join(tmpDir, "note.preamble.tex"), "utf8");
    expect(preamble).not.toContain("\\renewcommand{\\figurename}");
    expect(preamble).not.toContain("\\renewcommand{\\tablename}");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("crossref-OFF ではプロファイル値で \\renewcommand を注入するフォールバックが残る", async () => {
    // crossref-OFF 時はメタデータの消費先がないため、プロファイル値で LaTeX ネイティブの
    // キャプション名を上書きするフォールバックを維持する（後方互換）。
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-test-xref-off-"));
    const inputPath = path.join(tmpDir, "note.md");
    await fs.writeFile(inputPath, "# Title\nHello", "utf8");

    const app = new App();
    app.vault.adapter = new FileSystemAdapter(tmpDir);
    app.workspace.getActiveFile = () => ({ path: "note.md" }) as TFile;
    app.workspace.activeLeaf = null;

    const profile = {
      ...DEFAULT_PROFILE,
      outputDirectory: tmpDir,
      usePandocCrossref: false,
      figureLabel: "図",
    };
    const settings = { ...DEFAULT_SETTINGS, profiles: { Default: profile }, activeProfile: "Default" };
    const ctx: PluginContext = { app, settings, getActiveProfileSettings: () => profile };

    mockedRunCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await convertCurrentPage(ctx, { runMarkdownlintFix: noopLintFix }, "pdf");

    // crossref-OFF では crossref 専用メタデータに消費先がないため、--metadata-file
    // を渡さず LaTeX ネイティブの \renewcommand フォールバックのみを使う。
    const [, offArgs] = mockedRunCommand.mock.calls[0];
    expect(offArgs).not.toContain("--metadata-file");

    const preamble = await fs.readFile(path.join(tmpDir, "note.preamble.tex"), "utf8");
    expect(preamble).toContain("\\renewcommand{\\figurename}{図}");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("Pandoc が異常終了した場合はエラーノーティスを出す", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-test-err-"));
    const inputPath = path.join(tmpDir, "note.md");
    await fs.writeFile(inputPath, "# Title\nHello", "utf8");

    const app = new App();
    app.vault.adapter = new FileSystemAdapter(tmpDir);
    app.workspace.getActiveFile = () => ({ path: "note.md" }) as TFile;

    const profile = { ...DEFAULT_PROFILE, outputDirectory: tmpDir };
    const settings = {
      ...DEFAULT_SETTINGS,
      profiles: { Default: profile },
      activeProfile: "Default",
    };
    const ctx: PluginContext = {
      app,
      settings,
      getActiveProfileSettings: () => profile,
    };

    mockedRunCommand.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "boom" });

    await convertCurrentPage(ctx, { runMarkdownlintFix: noopLintFix }, "pdf");

    const lastNotice = Notice.messages.pop() || "";
    expect(lastNotice.toLowerCase()).toContain("pandoc");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("実験的 Mermaid 無効時は mermaid 言語削除 Lua フィルタが --lua-filter に含まれる", async () => {
    // ADR-005: stripMermaidLanguage（TS 正規表現）を Lua フィルタへ移行した。
    // enableExperimentalMermaid が false のとき pdf 出力で mermaid-filter が適用されることを検証。
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-test-mermaid-"));
    const inputPath = path.join(tmpDir, "note.md");
    await fs.writeFile(inputPath, "```mermaid\ngraph LR\nA-->B\n```", "utf8");

    const app = new App();
    app.vault.adapter = new FileSystemAdapter(tmpDir);
    app.workspace.getActiveFile = () => ({ path: "note.md" }) as TFile;
    app.workspace.activeLeaf = null;

    const profile = { ...DEFAULT_PROFILE, outputDirectory: tmpDir };
    const settings = {
      ...DEFAULT_SETTINGS,
      profiles: { Default: profile },
      activeProfile: "Default",
      enableExperimentalMermaid: false,
    };
    const ctx: PluginContext = { app, settings, getActiveProfileSettings: () => profile };

    mockedRunCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await convertCurrentPage(ctx, { runMarkdownlintFix: noopLintFix }, "pdf");

    const [, args] = mockedRunCommand.mock.calls[0];
    // --lua-filter が2つ（callout + mermaid）含まれること
    const luaFilterArgs = args.filter((_: string, i: number) => args[i - 1] === "--lua-filter");
    expect(luaFilterArgs.length).toBe(2);
    // 2つめのフィルタパスに mdtex-mermaid- が含まれること
    expect(luaFilterArgs[1]).toContain("mdtex-mermaid-");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("実験的 Mermaid 有効時は mermaid 言語削除 Lua フィルタが適用されない", async () => {
    // enableExperimentalMermaid が true のときは mermaid を PNG 化するため言語削除フィルタ不要。
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-test-mermaid-on-"));
    const inputPath = path.join(tmpDir, "note.md");
    await fs.writeFile(inputPath, "# Title", "utf8");

    const app = new App();
    app.vault.adapter = new FileSystemAdapter(tmpDir);
    app.workspace.getActiveFile = () => ({ path: "note.md" }) as TFile;
    app.workspace.activeLeaf = null;

    const profile = { ...DEFAULT_PROFILE, outputDirectory: tmpDir };
    const settings = {
      ...DEFAULT_SETTINGS,
      profiles: { Default: profile },
      activeProfile: "Default",
      enableExperimentalMermaid: true,
    };
    const ctx: PluginContext = { app, settings, getActiveProfileSettings: () => profile };

    mockedRunCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await convertCurrentPage(ctx, { runMarkdownlintFix: noopLintFix }, "pdf");

    const [, args] = mockedRunCommand.mock.calls[0];
    const luaFilterArgs = args.filter((_: string, i: number) => args[i - 1] === "--lua-filter");
    // mermaid-filter は適用されず callout のみ（1つ）
    expect(luaFilterArgs.length).toBe(1);
    expect(luaFilterArgs[0]).not.toContain("mdtex-mermaid-");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
