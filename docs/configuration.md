# 設定リファレンス

MdTexプラグインの全設定項目を解説します。

---

## 目次

- [設定画面の開き方](#設定画面の開き方)
- [プロファイル管理](#プロファイル管理)
- [出力設定](#出力設定)
- [LaTeX/PDFエンジン設定](#latexpdfエンジン設定)
- [LaTeXプリアンブル](#latexプリアンブル)
- [LaTeXコマンドパレット](#latexコマンドパレット)
- [ラベルと言語設定](#ラベルと言語設定)
- [拡張とフィルタ](#拡張とフィルタ)
- [グローバル設定](#グローバル設定)

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

### LaTeXエンジン

PDF生成に使用するLaTeXエンジンを指定します。

- **デフォルト**: `lualatex`
- **選択肢**: `lualatex`、`xelatex`、`pdflatex`
- **推奨**: LuaLaTeXは日本語処理に最適です

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

これらの設定は`\crefname`を通じてLaTeXに渡され、以下のように使用できます：

```markdown
![画像の説明](image.png){#fig:example}

図\ref{fig:example}を参照
```

またはpandoc-crossrefを使用：

```markdown
![画像の説明](image.png){#fig:example}

[@fig:example]を参照
```

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

Luaフィルタを有効にします。DOCX変換時のraw出力などに使用されます。

- **デフォルト**: 有効（`true`）

### Luaフィルタのパス

カスタムLuaフィルタへのパスを指定します。

- **デフォルト**: `tex-to-docx.lua`
- **説明**: DOCX変換時に使用されるLuaスクリプト

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

## 関連ドキュメント

- [クイックスタート](./quickstart.md)
- [プロファイル管理](./profiles.md)
- [機能一覧](./features.md)
- [トラブルシューティング](./troubleshooting.md)
