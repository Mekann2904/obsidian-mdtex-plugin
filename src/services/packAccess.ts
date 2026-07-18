// File: src/services/packAccess.ts
// Purpose: テンプレートパックの I/O を抽象化し、vault（GUI）と fs（CLI）で
//          同じロジックを共有する（thermo-nuclear review #1: 重複解消）。
// Reason: これまで listTemplatePacks / readPackMetadata / checkPackRequirements が
//          vault 版（templatePackService）と fs 版（fsTemplatePack）で重複していた。
//          I/O プリミティブだけを PackFileAccess interface に切り出し、ロジックを
//          1つに統一する。obsidian 非依存なので CLI と GUI の両方から使える。
// Related: src/services/templatePackMeta.ts, src/services/templatePackService.ts,
//          src/cli/fsTemplatePack.ts

import {
  DEFAULTS_FILE_NAME,
  isEmptyPackMetadata,
  MDTEX_META_FILE_NAME,
  parsePackMetadata,
  type PackMetadata,
} from "./templatePackMeta";

/**
 * パックファイルへのアクセスを抽象化する（vault / fs の共通契約）。
 *
 * 全メソッドは例外を投げず、失敗時は空配列 / null / false を返す。パス区切りは
 * 常に "/"（vault 内パス表現と互換）。fs 実装は Node が "/" を OS 区切りに正規化する
 * ため Windows でも動く。
 */
export interface PackFileAccess {
  /** フォルダ直下のサブディレクトリ名一覧。フォルダが無い/読めない場合は空配列。 */
  listChildDirs(folder: string): Promise<string[]>;
  /** テキストファイルを読む。読めない場合は null（ファイル無し含む）。 */
  readText(filePath: string): Promise<string | null>;
  /** ファイル/ディレクトリが存在するか。 */
  exists(filePath: string): Promise<boolean>;
}

/** パスを "/" で結合する（vault パス表現と fs の両方で動く）。 */
function joinPath(...segments: string[]): string {
  return segments.join("/");
}

/**
 * テンプレートフォルダ配下のパック一覧を返す（共通ロジック）。
 * パック = defaults.yaml を含む直下のサブフォルダ。結果はフォルダ名でソート。
 */
export async function listPacks(access: PackFileAccess, folder: string): Promise<string[]> {
  if (!folder) return [];
  const dirs = await access.listChildDirs(folder);
  // 各パックの defaults.yaml 存在確認は独立 I/O なので並列化（review #7: 逐次オーケストレーション解消）。
  const checked = await Promise.all(
    dirs.map(async name => ({
      name,
      ok: await access.exists(joinPath(folder, name, DEFAULTS_FILE_NAME)),
    })),
  );
  return checked
    .filter(c => c.ok)
    .map(c => c.name)
    .sort((a, b) => a.localeCompare(b, "ja"));
}

/**
 * パックの defaults.yaml を読み、PackMetadata を返す（共通ロジック）。
 * 読めない・_mdtex: が無い場合は null。
 */
export async function readPackMeta(
  access: PackFileAccess,
  folder: string,
  packName: string,
): Promise<PackMetadata | null> {
  if (!folder || !packName) return null;
  const content = await access.readText(joinPath(folder, packName, MDTEX_META_FILE_NAME));
  if (content === null) return null;
  return parsePackMetadata(content);
}

/**
 * パックが requires に宣言した外部ファイルが配置されているか確認する（共通ロジック）。
 * 不足ファイル名の配列を返す（全て揃っていれば空配列）。
 */
export async function checkRequires(
  access: PackFileAccess,
  folder: string,
  packName: string,
  metadata: PackMetadata | null,
): Promise<string[]> {
  if (!metadata || metadata.requires.length === 0) return [];
  if (!folder || !packName) return [...metadata.requires];
  const missing: string[] = [];
  for (const req of metadata.requires) {
    if (!(await access.exists(joinPath(folder, packName, req)))) {
      missing.push(req);
    }
  }
  return missing;
}

// === パック検証（thermo-nuclear review #2/#3/#4: status モデル + strict 簡素化）===

export type ValidationStatus = "ok" | "warnings" | "errors";

/**
 * パック検証結果。status は exit code / JSON 出力の唯一の源（exit code とのズレを防ぐ）。
 */
export interface PackValidation {
  pack: string;
  status: ValidationStatus;
  defaultsReadable: boolean;
  metadata: PackMetadata | null;
  hasMetadata: boolean;
  missingRequires: string[];
  errors: string[];
  warnings: string[];
}

/**
 * パックの健全性を検証する（共通ロジック）。
 * - defaults.yaml の存在
 * - _mdtex: メタの有無
 * - requires の不足ファイル
 *
 * strict=true のとき警告項目（メタ未宣言・requires 不足）をエラーに昇格する。
 * status は errors/warnings/ok の3値で、CLI の exit code（2/1/0）と1対1に対応する。
 */
export async function validatePack(
  access: PackFileAccess,
  folder: string,
  packName: string,
  strict: boolean,
): Promise<PackValidation> {
  const result: PackValidation = {
    pack: packName,
    status: "ok",
    defaultsReadable: false,
    metadata: null,
    hasMetadata: false,
    missingRequires: [],
    errors: [],
    warnings: [],
  };

  if (!folder || !packName) {
    result.errors.push("テンプレートフォルダまたはパック名が未指定です");
    result.status = "errors";
    return result;
  }

  const defaultsPath = joinPath(folder, packName, DEFAULTS_FILE_NAME);
  if (!(await access.exists(defaultsPath))) {
    result.errors.push(`defaults.yaml が読めません: ${defaultsPath}`);
    result.status = "errors";
    return result;
  }
  result.defaultsReadable = true;

  const metadata = await readPackMeta(access, folder, packName);
  result.metadata = metadata;
  result.hasMetadata = metadata !== null && !isEmptyPackMetadata(metadata);
  result.missingRequires = await checkRequires(access, folder, packName, metadata);

  // 検査項目を集めてから strict で一括振り分け（分岐を1箇所に集約）。
  const findings = [
    !result.hasMetadata && "_mdtex: メタが未宣言（title/description が表示されません）",
    result.missingRequires.length > 0 && `必須ファイル不足: ${result.missingRequires.join(", ")}`,
  ].filter((m): m is string => Boolean(m));

  if (strict) result.errors.push(...findings);
  else result.warnings.push(...findings);

  result.status = result.errors.length > 0 ? "errors" : result.warnings.length > 0 ? "warnings" : "ok";
  return result;
}
