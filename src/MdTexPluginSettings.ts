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
  documentClass: string;
  documentClassOptions: string;
  useStandalone: boolean;
  enableAdvancedTexCommands: boolean;
  luaFilterPath: string;
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
documentClass: "ltjarticle",
documentClassOptions: "",
useStandalone: true,
enableAdvancedTexCommands: true,
luaFilterPath: "tex-to-docx.lua",
};

/**
* プラグイン全体のデフォルト設定
*/
export const DEFAULT_SETTINGS: PandocPluginSettings = {
  profiles: {
      'Default': DEFAULT_PROFILE
  },
  activeProfile: 'Default',
  suppressDeveloperLogs: true,
  enableMarkdownlintFix: false,
  markdownlintCli2Path: "",
  enableExperimentalMermaid: false,
  latexCommandsYaml: DEFAULT_LATEX_COMMANDS_YAML,
  enableLatexPalette: true,
  enableLatexGhost: true,
};
