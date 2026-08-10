# UWC-CUTOVER-01 / D3 — UNIFIED_EXECUTE (PlanVersion-only) → AUTHORITATIVE

**Decision ID:** D3  
**Corridor:** UNIFIED_EXECUTE — **PlanVersion WriteTarget only**  
**Status:** **APPROVED** — implemented 2026-07-24  

## Decision

**APPROVE** — promote UNIFIED_EXECUTE to corridor-local AUTHORITATIVE for frozen PlanVersion-only subtype, without unlocking mixedTargets, global OCC switch, or compensation.

## Implemented

| Item | Value |
|------|--------|
| `UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED.UNIFIED_EXECUTE` | `true` |
| `UWC_1C_OCC_UNLOCKED` | `false` |
| Compensation exec | `false` |
| mixedTargets / Iceland / Mobile | excluded |
| Handler apply | frozen PlanVersion OCC executor (`payload.legacy.prisma` + `planVersionId`) |
| Contract | `uwc-cutover-01-d1.contract.spec.ts` (D3 cases) |

Optional env:

```bash
UWC_CORRIDOR_MODE_UNIFIED_EXECUTE=AUTHORITATIVE
```

Adapter canary XOR / percent controls remain available. Authoritative apply requires `prisma` + `decisionId` + `planVersionId`.

## Sign-off

| Role | Date | Decision |
|------|------|----------|
| Ops | 2026-07-24 | **确认 / APPROVE** |
| Implement | 2026-07-24 | landed |
