---
# Pandocのコマンドライン実行でBeamerの脚注エラーを検証するためのテストファイル
# ファイル名: beamer-test.md

# Documentclassをbeamerに指定
documentclass: beamer

# lualatexをPDFエンジンとして使用する設定
pdf-engine: lualatex

# header-includesに、日本語設定と問題のsavenotes設定を含める
# これでエラーが出るかどうかで、環境の問題かプラグインの問題かを切り分けます
header-includes:
  # 日本語フォント設定（lualatex用）
  - \usepackage{luatexja}
  - \usepackage[noto-otf]{luatexja-preset}

---

# テスト用スライド

このスライドには脚注が含まれています。\footnote{これがテスト用の脚注です。}

もしこのファイルでPDFが生成できれば、PandocとLaTeXの環境は正常です。

もし `! Undefined control sequence. ... \makesavenoteenv` エラーが発生する場合、PandocがLaTeXに情報を渡すプロセス、あるいはLaTeX環境（パッケージの有無やバージョンなど）に問題があると考えられます。
