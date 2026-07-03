// File: src/cli/fsTemplatePack.ts
// Purpose: テンプレートパックの fs 版 thin wrapper（CLI 専用）。共通ロジックは
//          packAccess に集約し、ここは fs 版 PackFileAccess アダプタとラッパのみ。
// Reason: review #1 で vault 版（templatePackService）と fs 版の重複を解消。ロジックは
//          packAccess.listPacks/readPackMeta/checkRequires/validatePack に1つ。
// Related: src/services/packAccess.ts, src/services/templatePackMeta.ts, src/cli/index.ts

import * as fs from "fs/promises";
import {
  checkRequires,
  listPacks,
  readPackMeta,
  validatePack,
  type PackFileAccess,
  type PackValidation,
} from "../services/packAccess";
import type { PackMetadata } from "../services/templatePackMeta";

/**
 * Node fs を PackFileAccess に適応させる（CLI 版）。共通ロジック（packAccess）と
 * fs I/O を繋ぐ薄いアダプタ。パスは "/" 区切り（Node が OS 区切りに正規化）。
 */
const fsAccess: PackFileAccess = {
  async listChildDirs(folder) {
    try {
      const entries = await fs.readdir(folder, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch {
      return [];
    }
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

/** CLI は絶対パスも扱うため、normalizeTemplateFolder（vault 相対）ではなく trim のみ。 */
const norm = (folder: string): string => (folder ?? "").trim();

export async function listTemplatePacksFs(templateFolder: string): Promise<string[]> {
  return listPacks(fsAccess, norm(templateFolder));
}

export async function readPackMetadataFs(
  templateFolder: string,
  packName: string,
): Promise<PackMetadata | null> {
  return readPackMeta(fsAccess, norm(templateFolder), packName);
}

export async function checkPackRequirementsFs(
  templateFolder: string,
  packName: string,
  metadata: PackMetadata | null,
): Promise<string[]> {
  return checkRequires(fsAccess, norm(templateFolder), packName, metadata);
}

export async function validatePackFs(
  templateFolder: string,
  packName: string,
  strict: boolean,
): Promise<PackValidation> {
  return validatePack(fsAccess, norm(templateFolder), packName, strict);
}
