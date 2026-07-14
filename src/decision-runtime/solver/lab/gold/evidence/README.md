# Staging / Real Evidence Packs

Gold scenarios with `provenance: staging_replay | real_ops` MUST reference an evidence pack.

| provenance | Meaning |
|------------|---------|
| `synthetic_template_v1` | Matrix/templates only — **does not** count toward M4 `real_gold_replay` |
| `staging_replay` | Curated replayable ops narrative + refs（可机判） |
| `real_ops` | Production/staging capture with immutable source refs |

M4 gate：`OR_TOOLS_REAL_GOLD_MIN`（默认 5）统计 active 且 provenance ∈ {staging_replay, real_ops}。
