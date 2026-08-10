# 行中执行首页 · iOS 对接文档（P0）

> 产品：「执行首页 / 仅提醒 / Runbook / Verified Proposal」  
> iOS：`ExecutionInTrip*`（`Features/ExecutionOverview/InTrip/`）  
> **样式不跟稿**：只锁 API 契约、枚举与同源关系。  
> **状态：** 后端 P0 已落地；UI Preview 已有，读/写按本稿联调。  
> **最后更新：** 2026-07-19

**索引：** [`EXECUTE_NATIVE_API.md`](../../auth/EXECUTE_NATIVE_API.md)  
**实现类型：** `src/mobile/dto/mobile-in-trip-home.types.ts`

---

## 0. 能力边界（先读）

| 能力 | 回答的问题 | 路径 / 文档 | 与本能力关系 |
|------|------------|-------------|--------------|
| **行中执行首页（本稿）** | 正在去哪？接下来盯什么？要不要开 Runbook？ | `execution/in-trip-home` 等 | **本能力** |
| 今日自驾状态 | 今天还能不能按计划出发？ | [DAILY_DRIVE_STATUS_API.md](../daily-drive/DAILY_DRIVE_STATUS_API.md) | 行前/当日出发快览；**不**替代行中 live |
| 活跃风险提醒 | 是否可继续执行（阻断级） | `GET .../execution/execution-alerts` | Runbook 可由 alerts 触发；「当前风险」可下钻 |
| 待调整 / 决策 | 用户要拍板的方案 | `adjustment-queue` / decisions | Runbook **默认不**创建 DecisionProblem |
| `execution-overview` | 旧总览（活动卡 / metrics / statusRows） | 已有 | **已降级**：总览首屏用 [overview-dashboard](../execution-overview-dashboard/OVERVIEW_DASHBOARD_API.md)；**勿**硬塞进旧 `statusRows` |


**产品分层（必须遵守）：**

| 层级 | 情况 | 交互 | 是否进决策空间 |
|------|------|------|----------------|
| **仅提醒** | ETA+10m、风略增强、建议加油、连续驾驶 2h、日落缓冲下降 | Inline Banner | **否** |
| **Runbook** | 路段关闭、强风高风险、无法达下一可靠油站、预计错过集合 | 触发 Sheet → 六段详情 | **默认否**（先 Verified Proposal） |
| **用户确认** | 改主路线 / 删活动 / 改住宿 / 大绕行 / 明显加驾时 / 接受高风险 / 影响已订项目 | 执行页底部确认 Sheet | **不必**拉回完整决策空间 |

---

## 1. 产品一句话

> **「我正在去哪？当前最该盯什么？这件事是提醒，还是要开处理建议并确认改道？」**

| 页面 / 表面 | 读 / 写 | 数据职责 |
|-------------|---------|----------|
| 执行首页 | 读 | heading + 七项 + 可选提醒 + 已应用方案 + 活跃 Runbook 触发态 |
| 仅提醒 Banner | 读 + dismiss | 轻量提醒（不进决策） |
| Runbook 触发 Sheet | 读 | 触发摘要 + CTA（用 home 内 `activeRunbook`） |
| Runbook 详情 | 读 | 六段 + 方案列表 |
| 确认应用方案 | 读提案 + 写确认 | Verified Proposal + apply |

---

## 2. 通用约定

### 2.1 路径（相对 `baseURL`，已含 `/api`）

```
mobile/trips/{tripId}/execution/in-trip-home
mobile/trips/{tripId}/execution/runbooks/{runbookId}
mobile/trips/{tripId}/execution/verified-proposals/{proposalId}
mobile/trips/{tripId}/execution/verified-proposals/{proposalId}/apply
mobile/trips/{tripId}/execution/inline-reminders/{reminderId}/dismiss
```

完整前缀：`/api/mobile/trips/{tripId}/execution/...`  
**P0 无** canonical `/api/trips/...` 双写。

### 2.2 响应信封

```json
{
  "success": true,
  "data": { },
  "requestId": "uuid",
  "tripId": "trip-xxx",
  "contextVersion": 142,
  "serverTime": "2026-07-19T14:40:00Z"
}
```

