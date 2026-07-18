// File: src/utils/texPath.ts
// Purpose: GUI アプリ（Obsidian）で process.env.PATH に TeX の bin ディレクトリが
//          含まれない問題を解決する（ADR-009 関連: citation パイプラインで latexmk が
//          lualatex を PATH から探す必要がある）。
// Reason: Obsidian は GUI アプリで launchd/サービス由来の貧弱な PATH を持つ。TeX 配布は
//          プラットフォームごとに規定配置（macOS:/Library/TeX/texbin, Linux:/usr/local/bin,
//          Windows:C:\texlive\*\bin\windows 等）に置かれるが、これはデフォルト PATH に
//          含まれないことがある。citation パイプラインは latexmk → lualatex と2段階呼び出しする
//          ため、フルパス1つでは解決できず、TeX bin を PATH に追加する必要がある。
// Related: src/utils/binDiscover.ts, src/services/citationPipeline.ts, src/services/convertService.ts

import * as fs from "fs";
import { getTexBinCandidates, expandGlob, defaultBinFsLayer } from "./binDiscover";

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
 * 候補ディレクトリの真理源は `getTexBinCandidates`（binDiscover.ts）の1箇所。glob を含む候補
 * （例: TeX Live 年度ディレクトリ `/usr/local/texlive/2025/bin/universal-darwin`）は `expandGlob` で実在
 * ディレクトリに展開してから PATH に追加する。実行用（PATH 追加）と UI 用（エンジン列挙:
 * discoverTexEngines）で bin リストが二重化されない。
 *
 * @returns TeX bin を追加した PATH 文字列。元の PATH は保持される。
 */
export function augmentPathForTex(currentPath: string): string {
  const candidates = getTexBinCandidates(process.platform).flatMap(pattern =>
    expandGlob(pattern, defaultBinFsLayer),
  );
  return augmentPathString(currentPath, candidates);
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
