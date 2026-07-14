// File: src/cli/packScaffold.ts
// Purpose: mdtex pack new の中核。テンプレートパックの土台（defaults.yaml / _mdtex.yaml /
//          sample.md / preamble.tex）を生成する。
// Reason: エージェントが GUI を介さず「新パック作成 → validate → test」のループを完結できる
//          ようにする（cli-for-agents）。純粋なテンプレート生成と I/O（書き込み）を分離し、
//          テスト可能にする（thermo-nuclear review と同じ方針）。
// Related: src/cli/fsTemplatePack.ts, src/cli/commands/pack.ts, src/services/packAccess.ts

import { DEFAULTS_FILE_NAME, MDTEX_META_FILE_NAME } from "../services/templatePackMeta";

export const SAMPLE_FILE_NAME = "sample.md";
const PREAMBLE_FILE_NAME = "preamble.tex";

/** pack new が生成するデフォルトの LaTeX エンジン。 */
export const DEFAULT_SCAFFOLD_ENGINE = "lualatex";

export interface ScaffoldOptions {
  folder: string;
  name: string;
  /** LaTeX エンジン（既定: lualatex）。lualatex / latexmk 等。 */
  engine?: string;
}

export interface ScaffoldFile {
  /** パックフォルダからの相対パス。 */
  relativePath: string;
  content: string;
}

export interface ScaffoldResult {
  ok: boolean;
  /** 生成した（または目標の）パックパス。 */
  packPath: string;
  /** 生成したファイル名（パック内相対）。失敗時は空。 */
  createdFiles: string[];
  /** ユーザー向けメッセージ。 */
  message: string;
}

/** engine に応じた documentclass（lualatex→ltjarticle / latexmk→jsarticle）。純粋。 */
export function documentclassFor(engine: string): string {
  return engine === "latexmk" ? "jsarticle" : "ltjarticle";
}

/** defaults.yaml の内容（純粋）。engine を pdf-engine/documentclass に反映する。 */
export function defaultsYamlFor(engine: string): string {
  return `from: markdown+raw_tex+raw_html+fenced_divs+raw_attribute+fenced_code_attributes
to: pdf
pdf-engine: ${engine}
standalone: true
include-in-header: \${.}/preamble.tex

variables:
  documentclass: ${documentclassFor(engine)}
`;
}

/** _mdtex.yaml の内容（純粋）。title/description/engine のメタを宣言。 */
export function metaYamlFor(name: string, engine: string): string {
  return `# MdTex パック自己記述メタ。defaults.yaml とは分離（Pandoc はこのファイルを読まない）。
title: "${name}"
description: "${name} パック（mdtex pack new で生成・編集して使います）"
engine: ${engine}
requires: []
recommendedProfile:
  citationMode: none
  latexEngine: ${engine}
`;
}

/** sample.md の内容（純粋）。validate/test で即座に PDF 生成できる最小サンプル。 */
export function sampleMdFor(name: string): string {
  return `# ${name}

これは \`mdtex pack new\` で生成されたサンプル原稿です。編集して使います。

## セクション

本文を書きます。

- 箇条書き
- 箇条書き

インライン数式: $E = mc^2$

ディスプレイ数式:

$$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$$

\`\`\`python
print("hello, mdtex")
\`\`\`

| A | B |
|---|---|
| 1 | 2 |
`;
}

/** preamble.tex の内容（純粋）。engine に応じた日本語組版の最小設定を含む。 */
export function preambleTexFor(name: string, engine: string): string {
  if (engine === "latexmk") {
    return `% ${name} のプリアンブル（latexmk / platex 向け）。必要なパッケージを追加してください。
% jsarticle クラスが和文処理を担うため、luatexja は使いません。
\\providecommand{\\passthrough}[1]{#1}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[unicode,hidelinks]{hyperref}
`;
  }
  // lualatex 既定。ltjarticle クラス + luatexja-preset で日本語組版（原ノ味フォント・TeX Live 収録）。
  return `% ${name} のプリアンブル（LuaLaTeX 向け）。必要なパッケージを追加してください。
% ltjarticle クラス + luatexja-preset で日本語組版（原ノ味フォント・TeX Live 収録）。
\\providecommand{\\passthrough}[1]{#1}
\\usepackage[haranoaji]{luatexja-preset}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[unicode,hidelinks]{hyperref}
`;
}

/** pack new が生成するファイル群（純粋）。順序は defaults → _mdtex → sample → preamble。 */
export function buildScaffoldFiles(options: ScaffoldOptions): ScaffoldFile[] {
  const engine = options.engine || DEFAULT_SCAFFOLD_ENGINE;
  return [
    { relativePath: DEFAULTS_FILE_NAME, content: defaultsYamlFor(engine) },
    { relativePath: MDTEX_META_FILE_NAME, content: metaYamlFor(options.name, engine) },
    { relativePath: SAMPLE_FILE_NAME, content: sampleMdFor(options.name) },
    { relativePath: PREAMBLE_FILE_NAME, content: preambleTexFor(options.name, engine) },
  ];
}

/** 書き込みを伴う I/O を抽象化。fs 以外（テスト用 fake）でも差し替え可能。 */
export interface ScaffoldFileAccess {
  exists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<void>;
  writeText(path: string, content: string): Promise<void>;
}

/**
 * パックフォルダに土台を生成する。既にパックが存在する場合は上書きしない（安全）。
 * 例外は投げず、ScaffoldResult に丸める（CLI の exit code 源をここに集中）。
 * パス区切りは "/"（packAccess と同じ。fs は OS 区切りに正規化）。
 */
export async function scaffoldPack(
  access: ScaffoldFileAccess,
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const { folder, name } = options;
  const packPath = folder ? `${folder}/${name}` : name;

  if (!name) {
    return { ok: false, packPath, createdFiles: [], message: "パック名が未指定です。" };
  }

  if (await access.exists(packPath)) {
    return {
      ok: false,
      packPath,
      createdFiles: [],
      message: `パックが既に存在します: ${packPath}（上書きしません）`,
    };
  }

  try {
    await access.ensureDir(packPath);
    const files = buildScaffoldFiles(options);
    for (const f of files) {
      await access.writeText(`${packPath}/${f.relativePath}`, f.content);
    }
    return {
      ok: true,
      packPath,
      createdFiles: files.map(f => f.relativePath),
      message: `パックを生成しました: ${packPath}（${files.map(f => f.relativePath).join(", ")}）`,
    };
  } catch (e) {
    return {
      ok: false,
      packPath,
      createdFiles: [],
      message: `パック生成に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
