# M1-04 — LOCAL_STAGING

**passed:** true  
**recordedAt:** 2026-07-24T18:15:15.731Z

| Field | Value |
|-------|-------|
| requestId | `m1-04-req-e8c619e0-c9de-412a-bf33-a2221926d0f1` |
| confirmId | `m1-04-cfm-34ecd55b-caf1-4037-b12b-f259d1f3e995` |
| traceId | `m1-04-trc-ee186f1a-79d4-4b8b-90dd-cf7bd7ef5a0b` |
| hitInstances | prisma-A |
| dbLockObservation | OCC RESOURCE_VERSION_SET rejects stale expectedTripRevision |
| applyCount | 0 |
| planVersionCount | 0 |
| tripRevision | 1 → 2 |
| faultRecoveryResult | stale Confirm wrote nothing |

## Idempotency

```json
{
  "key": "m1-04-m1-04-cfm-34ecd55b-caf1-4037-b12b-f259d1f3e995",
  "value": null
}
```

## Client responses

```json
[
  {
    "outcome": "CONFLICT",
    "mustRePreview": true
  }
]
```

## Final DB state

```json
{
  "revision": 2,
  "idem": {}
}
```


