# M1-03 — LOCAL_STAGING

**passed:** true  
**recordedAt:** 2026-07-24T18:15:15.716Z

| Field | Value |
|-------|-------|
| requestId | `m1-03-req-8bff5a7f-30a2-4e72-9dcf-3fc47b0cf3ff` |
| confirmId | `m1-03-cfm-59414c7a-f4bf-4756-aa76-603c6a093cc9` |
| traceId | `m1-03-trc-7ce8128d-4577-4351-9fc8-120fd79242ff` |
| hitInstances | prisma-A, prisma-B |
| dbLockObservation | second attempt reads durable idem under FOR UPDATE |
| applyCount | 1 |
| planVersionCount | 0 |
| tripRevision | 1 → 2 |
| faultRecoveryResult | retry IDEMPOTENT_REPLAY; no second mutate |

## Idempotency

```json
{
  "key": "m1-03-m1-03-cfm-59414c7a-f4bf-4756-aa76-603c6a093cc9",
  "value": "APPLIED"
}
```

## Client responses

```json
[
  {
    "attempt": 1,
    "outcome": "APPLIED",
    "clientSaw": "timeout/lost"
  },
  {
    "attempt": 2,
    "outcome": "IDEMPOTENT_REPLAY"
  }
]
```

## Final DB state

```json
{
  "revision": 2,
  "idem": {
    "m1-03-m1-03-cfm-59414c7a-f4bf-4756-aa76-603c6a093cc9": "APPLIED"
  }
}
```


