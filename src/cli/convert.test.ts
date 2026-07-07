// File: src/cli/convert.test.ts
// Purpose: agent 向け `mdtex convert` のファイルシステム境界を検証する。
// Reason: Obsidian GUI なしで Markdown→PDF 変換を dry-run / 実行できる CLI 契約を固定するため。
// Related: src/cli/convert.ts, src/cli/commands/convert.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { convertMarkdownCli } from "./convert";
import { runCommand } from "../utils/processRunner";

vi.mock("../utils/processRunner", () => ({
  runCommand: vi.fn(),
}));

const mockedRunCommand = runCommand as unknown as ReturnType<typeof vi.fn>;

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "mdtex-convert-test-"));
}

describe("convertMarkdownCli", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeTempDir();
    mockedRunCommand.mockReset();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("--defaults 指定の dry-run は pandoc コマンドを構築し、実行しない", async () => {
    const input = path.join(dir, "input.md");
    const defaults = path.join(dir, "defaults.yaml");
    const output = path.join(dir, "out.pdf");
    await fs.writeFile(input, "# Hello\n");
    await fs.writeFile(defaults, "from: markdown\n");

    const result = await convertMarkdownCli({ input, defaults, output, dryRun: true });

    expect(result.status).toBe("dry-run");
    expect(result.command).toBe(`pandoc ${input} -d ${defaults} -o ${output}`);
    expect(result.output).toBe(output);
    expect(mockedRunCommand).not.toHaveBeenCalled();
  });

  it("--pack 指定は <folder>/<pack>/defaults.yaml を defaults として使う", async () => {
    const input = path.join(dir, "input.md");
    const folder = path.join(dir, "templates");
    const defaults = path.join(folder, "Paper", "defaults.yaml");
    await fs.mkdir(path.dirname(defaults), { recursive: true });
    await fs.writeFile(input, "# Hello\n");
    await fs.writeFile(defaults, "from: markdown\n");

    const result = await convertMarkdownCli({ input, folder, pack: "Paper", dryRun: true });

    expect(result.status).toBe("dry-run");
    expect(result.defaultsUsed).toBe(defaults);
    expect(result.output).toBe(path.join(dir, "input.pdf"));
    expect(result.command).toBe(`pandoc ${input} -d ${defaults} -o ${path.join(dir, "input.pdf")}`);
  });

  it("入力ファイルが無ければ error で pandoc を実行しない", async () => {
    const result = await convertMarkdownCli({ input: path.join(dir, "missing.md") });

    expect(result.status).toBe("error");
    expect(result.error).toContain("入力 Markdown が見つかりません");
    expect(mockedRunCommand).not.toHaveBeenCalled();
  });

  it("pandoc 成功時は ok", async () => {
    const input = path.join(dir, "input.md");
    const output = path.join(dir, "out.pdf");
    await fs.writeFile(input, "# Hello\n");
    mockedRunCommand.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    const result = await convertMarkdownCli({ input, output, pandoc: "pandoc-custom" });

    expect(result.status).toBe("ok");
    expect(mockedRunCommand).toHaveBeenCalledWith("pandoc-custom", [input, "-o", output], {
      cwd: dir,
    });
  });

  it("pandoc が非0終了時は error で stderrTail を返す", async () => {
    const input = path.join(dir, "input.md");
    const output = path.join(dir, "err.pdf");
    await fs.writeFile(input, "# Hello\n");
    mockedRunCommand.mockResolvedValue({
      stdout: "",
      stderr: "! Undefined control sequence.\nl.10 \\unknowncmd",
      exitCode: 1,
    });

    const result = await convertMarkdownCli({ input, output });

    expect(result.status).toBe("error");
    expect(result.error).toContain("終了コード 1");
    expect(result.stderrTail).toContain("\\unknowncmd");
  });

  it("pandoc 起動が reject されたら error に重る（例外を投げない）", async () => {
    const input = path.join(dir, "input.md");
    const output = path.join(dir, "throw.pdf");
    await fs.writeFile(input, "# Hello\n");
    mockedRunCommand.mockRejectedValue(new Error("spawn failed"));

    const result = await convertMarkdownCli({ input, output });

    expect(result.status).toBe("error");
    expect(result.error).toContain("spawn failed");
  });
});
