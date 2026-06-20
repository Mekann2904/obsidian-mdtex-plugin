// File: src/utils/texPath.ts
// Purpose: GUI アプリ（Obsidian）で process.env.PATH に TeX の bin ディレクトリが
//          含まれない問題を解決する（ADR-009 関連: citation パイプラインで latexmk が
//          lualatex を PATH から探す必要がある）。
// Reason: Obsidian は GUI アプリで launchd/サービス由_, の貧弱な PATH を持つ。TeX 配布は
//          プラットフォームごとに規定配置（macOS:/Library/TeX/texbin, Linux:/usr/local/bin,
//          Windows:C:\texlive\*\bin\windows 等）に置かれるが、これはデフォルト PATH に
//          含まれないことがある。citation パイプラインは latexmk → lualatex と2段階呼び出しする
//          ため、フルパス1つでは解決できず、TeX bin を PATH に追加する必要がある。
// Related: src/utils/texDiscover.ts, src/services/citationPipeline.ts, src/services/convertService.ts

import * as fs from "fs";
import { getTexBinCandidates, expandGlob, defaultTexFsLayer } from "./texDiscover";

/**
 * macOS の標準的な TeX bin 配置先。`/usr/local/texlive/<year>/bin/<arch>` はシンボリックリンクで
 * `/Library/TeX/texbin` に集約されるため、この1パスを PATH に追加すれば全 TeX Live 年度をカバーできる。
 */
const MACOS_TEX_BIN = "/Library/TeX/texbin";

/**
 * macOS の典型的な TeX bin 候補（シンボリックリンクの実体側）。/Library/TeX/texbin が
 * 存在しない環境（手動インストール等）のフォールバック。
 */
const MACOS_TEX_BIN_FALLBACKS = ["/usr/local/texlive/2025/bin/universal-darwin", "/usr/local/texlive/2024/bin/universal-darwin"];

/**
 * 現在の PATH に TeX の bin ディレクトリを追加する（存在する・未登録のものだけ）。
 *
 * 純粋関数版: PATH 文字列と候補ディレクトリの存在判定結果を外から注入でき、テスト可能。
 * 実運用では `augmentPathForTex` が fs.existsSync で判定する。
 *
 * @returns PATH に TeX bin を追加した新しい PATH 文字列。候補が既存または不在なら元のまま。
 */
export function augmentPathString(
  currentPath: string,
  candidates: string[],
  existsFn: (dir: string) => boolean = fs.existsSync,
): string {
  const sep = process.platform === "win32" ? ";" : ":";
  const existing = currentPath.split(sep).map(p => p.trim());
  const toAdd = candidates.filter(dir => dir && existsFn(dir) && !existing.includes(dir));
  if (toAdd.length === 0) return currentPath;
  // 前に置く: ユーザーが意図的に古い TeX を PATH に置いていない限り、標準配置を優先。
  return [...toAdd, ...existing].join(sep);
}

/**
 * プラットフォームの規定配置から TeX bin を PATH に追加する（クロスプラットフォーム）。
 * 既に PATH に含まれる候補は追加しない。
 *
 * 候補は getTexBinCandidates（texDiscover.ts）から取得する。macOS は /Library/TeX/texbin を
 * 最優先、Linux は /usr/local/bin 等、Windows は C:\texlive\*\bin\windows 等。
 * macOS のみ旧来の固定年度フォールバック（MACOS_TEX_BIN_FALLBACKS）も残す。
 *
 * @returns TeX bin を追加した PATH 文字列。元の PATH は保持される。
 */
export function augmentPathForTex(currentPath: string): string {
  const candidates = getTexBinCandidates(process.platform);
  // macOS では固定年度フォールバックも加える（getTexBinCandidates の glob は存在チェック前に
  // 展開されないため、augmentPathString の単純 existsSync で拾えない年度を補う）。
  const all = process.platform === "darwin" ? [MACOS_TEX_BIN, ...MACOS_TEX_BIN_FALLBACKS, ...candidates] : candidates;
  // 重複除去（getTexBinCandidates と MACOS_TEX_BIN が重なるため）。
  const dedup = Array.from(new Set(all));
  // glob（*）を含む候補は実ディレクトリに展開してから PATH に追加する。glob 無しはそのまま。
  const expanded = dedup.flatMap(pattern => expandGlob(pattern, defaultTexFsLayer));
  return augmentPathString(currentPath, expanded);
}

/**
 * 与えられた env をもとに、PATH を TeX 対応した env を返す。Obsidian の process.env を
 * そのまま渡すことを想定。process.env を破壊しないよう浅いコピーを作る。
 *
 * citation パイプライン（runReactiveLatexPhase）と通常の executePandocCommand の両方で
 * 使う。TeX を使うのは PDF エンジン（latexmk/lualatex）の実行なので、format=pdf 時のみ意味を持つが、
 * 常に呼んで副作用は PATH 追加のみで安全。
 */
export function buildTexAwareEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const path = augmentPathForTex(baseEnv.PATH ?? "");
  return { ...baseEnv, PATH: path };
}
