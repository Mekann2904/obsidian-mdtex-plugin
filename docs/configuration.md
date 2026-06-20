---
title: 設定リファレンス
category: ユーザードキュメント
audience: 既存ユーザー, 上級ユーザー
last_updated: 2026-02-12
tags: [設定, リファレンス, オプション]
related: [docs/quickstart.md, docs/profiles.md, docs/troubleshooting.md]
---

# 設定リファレンス

[ドキュメントインデックス](./index.md) > 設定リファレンス

## 概要

MdTexプラグインの全設定項目を解説します。PandocとLaTeXの設定、プロファイル管理、カスタムプリアンブルなど、詳細な設定オプションについて説明します。

---

## 設定画面の開き方

1. Obsidianの設定を開く
2. コミュニティプラグイン → MdTexプラグイン設定
3. または、コマンドパレット（Cmd/Ctrl+P）→ "MdTexプラグイン設定"

---

## プロファイル管理

### 使用するプロファイル

現在アクティブなプロファイルを選択します。

- **デフォルト**: `Default`
- **説明**: 変換に使用する設定プロファイルを切り替えます

### 新しいプロファイルを作成

新しいプロファイルを追加します。現在のプロファイルの設定をコピーして作成されます。

- **操作**: プロファイル名を入力して「プロファイルを追加」ボタンをクリック

### 現在のプロファイルを削除

アクティブなプロファイルを削除します。プロファイルが1つしかない場合は削除できません。

---

## 出力設定

### 出力フォーマット

変換先のファイル形式を選択します。

| 値 | 説明 |
|---|------|
| `pdf` | PDFドキュメント（デフォルト） |
| `docx` | Microsoft Word文書（.docx） |
| `latex` | LaTeXソースファイル（.tex） |

### Pandocのパス

Pandoc実行ファイルへのパスを指定します。

- **デフォルト**: `pandoc`
- **推奨**: 絶対パスを指定（例: `/opt/homebrew/bin/pandoc`）
- **説明**: システムのPATHにpandocが含まれていない場合はフルパスを指定してください

### 出力ディレクトリ

生成されたファイルの保存先ディレクトリを指定します。

- **デフォルト**: 空（Vaultルートを使用）
- **例**: `./output`、`/Users/username/Documents/PDFs`
- **注意**: 指定したディレクトリが存在しない場合はエラーになります

### リソース検索ディレクトリ

画像などのリソースファイルを探すディレクトリを指定します。

- **デフォルト**: 空（入力ファイルの場所を使用）
- **説明**: `--resource-path`オプションに渡されます

### 中間ファイルを削除

PDF生成後に一時ファイル（.tex、.temp.md）を削除するかどうかを設定します。

- **デフォルト**: 無効（`false`）
- **推奨**: 問題が発生した時のデバッグのため、無効のまま使用し、動作が安定してから有効化

---

## LaTeX/PDFエンジン設定

### 文書テンプレート方式（ADR-007）

文書の「枠」（`\documentclass`・タイトルブロック・プリアンブル・ページ体裁）をどう構築するかを選択します。この設定は本セクションの他項目の意味を決める「入口」です。

| 方式 | 概要 | 対象 |
|---|---|---|
| **組み込み（`builtin`・既定）** | GUI 設定値（ドキュメントクラス・フォントサイズ・余白・プリアンブル等）から Pandoc の `-V` 変数を生成し、組み込みデフォルトテンプレに注入する | 初心者・既存ユーザー（現状完全維持） |
| **defaults file（`defaults`・上級者向け）** | Pandoc の defaults file（`-d`）に枠の構築を委譲する | 学会公式テンプレ・縦書き・段組・複数ファイル構成を完全制御したい上級者 |

#### defaults 方式を選んだときの挙動

MdTex は `-d <defaultsFilePath>` を渡し、以下を **defaults file 側で管理** します（コマンドライン `-V` が defaults file より優先される Pandoc の precedence 衝突を避けるため、MdTex 側では生成しません）。

