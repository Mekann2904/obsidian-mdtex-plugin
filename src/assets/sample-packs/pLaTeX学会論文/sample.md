---
date: 2026-06-20
---

% pLaTeX 専用クラスのタイトル・著者・所属・概要は、本文先頭の raw LaTeX ブロックで
% 記述する（クラスの公式サンプルと同じ書き方）。以下は ipsj の例。
% 他のクラスを使う場合は、そのクラスの \title / \author 等の形式に合わせる。
% ※ ipsj.cls をこのフォルダに配置してから使うこと（公式配布物）。
%
% 【画像】sample-logo.png はダミー。実際の画像に差し替えるか、この画像ブロックを削除。

```{=latex}
\setcounter{巻数}{1}
\title{pLaTeX 専用クラスのサンプル}
\etitle{Sample for pLaTeX-only Classes}
\affiliate{LAB}{所属\\Affiliation}
\author{著者 太郎}{Taro Author}{LAB}

\begin{abstract}
本サンプルは、MdTex で pLaTeX 専用クラス（情報処理学会 ipsj 等）を扱うテンプレート
パックの全機能（画像・数式・表・コード・相互参照）を確認するためのものである。
\end{abstract}

\begin{eabstract}
This sample verifies all features (image, equation, table, code, cross-reference)
of the template pack for pLaTeX-only classes (e.g., IPSJ ipsj) in MdTex.
\end{eabstract}

\maketitle
```

# はじめに

本文は通常の Markdown で書く。節構造は `#` / `##` で書き、Pandoc が `\section` /
`\subsection` に変換し、クラスが連番付きで組版する。見出しに手書きで番号を入れない。

## 画像

画像は `![キャプション](ファイル名.png)` で埋め込む。ファイル名にスペースが含まれて
いても（Obsidian の「Pasted image …」等）、`sanitize-images.lua` が自動で処理する。

![サンプル画像](sample-logo.png){#fig:logo}

[@fig:logo] を参照。

## 数式

表示数式は `$$ ... $$` で書く。ラベル `{#eq:id}` を付けると相互参照できる。

$$
e^{i\pi} + 1 = 0
$$
{#eq:euler}

[@eq:euler] を参照。行内数式 $a^2 + b^2 = c^2$ も使える。

## 表

Markdown の表は `simple-table.lua` が `table` + `tabular` に変換する（twocolumn 対応）。
ラベルは `: caption {#tbl:id}` 構文で付ける。

| 手法   | 精度  | 速度 |
|--------|-------|------|
| A      | 95%   | 高速 |
| B      | 90%   | 遅い |

: 手法の比較 {#tbl:methods}

[@tbl:methods] を参照。

## コードブロック

キャプション付きコードブロックは `code-blocks.lua` が処理する（2重キャプション回避）。
言語指定あり・なしどちらでも動く。

```{#lst:python_demo caption="Hello World 関数"}
def hello_world():
    # 日本語コメントの確認
    print("Hello, MdTex!")

if __name__ == "__main__":
    hello_world()
```

```python{#lst:typed caption="型付き Python"}
def greet(name: str) -> str:
    return f"Hello, {name}!"
```

言語指定なしのプレーンコードブロックも使える:

```
def plain():
    pass
```

# まとめ

[@eq:euler], [@fig:logo], [@tbl:methods], [@lst:python_demo], [@lst:typed] をまとめて参照。
