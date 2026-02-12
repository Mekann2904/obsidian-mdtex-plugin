---
title: LaTeXコマンドパレット開発ノート
category: 開発者ドキュメント
audience: 開発者
last_updated: 2026-02-12
tags: [LaTeX, パレット, 開発ノート]
related: [docs/latex-palette.md, docs/API.md]
---

# LaTeX コマンドパレット開発ノート

[ドキュメントインデックス](./index.md) > LaTeXコマンドパレット開発ノート

## 概要

開発者向けに LaTeX コマンドパレットの YAML 仕様と拡張手順をまとめます。

---

## 仕組み

設定値 `latexCommandsYaml` を `parseYaml` で配列にし、`buildLatexCommands` で `LatexCommand` 配列へ整形する。パース失敗や空配列時は `LATEX_COMMANDS` にフォールバックする。

---

## YAML スキーマ

- `cmd`: 文字列。挿入するテキスト。
- `desc`: 文字列。検索用の説明。
- `cursorOffset`: 数値。挿入後のカーソル移動。負値で戻す。

不要フィールドは無視される。

---

## 例

```yaml
- cmd: "\\frac{}{}"
  desc: "Fraction"
  cursorOffset: -3
- cmd: "\\alpha"
  desc: "alpha"
```

---

## リセット手順

設定画面の「LaTeX コマンドパレット」で YAML を編集する。デフォルトへ戻すボタンは `DEFAULT_LATEX_COMMANDS_YAML` を再適用する。

---

## よくある落とし穴

- YAML が配列でない場合は自動フォールバックする。原因調査時はコンソールの warn を見る。
- `cursorOffset` は改行を含む場合、 `offsetToPos` で安全に座標化するので大きめの負値でも壊れない。
- YAML を編集後は設定画面を閉じれば即保存される。再読み込みは不要。

---

## 関連トピック

- [LaTeXコマンドパレット](./latex-palette.md)
- [APIリファレンス](./API.md)
- [開発ガイド](./development.md)

## 次のトピック

- [開発ガイド](./development.md)
