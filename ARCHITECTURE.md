---
title: アーキテクチャ
category: 開発者ドキュメント
audience: 開発者, メンテナー
last_updated: 2026-07-14
tags: [アーキテクチャ, 設計, コンポーネント]
related: [./CONTRIBUTING.md, docs/development.md, docs/design-decisions.md]
---

# MdTeXプラグインのアーキテクチャ

[ドキュメントインデックス](docs/index.md) > ARCHITECTURE.md

## 概要

このドキュメントでは、MdTeXプラグインのアーキテクチャについて説明する。コンポーネント、データフロー、設計原則を含む。

MdTeXは、PandocとLuaLaTeXを使用してMarkdownファイルをPDF、LaTeX、DOCX形式に変換するObsidianプラグインである。責任の分離、テスト容易性、拡張性を考慮して設計されている。

### コアの責任

1. **形式変換**: 外部ツールを使用してMarkdownをPDF/LaTeX/DOCXに変換
2. **Linting**: コード品質のためにmarkdownlint統合を提供
3. **コマンド支援**: LaTeXコマンドパレットとインライン補完を提供
4. **プロファイル管理**: 複数の設定プロファイルをサポート
5. **I18n対応**: 英語と日本語のローカライズUIを提供

---

## 設計原則

### 1. 責任の分離

各コンポーネントは明確で単一の責任を持つ：

- **MdTeXPlugin.ts**: プラグインライフサイクルとコマンド登録
- **convertService.ts**: 変換ロジックの調整
- **pandocCommandBuilder.ts**: Pandocコマンド構築（純粋関数）
- **lintService.ts**: Lint操作
- **settingsService.ts**: 設定の永続化

### 2. テスト容易性

ビジネスロジックは Obsidian API 依存から分離されている：

- 可能な限り純粋関数（例: `buildPandocCommand`）
- サービスの依存性注入（例: `ConvertDeps`）
- 外部プロセスのモック可能なインターフェース

### 3. 拡張性

- CodeMirror API経由のエディタ拡張
- Pandoc用のカスタムLuaフィルタ
- YAMLベースのコマンド定義
- モジュール式ユーティリティ関数

### 4. エラーハンドリング

ユーザーフィードバックによる優雅なデグレード：

- ユーザー向けエラーの通知
- デバッグ用コンソールログ
- 適切な場合、デフォルトへのフォールバック

---

## コンポーネントアーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                      MdTeXPlugin                             │
│  (エントリポイント - ライフサイクルとコマンド登録)           │
└────────────────┬────────────────────────────────────────────┘
                 │
    ┌────────────┼────────────┬────────────┬────────────┐
    │            │            │            │            │
    ▼            ▼            ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌─────────┐  ┌────────┐  ┌─────────┐
│Convert │  │ Lint   │  │Settings │  │Modal   │  │Suggest  │
│Service │  │Service │  │Service  │  │(UI)    │  │(UI)     │
└───┬────┘  └───┬────┘  └────┬────┘  └───┬────┘  └────┬────┘
    │           │           │            │            │
    ▼           ▼           ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────┐
│                    ユーティリティ層                         │
│  - pandocCommandBuilder                                      │
│  - processRunner                                             │
│  - markdownTransforms                                        │
│  - latexPreamble                                             │
│  - transclusion                                              │
│  - mermaidRasterizer                                         │
│  - pathHelpers                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## データフロー

### PDF変換フロー

```
ユーザーアクション（コマンド）
    │
    ▼
MdTeXPlugin.runConversion()
    │
    ▼
convertCurrentPage()
    ├───► conversionPaths.buildConversionPaths()
    │       └──► 入力/出力/中間体のパス構築（純粋関数）
    │
    ├───► normalizeMarkdown()
    │       ├──► stripObsidianComments
    │       ├──► resolveDraftRequest（--draft / frontmatter）
    │       ├──► expandTransclusions
    │       ├──► rasterizeMermaidBlocks（有効時）
    │       ├──► markdownlint --fix（lint 中間ファイル lifecycle 内蔵）
    │       ├──► unwrapValidWikiLinks
    │       ├──► replaceWikiLinksAndCodeAsync
    │       └──► detectDuplicateLabels
    │
    ├───► headerBuilder.buildHeader()
    │       └──► --include-in-header の LaTeX ヘッダ構築（純粋関数）
    │
    └───► pandocInvocation.invokePandoc()
            ├──► buildPandocCommand（引数構築、純粋関数）
            ├──► header / Lua / YAML フィルタの一時ファイル化（tempFiles 経由）
            ├──► processRunner.runCommand() → pandoc → lualatex
            └──► cleanupTemporaryFiles（一時ファイルを全て片付け）
```

