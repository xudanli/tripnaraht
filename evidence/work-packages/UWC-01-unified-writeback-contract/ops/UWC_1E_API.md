# UWC-1e HTTP 接口文档

**Version:** `1.0.0`  
**Schema:** `tripnara.uwc_client_write_protocol@v1`  
**Base:** `{HOST}/api/uwc/v1`  
**客户端：** Web / iOS 共用（`productSurface: "web" | "ios"`）  
**冻结 OpenAPI：** `GET /api/uwc/v1/openapi-freeze` · `ops/UWC_1E_OPENAPI.json`

---

## 约定

| 项 | 值 |
|----|-----|
| Content-Type | `application/json` |
| 鉴权 | `Authorization: Bearer <token>`（与 Trip API 一致） |
| 成功体 | 协议 JSON（**无** `success/data` 包装） |
| 错误体 | `Uwc1eProtocolReject` 或带 `outcome` 的 Apply 结果 |

### 阶段职责

| 接口 | 谁调 | 做什么 |
|------|------|--------|
| Preview | 页面 | 只生成草案 |
| Confirm | 页面 | 只记录 `explicitConfirm: true` |
| Apply | **仅** App Coordinator / Shell | 进入 Authority→…→Audit |

页面不得直调 Apply；不得改 `previewHash` / `expectedVersion` / `verificationProof` / `confirmationToken`。

### 结果枚举 `outcome`

`APPLIED` | `CONFLICT` | `VERIFICATION_REQUIRED` | `REJECTED` | `IDEMPOTENT_REPLAY`

| 结果 | 客户端 |
|------|--------|
| `CONFLICT` / draft Expired | 必须重新 Preview |
| `VERIFICATION_REQUIRED` / `REJECTED` | 禁止绕过重试 Apply |

### 首批 `slice`

| slice | 产品 |
|-------|------|
| `actions_commit` | `execution.remind` |
| `itinerary_same_day_time_adjust` | 当天改时间 |
| `itinerary_same_day_add_item` | 当天 ADD 行程项（Arrange ADD） |
| `itinerary_same_day_add_from_candidates` | 当天候选池入程（AUTO_ARRANGE 单日） |
| `itinerary_multi_day_add_from_candidates` | 多日候选池入程（AUTO_ARRANGE 原子全量） |
| `itinerary_same_day_remove_item` | 当天删除行程项（Arrange REMOVE） |
| `itinerary_same_day_reorder_items` | 当天重排行程项顺序（Arrange REORDER，不改时间） |
| `itinerary_same_day_move_and_add` | 当天 MOVE+ADD 原子复合（禁止拆成两次 Confirm） |
| `itinerary_same_day_reduce_intensity` | 当天降强度（REST ADD + 同日 MOVE） |
| `unified_plan_version_only` | UNIFIED PlanVersion-only |

---

## 1. GET `/api/uwc/v1/openapi-freeze`

返回冻结 OpenAPI 文档（Web = iOS）。

**200** — OpenAPI JSON 对象。

---

## 2. POST `/api/uwc/v1/write/preview`

生成写回草案。**不**进入 Apply 管道、**不**落业务写。

### Request

