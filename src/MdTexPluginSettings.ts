// File: src/MdTexPluginSettings.ts
// Purpose: プロファイルとプラグイン全体の設定型定義とデフォルト値を管理する。
// Reason: 設定値を型安全に扱い、他ファイルから参照しやすくするため。
// Related: src/MdTexPlugin.ts, src/services/settingsService.ts, src/services/convertService.ts, src/MdTexPluginSettingTab.ts

import { DEFAULT_LATEX_COMMANDS_YAML } from "./data/latexCommands";

/**
 * 1つの設定プロファイルを定義するインタフェース
 */
export interface ProfileSettings {
  pandocPath: string;
  pandocExtraArgs: string;
  searchDirectory: string;
  headerIncludes: string;
  outputDirectory: string;
  deleteIntermediateFiles: boolean;
  pandocCrossrefPath: string;
  usePandocCrossref: boolean;
  imageScale: string;
  usePageNumber: boolean;
  marginSize: string;
  useMarginSize: boolean;
  fontSize: string;
  outputFormat: string;
  latexEngine: string;
  figureLabel: string;
  figPrefix: string;
  tableLabel: string;
  tblPrefix: string;
  codeLabel: string;
  lstPrefix: string;
  equationLabel: string; // `DEFAULT_SETTINGS` に存在しなかったため追加
  eqnPrefix: string;
  /**
   * 文書テンプレート方式（ADR-007）。
   * - "builtin": GUI 設定値から `-V` を生成し、Pandoc の組み込みデフォルトテンプレに
   *   documentclass / fontsize / geometry 等を注入する（既定・後方互換）。
   * - "defaults": defaults file（`-d`）に文書の「枠」の構築を委譲する。documentclass 系の
   *   `-V` 生成をスキップし、Pandoc の precedence 衝突（コマンドライン `-V` が defaults file
   *   を上書きする）を回避する。MdTex 固有レイヤ（Obsidian 記法処理・Lua フィルタ・
   *   `--pdf-engine`・`--resource-path`）は方式に関わらず継続する。
   */
  documentTemplateMode: "builtin" | "defaults";
  /** defaults 方式で読み込む Pandoc defaults file（`-d`）のパス。defaults 方式時は必須。 */
  defaultsFilePath: string;
  /**
   * 選択中のテンプレートパック名（ADR-008）。`defaultsSelection` が `"pack"` の場合、
   * テンプレートフォルダ（`templateFolder`）直下の同名サブフォルダ内の `defaults.yaml` を
   * defaults file として解決する。空文字列は「何も選択されていない」。
   */
  selectedTemplatePack: string;
  /**
   * defaults 方式の defaults file 解決経路（ADR-008）。
   * - "pack": テンプレートフォルダ内のテンプレートパック（`selectedTemplatePack`）から解決。
   * - "custom": 従来の絶対パス（`defaultsFilePath`）をそのまま使用（後方互換）。
   */
  defaultsSelection: "pack" | "custom";
  /**
   * テンプレートパックを格納する vault 内フォルダパス（ADR-008）。既定は `MdTex Templates/`。
   * 直下の各サブフォルダが 1 テンプレートパック。Obsidian Sync / Git で同期され、
   * プラグイン更新で消えない。
   */
  templateFolder: string;
  documentClass: string;
  documentClassOptions: string;
  useStandalone: boolean;
  enableAdvancedTexCommands: boolean;
  /**
   * @deprecated DOCX 用 Lua フィルタは `DOCX_TEX_LUA_FILTER`（main.js 埋め込み）へ
   * 一本化され、loose ファイルパスは参照されなくなりました。既存の data.json との
   * 後方互換性のためフィールド自体は残しますが、実行時には使用されません。
   */
  luaFilterPath: string;
  /**
   * citation モード（ADR-009）。Markdown の `@key` / `[@key]` を LaTeX の `\citep` / `\citet`
   * 等へ変換する Pandoc の出力モード。defaults 方式でのみ GUI で公開する（builtin は対象外）。
   *
   * - "none"（既定）: 変換しない。
   * - "natbib": `--natbib`。学会公式クラス（acl.sty / acmart 等）が `\RequirePackage{natbib}`
   *   で内蔵する natbib と協調する。`--natbib` は defaults file で指定できない（実証済み）ため、
   *   MdTex 側でコマンドラインに明示的に出す必要がある。
   * - "citeproc": `--citeproc`。CSL ベースの引用処理。
   */
  citationMode: "none" | "natbib" | "citeproc";
  /**
   * PDF エンジン（latexmk 等）に渡す追加オプション（ADR-009）。スペース区切りで複数指定可能。
   * 各トークンが Pandoc の `--pdf-engine-opt=<token>` になる。latexmk のサブエンジン指定
   * （例: `-lualatex`）や latexmk 固有オプション（例: `-interaction=nonstopmode`）に使う。
   * bibtex / biber のラウンドトリップ制御は latexmk に一任する（MdTex はラウンドを自前管理しない）。
   * `format` が `pdf` のときのみ意味を持つ。
   */
  pdfEngineOpts: string;
}