- `documentclass` / `classoption` / `fontsize` / `geometry:margin` / `graphics`（画像スケール）/ `pagestyle`（ページ番号）の各 `-V`
- `pdf-engine` / `pdf-engine-opts`（LaTeX エンジンと PDF エンジン追加オプション）
- `standalone`（defaults file の `standalone:` で制御。`standalone: false` で本文フラグメントを出力）
- ユーザープリアンブル（`headerIncludes`）とキャプション語／参照接頭辞（defaults file の `metadata:` / `include-in-header` で管理）
- beamer ターゲット（defaults file の `to: beamer` で管理）

一方、MdTex 固有レイヤは方式に関わらず継続します。

- Obsidian 記法の TS 前処理（`%% %%` コメント・WikiLink・トランスクルージョン・コールアウト等）
- Lua フィルタ（コールアウト / Mermaid 言語削除 / DOCX の LaTeX コマンド処理）
- `--resource-path`、出力フォーマット（pdf/docx/latex）
- `--include-in-header` に注入する MdTex 固有の断片（Obsidian コールアウト定義・`--listings` 互換の codelisting 環境定義・ドラフトモードスニペット）

> **ガードレール**: `defaults` 方式で defaults file のパスが未指定のときは、変換前にエラー通知してブロックします。

#### defaults file のパス

Pandoc の defaults YAML ファイル（`-d` で渡す）へのパスを指定します。`defaults` 方式のとき必須です。

#### defaults file の書き方

defaults file は Pandoc の `-d` / `--defaults` で読む YAML で、テンプレート・プリアンブル・フィルタ・変数・メタデータなど Pandoc のほぼ全オプションを 1 ファイルに集約できます。

```yaml
# 学会テンプレ（IEEEtran）の例
from: markdown

template: ${.}/ieeetran.tex
include-in-header:
  - ${.}/preamble.tex

variables:
  documentclass: IEEEtran
  classoption: conference
  fontsize: 10pt
  geometry: margin=1in

metadata:
  figureTitle: "Fig."
  figPrefix: "Fig."
  tableTitle: "Table"
  tblPrefix: "Table"
```

`${.}` は defaults file 自身のディレクトリを参照する Pandoc 公式の記法です。テンプレ一式（defaults.yaml / ieeetran.tex / preamble.tex）を 1 つのフォルダにまとめて Git 管理でき、defaults file のパスだけをプロファイルに指定すればよくなります。

```
my-templates/
└── ieee/
    ├── defaults.yaml      ← プロファイルの「defaults file のパス」に指定
    ├── ieeetran.tex       ← ${.}/ieeetran.tex で参照
    └── preamble.tex       ← ${.}/preamble.tex で参照
```

> **本文フラグメント出力**: defaults file 内で `standalone: false` を指定すると、枠を含まない本文のみの出力が得られます。別の master LaTeX 文書から `\input` / `\include` で取り込む用途を想定します。

> **注意**: MdTex は常時 `--listings`、`--highlight-style=tango`、`--resource-path` を付与します（方式に関わらず）。defaults file 内の相対パス解決や、これら常時付与するオプション・フィルタ指定との相互作用にご注意ください。

### LaTeXエンジン

PDF生成に使用するLaTeXエンジンを指定します。**builtin 方式でのみ表示・使用されます**。defaults 方式では defaults file の `pdf-engine` が使用されます。

