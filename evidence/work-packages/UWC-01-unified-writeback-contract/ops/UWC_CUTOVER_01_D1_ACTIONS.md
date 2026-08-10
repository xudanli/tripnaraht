# UWC-CUTOVER-01 / D1 — ACTIONS_COMMIT → AUTHORITATIVE

**Decision ID:** D1  
**Corridor:** ACTIONS_COMMIT only  
**Status:** **APPROVED** — implemented 2026-07-24  

## Decision

**APPROVE** — promote ACTIONS_COMMIT to corridor-local AUTHORITATIVE without global OCC unlock.

## Implemented

| Item | Value |
|------|--------|
| `UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED.ACTIONS_COMMIT` | `true` |
| ITINERARY / UNIFIED corridor auth | `false` |
| `UWC_1C_OCC_UNLOCKED` | `false` |
| Compensation exec | `false` |
| Contract | `uwc-cutover-01-d1.contract.spec.ts` |

Ops env to exercise gateway AUTHORITATIVE path (optional):

```bash
UWC_CORRIDOR_MODE_ACTIONS_COMMIT=AUTHORITATIVE
```

HTTP Actions commit canary XOR path remains available independently.

## Sign-off

| Role | Date | Decision |
|------|------|----------|
| Ops | 2026-07-24 | **确认 / APPROVE** |
| Implement | 2026-07-24 | landed |