```json
{
  "schemaId": "tripnara.uwc_client_write_protocol@v1",
  "protocolVersion": "1.0.0",
  "stage": "PREVIEW",
  "productSurface": "ios",
  "slice": "itinerary_same_day_time_adjust",
  "tripId": "<uuid>",
  "actorId": "<optional>",
  "requestId": "<optional>",
  "expectedWriteVersion": { },
  "intendedMutation": { },
  "observedHints": { }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `schemaId` | ✓ | 固定 `tripnara.uwc_client_write_protocol@v1` |
| `protocolVersion` | ✓ | 固定 `1.0.0` |
| `stage` | ✓ | `PREVIEW` |
| `productSurface` | ✓ | `web` \| `ios` |
| `slice` | ✓ | 见首批表 |
| `tripId` | ✓ | |
| `expectedWriteVersion` | ✓ | OCC 期望版本（见下） |
| `intendedMutation` | ✓ | 走廊载荷；Preview **不执行** |
| `actorId` / `requestId` / `observedHints` | | 可选 |

#### `expectedWriteVersion`

```json
{ "kind": "PLAN_VERSION", "expectedPlanVersionId": "pv_parent" }
```

```json
{
  "kind": "RESOURCE_VERSION_SET",
  "resources": [{ "resourceId": "<tripId>", "expectedVersion": 2 }]
}
```

```json
{ "kind": "NO_VERSION_REQUIRED" }
```

#### 首批 `intendedMutation` 示例

**execution.remind** — `slice: "actions_commit"`

```json
{
  "actionType": "execution.remind",
  "request_id": "r-1",
  "context_signature": "ios"
}
```

配套 `expectedWriteVersion`：`RESOURCE_VERSION_SET`（`resourceId = tripId`）。

**same-day time adjust** — `slice: "itinerary_same_day_time_adjust"`

```json
{
  "operation": "same_day_time_adjust",
  "timeUpdates": [
    {
      "itemId": "i1",
      "startTimeIso": "2026-07-24T10:00:00.000Z",
      "endTimeIso": "2026-07-24T11:00:00.000Z"
    }
  ]
}
```

**same-day ADD item** — `slice: "itinerary_same_day_add_item"`

```json
{
  "operation": "same_day_add_item",
  "itemCreates": [
    {
      "tripDayId": "day1",
      "placeId": 42,
      "type": "ACTIVITY",
      "startTimeIso": "2026-07-24T10:00:00.000Z",
      "endTimeIso": "2026-07-24T11:00:00.000Z",
      "clientItemKey": "add-42-10:00"
    }
  ]
}
```

**same-day ADD from candidates** — `slice: "itinerary_same_day_add_from_candidates"`

```json
{
  "operation": "same_day_add_from_candidates",
  "itemCreates": [
    {
      "tripDayId": "day1",
      "placeId": 42,
      "type": "ACTIVITY",
      "startTimeIso": "2026-07-24T10:00:00.000Z",
      "endTimeIso": "2026-07-24T11:00:00.000Z",
      "clientItemKey": "cand-1"
    }
  ],
  "candidateRemovals": ["cand-1"]
}
```

**multi-day ADD from candidates** — `slice: "itinerary_multi_day_add_from_candidates"`

```json
{
  "operation": "multi_day_add_from_candidates",
  "itemCreates": [
    {
      "tripDayId": "day1",
      "placeId": 42,
      "type": "ACTIVITY",
      "startTimeIso": "2026-07-24T10:00:00.000Z",
      "endTimeIso": "2026-07-24T11:00:00.000Z",
      "clientItemKey": "cand-1"
    },
    {
      "tripDayId": "day2",
      "placeId": 43,
      "type": "ACTIVITY",
      "startTimeIso": "2026-07-25T10:00:00.000Z",
      "endTimeIso": "2026-07-25T11:00:00.000Z",
      "clientItemKey": "cand-2"
    }
  ],
  "candidateRemovals": ["cand-1", "cand-2"]
}
```

**same-day REMOVE item** — `slice: "itinerary_same_day_remove_item"`

```json
{
  "operation": "same_day_remove_item",
  "itemRemovals": ["i1", "i2"]
}
```

**same-day REORDER items** — `slice: "itinerary_same_day_reorder_items"`

```json
{
  "operation": "same_day_reorder_items",
  "itemReorders": [
    { "itemId": "i1", "order": 1 },
    { "itemId": "i2", "order": 2 }
  ]
}
```

**same-day MOVE+ADD** — `slice: "itinerary_same_day_move_and_add"`

```json
{
  "operation": "same_day_move_and_add",
  "timeUpdates": [
    {
      "itemId": "i1",
      "startTimeIso": "2026-07-24T09:00:00.000Z",
      "endTimeIso": "2026-07-24T10:00:00.000Z"
    }
  ],
  "itemCreates": [
    {
      "tripDayId": "day1",
      "placeId": 42,
      "type": "ACTIVITY",
      "startTimeIso": "2026-07-24T11:00:00.000Z",
      "endTimeIso": "2026-07-24T12:00:00.000Z",
      "clientItemKey": "add-42"
    }
  ]
}
```

**same-day REDUCE_INTENSITY** — `slice: "itinerary_same_day_reduce_intensity"`

```json
{
  "operation": "same_day_reduce_intensity",
  "timeUpdates": [
    {
      "itemId": "i1",
      "startTimeIso": "2026-07-24T10:00:00.000Z",
      "endTimeIso": "2026-07-24T15:00:00.000Z"
    }
  ],
  "itemCreates": [
    {
      "tripDayId": "day1",
      "placeId": null,
      "type": "REST",
      "startTimeIso": "2026-07-24T15:30:00.000Z",
      "endTimeIso": "2026-07-24T16:30:00.000Z",
      "clientItemKey": "rest-1"
    }
  ]
}
```

**UNIFIED PlanVersion-only** — `slice: "unified_plan_version_only"`

```json
{
  "operation": "verified_plan_version_only",
  "decisionId": "d1",
  "planVersionId": "pv_new"
}
```

配套 `expectedWriteVersion`：`PLAN_VERSION`。

### Response 200

```json
{
  "schemaId": "tripnara.uwc_client_write_protocol@v1",
  "protocolVersion": "1.0.0",
  "stage": "PREVIEW",
  "sessionState": "DRAFT",
  "draft": {
    "draftId": "draft_…",
    "corridor": "ITINERARY_ADJUST",
    "slice": "itinerary_same_day_time_adjust",
    "tripId": "…",
    "productSurface": "ios",
    "fingerprint": "<previewHash>",
    "expectedWriteVersion": { },
    "intendedMutation": { },
    "summary": "…",
    "createdAt": "ISO-8601",
    "expiresAt": "ISO-8601",
    "writesPerformed": false,
    "applyPipelineEntered": false
  },
  "reasonCodes": ["PREVIEW_DRAFT_ONLY", "…"]
}
```

客户端应把 `draft.draftId`、`draft.fingerprint` 当密封字段保存，后续 Confirm/Apply **原样**使用。

### 从 Arrange 提案打开 Preview

后端在 `PlanProposal.uwcPreview` 上返回打开条件（可选）：

| `uwcPreview` | 客户端 |
|--------------|--------|
| `open: true` + `timeUpdates` | 调 `previewSameDayTimeAdjust` |
| `open: true` + `itemCreates`（无 candidateRemovals） | 调 `previewSameDayAddItem` |
| `open: true` + `itemCreates` + `candidateRemovals`（单日） | 调 `previewSameDayAddFromCandidates` |
| `open: true` + `itemCreates` + `candidateRemovals`（多日 slice） | 调 `previewMultiDayAddFromCandidates` |
| `open: true` + `itemRemovals` | 调 `previewSameDayRemoveItem` |
| `open: true` + `itemReorders` | 调 `previewSameDayReorderItems` |
| `open: true` + `timeUpdates` + `itemCreates`（MOVE+ADD） | 调 `previewSameDayMoveAndAdd` |
| `open: true` + `timeUpdates` + REST `itemCreates`（降强度） | 调 `previewSameDayReduceIntensity` |
| `open: true` + `decisionId`/`planVersionId`/`expectedPlanVersionId` | 调 `previewUnifiedPlanVersionOnly` |
| 缺省或 `open: false` | **保持原 Arrange Confirm→Apply**，不走 UWC |

---

## 3. POST `/api/uwc/v1/write/confirm`

记录显式确认。**不**进入 Apply 管道。

### Request

```json
{
  "schemaId": "tripnara.uwc_client_write_protocol@v1",
  "protocolVersion": "1.0.0",
  "stage": "CONFIRM",
  "draftId": "draft_…",
  "explicitConfirm": true,
  "productSurface": "ios",
  "actorId": "<optional>",
  "requestId": "<optional>"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `draftId` | ✓ | Preview 返回 |
| `explicitConfirm` | ✓ | **必须为 `true`** |
| `productSurface` | ✓ | 须与 Preview 一致 |

### Response 200

```json
{
  "schemaId": "tripnara.uwc_client_write_protocol@v1",
  "protocolVersion": "1.0.0",
  "stage": "CONFIRM",
  "sessionState": "CONFIRMED",
  "draftId": "draft_…",
  "confirmationId": "conf_…",
  "confirmedAt": "ISO-8601",
  "reasonCodes": ["EXPLICIT_CONFIRM_RECORDED", "…"],
  "applyPipelineEntered": false,
  "writesPerformed": false
}
```

---

## 4. POST `/api/uwc/v1/write/apply`

进入完整写管道（仅 Coordinator）。

**Pipeline：** `AUTHORITY` → `VERIFICATION` → `IDEMPOTENCY` → `OCC` → `HANDLER` → `TRANSACTION` → `AUDIT`

### Request

```json
{
  "schemaId": "tripnara.uwc_client_write_protocol@v1",
  "protocolVersion": "1.0.0",
  "stage": "APPLY",
  "draftId": "draft_…",
  "confirmationId": "conf_…",
  "idempotencyKey": "<client-unique>",
  "productSurface": "ios",
  "actorId": "<optional>",
  "requestId": "<optional>"
}
```

### Response

**200** — `outcome` 为 `APPLIED` 或 `IDEMPOTENT_REPLAY`：

```json
{
  "schemaId": "tripnara.uwc_client_write_protocol@v1",
  "protocolVersion": "1.0.0",
  "stage": "APPLY",
  "sessionState": "APPLIED",
  "draftId": "draft_…",
  "confirmationId": "conf_…",
  "outcome": "APPLIED",
  "mustRePreview": false,
  "bypassForbidden": false,
  "applyPipelineStages": [
    "AUTHORITY",
    "VERIFICATION",
    "IDEMPOTENCY",
    "OCC",
    "HANDLER",
    "TRANSACTION",
    "AUDIT"
  ],
  "writeResult": { },
  "reasonCodes": ["APPLY_PIPELINE_ENTERED", "…"]
}
```

**非 200 但 body 仍为协议结果时：** 看 `outcome` / `mustRePreview` / `bypassForbidden`。

| HTTP | 场景 |
|------|------|
| 200 | `APPLIED` / `IDEMPOTENT_REPLAY` |
| 409 | `CONFLICT` / `MUST_REPREVIEW_AFTER_CONFLICT` |
| 422 | `VERIFICATION_REQUIRED` |
| 403 | `REJECTED` / `BYPASS_FORBIDDEN` / 排除能力 |
| 404 | `DRAFT_NOT_FOUND` |
| 410 | `DRAFT_EXPIRED`（须重新 Preview） |
| 400 | 其它协议错误 |

---

## 5. 错误体 `Uwc1eProtocolReject`

```json
{
  "schemaId": "tripnara.uwc_client_write_protocol@v1",
  "protocolVersion": "1.0.0",
  "stage": "CONFIRM",
  "outcome": "REJECTED",
  "errorCode": "MUST_REPREVIEW_AFTER_CONFLICT",
  "reasonCodes": ["…"],
  "mustRePreview": true,
  "bypassForbidden": true,
  "sessionState": "CONFLICT"
}
```

### `errorCode`

| code | 含义 |
|------|------|
| `SLICE_NOT_IN_FIRST_BATCH` | slice 不在首批 |
| `EXCLUDED_CAPABILITY` | mixedTargets / 外部副作用等 |
| `DRAFT_NOT_FOUND` | draft 不存在 |
| `DRAFT_EXPIRED` | 过期 → 重新 Preview |
| `INVALID_SESSION_TRANSITION` | 状态机不允许 |
| `EXPLICIT_CONFIRM_REQUIRED` | `explicitConfirm` 非 true |
| `CONFIRMATION_REQUIRED` / `CONFIRMATION_MISMATCH` | Confirm 缺失或不匹配 |
| `MUST_REPREVIEW_AFTER_CONFLICT` | Conflict 后须重新 Preview |
| `BYPASS_FORBIDDEN` | VR/Rejected 禁止绕过 |
| `PRODUCT_SURFACE_MISMATCH` | web/ios 与 draft 不一致 |
| `PROTOCOL_VERSION_MISMATCH` | schema/version 不对 |

---

## 6. 调用顺序（iOS / Web 相同）

```
POST …/preview  →  保存 draftId + fingerprint
用户确认
POST …/confirm  →  保存 confirmationId
（仅 Coordinator）
POST …/apply    →  按 outcome / mustRePreview / bypassForbidden 处理
```

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `UWC_1E_WEB_IOS_HANDOFF.md` | 客户端接入说明 |
| `client-write-protocol.http.dto.ts` | Nest DTO |
| `client-write-protocol.types.ts` | 类型 SSOT |
| `frontend-uwc-1e-ios-api-client.ts` | iOS TS 参考客户端 |
| `ops/UWC_1E_OPENAPI.json` | 冻结 OpenAPI 摘录 |
