---
name: create-mdtex-template-pack
description: MdTeX Obsidian プラグイン用に、新しいテンプレートパック（文書テンプレート一式）を作成・検証する。縦書き小説・学会論文・レポート等の「文書の枠」を defaults.yaml + preamble + Lua フィルタで構築し、Pandoc 経由で実際に PDF 生成まで通す。新しいテンプレートを作る時にこのガイドを見れば一通り完結する。
---

# MdTeX テンプレートパック作成ガイド

このファイルは、MdTeX プラグインのテンプレートフォルダ（このフォルダ）に
**新しいテンプレートパックを自作するためのガイド**である。
テンプレートパックの使い方（選んで PDF に出す）は [README.md](./README.md) を参照すること。

---

## テンプレートパックの解剖

```
MdTeX Templates/                    ← このフォルダ
├── README.md                       ← 使い方ガイド（ユーザー向け）
├── SKILL.md                        ← このファイル（作成ガイド）
├── 縦書き二段組/                    ← パック例
│   ├── defaults.yaml               ← ★必須: Pandoc defaults file（パックの入口）
│   ├── tate-twocolumn.tex          ←    任意: カスタム Pandoc テンプレート
│   ├── preamble.tex                ←    任意: プリアンブル（章扉・表題ページ付き）
│   ├── aozora-ruby.lua             ←    任意: Lua フィルタ（ルビ・章扉記法）
│   ├── chapter-bg.lua             ←    任意: Lua フィルタ（章扉背景画像の絶対パス解決）
│   └── sample.md                   ←    任意: すぐPDF出せる本文サンプル
└── <あなたのパック>/                ← 自作パック
    └── defaults.yaml               ← 最低これだけあれば認識される
```

- **`defaults.yaml` を含むフォルダだけがテンプレートパックとして認識される。**
  README.md / SKILL.md のように直下のファイルはパック扱いされない。
- 補助ファイルは同じフォルダに置き、`${.}`（defaults.yaml 自身のディレクトリ）で参照する。
  これでパック全体をフォルダ単位でコピー・Git 管理できる。
- **defaults 方式では MdTeX の組み込みプリアンブル（`DEFAULT_LATEX_PREAMBLE`）が入らない。**
  これがすべての落とし穴の根本原因。後述の表を必ず確認すること。

---

## ワークフロー

### 1. 目的を固定する

何を欲しているか（縦書き小説 / 学会論文 / レポート / カスタムクラス等）を明確にする。
複数候補がある場合は、まず1つに絞ってから作る。

### 2. 似た既存パックを土台にする

ゼロから書かず、目的に近いサンプルパックをコピーして編集する:

| 目的 | 土台にするパック |
|---|---|
| 縦書き・小説・和文組版 | `縦書き二段組` |
| 二段組論文・レポート・学術（LuaLaTeX 前提） | `情報系論文風` |
| **pLaTeX 専用クラス（ipsj 等）** | `pLaTeX学会論文` |

> **どの土台を選ぶか迷ったら**: 使いたいクラス（`.cls`/`.sty`）が LuaLaTeX で動くか
> pLaTeX 専用かで分かれる。後述の「pLaTeX 専用クラスを使う場合」の決定木を参照。

### 3. defaults.yaml を書く

最小構成から始め、必要なスロットだけ足す:

```yaml
from: markdown+raw_tex+raw_html+fenced_divs+raw_attribute+fenced_code_attributes
to: pdf
pdf-engine: lualatex
standalone: true

template: ${.}/my-template.tex          # カスタム枠が必要な場合
include-in-header: ${.}/preamble.tex    # プリアンブル
filters:                                # 記法拡張
  - ${.}/my-filter.lua

variables:
  documentclass: ltjsarticle
  classoption: "twocolumn, a4paper"
  fontsize: 11pt
  geometry:
    - margin=25mm
```

### 4. 本文（`.md`）は通常の Markdown で書く

