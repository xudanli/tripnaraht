# UWC-1b — Explicit handlers + SHADOW_VALIDATE

**Status:** DONE  
**Branch:** `feat/unified-writeback-contract-v1`

## Delivered

- Per-corridor modes: `DISABLED` | `SHADOW_VALIDATE` | `AUTHORITATIVE`
- Defaults: all three corridors `SHADOW_VALIDATE`
- `AUTHORITATIVE` hard-blocked (`UWC_1C_OCC_UNLOCKED=false`) → coerced to DISABLED
- Explicit handlers + registry wire order: ACTIONS_COMMIT → ITINERARY_ADJUST → UNIFIED_EXECUTE
- Shadow probe hooks on Legacy paths (zero business writes):
  - `ActionExecutionService.commit`
  - `ClaudeOrchestratorService` after itinerary adjust apply
  - `CanonicalDecisionEngineAdapter.execute`
- Audit ring: `getShadowProbeAuditEntries()` for reconcile diffs
- Kill switch: `UWC_CORRIDOR_MODE_<CORRIDOR>=DISABLED`

## Acceptance

| Criterion | Result |
|-----------|--------|
| Handler binding explicit | PASS |
| Shadow zero writes | PASS (`writesPerformed: false`) |
| Legacy behavior unchanged | PASS (probe is post-hoc / safe) |
| Diffs auditable | PASS |
| Per-corridor kill switch | PASS |

## Not in 1b

- AUTHORITATIVE live writes (blocked until UWC-1c OCC)
- Changing Legacy HTTP response contracts