/**
 * 文書テンプレート方式が `defaults`（defaults file 委譲）かを判定する（ADR-007）。
 *
 * `documentTemplateMode` は型上は非 optional だが、旧版の `data.json` から読み込んだ
 * 直後はフィールドが欠損し得る（`migrateSettings` の `cloneProfile` が DEFAULT_PROFILE で
 * 補完するまで）。この `?? "builtin"` フォールバックを単一ヘルパーに集約し、各消費側で
 * 正規化ロジックを重複させない。純粋関数なのでユニットテストも容易。
 */
export function isDefaultsTemplateMode(profile: ProfileSettings): boolean {
  return (profile.documentTemplateMode ?? "builtin") === "defaults";
}

/**
 * プラグイン全体の設定インタフェース
 * 複数のプロファイルと、現在アクティブなプロファイル名を保持する
 */
export interface PandocPluginSettings {
  profiles: { [key: string]: ProfileSettings };
  activeProfile: string;
  suppressDeveloperLogs: boolean;
  enableMarkdownlintFix: boolean; // markdownlint-cli2 --fix をPandoc実行前に適用
  markdownlintCli2Path: string; // markdownlint-cli2実行ファイルパス（空は自動解決）
  enableExperimentalMermaid: boolean; // Mermaid DOM rasterization を使うか（実験的）
  latexCommandsYaml: string; // LaTeX コマンドパレット用のユーザ定義 YAML
  enableLatexPalette: boolean; // LaTeXコマンドパレット/補完の有効・無効
  enableLatexGhost: boolean; // ゴーストテキスト補完の有効・無効
  /**
   * 初回サンプルテンプレートパックの展開（scaffold）を完了したか（ADR-008）。
   * true の間は起動時に vault へのサンプル展開を試みない。ユーザーが削除しても再展開しない。
   */
  sampleTemplatesScaffolded: boolean;
  /**
   * 設定タブの折りたたみセクションの開閉状態（設定UI改善）。
   * キーはセクションの安定ID（`preamble`, `latex-palette`, `localization`,
   * `extensions`, `advanced`）。値が `true` なら「折りたたまれている（閉）」、
   * `false` なら「展開されている（開）」。未定義のキューはコード側のデフォルト
   * （`COLLAPSIBLE_SECTIONS_DEFAULT_OPEN`）に従う。開閉するたびに保存される。
   */
  collapsedSections: Record<string, boolean>;
}

/**
 * デフォルトのヘッダIncludes（YAMLを除去した純粋なLaTeXプリセット）
 */
