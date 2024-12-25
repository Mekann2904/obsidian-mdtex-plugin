# MdTexプラグイン

MdTexは、[Pandoc](https://pandoc.org/) と [LuaLaTeX](https://www.latex-project.org/) を使用してMarkdownをPDFに変換するObsidian用プラグインです。特に日本語テキストの処理を得意としており、多言語ドキュメントを扱うユーザーに適しています。

---

## 特徴
- MarkdownファイルをPandocとLuaLaTeXを使用してPDFに変換。
- カスタムLaTeXヘッダーを使用してPDFのフォーマットを柔軟に調整可能。

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

## 必須要件
- **Pandoc**  
  Pandocをシステムにインストールしてください。インストール方法は [公式サイト](https://pandoc.org/) を参照してください。
- **LuaLaTeX**  
  LuaLaTeXが必要です。通常、[TeX Live](https://www.tug.org/texlive/) や [MikTeX](https://miktex.org/) に含まれています。

---

## プラグイン設定項目
1. **Pandocのパス**  
   Pandoc実行ファイルのパスを指定します。
2. **検索ディレクトリ**  
   画像などのリンクされたファイルを検索するディレクトリを設定します。
3. **ヘッダーのカスタマイズ**  
   LaTeXのヘッダーをカスタマイズしてPDFのフォーマットを調整できます。
4. **出力ディレクトリ**  
   生成されたPDFを保存するディレクトリを指定します。
5. **中間ファイルの削除**  
   PDF生成後に中間ファイルを自動的に削除するかどうかを設定します。

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

---

### 開発者情報
開発者: **Mekann**  
GitHub: [Mekann2904](https://github.com/Mekann2904)# obsidian-mdtex-plugin
