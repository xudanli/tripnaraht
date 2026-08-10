# P2 RFC-001 Table Storage

> Status: Implemented (default **OFF**) · 2026-07-21  
> Scope: move EffectivePlanVersion / DecisionLedger / DecisionWorkspace out of `Trip.metadata` with dual-write, compatible reads, reconcile, and rollback.

## Master switch

| `P2_RFC001_TABLE_STORAGE` | Write | Read |
|---------------------------|-------|------|
| `OFF` (default) | metadata only | metadata |
| `DUAL_WRITE` | table + metadata | metadata (safe) |
| `TABLE_PRIMARY` | table + metadata | table → metadata fallback |
| `TABLE_ONLY` | table only | table only |

Ops: `GET /api/ops/runtime/rfc001-table-storage`

## Tables (migration `20260721170000_rfc001_formal_storage`)

| Domain | Tables |
|--------|--------|
| EffectivePlanVersion | `rfc001_plan_versions`, `rfc001_plan_snapshots`, `rfc001_plan_version_executions`, `rfc001_trip_effective_plan` |
| DecisionLedger | `rfc001_decision_records`, `rfc001_decision_runs`, `rfc001_decision_refs` |
| DecisionWorkspace | `rfc001_decision_workspaces` (short-lived staging) |

Access is raw SQL via repositories (no Prisma model regenerate required yet).

## Compatible metadata keys (still written until `TABLE_ONLY`)

- `rfc001PlanVersions` / `rfc001PlanSnapshots` / `rfc001PlanVersionExecutions`
- `rfc001DecisionLedger` / `rfc001DecisionRuns` / `rfc001DecisionRef`
- `rfc001DecisionWorkspaces`

## Rollout

1. Apply migration
2. `DUAL_WRITE` — new writes hit both; dual-write table failures are **fail-open**
3. `POST /api/ops/runtime/rfc001-storage/backfill` — metadata → tables
4. `GET /api/ops/runtime/rfc001-storage/reconcile` until drift = 0
5. `TABLE_PRIMARY` — read prefers tables
6. Soak → `TABLE_ONLY`
7. Rollback: set `OFF` or `DUAL_WRITE`; optional `POST .../sync` with `direction=table_to_metadata`

## Ops endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/ops/runtime/rfc001-table-storage` | Mode + rollout tips |
| GET | `/ops/runtime/trips/:tripId/rfc001-storage/reconcile` | Per-trip drift |
| GET | `/ops/runtime/rfc001-storage/reconcile?limit=` | Batch drift |
| POST | `/ops/runtime/trips/:tripId/rfc001-storage/sync` | `metadata_to_table` \| `table_to_metadata` |
| POST | `/ops/runtime/rfc001-storage/backfill?limit=` | Batch metadata → table |

## CLI

```bash
npx tsx scripts/backfill-rfc001-table-storage.ts --limit=50
npx tsx scripts/backfill-rfc001-table-storage.ts --trip-id=<id>
npx tsx scripts/backfill-rfc001-table-storage.ts --trip-id=<id> --direction=table_to_metadata
npx tsx scripts/backfill-rfc001-table-storage.ts --reconcile-only --limit=50
```

## Code map

- `src/decision-runtime/storage/p2-rfc001-table-storage.config.ts`
- `src/decision-runtime/storage/rfc001-*.table.ts`
- `src/decision-runtime/storage/rfc001-table-storage-reconcile.service.ts`
- `src/decision-runtime/storage/rfc001-table-storage-rollback.service.ts`
- `src/decision-runtime/storage/rfc001-table-storage.module.ts`
- Stores: `plan-version.store.ts`, `rfc001-decision-ledger.store.ts`, `decision-workspace.service.ts`

## Notes

- Formal write chain unchanged: Guard + Writer + EffectivePlanVersionStore.
- Iceland `pv_*` Applied PlanVersion remains a **separate** semantic kind — do not conflate with RFC-001 PlanVersion rows.
- Default stays `OFF` so local/test without migration keep working.
