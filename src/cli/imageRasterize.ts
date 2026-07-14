// File: src/cli/imageRasterize.ts
// Purpose: PDF を PNG 画像に変換する（pdftoppm 経由）。--format png の中核。
// Reason: vision 対応 LLM エージェントが組版結果（レイアウト崩れ・フォント・日本語描画）を
//          視覚的にフィードバックできるようにする。pandoc は PNG writer を持たないため、
//          PDF 生成後に pdftoppm（poppler）で画像化する post-process とする。
// Related: src/cli/convert.ts（--format png）, src/utils/binDiscover.ts（pdftoppm 発見）

import * as fs from "fs/promises";
import * as path from "path";
import { runCommand } from "../utils/processRunner";

export interface RasterizeOptions {
  /** pdftoppm バイナリ（既定: pdftoppm）。 */
  tool?: string;
  /** 解像度 DPI（既定: 100）。 */
  resolution?: number;
  /** runCommand の cwd。 */
  cwd?: string;
}

export interface RasterizeResult {
  ok: boolean;
  /** 生成した PNG の絶対パス一覧（ページ順）。失敗時は空。 */
  images: string[];
  /** エラーメッセージ。 */
  error?: string;
}

/**
 * PDF を PNG 画像に変換する（`pdftoppm -png -r <dpi> <pdf> <outputPrefix>`）。
 * pdftoppm は `<outputPrefix>-1.png`, `<outputPrefix>-2.png`, ... を生成する（ページ順）。
 * 1 ページでも `-1` が付く。例外は投げず RasterizeResult に丸める。
 *
 * 生成ファイルは pdftoppm の命名規則（prefix-N.png）に従い、readdir で収集してページ番号順にソートする。
 */
export async function rasterizePdf(
  pdfPath: string,
  outputPrefix: string,
  opts: RasterizeOptions = {},
): Promise<RasterizeResult> {
  const tool = opts.tool ?? "pdftoppm";
  const dpi = opts.resolution ?? 100;
  const args = ["-png", "-r", String(dpi), pdfPath, outputPrefix];

  try {
    const res = await runCommand(tool, args, { cwd: opts.cwd });
    if (res.exitCode !== 0) {
      return {
        ok: false,
        images: [],
        error: `pdftoppm が終了コード ${res.exitCode} で失敗しました`,
      };
    }
    // pdftoppm は outputPrefix-N.png を生成。readdir で収集しページ番号順にソート。
    const dir = path.dirname(outputPrefix);
    const base = path.basename(outputPrefix);
    const entries = await fs.readdir(dir);
    const images = entries
      .filter(name => name.startsWith(base + "-") && name.endsWith(".png"))
      .sort((a, b) => {
        const na = parseInt(/-(\d+)\.png$/.exec(a)?.[1] ?? "0", 10);
        const nb = parseInt(/-(\d+)\.png$/.exec(b)?.[1] ?? "0", 10);
        return na - nb;
      })
      .map(name => path.join(dir, name));

    if (images.length === 0) {
      return { ok: false, images: [], error: "PNG が生成されませんでした（PDF が空の可能性）" };
    }
    return { ok: true, images };
  } catch (e) {
    return {
      ok: false,
      images: [],
      error: `pdftoppm の実行に失敗: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
