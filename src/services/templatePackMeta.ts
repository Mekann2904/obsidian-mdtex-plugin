// File: src/services/templatePackMeta.ts
// Purpose: テンプレートパックの純粋関数・型（ADR-008 拡張）。Obsidian に依存しない。
// Reason: CLI（src/cli/）が obsidian や sampleTemplatePacks（.md/.tex loader 必要）に
//          触れずにパックメタを扱えるよう、純粋関数だけを切り出す。vault I/O を伴う
//          関数は templatePackService.ts（GUI 用）に残す。
// Related: src/services/templatePackService.ts, src/cli/fsTemplatePack.ts

import { parseDocument } from "yaml";

/**
 * defaults file の標準ファイル名。テンプレートパックの入口（Pandoc が読む）。
 */
export const DEFAULTS_FILE_NAME = "defaults.yaml";

/**
 * パック自己記述メタファイルの標準ファイル名。MdTex が読み、Pandoc は読まない。
 * defaults.yaml とは分離する（defaults file は厳密スキーマで未知キーを拒否するため）。
 */
export const MDTEX_META_FILE_NAME = "_mdtex.yaml";

/**
 * テンプレートフォルダを正規化する。前後の空白と前後のスラッシュを除去し、
 * 区切りを OS 依存のパス区切りではなく常に "/" にする（vault 内パス表現）。
 */
export function normalizeTemplateFolder(folder: string): string {
  return (folder ?? "").trim().replace(/^\/+|\/+$/g, "");
}

// === パック自己記述メタ（ADR-008 拡張）============================================
// _mdtex.yaml（パック自己記述メタファイル）から、パックの説明・前提ファイル・推奨プロファイル
// 設定を読む。defaults.yaml とは分離する（defaults file は厳密スキーマで未知キーを拒否する
// ため、_mdtex: を defaults.yaml に書くと Pandoc がエラーになる）。設定UI でパック選択時に
// このメタを表示し、requires の不足を警告し、recommendedProfile の適用を提案する。

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
 * _mdtex.yaml から読む。title/description はドロップダウン表示、requires は不足警告、
 * recommendedProfile は「推奨設定を適用」ボタンの源。
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
 * _mdtex.yaml を YAML として読み、PackMetadata を返す。
 *
 * 以前は限定構造だけを行ベースで読む独自パーサだったが、ユーザーが書く `_mdtex.yaml`
 * を「YAML っぽい別言語」にしないため、実 YAML パーサをこの境界で使う。
 * 未知キー・不正値は無視し、例外は投げない。
 *
 * 後方互換: 万一 `_mdtex:` ラッパー（旧 defaults.yaml 埋め込み方式）がある場合は、
 * その配下のオブジェクトを扱う。
 *
 * @returns メタ。空の場合は null。
 */
export function parsePackMetadata(metaYaml: string): PackMetadata | null {
  if (!metaYaml) return null;

  const parsed = parseYamlObject(metaYaml);
  if (!parsed) return null;
  const source = isRecord(parsed._mdtex) ? parsed._mdtex : parsed;

  const meta: PackMetadata = { requires: [], recommendedProfile: {} };
  if (typeof source.title === "string") meta.title = source.title;
  if (typeof source.description === "string") meta.description = source.description;
  if (typeof source.engine === "string") meta.engine = source.engine;
  if (Array.isArray(source.requires)) {
    meta.requires = source.requires.filter((v): v is string => typeof v === "string");
  }

  if (isRecord(source.recommendedProfile)) {
    const rec = source.recommendedProfile;
    if (
      rec.citationMode === "none" ||
      rec.citationMode === "natbib" ||
      rec.citationMode === "citeproc"
    ) {
      meta.recommendedProfile.citationMode = rec.citationMode;
    }
    if (typeof rec.latexEngine === "string") meta.recommendedProfile.latexEngine = rec.latexEngine;
    if (typeof rec.pdfEngineOpts === "string") meta.recommendedProfile.pdfEngineOpts = rec.pdfEngineOpts;
  }

  return meta;
}

function parseYamlObject(src: string): Record<string, unknown> | null {
  try {
    const doc = parseDocument(src);
    if (doc.errors.length > 0) return null;
    const value = doc.toJS({}) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
