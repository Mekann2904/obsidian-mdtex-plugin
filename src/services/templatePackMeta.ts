// File: src/services/templatePackMeta.ts
// Purpose: テンプレートパックの純粋関数・型（ADR-008 拡張）。Obsidian に依存しない。
// Reason: CLI（src/cli/）が obsidian や sampleTemplatePacks（.md/.tex loader 必要）に
//          触れずにパックメタを扱えるよう、純粋関数だけを切り出す。vault I/O を伴う
//          関数は templatePackService.ts（GUI 用）に残す。
// Related: src/services/templatePackService.ts, src/cli/fsTemplatePack.ts

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
 * _mdtex.yaml を最小 YAML パーサで読み、PackMetadata を返す。
 *
 * 依存関係に YAML パーサ（js-yaml）を足してバンドルを肥大化させるのを避けるため、
 * 限定構造（スカラー / 配列 / 1レベルネストの recommendedProfile）を行ベースでパースする。
 * 未知キー・不正値は無視し、例外は投げない。
 *
 * 後方互換: 万一 `_mdtex:` ラッパー（旧 defaults.yaml 埋め込み方式）がある場合は、
 * その配下のブロックを抜いて扱う。
 *
 * @returns メタ。空の場合は null。
 */
export function parsePackMetadata(metaYaml: string): PackMetadata | null {
  if (!metaYaml) return null;
  const lines = metaYaml.split(/\r?\n/);

  // 後方互換: `_mdtex:` ラッパーがあればその配下を抜く。無ければ全体をパース。
  const wrappedIdx = lines.findIndex(line => /^_mdtex:\s*$/.test(line));
  const block: string[] =
    wrappedIdx >= 0 ? extractMdtexBlock(lines, wrappedIdx) : lines;

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

/** `_mdtex:` ラッパー（旧方式）の配下ブロックを抜く。後方互換用。 */
function extractMdtexBlock(lines: string[], startIdx: number): string[] {
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
  return block;
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
