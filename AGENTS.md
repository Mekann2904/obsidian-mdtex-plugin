# Agents

このリポジトリで動作するコーディングエージェント向けの指示ファイル。
 engineering skills（`triage`, `to-issues`, `to-prd`, `diagnose`, `tdd`, `improve-codebase-architecture`, `grill-with-docs` 等）が読む設定は以下のブロックと `docs/agents/` 配下の詳細ドキュメントを参照。

## Agent skills

### Issue tracker

GitHub Issues（`gh` CLI 使用）。詳細は `docs/agents/issue-tracker.md`。

### Triage labels

正規ロール名をそのまま使用（`bug`/`enhancement`/`needs-triage`/`needs-info`/`ready-for-agent`/`ready-for-human`/`wontfix`）。詳細は `docs/agents/triage-labels.md`。

### Domain docs

シングルコンテキスト（`CONTEXT.md` + `docs/adr/`）。詳細は `docs/agents/domain.md`。
