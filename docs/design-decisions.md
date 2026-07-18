---
title: 設計決定
category: 開発者ドキュメント
audience: 開発者, メンテナー
last_updated: 2026-07-14
tags: [ADR, 設計, アーキテクチャ]
related: [../ARCHITECTURE.md, docs/development.md]
---

# 設計決定

[ドキュメントインデックス](./index.md) > 設計決定

## 概要

このドキュメントでは、MdTeX プラグインの開発中に行われた重要なアーキテクチャと設計決定を記録する。Architecture Decision Record (ADR) 形式に従う。各決定には以下が含まれる:

- **コンテキスト**: 問題や状況
- **決定**: 何が決定されたか
- **結果**: 決定の影響
- **ステータス**: 採用、非推奨、または置換

---

## 設計原則

### 1. 関心の分離

**理由**: メンテナンス性とテスト可能性

各コンポーネントは明確で単一の責務を持つべきである。ビジネスロジックは UI から分離され、外部依存関係は分離される。

### 2. 依存性注入

**理由**: テスト可能性と柔軟性

サービスは内部で作成するのではなく、パラメータとして依存関係を受け入れる。

### 3. 可能な限り純粋関数

**理由**: 予測可能性とテスト可能性

`buildPandocCommand` のような関数には副作用がなく、同じ入力に対して常に同じ出力を生成する。

### 4. 優雅な失敗

**理由**: ユーザー体験

エラーが発生した場合、プラグインはクラッシュするのではなく、有用なメッセージを提供し、安全なデフォルトにフォールバックするべきである。

---

## 主要な決定

### ADR-001: 外部ツール（Pandoc/LuaLaTeX）の使用

**ステータス**: 採用

**コンテキスト**:
- LaTeX 品質の出力で Markdown を PDF に変換する必要がある
- 選択肢: ネイティブ JavaScript レンダリング、外部ツール、またはクラウドサービス

**決定**:
Pandoc と LuaLaTeX を外部ツールとして使用して変換を行う。

**理由**:
- Pandoc は Markdown 変換の業界標準
- LuaLaTeX は最高の日本語テキストレンダリングを提供
- ユーザーは既存の LaTeX 知識を活用できる
- 関心の分離 - プラグインはオーケストレーション、ツールは変換を処理

**結果**:

**ポジティブ**:
- 完全な LaTeX サポートを含む高品質な出力
- 既存の LaTeX エコシステムを活用

**ネガティブ**:
- ユーザーは外部ツールをインストールする必要がある

---

### ADR-002: TypeScript での実装

**ステータス**: 採用

**決定**:
TypeScript を使用してプラグインを実装する。

**理由**:
- 型安全性の向上
- IDE サポートの強化
- リファクタリングが容易
- 早期のエラー検出

---

### ADR-003: esbuild の使用

**ステータス**: 採用

**決定**:
esbuild をバンドラとして使用する。

**理由**:
- 高速なビルド
- 簡潔な設定
- 最小限の設定

---

### ADR-004: Vitest の使用

**ステータス**: 採用

**決定**:
Vitest をテストフレームワークとして使用する。

**理由**:
- Jest 互換の API
- 高速なテスト実行
- TypeScript サポート

---

### ADR-005: 変換パイプラインを Pandoc Lua フィルタ基盤 + 最小 TS 前処理に再構成

**ステータス**: 採用

Obsidian 記法（コメント、WikiLink、埋め込み、トランスクルージョン）の処理を、TS の正規表現、自前ステートマシンから、Pandoc が認識できる標準 Markdown へ正規化する最小の TS 前処理と、AST を変換する Lua フィルタの協調構成へ移行する。責務分担は「Obsidian vault API（ファイル解決、読み込み、DOM 描画）が必要なら TS、純粋な構造変換なら Lua」。TS で JSON AST を直接操作せず（Pandoc 2 回起動を避け）、Pandoc 公式推奨の Lua フィルタ経路を採る。