写操作响应必须带回新 `contextVersion`（根级和/或 `data` 内）。

### 2.3 请求头

| Header | 读 | 写 | 说明 |
|--------|----|----|------|
| `Authorization: Bearer <token>` | 必填 | 必填 | |
| `X-Client-Version` | 建议 | 建议 | |
| `Idempotency-Key` | — | **必填** | apply / dismiss；UUID；重放 → `replay: true` |
| `If-Match: <contextVersion>` | — | **必填（仅 apply）** | 冲突 → `CONTEXT_VERSION_CONFLICT` |

### 2.4 错误码

| code | 场景 | iOS 建议 |
|------|------|----------|
| `UNAUTHORIZED` / `FORBIDDEN` | 未登录 / 非成员 | 常规鉴权 |
| `NOT_FOUND` | 行程 / 提案不存在 | 提示并返回 |
| `VALIDATION_ERROR` | 缺头 / 枚举非法 / `acknowledged≠true` | 检查请求 |
| `CONTEXT_VERSION_CONFLICT` | `If-Match` 不匹配 | 重拉 home，用新 version 再 apply |
| `PROPOSAL_EXPIRED` | 提案失效 | 重新打开 Runbook |
| `RUNBOOK_NOT_ACTIVE` | Runbook 已关闭/过期 | 关闭 Sheet，重拉 home |

### 2.5 文案与枚举

- 展示文案优先服务端 `*LabelZh` / `*Zh`。
- 客户端用枚举只做图标 / 样式，**不要**本地编造长文案。

### 2.6 WebSocket

事件：`trip_context_changed`  
`changedSections` 含：

- `"execution"`（必带）
- `"in_trip_home"`（P0 新增 → **重拉** `in-trip-home`）
- 必要时另有 `"itinerary"` 等

---

## 3. 接口一览

| 优先级 | 方法 | 路径 | 用途 |
|--------|------|------|------|
| **P0** | `GET` | `.../execution/in-trip-home` | 执行首页整页投影 |
| **P0** | `GET` | `.../execution/runbooks/{runbookId}` | Runbook 详情 |
| **P0** | `GET` | `.../execution/verified-proposals/{proposalId}` | 确认 Sheet |
| **P0** | `POST` | `.../execution/verified-proposals/{proposalId}/apply` | 确认并应用 |
| **P0** | `POST` | `.../execution/inline-reminders/{reminderId}/dismiss` | 关闭仅提醒 |
| P1 | `POST` | `.../runbooks/{id}/defer` | 「稍后再看」 |
| P1 | `POST` | `.../runbooks/{id}/acknowledge` | 「我知道了」 |

> 快速动作（我已出发 / 到达 / 休息…）**不在 P0**。

---

## 4. GET 行中执行首页

```
GET /api/mobile/trips/{tripId}/execution/in-trip-home
```

| Query | 类型 | 默认 | 说明 |
|-------|------|------|------|
| `includeReminder` | boolean | `true` | `false` / `0` 时不返回 `inlineReminder` |
| `includeActiveRunbook` | boolean | `true` | 仅摘要；详情另拉 `runbooks/{id}` |

`data.schemaId` = `tripnara.in_trip_home@v1`

### 4.1 `data` Schema

