---
title: Markdownガイド
category: ユーザードキュメント
audience: 新規ユーザー, 既存ユーザー
last_updated: 2026-02-12
tags: [Markdown, ガイド, 記法]
related: [docs/quickstart.md, docs/advanced.md]
---

# Markdownガイド

[ドキュメントインデックス](./index.md) > Markdownガイド

## 概要

このガイドでは、MdTexプラグインで使用できるMarkdown記法について詳しく解説します。基本的な構文から、画像、コードブロック、数式、表などの高度な記法まで網羅的に説明します。

---

## Markdownとは

Markdownは、簡潔な記法で文書を記述できる軽量マークアップ言語です。MdTexプラグインは、MarkdownをPDFに変換する際にPandocを使用します。Pandocは、標準的なMarkdown構文に加え、多くの拡張構文をサポートしています。

基本的な原則：
- 読みやすさを重視
- HTMLに変換可能
- 拡張性が高い

---

## 見出し

見出しは`#`で表し、レベル1からレベル6まで使用できます。

### 基本的な見出し

```markdown
# レベル1の見出し
## レベル2の見出し
### レベル3の見出し
#### レベル4の見出し
##### レベル5の見出し
###### レベル6の見出し
```

### 見出しのID指定

見出しにIDを付与して参照可能にします：

```markdown
## はじめに {#sec:intro}

後で[この見出し](#sec:intro)に参照できます。
```

---

## 段落と改行

### 段落

段落間は空行で区切ります：

```markdown
これは最初の段落です。

これは2つ目の段落です。
```

### 改行

行末に2つのスペースを入れるか、HTMLの`<br>`を使用します：

```markdown
これは1行目です。（スペース2つ）
これは2行目です。
```

---

## 文字の装飾

```markdown
*斜体* または _斜体_
**太字** または __太字__
***斜体と太字***
~~取り消し線~~
`コード`
```

---

## リスト

### 箇条書き

```markdown
- 項目1
- 項目2
  - 入れ子1
  - 入れ子2
- 項目3
```

### 番号付きリスト

```markdown
1. 項目1
2. 項目2
3. 項目3
```

### 定義リスト

```markdown
用語1
: 説明1
: 説明2

用語2
: 説明
```

---

## リンク

### 基本的なリンク

```markdown
[リンクテキスト](https://example.com)
[リンク](./file.md)
```

### 参照スタイル

```markdown
[リンク][ref]

[ref]: https://example.com
```

---

## 画像

### 基本的な画像

```markdown
![代替テキスト](path/to/image.png)
```

### WikiLink

```markdown
![[image.png]]
```

---

## コードブロック

### インラインコード

````markdown
`コード`
````

### コードブロック

````markdown
```python
def hello():
    print("Hello, World!")
```
````

### 行番号付き

````markdown
```{.python .numberLines}
def hello():
    print("Hello, World!")
```
````

---

## 数式

### インライン数式

```markdown
$E = mc^2$
```

### ブロック数式

```markdown
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

---

## 表

### 基本的な表

```markdown
| 列1 | 列2 | 列3 |
|-----|-----|-----|
| A   | B   | C   |
| D   | E   | F   |
```

### 整形

```markdown
| 左寄せ | 中央 | 右寄せ |
|:-------|:----:|-------:|
| A      | B    | C      |
```

---

## 引用

```markdown
> 引用文
> > 入れ子の引用
```

---

## 区切り線

```markdown
---
***
___
```

---

## 脚注

```markdown
これは脚注の例[^1]。

[^1]: 脚注の内容
```

---

## YAMLフロントマター

```markdown
---
title: ドキュメントタイトル
author: 著者名
date: 2025-01-31
---
```

---

## Obsidian固有の記法

### WikiLink

```markdown
[[ノート名]]
[[ノート名|表示名]]
![[画像.png]]
```

### タグ

```markdown
#タグ名
```

---

## Pandoc拡張構文

### 定義リスト、上付き・下付き文字、数表など

Pandocは多くの拡張構文をサポートしています。詳細はPandocドキュメントを参照してください。

---

## 関連トピック

- [クイックスタート](./quickstart.md)
- [高度な機能ガイド](./advanced.md)
- [チュートリアル](./tutorial.md)

## 次のトピック

- [高度な機能ガイド](./advanced.md)
