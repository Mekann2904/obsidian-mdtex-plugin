// File: src/utils/binDiscover.ts
// Purpose: 外部バイナリ（TeX エンジン・pandoc 等）をクロスプラットフォームで探索し、
//          設定 UI の「選択式」を支える。加えて、フルパスが入力された場合の安全網
//          （basename への正規化）を提供する。
// Reason: 従来 latexEngine はテキスト入力1本で、フルパスを入れると年度更新で壊れる脆弱性があった
//         （ADR-009）。texPath.ts の PATH 解決は macOS 専用だった。ユーザー要望「自動探索＋選択式＋
//         フルパスも入力可能」を実現するため、(1) 発見、(2) 正規化、(3) 候補生成を分離し、
//         それぞれ fs 依存を注入可能な形で純粋化してテストする。同じ仕組みを pandoc にも適用し、
//         設定 UI の自動検出体験を統一する。
// Related: src/services/citationPipeline.ts, src/services/pandocCommandBuilder.ts,
//          src/MdTexPluginSettingTab.ts

import * as fs from "fs";

/**
 * 探索対象バイナリのファイルシステム依存操作を外から注入するための薄い抽象。
 * テストでメモリ fs に差し替え可能にする。TeX・pandoc 等、すべてのバイナリ検出で共用。
 */
export interface BinFsLayer {
  existsSync: (path: string) => boolean;
  readdirSync: (path: string) => string[];
}

/** 実運用用の既定 fs レイヤー。 */
export const defaultBinFsLayer: BinFsLayer = {
  existsSync: fs.existsSync,
  readdirSync: (p: string) => fs.readdirSync(p),
};

/** 探索結果の1件。name は basename、binPath は実ファイルパス、dir は配置ディレクトリ。 */
export interface DiscoveredBinary {
  name: string;
  binPath: string;
  dir: string;
}

/**
 * バイナリ名（latexmk/lualatex/pandoc 等）を正規形（basename）にする安全網。ユーザーが
 * ドロップダウンで選んでもフルパスを手入力しても、実行時は常に basename＋PATH 解決で動くようにする。
 *
 * - `/usr/local/texlive/2025/bin/universal-darwin/lualatex` → `lualatex`
 * - `C:\texlive\2024\bin\windows\latexmk.exe`               → `latexmk`
 * - `/opt/homebrew/bin/pandoc`                               → `pandoc`
 * - `lualatex`                                               → `lualatex`
 *
 * 年度更新で実体パスが消滅しても、basename が PATH 上にあれば動き続ける。
 * 純粋関数（fs/OS 非依存）。
 */
export function normalizeBinName(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  // バックスラッシュをスラッシュに正規化して Windows/POSIX 両対応の basename を得る。
  const lastSep = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const base = lastSep >= 0 ? trimmed.slice(lastSep + 1) : trimmed;
  // Windows の .exe 拡張子を除去。.bat 等は想定しない（TeX/pandoc 配布は .exe）。
  return base.replace(/\.exe$/i, "");
}

/** 後方互換: latexEngine 正規化のドメイン名。実体は normalizeBinName と同一。 */
export const normalizeLatexEngine = normalizeBinName;

// ============================================================================
// TeX エンジン
// ============================================================================

/** 探索対象の TeX エンジン名（basename）。表示・実行の正規形。 */
export const TEX_ENGINE_NAMES = ["latexmk", "lualatex", "xelatex", "pdflatex"] as const;

/**
 * プラットフォーム別の TeX bin 候補ディレクトリを返す（純粋関数）。`*` を含むパスは glob で、
 * discoverTexEngines が展開する。
 *
 * macOS: `/Library/TeX/texbin`（全年度の集約シンボリックリンク）を最優先。
 * Linux: ディストリ配布（/usr/local/bin, /usr/bin）と TeX Live 公式配置の両方。
 * Windows: TeX Live の規定配置のみ。MiKTeX（`%LOCALAPPDATA%\Programs\MiKTeX\...`）は
 *   env var placeholder 展開を expandGlob が持たないため現状では発見できない。
 *   env 展開機能を expandGlob に追加した段階で復活させる（TODO）。
 */
export function getTexBinCandidates(platform: NodeJS.Platform): string[] {
  switch (platform) {
    case "darwin":
      return ["/Library/TeX/texbin", "/usr/local/texlive/*/bin/universal-darwin"];
    case "linux":
      return [
        "/usr/local/bin",
        "/usr/bin",
        "/usr/local/texlive/*/bin/x86_64-linux",
        "/opt/texlive/*/bin/x86_64-linux",
      ];
    case "win32":
      return ["C:\\texlive\\*\\bin\\windows"];
    default:
      return [];
  }
}

