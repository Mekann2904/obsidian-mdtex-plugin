---
title: MdTeX CLI
category: 開発者ドキュメント
audience: 開発者, CI 担当, LLM エージェント
last_updated: 2026-07-14
tags: [CLI, 自動化, CI, エージェント]
related: [../README.md, ./design-decisions.md, ./development.md, ../ARCHITECTURE.md]
---

# MdTeX CLI

[README](../README.md) > [ドキュメントインデックス](./index.md) > MdTeX CLI

MdTeX は Obsidian プラグイン（GUI）に加え、`mdtex` コマンドラインツールを提供する。
GUI を介さずに MdTeX を観測、実行するために作られた経路である。
対象は CI、スクリプト、LLM コーディングエージェントで、通常の執筆には GUI を使う。

GUI はエージェントから操作できない。
テンプレートパックの検証、サンプル原稿での PDF 生成、実際の変換を自動化するには、CLI が唯一の経路になる。
推論と判断は呼び出し側（人間または LLM）が担い、CLI は観測と実行に徹する。
この方針を、本プロジェクトでは**誠実な道具**（cli-for-agents 準拠）と呼ぶ。

> この文書の記述と実装が食い違う場合は、実装（`src/cli/`）が正である。

---

## 対象読者と GUI との使い分け

次のどれかに当てはまる読者向けである。

**CI パイプライン**：コミットや PR ごとに、テンプレートパックが組版可能か検証する。
**スクリプト**：複数原稿の一括変換や、変換結果を別工程へ渡す。
**LLM コーディングエージェント**：GUI なしで MdTeX を起動し、JSON で結果を受け取る。

