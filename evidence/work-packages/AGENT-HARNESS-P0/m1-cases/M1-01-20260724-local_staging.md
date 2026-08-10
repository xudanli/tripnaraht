# M1-01 — LOCAL_STAGING

**passed:** true  
**recordedAt:** 2026-07-24T18:15:15.674Z

| Field | Value |
|-------|-------|
| requestId | `m1-01-req-a7edfc33-aeaa-4ec7-a105-f34b836dab20` |
| confirmId | `m1-01-cfm-fe1cc95f-951b-4a7f-af54-70488fe4aa1e` |
| traceId | `m1-01-trc-6abfabe2-0467-4ae7-9a32-4649c1cd7a47` |
| hitInstances | local-a, local-b |
| dbLockObservation | Trip FOR UPDATE serialize concurrent Apply |
| applyCount | 1 |
| planVersionCount | 0 |
| tripRevision | 1 → 2 |
| faultRecoveryResult | n/a |

## Idempotency

```json
{
  "key": "m1-01-m1-01-cfm-fe1cc95f-951b-4a7f-af54-70488fe4aa1e",
  "value": "APPLIED"
}
```

## Client responses

```json
[
  {
    "instance": "local-a",
    "outcome": "APPLIED"
  },
  {
    "instance": "local-b",
    "outcome": "IDEMPOTENT_REPLAY"
  }
]
```

## Final DB state

```json
{
  "revision": 2,
  "idem": {
    "m1-01-m1-01-cfm-fe1cc95f-951b-4a7f-af54-70488fe4aa1e": "APPLIED"
  }
}
```

## Notes

Apply-layer dual Prisma; HTTP LB instance ids require Staging topology