**考慮した代替案**:
- 方式 A（Lua フィルタのみ）: Pandoc が認識できない `%% %%` 記法で reader 前に壊れるため不可。
- 方式 B（TS で JSON AST を直接操作）: Pandoc を 2 回起動し、スキーマ追従リスク、往復シリアライズのオーバーヘッドを自ら抱え込む。Pandoc 公式（John MacFarlane）が JSON フィルタの欠点として挙げる点と一致し、自由度の利得が確実性向上に結びつかない。

**結果**:
TS の文字列処理が薄く、純粋、テスト可能になり、フェンス保護等の脆い正規表現工作を消せる。構文解析の正確性を Pandoc に委ねられる。代償として Lua フィルタのテストには実 Pandoc が必要（integration test で対応）。

---

### ADR-006: Obsidian コメント（`%% %%`）の除去は TS 前処理で維持する

**ステータス**: 採用

ADR-005 の Lua 基盤化でも、`%% %%` コメントの除去だけは TS 前処理に残す。Pandoc が構文認識できない記法で、reader 通過後の AST からブロックコメント境界を復元するのは困難（`%%` が複数ノードに分散するため）。HTML コメント（`<!-- -->`）へ変換して Pandoc に任せる案も、変換時に同じフェンス/数式保護ステートマシンが要り、複雑性が移動するだけで減らない。「TS は Pandoc が認識できない記法を扱う」という ADR-005 の責務分担ルールに合致。

**結果**:
`%% %%` 除去の TS ステートマシンは残るが、characterization test で振る舞いを錨付けし、他の前処理ステップから責務を分離して単純化する。

---

### ADR-007: 文書テンプレート方式を 2 値（`builtin` / `defaults`）で公開する

**ステータス**: 採用

**コンテキスト**:
ADR-005 のパイプラインでは、MdTeX は Pandoc の**組み込みデフォルトテンプレート**（`default.latex`）を無改造で使い、`documentclass` / `fontsize` / `geometry` / `classoption` を `-V` 変数スロットに、ユーザープリアンブルを `--include-in-header` に注入するだけだった。`--template`（独自テンプレート）や `--defaults`（defaults file）といった Pandoc の高度なカスタマイズ経路は UI から隠され、`pandocExtraArgs`（「Pandoc 追加引数」）という隠しハッチ経由でしかアクセスできなかった。結果として、学会公式テンプレート（IEEEtran / acmart 等）のタイトル、著者ブロック構造、縦書き（`ltjtarticle`）、段組、複数ファイルの `\input` 構成といった「文書の枠」を完全に制御したい上級ユーザーの要求を、GUI で満たせなかった。

**決定**:
プロファイルに**文書テンプレート方式**（`documentTemplateMode`）を 2 値で導入する。

- **`builtin`（既定、現状維持）**: MdTeX が GUI 設定値から `-V documentclass` 等を生成し、デフォルトテンプレに注入する。初心者体験は一切変わらない。
- **`defaults`（上級者向け）**: ユーザーが用意した **defaults file**（Pandoc の `-d` / `--defaults` で読む YAML）に文書の「枠」の構築を委譲する。MdTeX は `-d <path>` を渡し、`documentclass` / `fontsize` / `geometry` / `classoption` 系の `-V` 生成をスキップする（Pandoc の precedence でコマンドライン `-V` が defaults file を上書きしてしまう衝突を避けるため）。

MdTeX 固有レイヤ（Obsidian 記法の TS 前処理、callout/mermaid/docx の Lua フィルタ、`--pdf-engine`、`--resource-path`）は、**方式に関わらず継続**する。つまり `defaults` 方式は「Obsidian 統合 × Pandoc 全機能」のブリッジであり、文書の「枠」だけを defaults file に渡す。3 つのユースケース（縦書き、段組、学会テンプレート、および `standalone: false` による本文フラグメント出力）は、いずれも defaults file 内で表現可能なため、MdTeX 側にモードを増やさない。

