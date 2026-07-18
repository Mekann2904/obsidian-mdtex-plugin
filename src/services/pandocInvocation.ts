// File: src/services/pandocInvocation.ts
// Purpose: Pandoc を 1 回起動する知識（実行計画の構築・一時 Lua/YAML フィルタの生成・実行・
//   反応型 citation 2 相・cleanup）を 1 つの module にまとめる。
// Reason: これまで Pandoc 起動の知識が convertService の private 関数群（buildPandocExecutionPlan /
//   executePandocCommand / createTemp* / runPandoc / runPandocWithStdin）に散らばり、
//   runPandoc（ファイル入力）と runPandocWithStdin（stdin）が try/build/execute/cleanup を
//   useStdin の差だけで重複していた。1 つの深い module（invokePandoc）に統一し、入力方式の分岐を
//   呼び出し側から隠す（architecture review 候補 4 + 候補 2）。
// Related: src/services/convertService.ts, src/services/pandocCommandBuilder.ts,
//          src/services/citationPipeline.ts, src/utils/processRunner.ts, src/services/tempFiles.ts

import { Notice } from "obsidian";
import * as path from "path";
import { isDefaultsTemplateMode, ProfileSettings } from "../MdTexPluginSettings";
import { CALLOUT_LUA_FILTER } from "../assets/callout-filter";
import { DOCX_TEX_LUA_FILTER } from "../assets/docxTexFilter";
import { MERMAID_STRIP_LUA_FILTER } from "../assets/mermaid-filter";
import {
  buildPandocCommand,
  buildLabelMetadataYaml,
  buildLatexSearchEnv,
  OutputFormat,
  PandocCommandResult,
} from "./pandocCommandBuilder";
import { runReactiveLatexPhase, resolveLatexInvocation } from "./citationPipeline";
import { buildTexAwareEnv } from "../utils/texPath";
import { runCommand } from "../utils/processRunner";
import { createTempFile, cleanupTemporaryFiles, TempFileArtifact } from "./tempFiles";
import { PluginContext } from "./pluginContext";
import { t } from "../lang/helpers";

/**
 * invokePandoc への要求。入力は常に本文文字列（stdin 経由）で渡す。
 *
 * 入力方式（stdin / ファイル）の選択は本 module の内側に隠し、呼び出し側は「本文 → 形式出力」
 * だけを意識する。citation モード（ADR-009）の 2 相分岐・一時ファイル lifecycle も内側で扱う。
 */
export interface PandocInvocationRequest {
  ctx: PluginContext;
  profile: ProfileSettings;
  format: OutputFormat;
  /** Pandoc の入力本文（Markdown）。stdin 経由で渡す。 */
  inputContent: string;
  /** 出力ファイルの絶対パス。 */
  outputFile: string;
  /** --include-in-header に渡す header の LaTeX 内容（buildHeader の結果）。
 *  本 module が一時ファイルへ書き出し、他の Lua/YAML フィルタと同じ cleanup seam で片付ける
 *  （architecture review 候補 B）。呼び出し側は header ファイルのパス・生成・cleanup を知らない。 */
  headerContent: string;
  /** Pandoc 実行時の作業ディレクトリ（通常は元ノートのディレクトリ）。 */
  workingDir: string;
  /** --resource-path。未指定時は profile.searchDirectory / workingDir にフォールバック。 */
  resourcePath?: string;
  /** pandocExtraArgs（--draft は呼び出し側で分離済みの純粋な追加引数）。 */
  pandocExtraArgs: string[];
  /** Mermaid 言語削除フィルタを適用するか（enableExperimentalMermaid が無効な場合 true）。 */
  stripMermaid: boolean;
}

/**
 * Pandoc を 1 回起動し、形式出力を生成する。成功すれば true。
 *
 * 内部で: 実行計画構築 → 一時フィルタ生成 → 実行（citation 2 相を含む）→ cleanup。
 * 呼び出し側は本文と出力先だけ渡せばよい（leverage）。起動知識と一時ファイル lifecycle は
 * 本関数に集中する（locality）。
 */
