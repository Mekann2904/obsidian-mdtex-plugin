---
title: 変換コンテキスト
category: 開発者ドキュメント
audience: 開発者, メンテナー
last_updated: 2026-07-14
tags: [コンテキスト, 用語, ドメイン]
related: [./ARCHITECTURE.md, ./docs/design-decisions.md]
---

# MdTeX プラグインの変換コンテキスト

Obsidian の Markdown ノートを Pandoc と LuaLaTeX で PDF/LaTeX/DOCX へ変換する。
Obsidian 固有の記法を Pandoc が処理できる標準 Markdown へ正規化する TS 前処理と、
Pandoc の AST を変換する Lua フィルタの協調で成り立つ。

## Language

### 記法

**Obsidian コメント**:
`%% ... %%` で囲まれた、出力対象外の執筆者向け注記。Pandoc はこの記法を構文認識しない。
_Avoid_: HTML コメント（`<!-- -->` とは別物; Pandoc は HTML コメントを認識するが `%% %%` は認識しない）

**WikiLink**:
`[[note]]` 記法によるノート間の内部リンク。`[[note|alias]]` で表示名（エイリアス）を指定できる。
ファイル解決に Obsidian vault API を必要とする。
_Avoid_: 内部リンク、バックリンク

**埋め込み**:
`![[...]]` 記法によるファイル内容の参照。画像（PNG/JPG 等）と Markdown の双方を指す。
_Avoid_: インクルード、インポート、トランスクルージョン（より狭い下位概念）

**トランスクルージョン**:
Markdown ファイルの埋め込み。`![[note#heading]]`（見出し単位）や `![[note^blockId]]`（ブロック単位）で
部分抽出を伴う。ファイル読み込みと再帰展開を必要とし、循環検出と深度上限の対象。
_Avoid_: 埋め込み（より広い概念; トランスクルージョンは Markdown 埋め込みに限定）

## Output structure

**文書テンプレート**:
変換出力の「枠」にあたる部分。`\documentclass` からタイトルブロック、フロントマター、本文の差込位置、`\end{document}` までを指す。Pandoc の組み込みデフォルトテンプレート、またはユーザーが用意するカスタムテンプレート / defaults file がこれを定義する。
_Avoid_: テンプレ（略称）、ヘッダ（より狭い。プリアンブルと混同されやすい）

**プリアンブル**:
`\begin{document}` の直前に挿入される LaTeX 断片。パッケージのロードやマクロ定義を担う。Pandoc の `--include-in-header` 経由で注入される。文書テンプレートの一部だが、文書テンプレート（クラス選択、タイトル構造等）とは別物。
_Avoid_: ヘッダ、ヘッダインクルード（Pandoc の `header-includes` と混同しやすい）

**文書テンプレート方式**:
MdTeX が文書テンプレート（枠）をどう構築するかの方針。`builtin`（GUI 設定値から `-V` を生成してデフォルトテンプレに注入）と `defaults`（defaults file に枠の構築を委譲）の 2 値。本文（Markdown→LaTeX の変換方式）や Obsidian 記法処理とは直交する。
_Avoid_: テンプレートモード、出力モード（より広く誤解されやすい）

**defaults file**:
Pandoc の `-d` / `--defaults` で読み込む YAML 設定ファイル。テンプレート、プリアンブル、フィルタ、変数、メタデータ等、Pandoc のほぼ全オプションを 1 ファイルに集約する。`${.}` で自身のディレクトリを参照でき、テンプレ一式をフォルダ単位で管理できる。MdTeX 固有の概念ではなく Pandoc 公式機能。
_Avoid_: 設定ファイル（より一般的すぎる）、プロファイル（MdTeX の設定プロファイルとは別物）

**本文フラグメント**:
standalone を OFF にして出力した、文書テンプレート（枠）を含まない本文のみの出力。別の master LaTeX 文書から `\input` / `\include` で取り込むことを想定する。`defaults` 方式の defaults file 内で `standalone: false` を指定することで得られる。
_Avoid_: 断片、フラグメント（文脈がないと意味不明）

**テンプレートパック**:
1 つの文書テンプレート（枠）を構成するファイル一式。`defaults.yaml`（入口）を必須とし、`template:` で参照する `.tex`、`include-in-header:` で参照する `preamble.tex`、`filters:` で参照する `.lua` 等の補助ファイルを同梱する。1 フォルダ = 1 テンプレートパックとして vault 内のテンプレートフォルダに配置し、ドロップダウンで選択する。
_Avoid_: テーマ（外観の変更と誤解されやすい。MdTeX のテンプレートパックは「文書の枠」のテンプレであり CSS テーマではない）、スキン