**考慮した代替案**:
- 方式 A（3 モード動的 UI: `builtin` / `custom` / `fragment`）: MdTeX 側で 3 モードと組合せ衝突（custom + 非空プリアンブル等）のガードレールを自前実装する。組合せ爆発と保守負荷を招く。調査の結果、`custom` は defaults file の `template:`、`fragment` は defaults file の `standalone: false` で表現可能と判明したため、MdTeX 側のモードは不要と判断した。
- 方式 B（defaults file への完全外部化、 GUI 全廃）: GUI 設定と `DEFAULT_LATEX_PREAMBLE`（luatexja、Noto フォント、listings 等）による「日本語環境で GUI ポチポチで即動く」初心者価値を失う。既存ユーザー全員への破壊的影響。ADR-001「ユーザーは既存の LaTeX 知識を活用できる」は両層を想定するため、片方を切り捨てる本案は不適。
- 方式 C（`pandocExtraArgs` 経由の `--template` / `--defaults` を文書化するだけ）: 既にパススルー自体は通るが、MdTeX の `-V` 系生成との precedence 衝突を解決できず、`defaults` でも `documentclass` 等が GUI 値で上書きされて効かない。実用的でない。

**結果**:

**ポジティブ**:
- 既存ユーザーへの影響ゼロ（既定 `builtin` で `data.json` 互換）。漸進的開示により、初心者と上級者を同一 UI で両立。
- 上級ユーザーは defaults file で Pandoc 全機能へ到達。学会テンプレ一式をフォルダ単位で配置、Git 管理できる（`${.}` で同フォルダ参照）。
- モードが 2 値に抑えられ、組合せガードレールが不要。Pandoc が defaults file のバリデーションを担う。

**ネガティブ**:
- `defaults` 方式時の `-V` 生成スキップは、`buildPandocCommand` に方式分岐を導入し、純粋関数のテストケースを増やす。
- defaults file に委譲した設定項目は GUI と二重管理の温床となるため、`defaults` 時は当該 GUI 項目を折りたたみ、非表示にする UI 整理がセットで必要。
- 上級ユーザーは MdTeX 固有レイヤ（Lua フィルタ等）と defaults file の相互作用を理解する必要がある。これは文書化で対応する。

---

### ADR-008: テンプレートパックは vault 内のテンプレートフォルダで管理し、ドロップダウンで選択する

**ステータス**: 採用

**コンテキスト**:
ADR-007 で `defaults` 方式（defaults file 委譲）を導入したが、GUI は `defaultsFilePath` を**絶対パスの手書きテキスト入力**で指定する仕様だった。結果として、上級ユーザーは defaults file の絶対パスを覚え、入力、保守する必要があり、複数の文書テンプレート（縦書き小説、学会論文等）を切り替えるたびにパスを貼り直す必要があった。また、defaults file が同梱補助ファイル（`.tex` / `.lua`）を `${.}` で相対参照する都合上、テンプレは「1 フォルダ = 1 テンプレ」の形で運用されることが判明していた。パス手書きはこの実態に合っていなかった。

**決定**:
テンプレート一式を**テンプレートパック**（1 フォルダ = 1 パック、`defaults.yaml` が入口）として、vault 内の**テンプレートフォルダ**（既定 `<vault>/MdTeX Templates/`）に格納する。プラグインは同フォルダを走査し、`defaults.yaml` を含むサブフォルダをテンプレートパックとして認識して GUI の**ドロップダウン**に一覧化する。ユーザーが新しい文書テンプレートを導入するには、フォルダを 1 つ置くだけ。

保存先を vault にしたのは、Obsidian コミュニティの慣行（Templates / Templater も「Template folder location」を vault 内に指定させる）と、**プラグインの更新で同梱ファイルが置き換えられる**リスクの回避のため。設定（テンプレートフォルダのパス、選択中パック）のみを `data.json` に保持し、テンプレートパックの実体は `data.json` に置かない（責務の分離）。