export async function invokePandoc(req: PandocInvocationRequest): Promise<boolean> {
  let plan: PandocExecutionPlan | null = null;
  try {
    plan = await buildPandocExecutionPlan({
      profile: req.profile,
      format: req.format,
      headerContent: req.headerContent,
      outputFile: req.outputFile,
      workingDir: req.workingDir,
      pandocExtraArgs: req.pandocExtraArgs,
      resourcePath: req.resourcePath,
      stripMermaid: req.stripMermaid,
    });
    return await executePandocCommand(plan, req.ctx, req.outputFile, req.inputContent);
  } finally {
    await cleanupTemporaryFiles(plan?.tempFiles ?? []);
  }
}

interface PandocExecutionPlan {
  command: PandocCommandResult;
  tempFiles: string[];
  workingDir: string;
  // ADR-009: 反応型 LaTeX フェーズでエンジン解決（resolveLatexInvocation）と検索パス再構築に使う。
  // executePandocCommand で一度だけ env を構築し、runReactiveLatexPhase にそのまま渡すため、
  // 本モジュール側で env 再構築は行わない。
  envExtra: NodeJS.ProcessEnv;
  // ADR-009: citation モード（natbib/citeproc）有効時の2フェーズ実行情報。設定時、command は
  // PDF ではなく standalone .tex を生成するよう構築され、executePandocCommand は反応型 LaTeX
  // フェーズ（draft→.aux→plainnat 除去→latexmk）に引き継ぐ。latexmkArgs/draftEngine は
  // buildPandocExecutionPlan 時に1回だけ resolveLatexInvocation で解決済み。
  citation?: {
    texPath: string;
    pdfPath: string;
    latexmkArgs: string[];
    draftEngine: string;
  };
}

// 変換パイプラインで使う一時 Lua/YAML ファイルは、生成プリミティブ（createTempFile）の
// 薄いラッパとして統一する。mkdtemp + writeFile + cleanup-on-error は tempFiles.ts に集約済み。
// 各フィルタは配布物（main.js）に埋め込んだ文字列定数を実行時に一時ファイルへ書き出し、
// 全環境で正しく適用されるようにする（loose ファイル依存は廃止）。

// Obsidian コールアウト変換用 Lua フィルタ（pdf/latex 常時適用）。
async function createTempLuaFilter(): Promise<TempFileArtifact> {
  return createTempFile(CALLOUT_LUA_FILTER, "mdtex-lua-", "lua");
}

// DOCX 出力用の AST ベース Lua フィルタ（DOCX_TEX_LUA_FILTER）。
async function createTempDocxFilter(): Promise<TempFileArtifact> {
  return createTempFile(DOCX_TEX_LUA_FILTER, "mdtex-docx-", "lua");
}

// Mermaid 言語削除フィルタ（pdf/latex 用）。適用条件（enableExperimentalMermaid が無効）は
// buildPandocExecutionPlan 側で判定する（ADR-005）。
async function createTempMermaidFilter(): Promise<TempFileArtifact> {
  return createTempFile(MERMAID_STRIP_LUA_FILTER, "mdtex-mermaid-", "lua");
}

// プロファイル既定値のラベル／接頭辞を Pandoc メタデータ YAML として一時生成する。
// 値が全て空なら null を返し、呼び出し側は --metadata-file を省略する。
async function createTempMetadataFile(profile: ProfileSettings): Promise<TempFileArtifact | null> {
  const body = buildLabelMetadataYaml(profile);
  if (!body) return null;
  return createTempFile(body, "mdtex-metadata-", "yaml");
}

