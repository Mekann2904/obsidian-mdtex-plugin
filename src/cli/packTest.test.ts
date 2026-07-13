// File: src/cli/packTest.test.ts
// Purpose: pack test の testPack 中核（sample 解決・workDir・結果写像）を検証する。
// Reason: runPandocConvert 共通コア化のリファクタ後、testPack 固有の写像（pack/sampleUsed/output）
//          と dry-run 挙動を錨付けするため。pandoc 実行自体は processRunner を mock する。
// Related: src/cli/packTest.ts, src/cli/pandocRun.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { testPack } from "./packTest";
import { runCommand } from "../utils/processRunner";
import type { PackFileAccess } from "../services/packAccess";

vi.mock("../utils/processRunner", () => ({
  runCommand: vi.fn(),
}));

const mockedRunCommand = runCommand as unknown as ReturnType<typeof vi.fn>;

async function makeTempVault(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "mdtex-packtest-test-"));
}

/** ファイル存在判定だけ実 fs を使う PackFileAccess。listChildDirs/readText は pack test では使わない。 */
function fsAccess(): PackFileAccess {
  return {
    async listChildDirs() {
      return [];
    },
    async readText(filePath) {
      try {
        return await fs.readFile(filePath, "utf8");
      } catch {
        return null;
      }
    },
    async exists(filePath) {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
  };
}

describe("testPack", () => {
  let vault: string;

  beforeEach(() => {
    mockedRunCommand.mockReset();
  });

  afterEach(async () => {
    if (vault) await fs.rm(vault, { recursive: true, force: true });
  });

  it("dry-run は pandoc コマンドを構築し、実行しない", async () => {
    vault = await makeTempVault();
    const defaults = path.join(vault, "Paper", "defaults.yaml");
    const sample = path.join(vault, "Paper", "sample.md");
    await fs.mkdir(path.dirname(defaults), { recursive: true });
    await fs.writeFile(defaults, "from: markdown\n");
    await fs.writeFile(sample, "# Hello\n");

    const result = await testPack(fsAccess(), {
      folder: vault,
      pack: "Paper",
      output: path.join(vault, "out.pdf"),
      dryRun: true,
    });

    expect(result.status).toBe("dry-run");
    expect(result.pack).toBe("Paper");
    expect(result.sampleUsed).toBe(sample);
    expect(result.output).toBe(path.join(vault, "out.pdf"));
    expect(result.command).toBe(`pandoc -d ${defaults} -o ${path.join(vault, "out.pdf")} < ${sample}`);
    expect(mockedRunCommand).not.toHaveBeenCalled();
  });

  it("defaults.yaml が無ければ error（pandoc を実行しない）", async () => {
    vault = await makeTempVault();
    await fs.mkdir(path.join(vault, "Paper"));

    const result = await testPack(fsAccess(), { folder: vault, pack: "Paper" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("defaults.yaml が見つかりません");
    expect(mockedRunCommand).not.toHaveBeenCalled();
  });

  it("sample.md が無ければ error", async () => {
    vault = await makeTempVault();
    const defaults = path.join(vault, "Paper", "defaults.yaml");
    await fs.mkdir(path.dirname(defaults), { recursive: true });
    await fs.writeFile(defaults, "from: markdown\n");

    const result = await testPack(fsAccess(), { folder: vault, pack: "Paper" });

    expect(result.status).toBe("error");
    expect(result.error).toContain("サンプル原稿が見つかりません");
  });

  it("pandoc 成功時は ok", async () => {
    vault = await makeTempVault();
    const defaults = path.join(vault, "Paper", "defaults.yaml");
    const sample = path.join(vault, "Paper", "sample.md");
    await fs.mkdir(path.dirname(defaults), { recursive: true });
    await fs.writeFile(defaults, "from: markdown\n");
    await fs.writeFile(sample, "# Hello\n");
    mockedRunCommand.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    const result = await testPack(fsAccess(), {
      folder: vault,
      pack: "Paper",
      output: path.join(vault, "out.pdf"),
    });

    expect(result.status).toBe("ok");
    expect(mockedRunCommand).toHaveBeenCalledTimes(1);
    expect(mockedRunCommand).toHaveBeenCalledWith(
      "pandoc",
      ["-d", defaults, "-o", path.join(vault, "out.pdf")],
      expect.objectContaining({ cwd: expect.stringContaining("mdtex-test-Paper"), input: "# Hello\n" }),
    );
  });

  it("crossref ラベル重複を result.duplicateLabels に含む", async () => {
    vault = await makeTempVault();
    const defaults = path.join(vault, "Paper", "defaults.yaml");
    const sample = path.join(vault, "Paper", "sample.md");
    await fs.mkdir(path.dirname(defaults), { recursive: true });
    await fs.writeFile(defaults, "from: markdown\n");
    await fs.writeFile(sample, "![[a.png]]{#fig:dup}\n\n![[b.png]]{#fig:dup}\n");
    mockedRunCommand.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    const result = await testPack(fsAccess(), {
      folder: vault,
      pack: "Paper",
      output: path.join(vault, "out.pdf"),
    });

    expect(result.duplicateLabels).toEqual([{ label: "fig:dup", count: 2 }]);
  });
});