### Lintフロー

```
ユーザーアクション（Lintコマンド）
    │
    ▼
LintCurrentNote()
    │
    ├───► アクティブファイルのコンテンツを取得
    │
    ├───► 一時ファイルに書き込み
    │
    └───► diagnosticService.runDiagnostics()
            └──► markdownlint-cli2
            │
            └───► 出力の解析 → 結果の表示
```

---

## サービス層

### ConvertService

**場所**: `src/services/convertService.ts`

**責任**:

- 変換ワークフローの調整（オーケストレーション層）
- defaults file のパス解決（pack / custom）と出力先の検証
- 本文正規化を `normalizeMarkdown` へ、Pandoc 起動を `invokePandoc` へ委譲

**主要な関数**:

```typescript
export async function convertCurrentPage(
  ctx: PluginContext,
  deps: ConvertDeps,
  format: OutputFormat,
): Promise<void>
```

**依存関係**:

- `PluginContext` - アプリ状態と設定
- `ConvertDeps` - 注入された依存関係（Lintサービス）
- `normalizeMarkdown` - Obsidian 記法の本文正規化（8 step の順序と lint 中間ファイル lifecycle を内蔵）
- `conversionPaths` - 変換実行の作業パス群（入力、出力、中間体）
- `invokePandoc` - Pandoc 起動と一時フィルタ、header の lifecycle
- `headerBuilder` - `--include-in-header` の LaTeX ヘッダ構築（純粋関数）

### NormalizeMarkdown

**場所**: `src/services/normalizeMarkdown.ts`

**責任**:

- Obsidian 記法 → Pandoc 受理可能 Markdown への本文正規化パイプライン
- 8 step の順序不変条件（コメント除去 → draft 解決 → トランスクルージョン → Mermaid → lint → WikiLink 除去 → WikiLink/画像置換 → 重複ラベル検出）を内蔵
- lint 中間ファイル（`.temp.md`）の生成、読み戻し、片付けを所有
- **GUI と CLI の唯一の正規化経路**: Obsidian App に依存せず `VaultLike` + injectable な mermaid/lint 通知を受け取るため、GUI（`convertService`）と CLI（`cli/normalize.ts`）が同じパイプラインを呼ぶ。順序不変条件はこの module 1箇所に集約され、CLI は draft/lint/mermaid の依存を省略して該当 step をスキップする。

### ConversionPaths

**場所**: `src/services/conversionPaths.ts`

**責任**:

- 1 回の変換実行で使う作業パス群（入力、出力、lint 中間体、リソースパス）を純粋関数で構築
- 命名規則（空白→_ 置換、latex 拡張子、中間体の置き場）を 1 箇所に集約（app 非依存、テスト容易）

### LintService

**場所**: `src/services/lintService.ts`

**責任**:

- アクティブファイルでのmarkdownlint実行
- 診断結果の表示
- 自動修正機能の提供

**主要な関数**:

```typescript
export async function lintCurrentNote(ctx: PluginContext): Promise<void>
export async function runMarkdownlintFix(ctx: PluginContext, targetPath: string): Promise<void>
```

### DiagnosticService

**場所**: `src/services/diagnosticService.ts`

**責任**:

- markdownlint-cli2の実行
- 出力を構造化形式に解析
- エラーコードを人間が読めるメッセージにマッピング

### SettingsService

**場所**: `src/services/settingsService.ts`

**責任**:

- ストレージからの設定読み込み
- ストレージへの設定保存
- 設定構造の検証

**主要な関数**:

```typescript
export async function loadSettings(loadFn: () => Promise<string>): Promise<PandocPluginSettings>
export async function saveSettings(settings: PandocPluginSettings, saveFn: (data: string) => Promise<void>): Promise<void>
```

