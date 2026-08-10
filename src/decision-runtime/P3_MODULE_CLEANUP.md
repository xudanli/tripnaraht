# P3 Module Cleanup

> Status: Partial apply · 2026-07-21  
> Scope: orphan modules, unregistered crons, legacy DTO/type hygiene, naming map, job-queue decision.  
> Policy: **no large directory rename** of live decision trees (same as P0–P2).

## What we did

### 1. Orphans moved out of `src/` → `archives/p3-orphans/`

| Former path | Why | Live replacement |
|-------------|-----|------------------|
| `src/cron/` (`SyncWeatherCron`, `SyncRoadStatusCron`) | Never registered as Nest providers | Road: `EnvSyncWorkerService` / scripts; weather alerts: other world services (not the stub cron) |
| `src/skills/world/services/weather-sync.cron.ts` | `@Cron` present but **never** in SkillsModule providers | — |
| `src/tasks/` (`TasksModule`) | Commented out of `AppModule` | Currency MCP / admin FX |
| `src/trip-templates/` (`TripTemplatesModule`) | Commented out of `AppModule` | — |
| `src/trips/decision/models/physical-road-legacy.adapter.ts` | Zero importers | Canonical road models only |

### 2. Unregistered Cron removed from live tree

| Class | Action |
|-------|--------|
| `MatchLearningScheduler` | Stripped `@Cron` — `MatchLearningModule` is **not** in AppModule, cron never ran |
| `ApprovalCleanupScheduler` | Already had `@Cron` commented; docs cleaned |
| Archived `src/cron/*` | Moved out (see above) |

### 3. Legacy DTO / Type — deprecate, don’t mass-delete

Still live (compat / shadow / fallback). Catalogued below; delete only after P1 cutover soak.

| Item | Disposition |
|------|-------------|
| `CountriesAdminLegacyController` (`/countries/admin`) | **KEEP** compat; prefer `/admin/countries` |
| `legacy-v15-engine.adapter` / `LegacyFrozen*` | **KEEP** until Canonical soak; P1 already deprecates for *new* work |
| Mobile `getExecutionAlertsLegacy` / adjustment queue legacy | **KEEP** behind flag; prefer Execution Risk Center |
| Guide Legacy accept | **P0 LEGACY_CLOSED**; do not revive |
| Budget `totalBudget`/`total` dual-write | Off unless `BUDGET_DUAL_WRITE_LEGACY=1` |
| Iceland POI deprecated category aliases | Annotate only |
| `patch-driving-settings` vehicle alias DTO | Annotate only |

### 4. Directory / naming — map only (no mass move)

| Name | Path | Role |
|------|------|------|
| **DecisionRuntimeModule** | `src/decision-runtime/` | Gate1 ops, outbox, write-chain, P1/P2 storage, constraint gateway slices |
| **GuardianDecisionCoreModule** | `src/trips/guardian-decision-core/` | RFC-001 evaluate/finalize/PlanVersion |
| **DecisionModule** | `src/trips/decision/` | Trip-local decision OS / V1.5 surfaces |
| **DecisionKernelModule** | `src/agent` / kernel | Agent DSO + VERIFY loop |
| **DecisionGatewayModule** | `decision-runtime/gateway` | Engine registry + Canonical adapter |

Do **not** merge these folders in P3 — import cycles and product surface risk outweigh naming purity.

### 5. Job Queue decision: **Do not introduce Bull/BullMQ yet**

| Signal | As-Is |
|--------|-------|
| Queue lib in deps | None (no Bull/BullMQ) |
| Schedulers | In-process `@nestjs/schedule` |
| Durable async | `RuntimeEventOutbox` (+ optional Travel Event Store) |
| Sidecars | OR-Tools / Vedur / MCP — separate processes, not job workers |

**Introduce a real queue only when one of:**
1. API runs **multi-instance** and crons must be singleton-safe, or  
2. Jobs need **retry/backoff/DLQ** beyond outbox drain, or  
3. Workload exceeds in-process cron SLAs (backlog metrics).

Until then: keep ScheduleModule + outbox; document cron ownership in write-entry / ops.

## Still App-orphan Nest modules (kept in `src/` on purpose)

| Module | Why keep |
|--------|----------|
| `CgusReplayModule` / `HarnessEvalCliModule` / `SkillEvolverCliModule` | CLI / NestFactory scripts |
| `SemanticValidationModule` | Test harness entry |
| `AttentionShadowStagingReplayModule` | Staging replay bootstrap |
| `MatchSquareModule` / `MatchLearningModule` | Engines/types used by Odyssey; Nest module itself unwired — **do not delete trees** |
| `ToTEvaluatorModule` / `ReasoningModule` | Library modules; services optionally injected |

Re-wire MatchSquare/MatchLearning only via explicit product decision + AppModule import.

## Ops / verify

```bash
# Ensure archived paths are gone from src
test ! -d src/cron && test ! -d src/tasks && test ! -d src/trip-templates
test ! -f src/skills/world/services/weather-sync.cron.ts

# Live road cron still registered
rg -n "EnvSyncWorkerService" src --glob '*.module.ts'
```

## Code map

- `archives/p3-orphans/README.md`
- `src/decision-runtime/P3_MODULE_CLEANUP.md` (this file)
- `src/match-learning/match-learning.scheduler.ts`
- `src/app.module.ts` (orphan comments cleaned)
