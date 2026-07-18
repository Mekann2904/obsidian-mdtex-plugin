// File: src/cli/imageRasterize.test.ts
// Purpose: rasterizePdf の契約（pdftoppm 呼出 → PNG 収集・ページ順ソート・失敗丸め）を検証する。
//          runCommand（子プロセス）と生成ファイルをモック/実 fs で固定する。
// Related: src/cli/imageRasterize.ts, src/cli/convert.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { rasterizePdf } from "./imageRasterize";
import { runCommand } from "../utils/processRunner";

vi.mock("../utils/processRunner", () => ({
  runCommand: vi.fn(),
}));

const mockedRunCommand = runCommand as unknown as ReturnType<typeof vi.fn>;

describe("rasterizePdf", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-rasterize-"));
    mockedRunCommand.mockReset();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("pdftoppm 成功時、生成された PNG をページ順で返す", async () => {
    // pdftoppm が preview-1.png, preview-2.png を生成したと想定
    await fs.writeFile(path.join(dir, "preview-2.png"), "fake2");
    await fs.writeFile(path.join(dir, "preview-1.png"), "fake1");
    mockedRunCommand.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    const result = await rasterizePdf(path.join(dir, "in.pdf"), path.join(dir, "preview"));

    expect(result.ok).toBe(true);
    expect(result.images).toEqual([
      path.join(dir, "preview-1.png"),
      path.join(dir, "preview-2.png"),
    ]);
    expect(mockedRunCommand).toHaveBeenCalledWith(
      "pdftoppm",
      ["-png", "-r", "100", path.join(dir, "in.pdf"), path.join(dir, "preview")],
      { cwd: undefined },
    );
  });

  it("解像度とツールを指定できる", async () => {
    await fs.writeFile(path.join(dir, "out-1.png"), "fake");
    mockedRunCommand.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await rasterizePdf(path.join(dir, "in.pdf"), path.join(dir, "out"), {
      tool: "/usr/local/bin/pdftoppm",
      resolution: 150,
      cwd: dir,
    });

    expect(mockedRunCommand).toHaveBeenCalledWith(
      "/usr/local/bin/pdftoppm",
      ["-png", "-r", "150", path.join(dir, "in.pdf"), path.join(dir, "out")],
      { cwd: dir },
    );
  });

  it("pdftoppm 非ゼロ終了時は ok:false", async () => {
    mockedRunCommand.mockResolvedValue({ stdout: "", stderr: "error", exitCode: 1 });

    const result = await rasterizePdf(path.join(dir, "in.pdf"), path.join(dir, "preview"));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("終了コード 1");
  });

  it("PNG が1つも生成されなければ ok:false", async () => {
    mockedRunCommand.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    const result = await rasterizePdf(path.join(dir, "in.pdf"), path.join(dir, "preview"));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("生成されませんでした");
  });

  it("pdftoppm 起動が reject されたら ok:false に丸める（例外を投げない）", async () => {
    mockedRunCommand.mockRejectedValue(new Error("spawn ENOENT"));

    const result = await rasterizePdf(path.join(dir, "in.pdf"), path.join(dir, "preview"));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("ENOENT");
  });
});
