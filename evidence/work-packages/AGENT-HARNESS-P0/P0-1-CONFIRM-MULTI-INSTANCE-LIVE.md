# P0-1 — Confirm Multi-Instance Live Proof

**Date:** 2026-07-24  
**Status:** **PASS** (embedded PostgreSQL live + fidelity) — **does not** satisfy **M1** Staging canary  
**Companion:** `P0-1-CONFIRM-IDEMPOTENCY.md` · [`M1-STAGING-MULTI-INSTANCE-CANARY.md`](./M1-STAGING-MULTI-INSTANCE-CANARY.md) · [`P0-1-STATUS.md`](./P0-1-STATUS.md)

---

## Claim

> Same Confirm/Apply `idempotencyKey` across **two PrismaClient instances** (process-boundary stand-ins for multi-instance) yields **≤1 durable mutation**; second outcome is `IDEMPOTENT_REPLAY` (or `CONFLICT`); idempotency is durable in `Trip.metadata.uwcItineraryCanaryIdem`.

---

## Hardening required for the claim

ITINERARY / UNIFIED canary transactions now take:

```sql
SELECT id FROM "Trip" WHERE id = $1 FOR UPDATE
```

before OCC + write (unit mocks without `$queryRaw` no-op).

---

## Results

| ID | Kind | Assert | Result |
|----|------|--------|--------|
| FID-SEQ | Dual logical instances + mutex | A APPLIED → B IDEMPOTENT_REPLAY; 1 Item write | **PASS** |
| FID-CONC | Concurrent dual clients | ≤1 APPLIED under FOR UPDATE mutex | **PASS** |
| LIVE-SEQ | Dual PrismaClient + embedded PG | Cross-client durable idem replay | **PASS** |
| LIVE-CONC | Dual PrismaClient concurrent + embedded PG | ≤1 APPLIED; durable idem | **PASS** |

```bash
# Always-on fidelity (no DB)
npm run test:confirm-multi-instance-fidelity

# Live PG via embedded cluster (does not use .env tripnara_prod)
npx tsx scripts/run-confirm-multi-instance-live-embedded.ts

# Or against staging/local:
CONFIRM_MULTI_INSTANCE_LIVE=1 \
CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL='postgresql://…/non_prod' \
  npm run test:confirm-multi-instance-live
```

**Note:** Default `.env` `DATABASE_URL` points at `tripnara_prod` — live suite **refuses** that URL. Embedded runner supplies an ephemeral local cluster.

---

## Still OPEN (narrow)

| Path | Gap |
|------|-----|
| ERC confirm cache | **CLOSED** — durable `ercIdempotencyV1` (see `P0-1-ERC-DURABLE-IDEMPOTENCY.md`) |
| Arrange ADD → AE | **CLOSED** — same-day ADD UWC slice (`P0-1-ARRANGE-ADD-UWC-SLICE.md`) |
| Staging-shared multi-host | **M1 OPEN** — embedded ≠ LB+shared PG/Redis (`M1-STAGING-MULTI-INSTANCE-CANARY.md`) |

---

## Verdict

Confirm **multi-instance durability on UWC ITINERARY Apply** is proven (live + fidelity).  
Full-product PRODUCTION READY still **NO-GO** until ERC store / Arrange ADD / corridor breadth are addressed separately.
