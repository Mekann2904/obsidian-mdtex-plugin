// File: src/services/citationPipeline.ts
// Purpose: citation モード（natbib/citeproc）有効時の PDF 生成を2フェーズ化し、bibstyle 衝突を
//          反応型に解決する（ADR-009）。Pandoc に --pdf-engine で PDF まで一任せず、
//          MD→.tex→(反応型修正)→latexmk→PDF を MdTex が監理する。
// Reason: 学会公式クラス（ACL 等）の内蔵 bibliographystyle と Pandoc --natbib の plainnat の衝突を、
//          クラスを知らなくても解決するため（.aux フィードバック）。
// Related: src/services/convertService.ts, src/services/pandocCommandBuilder.ts,
//          src/utils/bibstyleResolve.ts, src/utils/processRunner.ts, src/services/tempFiles.ts

import * as path from "path";
import * as fs from "fs/promises";
import { ProfileSettings } from "../MdTexPluginSettings";
import {
  buildPandocCommand,
  buildLatexSearchEnv,
  OutputFormat,
  PandocCommandResult,
} from "./pandocCommandBuilder";
import { runCommand } from "../utils/processRunner";
import {
  extractAuxBibstyles,
  hasClassProvidedBibstyle,
  stripPlainnatBibstyle,
} from "../utils/bibstyleResolve";
import { buildTexAwareEnv } from "../utils/texPath";
import { normalizeLatexEngine } from "../utils/texDiscover";

/**
 * citation パイプラインの実行に必要な入力。convertService が組み立てる。
 */
