---
title: リリースガイド
category: 開発者ドキュメント
audience: 開発者, メンテナー
last_updated: 2026-02-12
tags: [リリース, デプロイ, バージョン管理]
related: [docs/deployment.md, ../CONTRIBUTING.md, docs/development.md]
---

# リリースガイド

[ドキュメントインデックス](./index.md) > リリースガイド

## 概要

このガイドでは、MdTeX プラグインの新しいバージョンをリリースする手順を説明する。

---

## 目次

- [リリース前チェックリスト](#リリース前チェックリスト)
- [バージョン更新](#バージョン更新)
- [リリースの作成](#リリースの作成)
- [リリース後のタスク](#リリース後のタスク)
- [緊急手順](#緊急手順)

---

## リリース前チェックリスト

### コード品質

- [ ] すべてのテストが通る (`npm test`)
- [ ] カバレッジが適切（全体で70%以上）
- [ ] ESLintエラーまたは警告なし
- [ ] TypeScriptコンパイルが成功

### ドキュメント

- [ ] バージョンと変更内容でCHANGELOG.mdを更新
- [ ] 機能が変更された場合README.mdを更新
- [ ] APIが変更された場合APIドキュメントを更新
- [ ] 新しいコードすべてにコメントがある
- [ ] 破壊的変更がある場合移行ガイドを提供

### テスト

- [ ] macOSで手動テスト完了
- [ ] Windowsで手動テスト完了（可能な場合）
- [ ] Linuxで手動テスト完了（可能な場合）
- [ ] エッジケースをテスト
- [ ] エラーハンドリングを検証

### バージョン番号

- [ ] `package.json`のバージョンを更新
- [ ] `manifest.json`のバージョンを更新
- [ ] `versions.json`を更新

---

## バージョン更新

### バージョンタイプの決定

セマンティックバージョニングを使用:

```
PATCH (1.1.1 → 1.1.2)
└─ バグ修正のみ、API変更なし

MINOR (1.1.1 → 1.2.0)
├─ 新機能
├─ 後方互換性のある変更
└─ 非推奨（ただし削除ではない）

MAJOR (1.1.1 → 2.0.0)
├─ 破壊的変更
├─ 機能の削除
└─ API変更
```

### バージョンファイルの更新

#### 1. package.json

```json
{
  "name": "mdtex-plugin",
  "version": "1.2.0",
  ...
}
```

#### 2. manifest.json

```json
{
  "id": "mdtex-plugin",
  "name": "mdtex plugin",
  "version": "1.2.0",
  ...
}
```

#### 3. versions.json

```json
{
  "1.2.0": "1.0.0"
}
```

形式: `{"newVersion": "minAppVersion"}`

### CHANGELOG.mdの更新

新しいバージョンセクションを追加:

```markdown
## [1.2.0] - 2025-02-15

### 追加
- 機能1の説明
- 機能2の説明

### 変更
- 依存関係XをバージョンYに更新
- Zのパフォーマンスを改善

### 修正
- issue #123の原因となるバグを修正
- Windowsでのクラッシュを解決

### 非推奨
- 機能Xは非推奨（2.0.0で削除予定）

### セキュリティ
- 依存関係Yの脆弱性を修正
```

---

## リリースの作成

### ステップ1: リリースブランチの作成

```bash
git checkout main
git pull origin main
git checkout -b release/v1.2.0
```

### ステップ2: バージョン変更のコミット

```bash
git add package.json manifest.json versions.json CHANGELOG.md
git commit -m "Release v1.2.0"
```

### ステップ3: ビルドのテスト

```bash
# クリーンインストール
rm -rf node_modules package-lock.json
npm ci

# テストの実行
npm test

# プラグインのビルド
npm run build

# 出力を検証
ls -la main.js manifest.json styles.css
```

### ステップ4: Mainへのマージ

```bash
git checkout main
git merge release/v1.2.0
git push origin main
```

### ステップ5: タグの作成とプッシュ

```bash
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

### ステップ6: GitHubリリースの作成

オプションA: GitHub CLIを使用（推奨）

```bash
gh release create v1.2.0 \
  --title "Release v1.2.0" \
  --notes "$(cat << 'EOF'
## 変更点

### 追加
- 機能1の説明
- 機能2の説明

### 変更
- 依存関係XをバージョンYに更新

### 修正
- issue #123の原因となるバグを修正

**完全な変更履歴**: https://github.com/Mekann2904/obsidian-mdtex-plugin/compare/v1.1.1...v1.2.0
EOF
)"
```

オプションB: 手動

1. GitHubリポジトリに移動
2. サイドバーで"Releases"をクリック
3. "Draft a new release"をクリック
4. タグ`v1.2.0`を選択
5. リリースタイトルを入力: "Release v1.2.0"
6. CHANGELOG.mdからリリースノートを貼り付け
7. "Publish release"をクリック

### ステップ7: デプロイの検証

1. **GitHub Actionsの確認**

   - Actionsタブに移動
   - ワークフローが正常に完了したことを確認
   - エラーがないか確認

2. **リリースのダウンロードとテスト**

   ```bash
   # リリースzipをダウンロード
   gh release download v1.2.0

   # 展開
   unzip obsidian-mdtex-plugin.zip

   # ローカルでテスト
   cp obsidian-mdtex-plugin/* ~/.obsidian/plugins/obsidian-mdtex-plugin/

   # Obsidianを開いてテスト
   ```

3. **BRATユーザーの確認**

   - BRATユーザーは自動的に更新を確認できる
   - アクションは不要である

---

## リリース後のタスク

### 即時タスク

1. **ドキュメントの更新**

   - 必要に応じてREADME.mdを更新
   - 機能が変更された場合はdocs/を更新
   - ドキュメントの更新をコミットしてプッシュ

2. **リリースの発表**

   - GitHub Discussionsで発表を投稿
   - 必要に応じてロードマップを更新
   - 関連プラットフォームで共有

3. **Issueの監視**

   - バグレポートを確認
   - ユーザーの質問に回答
   - 問題を追跡

### メンテナンスタスク

1. **リリースブランチのクリーンアップ**

   ```bash
   git branch -d release/v1.2.0
   git push origin --delete release/v1.2.0
   ```

2. **次のバージョンの準備**

   - 次のリリースのマイルストーンを作成
   - 機能バックログを更新
   - 次のバージョンを計画

3. **ロードマップの更新**

   - 完了した項目をマーク
   - 優先度を調整
   - 新しいアイデアを追加

---

## 緊急手順

### クイック修正（ホットフィックス）

リリース直後に重大なバグが見つかった場合:

1. **ホットフィックスブランチの作成**

   ```bash
   git checkout main
   git checkout -b hotfix/v1.2.1
   ```

2. **問題の修正**

   ```bash
   # 修正を行う
   vim affected-file.ts

   # 修正をテスト
   npm test
   npm run build
   ```

3. **パッチバージョンの更新**

   すべてのバージョンファイルでバージョンを`1.2.1`に更新

4. **CHANGELOG.mdの更新**

   ```markdown
   ## [1.2.1] - 2025-02-16

   ### 修正
   - Xを引き起こす重大なバグ
   ```

5. **コミットとリリース**

   ```bash
   git add .
   git commit -m "Hotfix v1.2.1"
   git checkout main
   git merge hotfix/v1.2.1
   git tag -a v1.2.1 -m "Hotfix v1.2.1"
   git push origin main --tags
   gh release create v1.2.1 --notes "Hotfix: critical bug fix"
   ```

### リリースのロールバック

リリースに重大な問題がある場合:

1. **ユーザーへの通知**

   - 警告を含むリリースノートを更新
   - GitHubにissueを投稿
   - 必要に応じてダウングレードを提案

2. **ロールバックリリースの作成**

   ```bash
   git checkout v1.1.1
   git checkout -b rollback/v1.2.1

   # バージョンを1.2.1に更新（壊れた1.2.0より新しい）
   # バージョンファイルを更新

   git tag -a v1.2.1 -m "Rollback release"
   git push origin --tags
   gh release create v1.2.1 --notes "Rollback to previous stable version"
   ```

3. **問題のドキュメント化**

   - GitHub issueを作成
   - 何が間違っていたかをドキュメント化
   - 適切な修正を計画

---

## リリースノートのテンプレート

### 標準リリースノート

```markdown
## [1.2.0] - 2025-02-15

### ハイライト
- 主要な機能1
- 主要な機能2

### 追加
- 機能1の説明
- 機能2の説明
- 機能3の説明

### 変更
- 依存関係Xを1.0.0から2.0.0に更新
- 変換のパフォーマンスを改善
- UIレイアウトを更新

### 修正
- XがYを失敗させるバグを修正
- Windowsでのクラッシュを解決
- 日本語フォントレンダリングを修正

### ドキュメント
- README.mdを更新
- 新しいチュートリアルを追加
- APIドキュメントを改善

**完全な変更履歴**: https://github.com/Mekann2904/obsidian-mdtex-plugin/compare/v1.1.1...v1.2.0
```

### ホットフィックスリリースノート

```markdown
## [1.2.1] - 2025-02-16

### 修正
- プラグインをクラッシュさせる重大なバグ
- タイトル内の日本語文字の問題

**重要**: これはv1.2.0の重大な問題に対処するホットフィックスリリースである

**完全な変更履歴**: https://github.com/Mekann2904/obsidian-mdtex-plugin/compare/v1.2.0...v1.2.1
```

---

## ベストプラクティス

### リリース前

1. **徹底的にテストする**
   - 複数のプラットフォームでテスト
   - 様々なファイルタイプでテスト
   - エッジケースをテスト

2. **変更をレビューする**
   - すべてのコード変更をレビュー
   - セキュリティ問題を確認
   - 意図しない限り破壊的変更がないことを確認

3. **コミュニケーションを準備する**
   - リリースノートを下書き
   - 発表を準備
   - ロールバック計画を用意

### リリース中

1. **プロセスに従う**
   - セマンティックバージョニングを使用
   - すべてのバージョンファイルを更新
   - 公開前にテスト

2. **透明性を持つ**
   - すべての変更をドキュメント化
   - 既知の問題を認める
   - アップグレードガイダンスを提供

### リリース後

1. **注意深く監視する**
   - バグレポートを確認
   - フィードバックに回答
   - 使用状況メトリクスを追跡

2. **問題から学ぶ**
   - 問題をドキュメント化
   - プロセスを改善
   - ガイドラインを更新

---

## トラブルシューティング

### タグが既に存在する

**問題**: タグv1.2.0が既に存在する

**解決策**: 削除して再作成

```bash
git tag -d v1.2.0
git push origin :refs/tags/v1.2.0
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

### ワークフローが失敗する

**問題**: GitHub Actionsワークフローが失敗する

**解決策**:

1. ワークフローログを確認
2. 失敗を特定
3. 問題を修正
4. 新しいコミットをプッシュ
5. ワークフローを再度トリガー

### リリースアーティファクトが見つからない

**問題**: ZIPファイルがリリースに添付されていない

**解決策**: 手動で作成

```bash
# zipを作成
mkdir release
cp main.js manifest.json styles.css release/
zip -r obsidian-mdtex-plugin.zip release/

# リリースにアップロード
gh release upload v1.2.0 obsidian-mdtex-plugin.zip
```

### バージョンの不一致

**問題**: ファイル間でバージョンが一致しない

**解決策**: すべてのファイルが同じバージョンを使用することを確認

```bash
# バージョンを確認
grep "version" package.json manifest.json versions.json

# すべて一致するように更新
# そしてコミット
```

---

## 関連トピック

- [デプロイガイド](./deployment.md) - デプロイガイド
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 貢献ガイドライン
- [CHANGELOG.md](../CHANGELOG.md) - バージョン履歴

## 次のトピック

- [デプロイガイド](./deployment.md)
