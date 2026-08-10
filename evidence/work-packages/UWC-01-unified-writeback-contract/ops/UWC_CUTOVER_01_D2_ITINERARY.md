# UWC-CUTOVER-01 / D2 — ITINERARY_ADJUST → AUTHORITATIVE

**Decision ID:** D2  
**Corridor:** ITINERARY_ADJUST only  
**Status:** **APPROVED** — implemented 2026-07-24  

## Decision

**APPROVE** — promote ITINERARY_ADJUST to corridor-local AUTHORITATIVE without global OCC unlock.

## Implemented

| Item | Value |
|------|--------|
| `UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED.ITINERARY_ADJUST` | `true` |
| UNIFIED corridor auth | `false` (at D2; later D3) |
| `UWC_1C_OCC_UNLOCKED` | `false` |
| Compensation exec | `false` |
| Handler apply | frozen txn OCC executor (`same_day_time_adjust` payload) |
| Contract | `uwc-cutover-01-d1.contract.spec.ts` (D2 cases) |

Optional env:

```bash
UWC_CORRIDOR_MODE_ITINERARY_ADJUST=AUTHORITATIVE
```

Orchestrator canary XOR path remains. Authoritative apply requires `payload.legacy.prisma` + `timeUpdates`.

## Sign-off

| Role | Date | Decision |
|------|------|----------|
| Ops | 2026-07-24 | **确认 / APPROVE** |
| Implement | 2026-07-24 | landed |
