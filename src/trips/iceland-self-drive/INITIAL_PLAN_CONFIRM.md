# Initial Plan Confirm Contract

## Allowed claim

> Initial Plan Preview 可在 Shadow VERIFY 放行后由用户 **Confirm（确认草案）**；确认后仍未写入正式行程。

## Forbidden claims

- Confirm = 正式行程已生成
- Confirm = PlanVersion / Apply 已完成
- `status === VERIFIED` 即自动可 Confirm（必须以 `capabilities.canConfirm` / `verification.allowConfirm` 为准）

## Gate

```text
canConfirm =
  verification.allowConfirm === true
  AND status ∈ { VERIFIED, VERIFIED_WITH_CONFIRMATIONS }
  AND not STALE / SUPERSEDED / CONFIRMED / BLOCKED / FAILED
```

权威来源：`ICELAND_SHADOW_UNIFIED_ASSESSMENT`（`allowConfirm` 仅 PASS / WARN / NEED_CONFIRM）。

## HTTP

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/iceland-self-drive/trips/:tripId/initial-plan/proposals/:proposalId/confirm` | Confirm |

### Request

```json
{
  "acknowledgedConfirmationIds": ["exp:…", "gap:…"],
  "note": "optional"
}
```

规则：

- 必须覆盖全部 `confirmations[]` 中 `blockingApply === true` 的 `confirmationId`
- 无 blocking 项时传 `[]`
- 未知 id → `400 UNKNOWN_CONFIRMATION_IDS`
- 缺 ack → `400 CONFIRMATIONS_INCOMPLETE`
- VERIFY 未放行 → `409 CONFIRM_NOT_ALLOWED`
- 已 CONFIRMED → 幂等返回原记录

### Response highlights

- `status: "CONFIRMED"`
- `applyAllowed: true`（打开 Apply 卡）
- `writesPlanVersion: false`（Confirm 本身不写）
- `preview.capabilities.canConfirm: false`
- `preview.capabilities.canApply: true`

## Persistence

`StoredInitialPlanProposal.confirmationRecord` + `status=CONFIRMED`  
Shell `creationStatus=PREVIEW_CONFIRMED`  

Confirm **不**写 PlanVersion。

## FE

```ts
import {
  previewUiFlags,
  buildConfirmAckPayload,
} from './clients/iceland-initial-plan-preview.client';

const ui = previewUiFlags(preview);
if (ui.showConfirmCta) {
  await client.confirmProposal(
    tripId,
    proposalId,
    buildConfirmAckPayload(preview),
  );
}
// Apply CTA only after Confirm (canApply)
```

## Next

Apply / PlanVersion：[`INITIAL_PLAN_APPLY.md`](./INITIAL_PLAN_APPLY.md)