export const DEFAULT_LATEX_PREAMBLE = `\\providecommand{\\passthrough}[1]{#1}

% LuaLaTeX + 日本語
\\usepackage{luatexja-fontspec}
\\usepackage{luatexja-ruby}

% 数式
\\usepackage{unicode-math}

% 欧文（数字含む）は大文字基準で和文に寄せる
\\setmainfont[Scale=MatchUppercase]{Noto Serif}
\\setsansfont[Scale=MatchUppercase]{Noto Sans}
\\setmonofont[Scale=1.18]{Ricty Diminished}


% 和文
\\setmainjfont{Noto Serif CJK JP}
\\setsansjfont{Noto Sans CJK JP}
\\setmonojfont[Scale=1.18]{Ricty Diminished}

% 数式フォント
\\setmathfont{XITS Math}

% 体裁
\\usepackage{microtype}
\\usepackage{parskip}
\\usepackage{xcolor}
\\definecolor{textcolor}{RGB}{34,34,34}
\\usepackage{setspace}
\\linespread{1.1}
\\setcounter{tocdepth}{4}

% 表
\\usepackage{booktabs}
\\usepackage{makecell}
\\usepackage{multirow}
\\usepackage{array}

% 数式環境（mathtools は amsmath を読み込む）
\\usepackage{mathtools}
\\usepackage{amssymb}

% 図
\\usepackage{graphicx}
\\usepackage{caption}
\\captionsetup{labelsep=colon}

% タイトルページ（beamer以外のデフォルトを上書き）
\\usepackage{titling}

\\makeatletter
\\@ifclassloaded{beamer}{%
  % beamer は既定のタイトルページを利用
}{%
  \\renewcommand{\\maketitle}{%
    \\thispagestyle{empty}% タイトルページ番号を消す
    \\begin{center}
      \\vspace*{\\stretch{2}}
      {\\Huge\\bfseries\\thetitle\\par}
      \\vspace{0.8em}
      \\rule{0.55\\textwidth}{0.6pt}\\par
      \\vspace{1.2em}
      \\ifdefined\\subtitle
        {\\large\\subtitle\\par}\\vspace{0.6em}
      \\fi
      {\\large\\theauthor\\par}
      \\ifx\\@date\\@empty\\else\\vspace{0.6em}{\\normalsize\\@date\\par}\\fi
      \\vspace*{\\stretch{3}}
    \\end{center}
  }
}
\\makeatother

% TikZ
\\usepackage{tikz}

% フロート（元の指定を維持）
\\usepackage{float}
\\floatplacement{figure}{H}
\\floatplacement{table}{H}

% 参照（hyperref は遅め、cleveref はその直後、autonum は最後）
\\usepackage[unicode,hypertexnames=false]{hyperref}
\\usepackage{cleveref}
\\usepackage{autonum}

% listings
\\usepackage{listings}
\\lstset{
  frame=single,
  framesep=3pt,
  basicstyle=\\ttfamily,
  columns=fullflexible,
  keepspaces=true,
  keywordstyle=\\color{blue}\\bfseries,
  commentstyle=\\color{green!50!black},
  stringstyle=\\color{red},
  breaklines=true,
  numbers=none,
  numberstyle=\\tiny\\color{gray},
  stepnumber=1,
  tabsize=4
}

\\lstdefinelanguage{zsh}{
  morekeywords={ls, cd, pwd, echo, export, alias, unalias, function},
  sensitive=true,
  morecomment=[l]{\\#},
  morestring=[b]",
  morestring=[b]'
}

% codelisting 浮動体環境（Pandoc 3.8+ の --listings 互換）
% Pandoc 3.8 以降はキャプション付きコードブロックを \\begin{codelisting}...\\end{codelisting}
% として出力するが、codelisting 環境は listings パッケージに含まれず newfloat で別途
% 定義が必要。これがないと「! LaTeX Error: Environment codelisting undefined.」で
% PDF 生成が停止する。pandoc-crossref の Listing 参照や cleveref とも整合する。
\\usepackage{newfloat}
\\DeclareFloatingEnvironment[
  fileext=lol,
  listname={List of Listings},
  name=Listing
]{codelisting}

% 引用ボックス
\\usepackage{tcolorbox}
\\tcbuselibrary{breakable, skins}

\\newtcolorbox{blockquote}{
  breakable,
  enhanced,
  colback=black!2,
  colframe=black!40,
  boxrule=0pt,
  leftrule=1pt,
  sharp corners,
  arc=0pt, outer arc=0pt,
  top=6pt, bottom=6pt,
  left=0.8em, right=0em,
  before skip=6pt, after skip=6pt,
  frame hidden,
  borderline west={1pt}{0pt}{black!40}
}

\\makeatletter
\\renewenvironment{quote}
  {\\begin{blockquote}\\list{}{\\leftmargin=0pt\\rightmargin=0pt}\\item\\relax\\small}
  {\\endlist\\end{blockquote}}
\\renewenvironment{quotation}
  {\\begin{blockquote}\\list{}{\\leftmargin=0pt\\rightmargin=0pt}\\item\\relax\\small}
  {\\endlist\\end{blockquote}}
\\makeatother

% 見出し
\\renewcommand{\\labelitemii}{\\textbullet}
\\renewcommand{\\labelitemiii}{\\textbullet}
\\renewcommand{\\labelitemiv}{\\textbullet}

\\makeatletter
\\renewcommand{\\paragraph}{\\@startsection{paragraph}{4}{\\z@}%
  {3.25ex \\@plus 1ex \\@minus .2ex}%
  {1em}%
  {\\normalfont\\normalsize\\bfseries\\noindent}}

\\renewcommand{\\subparagraph}{\\@startsection{subparagraph}{5}{\\z@}%
  {3.25ex \\@plus 1ex \\@minus .2ex}%
  {1em}%
  {\\normalfont\\normalsize\\bfseries\\noindent}}
\\makeatother`.trim();

