---
title: MdTex Plugin 検証レポート
author: 開発チーム
date: 2025-12-05
mdtex:
  - draft
---

\clearpage

```mermaid
gantt
    title "プロジェクト進行"
    dateFormat YYYY-MM-DD
    axisFormat %m/%d

    section 企画
    要件定義      :done, 2024-02-01, 2024-02-10
    仕様設計      :active, 2024-02-11, 2024-02-20

    section 開発
    フロントエンド開発 : 2024-02-21, 2024-03-10
    バックエンド開発   : 2024-02-25, 2024-03-15
    API統合          : 2024-03-16, 2024-03-20

    section テスト
    単体テスト      : 2024-03-21, 2024-03-25
    統合テスト      : 2024-03-26, 2024-03-30
    最終確認        : 2024-03-31, 2024-04-01
    
```
{#fig:mermaid}[mermaid]




```mermaid
graph LR

    user[ユ-ザ-]
    term["タ-ミナルエミュレ-タ (Terminal.app 等)"]
    shell["シェル (bash, zsh, fish, PowerShell 等)"]
    kernel[カ-ネル]
    hw[ハ-ドウェア]

    user --> term
    term --> shell
    shell --> kernel
    kernel --> hw

    classDef layer fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000;
    class user,term,shell,kernel,hw layer;

```
{#fig:system-arch}[システム構成図]
 


![[Pasted image 20251203125441.png]]{#fig:kitty}[terminal]



![[Pasted image 20251202224513.png]]{#fig:hogehoge width=120mm}[適当な画像]


\clearpage

相互参照

- [@fig:mermaid]

- [@fig:system-arch]

- [@fig:kitty]

- [@fig:hogehoge]

このように表示できます。


\clearpage

# MdTex Plugin 機能テスト

このドキュメントは、MdTex Plugin の新機能およびリファクタリング後の動作確認用ファイルです。

## 1. コールアウト

> ただの引用

> [!memo]
> 
> 今回のアップデートで引用（Blockquote）のデザインが `tcolorbox` ベースに変更されました。
> 背景色や左側のラインが正しく表示されているか確認してください。

## 2. 埋め込みリンク (Transclusion) の展開

以下に、外部ファイル `mdtex_test_sub.md` の内容が展開されます。



![[mdtex_test_sub]]


\clearpage

### 埋め込みの引用

>![[mdtex_test_sub]]





## 3. 数式と相互参照 (Equations)

オイラーの等式を以下に示します。

$$
e^{i\pi} + 1 = 0
$$
{#eq:euler}

上記の数式は [@eq:euler]です。
数式番号が自動的に付与され、本文中の参照リンクが機能していることを確認してください。


\clearpage

## 4. コードブロックとListing (Code Blocks)

Pythonコードのハイライトと、キャプション・枠線の表示を確認します。

```{#lst:python_demo caption="Hello World関数"}
def hello_world():
    # 日本語コメントの確認
    print("Hello, MdTex!")

if __name__ == "__main__":
    hello_world()
    

```

シンタックスハイライト時のバグを修正しました。

```python{#lst:python_demo_hoge caption="Hello World関数"}
def hello_world():
    # 日本語コメントの確認
    print("Hello, MdTex!")

if __name__ == "__main__":
    hello_world()
    

```


通常のコードブロックも表示可能です。

```
def hello_world():
    # 日本語コメントの確認
    print("Hello, MdTex!")

if __name__ == "__main__":
    hello_world()
    

```


相互参照 

- [@lst:python_demo]  

- [@lst:python_demo_hoge]

## 5. 表

| 11  | 12  |
| --- | --- |
| 12  | 13  |
: table {#tbl:table}


相互参照　

- [@tbl:table]