### ProfileManager

**場所**: `src/services/profileManager.ts`

**責任**:

- プロファイルCRUD操作
- プロファイル検証
- アクティブプロファイル管理

**主要な関数**:

```typescript
export function createProfile(profiles: Record<string, ProfileSettings>, name: string): Record<string, ProfileSettings>
export function deleteProfile(profiles: Record<string, ProfileSettings>, name: string): Record<string, ProfileSettings>
export function renameProfile(profiles: Record<string, ProfileSettings>, oldName: string, newName: string): Record<string, ProfileSettings>
```

---

## ユーティリティ層

### PandocCommandBuilder

**場所**: `src/services/pandocCommandBuilder.ts`

**責任**:

- Pandocコマンド引数の構築
- 形式固有オプションの処理
- リソースパスの構築
- クロスリファレンスラベルの適用

**設計**: 副作用のない純粋関数、高テスト可能性

**主要な関数**:

```typescript
export function buildPandocCommand(options: PandocCommandOptions): PandocCommandResult
```

### ProcessRunner

**場所**: `src/utils/processRunner.ts`

**責任**:

- 外部コマンドの実行（pandoc, lualatex, markdownlint）
- stdout/stderrストリームの処理
- タイムアウト処理の提供

**主要な関数**:

```typescript
export async function runCommand(options: ProcessOptions): Promise<ProcessResult>
export async function killProcess(pid: number): Promise<void>
```

### MarkdownTransforms

**場所**: `src/utils/markdownTransforms.ts`

**責任**:

- Obsidianトランスクルージョン（`![[file]]`）の展開
- WikiLinksをMarkdownリンクに変換
- Obsidian固有のコメントの削除
- ドラフトモード変換の適用

**主要な関数**（シグネチャは概要である。最新、完全な定義はソースを参照）：

```typescript
// トランスクルージョン展開。Obsidian App 依存を VaultLike 抽象で切り離し、GUI と CLI で共用。
export async function expandTransclusions(
  markdown: string,
  vault: VaultLike,
  sourcePath: string,
  cache: Map<string, string>,
  visited?: Set<string>,
  expanded?: Set<string>,
): Promise<string>
// WikiLink / 埋め込み画像を標準 Markdown 記法へ。VaultLike + ProfileLike 経由で GUI/CLI 共用。
export async function replaceWikiLinksAndCodeAsync(
  markdown: string,
  vault: VaultLike,
  profile: ProfileLike,
  sourcePath: string,
): Promise<string>
// 有効な WikiLink のみブラケットを除去。
export function unwrapValidWikiLinks(markdown: string, vault: VaultLike, sourcePath: string): string
// Obsidian コメント (%% %%) を除去。
export function stripObsidianComments(content: string): string
```

### Transclusion

**場所**: `src/utils/transclusion.ts`

**責任**:

- 再帰的トランスクルージョン展開
- 循環参照検出
- 深度制限

### MermaidRasterizer

**場所**: `src/utils/mermaidRasterizer.ts`

**責任**:

- Mermaid図をPNGに変換
- ObsidianのDOM描画を使用
- 図解析エラーの処理

**主要な関数**:

```typescript
export async function rasterizeMermaidBlocks(app: App, content: string): Promise<string>
```

### PathHelpers

**場所**: `src/utils/pathHelpers.ts`

**責任**:

- プラットフォーム間でのファイルパスの正規化
- ObsidianパスとOSパス間の変換
- リソースパスリストの処理

**主要な関数**:

```typescript
export function normalizeFsPath(filePath: string): string
export function joinFsPath(...parts: string[]): string
export function normalizeResourcePathList(path: string): string
```

### LatexPreamble

**場所**: `src/utils/latexPreamble.ts`

**責任**:

- LaTeXプリアンブルのクリーニングと検証
- ラベルオーバーライドの適用
- カスタムプリアンブルとデフォルトのマージ

**主要な関数**:

```typescript
export function cleanLatexPreamble(preamble: string): string
export function appendLabelOverrides(preamble: string, profile: ProfileSettings): string
```

### CalloutTheme

**場所**: `src/utils/calloutTheme.ts`

**責任**:

- コールアウトボックスのLaTeXコード生成
- ObsidianコールアウトタイプからLaTeX tcolorboxスタイルへのマッピング

