// File: src/utils/calloutTheme.ts
// Purpose: コールアウト用のLaTeXプリセット（tcolorbox）を一箇所にまとめて提供する。
// Reason: 変換サービスの肥大化を防ぎ、デザイン変更を容易にするため。
// Related: src/services/convertService.ts, src/assets/callout-filter.ts

export const CALLOUT_PREAMBLE = `
\\makeatletter
\\@ifpackageloaded{tcolorbox}{}{\\usepackage{tcolorbox}}
\\makeatother
\\tcbuselibrary{skins,breakable}
\\usepackage{fontawesome5}
% カラー定義
\\definecolor{callout-bg}{HTML}{EEF3FF}
\\definecolor{callout-accent}{HTML}{2563EB}
\\definecolor{callout-text}{HTML}{0F172A}
\\definecolor{callout-quote}{HTML}{64748B}
% タイプ別カラー（未定義色エラーを防ぐ）
\\definecolor{callout-memo}{HTML}{2563EB}
\\definecolor{callout-note}{HTML}{2563EB}
\\definecolor{callout-info}{HTML}{0EA5E9}
\\definecolor{callout-todo}{HTML}{2563EB}
\\definecolor{callout-tip}{HTML}{16A34A}
\\definecolor{callout-success}{HTML}{16A34A}
\\definecolor{callout-question}{HTML}{8B5CF6}
\\definecolor{callout-warning}{HTML}{F59E0B}
\\definecolor{callout-failure}{HTML}{EF4444}
\\definecolor{callout-danger}{HTML}{EF4444}
\\definecolor{callout-bug}{HTML}{EF4444}
\\definecolor{callout-example}{HTML}{2563EB}

\\newtcolorbox{obsidiancallout}[3]{%
  % 基本設定
  breakable,
  enhanced,
  parbox=false,
  
  % カラー設定
  colback=callout-bg,       % 背景色
  colframe=callout-bg,      % フレーム色（背景と同化させる）
  colbacktitle=callout-bg,  % タイトル背景（背景と同化させる）
  coltitle=#1,              % タイトル文字色（引数で指定された色）
  coltext=callout-text,     % 本文文字色
  
  % 枠線と左ラインの設定（ここが重要）
  boxrule=0pt,              % 全体の枠線はなし
  frame hidden,             % フレーム描画を隠す（背景色のみにする）
  borderline west={3pt}{0pt}{#1}, % ★左側に3ptのラインを追加（色はタイトルと同じ）
  
  % 角丸設定
  arc=3pt,
  outer arc=3pt,
  sharp corners=west,       % 左側の角は直角にする（ラインをきれいに見せるため）
  
  % 余白設定（レイアウト調整）
  left=10pt,                % 左余白（ラインからの距離）
  right=10pt,               % 右余白
  top=0pt,                  % 本文上の余白
  bottom=10pt,              % 本文下の余白
  
  % タイトル設定
  toptitle=8pt,             % タイトル上の余白
  bottomtitle=2pt,          % タイトル下の余白
  titlerule=0mm,            % タイトルと本文の間の線を消す
  fonttitle=\\bfseries\\sffamily,
  
  % タイトル内容
  title={#2\\hspace{0.5em}#3},
}
`;
