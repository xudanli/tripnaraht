# UWC-01 — Process Status

**As of:** 2026-07-24  
**Phase:** **UWC-COMP-UNLOCK-01** — Compensation exec **UNLOCKED**; OCC already unlocked  
**Formal口径:** 全局 OCC **UNLOCKED**；Compensation exec **UNLOCKED**；客户端 auto-undo / mixedTargets / Iceland·Mobile 仍排除；页面不得直调 Apply。

## Cutover board

| ID | Corridor | Status |
|----|----------|--------|
| **D1** | ACTIONS_COMMIT | **APPROVED** |
| **D2** | ITINERARY_ADJUST | **APPROVED** |
| **D3** | UNIFIED PlanVersion-only | **APPROVED** |
| **OCC** | Global dual-gate | **UNLOCKED** — `UWC-OCC-UNLOCK-01.md` |
| **COMP** | Compensation exec | **UNLOCKED** — `UWC-COMP-UNLOCK-01.md` |

## UWC-1e

| Item | Status |
|------|--------|
| Protocol + HTTP | **DONE** |
| Web / iOS sample clients | **DONE** |
| Page API / Commit gate | **DONE** — sealed tokens; `autoUndo=false` |
| OCC + compensation coexistence | **DONE** — refuse rails removed |

## Locks / exclusions

| Gate | Status |
|------|--------|
| Global `UWC_1C_OCC_UNLOCKED` | **UNLOCKED** |
| Compensation exec | **UNLOCKED** |
| Client auto-undo / mixedTargets / Iceland·Mobile | **EXCLUDED** |

## Next

Staging multi-host Confirm (optional `CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL`) · ERC durable idempotency · product apps adopt reference clients · UWC corridor breadth.
