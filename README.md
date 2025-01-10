# MdTexプラグイン

MdTexは、[Pandoc](https://pandoc.org/) と [LuaLaTeX](https://www.latex-project.org/) を使用してMarkdownをPDFに変換するObsidian用プラグインです。特に日本語テキストの処理を得意としており、多言語ドキュメントを扱うユーザーに適しています。

---

## 特徴
- MarkdownファイルをPandocとLuaLaTeXを使用してPDFに変換。
- カスタムLaTeXヘッダーを使用してPDFのフォーマットを調整可能。
- pandoc-crossrefを用いた自動クロスリファレンス対応。

---

## インストール方法

### **手動インストール**
1. [GitHubのリリースページ](https://github.com/Mekann2904/obsidian-mdtex-plugin/releases) から最新バージョンをダウンロードしてください。
2. ダウンロードしたファイルを解凍します。
3. 解凍したフォルダをObsidianのボルト内にある `.obsidian/plugins/` フォルダにコピーします。
4. Obsidianを開き、`設定 > コミュニティプラグイン` から `MdTexプラグイン` を有効化してください。

---

## 使い方
1. **Markdownファイルを準備**  
   Obsidian内でMarkdownファイルを作成し、内容を記述します。

2. **PDFを生成**  
   リボンアイコンやコマンドパレットを使用して、アクティブなMarkdownファイルをPDFに変換します。生成されたPDFは指定した出力ディレクトリに保存されます。

3. **出力をカスタマイズ**  
   プラグイン設定でLaTeXヘッダーをカスタマイズし、PDFのフォーマットを変更できます。

---

# 依存関係一覧

## 1. Pandoc  
PandocはMarkdownをPDFや他の形式に変換するために必要です。以下の手順でインストールしてください。

- **インストール方法**:
  - macOS:
    ```bash
    brew install pandoc
    ```
  - Ubuntu/Debian:
    ```bash
    sudo apt install pandoc
    ```
  - その他の詳細: [Pandoc公式サイト](https://pandoc.org/)

---

## 2. LuaLaTeX  
LuaLaTeXはPDF生成用のエンジンとして使用されます。通常、TeX LiveまたはMikTeXに含まれています。

- **インストール方法**:
  - **TeX Live**（推奨）
    - ダウンロード: [TeX Live公式サイト](https://www.tug.org/texlive/)
    - macOSの場合:
      ```bash
      brew install --cask mactex
      ```
  - **MikTeX**（Windows向け）
    - ダウンロード: [MikTeX公式サイト](https://miktex.org/)

- **LuaLaTeX確認方法**:
  ```bash
  lualatex --version
  ```

---

## 3. pandoc-crossref  
Pandocでクロスリファレンスを解決するためのフィルターです。

- **インストール方法**:
  ```bash
  pip install pandoc-crossref
  ```

- **インストール確認**:
  ```bash
  pandoc --filter pandoc-crossref --version
  ```

---

## 4. LaTeXパッケージ  
Markdownから正確にPDFを生成するためには以下のLaTeXパッケージが必要です。

| パッケージ      | 用途                       |
|-----------------|----------------------------|
| `listings`      | コードブロックのレンダリング |
| `setspace`      | 行間設定                   |
| `geometry`      | PDFのマージン設定          |
| `fontspec`      | フォント設定               |
| `hyperref`      | クロスリファレンス対応      |
| `xcolor`        | 色設定                     |
| `ltjsarticle`   | 日本語対応（LuaLaTeX用）    |

- **インストール方法（TeX Liveの場合）**:
  ```bash
  tlmgr install listings setspace geometry fontspec hyperref xcolor
  ```

---

## 5. その他
- **PATH設定**:
  PandocやLuaLaTeXをシステムのPATHに追加する必要があります。
  ```bash
  export PATH=$PATH:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
  ```

- **Node.jsとその組み込みモジュール**:
  - Node.jsが必要です。
    ```bash
    brew install node # macOS
    sudo apt install nodejs # Ubuntu/Debian
    ```
  - 必須モジュール:
    - `fs/promises`: ファイル操作用
    - `child_process`: コマンドの実行

---

## プラグイン設定項目

### 1. Pandocのパス
- **説明**: Pandoc実行ファイルのフルパスを指定します。推奨:絶対パス
- **デフォルト値**: `pandoc` (システムのPATHで検索)
- **例**:
  - macOS/Linux: `/usr/local/bin/pandoc`
  - Windows: `C:\Program Files\Pandoc\pandoc.exe`

### 2. 追加オプション (Pandoc Extra Args)
- **説明**: Pandocに渡す追加オプションをスペース区切りで指定します。
- **用途**: 特定のフォーマットや設定を利用する場合に使用します。
- **例**:
  - `--toc --highlight-style=kate`
  - `--number-sections`

### 3. 検索ディレクトリ
- **説明**: プラグインが画像を検索するディレクトリのルートパスを指定します。
- **デフォルト値**: ObsidianのVaultディレクトリ
- **注意**: 相対パスやフルパスを指定できます。

### 4. カスタムヘッダー (LaTeX Header Includes)
- **説明**: LaTeXのカスタムヘッダーをYAML形式で記述します。
- **用途**: フォント設定、余白、スタイル、追加パッケージなどのカスタマイズに利用。


### 5. 出力ディレクトリ
- **説明**: 生成されたPDFを保存するディレクトリを指定します。
- **デフォルト値**: Vaultのルートディレクトリ
- **注意**: ディレクトリが存在しない場合はエラーになります。

### 6. 中間ファイルの削除
- **説明**: PDF生成後に一時Markdownファイルを削除するかどうかを指定します。
- **デフォルト値**: 無効 (`false`)
- **推奨設定**: 初心者は無効のまま使用し、必要に応じてオンにしてください。

### 7. pandoc-crossrefのパス
- **説明**: pandoc-crossrefフィルターの実行ファイルパスを指定します。推奨:絶対パス
- **デフォルト値**: `pandoc-crossref` (システムのPATHで検索)
- **例**:
  - macOS/Linux: `/usr/local/bin/pandoc-crossref`
  - Windows: `C:\Users\YourUser\AppData\Local\Pandoc\pandoc-crossref.exe`

### 8. 画像のデフォルトスケール
- **説明**: 画像のデフォルトスケールを指定します (例: `width=0.8\linewidth`)。
- **デフォルト値**: `width=0.8\linewidth`
- **用途**: ドキュメント内での画像サイズを統一できます。

### 9. ページ番号の表示
- **説明**: PDFにページ番号を付けるかどうかを指定します。
- **デフォルト値**: 有効 (`true`)

### 10. ページ余白サイズ
- **説明**: PDFの余白サイズを指定します。
- **デフォルト値**: `1in`
- **例**: `20mm`, `0.5in`

### 11. フォントサイズ
- **説明**: LaTeXで使用するフォントサイズを指定します。
- **デフォルト値**: `12pt`
- **例**: `10pt`, `11pt`, `14pt`

### 12. 出力形式
- **説明**: PDF以外にもLaTeXやWord文書など、生成するドキュメント形式を指定します。(実験的)
- **デフォルト値**: `pdf`
- **選択肢**: `pdf`, `latex`, `docx` など

### 13. LaTeXエンジン
- **説明**: LaTeXのコンパイルに使用するエンジンを指定します。(実験的)
- **デフォルト値**: `lualatex`
- **選択肢**: `lualatex`, `xelatex`, `pdflatex`

---

## 既知の問題
- 複雑なLaTeX設定には追加パッケージが必要になる場合があります。

---

## 貢献について
貢献は歓迎します！  
バグ報告や新機能の提案がある場合は、[GitHub Issues](https://github.com/Mekann2904/obsidian-mdtex-plugin/issues) を通じてお知らせください。プルリクエストも受け付けています。

---

## ライセンス
このプラグインは [MITライセンス](LICENSE) の下で公開されています。

---

## 謝辞
- [Pandoc](https://pandoc.org/): 汎用的なドキュメントコンバーター。
- [LuaLaTeX](https://www.latex-project.org/): 多言語組版に対応した強力なTeXエンジン。
- [Obsidian](https://obsidian.md/): ローカルのMarkdownファイルを使用するナレッジベースツール。
- [Pandoc-crossref](https://github.com/lierdakil/pandoc-crossref): 図、方程式、 表とその相互参照を実現するためのフィルター。

---

### 開発者情報
開発者: **Mekann**  
GitHub: [Mekann2904](https://github.com/Mekann2904)# obsidian-mdtex-plugin
