# UWC-1e — Client Integration Evidence

**Status:** EVIDENCE_COMPLETE (2026-07-24)  
**Scope:** Web/iOS reference clients via `createUwc1eClient` · first-batch slices only  

## Flows covered

| Flow | Slice | Surfaces |
|------|-------|----------|
| `execution.remind` | `actions_commit` | web, ios |
| same-day time adjust | `itinerary_same_day_time_adjust` | web, ios |
| same-day ADD item | `itinerary_same_day_add_item` | web, ios |
| same-day ADD from candidates | `itinerary_same_day_add_from_candidates` | web, ios |
| multi-day ADD from candidates | `itinerary_multi_day_add_from_candidates` | web, ios |
| same-day REMOVE item | `itinerary_same_day_remove_item` | web, ios |
| same-day REORDER items | `itinerary_same_day_reorder_items` | web, ios |
| same-day MOVE+ADD | `itinerary_same_day_move_and_add` | web, ios |
| same-day REDUCE_INTENSITY | `itinerary_same_day_reduce_intensity` | web, ios |
| UNIFIED PlanVersion-only | `unified_plan_version_only` | web, ios |

## Artifacts

| Kind | Path |
|------|------|
| Handoff | `src/decision-runtime/execution/authoritative-write/UWC_1E_WEB_IOS_HANDOFF.md` |
| Web client | `src/trips/dto/frontend-uwc-1e-api-client.ts` |
| iOS client | `src/trips/dto/frontend-uwc-1e-ios-api-client.ts` |
| Page API | `client-write-protocol.page-api.ts` |
| Commit gate | `client-write-protocol.commit-gate.ts` |
| Contract matrix | `src/agent/contracts/uwc-1e-client-contract.matrix.ts` |
| Fullstack E2E | `uwc-1e-fullstack.e2e.spec.ts` |

## Hard rules verified

- Pages: Preview + Confirm only (no Apply method on `pageApi`)
- Tokens immutable: `previewHash`, `expectedVersion`, `verificationProof`, `confirmationToken`
- CONFLICT / Expired → must re-Preview
- VERIFICATION_REQUIRED / REJECTED → bypass forbidden
- No auto-undo · no mixedTargets · no Iceland/Mobile
- `UWC_1C_OCC_UNLOCKED=false` · `UWC_1D_COMPENSATION_EXEC_AUTHORIZED=false`

## Test commands

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/agent/contracts/uwc-1e-client-contract.matrix.spec.ts \
  src/decision-runtime/execution/authoritative-write/uwc-1e-fullstack.e2e.spec.ts \
  src/agent/contracts/bff-client-contract.index.spec.ts \
  src/agent/contracts/bff-client-contract.matrix.spec.ts \
  src/agent/contracts/client-protocol-handoff.inventory.contract.spec.ts
```

## Limits

Shipping native Swift/Kotlin/React apps are not in this repo; compliance of production binaries remains outside-repo. Reference clients + sealed API + E2E prove the integration contract the apps must follow.
