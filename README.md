# MdTexプラグイン

MdTexは、[Pandoc](https://pandoc.org/) と [LuaLaTeX](https://www.latex-project.org/) を使用してMarkdownをPDFに変換するObsidian用プラグインです。特に日本語テキストの処理を得意としており、多言語ドキュメントを扱うユーザーに適しています。

サンプルPDFを入手できます : [note記事:Obsidian用プラグインMdTexの導入方法、使い方について](https://note.com/mekann/n/nd837b0beaf60?sub_rt=share_pw)

[MdTexのロードマップ](https://github.com/users/Mekann2904/projects/2)

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

4. **beamerを使用する**
   プラグイン設定で`documentClass`を`beamer`に設定すると、beamerを使用してPDFを生成できます。
   beamerのサンプルは[こちら](./sample-beamer.md)です。
   beamerは競合が起こりやすいため、エラーが出る場合は以下のように設定してください。

    4.1 LaTeXヘッダーの設定は以下のようになります。

    ```yaml
    ---
    header-includes:
      - |
        \usepackage{microtype}
        \usepackage{luatexja}

        \usepackage[noto-otf]{luatexja-preset}

        \usepackage{luatexja-fontspec} 
        \setmainfont{Noto Sans CJK JP}
        \setsansfont{Noto Sans CJK JP}
        \setmonofont{Ricty Diminished}

    ---

    ```

    4,2 pandoc-crossref, 余白サイズを無効にする。

    ![image.png](./Pasted%20image%2020250601145408.png)

    4.3 最終的なdata.jsonは以下のようになります。あくまで一例ですが...

    ```json
    {
      "activeProfile": "スライド",
      "profilesArray": [
        {
          "name": "スライド",
          "pandocPath": "/opt/homebrew/bin/pandoc",
          "pandocExtraArgs": "",
          "searchDirectory": "",
          "headerIncludes": "---\\nheader-includes:\\n  - |\\n    \\\\usepackage{microtype}\\n    \\\\usepackage{luatexja}\\n\\n    \\\\usepackage[noto-otf]{luatexja-preset}\\n\\n    \\\\usepackage{luatexja-fontspec} \\n    \\\\setmainfont{Noto Sans CJK JP}\\n    \\\\setsansfont{Noto Sans CJK JP}\\n    \\\\setmonofont{Ricty Diminished}\\n\\n---",
          "outputDirectory": "",
          "deleteIntermediateFiles": false,
          "pandocCrossrefPath": "/opt/homebrew/bin/pandoc-crossref",
          "usePandocCrossref": false,
          "imageScale": "width=0.8\\textwidth",
          "usePageNumber": false,
          "marginSize": "1in",
          "useMarginSize": false,
          "fontSize": "8pt",
          "outputFormat": "pdf",
          "latexEngine": "/Library/TeX/texbin/lualatex",
          "figureLabel": "Figure",
          "figPrefix": "Figure",
          "tableLabel": "Table",
          "tblPrefix": "Table",
          "codeLabel": "Code",
          "lstPrefix": "Code",
          "equationLabel": "Equation",
          "eqnPrefix": "Eq.",
          "documentClass": "beamer",
          "documentClassOptions": "",
          "useStandalone": true
        }
      ]
    }
    ```

5. **設定のプロファイル管理について**
   プラグイン設定で複数の設定を管理できるようになりました。
   新しいプロファイルを作成すると、デフォルト値で新しいプロファイルが作成されます。
   入力が大変なので@でのサジェスト機能を追加しました。pandocPath, pandocCrossrefPath, latexEngineなど各項目の設定を@でサジェストすることが可能です。有効活用してください。

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
- **DOCX変換**: `docx`を選択すると、Luaスクリプトが自動的に適用され、画像やテーブルのスタイルが調整されます。

### 13. LaTeXエンジン
- **説明**: LaTeXのコンパイルに使用するエンジンを指定します。(実験的)
- **デフォルト値**: `lualatex`
- **選択肢**: `lualatex`, `xelatex`, `pdflatex`

---

### 14. Lua スクリプトを使った DOCX 変換

プラグインは **Lua フィルタ** を用いて Markdown を DOCX に変換できます。

#### 使い方

1. プラグインの「出力形式」を **`docx`** に設定する。
2. 変換時に Lua スクリプトが自動適用され、DOCX が生成される。

   * Lua スクリプトは **[lua-script.lua](./lua-script.lua)** を使用。
   * 参照テンプレートは **[reference.docx](./reference.docx)** を使用。

> 自分でテンプレートを作る場合:
>
> ```bash
> pandoc --print-default-data-file reference.docx > ~/reference.docx
> ```
>
> 生成したファイルを Word で開いて保存し、必要ならスタイルを調整してください。

#### Pandoc 追加オプション

プラグインの「Pandoc 追加オプション」に以下を指定してください。

```
--reference-doc=reference.docx
```

（環境によっては相対パスではなく絶対パス推奨）

#### コマンドライン例（参考）

```bash
pandoc input.md \
  -f markdown+raw_tex+fenced_divs \
  -t docx \
  --lua-filter=lua-script.lua \
  --reference-doc=reference.docx \
  --standalone \
  -o output.docx
```

#### Lua スクリプトでできること（例）

* テーブルのスタイル調整
* コードブロックの書式設定
* 日本語フォント設定
*（スクリプトの内容に依存します。必要な機能があるかは `lua-script.lua` を参照してください。）*

#### 注意事項

* DOCX 変換は **実験的** 機能です。
* 一部の **LaTeX 専用コマンド** はそのままでは反映されません（Lua フィルタでの変換が必要）。
* 画像の配置やサイズは Lua スクリプトのロジックに従います。
* ルビなどを Lua で扱う場合は **Pandoc 2.12 以上** を推奨します。



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

