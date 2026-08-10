# M1-06 — LOCAL_STAGING

**passed:** true  
**recordedAt:** 2026-07-24T18:15:15.777Z

| Field | Value |
|-------|-------|
| requestId | `m1-06-lb` |
| confirmId | `m1-06-lb` |
| traceId | `m1-06-lb` |
| hitInstances | local-a, local-b |
| dbLockObservation | n/a (LB distribution probe) |
| applyCount | 0 |
| planVersionCount | 0 |
| tripRevision | 0 → 0 |
| faultRecoveryResult | n/a |

## Idempotency

```json
{}
```

## Client responses

```json
[
  {
    "hitInstances": [
      "local-a",
      "local-b"
    ]
  }
]
```

## Final DB state

```json
{}
```

## Notes

Local Staging: Redis skipped (M1_LOCAL_SKIP_REDIS=1). Shared PG + dual PID + RR LB.

