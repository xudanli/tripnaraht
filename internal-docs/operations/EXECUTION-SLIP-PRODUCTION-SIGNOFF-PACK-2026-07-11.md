# Execution Slip Production Sign-off Pack

**Prepared:** 2026-07-11  
**Slice:** 3 — Execution Deviation Canonical Closure  
**Status:** Engineering Feature Complete / Integration & Operational Sign-off **PENDING**

> Do **not** label this slice as “Slice 3 Complete”. Use the formal status lines below.

---

## Formal Status Names (SSOT)

| Status line | Value |
|-------------|-------|
| **Slice 3 Canonical Runtime Engineering Closure** | **PASS** |
| **Slice 3 Integration Closure** | **PENDING** — Backend PASS; Native E2E pending |
| **Slice 3 End-to-End Product Integration Closure** | **PENDING** |
| **Slice 3 Operational Closure** | **PENDING** |
| Execution Slip Runtime Closure | **PASS** |
| Execution Slip Harness | **PASS** — 14/14 |
| Execution Slip W-01 Authority | **PASS** |
| Execution Slip Revalidation | **PASS** |
| **Execution Slip Canary Trip Seed** | **PASS** — 2026-07-11 |
| **Staging HTTP A/B/C** | **PASS** — 2026-07-11 |
| **Staging Rollback** | **PASS** — 2026-07-11 |
| Native E2E | **PENDING** — see [Native E2E execution order](./EXECUTION-SLIP-SLICE-3-NATIVE-E2E-AND-SIGNOFF-2026-07-11.md) |
| Shadow Observation | **PASS** — staging evidence 2026-07-11 |
| DB Replay Evidence | **PASS** — Replay A–E 5/5 |
| **Backend Integration Closure** | **PASS** |
| Operational Sign-off | **PENDING** |
| **Slice 3 Production Canary GO** | **NOT YET ELIGIBLE** |

---

## Sprint 4 Definition

**Slice 3 Integration, Observation & Sign-off**

Not new Runtime features. Prove the chain works in real environment:

1. Independent Execution Slip Canary Trip  
2. Staging HTTP A/B/C + rollback  
3. Native minimal UI (“我晚了” + Canonical Decision Card)  
4. Shadow counters (`EXECUTION_SCHEDULE_INFEASIBLE`)  
5. DB Replay A–E  
6. Owner sign-off → **Slice 3 CLOSED**

---

## Feature Flag

| Env | Purpose |
|-----|---------|
| `CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE=1` | Enable departure-slip + canonical pipeline |
| Alias: `RFC001_EXECUTION_SLIP=1` | Legacy alias |

**Do not enable globally until Integration + Ops sign-off.**

---

## Independent Canary Trip (S4-1)

| Field | Value |
|-------|-------|
| Trip ID | `c0c77777-7777-4777-8777-777777777777` |
| User ID | `c0c77777-7777-4777-8777-777777777701` |
| Activity A | `c0c77777-7777-4777-8777-777777777631` — plannedDepart 13:00 |
| Activity B | `c0c77777-7777-4777-8777-777777777632` — lastEntryAt 16:00 |
| Substitute C | `c0c77777-7777-4777-8777-777777777633` |
| Initial Effective PlanVersion | `plan_1` (matches `metadata.revision=1`) |

**Setup / rollback:**

```bash
EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-pre-signoff-setup.ts --reset
EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-pre-signoff-rollback.ts
```

Evidence: `internal-docs/operations/evidence/execution-slip-canary-setup-2026-07-11.json`

---

## Staging A/B/C (S4-2)

Run **one phase at a time** (server must have `CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE=1`, `RFC001_ICELAND_ROAD_CLOSE=1`, `EFFECTIVE_PLAN_WRITE_CHAIN=1`):

```bash
EXEC_SLIP_DRILL_ALLOW_PROD=1 BASE_URL=http://localhost:3001 \
  npx tsx scripts/prod-canary-execution-slip-staging-abc.ts --phase=A
EXEC_SLIP_DRILL_ALLOW_PROD=1 BASE_URL=http://localhost:3001 \
  npx tsx scripts/prod-canary-execution-slip-staging-abc.ts --phase=B
EXEC_SLIP_DRILL_ALLOW_PROD=1 BASE_URL=http://localhost:3001 \
  npx tsx scripts/prod-canary-execution-slip-staging-abc.ts --phase=C
EXEC_SLIP_DRILL_ALLOW_PROD=1 BASE_URL=http://localhost:3001 \
  npx tsx scripts/prod-canary-execution-slip-staging-abc.ts --phase=SHADOW
EXEC_SLIP_DRILL_ALLOW_PROD=1 BASE_URL=http://localhost:3001 \
  npx tsx scripts/prod-canary-execution-slip-staging-abc.ts --phase=ROLLBACK
```