```typescript
{
  schemaId: "tripnara.in_trip_home@v1";

  heading: {
    destinationNameZh: string;          // 「维克」
    destinationLocalName?: string;      // 「Vik」
    etaRangeLabelZh: string;            // 「16:20 – 16:40」
    attention: "ON_TRACK" | "NEEDS_ATTENTION" | "BLOCKED";
    attentionLabelZh: string;           // 正常 / 需关注 / 需处理
    progress?: number;                  // 0..1
    distanceProgressLabelZh?: string;   // 「62 km / 96 km」
    remainingDurationLabelZh?: string;  // 「1 小时 25 分钟」
    toItemId?: string;
  };

  /** 最多一条；无则 null */
  inlineReminder?: {
    id: string;
    kind:
      | "ETA_INCREASED"
      | "WIND_INCREASED"
      | "FUEL_SUGGESTED"
      | "REST_SUGGESTED"
      | "SUNSET_BUFFER_DROP";
    titleZh: string;
    messageZh: string;
    dismissible: boolean;               // 默认 true
  } | null;

  /** 已确认应用后的轻量回执条 */
  appliedProposal?: {
    proposalId: string;
    titleZh: string;                    // 「已采用方案 B」
    detailZh: string;
    appliedAt?: string;                 // ISO-8601
  } | null;

  /** 固定 7 行，顺序固定；缺数据友好文案，不省略行 */
  importantInfo: Array<{
    kind:
      | "NEXT_ROAD_STATUS"
      | "REMAINING_DRIVE"
      | "DELAY_INTERVAL"
      | "NEXT_SAFE_PARKING"
      | "NEXT_FUEL"
      | "NEXT_HARD_WINDOW"
      | "CURRENT_RISK";
    titleZh: string;
    detailZh: string;
    trailingZh?: string;
    trailingStyle:
      | "PLAIN"
      | "EMPHASIS"
      | "WARNING"
      | "SUCCESS_BADGE"
      | "WARNING_BADGE"
      | "REST_SUGGESTED";
    relatedRiskId?: string;             // CURRENT_RISK → execution-alerts
    relatedPoiId?: string;
    relatedItemId?: string;
  }>;

  /** 活跃 Runbook：触发 Sheet 所需；详情 GET runbooks/{id} */
  activeRunbook?: {
    runbookId: string;
    trigger:
      | "ROAD_CLOSURE"
      | "STRONG_WIND"
      | "FUEL_INSUFFICIENT"
      | "BOOKING_ETA_MISS";
    triggerTitleZh: string;             // 「路段关闭」
    alertSummaryZh: string;
    pageTitleZh: string;                // 「路段关闭处理建议」
    severity: "HIGH" | "CRITICAL";
  } | null;

  evidence?: {
    updatedAt?: string;
    confidence?: number;
  };

  contextVersion?: number;
}
```

### 4.2 `importantInfo` 七行语义

| kind | 含义 | trailing 示例 |
|------|------|----------------|
| `NEXT_ROAD_STATUS` | 下一段道路状态 | 良好 / 封闭 |
| `REMAINING_DRIVE` | 剩余驾驶时间 | 预计到达 … |
| `DELAY_INTERVAL` | 当前延误区间 | `20 – 40 分钟` |
| `NEXT_SAFE_PARKING` | 下一个安全停车点 | 建议休息 |
| `NEXT_FUEL` | 下一个加油点 | 时间·距离·油价 |
| `NEXT_HARD_WINDOW` | 下一个硬时间窗 | 仍可赶上 |
| `CURRENT_RISK` | 当前风险 | 低风险 / 中风险 |

`CURRENT_RISK.relatedRiskId` = alert.`riskId` ?? `id`，与 `execution-alerts` 同源。

### 4.3 仅提醒 `kind`（不得升级为 Runbook）

| kind | 示意 | 不得升级为 |
|------|------|------------|
| `ETA_INCREASED` | ETA 约 +10 分钟 | Runbook / Decision |
| `WIND_INCREASED` | 风力略增、未达高风险 | `STRONG_WIND` Runbook |
| `FUEL_SUGGESTED` | 建议加油（仍可达） | `FUEL_INSUFFICIENT` |
| `REST_SUGGESTED` | 连续驾驶 ≥ 2h | — |
| `SUNSET_BUFFER_DROP` | 日落缓冲下降（黄级） | 删活动类决策 |

高风险同主题 → 走 `activeRunbook`，**替换**而非叠加仅提醒。

### 4.4 字段 ↔ iOS

| API | iOS |
|-----|-----|
| `heading.*` | `ExecutionHeadingStatus` |
| `inlineReminder` | `ExecutionInlineReminder` |
| `appliedProposal` | `ExecutionAppliedProposalSummary` |
| `importantInfo[]` | `ExecutionImportantInfoRow` |
| `activeRunbook` | `ExecutionRunbookTriggerSheet`；详情再拉 |