/**
 * デフォルトのプロファイル設定
 */
export const DEFAULT_PROFILE: ProfileSettings = {
  pandocPath: "pandoc",
  pandocExtraArgs: "",
  searchDirectory: "", // ユーザー環境に依存するためデフォルトは空に
  headerIncludes: DEFAULT_LATEX_PREAMBLE,
  outputDirectory: "",
  deleteIntermediateFiles: false,
  pandocCrossrefPath: "pandoc-crossref", // PATHにあることを期待
  usePandocCrossref: true,
  imageScale: "width=0.8\\textwidth",
  usePageNumber: true,
  marginSize: "25mm",
  useMarginSize: true,
  fontSize: "11pt",
  outputFormat: "pdf",
  latexEngine: "lualatex",
  figureLabel: "Figure",
  figPrefix: "Fig.",
  tableLabel: "Table",
  tblPrefix: "Table",
  codeLabel: "Listing",
  lstPrefix: "Listing",
  equationLabel: "Equation",
  eqnPrefix: "Eq.",
  documentTemplateMode: "builtin",
  defaultsFilePath: "",
  selectedTemplatePack: "",
  defaultsSelection: "pack",
  templateFolder: "MdTex Templates",
  documentClass: "ltjarticle",
  documentClassOptions: "",
  useStandalone: true,
  enableAdvancedTexCommands: true,
  // @deprecated（使用されません。後方互換性のため既定値を維持）
  luaFilterPath: "tex-to-docx.lua",
  citationMode: "none",
  pdfEngineOpts: "",
};

/**
 * プラグイン全体のデフォルト設定
 */
export const DEFAULT_SETTINGS: PandocPluginSettings = {
  profiles: {
    Default: DEFAULT_PROFILE,
  },
  activeProfile: "Default",
  suppressDeveloperLogs: true,
  enableMarkdownlintFix: false,
  markdownlintCli2Path: "",
  enableExperimentalMermaid: false,
  latexCommandsYaml: DEFAULT_LATEX_COMMANDS_YAML,
  enableLatexPalette: true,
  enableLatexGhost: true,
  sampleTemplatesScaffolded: false,
  collapsedSections: {},
};