defaults 方式でも MdTeX 固有機能（Obsidian 記法・callout・Mermaid・pandoc-crossref）はそのまま使える。
見出しは `#` `##` を使い、テンプレート側（preamble の `titlesec` 等）で見た目を整える。

### 5. 【必須】PDF 生成まで通して検証する

**パックは「Pandoc が実際に PDF を出すこと」まで確認して完成とする。** LaTeX エラーは
実行してみないと分からない。MdTeX 本体を通さず、Pandoc 直接実行で素早く回す:

```bash
cd <vault-root>
pandoc <本文>.md \
  -d "MdTeX Templates/<パック名>/defaults.yaml" \
  -o /tmp/pack-test.pdf
```

- エラーが出たら下記の落とし穴表と照合し、preamble を直して再実行。
- 成功したら生成 PDF の見た目（文字サイズ・余白・段組・見出し）を確認し、必要なら defaults/preamble を微調整。

### 6. 設定で選ぶ

1. MdTeX 設定 → 対象プロファイルの「文書テンプレート方式」を **defaults file** に
2. 「defaults file の指定方法」を **テンプレートパックから選択** に
3. 「テンプレートパック」の横の **再スキャン** を押す
4. ドロップダウンから自分のパックを選ぶ

---

## パックメタ（自己記述化）

パックフォルダに `_mdtex.yaml` を置くと、パックが**自分自身の説明・前提・推奨設定**を宣言できる。設定画面でパックを選んだとき、MdTeX がこのメタを読んで:

- **title / description** を表示（フォルダ名だけだと分からない用途を明示）
- **requires** のファイルがパックフォルダに無ければ**警告**（ipsj.cls 未配置等を実行前検知）
- **recommendedProfile** が現在のプロファイルとズレていれば**「推奨設定を適用」**ボタンを提示

`_mdtex.yaml` は defaults.yaml と**別ファイル**にする（Pandoc が読む defaults.yaml に未知キーを書くと `Unknown option` エラーになるため）。MdTeX だけが `_mdtex.yaml` を読む。書かなくてもパックは動く（フォルダ名だけで選択できる従来動作を維持）。

### フィールド

```yaml
# _mdtex.yaml（パックフォルダに配置。defaults.yaml と同じフォルダ）
title: "情報系論文風（LuaLaTeX）"        # 表示名。未指定ならフォルダ名を使う
description: "AI学会風の二段組。"         # 一行説明
engine: lualatex                          # 想定 PDF エンジン（表示専用）
requires:                                 # ユーザー配置が必要な外部ファイル
  - ipsj.cls
recommendedProfile:                       # パックが推奨するプロファイル設定
  citationMode: natbib                    # none / natbib / citeproc
  latexEngine: latexmk
  pdfEngineOpts: "-latex=platex -pdfdvi"  # スペースを含む場合はクォート
```

- 全フィールド省略可能。`_mdtex.yaml` が空でもエラーにはならない（表示しないだけ）。
- `requires` はパックフォルダ（defaults.yaml と同じフォルダ）内のファイル名。MdTeX が存在確認し、不足を警告する。
- `recommendedProfile` の「適用」は、ズレている項目だけを現在のプロファイルに上書きする。

### いつ書くべきか

- **公式クラスを使うパック**（ipsj / acmart 等）→ `requires` と `recommendedProfile` を必ず書く。実行前の前提チェックと設定の自動適用が効く。
- **配布想定のパック** → `title` / `description` を書くと、受け取った人がドロップダウンで用途を即座に理解できる。
- **個人用** → 省略して構わない。

---

## 落とし穴（defaults 方式固有）

`DEFAULT_LATEX_PREAMBLE` が入らないため、以下は preamble 側で自前で用意する。
エラーメッセージが出たらこの表で原因を特定する:

| エラー | 原因 | 対処（preamble.tex） |
|---|---|---|
| `Undefined control sequence. ... \passthrough` | raw 記法の出力先コマンド未定義 | `\providecommand{\passthrough}[1]{#1}` |
| `Undefined control sequence. ... \lstinline` | `listings` 未ロード | `\usepackage{listings}` + `\lstset{...}` |
| `longtable not in 1-column mode` | 二段組と `longtable` は非互換 | 表を段抜き(`table*`)にする、または Lua フィルタで `tabular` に変換（`情報系論文風` の `simple-table.lua` 参照） |
| `! LaTeX Error: Command \eth already defined` | `unicode-math`（Pandoc 既定）と `amssymb` が衝突 | preamble で `amssymb` を読み込まない（`amsmath` までに留める） |
| `zw` 単位のエラー | `zw` は `\begin{document}` 後に定義される | preamble では `pt`/`mm` 等の絶対単位を使う。本文開始後の設定は `\AtBeginDocument{...}` |
| `Undefined control sequence. ... \ruby` | `luatexja-ruby` 未ロード | `\usepackage{luatexja-ruby}` |
| `! LaTeX Error: Environment codelisting undefined` | キャプション付きコードブロック | `\usepackage{newfloat}` + `\DeclareFloatingEnvironment[fileext=lol,name=Listing]{codelisting}` |
| クラスオプション `9pt` が無視される | `ltjtarticle`/`ltjsarticle` は一部サイズを無視 | `\AtBeginDocument{\fontsize{...}{...}\selectfont}` で本文サイズを明示 |
| 縦書きで `\jidori` が未定義 | `ltjtarticle` は `\jidori` を提供しない | `\makebox[幅][l]{...}` で代用（話者名の字取り等） |
| `Cannot determine size of graphic ... (no BoundingBox)` | pLaTeX+dvi 経路で extractbb がスペース入り画像名をトークン分割 | `sanitize-images.lua` で画像名を sanitize（`pLaTeX学会論文` パック参照） |
| `Undefined control sequence. ... \phantomsection` | 数式ラベル用アンカー。hyperref 由来だが partial で未ロード | `\usepackage[dvipdfmx]{hyperref}` を preamble 末尾に |
| コードキャプションが2重表示 / 縦1文字折れ | Pandoc 3.8+ が codelisting + lstlisting[caption] の両方を出す | `code-blocks.lua` で captionof + lstlisting に変換（`pLaTeX学会論文` 参照） |
| 画像ファイル名がPDFにテキストで表示される（画像が貼られない） | (a) pandoc の作業ディレクトリが .md の場所なのでパック内画像が見つからない、(b) pandoc が絶対パスを72桁で折り返し、スペースが改行に置換されて lualatex が画像を見失いドラフトモードでファイル名を描画 | (a) Lua フィルタで画像を絶対パス解決（`縦書き二段組/chapter-bg.lua`）、(b) defaults.yaml に `wrap: none` を追加（パスを1行に保つ）。画像は *metadata:* に置くこと（Lua フィルタが読めるのは metadata のみ） |

---

## 学会論文クラスを使う場合（ACL / acmart / IEEEtran 等）

実在の学会公式クラス（`acl.sty` / `acmart.cls` / `IEEEtran.cls` 等）は、**Markdown ノート前提の MdTeX の固定挙動と衝突する**箇所がある。これらは「ノート → PDF」の変換層と「学会論文」の組版要件のズレが原因。以下をテンプレート側で対処すれば、プラグイン本体を変えずに学会論文 PDF が出る。

### 必須のテンプレート側対処

| 衝突する挙動 | 原因 | 対処（パック側） |
|---|---|---|
| **表が `longtable` で 2カラム停止** | Pandoc 標準出力。学会クラスは多くが twocolumn | `filters: ${.}/simple-table.lua` で `table`+`tabular` に変換。`情報系論文風` と同じ Lua をパックにコピーする |
| **inline code が `\passthrough` で停止** | MdTeX が常時 `--listings` を付けるため、Pandoc が `\passthrough{\lstinline!...!}` を出すが、defaults 方式では同マクロ未定義 | preamble に `\providecommand{\passthrough}[1]{#1}` |
| **日本語が文字化け/エラー** | LuaLaTeX はエンジンとしては日本語対応だが、和文フォント指定がないと化ける | preamble に `\usepackage{luatexja-fontspec}` + `\setmainjfont{...}`（`acl.sty` と共存確認済み） |
| **参考文献スタイルの二重定義** | クラスが内蔵 `\bibliographystyle`（例: `acl_natbib`）と Pandoc の `plainnat` が衝突 | MdTeX の citation パイプラインが `.aux` を見て反応型に `plainnat` を除去する（ADR-009）。**パック作成者は対処不要**。`citationMode: natbib` + `latexEngine: latexmk` + `pdfEngineOpts: -lualatex` の設定三点セットが必要 |