| Evidence file | Phase |
|---------------|-------|
| `execution-slip-staging-a-2026-07-11.json` | Observe |
| `execution-slip-staging-b-2026-07-11.json` | Suggest |
| `execution-slip-staging-c-2026-07-11.json` | Execute |
| `execution-slip-staging-shadow-2026-07-11.json` | Shadow |
| `execution-slip-staging-rollback-2026-07-11.json` | Rollback |

| Phase | Verify |
|-------|--------|
| **A Observation** | POST departure-slip; observation persist; evidence; WS assertion; idempotent; **no PlanVersion** |
| **B Evaluate** | FEASIBILITY_FAILURE + EXECUTION_SCHEDULE_INFEASIBLE; 3 candidates; infeasible shorten filtered; no write before confirm |
| **C Execute** | W-01 only; new PlanVersion; revalidation → RESOLVED; idempotent execute |
| **D Rollback** | Effective plan; open problems; allowlist; canary state |

---

## DB Replay (S4-6)

```bash
npx tsx scripts/execution-slip-replay-scenarios.ts
```

| Replay | Expected |
|--------|----------|
| A slight delay | STILL_FEASIBLE / NO problem / NO write |
| B window miss | Problem OPEN / 3 candidates |
| C shorten feasible | Candidate accepted |
| D shorten infeasible | Candidate rejected |
| E no lastEntryAt | UNKNOWN / no hard infeasibility / no write |

---

## Shadow Metrics (S4-5)

`GET /api/trips/:tripId/execution/shadow-metrics`

| Metric | Meaning |
|--------|---------|
| triggerCount | departure-slip received |
| problemCreatedCount | canonical problems opened |
| noActionCount | still feasible → silent |
| duplicateProblemCount | duplicate open cards |
| candidateCount | repair candidates emitted |
| rejectedCandidateCount | infeasible shorten filtered |
| writeCount | W-01 executes |
| legacyWriteCount | **must stay 0** |
| revalidationPassCount | post-apply resolved |
| unresolvedAfterApplyCount | apply but still infeasible |
| idempotentReplayCount | duplicate observation keys |

---

## Engineering Evidence (PASS)

| Artifact | Path |
|----------|------|
| Harness 14/14 | `src/trips/guardian-decision-core/e2e/execution-slip-last-entry.harness.spec.ts` |
| Assessor unit tests | `src/trips/guardian-decision-core/assessment/execution-slip-assessor.util.spec.ts` |
| Frontend handoff | `src/trips/guardian-decision-core/EXECUTION_SLIP_FRONTEND_HANDOFF.md` |
| API | `POST /api/trips/:tripId/execution/departure-slip` |

---

## Weather / Road Non-Touch Proof

Until Slice 3 CLOSED:

- **No changes** to Vedur/Gagnaveita collectors  
- **No changes** to road traversability / Repair templates  
- **No changes** to Weather/Road canary trips or allowlists  

Execution Slip uses **independent** canary trip `c0c77777-…`.

---

## Slice 3 CLOSED — Gate Checklist

### Engineering ✅
- [x] Runtime PASS  
- [x] Harness PASS  
- [x] TypeScript 0 errors (slice files)  
- [x] W-01 PASS  
- [x] Revalidation PASS  

### Integration ⬜
- [ ] Native “我晚了”  
- [ ] Canonical Decision Card  
- [ ] Staging A/B/C PASS  
- [ ] Independent canary trip seeded on staging/prod drill DB  
- [ ] Rollback PASS  

### Observation ⬜
- [ ] Shadow wired + evidence captured  
- [ ] Duplicate problems = 0 or all adjudicated  
- [ ] legacyWriteCount = 0  
- [ ] NO_ACTION correct on feasible scenario  
- [ ] UNKNOWN does not false-positive infeasibility  

### Operations ⬜
- [ ] Replay PASS on staging DB  
- [ ] This pack completed with commit SHA  
- [ ] Owner signatures  
- [ ] Feature flag + allowlist documented  
- [ ] Rollback command verified  

---

## GO / NO-GO

**Production Canary GO** requires all Integration + Observation + Operations boxes checked + Native E2E evidence archived.

**After Slice 3 CLOSED**, begin Slice 4 **Internal Dual-Read** (not Primary SSO). See [EXECUTION-SLIP-SLICE-3-NATIVE-E2E-AND-SIGNOFF-2026-07-11.md](./EXECUTION-SLIP-SLICE-3-NATIVE-E2E-AND-SIGNOFF-2026-07-11.md) and [ADR-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md](../architecture/ADR-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md).

---

## Owner Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Execution Engineering Owner | | | |
| Ops / Observer Owner | | | |
| Product / Release Owner | | | |

**Commit SHA at sign-off:** __________________
