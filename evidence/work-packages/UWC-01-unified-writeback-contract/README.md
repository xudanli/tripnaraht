# UWC-01 — Unified Writeback Contract v1

**Status:** UWC-1e protocol **FROZEN**; cutover D1–D3 **APPROVED**  
**Ops phase:** Canaries + cutover complete — see `PROCESS_STATUS.md`  
**Parent train:** Post–V3.1 Agent Interface Hardening (GO signed)  
**Not:** global TravelContext SSOT · Proposal 大一统 · microservice/CQRS/GraphQL · OR-Tools Apply · Iceland/Mobile expansion  

## Goal

Unify the **minimum safety contract** for authoritative writes — not a global write bus or single persistence store (`MIXED_WRITE_UNIFICATION_FORBIDDEN`).

## Formal status (now)

| Corridor | Status |
|----------|--------|
| ACTIONS_COMMIT | **AUTHORITATIVE** (D1) + UWC-1e slice |
| ITINERARY_ADJUST | **AUTHORITATIVE** (D2, same-day) + UWC-1e slice |
| UNIFIED_EXECUTE | **AUTHORITATIVE** (D3, PlanVersion-only) + UWC-1e slice |

| Lock / exclusion | Status |
|------------------|--------|
| Global AUTHORITATIVE (`UWC_1C_OCC_UNLOCKED`) | **UNLOCKED** — `UWC-OCC-UNLOCK-01` |
| Compensation Execution | **UNLOCKED** — `UWC-COMP-UNLOCK-01` |
| UNIFIED mixedTargets | **EXCLUDED** |
| Iceland / Mobile writeback | **EXCLUDED** |
| UWC-1e | **FROZEN** (Preview→Confirm→Apply; `autoUndo=false`) |

## Landed (frozen) code roots

| Item | Path |
|------|------|
| Types / gateway / handlers / OCC / recovery | `src/decision-runtime/execution/authoritative-write/` |
| CANARY-01/02/03 | `*-canary.*`, `uwc-canary-0*.contract.spec.ts` |
| Cutover helpers | `corridor-cutover.gate.ts` |

## Modes (per corridor)

| Mode | Behavior |
|------|----------|
| `DISABLED` | No UWC probe |
| `SHADOW_VALIDATE` (**default**) | Gates + reconcile; **zero UWC business writes** on non-canary path |
| `AUTHORITATIVE_CANARY` | Per-corridor canary only (env + cutover gated) |
| `AUTHORITATIVE` | Allowed when dual-gate unlocked **or** per-corridor cutover auth |

## Ticket board

| ID | Work | Notes |
|----|------|-------|
| UWC-1a…1d | ✅ Contract / shadow / OCC / recovery | complete |
| UWC-CANARY-01 | ✅ **FROZEN** — ops PASSED | |
| UWC-CANARY-02 | ✅ **FROZEN** — ops PASSED | |
| UWC-CANARY-03 | ✅ **FROZEN** — ops PASSED | PlanVersion-only |
| **Ops canaries** | ✅ ACTIONS → ITINERARY → UNIFIED | complete |
| **UWC-CUTOVER-01** | ✅ D1+D2+D3 **APPROVED** | |
| **UWC-OCC-UNLOCK-01** | ✅ Global OCC dual-gate **UNLOCKED** | |
| **UWC-COMP-UNLOCK-01** | ✅ Compensation exec **UNLOCKED** | client autoUndo still false |
| **UWC-1e** | ✅ **CLIENT INTEGRATION** — Web/iOS pageApi + commitGate + E2E | no page Apply |




## Hard prohibitions

- global TravelContext SSOT · Proposal 大一统 · microservice/CQRS/GraphQL  
- OR-Tools authoritative Apply · Iceland / Mobile writeback expansion  
- mixed-write single-store unification · client auto-undo / external refund expansion without explicit decision  

## Relation to V3.1

V3.1 **GO** on tag `v31-agent-interface-hardening-rc1` → `b5127ae9…`.  
Do not move evidence tag `claim-evidence-matrix-v2.0`.
