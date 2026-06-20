// File: src/services/templatePackService.ts
// Purpose: テンプレートフォルダの走査・テンプレートパック認識・defaults file 解決・
//          サンプルパックの初回展開（scaffold）を行う（ADR-008）。
// Reason: テンプレートパック管理の副作用（vault I/O）を UI / command builder から
//          切り離し、テストと保守を容易にするため。
// Related: src/MdTexPluginSettingTab.ts, src/services/pandocCommandBuilder.ts,
//          src/MdTexPluginSettings.ts, src/assets/sampleTemplatePacks.ts

import { App, TFile, TFolder } from "obsidian";
import { ProfileSettings } from "../MdTexPluginSettings";
import {
  SAMPLE_TEMPLATE_PACKS,
  SampleTemplatePack,
  TEMPLATE_DOC_FILES,
} from "../assets/sampleTemplatePacks";

/**
 * defaults file の標準ファイル名。テンプレートパックの入口。
 */
const DEFAULTS_FILE_NAME = "defaults.yaml";

/**
 * テンプレートフォルダを正規化する。前後の空白と前後のスラッシュを除去し、
 * 区切りを OS 依存のパス区切りではなく常に "/" にする（vault 内パス表現）。
 */
export function normalizeTemplateFolder(folder: string): string {
  return (folder ?? "").trim().replace(/^\/+|\/+$/g, "");
}

/**
 * テンプレートフォルダ配下のテンプレートパック一覧を取得する。
 *
 * テンプレートパック = テンプレートフォルダ直下の、`defaults.yaml` を含むサブフォルダ。
 * 結果はフォルダ名（＝パック名）でソートして返す。テンプレートフォルダが未設定・
 * 存在しない場合は空配列を返す（例外は投げない）。
 */
export async function listTemplatePacks(
  app: App,
  templateFolder: string,
): Promise<string[]> {
  const folderPath = normalizeTemplateFolder(templateFolder);
  if (!folderPath) return [];

  const folder = app.vault.getAbstractFileByPath(folderPath);
  if (!(folder instanceof TFolder)) return [];

  const packs: string[] = [];
  for (const child of folder.children ?? []) {
    if (!(child instanceof TFolder)) continue;
    if (await folderContainsDefaultsFile(app, child)) {
      packs.push(child.name);
    }
  }
  return packs.sort((a, b) => a.localeCompare(b, "ja"));
}

async function folderContainsDefaultsFile(app: App, folder: TFolder): Promise<boolean> {
  for (const child of folder.children ?? []) {
    if (child instanceof TFile && child.name === DEFAULTS_FILE_NAME) {
      return true;
    }
  }
  return false;
}

/**
 * プロファイルの現在の設定から、実際に Pandoc に渡す defaults file の vault パスを解決する。
 *
 * 解決経路:
 *  - `defaultsSelection === "pack"` の場合、`templateFolder/<selectedTemplatePack>/defaults.yaml`。
 *    選択中パックが空、またはフォルダが存在しない場合は空文字列（呼び出し側で `-d` を省略）。
 *  - `defaultsSelection === "custom"` の場合、`defaultsFilePath`（絶対/相対パス）をそのまま返す。
 *
 * この関数は純粋なパス計算のみを行い、ファイルの存在確認はしない。存在確認が必要な
 * 場合は呼び出し側で adapter.exists 等で行う。
 */
export function resolveDefaultsFilePath(profile: ProfileSettings): string {
  if (profile.defaultsSelection === "custom") {
    return profile.defaultsFilePath?.trim() ?? "";
  }

  const folder = normalizeTemplateFolder(profile.templateFolder);
  const pack = profile.selectedTemplatePack?.trim();
  if (!folder || !pack) return "";

  return [folder, pack, DEFAULTS_FILE_NAME].join("/");
}

/**
 * サンプルテンプレートパックをテンプレートフォルダへ展開する（初回 scaffold, ADR-008）。
 *
 * 「存在しない場合だけ作る」を徹底する。既存ファイル・フォルダは一切上書きしない。
 * ユーザーがサンプルを編集・削除しても、この関数がそれを元に戻すことはない。
 *
 * @returns 新規作成したパック名の配列（テスト・通知用）。全パックが既存の場合は空配列。
 */
export async function scaffoldSampleTemplatePacks(
  app: App,
  templateFolder: string,
): Promise<string[]> {
  const folderPath = normalizeTemplateFolder(templateFolder);
  if (!folderPath) return [];

  await ensureFolder(app, folderPath);

  const created: string[] = [];
  for (const pack of SAMPLE_TEMPLATE_PACKS) {
    const createdNow = await scaffoldSinglePack(app, folderPath, pack);
    if (createdNow) created.push(pack.name);
  }
  return created;
}

/**
 * テンプレートフォルダ直下のガイド文書（SKILL.md / README.md）を展開する。
 *
 * `TEMPLATE_DOC_FILES`（パック自作ガイド・使い方ガイド）をテンプレートフォルダ直下に
 * 配置する。パック（defaults.yaml を含むサブフォルダ）とは違い、これらは直下のファイル
 * でパック扱いされない。sampleTemplatePacks と同じく「存在しない場合だけ作る」原則で、
 * ユーザーが編集したドキュメントを決して上書きしない（ADR-008）。
 *
 * ※新バージョンでガイドを更新しても、既存ユーザーには届かない（上書きしない原則）。
 *   最新版はプラグインリポジトリの `src/assets/templateDocs/` を参照。
 */
export async function scaffoldTemplateDocs(
  app: App,
  templateFolder: string,
): Promise<void> {
  const folderPath = normalizeTemplateFolder(templateFolder);
  if (!folderPath) return;

  await ensureFolder(app, folderPath);

  for (const file of TEMPLATE_DOC_FILES) {
    const filePath = [folderPath, file.name].join("/");
    await createIfMissing(app, filePath, file.content);
  }
}

async function scaffoldSinglePack(
  app: App,
  baseFolder: string,
  pack: SampleTemplatePack,
): Promise<boolean> {
  const packFolder = [baseFolder, pack.name].join("/");
  // フォルダが既に存在する（= 展開済み、またはユーザー作成）場合はスキップ。
  if (app.vault.getAbstractFileByPath(packFolder) instanceof TFolder) {
    return false;
  }

  await ensureFolder(app, packFolder);
  let anyCreated = false;
  for (const file of pack.files) {
    const filePath = [packFolder, file.name].join("/");
    const created = await createIfMissing(app, filePath, file.content);
    if (created) anyCreated = true;
  }
  // anyCreated が false になることは実質ない（フォルダ自体が無かったため）が、
  // 念のためファイルが1つでも作れた場合のみ「作成した」とみなす。
  return anyCreated;
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  // ネスト対応: 存在しない親フォルダがあれば順に作る。
  const segments = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const seg of segments) {
    current = current ? `${current}/${seg}` : seg;
    const existing = app.vault.getAbstractFileByPath(current);
    if (!existing) {
      await app.vault.createFolder(current);
    } else if (!(existing instanceof TFolder)) {
      // 同名のファイルが存在する場合は矛盾状態。作成は諦めて呼び出し側に委ねる。
      return;
    }
  }
}

/**
 * ファイルが存在しない場合だけ作成する（ADR-008 の「上書きしない」原則）。
 * ユーザーが編集・削除したファイルを決して上書きしない。
 * @returns 新規作成したか。
 */
async function createIfMissing(app: App, filePath: string, content: string): Promise<boolean> {
  if (app.vault.getAbstractFileByPath(filePath)) return false;
  await app.vault.create(filePath, content);
  return true;
}