### 設定三点セット（学会論文 + 引用）

学会クラスで参考文献を含む PDF を出すには、MdTeX 設定で:

| 設定項目 | 値 | 理由 |
|---|---|---|
| `latexEngine` | `latexmk` | citation パイプライン（2フェーズ）の起動に必要。`-lualatex` は latexmk のサブエンジン指定なので、lualatex バイナリのフルパスでは動かない |
| `pdfEngineOpts` | `-lualatex` | latexmk に LuaLaTeX を使わせる。日本語パッケージ（luatexja）も LuaLaTeX 必要 |
| `citationMode` | `natbib` | Pandoc の `@key` / `[@key]` を `\citet` / `\citep` に変換。これがないと citation パイプラインが起動しない |

### 学会論文クラスでは無害（対処不要）な MdTeX の固定挙動

実証済み（ACL + 各挙動で PDF 生成を確認）:

- **CALLOUT_PREAMBLE の強制ロード**（tcolorbox / fontawesome5 / pgf / tikz）: クラスと衝突しない。コンパイル時間 +0.8s 程度のみ。コールアウトを使わなければ機能的に無害
- **codelisting 浮動体環境の強制定義**（newfloat）: クラス側が未定義なら無害
- **`--highlight-style=tango`**: コードハイライト色の指定のみ、見た目の問題で機能障害ではない

### 制限事項（プラグイン本体側の課題）

- **`--listings` をパック/プロファイルから on/off できない**: これが `\passthrough` 問題の根源。現状は preamble の `\providecommand` で凌ぐ。本体側で `useListings` 設定を足す改良が将来課題

---

## pLaTeX 専用クラスを使う場合（ipsj 等）

情報処理学会 `ipsj` 等、**pLaTeX/upLaTeX 専用**のクラスは、MdTeX の既定（LuaLaTeX）では動かない。
`pLaTeX学会論文` パックが土台。ここでは「なぜ動かないか」と「どう作るか」を説明する。

### LuaLaTeX で動くか pLaTeX 専用かの決定木

```
使いたいクラスは？
├─ LuaLaTeX で動く（ltjsarticle / ltjtarticle / 情報系論文風 / ACL 等）
│  └─ デフォルトラテン + Lua フィルタ追加で OK（情報系論文風パターン）
└─ pLaTeX/upLaTeX 専用（ipsj / jeconomy / 配布 .cls の多く）
   └─ Pandoc の partial を「全除外」して自前 template: を書く
      ↓
      プロファイル設定: latexEngine=latexmk, pdfEngineOpts=-latex=platex -pdfdvi
      ↓
      .cls をパックフォルダに配置（MdTeX が TEXINPUTS に自動追加）
```

### なぜ「partial 全除外」が必要か

Pandoc のデフォルトラテン（`default.latex`）は partial 経由で `unicode-math` / `fontspec` /
`hyperref` 等をロードする。これらは **pTeX と互換性がない**:

```
! Package unicode-math Error: Cannot be run with uptex!
Use XeLaTeX or LuaLaTeX instead.
```

builtin 方式ではこの partial が必ず入るため、pLaTeX 専用クラスは**絶対に動かない**。
defaults 方式 + 自前 `template:` で partial を呼ばなければ回避できる。

### 自前テンプレートで失われるマクロ（要補完）

partial を除外すると、`default.latex` 本体に直書きされたマクロも消える。preamble.tex で補う:

| マクロ | 由来 | 役割 | 依存パッケージ |
|---|---|---|---|
| `\pandocbounded` | default.latex 本体 | 画像のサイズ自動収め | graphicx |
| `\tightlist` | default.latex 本体 | 箇条書きの詰め | なし |
| `\phantomsection` | hyperref（partial 経由） | 数式ラベル用アンカー | hyperref |
| `\passthrough` | default.latex 本体 | inline code のラッパ | listings |

> `pLaTeX学会論文` パックの `preamble.tex` にこれら全ての補完ブロックが入っている。
> ゼロから書く場合は、このブロックをコピーすればよい（Pandoc バージョン非依存）。

### 必須のプロファイル設定

| 設定項目 | 値 | 理由 |
|---|---|---|
| `latexEngine` | `latexmk` | pLaTeX + dvipdfmx のラウンド制御 |
| `pdfEngineOpts` | `-latex=platex -pdfdvi` | latexmk に pLaTeX と dvi 経由 PDF を使わせる。upLaTeX 専用クラスなら `-latex=uplatex` |
| 文書テンプレート方式 | `defaults file` | builtin では partial が入って動かない |

> ※ MdTeX は `--pdf-engine` / `--pdf-engine-opt` を常時生成し defaults 本体を上書きするため、
> defaults.yaml とプロファイル**両方**に同じ値を設定すること。

### .cls / .bst の配置

公式配布の `.cls`（ipsj.cls 等）は著作権でプラグインに同梱できない。パックフォルダに手動で置く:

1. 公式サイトからダウンロード（ipsj: https://www.ipsj.or.jp/journal/submit/style.html ）
2. パックフォルダ（例: `MdTeX Templates/pLaTeX学会論文/`）に `.cls` を置く
3. MdTeX は defaults 方式でパックフォルダを `TEXINPUTS` / `BIBINPUTS` / `BSTINPUTS` に自動追加（ADR-009）

### デバッグ: 中間 .tex が見えない問題

MdTeX 経由だと中間 `.tex` が temp dir（`tex2pdf.*`）に作られて即時削除される。エラーの行番号は
見えても中身が分からない。**Pandoc を直接実行して .tex を取り出し、pLaTeX で原因分離**する:

```bash
cd <vault-root>
# 1. .tex を取り出す（-o で .pdf ではなく .tex を指定）
pandoc <本文>.md -d "MdTeX Templates/<パック>/defaults.yaml" -t latex -o /tmp/debug.tex
# 2. .cls を見つけさせる（MdTeX が自動注入する TEXINPUTS を手動で再現）
TEXINPUTS="MdTeX Templates/<パック>:" platex -interaction=nonstopmode -halt-on-error /tmp/debug.tex
```

エラーが `! Undefined control sequence` なら、上記「失われるマクロ」表を確認。
`(guessed encoding ...)` の大量ログは pLaTeX の通常出力（無視可）。本物のエラーは `! ` で始まる行。

---

## 設計の指針

- **Markdown 本文に LaTeX コマンドを大量に書かせない。** 記法は Lua フィルタで拡張し、
  本文は Markdown らしく保つ。`縦書き二段組` の `aozora-ruby.lua` が実例:
  `｜親文字《よみ》` → `\ruby`、`::: novel-chapter` → 章扉マクロ `\novelchapter`。
- **見出しは Markdown の `#`/`##` を使い、見た目は preamble の `titlesec` で整える。**
  本文に `\novelchapter{}` 等の LaTeX マクロを直接書かず、`::: novel-chapter` 記法を使う。
  （章扉の「雨を大きく・の を小さく」のような1字ごとの微調整が必要な場合だけ、
  `{=latex}` 生ブロックで TikZ 座標を直接書く。`縦書き二段組/sample.md` に両方の実例。）
- **責務分離**: `defaults.yaml`（Pandoc 設定）/ `*.tex`（枠）/ `preamble.tex`（見た目）/ `*.lua`（記法拡張）。
- builtin 方式の GUI 設定と混同しない。defaults 方式では
  documentclass / fontsize / geometry は **defaults.yaml 側** で管理する。