// ============================================================================
// Pandoc
// ============================================================================

/** 探索対象の pandoc バイナリ名（basename）。 */
export const PANDOC_NAMES = ["pandoc"] as const;

/**
 * プラットフォーム別の pandoc 候補ディレクトリを返す（純粋関数）。
 *
 * pandoc は TeX ほど「年度更新でパスが変わる」問題はないが、Windows インストーラは
 * PATH を更新しない設定があり得るため、規定配置を候補に出して自動検出を補強する。
 * TeX と同様、PATH 上のディレクトリも discoverPandoc が追加で走査する。
 *
 * macOS: Homebrew（Apple Silicon は /opt/homebrew/bin、Intel は /usr/local/bin）・MacPorts・公式 .pkg。
 * Linux: ディストリ配布（/usr/bin）と Homebrew on Linux。
 * Windows: 公式 MSI の all-users 配置（Program Files）。%LOCALAPPDATA%\Pandoc（current-user 配置）は
 *   env var placeholder 展開を expandGlob が持たないため現状では発見できず、カスタム入力でフォロー（TODO）。
 */
export function getPandocCandidates(platform: NodeJS.Platform): string[] {
  switch (platform) {
    case "darwin":
      return ["/usr/local/bin", "/opt/homebrew/bin", "/opt/local/bin"];
    case "linux":
      return ["/usr/bin", "/usr/local/bin", "/home/linuxbrew/.linuxbrew/bin"];
    case "win32":
      return ["C:\\Program Files\\Pandoc", "C:\\Program Files (x86)\\Pandoc"];
    default:
      return [];
  }
}

// ============================================================================
// pandoc-crossref
// ============================================================================

/** 探索対象の pandoc-crossref バイナリ名（basename）。 */
export const PANDOC_CROSSREF_NAMES = ["pandoc-crossref"] as const;

/**
 * プラットフォーム別の pandoc-crossref 候補ディレクトリを返す（純粋関数）。
 *
 * pandoc-crossref は GitHub Releases で配布される Haskell バイナリで、「pandoc が見つけられる場所
 * （PATH または pandoc と同じディレクトリ）」に置く運用。よって pandoc と同じ候補ディレクトリを
 * 使い、PATH 上も追加で走査する。Windows では pandoc と同じ Program Files\Pandoc が慣例。
 */
export function getPandocCrossrefCandidates(platform: NodeJS.Platform): string[] {
  // pandoc-crossref は「pandoc の近く」に置く運用なので、候補は pandoc と共通。
  return getPandocCandidates(platform);
}

// ============================================================================
// markdownlint-cli2
// ============================================================================

/** 探索対象の markdownlint-cli2 バイナリ名（basename）。 */
export const MARKDOWNLINT_NAMES = ["markdownlint-cli2"] as const;

/**
 * プラットフォーム別の markdownlint-cli2 候補ディレクトリを返す（純粋関数）。
 *
 * markdownlint-cli2 は npm グローバルインストールが主。npm はグローバル bin ディレクトリにシムを
 * 置く。macOS/Linux では /usr/local/bin や nvm の ~/.nvm/versions/node/X.X.X/bin に置かれるが、これらは
 * 通常 PATH に含まれるため、ここでは PATH 走査に委ねる。Windows の公式配置
 * （%APPDATA%\npm）は env var placeholder 展開を expandGlob が持たないため、候補に含めず
 * PATH 走査でフォローする。
 */
export function getMarkdownlintCandidates(platform: NodeJS.Platform): string[] {
  switch (platform) {
    case "darwin":
    case "linux":
      // npm グローバル bin は PATH に含まれることが多い。共通配置として明示的に出しておく。
      return ["/usr/local/bin", "/usr/bin"];
    case "win32":
      // %APPDATA%\npm は placeholder 未対応のため空。PATH 走査で補完。
      return [];
    default:
      return [];
  }
}

// ============================================================================
// 共通探索ロジック
// ============================================================================

/**
 * glob（単一の `*`）を含むパスを展開する。`*` が無ければ存在チェックのみ。
 * 区切り文字（`/` と `\`）両方に対応し、Windows パスでも動く。
 * 純粋関数（fs 操作は fsLayer 経由）。
 */
