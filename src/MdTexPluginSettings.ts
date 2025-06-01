// MdTexPluginSettings.ts

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
}

/**
* プラグイン全体の設定インタフェース
* 複数のプロファイルと、現在アクティブなプロファイル名を保持する
*/
export interface PandocPluginSettings {
  profiles: { [key: string]: ProfileSettings };
  activeProfile: string;
}

/**
* デフォルトのヘッダIncludes
*/
export const DEFAULT_HEADER_INCLUDES = `---
header-includes:
- |
  \\usepackage{luatexja}
  \\usepackage{luatexja-fontspec}
  \\usepackage{microtype}
  \\usepackage{parskip}
  \\usepackage{listings}
  \\usepackage{color}
  \\usepackage{setspace}
  \\usepackage{booktabs}
  \\usepackage{amsmath,amssymb}
  \\usepackage{mathtools}
  \\usepackage{hyperref}
  \\usepackage{cleveref}
  \\usepackage{autonum}
  \\usepackage{graphicx}
  \\usepackage{caption}

  \\lstset{
    frame=single,
    framesep=3pt,
    basicstyle=\\ttfamily\\scriptsize,
    keywordstyle=\\color{blue}\\bfseries,
    commentstyle=\\color{green!50!black},
    stringstyle=\\color{red},
    breaklines=true,
    numbers=left,
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

---
`;

/**
* デフォルトのプロファイル設定
*/
export const DEFAULT_PROFILE: ProfileSettings = {
pandocPath: "pandoc",
pandocExtraArgs: "",
searchDirectory: "", // ユーザー環境に依存するためデフォルトは空に
headerIncludes: DEFAULT_HEADER_INCLUDES,
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
codeLabel: "Code",
lstPrefix: "Code",
equationLabel: "Equation",
eqnPrefix: "Eq.",
documentClass: "ltjarticle",
documentClassOptions: "",
useStandalone: true,
};

/**
* プラグイン全体のデフォルト設定
*/
export const DEFAULT_SETTINGS: PandocPluginSettings = {
  profiles: {
      'Default': DEFAULT_PROFILE
  },
  activeProfile: 'Default'
};