---
title: 貢献ガイドライン
category: 開発者ドキュメント
audience: 開発者, 貢献者
last_updated: 2026-02-12
tags: [貢献, 開発, ガイドライン]
related: [./ARCHITECTURE.md, docs/development.md, docs/testing.md]
---

# MdTeXプラグインへの貢献

[ドキュメントインデックス](docs/index.md) > CONTRIBUTING.md

## 概要

MdTeX Obsidianプラグインへの貢献を歓迎する。このガイドでは、効果的に貢献する方法について説明する。コードの変更、バグ報告、機能リクエスト、ドキュメントの改善など、あらゆる形式の貢献を受け付ける。

---

## 行動規範

- 他者を尊重し、包摂的であること
- 建設的なフィードバックを提供すること
- コミュニティにとって最善の方法に焦点を当てること
- 他のコミュニティメンバーに共感を持って接すること

---

## はじめに

### 前提条件

- Node.js 18.x 以降
- npm または yarn パッケージマネージャー
- Git
- TypeScript の知識

### フォークとクローン

1. GitHub でリポジトリをフォーク
2. フォークをローカルにクローン：
   ```bash
   git clone https://github.com/YOUR_USERNAME/obsidian-mdtex-plugin.git
   cd obsidian-mdtex-plugin
   ```

3. 上流リモートを追加：
   ```bash
   git remote add upstream https://github.com/Mekann2904/obsidian-mdtex-plugin.git
   ```

---

## 開発環境のセットアップ

### 依存関係のインストール

```bash
npm install
```

### プラグインのビルド

```bash
npm run build
```

これにより、TypeScriptコードがコンパイルされ、esbuildを使用してバンドルされる。

### 開発モード

ホットリロード付きの開発：

```bash
npm run dev
```

### Obsidianでのプラグインの読み込み

1. シンボリックリンクを作成するか、プラグインファイルをObsidian vaultにコピーする：
   ```bash
   cp main.js manifest.json styles.css ~/.obsidian/plugins/obsidian-mdtex-plugin/
   ```

2. Obsidianの設定のコミュニティプラグインでプラグインを有効化する

---

## テストの実行

### 全テストの実行

```bash
npm test
```

### カバレッジ付きテストの実行

```bash
npm run test:coverage
```

### テスト構成

- ユニットテストは `src/**/*.test.ts` に配置
- 統合テストは `tests/**/*.test.ts` に配置
- モックは `tests/__mocks__/` に配置

### テストの記述

テスト構成の例：

```typescript
import { describe, it, expect } from "vitest";

describe("FeatureName", () => {
  it("should do something", () => {
    // 準備
    const input = "test";

    // 実行
    const result = functionName(input);

    // 検証
    expect(result).toBe("expected");
  });
});
```

---

## 変更の提出

### ブランチの命名

説明的なブランチ名を使用：

- `fix/issue-description` - バグ修正
- `feature/feature-description` - 新機能
- `docs/documentation-update` - ドキュメント更新
- `refactor/refactor-description` - リファクタリング

### コミットメッセージ

Conventional Commits に従う：

```
type(scope): description

[optional body]

[optional footer]
```

タイプ：
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント変更
- `style`: コードスタイル変更（フォーマット等）
- `refactor`: コードリファクタリング
- `test`: テストの追加や更新
- `chore`: メンテナンスタスク

例：
```
feat(convert): カスタムドキュメントクラスのサポートを追加

fix(latex): 日本語フォント描画の問題を解決

docs(readme): インストール手順の更新
```

### プルリクエストプロセス

1. 必要に応じてドキュメントを更新
2. 全テストが通ることを確認
3. 新機能のテストを追加
4. CHANGELOG.mdを更新
5. `main`ブランチにプルリクエストを提出

### プルリクエストテンプレート

```markdown
## 説明
変更内容の簡単な説明

## 変更タイプ
- [ ] バグ修正
- [ ] 新機能
- [ ] 破壊的変更
- [ ] ドキュメント更新

## テスト
実施したテストの説明

## チェックリスト
- [ ] プロジェクトのコーディングスタイルに従っている
- [ ] テストが通っている
- [ ] ドキュメントを更新した
- [ ] CHANGELOG.mdを更新した
```

---

## コーディング規約

### TypeScript

- 新しいコードはTypeScriptを使用
- tsconfig.jsonで厳格モードを有効化
- 可能な限り `any` 型を避ける
- オブジェクトの形状にはインターフェースを使用
- 共用型には型エイリアスを使用

### コードスタイル

- インデントに2スペースを使用
- 文字列にはシングルクォートを使用
- セミコロンを使用
- ESLint設定に従う

リンターの実行：

```bash
npm run lint
```

### ファイル構成

```
src/
├── services/     # ビジネスロジックサービス
├── utils/        # ユーティリティ関数
├── components/   # UIコンポーネント
├── types/        # TypeScript型定義
└── index.ts      # エントリポイント
```

### コメント

- 目的を説明するファイルレベルのコメントを追加
- パブリックAPIにはJSDocを追加
- 複雑なロジックにはインラインコメントを使用

例：

```typescript
// File: convertService.ts
// Purpose: Pandocを使用してMarkdownをPDFに変換
// Related: src/MdTeXPlugin.ts, src/services/pandocCommandBuilder.ts

/**
 * 現在のページを指定された形式に変換
 * @param ctx - プラグインコンテキスト
 * @param format - 出力フォーマット（pdf, latex, docx）
 */
export async function convertCurrentPage(
  ctx: PluginContext,
  deps: ConvertDeps,
  format: OutputFormat
): Promise<void> {
  // 実装
}
```

---

## ドキュメント

### ユーザードキュメント

ユーザー向けドキュメントは `docs/` ディレクトリにある：

- `quickstart.md` - はじめにガイド
- `configuration.md` - 設定リファレンス
- `features.md` - 機能説明
- `troubleshooting.md` - 一般的な問題と解決策

機能を追加する場合：
1. 関連するドキュメントファイルを更新
2. 例を追加
3. 必要に応じてREADME.mdを更新

### 開発者ドキュメント

開発者ドキュメントには以下が含まれる：

- このCONTRIBUTING.mdファイル
- `ARCHITECTURE.md` - プロジェクトアーキテクチャ
- `docs/testing.md` - テストガイド
- `docs/i18n.md` - 国際化ガイド

### コードコメント

全ソースファイルにはヘッダーコメントを含める必要がある：

```typescript
// File: src/services/exampleService.ts
// Purpose: このファイルが何をするかの簡単な説明
// Reason: なぜこのファイルが存在するのか
// Related: 関連ファイルとその関係
```

---

## ヘルプの入手

- バグ報告や機能リクエストについてはIssueを開く
- まず既存のドキュメントを確認する
- 実装に関する質問はDiscussionsを利用する

---

## ライセンス

貢献を行うことで、あなたの貢献がMITライセンスの下でライセンスされることに同意したものとみなされる。

---

## 関連トピック

- [アーキテクチャ](ARCHITECTURE.md)
- [開発ガイド](docs/development.md)
- [テストガイド](docs/testing.md)
- [APIリファレンス](docs/API.md)

## 次のトピック

- [開発ガイド](docs/development.md)
