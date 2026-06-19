# 変更履歴

MdTex Obsidianプラグインのすべての重要な変更をこのファイルに記録します。

形式は[Keep a Changelog](https://keepachangelog.com/ja/1.0.0/)に基づいており、
このプロジェクトは[Semantic Versioning](https://semver.org/spec/v2.0.0.html)に従います。

## [未リリース]

### 追加
- Mermaid図ラスター化サポート（実験的）
- LaTeXコマンドのインラインゴーストテキスト補完
- エラーハンドリング用診断サービス
- コアサービスのユニットテストカバレッジ

### ドキュメント
- 包括的なアーキテクチャドキュメントの追加（ARCHITECTURE.md）
- 開発ガイドの追加（docs/development.md）
- テストガイドの追加（docs/testing.md）
- APIリファレンスの追加（docs/API.md）
- I18nガイドの追加（docs/i18n.md）
- 設計決定ドキュメントの追加（docs/design-decisions.md）
- リリースガイドドキュメントの追加（docs/release-guide.md）
- README.mdの開発者ドキュメントリンクの更新

### 変更
- Markdown lint統合の改善
- LaTeXプリアンブル処理の強化
- デフォルトのNotoフォント設定の更新
- 一時ファイル生成（Luaフィルタ／メタデータ）とcleanupを `tempFiles.ts` に統一し、重複パターンを解消（内部リファクタ、挙動変更なし）

### 修正
- 特定の環境での日本語フォント描画の問題
- 特殊文字を含むWikiLink解決
- Windowsでのファイルパス処理

### 非推奨
- レガシーなpandocコマンド形式（v2.0.0で削除予定）

---

## [1.1.1] - 2025-01-31

### 追加
- Beamerプレゼンテーションサポート
- プロファイル管理システム
- イライン補完付きLaTeXコマンドパレット
- pandoc-crossrefによるクロスリファレンスサポート
- markdownlint統合による自動フォーマット

### 変更
- より良いモジュール性のためのconvertサービスのリファクタリング
- エラーハンドリングとユーザーフィードバックの改善

### 修正
- 入れ子シナリオでのトランスクルージョン（![[...]]）の問題
- タイトルページでのページ番号表示
- PDF出力での画像スケーリング

---

## [1.0.0] - 2024-12-01

### 追加
- 初期リリース
- PandocとLuaLaTeXを使用したPDF変換
- luatexjaによる日本語言語サポート
- カスタムLaTeXプリアンブルサポート
- プロファイルベースの設定システム
- 画像とリンクのWikiLink処理
- トランスクルージョンサポート
- Obsidianコールアウトからtcolorboxへの変換

### 機能
- PDF、LaTeX、DOCXの複数の出力形式サポート
- 設定可能なLaTeXエンジン（lualatex, xelatex, pdflatex）
- カスタムドキュメントクラスサポート
- フォントサイズと余白の設定
- コードブロックのシンタックスハイライト
- 図と表のキャプション
- 数式方程式のレンダリング
- 行番号付きのコードブロックリスティング

---

## [0.9.0-beta] - 2024-11-15

### 追加
- ベータリリース
- 基本的なPDF変換
- MarkdownからPandocへのパイプライン
- LuaLaTeX統合

---

## 今後の機能

### v1.2.0 予定
- 拡張されたMermaid図サポート
- PDF出力用カスタムテーマ
- 書誌管理統合
- 目次生成の改善

### v1.3.0 予定
- 多言語ドキュメントサポート
- 高度なBeamerテーマ
- 共同編集サポートメモ
- 大規模ドキュメントのパフォーマンス最適化

---

## バージョン概要

| バージョン | 日付 | ステータス | 備考 |
|---------|------|--------|-------|
| 1.1.1 | 2025-01-31 | 安定版 | 現在のリリース |
| 1.0.0 | 2024-12-01 | 安定版 | 初期安定版リリース |
| 0.9.0-beta | 2024-11-15 | ベータ | パブリックベータ |

---

[Unreleased]: https://github.com/Mekann2904/obsidian-mdtex-plugin/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/Mekann2904/obsidian-mdtex-plugin/compare/v1.0.0...v1.1.1
[1.0.0]: https://github.com/Mekann2904/obsidian-mdtex-plugin/compare/v0.9.0-beta...v1.0.0
[0.9.0-beta]: https://github.com/Mekann2904/obsidian-mdtex-plugin/releases/tag/0.9.0-beta
