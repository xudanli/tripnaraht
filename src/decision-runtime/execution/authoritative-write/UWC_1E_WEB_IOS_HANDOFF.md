# UWC-1e — Web / iOS Client Handoff

**Status:** LANDED (reference TS clients + sealed page API)  
**Date:** 2026-07-24  
**Readers:** Web FE · iOS  
**SSOT:** One OpenAPI + `createUwc1eClient` — do not fork per platform.

## 1. Rule of the road

All **effective** first-batch writebacks use:

**Preview → Confirm → Apply**

| Layer | API | Allowed |
|-------|-----|---------|
| **Page** | `pageApi` | Preview + Confirm only |
| **Shell / coordinator** | `commitGate.commit` | Apply only |

Pages **must not** call Apply.  
Pages **must not** rewrite `previewHash`, `expectedVersion`, `verificationProof`, or `confirmationToken`.

| Outcome | Client must |
|---------|-------------|
| CONFLICT / Expired | Re-**Preview** (new draft) |
| VERIFICATION_REQUIRED | No bypass |
| REJECTED | No bypass |

**Out of scope:** auto-undo · mixedTargets · Iceland/Mobile writeback · global OCC / Compensation unlock.

## 2. First-batch slices (Web + iOS)

| Product flow | Slice | Helper |
|--------------|-------|--------|
| `execution.remind` | `actions_commit` | `previewExecutionRemind` |
| Same-day time adjust | `itinerary_same_day_time_adjust` | `previewSameDayTimeAdjust` |
| Same-day ADD item (Arrange ADD) | `itinerary_same_day_add_item` | `previewSameDayAddItem` |
| Same-day ADD from candidates (AUTO_ARRANGE) | `itinerary_same_day_add_from_candidates` | `previewSameDayAddFromCandidates` |
| Multi-day ADD from candidates (atomic) | `itinerary_multi_day_add_from_candidates` | `previewMultiDayAddFromCandidates` |
| Same-day REMOVE item | `itinerary_same_day_remove_item` | `previewSameDayRemoveItem` |
| Same-day REORDER items | `itinerary_same_day_reorder_items` | `previewSameDayReorderItems` |
| Same-day MOVE+ADD (atomic) | `itinerary_same_day_move_and_add` | `previewSameDayMoveAndAdd` |
| Same-day REDUCE_INTENSITY | `itinerary_same_day_reduce_intensity` | `previewSameDayReduceIntensity` |
| UNIFIED PlanVersion-only | `unified_plan_version_only` | `previewUnifiedPlanVersionOnly` |

## 3. HTTP (identical)

Base: `{HOST}/api`

- `POST /uwc/v1/write/preview`
- `POST /uwc/v1/write/confirm`
- `POST /uwc/v1/write/apply`
- `GET /uwc/v1/openapi-freeze`

## 4. TypeScript reference clients

| Surface | Path |
|---------|------|
| Web | `src/trips/dto/frontend-uwc-1e-api-client.ts` |
| iOS (TS mirror) | `src/trips/dto/frontend-uwc-1e-ios-api-client.ts` |
| Shared page API | `client-write-protocol.page-api.ts` |
| Commit gate | `client-write-protocol.commit-gate.ts` |

### Web sketch

```ts
import { createFrontendUwc1eWebClient } from '@/trips/dto/frontend-uwc-1e-api-client';

const uwc = createFrontendUwc1eWebClient({ baseUrl: 'https://host/api', getAuthToken });

// PAGE
const preview = await uwc.previewSameDayTimeAdjust({ tripId, expectedTripRevision, timeUpdates });
if (!preview.ok) { /* if mustRePreview → new preview */ return; }
const confirmed = await uwc.pageApi.confirm(preview.handle);
if (!confirmed.ok) return;

// SHELL ONLY — not from page module
const applied = await uwc.commitGate.commit(confirmed.handle, { idempotencyKey });
if (applied.mustRePreview) { /* re-preview */ }
if (applied.bypassForbidden) { /* stop */ }
```

### Swift sketch (same state machine)

```swift
// Page: preview + confirm only. Never call apply from a View.
let preview = try await Uwc1eClient.shared.previewSameDayTimeAdjust(...)
let confirm = try await Uwc1eClient.shared.confirm(draftId: preview.draftId, explicitConfirm: true)
// Coordinator:
let apply = try await Uwc1eCommitGate.shared.commit(
  draftId: preview.draftId,
  confirmationToken: confirm.confirmationId, // sealed — do not edit
  idempotencyKey: key
)
if apply.mustRePreview { /* new Preview */ }
if apply.bypassForbidden { /* hard stop */ }
```

## 5. Immutable tokens

Sealed on Preview/Confirm. Commit gate compares against private bag and **ignores** forged overrides:

- `previewHash`
- `expectedVersion`
- `verificationProof`
- `confirmationToken`

## 6. Evidence

- Contract matrix: `src/agent/contracts/uwc-1e-client-contract.matrix.ts`
- Fullstack E2E: `uwc-1e-fullstack.e2e.spec.ts`
- Ops OpenAPI: `evidence/work-packages/UWC-01-unified-writeback-contract/ops/UWC_1E_OPENAPI.json`