export function expandGlob(pattern: string, fsLayer: BinFsLayer): string[] {
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
  return entries.map(entry => parent + sep + entry + rest).filter(p => fsLayer.existsSync(p));
}

/**
 * 複数のバイナリ名を、候補ディレクトリと PATH 上から探索する（共通エンジン）。
 *
 * 重複（同一 binPath）は除去するが、同一 name で別ディレクトリ（別バージョン）は別件として
 * 全て残す。ユーザーがドロップダウンで選べるようにするため。
 * 純粋関数（fs 操作は fsLayer 経由、platform/pathEnv も外から注入）。
 *
 * TeX エンジン4種・pandoc・pandoc-crossref・markdownlint-cli2 のどれもこの関数1つでカバーする。
 * 候補ディレクトリを優先し、その後に PATH 上を走査する。
 *
 * Windows では拡張子の異なるシム（.exe / .cmd / .bat）が存在するため、全ての拡張子を試して
 * 最初に見つかったものを採用する（例: markdownlint-cli2 は .cmd、pandoc は .exe）。
 */
export function discoverBinaries(
  names: readonly string[],
  candidateDirs: string[],
  platform: NodeJS.Platform,
  pathEnv: string,
  fsLayer: BinFsLayer = defaultBinFsLayer,
): DiscoveredBinary[] {
  const results: DiscoveredBinary[] = [];
  const seen = new Set<string>();
  const sep = platform === "win32" ? ";" : ":";
  // Windows では .exe（ネイティブバイナリ）と .cmd/.bat（npm 等のシム）が混在するため
  // 全てを候補にする。POSIX は拡張子なし。
  const exeExts = platform === "win32" ? [".exe", ".cmd", ".bat"] : [""];

  const pathDirs = (pathEnv ?? "")
    .split(sep)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  // 候補（規定配置）を優先し、その後に PATH 上を走査。
  const allDirPatterns = [...candidateDirs, ...pathDirs];

  for (const dirPattern of allDirPatterns) {
    for (const dir of expandGlob(dirPattern, fsLayer)) {
      for (const name of names) {
        // 拡張子候補を順に試し、最初に見つかったものを採用する。
        // 例: Windows で markdownlint-cli2.exe が無く markdownlint-cli2.cmd があれば後者。
        for (const ext of exeExts) {
          const binPath = dir + (dir.includes("\\") ? "\\" : "/") + name + ext;
          if (fsLayer.existsSync(binPath)) {
            if (seen.has(binPath)) continue;
            seen.add(binPath);
            results.push({ name, binPath, dir });
            break; // 同じベース名で複数拡張子ヒットしても最初の1件だけ採用
          }
        }
      }
    }
  }
  return results;
}

/** TeX エンジンを探索する（discoverBinaries の thin wrapper）。 */
export function discoverTexEngines(
  platform: NodeJS.Platform,
  pathEnv: string,
  fsLayer: BinFsLayer = defaultBinFsLayer,
): DiscoveredBinary[] {
  return discoverBinaries(
    TEX_ENGINE_NAMES,
    getTexBinCandidates(platform),
    platform,
    pathEnv,
    fsLayer,
  );
}

/** pandoc を探索する（discoverBinaries の thin wrapper）。 */
export function discoverPandoc(
  platform: NodeJS.Platform,
  pathEnv: string,
  fsLayer: BinFsLayer = defaultBinFsLayer,
): DiscoveredBinary[] {
  return discoverBinaries(PANDOC_NAMES, getPandocCandidates(platform), platform, pathEnv, fsLayer);
}

/** pandoc-crossref を探索する（discoverBinaries の thin wrapper）。 */
export function discoverPandocCrossref(
  platform: NodeJS.Platform,
  pathEnv: string,
  fsLayer: BinFsLayer = defaultBinFsLayer,
): DiscoveredBinary[] {
  return discoverBinaries(
    PANDOC_CROSSREF_NAMES,
    getPandocCrossrefCandidates(platform),
    platform,
    pathEnv,
    fsLayer,
  );
}

/** markdownlint-cli2 を探索する（discoverBinaries の thin wrapper）。 */
export function discoverMarkdownlint(
  platform: NodeJS.Platform,
  pathEnv: string,
  fsLayer: BinFsLayer = defaultBinFsLayer,
): DiscoveredBinary[] {
  return discoverBinaries(
    MARKDOWNLINT_NAMES,
    getMarkdownlintCandidates(platform),
    platform,
    pathEnv,
    fsLayer,
  );
}
