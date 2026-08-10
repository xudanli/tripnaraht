# M1-05 — LOCAL_STAGING

**passed:** true  
**recordedAt:** 2026-07-24T18:15:15.750Z

| Field | Value |
|-------|-------|
| requestId | `m1-05-req-d22630c6-17d6-4685-9661-8dfd1d0a4879` |
| confirmId | `m1-05-cfm-a-2cc8b994-14c2-420f-b7ac-5ad78c5fd802|m1-05-cfm-b-135c3584-b817-4cb5-89c3-8c6ad985f0f3` |
| traceId | `m1-05-trc-84800300-7934-4176-80a9-552c0560d093` |
| hitInstances | prisma-A, prisma-B |
| dbLockObservation | FOR UPDATE + OCC → one APPLIED, one CONFLICT |
| applyCount | 1 |
| planVersionCount | 0 |
| tripRevision | 1 → 2 |
| faultRecoveryResult | single winner; DB consistent |

## Idempotency

```json
{
  "m1-05-m1-05-cfm-a-2cc8b994-14c2-420f-b7ac-5ad78c5fd802": "APPLIED"
}
```

## Client responses

```json
[
  {
    "confirmId": "m1-05-cfm-a-2cc8b994-14c2-420f-b7ac-5ad78c5fd802",
    "outcome": "APPLIED"
  },
  {
    "confirmId": "m1-05-cfm-b-135c3584-b817-4cb5-89c3-8c6ad985f0f3",
    "outcome": "CONFLICT"
  }
]
```

## Final DB state

```json
{
  "revision": 2,
  "idem": {
    "m1-05-m1-05-cfm-a-2cc8b994-14c2-420f-b7ac-5ad78c5fd802": "APPLIED"
  }
}
```


