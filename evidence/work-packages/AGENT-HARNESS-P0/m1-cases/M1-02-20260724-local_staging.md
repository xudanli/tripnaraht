# M1-02 — LOCAL_STAGING

**passed:** true  
**recordedAt:** 2026-07-24T18:15:15.696Z

| Field | Value |
|-------|-------|
| requestId | `m1-02-req-bacbe4f3-b44c-4ae1-923a-27fb4b4e6af0` |
| confirmId | `m1-02-cfm-4313f7d6-7530-476e-90f2-3c4824d00a22` |
| traceId | `m1-02-trc-251627f8-2602-4f21-8b76-f4a148a6fe13` |
| hitInstances | prisma-A-crash, prisma-B-retry |
| dbLockObservation | lock taken then txn abort via M1_CRASH_AFTER_LOCK; retry commits |
| applyCount | 1 |
| planVersionCount | 0 |
| tripRevision | 1 → 2 |
| faultRecoveryResult | abort left zero durable write; retry APPLIED once |

## Idempotency

```json
{
  "key": "m1-02-m1-02-cfm-4313f7d6-7530-476e-90f2-3c4824d00a22",
  "value": "APPLIED"
}
```

## Client responses

```json
[
  {
    "instance": "A",
    "error": "M1_CRASH_AFTER_LOCK"
  },
  {
    "instance": "B",
    "outcome": "APPLIED"
  }
]
```

## Final DB state

```json
{
  "midRevision": 1,
  "after": {
    "revision": 2,
    "idem": {
      "m1-02-m1-02-cfm-4313f7d6-7530-476e-90f2-3c4824d00a22": "APPLIED"
    }
  }
}
```

## Notes

Rehearsal uses throw-abort; Staging kill uses process terminate after lock

