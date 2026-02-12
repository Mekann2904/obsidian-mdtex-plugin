---
title: APIリファレンス
category: 開発者ドキュメント
audience: 開発者
last_updated: 2026-02-12
tags: [API, リファレンス, インターフェース]
related: [../ARCHITECTURE.md, docs/development.md]
---

# APIリファレンス

[ドキュメントインデックス](./index.md) > APIリファレンス

## 概要

このドキュメントでは、MdTexプラグインの包括的なAPIドキュメントを提供します。パブリックインターフェース、サービス、ユーティリティ関数を含みます。

---

## コア型

### OutputFormat

変換のターゲット出力形式。

```typescript
export type OutputFormat = "pdf" | "latex" | "docx";
```

### ProfileSettings

単一の設定プロファイルを定義するインターフェース。

```typescript
export interface ProfileSettings {
  pandocPath: string;
  pandocExtraArgs: string;
  searchDirectory: string;
  outputDirectory: string;
  outputFormat: string;
  latexEngine: string;
  fontSize: string;
  latexPreamble: string;
  // ... その他の設定
}
```

---

## プラグインAPI

### MdTexPlugin

メインプラグインクラス。

```typescript
export default class MdTexPlugin extends Plugin {
  settings: PandocPluginSettings;
  
  onload(): Promise<void>;
  onunload(): void;
  
  convertCurrentPage(): Promise<void>;
  lintCurrentNote(): Promise<void>;
}
```

---

## サービス層

### ConvertService

変換ワークフローを調整するサービス。

```typescript
export async function convertCurrentPage(
  ctx: PluginContext,
  deps: ConvertDeps,
  format: OutputFormat
): Promise<void>
```

### LintService

Lint操作を提供するサービス。

```typescript
export async function lintCurrentNote(ctx: PluginContext): Promise<void>
export async function runMarkdownlintFix(ctx: PluginContext, targetPath: string): Promise<void>
```

---

## ユーティリティ関数

### PandocCommandBuilder

Pandocコマンドを構築する純粋関数。

```typescript
export function buildPandocCommand(
  options: PandocCommandOptions
): PandocCommandResult
```

### MarkdownTransforms

Markdownコンテンツを変換する関数。

```typescript
export async function expandTransclusions(
  app: App,
  content: string,
  basePath: string
): Promise<string>

export function replaceWikiLinks(content: string): string
export function stripObsidianComments(content: string): string
```

---

## i18n API

### 翻訳関数

```typescript
import { t } from "./lang/helpers";

const message = t("setting_output_format_name");
```

---

## 拡張API

### CodeMirror拡張

```typescript
export function createLatexGhostTextExtension(
  plugin: MdTexPlugin
): Extension
```

---

## 使用例

### PDF変換

```typescript
import { convertCurrentPage } from "./services/convertService";

await convertCurrentPage(ctx, deps, "pdf");
```

### コマンド構築

```typescript
import { buildPandocCommand } from "./services/pandocCommandBuilder";

const result = buildPandocCommand({
  format: "pdf",
  inputPath: "/path/to/input.md",
  outputPath: "/path/to/output.pdf",
  // ... その他のオプション
});
```

---

## 関連トピック

- [アーキテクチャ](../ARCHITECTURE.md)
- [開発ガイド](./development.md)
- [テストガイド](./testing.md)

## 次のトピック

- [i18nガイド](./i18n.md)
