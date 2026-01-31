# クイックスタートガイド

このガイドでは、MdTexプラグインを初めて使用する方向けに、最短でPDFを生成する手順を説明します。

---

## 目次

1. [前提条件の確認](#1-前提条件の確認)
2. [必要なツールのインストール](#2-必要なツールのインストール)
3. [プラグインのインストール](#3-プラグインのインストール)
4. [最初のPDF生成](#4-最初のpdf生成)
5. [次のステップ](#5-次のステップ)

---

## 1. 前提条件の確認

MdTexを使用するには以下が必要です：

- **Obsidian**（デスクトップ版）- モバイル版には対応していません
- **Pandoc** - Markdown変換エンジン
- **LuaLaTeX** - PDF生成エンジン（TeX LiveまたはMacTeXに含まれます）

---

## 2. 必要なツールのインストール

### macOSの場合

```bash
# Homebrewがインストールされている前提

# 1. Pandocをインストール
brew install pandoc

# 2. TeX Live（またはMacTeX）をインストール
brew install --cask mactex

# 3. pandoc-crossrefをインストール（オプションだが推奨）
pip install pandoc-crossref

# 4. markdownlint-cli2をインストール（オプション）
npm install -g markdownlint-cli2
```

インストール後、以下のコマンドでバージョンを確認してください：

```bash
pandoc --version
lualatex --version
```

どちらもバージョン情報が表示されればOKです。

### Windowsの場合

1. **Pandoc**: [公式サイト](https://pandoc.org/installing.html)からインストーラーをダウンロード
2. **TeX Live** または **MiKTeX**: [TeX Live](https://tug.org/texlive/) または [MiKTeX](https://miktex.org/) をインストール
3. **pandoc-crossref**: `pip install pandoc-crossref`

### Linux (Ubuntu/Debian)の場合

```bash
# Pandoc
sudo apt install pandoc

# TeX Live
sudo apt install texlive-full

# pandoc-crossref
pip install pandoc-crossref
```

---

## 3. プラグインのインストール

### 方法A: BRAT経由（推奨）

1. [BRAT](https://github.com/TfTHacker/obsidian42-brat)プラグインをObsidianにインストール
2. コマンドパレット（Cmd/Ctrl+P）→ "BRAT: Add Beta plugin"
3. `Mekann2904/obsidian-mdtex-plugin` を入力
4. プラグインがインストールされたら、設定で有効化

### 方法B: 手動インストール

1. [GitHubリリースページ](https://github.com/Mekann2904/obsidian-mdtex-plugin/releases)から最新版をダウンロード
2. ZIPファイルを解凍
3. 解凍したフォルダをVaultの `.obsidian/plugins/` にコピー
4. Obsidianを開き、設定 → コミュニティプラグイン → MdTexプラグインを有効化

---

## 4. 最初のPDF生成

### ステップ1: テスト用Markdownファイルを作成

新しいファイルを作成して、以下を入力：

```markdown
---
title: テストドキュメント
author: あなたの名前
date: 2025-01-31
---

# はじめてのPDF変換

これはMdTexプラグインのテストです。

## 日本語の表示

日本語も正しく表示されます。

## リスト

- 項目1
- 項目2
- 項目3

## コードブロック

```python
def hello():
    print("Hello, MdTex!")
```

## 数式

インライン数式: $E = mc^2$

ブロック数式:

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

### ステップ2: PDFを生成

1. ファイルを保存
2. 以下のいずれかの方法で変換：
   - **リボンアイコン**: 左サイドバーのファイルアイコンをクリック
   - **コマンドパレット**: Cmd/Ctrl+P → "現在のファイルをPDFへ変換"
   - **ショートカット**: キーボードショートカットを設定している場合はそれを使用

3. 数秒〜数十秒後、PDFが生成されます
4. 出力先（デフォルトはVaultルート）にPDFファイルが保存されます

### ステップ3: 結果を確認

生成されたPDFを開いて、以下を確認：
- 日本語が正しく表示されている
- 数式がレンダリングされている
- コードブロックにシンタックスハイライトがある

---

## 5. 次のステップ

基本的な使い方が分かったら、以下を試してみましょう：

### 設定をカスタマイズ

設定画面で以下を調整できます：
- **フォントサイズ**: 11pt、12pt、14ptなど
- **余白**: 25mm、1inchなど
- **ドキュメントクラス**: ltjarticle、book、reportなど

[設定リファレンス](./configuration.md)を参照

### プロファイルを作成

異なる用途で異なる設定を使い分け：
- 論文用（A4、余白広め）
- スライド用（Beamer）
- レポート用（A4、カラー）

[プロファイル管理ガイド](./profiles.md)を参照

### 高度な機能を活用

- **LaTeXコマンドパレット**: コマンドパレットで「LaTeXコマンドを検索して挿入」
- **クロスリファレンス**: 図や表に自動番号付け
- **Beamer**: プレゼンテーションPDFの作成

[機能一覧](./features.md)を参照

---

## よくあるエラーと対処法

### "pandoc: command not found"

**原因**: Pandocがインストールされていない、またはPATHに設定されていない

**対処**:
1. Pandocがインストールされているか確認: `pandoc --version`
2. 設定画面でPandocのフルパスを指定（例: `/opt/homebrew/bin/pandoc`）

### "lualatex: command not found"

**原因**: LuaLaTeXがインストールされていない

**対処**:
1. MacTeXまたはTeX Liveをインストール
2. 設定画面でLuaLaTeXのフルパスを指定

### 日本語が文字化けする

**原因**: 日本語フォントが設定されていない

**対処**:
デフォルトプリアンブルには日本語対応が含まれています。カスタムプリアンブルを使用する場合は、以下を含める：

```latex
\usepackage{luatexja-fontspec}
\setmainjfont{Noto Serif CJK JP}
\setsansjfont{Noto Sans CJK JP}
```

詳細は[トラブルシューティング](./troubleshooting.md)を参照

---

## 参考リンク

- [設定リファレンス](./configuration.md)
- [プロファイル管理](./profiles.md)
- [機能一覧](./features.md)
- [トラブルシューティング](./troubleshooting.md)
