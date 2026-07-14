// File: src/cli/doctorDiagnose.ts
// Purpose: `mdtex doctor` の環境診断純粋関数。発見（binDiscover）と版取得（resolveVersion）
//          を注入して DiagnosticReport を組み立てる。status モデルは pack validate と統一
//          （ok / degraded / errors → exit 0 / 1 / 2）し、CLI 全体で一貫させる。
// Reason: doctor の本質は「どの外部バイナリが揃い、版は何か」を観測すること。発見は既に
//          binDiscover が純粋化済み（fsLayer 注入）。版取得は外部プロセス呼び出しなので
//          resolveVersion として注入し、本 module を fs/child_process の知識から自由にする。
//          必須（pandoc/latexmk/lualatex）が揃えば変換可能=ok、オプション（crossref/
//          markdownlint）欠落は degraded、必須欠落は errors。cli-for-agents 原則:
//          観測に徹し、判断（どう直すか）はエージェントに委ねる。
// Related: src/utils/binDiscover.ts, src/cli/doctorVersion.ts, src/cli/doctorReport.ts,
//          src/cli/commands/doctor.ts

import {
  defaultBinFsLayer,
  discoverMarkdownlint,
  discoverPandoc,
  discoverPandocCrossref,
  discoverTexEngines,
  type BinFsLayer,
  type DiscoveredBinary,
} from "../utils/binDiscover";

/** 版取得（I/O を注入）。name は版パーサー選択に、binPath は実行に使う。失敗時 null。 */
export type VersionResolver = (name: string, binPath: string) => Promise<string | null>;

/** pack validate と統一の status（exit 0/1/2 と整合）。 */
export type DiagnosticStatus = "ok" | "degraded" | "errors";

/** 診断対象1件の結果。 */
export interface DiagnosticEntry {
  name: string;
  required: boolean;
  purpose: string;
  found: boolean;
  binPath: string | null;
  version: string | null;
  /** 版取得時にエラーが起きた場合のメッセージ（発見できたが版が取れない等）。 */
  versionError: string | null;
}

export interface DiagnosticSummary {
  total: number;
  found: number;
  requiredMissing: number;
  optionalMissing: number;
}

export interface DiagnosticReport {
  status: DiagnosticStatus;
  entries: DiagnosticEntry[];
  summary: DiagnosticSummary;
}

interface BinSpec {
  name: string;
  required: boolean;
  purpose: string;
}

/**
 * 診断対象バイナリの仕様。並び順がそのまま doctor の出力順。
 *
 * 必須（PDF 変換に最低限必要）: pandoc（変換本体）・latexmk（TeX ビルドドライバ）・
 *   lualatex（既定エンジン・和文組版）。
 * オプション（機能によって必要）: pandoc-crossref（crossref フィルタを使うパック）・
 *   markdownlint-cli2（profile.lintEnabled のとき）。
 * xelatex/pdflatex は代替エンジンのため doctor では対象外（発見しても表示しない）。
 */
export const DOCTOR_BIN_SPECS: readonly BinSpec[] = [
  { name: "pandoc", required: true, purpose: "Markdown → PDF/LaTeX/DOCX 変換の本体" },
  { name: "latexmk", required: true, purpose: "TeX ビルドドライバ（pandoc が内部呼出）" },
  { name: "lualatex", required: true, purpose: "既定の TeX エンジン（和文組版）" },
  { name: "pandoc-crossref", required: false, purpose: "crossref フィルタ（使用パックのみ必要）" },
  { name: "markdownlint-cli2", required: false, purpose: "Markdown lint（profile.lintEnabled 時）" },
];

/**
 * 環境を診断し DiagnosticReport を返す。発見は binDiscover に、版取得は resolveVersion に
 * 委譲し、本関数は「発見結果＋版 → status 集計」の純粋ロジックに専念する。
 *
 * status: 必須欠落が1件でもあれば errors（PDF 変換不可）、必須揃ったがオプション欠落なら
 * degraded（変換可能だが一部機能制限）、全揃いなら ok。版取得失敗は status に影響しない
 * （発見できていれば変換可能であり、版は参考情報だから）。
 */
export async function diagnoseEnvironment(
  platform: NodeJS.Platform,
  pathEnv: string,
  resolveVersion: VersionResolver,
  fsLayer: BinFsLayer = defaultBinFsLayer,
): Promise<DiagnosticReport> {
  // 発見（binDiscover に委譲・fsLayer でモック可能）。
  const texAll = discoverTexEngines(platform, pathEnv, fsLayer);
  const pandocAll = discoverPandoc(platform, pathEnv, fsLayer);
  const crossrefAll = discoverPandocCrossref(platform, pathEnv, fsLayer);
  const mdAll = discoverMarkdownlint(platform, pathEnv, fsLayer);

  // バイナリ名 → 発見結果リスト。TeX エンジン群は1つの探索結果を共有する。
  const discoverMap: Record<string, DiscoveredBinary[]> = {
    pandoc: pandocAll,
    latexmk: texAll,
    lualatex: texAll,
    "pandoc-crossref": crossrefAll,
    "markdownlint-cli2": mdAll,
  };

  // 発見結果（同期・安価）を先に確定し、版取得（サブプロセス・独立）を並列化する。
  // 探索結果リストには別名バイナリ（latexmk/lualatex 等）が混在するので spec.name で pickup
  // する（[0] では別名の先頭要素を誤認する: 例 lualatex の位置に latexmk）。
  const foundPerSpec = DOCTOR_BIN_SPECS.map(spec => ({
    spec,
    found: discoverMap[spec.name]?.find(b => b.name === spec.name) ?? null,
  }));
  const versions = await Promise.all(
    foundPerSpec.map(({ found }) =>
      found ? resolveVersion(found.name, found.binPath).catch(() => null) : Promise.resolve(null),
    ),
  );
  const entries: DiagnosticEntry[] = foundPerSpec.map(({ spec, found }, i) => {
    const binPath = found?.binPath ?? null;
    const v = versions[i];
    return {
      name: spec.name,
      required: spec.required,
      purpose: spec.purpose,
      found: !!found,
      binPath,
      version: v,
      versionError:
        binPath && v === null
          ? "版を取得できませんでした（--version が応答しない、または出力を解析不可）"
          : null,
    };
  });

  const requiredMissing = entries.filter(e => e.required && !e.found).length;
  const optionalMissing = entries.filter(e => !e.required && !e.found).length;
  const foundCount = entries.filter(e => e.found).length;

  let status: DiagnosticStatus;
  if (requiredMissing > 0) status = "errors";
  else if (optionalMissing > 0) status = "degraded";
  else status = "ok";

  return {
    status,
    entries,
    summary: { total: entries.length, found: foundCount, requiredMissing, optionalMissing },
  };
}
