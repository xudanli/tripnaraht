# UWC-1e — Web/iOS Preview → Confirm → Apply Protocol

**Status:** **CLIENT INTEGRATION LANDED** (HTTP + sealed pageApi/commitGate + matrix + E2E)  
**Opened / landed:** 2026-07-24  

## Goal

Freeze a **single** client write protocol for Web and iOS:

| Stage | Allowed work |
|-------|----------------|
| **Preview** | Generate draft only |
| **Confirm** | Record **explicit** confirmation only |
| **Apply** | Authority → Verification → Idempotency → OCC → Handler → Transaction → Audit |

## Shared surface (do not fork)

| Artifact | Path |
|----------|------|
| Types / state / OpenAPI / service / HTTP | `client-write-protocol.*` |
| Shared client | `createUwc1eClient` |
| Page API | `client-write-protocol.page-api.ts` |
| Commit gate | `client-write-protocol.commit-gate.ts` |
| Web sample | `src/trips/dto/frontend-uwc-1e-api-client.ts` |
| iOS sample | `src/trips/dto/frontend-uwc-1e-ios-api-client.ts` |
| Handoff | `UWC_1E_WEB_IOS_HANDOFF.md` |
| Contract matrix | `src/agent/contracts/uwc-1e-client-contract.matrix.ts` |
| E2E evidence | `ops/UWC_1E_CLIENT_E2E.md` |

## HTTP paths (identical for Web/iOS)

- `POST /api/uwc/v1/write/preview`
- `POST /api/uwc/v1/write/confirm`
- `POST /api/uwc/v1/write/apply`
- `GET /api/uwc/v1/openapi-freeze`

## Client layering

| Layer | May |
|-------|-----|
| **Page** (`pageApi`) | Preview + Confirm |
| **Shell** (`commitGate`) | Apply only |

Immutable: `previewHash` · `expectedVersion` · `verificationProof` · `confirmationToken`

## First-batch

| Slice | Product |
|-------|---------|
| `actions_commit` | `execution.remind` |
| `itinerary_same_day_time_adjust` | same-day time adjust |
| `itinerary_same_day_add_item` | same-day ADD item (Arrange ADD) |
| `itinerary_same_day_add_from_candidates` | same-day ADD from candidates (AUTO_ARRANGE) |
| `itinerary_multi_day_add_from_candidates` | multi-day ADD from candidates (atomic AUTO_ARRANGE) |
| `itinerary_same_day_remove_item` | same-day REMOVE item (Arrange REMOVE) |
| `itinerary_same_day_reorder_items` | same-day REORDER items (order only) |
| `itinerary_same_day_move_and_add` | same-day MOVE+ADD atomic composite |
| `itinerary_same_day_reduce_intensity` | same-day REDUCE_INTENSITY (REST+MOVE) |
| `unified_plan_version_only` | PlanVersion-only |

## Excluded / locks

No auto-undo · no mixedTargets · no Iceland/Mobile · `UWC_1C_OCC_UNLOCKED` LOCKED · compensation LOCKED.