### 4.5 最小 Fixture

```json
{
  "schemaId": "tripnara.in_trip_home@v1",
  "heading": {
    "destinationNameZh": "维克",
    "destinationLocalName": "Vik",
    "etaRangeLabelZh": "16:20 – 16:40",
    "attention": "NEEDS_ATTENTION",
    "attentionLabelZh": "需关注",
    "progress": 0.65,
    "distanceProgressLabelZh": "62 km / 96 km",
    "remainingDurationLabelZh": "1 小时 25 分钟"
  },
  "inlineReminder": {
    "id": "rem_rest_1",
    "kind": "REST_SUGGESTED",
    "titleZh": "休息建议",
    "messageZh": "你将连续驾驶 2 小时，建议在下一个停车点休息",
    "dismissible": true
  },
  "appliedProposal": null,
  "importantInfo": [
    {
      "kind": "NEXT_ROAD_STATUS",
      "titleZh": "下一段道路状态",
      "detailZh": "1 号公路，通行正常",
      "trailingZh": "良好",
      "trailingStyle": "SUCCESS_BADGE"
    },
    {
      "kind": "REMAINING_DRIVE",
      "titleZh": "剩余驾驶时间",
      "detailZh": "1 小时 25 分钟（约 96 km）",
      "trailingZh": "预计 16:10 到达",
      "trailingStyle": "PLAIN"
    },
    {
      "kind": "DELAY_INTERVAL",
      "titleZh": "当前延误区间",
      "detailZh": "因路肩施工影响",
      "trailingZh": "20 – 40 分钟",
      "trailingStyle": "WARNING"
    },
    {
      "kind": "NEXT_SAFE_PARKING",
      "titleZh": "下一个安全停车点",
      "detailZh": "Dyrhólaey 停车区",
      "trailingZh": "建议休息",
      "trailingStyle": "REST_SUGGESTED"
    },
    {
      "kind": "NEXT_FUEL",
      "titleZh": "下一个加油点",
      "detailZh": "N1 Hvolsvöllur",
      "trailingZh": "45 分钟后 · 42 km · €2.19/L",
      "trailingStyle": "PLAIN"
    },
    {
      "kind": "NEXT_HARD_WINDOW",
      "titleZh": "下一个硬时间窗",
      "detailZh": "维克黑沙滩日落拍摄 · 18:10 截止（当地时间）",
      "trailingZh": "仍可赶上",
      "trailingStyle": "EMPHASIS"
    },
    {
      "kind": "CURRENT_RISK",
      "titleZh": "当前风险",
      "detailZh": "日落前到达缓冲减少",
      "trailingZh": "中风险",
      "trailingStyle": "WARNING_BADGE",
      "relatedRiskId": "risk_sunset_buffer"
    }
  ],
  "activeRunbook": null
}
```

---

## 5. GET Runbook 详情

```
GET /api/mobile/trips/{tripId}/execution/runbooks/{runbookId}
```

`data.schemaId` = `tripnara.execution_runbook@v1`

```typescript
{
  schemaId: "tripnara.execution_runbook@v1";
  runbookId: string;
  trigger: "ROAD_CLOSURE" | "STRONG_WIND" | "FUEL_INSUFFICIENT" | "BOOKING_ETA_MISS";
  pageTitleZh: string;
  alertSummaryZh: string;

  whatHappenedZh: string;       // 1 发生了什么
  doFirstZh: string;            // 2 现在首先该做什么
  impactedItemsZh: string[];    // 3 哪些行程受到影响
  options: Array<{
    optionId: string;
    letter: string;             // A / B / C
    titleZh: string;
    subtitleZh: string;
    impactLabelZh?: string;     // 「+40–60 min」
    isRecommended: boolean;
    verifiedProposalId?: string;
  }>;
  recommendationZh: string;     // 5 推荐哪个
  requiresParkConfirmZh: string;// 6 是否需要停车后确认

  requiresUserConfirm: boolean;
  recommendedOptionId: string;
  relatedRiskId?: string;
  relatedAlertId?: string;
  contextVersion?: number;
}
```