async function buildPandocExecutionPlan(params: {
  profile: ProfileSettings;
  format: OutputFormat;
  headerContent: string;
  outputFile: string;
  workingDir: string;
  pandocExtraArgs: string[];
  resourcePath?: string;
  // Mermaid 言語削除フィルタを適用するか（enableExperimentalMermaid が無効な場合 true）。
  // pdf/latex 出力でのみ意味を持ち、--listings の unknown language 警告を防ぐ（ADR-005）。
  stripMermaid?: boolean;
}): Promise<PandocExecutionPlan> {
  const tempFiles: string[] = [];
  const luaFilters: string[] = [];

  // header（--include-in-header の中身）を他の一時フィルタと同じ lifecycle で扱う
  // （architecture review 候補 B）。convertService は header の LaTeX 内容（buildHeader の結果）
  // を渡すだけで、ファイル化・cleanup は本 module が持つ。mdtex-header- prefix により
  // cleanupTemporaryFiles の安全検査（OS 一時領域 + prefix）が効く。
  const headerArtifact = await createTempFile(params.headerContent, "mdtex-header-", "tex");
  const headerPath = headerArtifact.filePath;
  tempFiles.push(headerArtifact.filePath, headerArtifact.tempDir);

  if (params.format === "pdf" || params.format === "latex") {
    const created = await createTempLuaFilter();
    luaFilters.push(created.filePath);
    tempFiles.push(created.filePath, created.tempDir);

    // 実験的 Mermaid 無効時: Mermaid コードブロックの言語を削除し、--listings の
    // unknown language 警告を防ぐ。従来の stripMermaidLanguage（TS 正規表現）に代わる
    // AST ベース処理（ADR-005）。
    if (params.stripMermaid) {
      const mermaid = await createTempMermaidFilter();
      luaFilters.push(mermaid.filePath);
      tempFiles.push(mermaid.filePath, mermaid.tempDir);
    }
  }

  if (params.format === "docx" && params.profile.enableAdvancedTexCommands) {
    const docxFilter = await createTempDocxFilter();
    luaFilters.push(docxFilter.filePath);
    tempFiles.push(docxFilter.filePath, docxFilter.tempDir);
  }

  // プロファイル既定値をメタデータとして渡し、文書 frontmatter で上書き可能にする。
  // ただし figureTitle / figPrefix 等は pandoc-crossref 専用メタデータなので、
  // crossref-OFF では消費先がなく無意味。その場合は LaTeX ネイティブの
  // \renewcommand フォールバック（convertCurrentPage 側）に任せ、不要な
  // 一時ファイル生成を避ける。
  // defaults 方式ではキャプション語／参照接頭辞も defaults file 側の `metadata:` で管理する。
  // コマンドライン `--metadata-file` は defaults file より優先されてしまうため、defaults 方式
  // では生成をスキップし、precedence 衝突を回避する（builtin 方式は従来どおり crossref-ON のみ生成）。
  const metadata =
    params.profile.usePandocCrossref && !isDefaultsTemplateMode(params.profile)
      ? await createTempMetadataFile(params.profile)
      : null;
  let metadataFile: string | undefined;
  if (metadata) {
    metadataFile = metadata.filePath;
    tempFiles.push(metadata.filePath, metadata.tempDir);
  }

  try {
    // ADR-009: citation モード（natbib/citeproc）有効かつ PDF 出力のとき、2フェーズ化する。
    // Pandoc には standalone .tex を生成させ（format=latex）、executePandocCommand で反応型
    // LaTeX フェーズに引き継ぐ。.tex パスは PDF 出力パスと同名・拡張子 .tex。
    const citationActive =
      params.format === "pdf" &&
      (params.profile.citationMode === "natbib" || params.profile.citationMode === "citeproc");
    const buildCmdFormat: OutputFormat = citationActive ? "latex" : params.format;
    const texOutputPath = params.outputFile.replace(/\.pdf$/, ".tex");

    const command = buildPandocCommand({
      profile: params.profile,
      format: buildCmdFormat,
      outputPath: citationActive ? texOutputPath : params.outputFile,
      headerPath,
      metadataFile,
      workingDir: params.workingDir,
      extraArgs: params.pandocExtraArgs,
      luaFilters,
      resourcePath:
        (params.resourcePath ?? params.profile.searchDirectory.trim()) || params.workingDir,
    });

    // ADR-009: 反応型修正は latexmk が .tex を処理する2フェーズでのみ意味がある。citation モード時は
    // buildLatexSearchEnv でパックフォルダを検索パスに注入する。latexmk 引数/draft エンジンは
    // ここで1回だけ解決して plan.citation に載せ、executePandocCommand → runReactiveLatexPhase へ
    // そのまま引き継ぐ（env 再構築と resolveLatexInvocation の重複呼び出しを廃止）。
    const envExtra = buildLatexSearchEnv(params.profile, process.platform);
    const citation = citationActive
      ? {
          texPath: texOutputPath,
          pdfPath: params.outputFile,
          ...resolveLatexInvocation(params.profile),
        }
      : undefined;
    return {
      command,
      tempFiles,
      workingDir: params.workingDir,
      envExtra,
      citation,
    };
  } catch (error) {
    await cleanupTemporaryFiles(tempFiles);
    throw error;
  }
}

