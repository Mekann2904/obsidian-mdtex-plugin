<!-- File: performance-report.md -->
<!-- Purpose: MdTexプラグインのパフォーマンス調査結果をまとめる。 -->
<!-- Reason: 現状のボトルネックを共有し、改善の優先順位を示すため。 -->
<!-- Related: src/services/convertService.ts, src/utils/markdownTransforms.ts, src/utils/transclusion.ts, src/suggest/LabelReferenceSuggest.ts -->

# MdTex Plugin パフォーマンス調査レポート（2025-12-02）

## 主な懸念点
- `src/services/convertService.ts:339-345`  
  Pandoc の stderr チャンクごとに `new Notice` を出し続ける。長いログで数百件のトーストが生成され、レンダラーを詰まらせる。最初の数件に制限し、全文はコンソール/ログファイルに集約するのが安全。

- `src/services/convertService.ts:148-165` と `src/utils/transclusion.ts:27-109` と `src/utils/markdownTransforms.ts:49-65`  
  トランスクルージョンをまず `expandTransclusions` で読み込み（async）、その後 `replaceWikiLinksRecursively` 内で同じ埋め込みを `fsSync.readFileSync` で再読込している。大きいノートで I/O が倍増し、しかも同期 read が UI スレッドをブロックする。埋め込み内容は一度だけ非同期で読み、キャッシュを共有する設計にすると待ち時間が半減する。

- `src/utils/markdownTransforms.ts:120-134`  
  `replaceWikiLinksRecursively` が最大 5 回全文を置換再走査し、毎回リンク解決とファイル読込を繰り返す。リンク数が多いほど O(n*k) で立ち上がりが伸びる。変化がなくなったら早期終了するか、1 パスで完結するステートフルパーサへ置き換えると安定する。

- `src/suggest/LabelReferenceSuggest.ts:33-38,126-136`  
  `debounce(..., 300, true)` の「先行」設定でキータイプごとに全文ラベル抽出が走る。大きなファイルで入力レイテンシが目立つ。後行デバウンス（leading=false）にし、差分抽出または行単位インクリメンタルパースへ切り替えると軽くなる。

## すぐ試せる改善案
- Pandoc stderr の通知は先頭 1 件だけトースト表示し、残りはコンソールに集約する。
- トランスクルージョン展開と WikiLink 埋め込み読み込みを共有キャッシュ化し、同期 I/O を排除する。
- WikiLink 置換を 1 パス化するか、実質的な変更が無い場合は再帰を打ち切るフラグを導入する。
- ラベルサジェスト更新を後行デバウンスへ変更し、必要なら 500–800ms 程度まで待機時間を延ばす。

## 実装方針（具体）
- Pandoc 通知抑制  
  - `convertService.ts` の `handlePandocProcess` に通知カウンタを導入。stderr 受信時は最大 1 件だけ Notice 表示し、以降はコンソールログへ退避。  
  - 追加: `let noticeCount = 0; const NOTICE_LIMIT = 1;` をクロージャで保持。

- トランスクルージョン I/O 最適化  
  - `expandTransclusions` に `cache: Map<string,string>` を追加引数で渡す。読込済みファイルはキャッシュを返す。  
  - `replaceWikiLinksRecursively` 側で埋め込み Markdown の再読込をやめ、キャッシュを共有する API に寄せる（同期 readFileSync を削除し、外から渡されたキャッシュを使う）。  
  - これに伴い `convertService.ts` から `replaceWikiLinksRecursively` 呼び出しにキャッシュを渡すようシグネチャを変更。

- WikiLink 置換の早期終了  
  - `replaceWikiLinksRecursively` を「1 回の置換結果を比較し、変更がなければ即 return」へ修正済みだが、最大 5 回ループを廃止し 1 パスにする。  
  - 置換ロジックをステートフルにし、走査中に変換済みテキストを直接組み立てる実装に置換する（正規表現の全再走査をやめる）。

- サジェストのデバウンス調整  
  - `debounce(this.updateLabelsProcess.bind(this), 300, true)` を `debounce(..., 500, false)` に変更し、入力終了後のみ実行。  
  - 将来の追加案: 差分抽出（行単位で変更がある場合のみ再パース）を別タスクで検討。