| trigger | 产品名 |
|---------|--------|
| `ROAD_CLOSURE` | Road Closure |
| `STRONG_WIND` | Strong Wind |
| `FUEL_INSUFFICIENT` | Fuel Insufficient |
| `BOOKING_ETA_MISS` | Booking ETA Miss |

**与 DecisionProblem：**

- Runbook **不默认**创建 `DecisionProblem`。
- 方案带 `verifiedProposalId`。
- `requiresUserConfirm=true` → 打开确认 Sheet（§6）。
- `false` → 可直接 apply（或服务端已自动应用，看 home 的 `appliedProposal`）。

非活跃 → `RUNBOOK_NOT_ACTIVE`。

---

## 6. GET Verified Proposal

```
GET /api/mobile/trips/{tripId}/execution/verified-proposals/{proposalId}
```

`data.schemaId` = `tripnara.verified_proposal@v1`

```typescript
{
  schemaId: "tripnara.verified_proposal@v1";
  proposalId: string;
  runbookId: string;
  optionId: string;
  optionLetter: string;
  titleZh: string;                    // 「方案 B：改道绕行」

  impact: {
    delayLabelZh: string;
    detourDistanceLabelZh: string;
    bulletsZh: string[];
  };

  routePreview?: {
    noteZh?: string;
    /** P1；P0 可无 */
    geometryGeoJson?: object;
  };

  confirmReasonsZh: string[];
  confirmReasonCodes: Array<
    | "CHANGE_MAIN_ROUTE"
    | "DELETE_ACTIVITY"
    | "CHANGE_LODGING"
    | "LARGE_DETOUR"
    | "SIGNIFICANT_DRIVE_INCREASE"
    | "ACCEPT_HIGH_RISK"
    | "AFFECTS_BOOKED_ITEM"
  >;

  expiresAt?: string;
  contextVersion?: number;
}
```

约定：`confirmReasonCodes` 非空 ⟺ Runbook 推荐方案需要用户确认（`requiresUserConfirm=true`）。

---

## 7. POST 应用 Verified Proposal

```
POST /api/mobile/trips/{tripId}/execution/verified-proposals/{proposalId}/apply
Idempotency-Key: <uuid>
If-Match: <contextVersion>
Content-Type: application/json
```

```json
{
  "acknowledged": true,
  "clientObservedAt": "2026-07-19T14:40:00Z",
  "optionId": "opt_b_reroute"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `acknowledged` | **是** | 必须 `true` |
| `clientObservedAt` | 否 | ISO-8601 |
| `optionId` | 否 | 若传则须与提案一致 |

### 响应 `data`

```typescript
{
  proposalId: string;
  applied: true;
  appliedAt: string;
  contextVersion: number;
  replay?: boolean;
  inTripHome?: /* 同 §4.1，建议直接用 */;
  appliedProposal?: {
    proposalId: string;
    titleZh: string;
    detailZh: string;
  };
}
```

### 副作用

1. `contextVersion` 递增  
2. WS：`in_trip_home` + `execution`  
3. **不**强制创建 DecisionProblem  
4. 同 `Idempotency-Key` → `replay: true`  
5. 首页应出现 `appliedProposal`

---

## 8. POST 关闭仅提醒

```
POST /api/mobile/trips/{tripId}/execution/inline-reminders/{reminderId}/dismiss
Idempotency-Key: <uuid>
Content-Type: application/json
```

```json
{ "clientObservedAt": "2026-07-19T14:41:00Z" }
```

响应：

```typescript
{ dismissed: true; reminderId: string; replay?: boolean; contextVersion?: number }
```

- P0：按**当前用户**会话级 dismiss  
- **不**消除同源 `execution-alerts`

---

## 9. 推荐调用流

```
1. GET in-trip-home
2. 若 inlineReminder ≠ null → Banner；用户关闭 → POST dismiss
3. 若 activeRunbook ≠ null → 触发 Sheet
   → 进详情 GET runbooks/{runbookId}
   → 选方案：
      - requiresUserConfirm=true → GET verified-proposals/{id} → Sheet → POST apply
      - false → 可直接 POST apply（带 verifiedProposalId）
