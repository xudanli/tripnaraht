# UWC-01 — Unified Writeback Contract v1

**Status:** STARTED (first batch)  
**Parent train:** Post–V3.1 Agent Interface Hardening (GO signed; this is a **new** scoped track)  
**Not:** global TravelContext SSOT · Proposal 大一统 · microservice/CQRS/GraphQL · OR-Tools Apply · Iceland/Mobile expansion  

## Goal

Unify the **minimum safety contract** for authoritative writes — not a global write bus or single persistence store (`MIXED_WRITE_UNIFICATION_FORBIDDEN`).

## First batch (landed in code)

| Item | Path |
|------|------|
| Types / errors / results | `src/decision-runtime/execution/authoritative-write/authoritative-write.types.ts` |
| WriteTarget profiles | `write-target.registry.ts` (mirrors audit matrix mixedTargets) |
| Gateway | `authoritative-write-gateway.service.ts` |
| **UWC-1b** modes / handlers / shadow probe | `corridor-write-mode.config.ts`, `handlers/*`, `corridor-handler.registry.ts`, `authoritative-write-shadow-probe.service.ts` |
| Contract tests | `authoritative-write-gateway.contract.spec.ts`, `uwc-1b-shadow.contract.spec.ts` |

### Corridors (v1 batch only)

1. **ACTIONS_COMMIT** → handler bound; Legacy `ActionExecutionService.commit` writes; UWC shadow probe only  
2. **ITINERARY_ADJUST** → handler bound; Legacy `executeItineraryAdjustDraftApply` writes; standalone shadow probe  
3. **UNIFIED_EXECUTE** → handler bound; Legacy `Rfc001PlanVersionApplyExecutor.execute` writes; shadow after execute  

### Modes (per corridor, env override)

| Mode | Behavior |
|------|----------|
| `DISABLED` | No UWC probe |
| `SHADOW_VALIDATE` (**default this round**) | Gates + WriteTarget resolve + reconcile audit; **zero writes** |
| `AUTHORITATIVE` | **Hard-blocked** until `UWC_1C_OCC_UNLOCKED` (coerced to DISABLED) |

Env keys: `UWC_CORRIDOR_MODE_ACTIONS_COMMIT` / `_ITINERARY_ADJUST` / `_UNIFIED_EXECUTE`.

Handlers are bound in registry. Existing HTTP paths remain the sole writers under SHADOW_VALIDATE.

## Shared stages

Authority → Verification Proof → Freshness shape → Idempotency key → WriteTarget profile → Audit → (handler) Transaction/Audit persistence

### Unified outcomes (client protocol)

`APPLIED` | `CONFLICT` | `VERIFICATION_REQUIRED` | `REJECTED` | `IDEMPOTENT_REPLAY`

### Compensation model (v1)

- **pre_commit_abort** — fail before effective  
- **post_effective_compensating_plan_version** — Unified rollback path  
- **revision_chain_rollback** — itinerary adjust  
- **stub_no_side_effects** — Actions (unchanged product stance)  

**Out of scope:** hotel / activity / car rental external commercial compensation.

## Next tickets (ordered)

| ID | Work | Notes |
|----|------|-------|
| UWC-1a | ✅ Types + gateway + registry + contract | done |
| UWC-1b | ✅ Explicit handlers + SHADOW_VALIDATE + AUTHORITATIVE hard-block | done |
| UWC-1c | ✅ ExpectedWriteVersion OCC + dual gates + concurrency proofs | code complete; switch auth false |
| UWC-1d | ✅ Two-layer recovery + profiles + cutover gate | compensation exec gate closed |
| UWC-CANARY-01 | 🟡 ACTIONS_COMMIT AUTHORITATIVE_CANARY | env-authorized; no global AUTHORITATIVE unlock |
| UWC-1e | Web/iOS protocol: Preview → Confirm → Apply mapping | after ACTIONS canary review |

## Hard prohibitions

- global TravelContext SSOT  
- Proposal 大一统  
- microservice / CQRS / GraphQL redesign  
- OR-Tools authoritative Apply  
- Iceland / Mobile writeback expansion  
- mixed-write single-store unification  

## Relation to V3.1 release

V3.1 **GO** remains on tag `v31-agent-interface-hardening-rc1` → `b5127ae9…`.  
UWC v1 is a **follow-on engineering track**; do not move evidence tag `claim-evidence-matrix-v2.0`.
