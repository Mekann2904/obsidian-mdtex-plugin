// File: src/services/tempFiles.ts
// Purpose: Pandoc 変換パイプラインで使う一時ファイル（Lua フィルタ / メタデータ等）の
//          生成と片付けを単一の lifecycle 抽象として提供する。
// Reason: これまで mkdtemp + writeFile + cleanup の同一パターンが複数箇所（callout / docx /
//         mermaid 各フィルタと metadata）に重複し、cleanup の prefix allow-list も散在していた
//         （サーモニュークリア・レビュー P0 所見）。生成プリミティブと安全な削除をここ一本化する。
// Related: src/services/convertService.ts, src/utils/pathHelpers.ts

import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import { joinFsPath } from "../utils/pathHelpers";

/**
 * 一時ファイル生成の成果物。
 * Pandoc には `filePath` を渡し、片付け時には `tempDir` ごと再帰削除する。
 */
export interface TempFileArtifact {
  /** 生成した一時ファイルの絶対パス */
  filePath: string;
  /** 一時ファイルを格納した一時ディレクトリの絶対パス（cleanup 単位） */
  tempDir: string;
}

/**
 * cleanup 対象として安全な一時ディレクトリ/ファイルの basename 接頭辞 allow-list。
 * OS の一時領域外や想定外のパスを誤って削除しないためのガード（OS tmpdir 配下 + 接頭辞の二重検査）。
 * 新しい一時ファイル種別を増やす場合は、生成側の prefix をここにも忘れず追加すること。
 */
export const TEMP_PREFIXES = [
  "mdtex-lua-",
  "mdtex-mermaid-",
  "mdtex-docx-",
  "mdtex-metadata-",
  // 汎用フォールバック: 上記以外の "mdtex-" 前一時領域（後方互換の残存ファイル等）も安全対象に含める。
  "mdtex-",
];

/**
 * 一時ディレクトリを `prefix` 付きで生成し、その中に `content` を書き出した一時ファイルを返す。
 * mkdtemp + writeFile + cleanup-on-error を単一パターンに統一したプリミティブ。
 * 書き込み失敗時は生成した一時ディレクトリを片付けてからエラーを再送出する。
 *
 * @param content   ファイルへ書き出す内容
 * @param prefix    一時ディレクトリとファイル名の両方に付与する接頭辞（TEMP_PREFIXES に登録済みのもの）
 * @param extension ファイル拡張子（"lua" や "yaml" など、dot は含めない）
 */
export async function createTempFile(
  content: string,
  prefix: string,
  extension: string,
): Promise<TempFileArtifact> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    const fileName = `${prefix}${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
    const filePath = joinFsPath(tempDir, fileName);
    await fs.writeFile(filePath, content, "utf8");
    return { filePath, tempDir };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: false }).catch(() => {});
    throw error;
  }
}

/**
 * `target` が `base` 配下（同一含む）にあるかを realpath 耐性付きで判定する。
 * シンボリックリンクや OS 差異のセパレータを考慮し、cleanup 前の安全検査として使う。
 */
export async function isInsideBaseDir(target: string, base: string): Promise<boolean> {
  const [realTarget, realBase] = await Promise.all([
    fs.realpath(target).catch(() => path.resolve(target)),
    fs.realpath(base).catch(() => path.resolve(base)),
  ]);

  const normalize = (p: string) => path.resolve(p).replace(/[/\\]+/g, path.sep);
  const t = normalize(realTarget);
  const b = normalize(realBase);

  if (process.platform === "win32") {
    const tl = t.toLowerCase();
    const bl = b.toLowerCase();
    return tl === bl || tl.startsWith(bl + path.sep);
  }

  return t === b || t.startsWith(b + path.sep);
}

/**
 * 変換パイプラインで生成した一時ファイル群を安全に削除する。
 * 各パスは「OS の一時領域配下」かつ「TEMP_PREFIXES のいずれかで始まる basename」の場合のみ削除し、
 * 一時領域外や想定外のパスは保護する。存在しない（ENOENT）は正常系として黙殺する。
 */
export async function cleanupTemporaryFiles(files: string[]): Promise<void> {
  if (!files?.length) return;

  const uniq = Array.from(new Set(files.map(f => path.resolve(f))));
  const tempRoot = path.resolve(os.tmpdir());
  const tempRootReal = await fs.realpath(tempRoot).catch(() => tempRoot);

  await Promise.allSettled(
    uniq.map(async file => {
      try {
        const resolved = path.resolve(file);
        if (!(await isInsideBaseDir(resolved, tempRootReal))) return;
        const base = path.basename(resolved);
        if (!TEMP_PREFIXES.some(p => base.startsWith(p))) return;
        await fs.rm(resolved, { recursive: true, force: false, maxRetries: 2, retryDelay: 100 });
      } catch (err: unknown) {
        const errorObj = err as { code?: string };
        if (errorObj.code !== "ENOENT") {
          console.warn(`Failed to delete temporary file: ${file}`, err);
        }
      }
    }),
  );
}