初回利用体験のため、サンプルテンプレートパック（縦書き二段組、情報系論文風）は main.js に埋め込み、初回起動時にテンプレートフォルダへ展開する。このとき**「存在しない場合だけ作る（上書きしない）」**を徹底し、ユーザーが編集したパックを決して消さない。

**考慮した代替案**:
- 方式 A（プラグインフォルダ `data.json` と同じディレクトリにテンプレを配置）: コミュニティプラグインの更新は shipped ファイル（`main.js` / `manifest.json` / `styles.css`）を置き換え、それ以外のファイルの保全は保証されない。ユーザーが作り込んだテンプレが更新で消える致命的リスクがあるため不適。
- 方式 B（`defaultsFilePath` 手書き絶対パスを現状維持）: ADR-007 導入時の課題（パスの覚え、入力、保守負荷、複数テンプレ切替の不便）を残したまま。今回の不満の直接の原因。
- 方式 C（テンプレのパス一覧だけを `data.json` に配列で持つ）: 設定は軽くなるが、実体が `data.json` と分離して Obsidian Sync / Git で追跡できず、ユーザーが「普通のファイル」として編集、リンク、バックアップする体験を損なう。

**結果**:

**ポジティブ**:
- 上級ユーザーの体験が「パスを覚える」から「フォルダを置いて選ぶ」へ改善。新しい文書テンプレの導入がドラッグ＆ドロップ相当になる。
- テンプレが通常の vault ファイルになるため、Obsidian 上での編集、Obsidian Sync / Git での同期、バックアップが自然に効く。
- プラグイン更新でテンプレが消えない。責務が「設定は `data.json`、コンテンツは vault」で分かれる。
- 初回からサンプルが選べる（scaffold）。後方互換として「カスタムパス指定」も残す。

**ネガティブ**:
- vault 内のファイル走査、パック認識、初回展開のサービス層が増える。設定画面のドロップダウン描画も同期的ではなくなる（非同期取得＋再描画）。
- テンプレートフォルダが空、未設定、defaults.yaml なしなどのエッジケースの UI メッセージが必要。
- 絶対パス（`defaultsFilePath`）選択との二系統を維持するため、設定の正規化ロジックが増える。

---

### ADR-009: 引用処理（natbib + bibtex ラウンドトリップ）を `defaults` 方式で厳格に開く

**ステータス**: 採用

**コンテキスト**:
ADR-007/008 で `defaults` 方式（defaults file 委譲）とテンプレートパックが整い、学会公式テンプレ（IEEEtran / acmart / ACL 等）の「文書の枠」は defaults file で表現できるようになった。しかし**参考文献付きの本格論文**（`\cite` で文献を引き、References を自動生成する）は、MdTeX 現状では実用的に扱えなかった。理由は引用処理が完全にユーザー任せ（`pandocExtraArgs` の隠し設定）で、かつ bibtex のラウンドトリップに必要な経路（latexmk のサブエンジン指定、`BIBINPUTS`、natbib モード）が MdTeX 側に存在しなかったため。

ACL 公式スタイル（`acl.sty`）を実機検証した結果、参考文献を載せるための真の障壁は1点に帰着した。学会公式クラスの多くは `\usepackage{acl}` の時点で `\RequirePackage{natbib}` と `\bibliographystyle{acl_natbib}` を**内蔵**する。一方、Pandoc の LaTeX テンプレート（Pandoc 3.7 では `common.latex` に分割）は `--natbib` 指定時に `\bibliographystyle{$if(biblio-style)$$biblio-style$$else$plainnat$endif$}` を**自動挿入**する。この結果 `.aux` に `\bibstyle` が2重に出力され、bibtex が "Illegal, another `\bibstyle` command" で non-zero exit し、latexmk が `.bbl` の取り込みを含む最終ラウンドをスキップする。References は載らず、`\cite` は未解決のまま壊れる。

