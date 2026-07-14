# MdTex 開発計画（plan.md）

最終更新: 2026-07-14
ブランチ: `dev/v4_0_0`

---

## 1. プロジェクト概要

**MdTex** は Obsidian の Markdown ノートを Pandoc + LuaLaTeX で PDF/LaTeX/DOCX に変換するプラグイン。2 つの顔を持つ:

- **GUI（Obsidian プラグイン）**: 執筆中のリアルタイム変換・設定・補完
- **mdtex CLI**: LLM コーディングエージェントが MdTex を観測・実行するための**誠実な道具**（cli-for-agents 準拠）

GUI はマウス/キーボード前提でエージェントから操作できない。所以 **CLI が LLM エージェントが MdTex を扱う唯一の経路**。推論・判断はエージェント（LLM）、CLI は観測と実行に徹する。

---

## 2. アーキテクチャ

GUI と CLI が純粋関数を共有しつつ、I/O 層だけ差し替える構造（thermo-nuclear review で確立）。

```
templatePackMeta.ts        純粋関数（obsidian 非依存・GUI/CLI 共有）
  └ parsePackMetadata / PackMetadata / normalizeTemplateFolder / DEFAULTS_FILE_NAME
        │
        ▼
packAccess.ts              I/O 抽象化 + 共通ロジック（obsidian 非依存）
  └ PackFileAccess interface（listChildDirs / readText / exists）
  └ listPacks / readPackMeta / checkRequires / validatePack（status モデル）
        │
   ┌────┴────┐
   ▼         ▼
templatePackService.ts     fsTemplatePack.ts
（GUI 版・obsidian 依存）   （CLI 版・fs 依存）
  └ makeVaultAccess          └ fsAccess
  └ thin wrapper             └ thin wrapper
  └ scaffold（書き込み）     └ testPackFs（pandoc 実行）
        │                         │
        ▼                         ▼
MdTexPluginSettingTab.ts   src/cli/index.ts
（設定UI）                  （CLI エントリ・dispatch）
```

CLI バンドル（`dist/cli.js`）は obsidian / sampleTemplatePacks に一切触れない。GUI（`main.js`）は re-export で後方互換を維持。

---

## 3. 進捗（2026-07-03 時点）

### テンプレート機能（GUI）

- ✅ **パック自己記述メタ `_mdtex:`**（`3f72598`）— title/description/engine/requires/recommendedProfile を defaults.yaml に宣言、設定UI で表示・警告・推奨適用
  - ⚠️ **設計ミス発覚**（後述ブロッカー #1）: pandoc が defaults.yaml の `_mdtex:` を拒否
- ✅ **縦書き二段組パック ブラッシュアップ**（`d97f33c`）— 章背景画像（chapter-bg.lua/png）+ sample.md
- ✅ **設定UI の整理・折りたたみ化**（`ecbd6b4`）
- ✅ **pLaTeX 学会論文サンプルパック**（`c2daf48`）+ citation パイプライン（ADR-009）

### mdtex CLI（P1: 観測・検証）

- ✅ **CLI 骨格**（`f1d3346`）— 最小パーサー・dispatch・--help 階層（examples 付き）・exit code・version 注入
- ✅ **`pack list`** — パック一覧（`_mdtex` の title/description 付き）・`--json`
- ✅ **`pack validate`** — defaults 構文 + メタ + requires チェック・`--strict`・`--json`・status モデル（exit 0/1/2 と整合）
- ✅ **packAccess 抽象化**（`c024e9a`）— vault/fs の I/O 重複を解消（6実装 → 1ロジック + 2アダプタ）・listPacks 並列化
- ✅ **`pack test`**（未コミット・実装済み）— サンプル原稿で PDF 生成・`--dry-run`・`--keep-artifacts`・`--json`
  - ⚠️ 実際の PDF 生成が `_mdtex:` ブロッカーで通らない

### mdtex CLI（P2: 実行の中核）

