# M1 — Staging Multi-Instance Production Canary Certification

**Date opened:** 2026-07-25  
**Status:** **IN_PROGRESS** — **local multi-instance topology allowed** as Staging; remote cloud optional  
**Exit label on PASS:** first-batch approved corridors → **PRODUCTION CANARY READY**  
**Product after PASS:** still **PRODUCTION NO-GO**  
**Parent:** [`P0-1-STATUS.md`](./P0-1-STATUS.md)  

**Does not satisfy M1:** single-process dual `PrismaClient` only (`m1:rehearsal-embedded`) — must be **≥2 OS processes** + shared PG + shared Redis + LB.

---

## Progress (2026-07-25)

| Workstream | Status |
|------------|--------|
| Preflight script | `npm run m1:preflight` |
| Apply-layer case runners M1-01…05 | `m1-staging-canary.harness.ts` |
| Embedded REHEARSAL (not M1 PASS) | `npm run m1:rehearsal-embedded` |
| **Local Staging topology** | `npm run m1:local-staging` → **PASS** (Apply+LB; Redis optional skip) |
| Crash-after-lock inject | `UWC_M1_CRASH_AFTER_LOCK` + key |
| `X-App-Instance-Id` header | `APP_INSTANCE_ID` / hostname |
| Redis-backed UWC Confirm sessions | **LANDED (opt-in)** — prefer on for full HTTP Confirm share |

### Local PASS note (2026-07-25)

`npm run m1:local-staging` green: M1-01…06 with embedded PG + dual PID + RR LB.  
`M1_LOCAL_SKIP_REDIS=1` → **CONDITIONAL** canary (Apply/OCC/LB proven; cross-instance Confirm draft share still wants Redis).

---

## Goal

Prove Confirm/Apply for **first-batch same-day Arrange + UWC corridors** under multi-instance Staging (**local host OK**):

> Concurrent Confirms across ≥2 app instances behind a load balancer, sharing **one** PostgreSQL and **one** Redis, produce **at most one** durable Apply and **one** PlanVersion (or trip revision equivalent for ITINERARY canary), including crash and retry cases.

---

## Staging topology (required)

Same host is allowed. “Remote cloud Staging” is optional, not mandatory.

| # | Requirement | Local OK? |
|---|-------------|-----------|
| 1 | ≥ **2** independent Application **processes** | Yes — two Nest/node PIDs |
| 2 | Shared **PostgreSQL** (one DB, both instances) | Yes — Docker / local PG / embedded PG **shared by both** |
| 3 | Shared **Redis** | Yes — local Redis or `redis-memory-server` |
| 4 | **Load Balancer** distributes Confirm | Yes — nginx/caddy **or** Node RR proxy |
| 5 | Same Confirm concurrent hits **different** instances | Yes — sticky off |

| Mode | Counts as M1 PASS? |
|------|-------------------|
| `M1_TOPOLOGY=local` with rows 1–5 | **Yes** → PRODUCTION CANARY READY |
| Cloud Staging with rows 1–5 | **Yes** |
| Dual PrismaClient in one process / REHEARSAL | **No** |

Refuses: `.env` `tripnara_prod` direct proofs.

---

## Case matrix (must all PASS)

Each case submits the **evidence packet** in §Evidence packet.

| ID | Scenario | Pass criteria (summary) |
|----|----------|-------------------------|
| M1-01 | Concurrent Confirm → different instances | ≤1 Apply; second `IDEMPOTENT_REPLAY` or equivalent |
| M1-02 | Instance killed **after lock, before commit** | Surviving instance or retry → exactly one commit; no split-brain |
| M1-03 | Apply succeeded; client got **no response**; client retries Confirm | Replay; **no** second mutation |
| M1-04 | Preview then **PlanVersion / revision already changed** | `CONFLICT` / must re-Preview; zero write on stale Confirm |
| M1-05 | Two Confirms mutate **same ItineraryItem** concurrently | One winner Apply; loser CONFLICT or replay; DB consistent |
| M1-06 | (extends 1) LB sticky off — Confirms alternate instances | Same as M1-01 across instance ids |

Minimum coverage mapping to product ask:

| Ask | Case |
|-----|------|
| 5–6 concurrent Confirm / one Apply / one PlanVersion | M1-01, M1-06 |
| 7 kill after lock before commit | M1-02 |
| 8 Apply OK, client miss, repeat Confirm | M1-03 |
| 9 Preview then PlanVersion changed | M1-04 |
| 10 two Confirms same ItineraryItem | M1-05 |

---

## Corridors in scope (canary allowlist only)

| Slice | In M1? |
|-------|--------|
| `itinerary_same_day_time_adjust` | **Yes** |
| `itinerary_same_day_add_item` | **Yes** |
| `itinerary_same_day_add_from_candidates` | **Yes** |
| `actions_commit` / `unified_plan_version_only` | Optional companion |
| Multi-day / REMOVE / REORDER / MOVE+ADD | **Out** — M2 |

Trip allowlist + canary % must stay narrow. **No production user expansion** until this doc is PASS.

---

## Evidence packet (per case)

Every case record **must** include:

| Field | Notes |
|-------|-------|
| `requestId` / `confirmId` (confirmationId) | Sealed Confirm handle |
| `traceId` | Distributed trace |
| Hit instance id(s) | From LB / instance metadata header |
| DB lock observation | e.g. `pg_locks` / `FOR UPDATE` wait / advisory |
| Idempotency record | `Trip.metadata.uwcItineraryCanaryIdem` and/or PlanVersion idem key |
| Apply count | Durable mutations observed |
| PlanVersion count | Or trip `revision` delta for ITINERARY-only |
| Final DB state | Item times / creates / candidate rows |
| Client response | Outcomes per attempt |
| Fault recovery result | For kill / timeout cases |

Store under:  
`evidence/work-packages/AGENT-HARNESS-P0/m1-cases/<CASE_ID>-<YYYYMMDD>.md`  
(or linked Staging runbook artifact with same fields).

---

## Exit criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Topology 1–4 verified | OPEN |
| 2 | Cases M1-01…M1-06 PASS with full packets | OPEN |
| 3 | No silent double Apply under kill/retry | OPEN |
| 4 | Stale Preview cannot Apply (M1-04) | OPEN |
| 5 | Evidence reviewed + this doc → **PASS** | OPEN |

On PASS:

- Mark first-batch same-day corridors **PRODUCTION CANARY READY**
- Keep full product **PRODUCTION NO-GO**
- Still forbid claiming full auto-arrange (M2 incomplete)

---

## Non-goals

- Expanding corridor ops (REMOVE / multi-day / composite)
- Iceland / Mobile writeback
- Unlocking `corridorAuthoritativeExpansion`
- Replacing DecisionCore for risk/tradeoff decisions (see ADR-011)