検証過程で `latexmk -f`（force）でこの衝突を突破する案を試したが、**これは採用しない**。`-f` は bibtex の non-zero exit を握りつぶして最終ラウンドを回すが、その副作用で natbib の引用形式まで崩れることを実証した（正しい `Andrew and Gao (2007)` が `[2007]` の角括弧に化ける）。エラーを隠蔽する手法は厳格でなく、出力の正しさすら保証できない。

**決定**:
`defaults` 方式限定で、natbib + bibtex のラウンドトリップを通す3つの経路を最小限で開く。`builtin` 方式は対象外（ラフな文書向けで、引用処理は上級ユースケースであり、ADR-007 の責務分担「枠は defaults file」に反するため）。**bibstyle 衝突の解決は「テンプレートパックが静的に解決する」のではなく、MdTeX が `.aux` を見て反応型に解決する。** これにより、ユーザーは自分の使うクラス（ACL / acmart / IEEEtran 等）が bibliographystyle を内蔵するか知らなくても動く。

1. **`latexmk` を正規 PDF エンジンとして扱い、サブエンジン指定を通す。** Pandoc の `--pdf-engine-opt`（複数可）の受け口を `buildPandocCommand` に導入し、`latexEngine: "latexmk"` のとき `-lualatex` 等のサブエンジンと latexmk 固有オプションを渡せるようにする。bibtex/biber のラウンドトリップは latexmk に一任する。

2. **citation モード（`--natbib` / `--citeproc` / なし）をプロファイル項目で公開する。** `--natbib` は defaults file では指定不可（実証: `Unknown option "natbib"`）のためコマンドライン必須であり、`pandocExtraArgs` の隠し設定ではなく明示的なプロファイル設定にする。

3. **bibstyle 衝突は反応型（`.aux` フィードバック）で解決する。** citation モード有効時の PDF 生成は2フェーズ化し、MdTeX が LaTeX の実行を監理する（Pandoc に `--pdf-engine` で PDF まで一任しない）。シーケンス:
   1. Pandoc で standalone `.tex` を生成（`\bibliographystyle{plainnat}` を含む）。
   2. latex 1パス（draftmode）を走らせ `.aux` を得る。
   3. `.aux` の `\bibstyle{...}` を読む。plainnat **以外**の bibstyle が1つでもあれば（=クラス/パッケージが内蔵）、`.tex` から `\bibliographystyle{plainnat}` 行を除去する。そうでなければそのまま維持する。
   4. latexmk で `.tex` → PDF を生成。

   **なぜ反応型か**: 実証（ACL/acmart/IEEEtran の3クラス）で、bibstyle を内蔵するクラス（ACL は `acl_natbib` を即時実行）と内蔵しないクラス（IEEEtran/acmart）があることが判明した。「plainnat を常に除去」は IEEEtran/acmart で bibstyle が消失して参考文献が壊滅し、「常に維持」は ACL で `.aux` に2重出力され bibtex が死ぬ。**単一の静的ルールで全クラスに効く変換は存在しない。** `.aux` の実態を見て分岐する反応型のみが、クラスを知らなくても全クラスで動く（3クラス全てで参考文献描画まで実証済み）。藤原惟氏『Pandocテンプレート』が最も強く推奨した「Phase1: Pandoc MD→LaTeX、Phase2: LaTeX→PDF を Makefile で分離」と同じワークフローを MdTeX 内に組み込む。

4. **defaults 方式で選択中テンプレートパックのフォルダを `TEXINPUTS` / `BIBINPUTS` / `BSTINPUTS` に注入する。** `.sty` / `.bst` / `.bib` を LaTeX に発見させる。`executePandocCommand` の `env`（既存の `process.env` マージ箇所）で、パス区切りで連結して既存値に追記する。

