# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-models.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

This repo is **single-context**: one `CONTEXT.md` and `docs/adr/` at the repo root.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

## このリポジトリの現状

`CONTEXT.md` / `docs/adr/` はまだ存在しない（生成は `grill-with-docs` が用語確定時に遅延生成）。

生成前は、以下の既存ドキュメントをドメイン情報源として参照すること:

- **`ARCHITECTURE.md`**：コンポーネント構成、データフロー、設計原則
- **`docs/design-decisions.md`**：ADR 形式の主要決定（ADR-001 外部ツール採用 / ADR-002 TypeScript / ADR-003 esbuild / ADR-004 Vitest）
- **各ソースファイル先頭の `// Purpose / Reason / Related` コメント**：小粒な設計判断。領域を探る際は該当ファイルのヘッダーコメントを必ず読む。

`docs/design-decisions.md` は正式な `docs/adr/` ではないが、同様の役割を果たすため、判断衝突の確認時はこれを ADR 群として扱うこと。