- **章扉・表題は「装飾」と「文字」を分離する。** 装飾（薄墨・淡円・植物など）は
  `chapter-bg.pdf` 等の「文字なし画像/PDF」で作り、文字は LaTeX で組む。背景は
  `\AddToShipoutPictureBG*`（現ページ限定）で貼り、文字は絶対座標の TikZ ノードで載せる。
  `縦書き二段組/preamble.tex` の `\chapterbg` / `\novelchapter` / `\noveltitle` 参照。
- **装飾画像は defaults.yaml の *metadata:* で差し替える（preamble を編集しない）。**
  `metadata: chapter-bg-image: chapter-bg.pdf` をセットすると、`chapter-bg.lua` が実
  ファイルを探索して絶対パスに解決し、テンプレートが
  `\renewcommand{\chapterbg}{\includegraphics{...}}` を生成して TikZ 既定装飾を上書き
  する。未指定時は TikZ 既定（薄墨＋淡円）にフォールバックする。注意:
  - *metadata:* に書くこと（Lua フィルタが読めるのは metadata のみ）。plugin 経由では
    pandoc の作業ディレクトリが元の .md の場所になるため、パックフォルダの画像が
    見つからず「File not found: using draft setting」でファイル名がテキスト描画される。
    chapter-bg.lua の絶対パス解決がこの落とし穴を潰す。
  - ファイル名にスペース・全角文字は使わないこと（graphicx がトークン分割する）。
  - `${.}` は defaults file の `template:` / `include-in-header:` / `resource-path:` 等
    「ファイル参照」フィールドでのみ絶対パスに展開される。`variables:` の値では
    リテラルの `${.}` になるので、変数値経由では絶対パスを渡せない（Lua フィルタで処理）。
- **学会論文クラスでは simple-table.lua を必ず入れる。** longtable は 2カラムで停止するが、
  Lua フィルタで `table`+`tabular` に変換すれば本体制御不要で解決する（上記「学会論文クラスを使う場合」参照）。
- **画像・コード・表の LaTeX 変換は Pandoc（+ Lua フィルタ）に委譲する。** MdTeX 本体は
  Markdown 前処理（`%%` 除去・`![[画像]]` → `![](path)`・transclusion）しか行わず、LaTeX 化は Pandoc が担う。
  したがって変換結果の調整は defaults.yaml の `filters:` / `template:` / `include-in-header:` で行う。
- **pLaTeX 専用クラスを使うなら、最初から defaults 方式 + 自前テンプレートで始める。**
  builtin 方式では partial が pTeX 非互換パッケージをロードして必ず失敗する。`pLaTeX学会論文` パックを
  土台にし、マクロ補完セット（`\pandocbounded` 等）を必ず preamble に含める（上記「pLaTeX 専用クラスを使う場合」参照）。

---

## バンドルサンプルにする場合（プラグイン開発者向け）

作ったパックを「全ユーザーへ初回展開されるサンプル」にしたい場合:

1. ファイルを `src/assets/sample-packs/<パック名>/` に置く
2. `src/assets/sampleTemplatePacks.ts` の `SAMPLE_TEMPLATE_PACKS` にエントリを追加
3. `npm run build` で main.js に埋め込む（esbuild の text loader が `.tex`/`.lua`/`.yaml`/`.md` を処理）
4. 初回起動時に各ユーザーの vault へ展開される（**存在しない場合だけ**）

個人的に使うだけなら、このステップは不要。パックフォルダを `MdTeX Templates/` に置くだけで使える。

---

## 参照

- 使い方（選んで PDF に出す）: [README.md](./README.md)
- Pandoc defaults file の全オプション: [Pandoc User's Guide: Defaults files](https://pandoc.org/MANUAL.html#defaults-files)
- `${.}` 変数: defaults file 自身のディレクトリを指す Pandoc の特殊変数。