---

## UIコンポーネント

### SettingTab

**場所**: `src/MdTeXPluginSettingTab.ts`

**責任**:

- 設定UIの表示
- プロファイル管理UIの処理
- ユーザー入力の検証
- 設定変更の保存

**主要なクラス**:

```typescript
class PandocPluginSettingTab extends PluginSettingTab {
  display(): void
  save(): void
}
```

### LatexCommandModal

**場所**: `src/modal/LatexCommandModal.ts`

**責任**:

- 検索可能なコマンドパレットの表示
- 検索クエリによるコマンドのフィルタリング
- カーソル位置への選択コマンドの挿入

---

## 拡張システム

### LatexGhostTextExtension

**場所**: `src/extensions/latexGhostText.ts`

**責任**:

- インラインゴーストテキストサジェストの提供
- 補完用のTab/Enter処理
- CodeMirror 6との統合

**主要な関数**:

```typescript
export function createLatexGhostTextExtension(plugin: MdTeXPlugin): Extension
```

### Editor Suggesters

**場所**:
- `src/suggest/LatexEditorSuggest.ts` - LaTeXコマンドサジェスト
- `src/suggest/LabelEditorSuggest.ts` - ラベルサジェスト（編集用）
- `src/suggest/LabelReferenceSuggest.ts` - ラベルサジェスト（参照用）

**責任**:

- インライン補完の提供
- トリガー文字（`@`, `#`）の処理
- コンテストによるサジェストのフィルタリング

---

## 設定管理

### 設定構造

**場所**: `src/MdTeXPluginSettings.ts`（以下の型定義は概要である。フィールドの完全、最新の定義は常にソースを参照すること。概要と実装が食い違う場合は実装が正である）。

```typescript
export interface PandocPluginSettings {
  profiles: Record<string, ProfileSettings>;
  activeProfile: string;
  suppressDeveloperLogs: boolean;
  enableMarkdownlintFix: boolean;     // markdownlint-cli2 --fix をPandoc実行前に適用
  markdownlintCli2Path: string;       // markdownlint-cli2実行ファイルパス（空は自動解決）
  enableExperimentalMermaid: boolean; // Mermaid DOM rasterization を使うか（実験的）
  latexCommandsYaml: string;          // LaTeX コマンドパレット用のユーザ定義 YAML
  enableLatexPalette: boolean;        // LaTeXコマンドパレット/補完の有効、無効
  enableLatexGhost: boolean;          // ゴーストテキスト補完の有効、無効
  sampleTemplatesScaffolded: boolean; // 初回サンプルテンプレートパック展開済みか（ADR-008）
  collapsedSections: Record<string, boolean>; // 設定タブの折りたたみセクション開閉状態
}
```

`ProfileSettings` は1プロファイル分の設定で、基本項目（pandoc/latex エンジン、出力先、フォント、マージン、crossref ラベル語等）に加え、文書テンプレート方式（ADR-007/008: `documentTemplateMode` / `defaultsFilePath` / `selectedTemplatePack` / `defaultsSelection` / `templateFolder`）と citation モード（ADR-009: `citationMode` / `pdfEngineOpts`）のフィールドを持つ。フィールド一覧は `src/MdTeXPluginSettings.ts` の `ProfileSettings` interface および `DEFAULT_PROFILE` を参照すること（ドキュメントへの再掲は意図的に省略する。実装とドキュメントのズレを防ぐためである）。

### 永続化

設定はプラグインディレクトリ内の `data.json` に保存される：

```
.obsidian/plugins/obsidian-mdtex-plugin/data.json
```

### 検証

設定はロード時に検証され、不備があればデフォルトへフォールバックされる：

```typescript
export const DEFAULT_SETTINGS: PandocPluginSettings = { ... };
export const DEFAULT_PROFILE: ProfileSettings = { ... };
```

---

## 国際化

### アーキテクチャ

- **ロケールファイル**: `src/lang/locale/{en,ja}.ts`
- **ヘルパー**: `src/lang/helpers.ts`
- **型安全性**: 共有の `TranslationKeys` 型

### 新しい翻訳の追加

