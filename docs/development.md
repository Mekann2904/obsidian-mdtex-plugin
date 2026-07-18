---
title: 開発ガイド
category: 開発者ドキュメント
audience: 開発者
last_updated: 2026-02-12
tags: [開発, ガイド, ワークフロー]
related: [../CONTRIBUTING.md, ../ARCHITECTURE.md, docs/testing.md]
---

# 開発ガイド

[ドキュメントインデックス](./index.md) > 開発ガイド

## 概要

このガイドでは、MdTeX プラグインの開発環境のセットアップ、プロジェクト構造、コーディング規約、デバッグ方法を説明する。

---

## はじめに

### 前提条件

- **Node.js**: v18.x 以降
- **npm**: Node.jsに付属
- **Git**: バージョン管理用
- **TypeScript**: v5.x（npm経由でインストール）
- **Obsidian**: テスト用デスクトップアプリ
- **Pandoc**: 変換機能のテスト用
- **LuaLaTeX**: PDF生成のテスト用

### 開発依存関係のインストール

```bash
# リポジトリをクローン
git clone https://github.com/Mekann2904/obsidian-mdtex-plugin.git
cd obsidian-mdtex-plugin

# 依存関係をインストール
npm install
```

---

## 開発環境のセットアップ

### ビルド設定

プロジェクトではesbuildを使用してバンドルしている。

**利用可能なスクリプト**:

```bash
npm run dev      # ウォッチモード付き開発ビルド
npm run build    # 本番ビルド
npm run test     # テスト実行
npm run lint     # リント実行
```

---

## プロジェクト構造

```
obsidian-mdtex-plugin/
├── src/
│   ├── services/       # ビジネスロジックサービス
│   ├── utils/          # ユーティリティ関数
│   ├── extensions/     # CodeMirror拡張
│   ├── suggest/        # エディタサジェスター
│   ├── modal/          # モーダル
│   ├── lang/           # i18nロケール
│   └── *.ts            # メインファイル
├── tests/              # テストファイル
├── docs/               # ドキュメント
└── manifest.json       # プラグインマニフェスト
```

---

## コーディング規約

### TypeScript

- 型アノテーションを使用
- `any`型を避ける
- インターフェースと型エイリアスを適切に使用

### コードスタイル

- ESLint設定に従う
- インデントに2スペースを使用
- セミコロンを使用

### ファイルヘッダー

全ソースファイルにはヘッダーコメントを含める：

```typescript
// File: src/services/exampleService.ts
// Purpose: このファイルが何をするかの簡単な説明
// Related: 関連ファイルとその関係
```

---

## 開発ワークフロー

### 新機能の追加

1. 新しいブランチを作成: `git checkout -b feature/new-feature`
2. 変更を実装
3. テストを追加
4. ビルドとテストを実行: `npm run build && npm test`
5. コミット: `git commit -m "feat: add new feature"`
6. プッシュ: `git push origin feature/new-feature`
7. プルリクエストを作成

### バグ修正

1. バグを再現
2. 失敗するテストを書く
3. バグを修正
4. テストが通ることを確認
5. プルリクエストを作成

---

## デバッグ

### Obsidianでのデバッグ

1. Obsidianのデベロッパーコンソールを開く（Ctrl+Shift+I）
2. `npm run dev`で開発ビルドを起動
3. プラグインを再読み込み

### ログ

- 開発ログを有効にする: 設定画面で「開発ログを非表示」をオフ
- デベロッパーコンソールでログを確認

---

## 関連トピック

- [貢献ガイドライン](../CONTRIBUTING.md)
- [アーキテクチャ](../ARCHITECTURE.md)
- [テストガイド](./testing.md)
- [APIリファレンス](./API.md)

## 次のトピック

- [テストガイド](./testing.md)
