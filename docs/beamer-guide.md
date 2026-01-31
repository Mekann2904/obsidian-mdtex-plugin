# Beamer使用ガイド

MdTexを使用してプレゼンテーションPDF（Beamer）を作成する方法を解説します。

---

## 目次

- [Beamerとは](#beamerとは)
- [設定手順](#設定手順)
- [スライドの書き方](#スライドの書き方)
- [よく使うコマンド](#よく使うコマンド)
- [テーマのカスタマイズ](#テーマのカスタマイズ)
- [トラブルシューティング](#トラブルシューティング)
- [サンプル](#サンプル)

---

## Beamerとは

BeamerはLaTeXのプレゼンテーション作成クラスです。PDF形式のスライドを生成し、以下の特徴があります：

- 数式や図表の美しい配置
- ナビゲーション構造の自動生成
- 日本語の適切な処理
- 段階的な表示（アニメーション効果）

---

## 設定手順

### 1. プロファイルの作成

専用のBeamerプロファイルを作成することを推奨します。

1. **新しいプロファイルを作成**
   - 設定画面 → 「新しいプロファイルを作成」
   - 名前: `スライド用`や`Beamer`など

2. **基本設定**

   | 設定項目 | 推奨値 | 説明 |
   |---------|-------|------|
   | 出力フォーマット | `pdf` | PDFスライドを生成 |
   | ドキュメントクラス | `beamer` | Beamerクラスを使用 |
   | フォントサイズ | `10pt` または `8pt` | スライド用に小さめ |
   | Pandoc Crossref | **無効** | 競合を防ぐため |
   | マージンを指定 | **無効** | Beamerは独自に管理 |

### 2. LaTeXプリアンブルの設定

以下のプリアンブルを設定画面に貼り付けます：

```latex
\usepackage{microtype}
\usepackage{luatexja}
\usepackage[noto-otf]{luatexja-preset}
\usepackage{luatexja-fontspec}

% フォント設定
\setmainfont{Noto Sans CJK JP}
\setsansfont{Noto Sans CJK JP}
\setmonofont{Ricty Diminished}

% 和文フォント
\setmainjfont{Noto Sans CJK JP}
\setsansjfont{Noto Sans CJK JP}
\setmonojfont{Ricty Diminished}

% スライドテーマ（オプション）
\usetheme{Madrid}
\usecolortheme{default}

% フレームタイトルのフォントサイズ
\setbeamerfont{frametitle}{size=\Large}
\setbeamerfont{framesubtitle}{size=\large}

% ナビゲーション記号を非表示（オプション）
\setbeamertemplate{navigation symbols}{}
```

### 3. YAMLフロントマターの設定（推奨）

Markdownファイルの先頭に以下を追加：

```yaml
---
title: プレゼンテーションタイトル
author: 発表者名
date: 2025年1月31日
institute: 所属機関
---
```

---

## スライドの書き方

### 基本構造

Beamerでは、見出しレベル1（`#`）がフレーム（スライド）のタイトルになります。

```markdown
# スライドタイトル

スライドの内容をここに書きます。

- 箇条書き1
- 箇条書き2
- 箇条書き3

# 次のスライド

2枚目の内容です。
```

### 段階的表示（アニメーション）

段階的に表示するには、Pandocの`.incremental`クラスを使用：

```markdown
# 段階的表示の例

::: incremental

- 最初に表示される
- 次に表示される
- 最後に表示される

:::
```

または、Beamerの`
`コマンドを使用：

```markdown
# LaTeXコマンドによる段階的表示

- 常に表示される
\pause
- 2番目に表示される
\pause
- 3番目に表示される
```

### 2段組みレイアウト

```markdown
# 2段組みの例

:::: {.columns}

::: {.column width="50%"}
左側の内容
- 項目1
- 項目2
:::

::: {.column width="50%"}
右側の内容
- 項目A
- 項目B
:::

::::
```

### 画像の挿入

```markdown
# 画像の例

![画像の説明](image.png){width=80%}
```

### 表の挿入

```markdown
# 表の例

| 項目 | 値1 | 値2 |
|-----|-----|-----|
| A   | 10  | 20  |
| B   | 30  | 40  |

Table: サンプル表
```

### ブロック（強調枠）

```markdown
# ブロックの例

::: {.block title="重要ポイント"}
ここに重要な内容を記述します。
:::

::: {.alertblock title="警告"}
注意が必要な内容を記述します。
:::

::: {.exampleblock title="例題"}
具体例を記述します。
:::
```

---

## よく使うコマンド

### ページ制御

| コマンド | 効果 |
|---------|------|
| `\newpage` | 新しいスライドを開始 |
| `\framebreak` | フレーム内で改ページ |
| `\pause` | 段階的表示の区切り |

### LaTeXコマンドパレットで使えるコマンド

設定で以下を追加することを推奨：

```yaml
- cmd: "\\newpage"
  desc: "新しいスライド"
  
- cmd: "\\pause"
  desc: "段階的表示の区切り"
  
- cmd: "\\vspace{0.5cm}"
  desc: "垂直スペース（調整用）"
  cursorOffset: -6
```

---

## テーマのカスタマイズ

### 組み込みテーマ

プリアンブルで`\usetheme{}`を変更：

- `Madrid` - 青ベースの標準的なテーマ
- `Copenhagen` - ヘッダーにセクション表示
- `Berlin` - ナビゲーションバー付き
- `Boadilla` - シンプルでミニマル
- `metropolis` - モダンなデザイン（別途インストール必要）

### カラーテーマ

`\usecolortheme{}`で変更：

- `default` - デフォルト
- `albatross` - 黒背景
- `beaver` - 赤系統
- `crane` - 黄色系統
- `dolphin` - 青系統

### フォントサイズの調整

```latex
% スライドタイトル
\setbeamerfont{frametitle}{size=\LARGE}

% 本文
\setbeamerfont{normal text}{size=\normalsize}

% 箇条書き
\setbeamerfont{item}{size=\normalsize}
```

---

## トラブルシューティング

### エラー: "Undefined control sequence"

**原因**: Beamerと互換性のないパッケージを使用

**対処**:
1. プリアンブルを最小化してテスト
2. 以下のパッケージを削除または回避：
   - `titling`（タイトルページの再定義と競合）
   - `geometry`（Beamerは独自に管理）
   - `setspace`（行間調整と競合）

### 日本語が文字化けする

**原因**: 日本語フォントが設定されていない

**対処**:
```latex
\usepackage{luatexja}
\usepackage[noto-otf]{luatexja-preset}
\setmainfont{Noto Sans CJK JP}
\setsansfont{Noto Sans CJK JP}
```

### ページ番号が表示される

**原因**: Beamerのデフォルト設定

**対処**:
```latex
\setbeamertemplate{footline}[frame number] % フレーム番号を表示
% または
\setbeamertemplate{footline}{} % フッターを非表示
```

### pandoc-crossrefとの競合

**原因**: Beamerとpandoc-crossrefは互換性が低い

**対処**:
- 設定で「Pandoc Crossrefを使う」を**無効**にする
- 手動でラベル付けを行う：
  ```markdown
  Figure 1: 画像の説明
  ```

### コンパイルが遅い

**原因**: 画像の埋め込み、複雑な構造

**対処**:
1. `--draft`フラグを使用（ドラフトモード）
2. 画像サイズを縮小
3. 複雑な図表を簡略化

---

## サンプル

### 最小構成のサンプル

```markdown
---
title: サンプルプレゼンテーション
author: 発表者
date: 2025年1月31日
---

# はじめに

このプレゼンテーションについて説明します。

## 目的

- 目的1の説明
- 目的2の説明

# 内容

::: incremental

- 段階的に表示される項目1
- 段階的に表示される項目2
- 段階的に表示される項目3

:::

# まとめ

まとめの内容です。

\newpage

# ご清聴ありがとうございました

質問をお待ちしています。
```

### より詳細なサンプル

プラグインに同梱の[sample-beamer.md](../sample-beamer.md)を参照してください。

---

## 参考リンク

- [Beamer公式ドキュメント](https://ctan.org/pkg/beamer)
- [Pandoc Beamerガイド](https://pandoc.org/MANUAL.html#beamer-slides)
- [TeX Wiki - Beamer](https://texwiki.texjp.org/?Beamer)

---

## 関連ドキュメント

- [クイックスタート](./quickstart.md)
- [設定リファレンス](./configuration.md)
- [プロファイル管理](./profiles.md)
- [トラブルシューティング](./troubleshooting.md)