function createPandocNoticeHandlers(ctx: PluginContext) {
  const NOTICE_LIMIT = 1;
  let noticeCount = 0;
  let overflowNotified = false;

  return {
    onStdout: (data: string) => {
      if (!ctx.settings.suppressDeveloperLogs) {
        console.log(`Pandoc Output: ${data.trim()}`);
      }
    },
    onStderr: (data: string) => {
      const msg = data.toString().trim();
      if (!msg) return;
      if (!ctx.settings.suppressDeveloperLogs) {
        console.warn(`Pandoc stderr: ${msg}`);
      }
      if (noticeCount < NOTICE_LIMIT) {
        new Notice(t("notice_pandoc_stderr", [msg.substring(0, 100)]));
        noticeCount += 1;
      } else if (!overflowNotified) {
        new Notice(t("notice_pandoc_more_logs"));
        overflowNotified = true;
      }
    },
  };
}

async function executePandocCommand(
  plan: PandocExecutionPlan,
  ctx: PluginContext,
  outputFile: string,
  inputContent?: string,
): Promise<boolean> {
  const handlers = createPandocNoticeHandlers(ctx);

  try {
    // ADR-009 関連: Obsidian（GUI）の process.env.PATH は TeX bin を含まないことが多く、PDF
    // エンジン（latexmk/lualatex）が command not found になる。/Library/TeX/texbin 等を PATH に
    // 自動追加する（texPath.ts）。envExtra（TEXINPUTS/BIBINPUTS/BSTINPUTS 等）は末尾でマージし、
    // defaults 方式のテンプレートパックフォルダを LaTeX 検索パスに加える。空オブジェクトなら影響しない。
    const env = { ...buildTexAwareEnv(process.env), ...plan.envExtra };

    if (plan.citation) {
      const texResult = await runCommand(plan.command.command, plan.command.args, {
        cwd: plan.workingDir,
        env,
        input: inputContent,
        onStdout: handlers.onStdout,
        onStderr: handlers.onStderr,
      });
      if (texResult.exitCode !== 0) {
        new Notice(t("notice_pandoc_exit_code", [texResult.exitCode]));
        return false;
      }
      const ok = await runReactiveLatexPhase(
        plan.citation.texPath,
        plan.citation.pdfPath,
        env,
        plan.citation.latexmkArgs,
        plan.citation.draftEngine,
        {
          onStdout: handlers.onStdout,
          onStderr: handlers.onStderr,
          suppressLogs: ctx.settings.suppressDeveloperLogs,
        },
      );
      if (ok) {
        new Notice(t("notice_generated", [path.basename(outputFile)]));
        return true;
      }
      new Notice(t("notice_pandoc_stdin_failed"));
      return false;
    }

    const result = await runCommand(plan.command.command, plan.command.args, {
      cwd: plan.workingDir,
      // ADR-009: envExtra（TEXINPUTS/BIBINPUTS/BSTINPUTS 等）を末尾でマージし、defaults 方式の
      // テンプレートパックフォルダを LaTeX 検索パスに加える。process.env を先に置いて既存環境を
      // 保ち、envExtra で上書きする。空オブジェクトなら影響しない。
      env,
      input: inputContent,
      onStdout: handlers.onStdout,
      onStderr: handlers.onStderr,
    });

    if (result.exitCode === 0) {
      new Notice(t("notice_generated", [path.basename(outputFile)]));
      return true;
    }

    new Notice(t("notice_pandoc_exit_code", [result.exitCode]));
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    new Notice(t("notice_pandoc_launch_error", [errorMessage]));
    return false;
  }
}
