# P0-1 — ERC Durable Idempotency

**Date:** 2026-07-24  
**Status:** **PASS**  
**Scope:** Execution Risk Center apply/confirm idempotency survives process restart / multi-instance

---

## Change

| Layer | Behavior |
|-------|----------|
| L1 | In-process `Map` (unchanged for tests / hot path) |
| L2 | `Trip.metadata.ercIdempotencyV1.keys[storeKey]` when `PrismaService` injected |
| Lock | `SELECT id FROM "Trip" … FOR UPDATE` on durable lookup/save |

Source: `src/trips/execution-risk-center/services/execution-risk-idempotency.store.ts`  
Wire-up: `ExecutionRiskApplyService` uses `lookupAsync` / `saveAsync` / `findApplyRecordAsync`

---

## Record shape

```json
{
  "ercIdempotencyV1": {
    "keys": {
      "confirm:tripId:riskId:recId:idemKey": {
        "bodyHash": "sha256…",
        "response": { "...": "cached DTO" },
        "createdAt": "ISO-8601"
      }
    }
  }
}
```

Prune: keep latest **100** keys per trip.

---

## Verification

```bash
npx jest \
  src/trips/execution-risk-center/services/execution-risk-idempotency.store.spec.ts \
  src/trips/execution-risk-center/services/execution-risk-apply.service.spec.ts \
  src/trips/confirm-apply-idempotency.matrix.spec.ts \
  --runInBand
# durable cross-instance + AC-012 + MX-ERC PASS
```

---

## Still OPEN

- Arrange multi-day auto-arrange → UWC slice  
- Staging multi-host Confirm with shared DB (optional)

PRODUCTION NO-GO remains on UWC corridor breadth — not on Arrange same-day ADD / single-day AUTO_ARRANGE (closed) or ERC process-local cache.