- ✅ **`mdtex convert <file>`**（`102b885`）— Markdown → PDF/LaTeX/DOCX。`--output` / `--format` / `--defaults` / `--pack` / `--pandoc` / `--dry-run` / `--json`。pandoc 実行を共通コア（`pandocRun`）に集約し、convert と pack test で共有
  - 🟡 L3（Obsidian 記法: WikiLink / transclusion / `%%` コメント）は未対応 — `VaultLike` 抽象化で今後拡張

### 検証状況

- テスト: **458 passed**（純粋関数 + fs 統合テスト・doctor 診断・crossref 重複・CLI Obsidian 記法正規化）
- lint / tsc / build:cli / build（プラグイン）: 全てクリーン
- main.js 影響なし（依存ゼロ増・js-yaml 非使用で `_mdtex:` パーサは最小自前）

---

## 4. 現在のブロッカー

### 🔴 #1: `_mdtex:` が pandoc で壊れる（最優先・pack test が検出）

コミット `3f72598` で「Pandoc は未知キーを無視する」と仮定して `_mdtex:` を defaults.yaml に書いたが、これは **Pandoc の metadata では正しく、defaults file（`-d`）では誤り**。defaults file は厳密スキーマで未知キーを `Unknown option "_mdtex"` エラー（exit 64）で拒否する。

```
pandoc sample.md -d defaults.yaml -o out.pdf
→ Aeson exception: Error in $: Unknown option "_mdtex"
```

**pack test が「実際に pandoc で PDF を通す」ことでこれを検出**した。「観測と実行に徹する CLI」が本来の目的（エージェントのループ）を早々に果たした意義は大きい。

#### 修正方針: `_mdtex:` を別ファイルに分離

```
縦書き二段組/
├── defaults.yaml      ← pandoc 用（_mdtex 無し・クリーン）
├── _mdtex.yaml        ← MdTex 用メタ（新規・pandoc は読まない）
├── ...
```

#### 影響範囲（中規模）

- サンプルパック 3 つ: defaults.yaml から `_mdtex:` 削除 + `_mdtex.yaml` 新設
- `templatePackMeta.parsePackMetadata`: `_mdtex.yaml` 全体をパースに（`_mdtex:` ラッパー除去）
- `packAccess.readPackMeta`: `_mdtex.yaml` を読むに（`MDTEX_META_FILE_NAME = "_mdtex.yaml"`）
- テスト更新（templatePackService.test.ts / fsTemplatePack.test.ts の parsePackMetadata 期待値）
- docs 更新（SKILL.md / README.md の「パックメタ」節）

---

## 5. ロードマップ（推奨・今後の方向性）

優先度順。🔴 は現在のブロッカー、それ以下は推奨。

### P1 完成（観測・検証）

- 🔴 **#1 `_mdtex.yaml` 分離修正**（ブロッカー解消）→ pack test が通る
- 🟠 **`pack test` のコミット**（#1 修正後に PDF 生成が通ることを確認してコミット）
- ✅ **`mdtex doctor`**（本コミット）— 環境診断（pandoc / latexmk / lualatex / pandoc-crossref / markdownlint-cli2 の発見と版）。`binDiscover` を再利用し、版取得は `resolveVersionSubprocess` に隔離。status モデルは pack validate と統一（ok/degraded/errors → exit 0/1/2）。診断ロジックを純粋関数3つ（`doctorDiagnose` / `doctorVersion` / `doctorReport`）に分離し、fsLayer・resolveVersion 注入でテスト

### P2（実行の中核）