export interface CitationPipelineParams {
  profile: ProfileSettings;
  /** Pandoc への入力。useStdin のとき内容、そうでなければファイルパス。 */
  inputPath?: string;
  inputContent?: string;
  useStdin: boolean;
  /** Pandoc 生成の standalone .tex を置く絶対パス。 */
  texOutputPath: string;
  /** 最終 PDF の絶対パス。texOutputPath と同名・拡張子違いを想定。 */
  pdfOutputPath: string;
  /** Pandoc の作業ディレクトリ（--resource-path の基準）。 */
  workingDir: string;
  headerPath?: string;
  metadataFile?: string;
  luaFilters?: string[];
  resourcePath?: string;
  extraArgs?: string[];
}

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
  const engine = normalizeLatexEngine((profile.latexEngine ?? "lualatex"));
  const bareEngine = engine || "lualatex";
  if (bareEngine === "latexmk") {
    // pdfEngineOpts（例: "-lualatex -interaction=nonstopmode"）をそのまま latexmk 引数に。
    const opts = (profile.pdfEngineOpts ?? "")
      .split(/\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
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
 * citation モード用に standalone .tex を生成する Pandoc コマンドを構築する（純粋関数）。
 *
 * buildPandocCommand を `format: "latex"` で呼び、出力を .tex に向ける。citationMode 由来の
 * `--natbib`/`--citeproc` と `--pdf-engine-opt` は .tex 生成時には無意味だが、buildPandocCommand は
 * format=latex では pdf-engine 系を出さないので安全。standalone は builtin のみ付与（defaults 方式は
 * defaults file の standalone: で制御）。
 */
async function cleanupLatexmkState(texDir: string, texBase: string): Promise<void> {
  const exts = ["aux", "bbl", "blg", "fdb_latexmk", "fls", "log", "out", "pdf", "synctex.gz"];
  await Promise.all(exts.map(ext => fs.rm(path.join(texDir, `${texBase}.${ext}`), { force: true })));
}

export function buildCitationTexCommand(params: CitationPipelineParams): PandocCommandResult {
  return buildPandocCommand({
    profile: params.profile,
    format: "latex" as OutputFormat,
    inputPath: params.useStdin ? undefined : params.inputPath,
    outputPath: params.texOutputPath,
    headerPath: params.headerPath,
    metadataFile: params.metadataFile,
    workingDir: params.workingDir,
    extraArgs: params.extraArgs,
    luaFilters: params.luaFilters,
    resourcePath: params.resourcePath,
    useStdin: params.useStdin,
  });
}

/**
 * 反応型 LaTeX フェーズのみを実行する（ADR-009）。executePandocCommand が Pandoc→.tex を済ませた
 * 後に呼ぶ。draft→.aux 読み取り→反応型 plainnat 除去→latexmk→PDF 移動、のシーケンス。
 *
 * runCitationPipeline との違い: こちらは Pandoc 実行を呼び出し元（executePandocCommand）が
 * 担うため、既存のテンポラリフィルタ管理（buildPandocExecutionPlan）と統合できる。
 */
export async function runReactiveLatexPhase(
  texPath: string,
  pdfOutputPath: string,
  profile: ProfileSettings,
  workingDir: string,
  opts: {
    onStdout?: (s: string) => void;
    onStderr?: (s: string) => void;
    suppressLogs?: boolean;
  } = {},
): Promise<boolean> {
  const envExtra = buildLatexSearchEnv(profile, process.platform);
  // ADR-009 関連: Obsidian（GUI）の PATH は TeX bin を含まないことが多く、latexmk が内部で呼ぶ
  // lualatex が command not found になる。/Library/TeX/texbin 等を PATH に自動追加する。
  const env = { ...buildTexAwareEnv(process.env), ...envExtra };
  const { latexmkArgs, draftEngine } = resolveLatexInvocation(profile);
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
      console.warn(`[MdTex] citation phase: .aux not generated (draft exit ${draftResult.exitCode})`);
    return false;
  }

  // --- 反応型: .aux に plainnat 以外があれば plainnat 行を除去 ---
  if (hasClassProvidedBibstyle(extractAuxBibstyles(auxContent))) {
    const texContent = await fs.readFile(texPath, "utf8");
    await fs.writeFile(texPath, stripPlainnatBibstyle(texContent), "utf8");
    // draft パスで生成した .aux には、修正前の plainnat 由来 \bibstyle{plainnat} が残っている。
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
    if (!opts.suppressLogs) console.warn(`[MdTex] citation phase (latexmk) exit ${finalResult.exitCode}`);
    return false;
  }

  const generatedPdf = path.join(texDir, `${texBase}.pdf`);
  if (generatedPdf !== pdfOutputPath) {
    try {
      await fs.rename(generatedPdf, pdfOutputPath);
    } catch (err) {
      if (!opts.suppressLogs) console.warn(`[MdTex] citation: failed to move PDF to ${pdfOutputPath}`, err);
      return false;
    }
  }
  return true;
}

/**
 * citation モードの PDF 生成を2フェーズで実行し、bibstyle 衝突を反応型に解決する（ADR-009）。
 *
 * シーケンス:
 * 1. Pandoc で standalone .tex を生成（plainnat 含む）。
 * 2. LaTeX draft パス（1パス）で .aux を得る。
 * 3. .aux を読み、plainnat 以外の bibstyle があれば .tex から plainnat 行を除去。
 * 4. latexmk で .tex → PDF。
 *
 * 各ステップの終了コードを検査し、失敗時は速やかに false を返す（エラー隠蔽しない）。
 * TEXINPUTS/BIBINPUTS/BSTINPUTS は buildLatexSearchEnv で組み立て defaults 方式のパック発見に使う。
 *
 * @returns PDF が生成できれば true
 */
export async function runCitationPipeline(
  params: CitationPipelineParams,
  opts: {
    onStdout?: (s: string) => void;
    onStderr?: (s: string) => void;
    suppressLogs?: boolean;
  } = {},
): Promise<boolean> {
  const { profile } = params;
  const envExtra = buildLatexSearchEnv(profile, process.platform);
  // ADR-009 関連: Obsidian（GUI）の PATH は TeX bin を含まないことが多く、latexmk が内部で呼ぶ
  // lualatex が command not found になる。/Library/TeX/texbin 等を PATH に自動追加する。
  const env = { ...buildTexAwareEnv(process.env), ...envExtra };
  const { latexmkArgs, draftEngine } = resolveLatexInvocation(profile);
  const texDir = path.dirname(params.texOutputPath);
  const texBase = path.basename(params.texOutputPath, ".tex");

  // --- 1. Pandoc → standalone .tex ---
  const texCmd = buildCitationTexCommand(params);
  const texResult = await runCommand(texCmd.command, texCmd.args, {
    cwd: params.workingDir,
    env,
    input: params.useStdin ? params.inputContent : undefined,
    onStdout: opts.onStdout,
    onStderr: opts.onStderr,
  });
  if (texResult.exitCode !== 0) {
    if (!opts.suppressLogs) console.warn(`[MdTex] citation phase 1 (Pandoc→.tex) exit ${texResult.exitCode}`);
    return false;
  }

  // --- 2. LaTeX draft パス → .aux ---
  const draftResult = await runCommand(draftEngine, ["-draftmode", "-interaction=nonstopmode", params.texOutputPath], {
    cwd: texDir,
    env,
    onStdout: opts.onStdout,
    onStderr: opts.onStderr,
  });
  // draft パスは overfull 等で non-zero になりうるが .aux 生成が目的。.aux があれば続行。
  const auxPath = path.join(texDir, `${texBase}.aux`);
  let auxContent = "";
  try {
    auxContent = await fs.readFile(auxPath, "utf8");
  } catch {
    if (!opts.suppressLogs)
      console.warn(`[MdTex] citation phase 2: .aux not generated (draft exit ${draftResult.exitCode})`);
    return false;
  }

  // --- 3. 反応型: .aux に plainnat 以外があれば plainnat 行を除去 ---
  if (hasClassProvidedBibstyle(extractAuxBibstyles(auxContent))) {
    const texContent = await fs.readFile(params.texOutputPath, "utf8");
    await fs.writeFile(params.texOutputPath, stripPlainnatBibstyle(texContent), "utf8");
    // 修正前 draft パス由来の .aux/.fdb_latexmk を残すと、latexmk が古い \bibstyle{plainnat}
    // を含む状態で BibTeX を実行して失敗する。依存状態を掃除してから再生成させる。
    await cleanupLatexmkState(texDir, texBase);
  }

  // --- 4. latexmk → PDF ---
  const finalResult = await runCommand(
    "latexmk",
    [...latexmkArgs, "-interaction=nonstopmode", params.texOutputPath],
    {
      cwd: texDir,
      env,
      onStdout: opts.onStdout,
      onStderr: opts.onStderr,
    },
  );
  if (finalResult.exitCode !== 0) {
    if (!opts.suppressLogs) console.warn(`[MdTex] citation phase 4 (latexmk) exit ${finalResult.exitCode}`);
    return false;
  }

  // latexmk は .tex と同名の .pdf を出力する。呼び出し側が期待する pdfOutputPath に配置する。
  const generatedPdf = path.join(texDir, `${texBase}.pdf`);
  if (generatedPdf !== params.pdfOutputPath) {
    try {
      await fs.rename(generatedPdf, params.pdfOutputPath);
    } catch (err) {
      if (!opts.suppressLogs) console.warn(`[MdTex] citation: failed to move PDF to ${params.pdfOutputPath}`, err);
      return false;
    }
  }
  return true;
}