**考慮した代替案**:
- 方式 A（`latexmk -f` で衝突を突破）: bibtex の non-zero exit を握りつぶして最終ラウンドを回す。実装は最小だが、**エラー隠蔽により natbib の引用形式が壊れることを実証した**（正しい `Andrew and Gao (2007)` が `[2007]` の角括弧に化ける）。「厳格な構築」の方針にも反する。
- 方式 B（テンプレートパックが Pandoc テンプレートを同條して静的に bibliographystyle 行を削除）: これは **ACL には効くが IEEEtran/acmart を壊す**（bibstyle が消失）ことが実証で判明した。加えて Pandoc バージョン（3.7 で `common.latex` 分割等）に追従するコストをパック作成者に押し付ける。ユーザーが「クラスを知らなくても動く」要件を満たさない。
- 方式 C（MdTeX 側で生成 `.tex` の `\bibliographystyle` 重複を常に除去）: 方式 B と同様、IEEEtran/acmart で bibstyle 消失を招く。静的ルールは不可（上記）。
- 方式 D（`.sty` を走査してクラス内蔵 bibstyle を推定）: `\def\bibliographystyle`（acmart のような再定義）と実際の呼び出しを区別できず脆い。`.aux` の実態が真実。
- 方式 E（citeproc に一本化し natbib を使わない）: 学会公式クラスが natbib 前提（`\RequirePackage{natbib}`）のため、citeproc では References の体裁が学会要件を満たさない。

**結果**:

**ポジティブ**:
- ACL / acmart / IEEEtran 等、bibstyle を内蔵するクラスとしないクラスの**両方**で、参考文献付き本格論文が MdTeX で完結する。ネイティブ LaTeX（手書き）と同等の引用形式（`\citet` → "Author (Year)"、References セクション）を出力することを3クラス全てで実証済み。
- 衝突解決が反応型（`.aux` フィードバック）のため、ユーザーは自分の使うクラスが bibliographystyle を内蔵するか知る必要がない。テンプレートパック作成者にも Pandoc テンプレートの編集を求めない。
- `-f` 不使用により、LaTeX/bibtex のエラーが隠蔽されず、ユーザーが原因を特定しやすい。

**ネガティブ**:
- citation モード有効時の PDF 生成が2フェーズ化（Pandoc→`.tex`→latex パス→反応型修正→latexmk）し、MdTeX が LaTeX の実行を監理する。これは Pandoc `--pdf-engine` に PDF まで一任する現状パイプラインからの逸脱で、ADR-005「純粋パイプライン」の精神と部分的に緊張する。ただし反応型修正は `\bibliographystyle{plainnat}` の固定パターン除去に限定され、Pandoc バージョン非依存である。
- `--pdf-engine-opt` の受け口と citation モード設定により、`buildPandocCommand` の引数生成と `ProfileSettings` の項目が増える。citation モードは `defaults` 方式時のみ有効化し、`builtin` では隠す UI 整理がセットで必要。
- 2フェーズ化により中間 `.tex` と `.aux` の一時ファイル管理が増え、`tempFiles.ts` の lifecycle 対象を拡張する必要がある。
- 反応型判定は「`.aux` に plainnat 以外の bibstyle があるか」に依存する。ユーザーが意図的に plainnat 互換の独自 bst を `-V biblio-style` で指定した場合、それが plainnat 以外なら plainnat 除去が働き、ユーザー指定の bst が残る（期待挙動）。エッジケースは文書化で対応する。

---

## トレードオフ

### 外部ツールの使用

| 要素 | 選択されたアプローチ | 代替案 |
|------|---------------------|--------|
| 依存関係 | Pandoc, LuaLaTeX | ネイティブ実装 |
| 出力品質 | 最高の LaTeX 品質 | JavaScript レンダリング |
| インストール | ユーザーが手動でインストール | すべてバンドル |
| フットプリント | 最小 | 大 |

---

## 将来の考慮事項

1. **ワーカースレッド**: 計算量の多い処理をオフロード
2. **キャッシュ**: トランスクルージョン結果のキャッシュ
3. **プログレスインジケーター**: 長時間操作のより良いフィードバック

---

## 関連トピック

- [アーキテクチャ](../ARCHITECTURE.md)
- [開発ガイド](./development.md)
- [APIリファレンス](./API.md)

## 次のトピック

- [デプロイガイド](./deployment.md)