- ✅ **`mdtex convert <file>`**（L2 達成・`102b885`）— Markdown → PDF/LaTeX/DOCX。plain Markdown 向けの fs ベース前処理 + Pandoc 呼び出しを実装
  - L3（Obsidian 記法の正規化）を normalizeForCli に段階的に拡張中:
    - ✅ `%%` コメント除去（フェーズ1・`03b633d`）— stripObsidianComments を GUI/CLI 共有
    - ✅ crossref ラベル重複検出（`03e1cc9`）— normalizeForCli の戻り値を拡張し detectDuplicateLabels を統合。convert / pack test の結果に duplicateLabels を伝播
    - ✅ expandTransclusions の VaultLike 化（フェーズ2 step2-1・`749c450`）— app 依存を VaultLike（resolveLink / read）に抽象化し、transclusion.ts を GUI/CLI 共有の純粋モジュール化
    - ✅ fsVault（CLI 版）+ normalizeForCli 統合（フェーズ2 step2-2・`fb040e5`）— CLI で ![[link]] 展開が動く。--vault-root フラグ（既定=入力mdのディレクトリ）。方式W（ラベルプレフィックス）も CLI で動作
    - ✅ WikiLink 系の VaultLike + ProfileLike 化（フェーズ2 step3a・`e6b1231`）— markdownTransforms.ts を obsidian 非依存に純粋化。getLinkTargetFile（linkUtils.ts）は統合し削除
    - ✅ CLI で WikiLink アンラップ + 画像変換（フェーズ2 step3b・`5366942`）— normalizeForCli に unwrapValidWikiLinks + replaceWikiLinksAndCodeAsync を統合。--image-scale フラグ
    - 🟠 resolveDraftRequest（draft）— CLI に pandocExtraArgs / header 反映経路が無く別判断

### P3 以降（拡張）

- 🟢 **`mdtex pack new <name> --from <template>`** — 土台複製で新パック生成
- 🟢 **`mdtex profile list/show/new/diff`** — プロファイル管理
- 🟢 **`mdtex init`** — プロジェクトセットアップ

### 継続的改善（thermo-nuclear review 残指摘）

- 🟢 `templatePackService` の re-export 一貫性（import 再公開 vs from 再公開の明記）
- 🟢 thin wrapper 層（list/read/check）の位置づけコメント（GUI が直接 packAccess を使うようになれば削除可能）
- 🟢 `packAccess` の命名（validatePack を含むので「アクセス」以上・`packOps` 等も候補）

---

## 6. 設計原則（CLI）

cli-for-agents 準拠。LLM エージェントが CLI を道具として使いこなすため:

- **非対話**: 全入力はフラグ。プロンプト禁止（エージェントのデッドロック回避）
- **`--json`**: 構造化出力（status / data / errors）。exit code と整合
- **段階的 `--help`**: `mdtex` → `mdtex pack` → `mdtex pack validate` の階層 + examples
- **actionable errors**: 事実と原因の所在・ドキュメント節へのポインタ。ただし「こう直せ」とは言わない（推論はエージェント）
- **idempotent / `--dry-run`**: エージェントの再試行と計画確認に耐える
- **コンテキスト効率**: デフォルトは簡潔、詳細は `--verbose` / `--json`

**「観測と実行に誠実で、判断をエージェントに委ねる、合成可能な組版 CLI」** を目指す。

---

## 7. コマンドリファレンス（現在）

```
mdtex --version
mdtex --help

mdtex pack list [--folder <path>] [--json]
mdtex pack validate <pack> [--folder <path>] [--strict] [--json]
mdtex pack test <pack> [--folder <path>] [--sample <file>] [--output <path>]
                  [--pandoc <path>] [--dry-run] [--keep-artifacts] [--json]
mdtex convert <file.md> [--output <path>] [--format pdf|latex|docx]
               [--defaults <path>] [--pack <name>] [--folder <path>]
               [--pandoc <path>] [--dry-run] [--json]
mdtex doctor [--json]
```

`pack test` は `_mdtex.yaml` 分離修正（#1）後に実際の PDF 生成が通るようになる。
`convert` は plain Markdown 向け（L2）が実装済み。Obsidian 記法（WikiLink/transclusion）は L3 で対応予定。

---

## 8. 関連ドキュメント

- `CONTEXT.md` — 変換コンテキスト・用語
- `ARCHITECTURE.md` — プラグイン全体アーキテクチャ
- `docs/adr/` — ADR-007（builtin/defaults）/ ADR-008（テンプレートパック）/ ADR-009（citation）
- `src/assets/templateDocs/SKILL.md` — パック自作ガイド（`_mdtex:` の書き方・#1 修正後に更新）
- `src/assets/templateDocs/README.md` — パック使い方ガイド
