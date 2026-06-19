---
name: create-mdtex-template-pack
description: MdTex Obsidian プラグイン用に、新しいテンプレートパック（文書テンプレート一式）を作成・検証する。縦書き小説・学会論文・レポート等の「文書の枠」を defaults.yaml + preamble + Lua フィルタで構築し、Pandoc 経由で実際に PDF 生成まで通す。新しいテンプレートを作る時にこのガイドを見れば一通り完結する。
---

# MdTex テンプレートパック作成ガイド

このファイルは、MdTex プラグイン用に **新しいテンプレートパックを自作するためのガイド**です。
テンプレートパックの使い方（選んで PDF に出す）は [README.md](./README.md) を参照してください。

---

## テンプレートパックの解剖

```
<vault>/MdTex Templates/            ← ユーザーのテンプレートフォルダ（MdTex 設定で指定）
└── <パック名>/                      ← フォルダ名 = ドロップダウンに表示される名前
    ├── defaults.yaml               ← ★必須: Pandoc defaults file（パックの入口）
    ├── <name>.tex                  ←    任意: カスタム Pandoc テンプレート
    ├── preamble.tex                ←    任意: プリアンブル（\usepackage・マクロ）
    └── <name>.lua                  ←    任意: Lua フィルタ（記法拡張）
```

- **`defaults.yaml` を含むフォルダだけがテンプレートパックとして認識される。**
- 補助ファイルは同じフォルダに置き、`${.}`（defaults.yaml 自身のディレクトリ）で参照する。
  これでパック全体をフォルダ単位でコピー・Git 管理できる。
- **defaults 方式では MdTex の組み込みプリアンブル（`DEFAULT_LATEX_PREAMBLE`）が入らない。**
  これがすべての落とし穴の根本原因。後述の表を必ず確認すること。

---

## ワークフロー

### 1. 目的を固定する

何を欲しているか（縦書き小説 / 学会論文 / レポート / カスタムクラス等）を明確にする。
複数候補がある場合は、まず1つに絞ってから作る。

### 2. 似た既存パックを土台にする

ゼロから書かず、目的に近いサンプルパックをコピーして編集する。
このリポジトリのサンプルは `src/assets/sample-packs/縦書き二段組/`（縦書き）と
`src/assets/sample-packs/情報系論文風/`（論文）にあります。

| 目的 | 土台にするパック |
|---|---|
| 縦書き・小説・和文組版 | `src/assets/sample-packs/縦書き二段組/` |
| 二段組論文・レポート・学術 | `src/assets/sample-packs/情報系論文風/` |

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

defaults 方式でも MdTex 固有機能（Obsidian 記法・callout・Mermaid・pandoc-crossref）はそのまま使える。
見出しは `#` `##` を使い、テンプレート側（preamble の `titlesec` 等）で見た目を整える。

### 5. 【必須】PDF 生成まで通して検証する

**パックは「Pandoc が実際に PDF を出すこと」まで確認して完成とする。** LaTeX エラーは
実行してみないと分からない。MdTex 本体を通さず、Pandoc 直接実行で素早く回す:

```bash
cd <vault-root>
pandoc <本文>.md \
  -d "MdTex Templates/<パック名>/defaults.yaml" \
  -o /tmp/pack-test.pdf
```

- エラーが出たら下記の落とし穴表と照合し、preamble を直して再実行。
- 成功したら生成 PDF の見た目（文字サイズ・余白・段組・見出し）を確認し、必要なら defaults/preamble を微調整。

### 6. 設定で選ぶ

1. MdTex 設定 → 対象プロファイルの「文書テンプレート方式」を **defaults file** に
2. 「defaults file の指定方法」を **テンプレートパックから選択** に
3. 「テンプレートパック」の横の **再スキャン** を押す
4. ドロップダウンから自分のパックを選ぶ

---

## 落とし穴（defaults 方式固有）

`DEFAULT_LATEX_PREAMBLE` が入らないため、以下は preamble 側で自前で用意する。
エラーメッセージが出たらこの表で原因を特定する:

| エラー | 原因 | 対処（preamble.tex） |
|---|---|---|
| `Undefined control sequence. ... \passthrough` | raw 記法の出力先コマンド未定義 | `\providecommand{\passthrough}[1]{#1}` |
| `Undefined control sequence. ... \lstinline` | `listings` 未ロード | `\usepackage{listings}` + `\lstset{...}` |
| `longtable not in 1-column mode` | 二段組と `longtable` は非互換 | 表を段抜き(`table*`)にする、または Lua フィルタで `tabular` に変換（`src/assets/sample-packs/情報系論文風/` の `simple-table.lua` 参照） |
| `! LaTeX Error: Command \eth already defined` | `unicode-math`（Pandoc 既定）と `amssymb` が衝突 | preamble で `amssymb` を読み込まない（`amsmath` までに留める） |
| `zw` 単位のエラー | `zw` は `\begin{document}` 後に定義される | preamble では `pt`/`mm` 等の絶対単位を使う。本文開始後の設定は `\AtBeginDocument{...}` |
| `Undefined control sequence. ... \ruby` | `luatexja-ruby` 未ロード | `\usepackage{luatexja-ruby}` |
| `! LaTeX Error: Environment codelisting undefined` | キャプション付きコードブロック | `\usepackage{newfloat}` + `\DeclareFloatingEnvironment[fileext=lol,name=Listing]{codelisting}` |
| クラスオプション `9pt` が無視される | `ltjtarticle`/`ltjsarticle` は一部サイズを無視 | `\AtBeginDocument{\fontsize{...}{...}\selectfont}` で本文サイズを明示 |
| 縦書きで `\jidori` が未定義 | `ltjtarticle` は `\jidori` を提供しない | `\makebox[幅][l]{...}` で代用（話者名の字取り等） |

---

## 設計の指針

- **Markdown 本文に LaTeX コマンドを大量に書かせない。** 記法は Lua フィルタで拡張し、
  本文は Markdown らしく保つ。`src/assets/sample-packs/縦書き二段組/` の `aozora-ruby.lua`
  （`｜親文字《よみ》` → `\ruby`）が実例。
- **見出しは Markdown の `#`/`##` を使い、見た目は preamble の `titlesec` で整える。**
  本文に `\novelchapter{}` 等の LaTeX マクロを直接書かない。
- **責務分離**: `defaults.yaml`（Pandoc 設定）/ `*.tex`（枠）/ `preamble.tex`（見た目）/ `*.lua`（記法拡張）。
- builtin 方式の GUI 設定と混同しない。defaults 方式では
  documentclass / fontsize / geometry は **defaults.yaml 側** で管理する。

---

## バンドルサンプルにする場合（プラグイン開発者向け）

作ったパックを「全ユーザーへ初回展開されるサンプル」にしたい場合:

1. ファイルを `src/assets/sample-packs/<パック名>/` に置く
2. `src/assets/sampleTemplatePacks.ts` の `SAMPLE_TEMPLATE_PACKS` にエントリを追加
3. `npm run build` で main.js に埋め込む（esbuild の text loader が `.tex`/`.lua`/`.yaml` を処理）
4. 初回起動時に各ユーザーの vault へ展開される（**存在しない場合だけ**）

個人的に使うだけなら、このステップは不要。パックフォルダを `MdTex Templates/` に置くだけで使える。

---

## 参照

- 使い方（選んで PDF に出す）: [README.md](./README.md)
- Pandoc defaults file の全オプション: [Pandoc User's Guide — Defaults files](https://pandoc.org/MANUAL.html#defaults-files)
- `${.}` 変数: defaults file 自身のディレクトリを指す Pandoc の特殊変数。
