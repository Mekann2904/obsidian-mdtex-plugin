# MdTex テンプレートパック

このフォルダには、MdTex プラグインの **defaults 方式**（文書テンプレート方式 = `defaults`）で使う
**テンプレートパック** を置きます。

既存のテンプレート（縦書き小説・学会論文等）を選んで PDF に出す方法はこのファイルに、
**新しいテンプレートパックを自作する方法は [SKILL.md](./SKILL.md) に**まとめています。

> このフォルダは vault の中にあるため、Obsidian Sync / Git で同期・バックアップされ、
> **プラグインの更新でも消えません**。安心して編集・自作してください。

---

## テンプレートパックとは

テンプレートパックは、**`defaults.yaml` を含むフォルダ** です。
1 つのフォルダがそのまま 1 つの文書テンプレートになります。

```
MdTex Templates/
├── README.md                  ← このファイル（使い方）
├── SKILL.md                   ← 新しいパックの自作ガイド
├── 縦書き二段組/              ← パック例（初回展開されたサンプル）
│   ├── defaults.yaml          ← ★必須: パックの入口（Pandoc defaults file）
│   ├── tate-twocolumn.tex     ←    任意: カスタム Pandoc テンプレート
│   ├── preamble.tex           ←    任意: プリアンブル（章扉・表題ページ付き）
│   ├── aozora-ruby.lua        ←    任意: ルビ変換・章扉記法などの Lua フィルタ
│   ├── chapter-bg.lua         ←    任意: 章扉背景画像の絶対パス解決 Lua フィルタ
│   └── sample.md              ←    任意: すぐPDF出せる本文サンプル
└── あなたのテンプレート/      ← 自作パック
    └── defaults.yaml          ← 最低これだけあれば認識されます
```

- **必須ファイルは `defaults.yaml` だけ**です。これが含まれるフォルダだけが
  ドロップダウンに現れます。
- README.md / SKILL.md のようにフォルダ直下のファイルはパック扱いされません。

---

## 既存のパックを使う

1. MdTex 設定 → 対象プロファイルの「文書テンプレート方式」を **defaults file** に
2. 「defaults file の指定方法」を **テンプレートパックから選択** に
3. 「テンプレートパック」の横の **再スキャン** を押す
4. ドロップダウンから使いたいパックを選ぶ
5. Markdown 本文を開いて PDF 変換を実行

本文（`.md`）は通常の Markdown です。defaults 方式でも MdTex 固有の機能
（Obsidian 記法・callout・Mermaid・相互参照など）はそのまま使えます。

---

## 新しいパックを追加するには

1. このフォルダ（`MdTex Templates/`）の直下に、テンプレート名と同じフォルダを作る
   （フォルダ名がドロップダウンに表示される名前になります）
2. その中に `defaults.yaml` を置く（最小はこれだけで認識されます）
3. 設定で **再スキャン** を押す

詳しい作り方・検証手順・よくある落とし穴は **[SKILL.md](./SKILL.md)** を参照してください。

> 【注意】defaults 方式では MdTex の組み込みプリアンブルが入りません。
> `\passthrough` 未定義・`\lstinline` 未定義・`longtable` エラー等が起きたら、
> [SKILL.md の落とし穴表](./SKILL.md#落とし穴defaults-方式固有) を見て preamble を調整してください。

---

## 同梱サンプル

| パック | 用途 |
|---|---|
| `縦書き二段組` | 縦書き小説（ルビ・圏点・章扉・表題ページ付き）。青空文庫風ルビ記法 `｜親文字《よみ》` を `\ruby` に変換する Lua フィルタ同梱。章扉は `::: novel-chapter`、表題は `::: novel-title` 記法で出せる。装飾背景は既定で TikZ の薄墨＋淡円、`defaults.yaml` の `metadata: chapter-bg-image` で文字なし画像に切替可（chapter-bg.lua が絶対パス解決し、装飾と文字を分離する商業組版ワークフロー）。 |
| `情報系論文風` | 情報処理学会・人工知能学会風の二段組論文（LuaLaTeX 前提）。和文タイトル・概要・キーワード・表・数式・コード。 |
| `pLaTeX学会論文` | **pLaTeX 専用クラス**（情報処理学会 ipsj 等）の土台。ipsj.cls は手動配置（著作権）。partial 全除外の自前テンプレで、スペース入り画像・表・コードの pLaTeX 固有問題を解決する Lua フィルタ 3 種同梱。詳しくは [SKILL.md](./SKILL.md) の「pLaTeX 専用クラスを使う場合」。 |

サンプルパックの中身を読むのが、構造を知る一番の近道です。

> 各パックは `_mdtex.yaml` で**用途・前提ファイル・推奨設定**を自己記述します。設定画面でパックを選ぶと、その説明と不足ファイルの警告・推奨設定の適用が表示されます。書き方は [SKILL.md](./SKILL.md) の「パックメタ」を参照。

---

## 参考情報

- **新しいパックの自作**: [SKILL.md](./SKILL.md)
- Pandoc defaults file の全オプション: [Pandoc User's Guide — Defaults files](https://pandoc.org/MANUAL.html#defaults-files)
- `${.}` 変数の意味: defaults file 自身のディレクトリを指す Pandoc の特殊変数。
