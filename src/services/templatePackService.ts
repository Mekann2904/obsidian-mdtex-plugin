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

// === パック自己記述メタ（ADR-008 拡張）============================================
// defaults.yaml の `_mdtex:` セクションから、パックの説明・前提ファイル・推奨プロファイル
// 設定を読む。Pandoc は未知キーを無視するため、defaults.yaml に MdTex 専用メタを安全に
// 埋め込める。設定UI でパック選択時にこのメタを表示し、requires の不足を警告し、
// recommendedProfile の適用を提案する。

/**
 * テンプレートパックが推奨するプロファイル設定。学会論文パック等が「citation 三点セット」
 * （latexEngine / pdfEngineOpts / citationMode）を宣言し、設定UI の「推奨を適用」で反映する。
 */
export interface PackRecommendedProfile {
  citationMode?: "none" | "natbib" | "citeproc";
  latexEngine?: string;
  pdfEngineOpts?: string;
}

/**
 * テンプレートパックの自己記述メタ（ADR-008 拡張）。
 *
 * defaults.yaml の `_mdtex:` セクションから読む。title/description はドロップダウン表示、
 * requires は不足警告、recommendedProfile は「推奨設定を適用」ボタンの源。
 */
export interface PackMetadata {
  /** ドロップダウン表示名。未指定時はフォルダ名を使う。 */
  title?: string;
  /** 一行説明。用途・想定エンジン等。 */
  description?: string;
  /** 想定 PDF エンジン（lualatex / latexmk 等）。表示専用。 */
  engine?: string;
  /** ユーザー配置が必要な外部ファイル（ipsj.cls 等）。不足時に警告。 */
  requires: string[];
  /** パックが推奨する citation/latexEngine/pdfEngineOpts。 */
  recommendedProfile: PackRecommendedProfile;
}

/** メタが空（requires/recommendedProfile 以外に何も宣言されていない）か。 */
export function isEmptyPackMetadata(meta: PackMetadata | null): boolean {
  if (!meta) return true;
  return (
    !meta.title &&
    !meta.description &&
    !meta.engine &&
    meta.requires.length === 0 &&
    meta.recommendedProfile.citationMode === undefined &&
    !meta.recommendedProfile.latexEngine &&
    !meta.recommendedProfile.pdfEngineOpts
  );
}

/**
 * defaults.yaml の `_mdtex:` セクションを最小 YAML パーサで読み、PackMetadata を返す。
 *
 * 依存関係に YAML パーサ（js-yaml）を足して main.js を肥大化させるのを避けるため、
 * `_mdtex:` 配下の限定構造（スカラー / 配列 / 1レベルネストの recommendedProfile）を
 * 行ベースでパースする。Pandoc は `_mdtex:` を未知キーとして無視するので、defaults.yaml
 * の正当性に影響しない。未知キー・不正値は無視し、例外は投げない。
 *
 * @returns メタ。`_mdtex:` セクションが無い場合は null。
 */
export function parsePackMetadata(defaultsYaml: string): PackMetadata | null {
  if (!defaultsYaml) return null;
  const lines = defaultsYaml.split(/\r?\n/);

  // `_mdtex:` の開始行（トップレベル・インデント0）を見つける。
  const startIdx = lines.findIndex(line => /^_mdtex:\s*$/.test(line));
  if (startIdx < 0) return null;

  // _mdtex: 配下のインデントされたブロックを抜く。インデント0 の非空行（別のトップレベル
  // キー）が現れた時点でブロック終了。空行はブロック内の区切りとして保持。
  const block: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      block.push(line);
      continue;
    }
    if (/^\S/.test(line)) break;
    block.push(line);
  }

  const meta: PackMetadata = { requires: [], recommendedProfile: {} };
  let i = 0;
  while (i < block.length) {
    const raw = block[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!match) {
      i++;
      continue;
    }
    const [, key, inline] = match;

    if (inline !== "") {
      // インライン値（スカラー）。requires: [] のような空配列リテラルは無視して空配列維持。
      if (key !== "requires" && key !== "recommendedProfile") {
        setPackMetaScalar(meta, key, unquoteYaml(inline));
      }
      i++;
      continue;
    }

    // ブロック値: 配列（requires）or ネストオブジェクト（recommendedProfile）。
    // baseIndent より深いインデントの行を子として集める。
    const baseIndent = indentWidth(raw);
    const children: string[] = [];
    let j = i + 1;
    while (j < block.length) {
      const child = block[j];
      if (child.trim() === "") {
        j++;
        continue;
      }
      if (indentWidth(child) <= baseIndent) break;
      children.push(child);
      j++;
    }

    if (key === "requires") {
      for (const c of children) {
        const item = c.trim().replace(/^-\s+/, "").trim();
        if (item) meta.requires.push(unquoteYaml(item));
      }
    } else if (key === "recommendedProfile") {
      for (const c of children) {
        const cm = c.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
        if (!cm) continue;
        const [, ck, cv] = cm;
        if (ck === "citationMode") {
          const v = unquoteYaml(cv);
          if (v === "none" || v === "natbib" || v === "citeproc") {
            meta.recommendedProfile.citationMode = v;
          }
        } else if (ck === "latexEngine") {
          meta.recommendedProfile.latexEngine = unquoteYaml(cv);
        } else if (ck === "pdfEngineOpts") {
          meta.recommendedProfile.pdfEngineOpts = unquoteYaml(cv);
        }
      }
    }
    i = j;
  }
  return meta;
}

function setPackMetaScalar(meta: PackMetadata, key: string, value: string): void {
  if (key === "title") meta.title = value;
  else if (key === "description") meta.description = value;
  else if (key === "engine") meta.engine = value;
  // 未知キーは無視（将来拡張を壊さない）
}

/** YAML のダブル/シングルクォートを剥がす。クォート無しはそのまま。 */
function unquoteYaml(s: string): string {
  const trimmed = s.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** 行頭のスペース数を返す（タブは展開しない; `_mdtex:` ブロックはスペースインデントを前提）。 */
function indentWidth(line: string): number {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

/**
 * テンプレートパックの defaults.yaml を vault から読み、PackMetadata を返す。
 * defaults.yaml が読めない・`_mdtex:` が無い場合は null。
 */
export async function readPackMetadata(
  app: App,
  templateFolder: string,
  packName: string,
): Promise<PackMetadata | null> {
  const folder = normalizeTemplateFolder(templateFolder);
  if (!folder || !packName) return null;
  const defaultsPath = [folder, packName, DEFAULTS_FILE_NAME].join("/");
  const file = app.vault.getAbstractFileByPath(defaultsPath);
  if (!(file instanceof TFile)) return null;
  const content = await app.vault.read(file);
  return parsePackMetadata(content);
}

/**
 * パックが requires に宣言した外部ファイル（ipsj.cls 等）がパックフォルダに配置されているか
 * 確認する。不足ファイル名の配列を返す（全て揃っていれば空配列）。フォルダ/パック名が
 * 解決できない場合は requires 全体を不足扱いで返す。
 */
export async function checkPackRequirements(
  app: App,
  templateFolder: string,
  packName: string,
  metadata: PackMetadata | null,
): Promise<string[]> {
  if (!metadata || metadata.requires.length === 0) return [];
  const folder = normalizeTemplateFolder(templateFolder);
  if (!folder || !packName) return [...metadata.requires];
  const missing: string[] = [];
  for (const req of metadata.requires) {
    const reqPath = [folder, packName, req].join("/");
    if (!app.vault.getAbstractFileByPath(reqPath)) {
      missing.push(req);
    }
  }
  return missing;
}