4. apply 成功：优先用响应内 inTripHome；否则重拉
5. WS changedSections 含 in_trip_home → 重拉 home
```

`CURRENT_RISK.relatedRiskId` → 下钻 `GET .../execution/execution-alerts`（或既有风险详情入口）。

---

## 10. iOS 映射

| 后端 | iOS（拟） |
|------|-----------|
| `GET in-trip-home` | `ExecutionDataRepository.fetchInTripHome` → `ExecutionInTripHomeView` |
| `GET runbooks/{id}` | `fetchRunbook` → `ExecutionRunbookDetailView` |
| `GET verified-proposals/{id}` | `fetchVerifiedProposal` → `ExecutionVerifiedProposalConfirmSheet` |
| `POST .../apply` | `applyVerifiedProposal`（`Idempotency-Key` + `If-Match`） |
| `POST .../dismiss` | `dismissInlineReminder` |
| WS `in_trip_home` | 刷新执行首页 |

---

## 11. 联调验收（iOS）

- [ ] 解码 `tripnara.in_trip_home@v1` / `execution_runbook@v1` / `verified_proposal@v1`
- [ ] `importantInfo.count == 7`，顺序与 kind 固定
- [ ] 仅提醒不进决策空间；确认 Sheet 不强制跳完整决策空间
- [ ] apply / dismiss 带头；冲突处理 `CONTEXT_VERSION_CONFLICT`
- [ ] apply 后展示 `appliedProposal`
- [ ] WS `in_trip_home` 触发刷新
- [ ] 与 `daily-drive-status` 入口分离，不混用

---

## 12. 已裁定

1. 行中首页是 **live 执行投影**，不是今日自驾状态，也不是旧 `statusRows`。  
2. P0：一个 GET home 内嵌提醒摘要 + 活跃 Runbook 触发摘要。  
3. 仅提醒永不进决策空间。  
4. Runbook → Verified Proposal →（条件满足才）用户确认。  
5. 快速动作不在 P0。  
6. 文案优先服务端 `*Zh`。  
7. 路径仅 `/api/mobile/...`。

### P1

- ~~Runbook `defer` / `acknowledge`~~ **已落地**（`POST .../runbooks/{id}/defer|acknowledge`，幂等 + WS `in_trip_home`）
- `routePreview.geometryGeoJson`  
- `execution-overview` 内嵌瘦身字段  

---

## 13. curl 示例

```bash
BASE=http://192.168.8.153:8080/api
TRIP=<tripId>
TOKEN=<bearer>

# 首页
curl -s "$BASE/mobile/trips/$TRIP/execution/in-trip-home" \
  -H "Authorization: Bearer $TOKEN" | jq

# Runbook（runbookId 来自 activeRunbook）
curl -s "$BASE/mobile/trips/$TRIP/execution/runbooks/$RB" \
  -H "Authorization: Bearer $TOKEN" | jq

# 提案
curl -s "$BASE/mobile/trips/$TRIP/execution/verified-proposals/$VP" \
  -H "Authorization: Bearer $TOKEN" | jq

# 应用
curl -s -X POST "$BASE/mobile/trips/$TRIP/execution/verified-proposals/$VP/apply" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "If-Match: $CONTEXT_VERSION" \
  -H "Content-Type: application/json" \
  -d '{"acknowledged":true,"clientObservedAt":"2026-07-19T14:40:00Z"}' | jq

# 关闭提醒
curl -s -X POST "$BASE/mobile/trips/$TRIP/execution/inline-reminders/$REM/dismiss" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"clientObservedAt":"2026-07-19T14:41:00Z"}' | jq

# Runbook 稍后再看 / 我知道了
curl -s -X POST "$BASE/mobile/trips/$TRIP/execution/runbooks/$RB/defer" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}' | jq

curl -s -X POST "$BASE/mobile/trips/$TRIP/execution/runbooks/$RB/acknowledge" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```
