// File: src/cli/help.ts
// Purpose: mdtex CLI の help text を command dispatch から分離する。
// Reason: サブコマンド追加で index.ts が巨大化しないようにするため。

// esbuild の define で package.json の version を注入（未定義時は dev）。
declare const CLI_VERSION: string | undefined;
export const VERSION: string = typeof CLI_VERSION !== "undefined" ? CLI_VERSION : "dev";

export function topHelp(): string {
  return `mdtex ${VERSION} — Obsidian Markdown を Pandoc/LuaLaTeX で組版する CLI
（LLM コーディングエージェント向けの誠実な道具）

Usage: mdtex <command> [subcommand] [options]

Commands:
  pack      テンプレートパックの管理（list / validate / test）
  convert   Markdown を PDF/LaTeX/DOCX に変換
  doctor    環境診断（外部バイナリの発見と版）

Global options:
  --json        構造化出力（エージェント向け）
  --help, -h    ヘルプ
  --version, -V バージョン

Examples:
  mdtex doctor
  mdtex pack list
  mdtex pack validate 縦書き二段組
  mdtex convert paper.md --pack 縦書き二段組 --output paper.pdf
  mdtex convert paper.md --defaults ./templates/defaults.yaml --dry-run --json

詳細は各コマンドの --help を参照（例: mdtex pack --help）。
`;
}

export function doctorHelp(): string {
  return `mdtex doctor — 環境診断

Usage: mdtex doctor [--json]

外部バイナリ（pandoc / latexmk / lualatex / pandoc-crossref / markdownlint-cli2）の
発見と版を調べ、環境が変換可能か診断する。CI 前提チェック・トラブルシュートの最初の一歩。

Options:
  --json   構造化出力（status / entries / summary）

Exit codes:
  0  全バイナリ発見（変換可能）
  1  必須は揃ったがオプションが不足（degraded）
  2  必須バイナリが不足（PDF 変換不可）

Examples:
  mdtex doctor
  mdtex doctor --json
`;
}

export function convertHelp(): string {
  return `mdtex convert — Markdown を PDF/LaTeX/DOCX に変換

Usage: mdtex convert <input.md> [options]

Options:
  --output <path>     出力ファイル（未指定時: input basename + format 拡張子）
  --format <format>   pdf / latex / docx / png（既定: pdf。png は PDF 後に pdftoppm で画像化）
  --defaults <path>   Pandoc defaults file
  --folder <path>     テンプレートフォルダ（--pack 使用時、既定: MdTex Templates）
  --pack <name>       テンプレートパック名（<folder>/<pack>/defaults.yaml を使用）
  --pandoc <path>     Pandoc バイナリ（既定: pandoc）
  --vault-root <path> ![[link]] 展開の探索範囲（既定: 入力 md のディレクトリ）
  --image-scale <val> 画像のスケール属性（例: width=0.8\\textwidth。既定: 省略）
  --pdftoppm <path>   PDF→PNG 変換バイナリ（--format png 時。既定: pdftoppm）
  --dry-run           コマンドと正規化後本文を表示（実行しない）
  --workdir <path>    中間ファイル（.aux/.log 等）隔離 dir（既定: OS temp の専用 dir）
  --json              構造化出力

Exit codes:
  0  変換成功 / dry-run
  2  エラー（入力/defaults 無し、pandoc 失敗）

Examples:
  mdtex convert paper.md --output paper.pdf
  mdtex convert paper.md --pack 縦書き二段組 --output paper.pdf
  mdtex convert paper.md --defaults ./templates/P/defaults.yaml --dry-run --json
  mdtex convert paper.md --pack 縦書き二段組 --format latex --workdir ./tmp --output out.tex
`;
}

export function packHelp(): string {
  return `mdtex pack — テンプレートパックの管理

Usage: mdtex pack <subcommand> [options]

Subcommands:
  list       パック一覧（_mdtex の title/description 付き）
  validate   パックの検証（defaults 構文 + メタ + requires チェック）
  test       サンプル原稿で PDF 生成テスト
  new        新パックの土台を生成（defaults / _mdtex / sample / preamble）

Options:
  --folder <path>  テンプレートフォルダ（既定: MdTex Templates）

Examples:
  mdtex pack list
  mdtex pack list --folder ./templates --json
  mdtex pack validate 縦書き二段組
  mdtex pack validate pLaTeX学会論文 --strict
`;
}

export function listHelp(): string {
  return `mdtex pack list — パック一覧

Usage: mdtex pack list [--folder <path>] [--json]

Options:
  --folder <path>  テンプレートフォルダ（既定: MdTex Templates）
  --json           構造化出力（name/title/description/engine の配列）

Examples:
  mdtex pack list
  mdtex pack list --json
`;
}

export function validateHelp(): string {
  return `mdtex pack validate — パックの検証

Usage: mdtex pack validate <pack> [--folder <path>] [--strict] [--json]

引数:
  <pack>           パック名（テンプレートフォルダ直下のサブフォルダ名）

Options:
  --folder <path>  テンプレートフォルダ（既定: MdTex Templates）
  --strict         警告（メタ未宣言・requires 不足）をエラー扱い
  --json           構造化出力

Exit codes:
  0  検証成功
  1  警告あり（--strict 未使用時）
  2  エラー（defaults 読めない、--strict で警告が昇格）

Examples:
  mdtex pack validate 縦書き二段組
  mdtex pack validate pLaTeX学会論文 --strict
  mdtex pack validate pLaTeX学会論文 --json
`;
}

export function testHelp(): string {
  return `mdtex pack test — サンプル原稿で PDF 生成テスト

Usage: mdtex pack test <pack> [--folder <path>] [--sample <file>] [--output <path>] [--pandoc <path>] [--dry-run] [--keep-artifacts] [--json]

引数:
  <pack>              パック名

Options:
  --folder <path>     テンプレートフォルダ（既定: MdTex Templates）
  --sample <file>     サンプル原稿（指定無ければパック内 sample.md）
  --output <path>     出力 PDF（指定無ければ temp）
  --pandoc <path>     Pandoc バイナリ（指定無ければ PATH の pandoc）
  --dry-run           コマンドを表示するのみ（実行しない）
  --keep-artifacts    中間 .tex も保存
  --json              構造化出力

Exit codes:
  0  PDF 生成成功 / dry-run
  2  エラー（defaults/sample 無し、pandoc 失敗）

Examples:
  mdtex pack test 縦書き二段組
  mdtex pack test 縦書き二段組 --dry-run
  mdtex pack test 縦書き二段組 --keep-artifacts --json
`;
}

export function newHelp(): string {
  return `mdtex pack new — 新パックの土台を生成

Usage: mdtex pack new <name> [--folder <path>] [--engine <engine>] [--json]

引数:
  <name>            パック名（テンプレートフォルダ直下に作成するサブフォルダ名）

Options:
  --folder <path>   テンプレートフォルダ（既定: MdTex Templates）
  --engine <engine> LaTeX エンジン（既定: lualatex。latexmk 等）
  --json            構造化出力

生成ファイル:
  defaults.yaml     Pandoc defaults（to: pdf / pdf-engine / standalone）
  _mdtex.yaml       パックメタ（title/description/engine）
  sample.md         サンプル原稿（pack test で即 PDF 生成できる）
  preamble.tex      プリアンブル（空・編集して使う）

既に同名パックが存在する場合は上書きしません。

Exit codes:
  0  生成成功
  2  エラー（パック名未指定・既存パック・書き込み失敗）

Examples:
  mdtex pack new 論文A
  mdtex pack new beamer講習 --engine latexmk
  mdtex pack new 論文A --json
`;
}
