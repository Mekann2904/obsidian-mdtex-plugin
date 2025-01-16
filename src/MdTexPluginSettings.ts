// PandocPluginSettings.ts

/**
 * プラグイン設定インタフェース
 */
export interface PandocPluginSettings {
    pandocPath: string;            // Pandoc実行コマンド
    pandocExtraArgs: string;       // Pandocに渡す追加オプション（スペース区切り）
    searchDirectory: string;       // Vault内を探索する際のルートディレクトリ
    headerIncludes: string;        // LaTeXヘッダなどのカスタムインクルード
    outputDirectory: string;       // 出力先ディレクトリ（空欄の場合はVaultルート）
    deleteIntermediateFiles: boolean;  // PDF変換時に作成する中間ファイルを削除するか
    pandocCrossrefPath: string;    // pandoc-crossrefの実行ファイルパス
    imageScale: string;            // 画像のデフォルトスケール設定
    usePageNumber: boolean;        // PDF出力時にページ番号を付けるか
    marginSize: string;            // ページ余白サイズ
    fontSize: string;              // フォントサイズ
    outputFormat: string;          // デフォルト出力形式（pdf, latex, docxなど）
    latexEngine: string;           // LaTeXエンジン（lualatex, xelatex, platexなど）
    figureLabel: string;           // 図のラベル
    figPrefix: string;             // 図のプレフィックス
    tableLabel: string;            // 表のラベル
    tblPrefix: string;             // 表のプレフィックス
    codeLabel: string;             // コードのラベル
    lstPrefix: string;             // コードのプレフィックス
    equationLabel: string;         // 数式のラベル
    eqnPrefix: string;             // 数式のプレフィックス
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
   * デフォルト設定
   */
  export const DEFAULT_SETTINGS: PandocPluginSettings = {
    pandocPath: "pandoc",
    pandocExtraArgs: "",
    searchDirectory: "/Users/your-username/obsidian",
    headerIncludes: DEFAULT_HEADER_INCLUDES,
    outputDirectory: "",
    deleteIntermediateFiles: false,
    pandocCrossrefPath: "",
    imageScale: "width=0.8\\linewidth",
    usePageNumber: true,
    marginSize: "1in",
    fontSize: "12pt",
    outputFormat: "pdf",
    latexEngine: "lualatex",
    figureLabel: "Figure",      // 図のラベル (デフォルト: 英語)
    figPrefix: "Figure",        // 図のプレフィックス (デフォルト: 英語)
    tableLabel: "Table",        // 表のラベル (デフォルト: 英語)
    tblPrefix: "Table",         // 表のプレフィックス (デフォルト: 英語)
    codeLabel: "Code",          // コードのラベル (デフォルト: 英語)
    lstPrefix: "Code",          // コードのプレフィックス (デフォルト: 英語)
    equationLabel: "Equation",  // 数式のラベル (デフォルト: 英語)
    eqnPrefix: "Eq.",           // 数式のプレフィックス (デフォルト: 英語)
  };
  