1. `src/lang/locale/en.ts` にキーを追加
2. `src/lang/locale/ja.ts` に翻訳を追加
3. `t()` ヘルパー経由で使用：

```typescript
import { t } from "./lang/helpers";
const message = t("setting_output_format_name");
```

### ロケール検出

ロケールは Obsidian の `moment.locale()` に基づいて決定される：

```typescript
const locale = moment.locale();
const lang = locale.startsWith("ja") ? "ja" : "en";
```

---

## テスト戦略

### ユニットテスト

`src/**/*.test.ts` に配置：

- `pandocCommandBuilder.test.ts` - コマンド構築ロジック
- `convertService.test.ts` - 変換ワークフロー
- `profileManager.test.ts` - プロファイルCRUD操作
- `diagnosticService.test.ts` - 出力解析

### テストフレームワーク

- **フレームワーク**: Vitest
- **カバレッジ**: `@vitest/coverage-v8`
- **ランナー**: `npm test`

### モック

Obsidian API は `vitest` と `jsdom` を使ってモックする：

```typescript
import { describe, it, expect, vi } from "vitest";

describe("Feature", () => {
  it("should test something", () => {
    const mockApp = createMockApp();
    // テスト実装
  });
});
```

---

## パフォーマンスの考慮事項

### 変換時間の最適化

- **ドラフトモード**: `--draft`フラグによる低品質画像埋め込み
- **中間ファイル**: デバッグ用のオプションクリーンアップ
- **並列処理**: バッチ変換の検討

### メモリ管理

- **一時ファイル**: 使用後にクリーンアップ（設定可能）
- **大規模ファイル**: 可能な限り入力/出力のストリーミング
- **キャッシュ**: トランスクルージョン結果のキャッシュを検討

### 非同期操作

長時間実行される操作はすべてasync/awaitを使用：

```typescript
export async function convertCurrentPage(...): Promise<void> {
  // 非ブロッキング操作
}
```

---

## セキュリティの考慮事項

### コマンドインジェクション防止

- 配列ベースのコマンド実行を使用（テンプレート文字列は使用しない）
- パス内のユーザー入力を検証
- LaTeX内の特殊文字をエスケープ

### パストラバーサル防止

- 全パスを正規化
- 可能な限りvaultディレクトリに制限
- ファイル拡張子の検証

### プロセス分離

- 外部ツールは別プロセスとして実行
- ハングしたプロセスのタイムアウト処理
- リソース制限の考慮

---

## エラーハンドリング戦略

### エラーカテゴリ

1. **ユーザーエラー**（ファイル不在、設定無効） - ユーザーフレンドリーなメッセージを表示
2. **外部ツールエラー**（pandoc失敗） - ドキュメントへのリンク付きstderrを表示
3. **プラグインエラー**（予期しない状態） - 詳細をログ、一般的なメッセージを表示

### エラーフロー

```
エラー発生
    │
    ├───► コンソールにログ（非表示でない場合）
    │
    ├───► エラーメッセージの解析
    │
    ├───► ユーザーフレンドリーな通知の作成
    │
    └───► ステータスバーの更新
```

### フォールバック動作

- プロファイル不在: DEFAULT_PROFILEにフォールバック
- 無効なコマンド: ビルトインデフォルトを使用
- 依存関係不在: インストール手順をユーザーに提示

---

## 今後のアーキテクチャの考慮事項

### 可能な改善

1. **プラグインシステム**: ユーザー定義のコンバータ/フィルタを許可
2. **イベントバス**: より良い拡張性のためのコンポーネント分離
3. **状態管理**: UI更新のリアクティブ状態を検討
4. **ワーカースレッド**: 計算量の多い処理をオフロード
5. **進捗インジケーター**: 長時間操作のより良いフィードバック

### 拡張ポイント

- カスタムコンバータ（PDF/LaTeX/DOCXを超える）
- ユーザー定義Markdown変換
- カスタムサジェスター
- テーマ可能なUIコンポーネント

---

## 関連トピック

- [開発ガイド](docs/development.md)
- [テストガイド](docs/testing.md)
- [I18nガイド](docs/i18n.md)
- [APIリファレンス](docs/API.md)
- [設計決定](docs/design-decisions.md)

## 次のトピック

- [開発ガイド](docs/development.md)