- **デフォルト**: `lualatex`
- **選択肢**: `lualatex`、`xelatex`、`pdflatex`、`latexmk`
- **推奨**: LuaLaTeXは日本語処理に最適です
- **参考文献を扱う場合**: `latexmk` を指定すると bibtex/biber のラウンドトリップ（`latex`→`bibtex`→`latex`→`latex`）を latexmk が自動管理します。学会論文などで `\cite` を使う場合は `latexmk` を推奨します（→ [引用モード（ADR-009）](#引用モードadr-009)）

### PDFエンジン追加オプション（ADR-009）

PDFエンジン（latexmk 等）に追加オプションを渡します。**builtin 方式でのみ表示・使用されます**。defaults 方式では defaults file の `pdf-engine-opts` が使用されます。スペース区切りで複数指定でき、各トークンが Pandoc の `--pdf-engine-opt=<トークン>` になります。

- **デフォルト**: 空
- **例**: `-lualatex`、`-lualatex -interaction=nonstopmode`
- **用途**: `latexEngine` を `latexmk` にしたとき、サブエンジン（`-lualatex` / `-xelatex` / `-pdflatex`）と latexmk 固有オプションを指定します。`latexmk` は既定で pdflatex を使うため、日本語を含む文書では `-lualatex` の指定が実質必須です。
- **PDF 出力時のみ有効**。LaTeX（`.tex`）出力時には無視されます。

### 引用モード（ADR-009）

Markdown の引用記法（`@key` / `[@key]`）を LaTeX の引用コマンド（`\citep` / `\citet` 等）に変換するかを選びます。**defaults 方式でのみ表示**されます（`builtin` 方式は対象外）。

| 値 | Pandoc フラグ | 概要 |
|---|---|---|
| **なし（`none`・既定）** | （なし） | 変換しない。`@key` はそのまま残ります |
| **natbib（`--natbib`）** | `--natbib` | 学会公式クラス（ACL / acmart / IEEEtran 等）と協調します。学会論文で参考文献を自動生成する場合はこれを選びます |
| **citeproc（`--citeproc`）** | `--citeproc` | CSL ベースの引用処理。学会公式クラスではなく、 CSL スタイル + `.json`/`.bib` で参考文献体裁を制御したい場合 |

> **natbib 選択時の自動解決（bibstyle 衝突）**: 学会公式クラスの多くは `\bibliographystyle` を内蔵します。一方、Pandoc の `--natbib` は `\bibliographystyle{plainnat}` を自動挿入するため、両者が `.aux` に2重に出力されて bibtex がエラーで止まることがあります。MdTex はこれを **自動的に解決** します（.aux を見て、クラス由来の bibstyle があるときだけ plainnat を除去）。**ユーザーは自分の使うクラスが bibliographystyle を内蔵するか知る必要はありません**。これには `latexEngine` を `latexmk` にする必要があります。詳細は [設計決定 ADR-009](./design-decisions.md) を参照してください。

### ドキュメントクラス

LaTeXの`\documentclass`に指定するクラスを設定します。

- **デフォルト**: `ltjarticle`
- **一般的な選択肢**:
  - `ltjarticle` - 日本語記事（LuaLaTeX用）
  - `article` - 英語記事
  - `book` - 書籍
  - `report` - レポート
  - `beamer` - プレゼンテーション

### ドキュメントクラスのオプション

`\documentclass`に渡す追加オプションを指定します。

- **例**: `a4paper, twocolumn`
- **説明**: カンマ区切りで複数指定可能

### フォントサイズ

ドキュメントのベースフォントサイズを指定します。

- **デフォルト**: `11pt`
- **一般的な値**: `10pt`、`11pt`、`12pt`、`14pt`

### マージンを指定

カスタムマージン設定を有効/無効にします。

- **デフォルト**: 有効（`true`）

### マージン幅

PDFの余白サイズを指定します（マージン指定が有効な場合のみ表示）。

- **デフォルト**: `25mm`
- **例**: `25mm`、`1in`、`2cm`
- **説明**: geometryパッケージのmargin値として使用されます

### ページ番号

ページ番号の表示を有効/無効にします。

- **デフォルト**: 有効（`true`）
- **説明**: 無効にすると全ページでページ番号が非表示になります

### 画像スケール

デフォルトの画像スケールを指定します。

- **デフォルト**: `width=0.8\textwidth`
- **例**: `width=0.5\textwidth`、`height=5cm`
- **説明**: ドキュメント内での画像サイズの統一に使用

---

## LaTeXプリアンブル

カスタムLaTeXヘッダーを設定します。YAMLの`---`と`header-includes`は自動的に付与されるため、純粋なLaTeXコードのみを入力してください。

### プリアンブルの編集

- **テキストエリア**: LaTeXコードを直接編集
- **全画面で開く**: 大きな画面で編集
- **デフォルトにリセット**: デフォルトプリアンブルに戻す
- **コピー**: 内容をクリップボードにコピー

### デフォルトプリアンブルに含まれるもの

- **日本語対応**: `luatexja-fontspec`、`luatexja-ruby`
- **数式**: `unicode-math`、`mathtools`、`amssymb`
- **フォント**: Notoフォント、XITS Math
- **体裁**: `microtype`、`parskip`、`setspace`
- **表**: `booktabs`、`makecell`、`multirow`
- **図**: `graphicx`、`caption`、`tikz`
- **コード**: `listings`（シンタックスハイライト付き）
- **参照**: `hyperref`、`cleveref`、`autonum`
- **引用**: `tcolorbox`（カスタム引用ボックス）

### カスタムプリアンブルの例

```latex
% 追加パッケージ
\usepackage{enumitem}
\usepackage{siunitx}

% カスタマイズ
\setlist[itemize]{leftmargin=*}
\sisetup{per-mode=symbol}
```

---

## LaTeXコマンドパレット

### LaTeXパレットとインライン補完を有効

LaTeXコマンドパレットとインライン補完機能のオン/オフを設定します。

- **デフォルト**: 有効（`true`）

### インラインゴースト補完を有効（実験的）

インラインのゴーストサジェストを表示します。Tabキーまたは→キーで確定できます。

- **デフォルト**: 有効（`true`）

### コマンド一覧（YAML）

YAML形式でパレットに表示するコマンドを定義します。

**フィールド**:
- `cmd`: LaTeXコマンド（例: `\newpage`）
- `desc`: 説明
- `cursorOffset`: （任意）カーソル位置の調整

**例**:
```yaml
- cmd: "\\newpage"
  desc: "New page (改ページ)"
- cmd: "\\vspace{}"
  desc: "Custom vertical space"
  cursorOffset: -1
```

---

## ラベルと言語設定

図、表、コードブロック、数式のキャプションと参照に使用するラベルを設定します。

### 設定項目

| 項目 | ラベル（デフォルト） | プレフィックス（デフォルト） |
|-----|-------------------|------------------------|
| 図 | Figure | Fig. |
| 表 | Table | Table |
| リスティング | Listing | Listing |
| 数式 | Equation | Eq. |

### 使用方法

これらの設定は Pandoc のメタデータ（pandoc-crossref の `figureTitle` / `figPrefix` / `tableTitle` / `tblPrefix` / `listingTitle` / `lstPrefix` / `eqnPrefix`）として渡されます。Pandoc Crossref が有効な場合は、図・表・コード・数式のキャプション語と参照接頭辞がこのメタデータから適用されます。

```markdown
![画像の説明](image.png){#fig:example}

[@fig:example]を参照
```

### 文書ごとに frontmatter で上書きする

ラベルとプレフィックスは **文書の frontmatter で上書きできます**。優先順位は `frontmatter > プロファイル > デフォルト` です。プロファイル設定を変えずに、特定の文書だけキャプション語を切り替えたい場合に便利です。

frontmatter に対応するメタデータキーを書くと、プロファイル設定より優先されます。

```yaml
---
figureTitle: 図
figPrefix: 図
tableTitle: 表
tblPrefix: 表
listingTitle: コード
lstPrefix: コード
eqnPrefix: 式
---
```

> **注意**: 数式キャプション語（`Equation`）は pandoc-crossref に対応する Title 系メタデータキーがなく、参照接頭辞の `eqnPrefix` のみ上書き可能です。Pandoc Crossref が無効の場合は frontmatter 上書きの効かない LaTeX ネイティブキャプション名のフォールバックが使われます。

---

## 拡張とフィルタ

### Pandoc Crossrefを使う

pandoc-crossrefフィルタを有効にします。図・表・数式の自動番号付けと参照を行います。

- **デフォルト**: 有効（`true`）
- **依存関係**: pandoc-crossrefのインストールが必要

### pandoc-crossrefのパス

pandoc-crossref実行ファイルへのパスを指定します。

- **デフォルト**: `pandoc-crossref`
- **推奨**: 絶対パスを指定

### 高度なLaTeXコマンドを有効

DOCX 変換時の LaTeX コマンド（`\textbf` / `\textit` / `\underline` / `\footnote` / `\textcolor` / `\newpage` / `\clearpage` など）を、Pandoc の AST を直接処理する組み込み Lua フィルタで変換します。従来の文字列の正規表現逆変換は廃止され、波括弧のネストや `\{` エスケープが含まれる LaTeX でも壊れません。

- **デフォルト**: 有効（`true`）
- **仕組み**: フィルタは `main.js` に埋め込まれて配布され、実行時に一時ファイルとして適用されます。loose ファイル（従来の `tex-to-docx.lua`）の配置は不要です。

#### DOCX の段落スタイル（custom-style）と reference-doc

DOCX で `\centerline` / `\rightline` / `\kenten` 等を意図した見た目で出力するには、reference-doc（`--reference-doc`）に以下のカスタム段落スタイルが定義された `.docx` テンプレートを指定します。

- `Center` — センタリング用
- `Right` — 右寄せ用
- `Kenten` — 塞点（圏点）用

手順:

1. Pandoc の既定テンプレートを取り出す: `pandoc -o template.docx --print-default-data-file reference.docx`
2. Word で `template.docx` を開き、上記のカスタム段落スタイルを作成・保存する
3. プロファイルの「Pandoc 追加引数」に `--reference-doc=template.docx` を指定する

> `--reference-doc` は DOCX 以外の形式では自動で除外されます。

### Pandoc追加引数

pandocに渡す追加のコマンドライン引数を指定します。

- **例**: `--toc --number-sections --highlight-style=kate`
- **特殊フラグ**: `--draft`を指定するとドラフトモードになります

### --standaloneを付与

`--standalone`フラグを付けて完全なドキュメントを生成します。

- **デフォルト**: 有効（`true`）

---

## グローバル設定

### Markdownlint --fixを実行

変換前に`markdownlint-cli2 --fix`を自動実行します。

- **デフォルト**: 無効（`false`）
- **依存関係**: markdownlint-cli2のインストールが必要
- **効果**: Markdownの自動整形（リストの整合性、空白の正規化など）

### markdownlint-cli2のパス

markdownlint-cli2実行ファイルへのパスを指定します。

- **デフォルト**: 空（自動解決を試みる）

### 開発ログを非表示

デベロッパーコンソールへの詳細ログ出力を抑制します。

- **デフォルト**: 有効（`true`）

### Mermaid実験機能を有効

MermaidブロックをDOM→PNGで描画します。

- **デフォルト**: 無効（`false`）
- **注意**: 実験的機能で、処理に時間がかかる場合があります

---

## 設定ファイルの直接編集

設定はObsidianのデータディレクトリ内の`data.json`に保存されます。直接編集する場合は以下の構造になっています：

```json
{
  "activeProfile": "Default",
  "profiles": {
    "Default": {
      "pandocPath": "pandoc",
      "outputFormat": "pdf",
      "latexEngine": "lualatex",
      ...
    }
  },
  "enableLatexPalette": true,
  "enableMarkdownlintFix": false,
  ...
}
```

**注意**: 直接編集する場合はObsidianを再起動するか、設定画面を開き直す必要があります。

---

## 関連トピック

- [クイックスタート](./quickstart.md)
- [プロファイル管理](./profiles.md)
- [機能一覧](./features.md)
- [トラブルシューティング](./troubleshooting.md)

## 次のトピック

- [プロファイル管理](./profiles.md)