**テンプレートフォルダ**:
テンプレートパックを格納する vault 内のフォルダ。既定は `<vault>/MdTeX Templates/`。直下の各サブフォルダが 1 つのテンプレートパックを表す。Obsidian の Templates / Templater と同じ「vault 内に置く」慣行で、Obsidian Sync / Git で同期、バックアップされ、プラグイン更新でも消えない。設定（パス）のみを `data.json` に保持する。
_Avoid_: プラグインフォルダ（`data.json` が置かれる `.obsidian/plugins/<id>/` とは別物。プラグインの更新で同梱ファイルが置き換えられるため、ユーザーが作り込んだテンプレートパックはここに置くべきでない）

**citation モード**:
Markdown の引用記法（`@key` / `[@key]`）を LaTeX の `\citep` / `\citet` 等へ変換する Pandoc の出力モード。MdTeX では `none`（変換しない）/ `natbib`（`--natbib`）/ `citeproc`（`--citeproc`）の 3 値をプロファイルで扱う（ADR-009）。`natbib` は defaults file では指定不可（コマンドライン `--natbib` 必須）なため、MdTeX 側で明示的にフラグを立てる。学会公式クラス（acl.sty / acmart 等）が `\RequirePackage{natbib}` で内蔵する natbib と協調するためにはこのモードが必須。
_Avoid_: 引用スタイル（より広い。出力の見た目ではなく Pandoc の変換モードを指す）、文献モード

**bibtex ラウンドトリップ**:
LaTeX ソースから参考文献リストを生成するための、`latex` → `bibtex` → `latex` → `latex` の複数ラウンド処理。`.aux` の引用情報を bibtex が `.bbl` にまとめ、後続ラウンドで取り込む。MdTeX はこの制御を latexmk に一任し、自前ではラウンドを管理しない（ADR-009）。natbib + bibtex を前提とする学会公式クラスで References を載せるにはこのラウンドトリップが必須。
_Avoid_: 文献コンパイル（より曖昧）

**bibstyle 衝突**:
`.aux` に `\bibstyle{...}` が複数回出力され、bibtex が "Illegal, another `\bibstyle` command" で non-zero exit する障害。学会公式クラスが `\bibliographystyle{<学会指定>}` を内蔵する一方、Pandoc の LaTeX テンプレート（Pandoc 3.7 では `common.latex`）が `--natbib` 時に `\bibliographystyle{...}` を自動挿入することで発生する。MdTeX は citation モード有効時に**反応型**に解決する: citation パイプラインが draft パスで `.aux` を読み、plainnat 以外の bibstyle が1つでもあれば（=クラス/パッケージが内蔵、ACL 等）、Pandoc が自動挿入した `\bibliographystyle{plainnat}` 行を `.tex` から除去して依存状態を掃除し、latexmk に正しい `.aux` を再生成させる（ADR-009）。クラスを知らなくても ACL/acmart/IEEEtran の全てで動く。`latexmk -f` で突破すると引用形式まで壊れるため採用しない。
_Avoid_: bst 衝突（`.bst` ファイル自体の問題と混同されやすい。本項目は `.aux` の `\bibstyle` 重複の問題）

## Flagged ambiguities

**「埋め込み」 vs 「トランスクルージョン」**:
日常会話では混用されるが、このプロジェクトでは厳密に区別する。処理境界（FS 読み込み、再帰、セクション抽出の要否）に直結し、責務分担（TS 前処理 vs Lua フィルタ）の判断材料になるため。

- 埋め込み = `![[]]` 全般（画像含む）。画像はパス解決のみで済む。
- トランスクルージョン = Markdown 埋め込みのみ。読み込み、再帰、セクション抽出を伴う。

## Example dialogue

> **Dev**: この `![[diagram.png]]` はトランスクルージョンですか？
>
> **Domain expert**: いいえ、それは画像の埋め込みである。トランスクルージョンは
> Markdown ファイルの中身を取り込む場合だけを指す。画像はパス解決だけで済むが、
> トランスクルージョンはファイル読み込みと再帰展開が要るので別の処理経路になる。
>
> **Dev**: なるほど。じゃが `![[note.md]]` はトランスクルージョンで、
> `![[note.md#intro]]` は見出し抽出付きトランスクルージョン、と。
>
> **Domain expert**: その通り。どちらもトランスクルージョンである。
> 処理の重さが違うだけで、経路は同じである。
>
> **Dev**: `%% ここは非公開メモ %%` はどう扱われますか？
>
> **Domain expert**: それは Obsidian コメントなので、Pandoc に渡す前に TS 前処理で
> 除去する。Pandoc が構文認識できない唯一の記法で、reader の前に消さないと壊れる。
