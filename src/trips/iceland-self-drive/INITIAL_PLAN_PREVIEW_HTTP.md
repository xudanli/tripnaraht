# Trip Shell + Initial Plan Preview HTTP

## Allowed claim

> Initial Plan Preview 已具备产品接入条件。

## Forbidden claims

- 正式行程已经生成
- 行程已完成权威优化
- Proposal 已成为可执行行程

## HTTP (namespaced)

Global prefix `api`. Routes live under `iceland-self-drive` to avoid colliding with the core `TripsController`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/iceland-self-drive/trips` | Create Trip Shell only |
| POST | `/api/iceland-self-drive/trips/:tripId/initial-plan/proposals` | Generate Preview Proposal |
| GET | `/api/iceland-self-drive/trips/:tripId/initial-plan/proposals/current` | Active Preview |
| GET | `/api/iceland-self-drive/trips/:tripId/initial-plan/proposals/:proposalId` | Preview by id |

Auth: JWT user **or** `x-owner-id` header (for local/dev).  
Idempotency: `Idempotency-Key` header.

`confirmAllowed` / `capabilities.canConfirm` follow Shadow VERIFY `allowConfirm` (not hardcoded false).  
`capabilities.canApply` remains **always false** until the Apply card.

## Persistence

| Store | Role |
|-------|------|
| `IcelandTripShellRepository` | Trip Shell context |
| `IcelandStoredProposalRepository` | Proposal + VERIFY + audit |

**Not** PlanVersion / Apply repositories. `planVersionWriteCount === 0`.

## Pipeline

```text
Create Shell → CONTEXT_SAVED
→ POST proposals → GENERATING_PREVIEW
→ Orchestrator (Day-Assign → Preflight → Independent VERIFY)
→ Persist StoredInitialPlanProposal
→ PREVIEW_READY | PREVIEW_PARTIAL | PREVIEW_BLOCKED
```

## Product copy

Responses include `productCopy` stating 初始行程草案 / 独立约束检查 / 尚未写入正式行程.

## Next

- Confirm：[`INITIAL_PLAN_CONFIRM.md`](./INITIAL_PLAN_CONFIRM.md)
- Apply / PlanVersion：[`INITIAL_PLAN_APPLY.md`](./INITIAL_PLAN_APPLY.md)
- Frontend：[`FRONTEND_PREVIEW_INTEGRATION.md`](./FRONTEND_PREVIEW_INTEGRATION.md)
- Typed client：`clients/iceland-initial-plan-preview.client.ts`
- 演示页：`GET /api/iceland-self-drive/preview-demo`
