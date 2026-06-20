// File: src/utils/texDiscover.ts
// Purpose: TeX エンジン（latexmk/lualatex/xelatex/pdflatex）をクロスプラットフォームで探索し、
//          設定 UI の「選択式」を支える。加えて、latexEngine にフルパスが入力された場合の安全網
//          （basename への正規化）を提供する。
// Reason: 従来 latexEngine はテキスト入力1本で、フルパスを入れると年度更新で壊れる脆弱性があった。
//          また texPath.ts の PATH 解決は macOS 専用だった。ユーザー要望「自動探索＋選択式＋
//          フルパスも入力可能」を実現するため、(1) 発見、(2) 正規化、(3) 候補生成を分離し、
//          それぞれ fs 依存を注入可能な形で純粋化してテストする（ADR-009 関連）。
// Related: src/utils/texPath.ts, src/services/citationPipeline.ts, src/services/pandocCommandBuilder.ts,
//          src/MdTexPluginSettingTab.ts

import * as fs from "fs";

/** 探索対象の TeX エンジン名（basename）。表示・実行の正規形。 */
export const TEX_ENGINE_NAMES = ["latexmk", "lualatex", "xelatex", "pdflatex"] as const;

/**
 * latexEngine 設定値を正規形（basename）にする安全網。ユーザーがドロップダウンで選んでも
 * フルパスを手入力しても、実行時は常に basename＋PATH 解決で動くようにする。
 *
 * - `/usr/local/texlive/2025/bin/universal-darwin/lualatex` → `lualatex`
 * - `C:\texlive\2024\bin\windows\latexmk.exe`               → `latexmk`
 * - `lualatex`                                              → `lualatex`
 *
 * 年度更新で実体パスが消滅しても、basename が PATH 上にあれば動き続ける。
 * 純粋関数（fs/OS 非依存）。
 */
export function normalizeLatexEngine(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  // バックスラッシュをスラッシュに正規化して Windows/POSIX 両対応の basename を得る。
  const lastSep = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const base = lastSep >= 0 ? trimmed.slice(lastSep + 1) : trimmed;
  // Windows の .exe 拡張子を除去。.bat 等は想定しない（TeX 配布は .exe）。
  return base.replace(/\.exe$/i, "");
}

/**
 * ファイルシステム依存操作を外から注入するための薄い抽象。テストでモック可能にする。
 */
export interface TexFsLayer {
  existsSync: (path: string) => boolean;
  readdirSync: (path: string) => string[];
}

/** 実運用用の既定 fs レイヤー。 */
export const defaultTexFsLayer: TexFsLayer = {
  existsSync: fs.existsSync,
  readdirSync: (p: string) => fs.readdirSync(p),
};

/** 探索結果の1件。engine は basename、binPath は実ファイルパス、dir は配置ディレクトリ。 */
export interface DiscoveredEngine {
  engine: string;
  binPath: string;
  dir: string;
}

/**
 * プラットフォーム別の TeX bin 候補ディレクトリを返す（純粋関数）。`*` を含むパスは glob で、
 * discoverTexEngines が展開する。
 *
 * macOS: `/Library/TeX/texbin`（全年度の集約シンボリックリンク）を最優先。
 * Linux: ディストリ配布（/usr/local/bin, /usr/bin）と TeX Live 公式配置の両方。
 * Windows: TeX Live の規定配置と MiKTeX の規定配置。
 */
export function getTexBinCandidates(platform: NodeJS.Platform): string[] {
  switch (platform) {
    case "darwin":
      return ["/Library/TeX/texbin", "/usr/local/texlive/*/bin/universal-darwin"];
    case "linux":
      return ["/usr/local/bin", "/usr/bin", "/usr/local/texlive/*/bin/x86_64-linux", "/opt/texlive/*/bin/x86_64-linux"];
    case "win32":
      return ["C:\\texlive\\*\\bin\\windows", "%LOCALAPPDATA%\\Programs\\MiKTeX\\miktex\\bin\\x64"];
    default:
      return [];
  }
}

/**
 * glob（単一の `*`）を含むパスを展開する。`*` が無ければ存在チェックのみ。
 * 区切り文字（`/` と `\`）両方に対応し、Windows パスでも動く。
 * 純粋関数（fs 操作は fsLayer 経由）。
 */
export function expandGlob(pattern: string, fsLayer: TexFsLayer): string[] {
  if (!pattern.includes("*")) {
    return fsLayer.existsSync(pattern) ? [pattern] : [];
  }
  const sep = pattern.includes("\\") ? "\\" : "/";
  const starIdx = pattern.indexOf("*");
  const parent = pattern.slice(0, starIdx).replace(/[\\/]+$/, "");
  const rest = pattern.slice(starIdx + 1);
  if (!parent || !fsLayer.existsSync(parent)) return [];
  let entries: string[];
  try {
    entries = fsLayer.readdirSync(parent);
  } catch {
    return [];
  }
  return entries
    .map(entry => parent + sep + entry + rest)
    .filter(p => fsLayer.existsSync(p));
}

/**
 * TeX エンジンを探索する。候補ディレクトリ（getTexBinCandidates）と PATH 上のディレクトリを
 * 両方走査し、見つかったエンジン（basename）ごとに {engine, binPath, dir} を返す。
 *
 * 重複（同一 binPath）は除去するが、同一 engine で別ディレクトリ（別バージョン）は別件として
 * 全て残す。ユーザーがドロップダウンで選べるようにするため。
 * 純粋関数（fs 操作は fsLayer 経由、platform/pathEnv も外から注入）。
 */
export function discoverTexEngines(
  platform: NodeJS.Platform,
  pathEnv: string,
  fsLayer: TexFsLayer = defaultTexFsLayer,
): DiscoveredEngine[] {
  const results: DiscoveredEngine[] = [];
  const seen = new Set<string>();
  const sep = platform === "win32" ? ";" : ":";
  const exeExt = platform === "win32" ? ".exe" : "";

  const candidateDirs = getTexBinCandidates(platform);
  const pathDirs = (pathEnv ?? "")
    .split(sep)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  // 候補（規定配置）を優先し、その後に PATH 上を走査。
  const allDirPatterns = [...candidateDirs, ...pathDirs];

  for (const dirPattern of allDirPatterns) {
    for (const dir of expandGlob(dirPattern, fsLayer)) {
      for (const engine of TEX_ENGINE_NAMES) {
        const binPath = dir + (dir.includes("\\") ? "\\" : "/") + engine + exeExt;
        if (fsLayer.existsSync(binPath)) {
          const key = binPath;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({ engine, binPath, dir });
        }
      }
    }
  }
  return results;
}
