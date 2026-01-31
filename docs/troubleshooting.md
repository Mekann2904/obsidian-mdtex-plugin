# トラブルシューティング

MdTexプラグインの使用中に発生する可能性のある問題と解決方法をまとめます。

---

## 目次

- [一般的な問題](#一般的な問題)
- [PDF変換の問題](#pdf変換の問題)
- [日本語処理の問題](#日本語処理の問題)
- [インストールと依存関係](#インストールと依存関係)
- [設定の問題](#設定の問題)
- [Beamerの問題](#beamerの問題)
- [DOCX変換の問題](#docx変換の問題)
- [パフォーマンスの問題](#パフォーマンスの問題)
- [ログとデバッグ](#ログとデバッグ)

---

## 一般的な問題

### PDFが生成されない

#### 症状
リボンアイコンやコマンドを実行してもPDFが生成されない、またはエラーが表示される。

#### 確認事項と対処

1. **依存関係の確認**
   ```bash
   pandoc --version
   lualatex --version
   ```
   両方ともバージョンが表示されない場合はインストールが必要。

2. **パスの確認**
   - 設定画面でPandocのパスとLaTeXエンジンのパスを確認
   - 絶対パスを使用することを推奨（例: `/opt/homebrew/bin/pandoc`）

3. **出力ディレクトリの確認**
   - 設定した出力ディレクトリが存在するか確認
   - 書き込み権限があるか確認

4. **ファイル名の確認**
   - 特殊文字（`#`, `%`, `&`など）を含むファイル名は問題を起こす場合あり
   - スペースは自動的にアンダースコアに変換されます

### 「アクティブなファイルがありません」エラー

#### 原因
変換コマンドを実行したときに、フォーカスがMarkdownファイルに当たっていない。

#### 対処
変換したいMarkdownファイルをクリックしてフォーカスを当ててから実行。

### 「アクティブなファイルはMarkdownではありません」エラー

#### 原因
Markdownファイル（`.md`）以外のファイルで変換コマンドを実行した。

#### 対処
PDFに変換したいMarkdownファイルをアクティブにしてから実行。

---

## PDF変換の問題

### コンパイルエラー

#### 症状
PDF生成中にLaTeXエラーが発生する。

#### よくある原因と対処

1. **パッケージが見つからない**
   ```
   ! LaTeX Error: File `package-name.sty' not found.
   ```
   **対処**: TeX Live Managerでパッケージをインストール
   ```bash
   tlmgr install package-name
   ```

2. **プリアンブルの構文エラー**
   **対処**: 
   - LaTeXプリアンブルの構文を確認
   - 「デフォルトにリセット」ボタンで元に戻す
   - 段階的に変更して問題の箇所を特定

3. **画像ファイルが見つからない**
   ```
   ! Package luatex.def Error: File `image.png' not found.
   ```
   **対処**:
   - 画像パスが正しいか確認
   - 「リソース検索ディレクトリ」が正しく設定されているか確認
   - WikiLink（`[[image.png]]`）を使用している場合、ファイルが存在するか確認

### 空白ページが生成される

#### 原因
ドキュメントクラスやgeometry設定の問題。

#### 対処
1. ドキュメントクラスを確認（`ltjarticle`など）
2. マージン設定を調整
3. `\clearpage`や`\newpage`コマンドが多すぎないか確認

### 画像が表示されない

#### 症状
PDF内で画像が表示されない、または「画像が見つからない」エラー。

#### 対処

1. **パスの確認**
   - 相対パスが正しいか確認
   - 画像ファイルがVault内に存在するか確認

2. **リソースディレクトリの設定**
   ```
   リソース検索ディレクトリ: ./attachments
   ```

3. **WikiLink形式の場合**
   ```markdown
   ![[image.png]]
   ```
   ファイル名が正確に一致しているか確認

4. **画像フォーマット**
   - PNG、JPG、PDF形式を推奨
   - SVGは変換時に問題が起きる場合あり

---

## 日本語処理の問題

### 日本語が文字化けする

#### 症状
PDF内で日本語が「■」や「□」で表示される、または表示されない。

#### 対処

1. **日本語フォントの確認**
   プリアンブルに以下が含まれているか確認：
   ```latex
   \usepackage{luatexja-fontspec}
   \setmainjfont{Noto Serif CJK JP}
   \setsansjfont{Noto Sans CJK JP}
   ```

2. **フォントのインストール確認**
   ```bash
   # Notoフォントがインストールされているか確認
   fc-list | grep Noto
   ```

3. **デフォルトプリアンブルの使用**
   「デフォルトにリセット」ボタンで日本語対応プリアンブルに戻す

### 日本語の行送りがおかしい

#### 症状
日本語テキストの行間が不自然、または改行位置がおかしい。

#### 対処
プリアンブルに以下を追加：
```latex
\usepackage{setspace}
\setstretch{1.2}  % 行間の調整
```

### 和文と欧文の混在で表示が崩れる

#### 症状
日本語と英語が混在する文で、フォントサイズやベースラインがずれる。

#### 対処
プリアンブルのフォント設定を調整：
```latex
% 欧文（数字含む）は大文字基準で和文に寄せる
\setmainfont[Scale=MatchUppercase]{Noto Serif}
\setsansfont[Scale=MatchUppercase]{Noto Sans}
```

---

## インストールと依存関係

### "pandoc: command not found"

#### 原因
Pandocがインストールされていない、またはPATHに設定されていない。

#### 対処

**macOS**:
```bash
brew install pandoc
```

**Windows**:
1. [Pandoc公式サイト](https://pandoc.org/installing.html)からインストーラーをダウンロード
2. インストール時に「Add to PATH」にチェック

**確認**:
```bash
which pandoc  # macOS/Linux
where pandoc  # Windows
```

### "lualatex: command not found"

#### 原因
LuaLaTeXがインストールされていない。

#### 対処

**macOS**:
```bash
brew install --cask mactex
# または最小限のインストール
brew install --cask mactex-no-gui
```

**インストール後の確認**:
```bash
lualatex --version
```

### pandoc-crossrefが見つからない

#### 症状
「Pandoc Crossrefを使う」が有効で、pandoc-crossrefがインストールされていない場合にエラー。

#### 対処
```bash
pip install pandoc-crossref
```

PATHが通っていない場合は設定画面でフルパスを指定：
```
/opt/homebrew/bin/pandoc-crossref
```

### markdownlint-cli2が見つからない

#### 症状
「Markdownlint --fixを実行」が有効で、markdownlint-cli2が見つからない場合にエラー。

#### 対処
```bash
npm install -g markdownlint-cli2
```

---

## 設定の問題

### 設定が保存されない

#### 症状
設定を変更しても、Obsidianを再起動すると元に戻る。

#### 対処

1. **手動で保存**
   - 設定変更後、設定画面を閉じる
   - プラグインを無効化→有効化

2. **ファイルの権限確認**
   ```bash
   ls -la .obsidian/plugins/obsidian-mdtex-plugin/
   ```
   書き込み権限があるか確認

3. **Obsidianの再起動**
   - 完全にObsidianを終了して再起動

### プロファイルが切り替わらない

#### 原因
設定のキャッシュやUIの更新問題。

#### 対処
1. 設定画面を閉じて再度開く
2. Obsidianを再起動
3. 別のプロファイルを選択してから、目的のプロファイルを再度選択

### デフォルト値に戻したい

#### 特定の設定項目
各設定項目の「デフォルトにリセット」ボタンを使用

#### 全設定を初期状態に
1. プラグインを無効化
2. 設定ファイルを削除：
   ```bash
   rm .obsidian/plugins/obsidian-mdtex-plugin/data.json
   ```
3. プラグインを有効化
4. デフォルト設定で再初期化される

---

## Beamerの問題

### "Undefined control sequence"エラー

#### 原因
Beamerと互換性のないパッケージやコマンドを使用。

#### 対処

1. **プリアンブルを最小化**
   ```latex
   \usepackage{microtype}
   \usepackage{luatexja}
   \usepackage[noto-otf]{luatexja-preset}
   ```
   これだけで一度テスト

2. **競合するパッケージを削除**
   - `titling`
   - `geometry`
   - `setspace`
   - `parskip`

3. **pandoc-crossrefを無効化**
   設定で「Pandoc Crossrefを使う」をオフに

### スライドが分割される

#### 原因
長い内容が自動的に複数スライドに分割される。

#### 対処
明示的に`\newpage`または`\framebreak`を使用：
```markdown
# 長いスライド

内容...

\framebreak

続き...
```

### テーマが適用されない

#### 原因
テーマファイルが見つからない、またはプリアンブルの記述ミス。

#### 対処

1. **テーマのインストール確認**
   ```bash
   kpsewhich beamerthememadrid.sty
   ```

2. **プリアンブルの確認**
   ```latex
   \usetheme{Madrid}  % テーマ名は大文字小文字を区別
   ```

---

## DOCX変換の問題

### LaTeXコマンドが反映されない

#### 症状
`\textbf{}`などのLaTeXコマンドがWordでプレーンテキストとして表示される。

#### 原因
DOCX変換は実験的機能で、すべてのLaTeXコマンドが変換されるわけではない。

#### 対処

1. **Luaフィルタの確認**
   - 「高度なLaTeXコマンドを有効」がオンになっているか確認
   - Luaフィルタのパスが正しいか確認

2. **Pandocの記法を使用**
   ```markdown
   **太字**    # LaTeXの \textbf{} の代わりに
   *斜体*      # LaTeXの \textit{} の代わりに
   ```

3. **カスタムスタイルの使用**
   参照テンプレートを作成し、カスタムスタイルを定義

### 画像が配置されない

#### 対処
画像パスを相対パスで指定：
```markdown
![説明](./images/image.png)
```

### 数式がおかしい

#### 原因
Wordの数式エディタとPandocの変換の問題。

#### 対処
1. Pandocを最新版に更新
2. `--webtex`オプションを使用して画像として埋め込む（品質は低下）

---

## パフォーマンスの問題

### 変換に時間がかかる

#### 症状
PDF生成に数十秒以上かかる。

#### 原因と対処

1. **大きな画像ファイル**
   - 画像サイズを縮小
   - ドラフトモードを使用（`--draft`フラグ）

2. **複雑なLaTeXパッケージ**
   - 不要なパッケージをプリアンブルから削除
   - TikZなどの描画パッケージは必要な場合のみ使用

3. **トランスクルージョンの多さ**
   - 深い階層の`![[...]]`を減らす
   - 展開後のファイルサイズを確認

4. **Mermaid図の変換**
   - 「Mermaid実験機能」を無効にする
   - または、Mermaid図を事前に画像化してから埋め込む

### Obsidianがフリーズする

#### 原因
変換処理が重すぎる、またはメモリ不足。

#### 対処

1. **開発者ツールで確認**
   - Cmd/Ctrl+Shift+I で開発者ツールを開く
   - Consoleタブでエラーメッセージを確認

2. **バックグラウンド処理の制限**
   - 大きなファイルは分割して変換
   - 一時ファイルの自動削除を有効化

3. **メモリの確保**
   - 他のアプリケーションを閉じる
   - Obsidianを再起動

---

## ログとデバッグ

### 開発者ログの確認

#### 方法
1. 「グローバル設定」で「開発ログを非表示」を**オフ**にする
2. Obsidianの開発者ツール（Cmd/Ctrl+Shift+I）を開く
3. Consoleタブでログを確認

#### 重要なログメッセージ

- `[MdTexPlugin]` - プラグインの初期化と設定
- `Pandoc Output:` - Pandocの標準出力
- `Pandoc stderr:` - Pandocのエラー出力
- `convert PDF completed in X ms` - 変換完了時間

### 中間ファイルの確認

デバッグのために中間ファイルを保持：

1. 「中間ファイルを削除」を**無効**にする
2. 変換を実行
3. 以下のファイルを確認：
   - `.temp.md` - 変換前のMarkdown
   - `.preamble.tex` - LaTeXヘッダー
   - `.tex` - LaTeXソース（LaTeX出力時）

### 最小構成でのテスト

問題の切り分けのため、最小構成でテスト：

```markdown
---
title: テスト
date: 2025-01-31
---

# テスト

これはテストです。
```

これが正常に動作すれば、元のファイルの特定の部分に問題があります。

---

## サポートを求める

問題が解決しない場合：

1. **GitHub Issues**
   - [GitHub Issues](https://github.com/Mekann2904/obsidian-mdtex-plugin/issues)
   - 以下を含めて報告：
     - Obsidianバージョン
     - プラグインバージョン
     - エラーメッセージ
     - 再現手順

2. **ログの添付**
   - 開発者ツールのConsole出力
   - エラーメッセージのスクリーンショット

---

## 関連ドキュメント

- [クイックスタート](./quickstart.md)
- [設定リファレンス](./configuration.md)
- [機能一覧](./features.md)
- [Beamerガイド](./beamer-guide.md)
