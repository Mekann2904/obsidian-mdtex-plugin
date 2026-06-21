// File: src/services/citationPipeline.ts
// Purpose: citation モード（natbib/citeproc）有効時の反応型 LaTeX フェーズ（ADR-009）。
//          Pandoc 生成の standalone .tex を受け取り、draft→.aux 読み取り→plainnat 除去→
//          latexmk→PDF を実行する。Pandoc→.tex 生成と env（TeX PATH + TEXINPUTS 等）の構築は
//          呼び出し元（pandocInvocation.executePandocCommand）が担い、本モジュールは純粋に
//          「与えられた env・latexmk 引数で LaTeX を回す」だけに専念する。
// Reason: 学会公式クラス（ACL 等）の内蔵 bibliographystyle と Pandoc --natbib の plainnat の衝突を、
//          クラスを知らなくても解決するため（.aux フィードバック）。
// Related: src/services/convertService.ts, src/utils/bibstyleResolve.ts, src/utils/processRunner.ts,
//          src/services/pandocCommandBuilder.ts

import * as path from "path";
import * as fs from "fs/promises";
import { ProfileSettings } from "../MdTexPluginSettings";
import { runCommand } from "../utils/processRunner";
import {
  extractAuxBibstyles,
  hasClassProvidedBibstyle,
  stripPlainnatBibstyle,
} from "../utils/bibstyleResolve";
import { normalizeLatexEngine } from "../utils/binDiscover";
import { tokenizePdfEngineOpts } from "./pandocCommandBuilder";

/**
 * プロファイルから、latexmk 呼び出しのサブエンジン引数と draft パス用の LaTeX バイナリを解決する（ADR-009）。
 *
 * citation モードの bibtex ラウンドトリップは latexmk に一任する。latexmk は `-lualatex` /
 * `-xelatex` / `-pdflatex` でサブエンジンを指定する。
 * - `latexEngine` が `latexmk` のとき: サブエンジンは `pdfEngineOpts`（例: `-lualatex`）から取る。
 *   これによりユーザーが `pdfEngineOpts: "-lualatex"` で制御できる。
 * - `latexEngine` が `lualatex`/`xelatex`/`pdflatex` のとき: latexmk の `-<engine>` フラグに変換する。
 *
 * draft パス（.aux 取得）は latexmk を通さず LaTeX バイナリ直接走行で1パスだけ回す。
 * 純粋関数: テスト可能。
 */
export function resolveLatexInvocation(profile: ProfileSettings): {
  latexmkArgs: string[];
  draftEngine: string;
} {
  // latexEngine にフルパスが入力されても basename に正規化する（年度更新耐性）。
  // latexmk は PATH 解決（buildTexAwareEnv）で見つかる。
  const engine = normalizeLatexEngine(profile.latexEngine ?? "lualatex");
  const bareEngine = engine || "lualatex";
  if (bareEngine === "latexmk") {
    // pdfEngineOpts（例: "-lualatex -interaction=nonstopmode"）をそのまま latexmk 引数に。
    // トークン分割は pandocCommandBuilder の canonical helper を再利用（重複実装回避）。
    const opts = tokenizePdfEngineOpts(profile.pdfEngineOpts);
    // draft 用エンジンは opts の -lualatex/-xelatex/-pdflatex から推定、なければ lualatex
    const sub = opts.find(o => /^-(lua|xe|pdf)latex$/.test(o));
    const draftEngine = sub ? sub.slice(1) : "lualatex";
    return { latexmkArgs: opts, draftEngine };
  }
  // latexEngine が直接エンジン名のとき、latexmk の -<engine> フラグに。
  const latexmkArgs = [`-${bareEngine}`];
  return { latexmkArgs, draftEngine: bareEngine };
}

/**
 * latexmk の依存状態（.aux/.bbl/.fdb_latexmk 等）を掃除する。
 *
 * plainnat 除去後に古い .aux が残っていると latexmk が古い \bibstyle{plainnat} を含む状態で
 * BibTeX を走らせ、"Illegal, another \bibstyle command" で失敗する。strict 方針のため -f では
 * 隠さず、依存状態を掃除して latexmk に正しい .aux を再生成させる。
 */