いずれも「人間がリボンアイコンをクリックする」を前提にしない。
ドラフトモード、lint 自動修正、Mermaid 図の DOM ラスター化など、Obsidian 上でのみ意味を持つ機能は CLI の対象外である（[CLI で扱えないこと](#cli-で扱えないこと) で後述）。
執筆そのものは GUI で行い、検証と自動実行を CLI に任せる、という分担になる。

---

## インストール

リポジトリをクローンしてビルドする。
`npm run build` は GUI 用の `main.js` と CLI 用の `dist/cli.js` を同時に生成する。

```bash
git clone https://github.com/Mekann2904/obsidian-mdtex-plugin
cd obsidian-mdtex-plugin
npm install
npm run build     # main.js と dist/cli.js を生成
npm link          # mdtex コマンドを PATH に登録
mdtex --version
```

`--version` は `mdtex <version>` を出力する。
バージョン文字列はビルド時に `package.json` から埋め込まれ、埋め込みがない開発環境では `dev` になる。

---

## コマンド一覧

```text
mdtex <command> [subcommand] [options]

  pack      テンプレートパックの管理（list / validate / test / new）
  convert   Markdown を PDF/LaTeX/DOCX に変換
  doctor    環境診断（外部バイナリの発見と版）
```

3 つのコマンドと、`pack` 配下の 4 サブコマンドで構成される。
グローバルオプションは `--json`、`--help`（`-h`）、`--version`（`-V`）の 3 つである。

各コマンドとサブコマンドは、段階的な `--help` を持つ。
トップレベルで全体を、各コマンドで詳細を、サブコマンドで引数と実例を確認できる。

```bash
mdtex --help
mdtex pack --help
mdtex pack validate --help
```

---

## 全コマンド共通の振る舞い

CLI をスクリプトで扱うには、exit code、`--json`、出力先の規則を先に把握する必要がある。
これらは全コマンドで共通である。

### exit code

終了コードは 3 つの意味に収まる。

| コード | 意味 | 該当するコマンド |
|--------|------|------------------|
| `0` | 成功、または dry-run | 全コマンド |
| `1` | 警告あり（degraded） | `doctor`（必須は揃ったがオプション不足）、`pack validate`（`--strict` で警告を昇格） |
| `2` | エラー | 全コマンド（入力未指定、ファイル不在、pandoc 失敗、不明なコマンド） |

これとは別に、コマンド実装が想定外の例外を投げたときは `1` で終了する。
これは `0` / `1` / `2` の意味づけとは別系統の、最後の安全網である。

`--json` を付けても exit code は変わらない。
JSON をパースする前に exit code で成功、警告、エラーを判定できる。

### `--json` と出力の分離

`--json` を付けると、結果を構造化して stdout に出す。
付けない場合は、人間が読むテキストを stdout に出す。

機械可読な結果は stdout、人間向けの進捗や診断は stderr、という分離を保つ。
stdout をそのまま JSON パーサーへ渡せる。

ただし、**引数の検証エラーは `--json` でも JSON にならない**。
入力ファイル未指定、パック名未指定、不明なコマンド、不正な `--format` といった、コマンドの実行前に弾かれるエラーは、stderr へのプレーンテキストになる。
実行フェーズに入ってからのエラー（ファイル不在、defaults 読めない、pandoc 失敗）だけが、`--json` で構造化される。

この境界を踏まえて結果を扱うこと。
引数検証エラーを JSON で受け取る前提でスクリプトを組むと、stdout が空のまま exit 2 で落ちる挙動に遭遇する。
stderr も併せて取り、exit code が 0 でなければ stdout の JSON を前提にしない運用が安全である。

### 非対話

CLI はプロンプトで入力を求めない。
必要な情報はすべてフラグで渡す。
対話的な確認で停止すると、エージェントがデッドロックするためである。
未指定の必須引数は、即座に exit 2 で終わる。

---

## mdtex doctor

環境診断コマンドである。
変換に必要な外部バイナリが PATH 上に見つかるか、版が取れるかを調べ、環境が変換可能か判定する。
CI の前提チェックや、トラブルシュートの最初の一歩として使う。

```bash
mdtex doctor
mdtex doctor --json
```

`doctor` が調べるバイナリは 6 つである。

**必須**：`pandoc`（変換の本体）、`latexmk`（TeX ビルドドライバ）、`lualatex`（既定の TeX エンジン、和文組版）。
**オプション**：`pandoc-crossref`（crossref フィルタを使うパックのみ）、`markdownlint-cli2`（lint 有効時）、`pdftoppm`（`--format png` 時）。

exit code は、必須が揃ってオプションが不足すれば `1`（degraded）、必須が欠ければ `2`（errors）、すべて揃っていれば `0` である。

`--json` の結果は `status`、`entries`、`summary` の 3 つで構成される。

```json
{
  "status": "ok",
  "entries": [
    {
      "name": "pandoc",
      "required": true,
      "purpose": "Markdown → PDF/LaTeX/DOCX 変換の本体",
      "found": true,
      "binPath": "/opt/homebrew/bin/pandoc",
      "version": "3.7.0.2",
      "versionError": null
    }
  ],
  "summary": {
    "total": 6,
    "found": 6,
    "requiredMissing": 0,
    "optionalMissing": 0
  }
}
```

`status` は `"ok"` / `"degraded"` / `"errors"` のいずれかで、exit code と 1 対 1 で対応する。
`entries` はバイナリごとの行、`summary` は集計である。
`binPath` と `version` は環境により異なり、`versionError` は版取得に失敗したときだけ値が入る。
上記は 1 件だけ抜粋した例で、実際の `entries` は 6 件になる。

---

## mdtex pack

テンプレートパックの管理コマンドである。
パックの一覧、検証、サンプルでの PDF 生成テスト、新規パックの土台生成を行う。
テンプレートフォルダは `--folder` で指定し、既定は `MdTeX Templates` である。

テンプレートパックは「1 フォルダが 1 パック」で、入口は `defaults.yaml` である。
パックの概念と設計経緯は [設計決定](./design-decisions.md) の ADR-008、CONTEXT.md の用語定義を参照すること。

### pack list

テンプレートフォルダ直下のパックを一覧する。
`_mdtex.yaml`（パック自己記述メタ）があれば、その `title` / `description` / `engine` を併せて出す。

```bash
mdtex pack list
mdtex pack list --folder ./templates --json
```

`--json` の結果は、`ok` と `packs` の配列である。

```json
{
  "ok": true,
  "packs": [
    { "name": "縦書き二段組", "title": "縦書き二段組", "description": "...", "engine": "lualatex" }
  ]
}
```

パックが1つもなければ `packs` は空配列になり、exit code は `0` のままである。
メタがないパックは `title` / `description` / `engine` が `null` になる。

### pack validate

指定したパックが正しく構成されているか検証する。
`defaults.yaml` が読めるか、`_mdtex.yaml` のメタがあるか、`requires` に宣言した必須ファイルが揃っているかを調べる。

```bash
mdtex pack validate 縦書き二段組
mdtex pack validate pLaTeX学会論文 --strict --json
```

`--strict` を付けると、警告（メタ未宣言、`requires` 不足）をエラーに昇格する。
CI で警告すら許さない場合に使う。

exit code は、エラーがあれば `2`、`--strict` で警告が昇格すれば `1`、それ以外は `0` である。

`--json` の結果は次の形になる。

```json
{
  "pack": "縦書き二段組",
  "status": "ok",
  "defaultsReadable": true,
  "metadata": { "title": "縦書き二段組", "engine": "lualatex" },
  "hasMetadata": true,
  "missingRequires": [],
  "errors": [],
  "warnings": []
}
```

`status` は `"ok"` / `"warnings"` / `"errors"` で、exit code と 1 対 1 で対応する。
`defaults.yaml` が読めなければ `errors` に理由が入り、`status` は `"errors"` になる。

### pack test

パック内のサンプル原稿（既定は `sample.md`）で実際に PDF を生成し、パックが組版可能か確かめる。
パックを作った直後の「作って、検証して、組版まで通す」ループを完結させるためのコマンドである。

```bash
mdtex pack test 縦書き二段組
mdtex pack test 縦書き二段組 --dry-run
mdtex pack test 縦書き二段組 --keep-artifacts --json
```

主なオプションは次のとおり。

`--sample <file>`：パック内の `sample.md` 以外の原稿を指定する。
`--output <path>`：出力 PDF のパスを指定する。未指定なら一時領域に出す。
`--pandoc <path>`：Pandoc バイナリを指定する。未指定なら PATH 上の `pandoc` を使う。
`--keep-artifacts`：中間の `.tex` も保存する。テンプレートの組み上がり方を確認するときに使う。
`--dry-run`：実行せず、コマンドと正規化後本文を表示する。

`pack test` は内部で `convert` と同じ本文正規化と pandoc 実行のコアを使うため、`--vault-root` と `--image-scale` も `convert` と同様に受け付ける。
これら 2 つは `pack test --help` には未掲載だが、`![[link]]` 展開の探索範囲と画像スケールを制御する。

exit code は、PDF 生成に成功するか dry-run なら `0`、失敗すれば `2` である。

`--json` の結果は `convert` と同じ系で、`pack` と `sampleUsed` が加わる。

```json
{
  "pack": "縦書き二段組",
  "sampleUsed": "MdTeX Templates/縦書き二段組/sample.md",
  "status": "ok",
  "command": "pandoc -d .../defaults.yaml -o .../縦書き二段組.pdf < .../sample.md",
  "output": ".../縦書き二段組.pdf",
  "texArtifact": ".../縦書き二段組.tex",
  "duplicateLabels": []
}
```

`texArtifact` は `--keep-artifacts` を付けたときだけ入る。
`duplicateLabels` は本文中の crossref ラベル重複を観測情報として返す。pandoc の実行可否とは独立で、重複があっても `status` は `"ok"` になりうる。

### pack new

新しいテンプレートパックの土台を生成する。
`defaults.yaml`、`_mdtex.yaml`、`sample.md`、`preamble.tex` の 4 ファイルを作る。
生成直後の状態で `pack validate` と `pack test` が通る。

```bash
mdtex pack new 論文A
mdtex pack new beamer講習 --engine latexmk --json
```

`--engine <engine>` で LaTeX エンジンを指定する。
既定は `lualatex` で、`ltjarticle` クラスと原ノ味フォント（`luatexja-preset`）のプリアンブルを生成する。
`latexmk` を指定すると、`jsarticle` クラスのプリアンブル（pLaTeX 系、`luatexja` なし）を生成する。

既に同名パックが存在する場合は上書きしない。
ユーザーが編集したパックを誤って消さないためである。このとき exit code は `2` になる。

生成される `defaults.yaml` は `to: pdf`、`standalone: true`、`include-in-header: ${.}/preamble.tex` を含む。
`${.}` は Pandoc の記法で、defaults file 自身のディレクトリを指す。パック内の `preamble.tex` を相対参照する。

`_mdtex.yaml` はパックの自己記述メタである。Pandoc はこのファイルを読まない。
MdTeX が `pack list` の表示や `pack validate` の判定に使う。`title`、`description`、`engine`、`requires`、`recommendedProfile` を宣言する。

`--json` の結果は次の形になる。

```json
{
  "ok": true,
  "packPath": "MdTeX Templates/論文A",
  "createdFiles": ["defaults.yaml", "_mdtex.yaml", "sample.md", "preamble.tex"],
  "message": "パックを生成しました: MdTeX Templates/論文A（defaults.yaml, _mdtex.yaml, sample.md, preamble.tex）"
}
```

---

## mdtex convert

Markdown を PDF、LaTeX、DOCX に変換するコマンドである。
GUI と同じ本文正規化パイプラインを通し、Pandoc へ stdin で渡す。

```bash
mdtex convert paper.md --output paper.pdf
mdtex convert paper.md --pack 縦書き二段組 --output paper.pdf
mdtex convert paper.md --defaults ./templates/P/defaults.yaml --dry-run --json
```

主なオプションは次のとおり。

`--output <path>`：出力ファイル。未指定なら入力の basename に拡張子を付けたものになる。
`--format <format>`：`pdf` / `latex` / `docx` / `png`。既定は `pdf`。
`--defaults <path>`：Pandoc の defaults file を直接指定する。
`--pack <name>`：テンプレートフォルダ内のパック名で、`<folder>/<pack>/defaults.yaml` を使う。
`--folder <path>`：テンプレートフォルダ。`--pack` 使用時の既定は `MdTeX Templates`。
`--pandoc <path>`：Pandoc バイナリ。既定は `pandoc`。
`--vault-root <path>`：`![[link]]` 展開の探索範囲。既定は入力 md のディレクトリ。
`--image-scale <val>`：画像のスケール属性（例: `width=0.8\textwidth`）。
`--pdftoppm <path>`：`--format png` 時の PDF 変換バイナリ。既定は `pdftoppm`。
`--workdir <path>`：中間ファイル（`.aux`、`.log` 等）を隔離する作業ディレクトリ。
`--dry-run`：実行せず、コマンドと正規化後本文を表示する。
`--json`：構造化出力。

### defaults と pack の選択

文書の「枠」（`\documentclass` からタイトルブロック、本文差込位置、`\end{document}` まで）は、defaults file で構築する。
CLI は `--defaults` で直接指定するか、`--pack` でテンプレートフォルダ内のパックを名前で選ぶ。
両方指定しなければ、MdTeX 固有レイヤだけの素の変換になる。

`--defaults` と `--pack` を両方指定したときは、`--defaults` が優先される。
枠の構築はすべて defaults file 側に委ねる方針（ADR-007）で、CLI は `-d <path>` を渡すだけである。
`documentclass` や `fontsize` 系の `-V` 生成は行わない。これらは defaults file の `variables` に書く。

### 出力形式と `--format`

`pdf` は Pandoc に PDF 生成まで一任する。
`latex` と `docx` は `-t` で defaults file の `to:` を上書きし、LaTeX ソースか Word 文書を出す。
`png` は、いったん PDF を生成したあと、`pdftoppm`（poppler）で画像化する。
Pandoc は PNG writer を持たないため、PDF を経由する post-process になる。

`png` は vision 対応の LLM エージェントが組版結果を視覚的にフィードバックするために用意した。
レイアウト崩れ、フォント、日本語描画を目視で確認するときに使う。

### 作業ディレクトリの隔離と vault-root

CLI は変換の中間ファイルを入力 md のディレクトリ（多くは vault）に置かない。
LaTeX の中間ファイル（`.aux`、`.log`、`.ltjruby` 等）が vault を汚すのを防ぐためである。
既定では OS の一時領域に専用ディレクトリを作り、そこを作業ディレクトリ（cwd）にする。
`--workdir` で場所を固定できる。

画像は cwd に依存せず解決する。
本文正規化と画像リソースの解決は、どちらも `--vault-root`（既定は入力 md のディレクトリ）を基準にする。
Pandoc には `--resource-path` でこの基準を渡し、cwd を隔離しても画像が見つかるようにする。

### dry-run で正規化結果を観測する

`--dry-run` は pandoc を実行せず、実行するはずのコマンドと、正規化後の本文を出す。
トランスクルージョン（`![[note]]` の展開）や WikiLink の置換が、Pandoc に渡る前にどう解決されたかを確かめるのに使う。

コマンド文字列は `< input` 形式で、そのままコピーして実行できる。

```json
{
  "status": "dry-run",
  "command": "pandoc --resource-path /path/to/vault -o /path/to/paper.pdf < /path/to/paper.md",
  "output": "/path/to/paper.pdf",
  "input": "/path/to/paper.md",
  "duplicateLabels": [],
  "normalizedContent": "...正規化後の本文..."
}
```

`normalizedContent` は dry-run のときだけ入る。
pandoc に渡る直前の本文そのものである。

### JSON の結果

成功時は `status` が `"ok"` で、`output` に出力ファイルの絶対パスが入る。

```json
{
  "status": "ok",
  "command": "pandoc -d .../defaults.yaml -o .../paper.pdf < .../paper.md",
  "output": ".../paper.pdf",
  "input": ".../paper.md",
  "defaultsUsed": ".../defaults.yaml",
  "duplicateLabels": []
}
```

失敗時は `status` が `"error"` になり、`error` に理由、`stderrTail` に Pandoc の stderr 末尾が入る。
exit code は `2` である。

```json
{
  "status": "error",
  "command": "...",
  "output": "",
  "input": ".../paper.md",
  "error": "pandoc が終了コード 43 で失敗しました",
  "stderrTail": "...pandoc の stderr 末尾..."
}
```

`png` のときは、`output` が最初のページの画像パス、`images` に全ページのパスがページ順に入る。

---

## エージェントと CI のワークフロー

CLI を組み合わせると、テンプレートパックの作成から変換までを自動化できる。
典型的なループは、診断、検証、テスト、変換の 4 段階である。

```bash
# 1. 環境が揃っているか（必須バイナリの発見と版）
mdtex doctor --json

# 2. パックが正しく構成されているか
mdtex pack validate 縦書き二段組 --strict --json

# 3. サンプル原稿で組版まで通るか
mdtex pack test 縦書き二段組 --json

# 4. 実際の原稿を変換する
mdtex convert paper.md --pack 縦書き二段組 --output paper.pdf --json
```

各ステップで exit code を先に見て、`0` でなければ stdout の JSON をパースしない運用が安全である。
CI では `doctor` と `pack validate --strict` を必須チェックに、`pack test` を重いが価値のあるチェックに分けて段階的に組める。

変換に失敗したときは、`--format latex --output out.tex` で LaTeX ソースを取り出し、エラー行番号（`l.NN`）を精査する。
CLI のエラー出力も同じ調査手順を提示する。失敗時の stderr に続き、次のアクションとしてこのコマンドを案内する。

```bash
mdtex convert paper.md --pack 縦書き二段組 --format latex --output out.tex
```

`--format png` で画像を出せば、vision 対応のエージェントがレイアウト崩れを視覚的に指摘できる。
`.tex` による構文調査と、`.png` による見た目の調査を使い分ける。

---

## CLI で扱えないこと

CLI の本文正規化は、GUI と同じ `normalizeMarkdown` パイプラインを呼ぶ。
ただし CLI はドラフトモード、lint 自動修正、Mermaid 図の DOM ラスター化の依存を渡さない。
結果として、これら 3 つのステップは CLI ではスキップされる。
GUI と同じ「コメント除去、トランスクルージョン展開、WikiLink 除去と置換、重複ラベル検出」の順序は共有するが、ドラフト、lint、mermaid は CLI では働かない。

また、参考文献付きの学会論文（ACL、acmart、IEEEtran 等）で使う citation パイプラインは、GUI にだけある。
このパイプラインは、`.aux` を見て bibstyle 衝突を反応型に解決する 2 フェーズ構成（ADR-009）である。
`mdtex convert` は Pandoc を 1 回だけ起動する単発実行で、この反応型解決を持たない。
学会公式クラスで References を載せる用途では、GUI を使うか、CLI の外で bibtex ラウンドトリップを自前で制御する必要がある。

---

## 関連トピック

- [README（CLI 節）](../README.md#mdtex-cli)
- [設計決定](./design-decisions.md)（ADR-007 文書テンプレート方式、ADR-008 テンプレートパック、ADR-009 citation パイプライン）
- [アーキテクチャ](../ARCHITECTURE.md)（本文正規化パイプライン、`normalizeMarkdown`）
- [開発ガイド](./development.md)

## 次のトピック

- [設計決定](./design-decisions.md)
