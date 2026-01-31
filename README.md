# MdTexプラグイン

MdTexは、[Pandoc](https://pandoc.org/) と [LuaLaTeX](https://www.latex-project.org/) を使用してMarkdownをPDFに変換するObsidian用プラグインです。特に日本語テキストの処理を得意としており、多言語ドキュメントを扱うユーザーに適しています。

サンプルPDFを入手できます : [note記事:Obsidian用プラグインMdTexの導入方法、使い方について](https://note.com/mekann/n/nd837b0beaf60?sub_rt=share_pw)

[MdTexのロードマップ](https://github.com/users/Mekann2904/projects/2)

---

## 目次

- [特徴](#特徴)
- [クイックスタート](#クイックスタート)
- [インストール方法](#インストール方法)
- [使い方](#使い方)
- [設定ガイド](#設定ガイド)
- [依存関係](#依存関係一覧)
- [トラブルシューティング](#トラブルシューティング)

---

## 特徴

- **PDF変換**: MarkdownファイルをPandocとLuaLaTeXを使用して高品質なPDFに変換
- **多言語対応**: 日本語を含む多言語ドキュメントの処理に最適化
- **柔軟な出力形式**: PDF、LaTeXソース、Word(docx)への変換に対応
- **プロファイル管理**: 複数の設定プロファイルを保存・切り替え可能
- **LaTeXコマンドパレット**: よく使うLaTeXコマンドを簡単に挿入
- **自動補完**: LaTeXコマンドのインライン補完とゴーストテキスト
- **Lint統合**: markdownlint-cli2による自動整形機能
- **クロスリファレンス**: pandoc-crossrefによる図・表・数式の自動参照
- **Beamer対応**: プレゼンテーションPDFの生成に対応

---

## クイックスタート

5分で始めるMdTex：[詳細ガイドはこちら](./docs/quickstart.md)

1. **依存関係をインストール**
   ```bash
   # macOS
   brew install pandoc
   brew install --cask mactex
   pip install pandoc-crossref
   
   # 確認
   pandoc --version
   lualatex --version
   ```

2. **プラグインを有効化**
   - Obsidianの設定 → コミュニティプラグイン → MdTexプラグインを有効化

3. **最初の変換**
   - Markdownファイルを開く
   - リボンアイコンをクリック、またはコマンドパレットで「PDFへ変換」を実行

---

## インストール方法

### **BRAT経由（推奨）**
1. [BRAT](https://github.com/TfTHacker/obsidian42-brat)プラグインをインストール
2. 「Add Beta plugin」で `Mekann2904/obsidian-mdtex-plugin` を追加

### **手動インストール**
1. [GitHubのリリースページ](https://github.com/Mekann2904/obsidian-mdtex-plugin/releases) から最新バージョンをダウンロード
2. 解凍したフォルダを `.obsidian/plugins/` にコピー
3. Obsidianの設定でプラグインを有効化

---

## 使い方

### 基本的な変換

1. **PDFを生成**
   - リボンアイコンをクリック
   - またはコマンドパレット（Cmd/Ctrl+P）→「現在のファイルをPDFへ変換」

2. **他の形式に変換**
   - 設定で「出力フォーマット」を変更：
     - `pdf` - PDFドキュメント（デフォルト）
     - `latex` - LaTeXソースファイル
     - `docx` - Microsoft Word文書

### 利用可能なコマンド

| コマンド | 説明 | ショートカット |
|---------|------|--------------|
| PDFへ変換 | アクティブファイルをPDFに変換 | - |
| LaTeXへ変換 | LaTeXソースを生成 | - |
| LaTeXコマンドパレット | コマンドを検索して挿入 | - |
| Lint実行 | markdownlintでチェック | - |
| 自動修正適用 | markdownlint --fixを実行 | - |

### プロファイルの切り替え

複数の設定を使い分けできます：
- 論文用プロファイル（A4、12pt、余白広め）
- スライド用プロファイル（Beamer、8pt）
- レポート用プロファイル（A4、11pt、カラー）

詳細：[プロファイル管理ガイド](./docs/profiles.md)

---

## 設定ガイド

### 基本的な設定項目

| 設定項目 | 説明 | デフォルト値 |
|---------|------|------------|
| Pandocのパス | pandoc実行ファイルのパス | `pandoc` |
| 出力ディレクトリ | PDFの保存先 | Vaultルート |
| 出力フォーマット | pdf / latex / docx | `pdf` |
| LaTeXエンジン | lualatex / xelatex / pdflatex | `lualatex` |
| ドキュメントクラス | LaTeXのdocumentclass | `ltjarticle` |
| フォントサイズ | ベースフォントサイズ | `11pt` |

### 高度な設定

詳細な設定オプションについては[設定リファレンス](./docs/configuration.md)を参照してください。

主な高度設定：
- **LaTeXプリアンブル**: カスタムLaTeXヘッダー
- **クロスリファレンス**: pandoc-crossrefの設定
- **LaTeXコマンドパレット**: カスタムコマンドの定義
- **Lint設定**: 自動整形の有効化

---

## 依存関係一覧

### 必須

| ツール | 用途 | インストール |
|--------|------|------------|
| **Pandoc** | Markdown変換エンジン | `brew install pandoc` |
| **LuaLaTeX** | PDF生成 | `brew install --cask mactex` |

### オプション

| ツール | 用途 | インストール |
|--------|------|------------|
| **pandoc-crossref** | クロスリファレンス | `pip install pandoc-crossref` |
| **markdownlint-cli2** | Lint/自動修正 | `npm install -g markdownlint-cli2` |

### LaTeXパッケージ

以下のパッケージが自動的に使用されます：
- `luatexja` / `luatexja-fontspec` - 日本語処理
- `unicode-math` - 数式フォント
- `graphicx` / `caption` - 図表
- `listings` - コードブロック
- `hyperref` / `cleveref` / `autonum` - 参照
- `tcolorbox` - 引用ボックス
- `booktabs` / `makecell` / `multirow` - 表
- `tikz` - 描画

---

## トラブルシューティング

### よくある問題

**Q: PDFが生成されない**
- PandocとLuaLaTeXが正しくインストールされているか確認
- パス設定が正しいか確認

**Q: 日本語が文字化けする**
- `luatexja`パッケージがインストールされているか確認
- フォント設定を確認

**Q: Beamerでエラーが出る**
- [Beamerガイド](./docs/beamer-guide.md)を参照
- pandoc-crossrefと余白設定を無効化

詳細なトラブルシューティング：[troubleshooting.md](./docs/troubleshooting.md)

---

## 機能詳細

各機能の詳細な使い方：

- [クイックスタートガイド](./docs/quickstart.md) - 5分で始める
- [設定リファレンス](./docs/configuration.md) - 全設定項目の詳細
- [プロファイル管理](./docs/profiles.md) - 複数設定の管理
- [LaTeXコマンドパレット](./docs/latex-palette.md) - コマンド補完機能
- [機能一覧](./docs/features.md) - 各機能の詳細説明
- [Beamerガイド](./docs/beamer-guide.md) - スライド作成
- [トラブルシューティング](./docs/troubleshooting.md) - 問題解決

---

## 既知の問題

- 複雑なLaTeX設定には追加パッケージが必要になる場合があります
- DOCX変換は実験的機能です（一部のLaTeXコマンドは変換されません）
- Mermaid図の実験的機能は処理に時間がかかる場合があります

---

## 貢献について

貢献は歓迎します！

- バグ報告や新機能の提案：[GitHub Issues](https://github.com/Mekann2904/obsidian-mdtex-plugin/issues)
- プルリクエストも受け付けています

---

## ライセンス

このプラグインは [MITライセンス](LICENSE) の下で公開されています。

---

## 謝辞

- [Pandoc](https://pandoc.org/): 汎用的なドキュメントコンバーター
- [LuaLaTeX](https://www.latex-project.org/): 多言語組版に対応した強力なTeXエンジン
- [Obsidian](https://obsidian.md/): ローカルのMarkdownファイルを使用するナレッジベースツール
- [Pandoc-crossref](https://github.com/lierdakil/pandoc-crossref): 図、方程式、表とその相互参照を実現するためのフィルター

---

### 開発者情報

開発者: **Mekann**  
GitHub: [Mekann2904](https://github.com/Mekann2904)