async function cleanupLatexmkState(texDir: string, texBase: string): Promise<void> {
  const exts = ["aux", "bbl", "blg", "fdb_latexmk", "fls", "log", "out", "pdf", "synctex.gz"];
  await Promise.all(
    exts.map(ext => fs.rm(path.join(texDir, `${texBase}.${ext}`), { force: true })),
  );
}

/**
 * 反応型 LaTeX フェーズのみを実行する（ADR-009）。
 *
 * 呼び出し元（executePandocCommand）が Pandoc→.tex を生成し env を構築済みの前提で、
 * draft→.aux 読み取り→反応型 plainnat 除去→latexmk→PDF 移動、のシーケンスを回す。
 * env（TeX 対応 PATH + TEXINPUTS/BIBINPUTS/BSTINPUTS）は呼び出し元が一度構築したものを
 * 受け取り、本関数内で再構築しない（オーケストレーション層との責務分離）。
 *
 * @returns PDF が生成できれば true
 */
export async function runReactiveLatexPhase(
  texPath: string,
  pdfOutputPath: string,
  env: NodeJS.ProcessEnv,
  latexmkArgs: string[],
  draftEngine: string,
  opts: {
    onStdout?: (s: string) => void;
    onStderr?: (s: string) => void;
    suppressLogs?: boolean;
  } = {},
): Promise<boolean> {
  const texDir = path.dirname(texPath);
  const texBase = path.basename(texPath, ".tex");

  // --- draft パス → .aux ---
  const draftResult = await runCommand(
    draftEngine,
    ["-draftmode", "-interaction=nonstopmode", texPath],
    { cwd: texDir, env, onStdout: opts.onStdout, onStderr: opts.onStderr },
  );
  const auxPath = path.join(texDir, `${texBase}.aux`);
  let auxContent = "";
  try {
    auxContent = await fs.readFile(auxPath, "utf8");
  } catch {
    if (!opts.suppressLogs)
      console.warn(
        `[MdTex] citation phase: .aux not generated (draft exit ${draftResult.exitCode})`,
      );
    return false;
  }

  // --- 反応型: .aux に plainnat 以外があれば plainnat 行を除去 ---
  if (hasClassProvidedBibstyle(extractAuxBibstyles(auxContent))) {
    const texContent = await fs.readFile(texPath, "utf8");
    await fs.writeFile(texPath, stripPlainnatBibstyle(texContent), "utf8");
    // draft パスで生成した .aux には修正前の plainnat 由来 \bibstyle{plainnat} が残っている。
    // これを残すと latexmk が古い .aux を使って BibTeX を先に走らせ、
    // 「Illegal, another \bibstyle command」で失敗する。strict 方針のため -f では隠さず、
    // 依存状態を掃除してから latexmk に正しい .aux を再生成させる。
    await cleanupLatexmkState(texDir, texBase);
  }

  // --- latexmk → PDF ---
  const finalResult = await runCommand(
    "latexmk",
    [...latexmkArgs, "-interaction=nonstopmode", texPath],
    { cwd: texDir, env, onStdout: opts.onStdout, onStderr: opts.onStderr },
  );
  if (finalResult.exitCode !== 0) {
    if (!opts.suppressLogs)
      console.warn(`[MdTex] citation phase (latexmk) exit ${finalResult.exitCode}`);
    return false;
  }

  const generatedPdf = path.join(texDir, `${texBase}.pdf`);
  // 呼び出し元（pandocInvocation.buildPandocExecutionPlan）は texOutputPath を PDF 出力パスと同名・拡張子 .tex に
  // 設るため、通常 generatedPdf === pdfOutputPath。上流の不変条件が壊れたときの安全網として残す。
  if (generatedPdf !== pdfOutputPath) {
    try {
      await fs.rename(generatedPdf, pdfOutputPath);
    } catch (err) {
      if (!opts.suppressLogs)
        console.warn(`[MdTex] citation: failed to move PDF to ${pdfOutputPath}`, err);
      return false;
    }
  }
  return true;
}
