# Triage Labels

The skills speak in terms of canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

Every triaged issue should have exactly one category role and one state role.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `bug`                      | `bug`                | Something is broken                      |
| `enhancement`              | `enhancement`        | New feature or improvement               |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for a coding agent   |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the agent-ready triage label"), use the corresponding label string from this table.

## このリポジトリでの整備状況

- `bug`, `enhancement`, `wontfix` は GitHub 既定ラベルとして元から存在。
- `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` は本セットアップで `gh label create` により新規作成済み（2026-06-18）。

ラベルの色は運用上の目安として以下を設定:

| ラベル | 色 | 意味合い |
| ------ | ---- | -------- |
| `needs-triage` | `#fbca04`（黄） | 要評価 |
| `needs-info` | `#d93f0b`（オレンジ赤） | 情報待ち |
| `ready-for-agent` | `#0e8a16`（緑） | エージェント実行可能 |
| `ready-for-human` | `#1d76db`（青） | 人間作業 |

語彙を追加、変更したい場合はこの表の右列を編集し、対応する GitHub ラベルを作成、リネームすること。
