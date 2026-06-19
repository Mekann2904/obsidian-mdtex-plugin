// File: src/services/tempFiles.test.ts
// Purpose: 抽出した一時ファイル lifecycle モジュールの生成・cleanup・安全検査を検証する。
// Reason: createTempFile / cleanupTemporaryFiles / isInsideBaseDir は変換パイプラインの安全性
//         （OS 一時領域外の誤削除防止）を担うため、契約を直接固着しておく。
// Related: src/services/tempFiles.ts, src/services/convertService.ts

import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { TEMP_PREFIXES, createTempFile, cleanupTemporaryFiles, isInsideBaseDir } from "./tempFiles";

describe("createTempFile", () => {
  it("指定 prefix/拡張子で一時ファイルを生成し、内容を書き出す", async () => {
    const artifact = await createTempFile("-- lua body --", "mdtex-lua-", "lua");

    try {
      // tempDir と filePath はともに指定 prefix で始まる
      expect(path.basename(artifact.tempDir).startsWith("mdtex-lua-")).toBe(true);
      expect(path.basename(artifact.filePath).startsWith("mdtex-lua-")).toBe(true);
      // 拡張子が反映されている
      expect(artifact.filePath.endsWith(".lua")).toBe(true);
      // filePath は tempDir 配下にある
      expect(await isInsideBaseDir(artifact.filePath, artifact.tempDir)).toBe(true);
      // 内容が正しく書き込まれている
      const written = await fs.readFile(artifact.filePath, "utf8");
      expect(written).toBe("-- lua body --");
    } finally {
      await fs.rm(artifact.tempDir, { recursive: true, force: true });
    }
  });

  it("OS 一時領域配下に生成される（cleanupTemporaryFiles の削除対象になる）", async () => {
    const artifact = await createTempFile("body", "mdtex-docx-", "lua");
    try {
      expect(await isInsideBaseDir(artifact.tempDir, os.tmpdir())).toBe(true);
    } finally {
      await fs.rm(artifact.tempDir, { recursive: true, force: true });
    }
  });
});

describe("cleanupTemporaryFiles", () => {
  it("空配列・undefined は何もしない（エラーにならない）", async () => {
    await expect(cleanupTemporaryFiles([])).resolves.toBeUndefined();
  });

  it("許可された prefix の一時ファイル/ディレクトリを削除する", async () => {
    const artifact = await createTempFile("x", "mdtex-mermaid-", "lua");
    // 作成直後は存在する
    await expect(fs.stat(artifact.tempDir)).resolves.toBeDefined();

    await cleanupTemporaryFiles([artifact.filePath, artifact.tempDir]);

    // cleanup 後はファイルもディレクトリも消えている
    await expect(fs.stat(artifact.filePath)).rejects.toThrow();
    await expect(fs.stat(artifact.tempDir)).rejects.toThrow();
  });

  it("許可されていない prefix のパスは削除しない（誤削除ガード）", async () => {
    // 一時領域内だが TEMP_PREFIXES に合致しない接頭辞のディレクトリを保護する。
    const dangerousDir = await fs.mkdtemp(path.join(os.tmpdir(), "dangerous-cleanup-test-"));
    try {
      await expect(fs.stat(dangerousDir)).resolves.toBeDefined();

      await cleanupTemporaryFiles([dangerousDir]);

      // prefix ガードにより削除されず残る
      await expect(fs.stat(dangerousDir)).resolves.toBeDefined();
    } finally {
      await fs.rm(dangerousDir, { recursive: true, force: true });
    }
  });

  it("存在しないパス（ENOENT）は警告扱いで黙殺する", async () => {
    const ghost = path.join(os.tmpdir(), "mdtex-lua-ghost-does-not-exist");
    await expect(cleanupTemporaryFiles([ghost])).resolves.toBeUndefined();
  });
});

describe("isInsideBaseDir", () => {
  it("配下のパスは true を返す", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-ibd-parent-"));
    try {
      // 実在する子孫ファイルで検査する（realpath 解決を base 側と一致させる）。
      const child = path.join(parent, "nested.txt");
      await fs.writeFile(child, "x", "utf8");
      expect(await isInsideBaseDir(child, parent)).toBe(true);
      expect(await isInsideBaseDir(parent, parent)).toBe(true);
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  });

  it("配下にないパスは false を返す", async () => {
    const a = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-ibd-a-"));
    const b = await fs.mkdtemp(path.join(os.tmpdir(), "mdtex-ibd-b-"));
    try {
      const fileInA = path.join(a, "file.txt");
      await fs.writeFile(fileInA, "x", "utf8");
      // 同じ階層の別ディレクトリ配下なので包含関係にない
      expect(await isInsideBaseDir(fileInA, b)).toBe(false);
    } finally {
      await fs.rm(a, { recursive: true, force: true });
      await fs.rm(b, { recursive: true, force: true });
    }
  });
});

describe("TEMP_PREFIXES", () => {
  it("各一時ファイル種別の接頭辞を網羅している", () => {
    // 新しい種別を追加したら TEMP_PREFIXES に漏れがないかをこのテストが検知する。
    expect(TEMP_PREFIXES).toContain("mdtex-lua-");
    expect(TEMP_PREFIXES).toContain("mdtex-docx-");
    expect(TEMP_PREFIXES).toContain("mdtex-mermaid-");
    expect(TEMP_PREFIXES).toContain("mdtex-metadata-");
    // 汎用フォールバックも維持する
    expect(TEMP_PREFIXES).toContain("mdtex-");
  });
});
