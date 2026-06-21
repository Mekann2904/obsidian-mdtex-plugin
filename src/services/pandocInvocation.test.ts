// File: src/services/pandocInvocation.test.ts
// Purpose: invokePandoc の citation 2相オーケストレーション（ADR-009）を runCommand モックで検証する。
// Reason: executePandocCommand の citation ブランチが pandocInvocation へ移動した際、経路テストが
//   不在だった（runReactiveLatexPhase 単体のみ既存）。Pandoc→.tex→draft→反応型判定→latexmk→PDF の
//   呼び出し順序と、成功時の Notice が 1 回だけ発火することを錨付けする（候補 2 + P2-c）。
// Related: src/services/pandocInvocation.ts, src/services/citationPipeline.ts, src/utils/processRunner.ts

import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { invokePandoc } from "./pandocInvocation";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "../MdTexPluginSettings";
import { Notice, App } from "obsidian";
import type { PluginContext } from "./pluginContext";

vi.mock("../utils/processRunner", () => ({
  runCommand: vi.fn(),
}));

import { runCommand } from "../utils/processRunner";

const mockedRunCommand = runCommand as unknown as ReturnType<typeof vi.fn>;

function makeCtx(): PluginContext {
  const app = new App();
  return {
    app,
    settings: { ...DEFAULT_SETTINGS, suppressDeveloperLogs: true },
    getActiveProfileSettings: () => ({ ...DEFAULT_PROFILE }),
  };
}

describe("invokePandoc: citation 2相オーケストレーション（ADR-009）", () => {
  beforeEach(() => {
    (global as unknown as { window?: { moment: { locale: () => string } } }).window = {
      moment: { locale: () => "en" },
    };
    Notice.messages.length = 0;
    mockedRunCommand.mockReset();
  });

  it("citationMode=natbib で Pandoc→draft→latexmk の順に3回起動し、成功 Notice は1回だけ出す", async () => {
    // pandoc は .tex を生成（モック）、draft パスで .aux を得て latexmk で PDF を生成する。
    // .aux には plainnat のみ（クラス内蔵 bibstyle なし）を置く → 反応型 plainnat 除去は発動せず、
    // latexmk 1 回で成功する。これで3段の runCommand 呼び出し順序と Notice 単一性を検証する。
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-cite-"));
    const outputFile = path.join(tmpDir, "out.pdf");
    // citationActive のとき texPath = outputFile の .pdf→.tex。auxPath は同名 .aux。
    await fs.writeFile(path.join(tmpDir, "out.aux"), "\\bibstyle{plainnat}\n", "utf8");

    const profile = {
      ...DEFAULT_PROFILE,
      citationMode: "natbib" as const,
      latexEngine: "lualatex",
      outputDirectory: tmpDir,
      // builtin 方式（buildLatexSearchEnv は空を返す＝環境干渉なし）
    };

    // 全 runCommand 成功
    mockedRunCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    const result = await invokePandoc({
      ctx: makeCtx(),
      profile,
      format: "pdf",
      inputContent: "# Title\nHello",
      outputFile,
      headerFilePath: path.join(tmpDir, "header.tex"),
      workingDir: tmpDir,
      pandocExtraArgs: [],
      stripMermaid: false,
    });

    expect(result).toBe(true);
    // 3 段: pandoc(.tex 生成) → lualatex(draft) → latexmk(PDF)
    expect(mockedRunCommand).toHaveBeenCalledTimes(3);
    const commands = mockedRunCommand.mock.calls.map(c => c[0]);
    expect(commands[0]).toBe("pandoc"); // DEFAULT_PROFILE.pandocPath
    expect(commands[1]).toBe("lualatex"); // draftEngine (latexEngine=lualatex)
    expect(commands[2]).toBe("latexmk");

    // 成功 Notice は 1 回だけ（P1-b で convertService 側の重複 Notice を削除済み）
    const generatedNotices = Notice.messages.filter(m => m.toLowerCase().includes("generated"));
    expect(generatedNotices).toHaveLength(1);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("citation 以外モードでは runCommand は1回（pandoc のみ）で成功する", async () => {
    // citationMode=none のとき 2相化せず、Pandoc が直接 PDF を生成する（1 回）。
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-nocite-"));
    const outputFile = path.join(tmpDir, "out.pdf");

    const profile = { ...DEFAULT_PROFILE, citationMode: "none" as const, outputDirectory: tmpDir };
    mockedRunCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    const result = await invokePandoc({
      ctx: makeCtx(),
      profile,
      format: "pdf",
      inputContent: "# Title",
      outputFile,
      headerFilePath: path.join(tmpDir, "header.tex"),
      workingDir: tmpDir,
      pandocExtraArgs: [],
      stripMermaid: false,
    });

    expect(result).toBe(true);
    expect(mockedRunCommand).toHaveBeenCalledTimes(1);
    expect(mockedRunCommand.mock.calls[0][0]).toBe("pandoc");
    expect(Notice.messages.filter(m => m.toLowerCase().includes("generated"))).toHaveLength(1);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("反応型 LaTeX フェーズで .aux が取れなければ失敗し、Notice は1回（重複なし）", async () => {
    // draft パスが .aux を生成しない（モックなので実ファイルが無い）→ runReactiveLatexPhase が
    // false を返す。executePandocCommand は notice_pandoc_stdin_failed を1回出して false。
    // convertService 側の重複 Notice は P1-b で削除済みなので、呼び出し側が二重に出さないことを
    // このテスト経由で保証する（invokePandoc が通知の唯一の所有者）。
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-citefail-"));
    const outputFile = path.join(tmpDir, "out.pdf");
    // .aux を置かない（draft が生成したと見せかけた上で欠落）

    const profile = {
      ...DEFAULT_PROFILE,
      citationMode: "citeproc" as const,
      latexEngine: "lualatex",
      outputDirectory: tmpDir,
    };
    mockedRunCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    const result = await invokePandoc({
      ctx: makeCtx(),
      profile,
      format: "pdf",
      inputContent: "# Title",
      outputFile,
      headerFilePath: path.join(tmpDir, "header.tex"),
      workingDir: tmpDir,
      pandocExtraArgs: [],
      stripMermaid: false,
    });

    expect(result).toBe(false);
    // pandoc(.tex) + draft の2回まで（latexmk は .aux 欠落で到達しない）
    expect(mockedRunCommand).toHaveBeenCalledTimes(2);
    // 失敗 Notice は invokePandoc 内で1回だけ
    expect(Notice.messages.filter(m => /stdin|failed/i.test(m))).toHaveLength(1);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
