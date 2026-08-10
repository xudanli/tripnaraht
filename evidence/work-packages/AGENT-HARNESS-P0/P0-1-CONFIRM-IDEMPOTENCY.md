# P0-1 / P1 — Confirm Idempotency Proof

**Date:** 2026-07-25 (multi-day AUTO_ARRANGE)  
**Status:** **CORRIDOR MATRIX PASS (15/15)** · embedded **MULTI-INSTANCE LIVE PASS** · track status → [`P0-1-STATUS.md`](./P0-1-STATUS.md)  
**Companion:** `P0-1-W4-LEGACY-ZEROING-REPORT.md` · `P0-1-CONFIRM-MULTI-INSTANCE-LIVE.md` · `P0-1-ARRANGE-ADD-UWC-SLICE.md` · `P0-1-AUTO-ARRANGE-UWC-SLICE.md` · `P0-1-ARRANGE-REMOVE-UWC-SLICE.md` · `P0-1-ARRANGE-REORDER-UWC-SLICE.md` · `P0-1-ARRANGE-MOVE-ADD-UWC-SLICE.md` · `P0-1-ARRANGE-REDUCE-INTENSITY-UWC-SLICE.md` · **M1** · **M2** · **ADR-011**
**Matrix spec:** `src/trips/confirm-apply-idempotency.matrix.spec.ts`  
**Live / fidelity:** `confirm-multi-instance*.{spec,e2e.spec,harness}.ts`

---

## Claim under proof

> One user Confirm / Apply (same `idempotencyKey` or sealed confirmation token) maps to **at most one** durable Active Plan / PlanVersion mutation on the authoritative path — including across process boundaries (dual PrismaClient / FOR UPDATE).

---

## Matrix results (unit, no live DB)

| ID | Surface | Assert | Result |
|----|---------|--------|--------|
| MX-UWC-ITINERARY | Canary Apply×2 | `APPLIED`→`IDEMPOTENT_REPLAY`; one Item write | **PASS** |
| MX-UWC-ITINERARY-FAST | priorIdempotencyApplied | replay without Item write | **PASS** |
| MX-UWC-1E | Forged confirmationId | `CONFIRMATION_MISMATCH` | **PASS** |
| MX-ERC | Confirm×2 | `idempotentReplay`; stable PlanVersion | **PASS** |
| MX-DECISIONCORE | VERIFIED apply | `idempotent_replay`; no execute | **PASS** |
| MX-ARRANGE-LEGACY-APPLY | Arrange HTTP apply | `CHAIN_REQUIRED`; no txn | **PASS** |
| MX-ARRANGE-PREVIEW-NOWRITE | `uwcPreview` projection | never mutates Items | **PASS** |
| MX-ARRANGE-HINT→CANARY | open same-day MOVE hint → canary Apply×2 | hint maps to existing UWC; replay OK | **PASS** |
| MX-ARRANGE-HINT→ADD | open same-day ADD hint → canary Apply×2 | create once; replay OK | **PASS** |
| MX-ARRANGE-HINT→AUTO_ARRANGE | open from-candidates hint → canary Apply×2 | create+candidate delete once; replay OK | **PASS** |
| MX-ARRANGE-HINT→REMOVE | open same-day REMOVE hint → canary Apply×2 | delete once; replay OK | **PASS** |
| MX-ARRANGE-HINT→REORDER | open same-day REORDER hint → canary Apply×2 | order once; replay OK | **PASS** |
| MX-ARRANGE-HINT→MOVE_ADD | open MOVE+ADD hint → canary Apply×2 | update+create once; atomic; replay OK | **PASS** |
| MX-ARRANGE-HINT→REDUCE_INTENSITY | open REST+MOVE hint → canary Apply×2 | update+REST create once; atomic; replay OK | **PASS** |
| MX-ARRANGE-HINT→MULTI_DAY_AUTO_ARRANGE | open ≥2-day from-candidates → Apply×2 | create+delete once across days; atomic | **PASS** |

```bash
npx jest src/trips/confirm-apply-idempotency.matrix.spec.ts --runInBand
# 15 passed
```

---

## Multi-instance (2026-07-24)

| ID | Assert | Result |
|----|--------|--------|
| FID-SEQ / FID-CONC | Dual logical instances + FOR UPDATE mutex | **PASS** |
| LIVE-SEQ / LIVE-CONC | Dual PrismaClient + embedded PostgreSQL | **PASS** |

Evidence: `P0-1-CONFIRM-MULTI-INSTANCE-LIVE.md`  
Canary hardening: Trip `SELECT … FOR UPDATE` in ITINERARY / UNIFIED executors.

---

## Arrange Confirm → AE (clarified)

**There is no server-side Arrange → DecisionCore AE adapter.**

| Path | Behavior under write chain ON |
|------|-------------------------------|
| `POST …/proposals/:id/apply` | Blocked (`plan-proposal.apply`) |
| `uwcPreview` on proposal | Read-only hint; **no write** |
| When `uwcPreview.open` (same-day MOVE / ADD / from-candidates / unified) | Client must call existing UWC Preview→Confirm→Apply |
| When `uwcPreview.open=false` | Legacy apply fails CHAIN_REQUIRED — no silent write |

---

## Still OPEN (blocks Production Ready)

| Path | Gap |
|------|-----|
| Arrange multi-day auto-arrange / REMOVE / REORDER / MOVE+ADD → AE | **M2 OPEN** — [`M2-ARRANGE-CORRIDOR-BREADTH.md`](./M2-ARRANGE-CORRIDOR-BREADTH.md) |
| Arrange → DecisionCore AE HTTP | Not implemented; boundary in **ADR-011** |
| ERC confirm multi-instance durability | **CLOSED** — `Trip.metadata.ercIdempotencyV1` + FOR UPDATE (`P0-1-ERC-DURABLE-IDEMPOTENCY.md`) |
| Arrange same-day ADD → UWC | **CLOSED** — `itinerary_same_day_add_item` (`P0-1-ARRANGE-ADD-UWC-SLICE.md`) |
| Arrange single-day AUTO_ARRANGE → UWC | **CLOSED** — `itinerary_same_day_add_from_candidates` (`P0-1-AUTO-ARRANGE-UWC-SLICE.md`) |
| Staging multi-host Confirm (LB + shared PG/Redis) | **M1 OPEN** — [`M1-STAGING-MULTI-INSTANCE-CANARY.md`](./M1-STAGING-MULTI-INSTANCE-CANARY.md) |

---

## Exit criteria progress

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Matrix for authorized Confirm/Apply | **PASS** |
| 2 | One mutation / zero on replay | **PASS** |
| 3 | Forged confirmation rejected | **PASS** |
| 4 | Multi-instance / concurrent Confirm | **PASS** (UWC ITINERARY live + fidelity) |
| 5 | Evidence stored | **PASS** |
| — | Full-product / Arrange breadth + Staging canary | **OPEN** → PRODUCTION NO-GO (`P0-1-STATUS.md`) |

---

## Explicit non-goals

- Do not expand client auto-undo / external compensation without explicit authorization  
- Do not expand UWC slices  
- Do not re-enable legacy Arrange apply under write chain  
- Do not invent Arrange→DecisionCore server adapter in this note  
- Do not write live proofs against `tripnara_prod`
