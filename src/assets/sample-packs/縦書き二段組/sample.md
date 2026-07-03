---
date: 2026-06-21
---

<!-- 表題ページ。装飾は chapter-bg.png、文字内容はこの ::: novel-title 内で定義する。
     ブロックの意味:
     1. タイトル
     2. サブタイトル
     3. 左上ラベル
     4. 大きな装飾番号
     5. 上部キャプション
     6. 下部キャプション -->

::: novel-title
サンプル

sample

PART 00

00

Designing the Future / A Handbook of Modern Visual Communication

Making Complex Information Clear / Through Structure and Design
:::

<!-- 章扉。装飾は chapter-bg.png、文字内容はこの ::: novel-chapter 内で定義する。
     ブロックの意味:
     1. 章題
     2. リード見出し
     3. 説明文
     4. 目次風リスト（箇条書き）
     5. 左上ラベル
     6. 上部キャプション
     7. 右上番号
     8. 右端回転キャプション -->

::: novel-chapter
サンプル

わかりやすさを生む秩序のデザイン

情報を効果的に伝えるためには、内容そのものだけでなく、その構造と見せ方を設計することが不可欠である。本章では、余白・階層・グリッドを用いたレイアウトの基本を扱う。

- 1-1　情報の階層と優先順位
- 1-2　グリッドシステムの設計
- 1-3　視線の流れとナビゲーション
- 1-4　余白の設計とリズム
- 1-5　複雑な情報の整理方法

PART 01

Designing the Future / A Handbook of Modern Visual Communication

132

Layout / Grid / Hierarchy
:::

# 雨のあと

　｜雨《あめ》は、まだ｜降《ふ》っていた。｜軒《のき》｜先《さき》から｜滴《しずく》が落ちる音だけが、部屋の｜静《しず》けさを｜際立《きわだ》たせている。

　彼は｜窓《まど》｜際《ぎわ》の｜椅子《いす》に｜腰《こし》をかけたまま、｜空《そら》を見上げていた。｜灰色《はいいろ》の｜空《そら》は、いつまでたっても｜晴《は》れる｜気配《けはい》がない。

\clearpage

<!-- 章扉その2：raw LaTeX で「商業品質」の手動配置（推奨）。
     装飾は \chapterbg（既定は TikZ。実運用は文字なし PDF に \renewcommand で差替）。
     文字は一字ずつサイズ・位置を調整する（雨を大きく、の を小さく、あ・と は呼吸させる）。
     第N章 の採番を進めたいので \refstepcounter{nchapter} を呼ぶ（→ 第二章）。 -->

```{=latex}
\clearpage
\thispagestyle{empty}
\chapterbgshipout
\refstepcounter{nchapter}% 第二章へ採番を進める
% 【手動配置】背景と同じ絶対座標（(0,0)=左下、+x=右、+y=上）の1枚の tikzpicture に、
% 第二章 と章題を1字ずつノードで置く。字ごとにサイズ・間隔を設計値で管理できる。
\AddToShipoutPictureBG*{%
  \put(0,0){%
    \begin{tikzpicture}
      \useasboundingbox (0,0) rectangle (\paperwidth,\paperheight);
      % 第／二／章（小）
      \node[font=\fontsize{15pt}{19pt}\selectfont] at (\paperwidth/2,\paperheight-34mm) {第};
      \node[font=\fontsize{15pt}{19pt}\selectfont] at (\paperwidth/2,\paperheight-47mm) {\nchapterkanji};
      \node[font=\fontsize{15pt}{19pt}\selectfont] at (\paperwidth/2,\paperheight-60mm) {章};
      % 仕切り縦線と小円点
      \draw[black!45,line width=0.3pt] (\paperwidth/2,\paperheight-74mm) -- (\paperwidth/2,\paperheight-90mm);
      \fill[black!60] (\paperwidth/2,\paperheight-82mm) circle (0.9pt);
      % 章題: 雨（大）／の（小）／あ／と。一字ごとにサイズと位置を調整する。
      \node[font=\fontsize{34pt}{38pt}\selectfont] at (\paperwidth/2,\paperheight-108mm) {雨};
      \node[font=\fontsize{22pt}{26pt}\selectfont] at (\paperwidth/2,\paperheight-124mm) {の};
      \node[font=\fontsize{30pt}{34pt}\selectfont] at (\paperwidth/2,\paperheight-140mm) {あ};
      \node[font=\fontsize{30pt}{34pt}\selectfont] at (\paperwidth/2,\paperheight-156mm) {と};
    \end{tikzpicture}%
  }%
}
\mbox{}\clearpage
```

# 霽《れい》の｜間《あいだ》　※見出し内ルビの確認

　｜雨《あめ》が｜上《あ》がると、｜庭《にわ》は｜鮮《あざ》やかな｜緑《みどり》に｜変《か》わっていた。｜水《みず》｜滴《てき》が｜葉《は》から｜滑《すべ》り｜落《お》ち、｜土《つち》の｜匂《にお》いが｜漂《ただよ》う。

　彼はようやく｜椅子《いす》を｜立《た》ち、｜硝子《ガラス》｜戸《ど》を｜開《あ》けた。｜湿《しめ》った｜風《かぜ》が｜頬《ほお》を｜撫《な》でる。｜春《はる》は、もうそこまで来ていた。
