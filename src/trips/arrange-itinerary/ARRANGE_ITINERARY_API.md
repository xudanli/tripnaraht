# 规划工作台 · 编排行程 BFF API

**Base**: `/api/trips/:tripId`  
**模块**: `src/trips/arrange-itinerary/`  
**关联**: `attraction-explore`（候选放置、AI 动作、自动编排）  
**iOS 对接（优先分级 + DoD）**：[`ARRANGE_ITINERARY_IOS_HANDOFF.md`](./ARRANGE_ITINERARY_IOS_HANDOFF.md)

## 核心原则（P1）

所有写入类操作**默认走 PlanProposal 草案链路**，不直接覆盖正式行程：

```
用户操作 → Planning Orchestrator → PlanProposal（草案）
         → Diff Preview + Validation
         → POST .../proposals/:id/apply（用户确认）
         → 写入正式行程
```

- 默认 `commitMode: "proposal"`（可省略）
- 兼容旧行为：`commitMode: "direct"` 仍直接写入

---

## 规划草案 API（新增）

### 编排状态机

```
GET /api/trips/:tripId/arrange-itinerary/orchestration-state
```

**Response**

```json
{
  "tripId": "...",
  "phase": "IDLE | ANALYZING | GENERATING | VALIDATING | PREVIEW | AWAITING_CONFIRMATION | APPLYING | COMPLETED | CONTEXT_STALE | FAILED",
  "activeProposalId": "proposal_...",
  "contextVersion": 108,
  "message": "可选",
  "updatedAt": "2026-07-06T..."
}
```

---

### 列出 / 获取草案

```
GET /api/trips/:tripId/arrange-itinerary/proposals
GET /api/trips/:tripId/arrange-itinerary/proposals/:proposalId
```

---

### 显式创建草案

```
POST /api/trips/:tripId/arrange-itinerary/proposals
```

**Body**

```json
{
  "intent": "PLACE_CANDIDATE | ADD_ITEM | INSERT_REST_GAP | AUTO_ARRANGE | FILL_GAP | OPTIMIZE_ROUTE | ARRANGE_LUNCH | REDUCE_INTENSITY",
  "payload": { "...": "与 intent 对应的请求体" },
  "candidateIds": ["optional — AUTO_ARRANGE 顶层兼容；优先 payload.candidateIds"]
}
```

**AUTO_ARRANGE**（`POST .../proposals`）读取顺序：

1. `payload.candidateIds`（推荐）
2. 顶层 `candidateIds`（兼容）
3. 都没有 → 编排该 trip 全部探索候选

示例：

```json
{
  "intent": "AUTO_ARRANGE",
  "payload": { "candidateIds": ["uuid-1", "uuid-2"] }
}
```

**OR-Tools Shadow（ADR-008）**：`intent` 为 `OPTIMIZE_ROUTE` / `AUTO_ARRANGE` 且 `OR_TOOLS_SOLVER_URL` 已配置时，响应 **`proposal.ortoolsShadow` 必带**（`shadowAuthority: false`）。节点不足或 sidecar 不可达时仍挂 stub，见 `solverUnavailableReason`。**Apply 只认 `changes`，禁止把 `ortoolsShadow.shadowChanges` 当写入源。**  
`OPTIMIZE_ROUTE`：`payload.dayIndex`（1-based）可选；不必再传 `payload.action`（由 intent 映射）。  
详见：[FRONTEND_SHADOW_INTEGRATION.md](../../decision-runtime/solver/FRONTEND_SHADOW_INTEGRATION.md)

---

### 确认写入 / 丢弃

```
POST /api/trips/:tripId/arrange-itinerary/proposals/:proposalId/apply
POST /api/trips/:tripId/arrange-itinerary/proposals/:proposalId/discard
```

**Apply Body**

```json
{
  "contextVersion": 108,
  "force": false
}
```

- `contextVersion` 不匹配 → `409 CONTEXT_STALE`
- `validation.status === "BLOCK"` 且 `force !== true` → `400`

---

### PlanProposal 统一结构

```json
{
  "proposalId": "proposal_001",
  "tripId": "...",
  "intent": "PLACE_CANDIDATE",
  "basePlanVersion": 24,
  "contextVersion": 108,
  "affectedDays": [3],
  "changes": [
    {
      "operation": "ADD",
      "candidateId": "...",
      "placeId": 123,
      "dayIndex": 3,
      "startTime": "10:30",
      "endTime": "12:00",
      "label": "黄金瀑布",
      "removeFromCandidates": true
    },
    {
      "operation": "REMOVE_CANDIDATE",
      "candidateId": "...",
      "dayIndex": 3,
      "label": "黄金瀑布"
    }
  ],
  "benefits": { "itemsAdded": 1 },
  "tradeoffs": ["预计占用 10:30-12:00"],
  "validation": {
    "status": "PASS | WARN | BLOCK",
    "warnings": [],
    "conflicts": [{ "kind": "duplicate_item", "message": "...", "dayIndex": 1, "itemIds": [] }]
  },
  "diff": {
    "summary": "将新增 1 个行程项",
    "timelineChanges": [{ "operation": "ADD", "label": "新增：黄金瀑布", "dayIndex": 3, "impact": "low" }]
  },
  "requiresConfirmation": true,
  "status": "AWAITING_CONFIRMATION",
  "createdAt": "...",
  "expiresAt": "..."
}
```

---

### 写入类接口统一响应（proposal 模式）

```json
{
  "mode": "proposal",
  "tripId": "...",
  "orchestrationState": { "phase": "AWAITING_CONFIRMATION", "contextVersion": 108 },
  "proposal": { "...": "见上" }
}
```

`commitMode: "direct"` 时 `mode: "direct"`，结构与旧版相同（含 `itineraryItem` / `scheduleTimeline`）。

---

## 写入类接口（默认 proposal）

### 候选放入日程

```
POST /api/trips/:tripId/attraction-explore/candidates/:candidateId/place
```

**Body**

```json
{
  "dayIndex": 3,
  "startTime": "10:30",
  "endTime": "12:00",
  "insertMode": "append",
  "anchorItemId": "optional-uuid",
  "removeFromCandidates": true,
  "commitMode": "proposal"
}
```

---

### 自动编排

```
POST /api/trips/:tripId/attraction-explore/auto-arrange
```

可选 mobile 别名（契约相同）：`POST /api/mobile/trips/:tripId/planning/auto-arrange`

**Body**（空 `{}` 仍可用）

```json
{
  "candidateIds": ["optional"],
  "dayIndex": 1,
  "mode": "proposal",
  "commitMode": "proposal",
  "options": {
    "respectNoNightDrive": true,
    "preferWeekendBuffer": false
  }
}
```

- 默认 / 推荐：`mode|commitMode=proposal` → 返回 `proposal`（`intent=AUTO_ARRANGE`，`requiresConfirmation=true`），**未 Apply 不写 Active Plan**
- 空候选 → `400` + `NO_CANDIDATES`
- Proposal 含 `schemePreview`（方案页）以及既有 `diff` / `validation`

`direct` 仅兼容旧行为；iOS / 规划 Dock 请勿默认开启。

---

### 添加活动

```
POST /api/trips/:tripId/arrange-itinerary/items
```

**Body** — 增加 `commitMode?: "proposal" | "direct"`

---

### 插入空档

```
POST /api/trips/:tripId/arrange-itinerary/gaps
```

创建 `type=REST` 行程项；支持 `commitMode`。

---

### AI 编排动作

```
POST /api/trips/:tripId/attraction-explore/ai-actions
POST /api/trips/:tripId/arrange-itinerary/ai-actions
```

**Body**

```json
{
  "action": "fill_gaps | optimize_route | arrange_lunch | reduce_intensity | reduce_driving | resolve_conflicts",
  "dayIndex": 2,
  "candidateIds": ["optional"],
  "commitMode": "proposal"
}
```

| action | 用途 |
|--------|------|
| `fill_gaps` | 用候选补空档 |
| `optimize_route` | 优化当日驾驶/顺序 |
| `arrange_lunch` | 安排午餐 |
| `reduce_intensity` | 降低行程强度 |
| `reduce_driving` | 压缩驾驶负荷（实现上映射 optimize_route） |
| `resolve_conflicts` | 消解当日冲突（实现上映射 optimize_route） |

**注意：** `action` 必须小写蛇形；`OPTIMIZE_ROUTE` 会 400。

**proposal 模式 Response** — 含 `proposal`（含 `schemePreview`）+ `answer` + `suggestedActions`。

---

### 编排页概览

```
GET /api/trips/:tripId/arrange-itinerary/overview
```

---

### 地图联动扩展

```
GET /api/trips/:tripId/attraction-explore/map?viewTab=along_route&dayIndex=2&highlightItemId=route-item-uuid
```

---

## 已有接口（编排页复用）

| 方法 | 路径 |
|------|------|
| GET/PATCH/DELETE | `/attraction-explore/context` / `candidates` |
| GET | `/schedule-timeline?include=items,metrics,travelInfo` |
| PATCH | `/itinerary-items/:itemId` |

---

## 前端推荐流程

1. `POST .../place`（或 ai-actions / auto-arrange）→ 拿到 `proposal`
2. 展示 `diff` + `validation.conflicts`（时间轴「冲突详情」）
3. 用户确认 → `POST .../proposals/:id/apply` with `contextVersion`
4. 刷新 `schedule-timeline`

---

## TS Client

`src/trips/arrange-itinerary/dto/frontend-arrange-itinerary-api-client.ts`

---

## P2 扩展（智能编排深度）

### 智能规划开关

```
GET  /api/trips/:tripId/arrange-itinerary/planning-mode
POST /api/trips/:tripId/arrange-itinerary/planning-mode
```

**Body** `{ "mode": "manual | copilot" }`

- `manual`：仅冲突提醒与局部建议
- `copilot`：可生成草案、发现空档、提出修复建议（仍须确认写入）

---

### 行程项锁定分类

```
GET /api/trips/:tripId/arrange-itinerary/item-locks
```

返回 `lockedItems` / `semiLockedItems` / `mustVisitItems` / `movableItems`。编排 Agent 优化路线时会跳过 locked/semi-locked。

用户手动锁定：在 `trip.metadata.userLockedItemIds` 写入行程项 ID 数组。

---

### 拖拽局部影响分析

```
POST /api/trips/:tripId/arrange-itinerary/items/:itemId/analyze-move
```

**Body** `{ "dayIndex": 2, "startTime": "15:30", "endTime": "17:00" }`

返回 `MOVE_ITEM` 类型的 `PlanProposal`，含 `tradeoffs` 与 `validation`。

---

### 探索推荐增强

- 第一组/顺路组使用评分公式（兴趣、路线、成员、可插入性、体验稀缺、天气、口碑）
- 新增第四组 **`experience_gap`（补足行程体验）**，基于当前行程体验覆盖缺口
- 顺路组展示 `meta.detourMinutes` 与 `badge: 绕路约 N 分钟`

### 候选加入预检

`POST /attraction-explore/candidates` 响应新增 `precheck`：

```json
{
  "precheck": {
    "feasible": true,
    "warnings": [{ "code": "must_go_exceeds_days", "message": "...", "severity": "warn" }]
  }
}
```

仅写入候选池，不修改时间轴。

---

## P3 扩展（意图编译 · 绕路成本 · 地图联动）

### 编译探索意图

```
POST /api/trips/:tripId/attraction-explore/explore-intent
```

**Body** `{ "query": "适合老人、沿黄金圈、停车方便的自然景点" }`

**Response** — `themes` / `suitableFor` / `maxDetourMinutes` / `weatherMode` / `routeContext` 等结构化条件。

`POST /search` 响应新增 `compiledIntent`，并自动合并到检索与评分。

---

### 边际绕路成本

顺路推荐与评分使用冰岛路况启发式（`estimateIcelandCoordinateTravelTime`）：

```
绕路成本 = drive(A→X) + drive(X→B) - drive(A→B)
```

体现在 `meta.detourMinutes`、顺路 badge、候选 `precheck` 与地图 `insertHint`。

---

### 地图插入草案

```
POST /api/trips/:tripId/attraction-explore/map/place-proposal
```

**Body**

```json
{
  "placeId": 381382,
  "dayIndex": 2,
  "candidateId": "optional-uuid"
}
```

**Response** — `suggestions[]`（最多 3 个插入位置）+ `proposal`（`PlanProposal` 草案）

```
GET .../attraction-explore/map?dayIndex=2&includeInsertHints=true
```

候选 POI 附带 `insertHint: { suggestedDayIndex, detourMinutes, detourMethod, startTime }`。

---

## P4 扩展（实时路由 · LLM 意图 · Copilot 建议）

### 实时路由绕路成本

默认仍使用冰岛路况启发式。启用 Google/SmartRoutes 后：

```bash
ATTRACTION_EXPLORE_LIVE_ROUTES=1
# 或
ENABLE_GOOGLE_ROUTE_DETOUR=1
```

影响：`map/place-proposal`、`map?includeInsertHints=true`、候选 `precheck` 绕路估算。

推荐/搜索可选 `useLiveRoutes=true`（query 或 body）对顺路分组使用实时 API。

`meta.detourMethod`：`iceland_heuristic` | `generic_driving` | `live_route_api`

---

### LLM 增强探索意图

```
POST /api/trips/:tripId/attraction-explore/explore-intent
```

**Body** `{ "query": "...", "useLlm": true }`

规则引擎优先；条件不足时合并 LLM 解析。响应含 `source: "rules" | "rules+llm"`。

`POST /search` 支持 `useLlmIntent: true`。

---

### Copilot 协同建议

```
GET /api/trips/:tripId/arrange-itinerary/copilot-suggestions
```

扫描：待确认草案、未编排必去、高绕路候选、日程空档。`copilot` 模式下附带可执行 `actionHint`（place-proposal / fill_gaps）。

与 `POST /planning-mode` `{ "mode": "copilot" }` 配合使用；不自动写入行程。

---

## P5 扩展（协同动作 · 工作台快照 · 候选联动）

### 规划工作台快照

```
GET /api/trips/:tripId/arrange-itinerary/planning-workbench-snapshot
```

聚合：`planning-mode`、`orchestration-state`、overview 指标、item-locks 统计、行程冲突数、top-5 copilot 建议、待确认草案数。

前端可用作探索页 + 编排页共享的 **单一轮询入口**。

---

### 执行协同动作

```
POST /api/trips/:tripId/arrange-itinerary/copilot-actions
```

**Body**

```json
{
  "action": "draft_for_candidate | draft_all_must_go | fill_gaps | execute_suggestion",
  "candidateId": "uuid",
  "suggestionId": "must-go-uuid",
  "dayIndex": 2
}
```

| action | 行为 |
|--------|------|
| `draft_for_candidate` | 为指定候选生成地图插入 `PlanProposal` |
| `draft_all_must_go` | 为首个未编排必去候选生成草案 |
| `fill_gaps` | 调用 ai-actions 填补空档（proposal 模式） |
| `execute_suggestion` | 根据 `copilot-suggestions` 的 `suggestionId` 一键执行 |

仅 `copilot` 模式可用；若已有待确认草案会返回 400。

---

### 添加候选时的协同提示

`POST .../attraction-explore/candidates` 在 copilot 模式下，对 `must_go` / `very_interested` 响应附带：

```json
{
  "copilotNextAction": {
    "action": "draft_for_candidate",
    "candidateId": "uuid",
    "endpoint": "/api/trips/:tripId/arrange-itinerary/copilot-actions"
  }
}
```

前端可在用户确认后 `POST` 该 endpoint 生成草案，仍须走 apply 链路写入。

---

## P6 决策语义（P0 选项 · P1 决策簇）

### P0 — 每个 option / action 返回

`PlanProposal.decisionPack.options[]` 及 copilot `suggestions[].option`：

```json
{
  "id": "proposal_xxx_primary",
  "optionKind": "SHIFT_EARLIER | SHORTEN_STAY | SHIFT_LATER | ACCEPT_RISK",
  "badge": "方案 A",
  "letter": "A",
  "headline": "提前 20 分钟离开起点",
  "description": "在高发拥堵时段前出发，降低风险，顺畅到达景点。",
  "title": "提前 20 分钟离开起点",
  "recommended": true,
  "outcomes": ["延误风险降低至低风险", "午餐预计不受影响", "交通缓冲增加至 +17 分钟"],
  "costs": ["正常停留需缩短约 1 小时 40 分钟", "起床更早"],
  "outcomeItems": [
    { "id": "out_delay_risk", "text": "延误风险降低至低风险", "tone": "good" },
    { "id": "out_lunch", "text": "午餐预计不受影响", "tone": "good" },
    { "id": "out_buffer", "text": "交通缓冲增加至 +17 分钟", "tone": "good" }
  ],
  "costItems": [
    { "id": "cost_dwell", "text": "正常停留需缩短约 1 小时 40 分钟", "tone": "caution" },
    { "id": "cost_wake", "text": "起床更早", "tone": "caution" }
  ],
  "dataBasis": [
    { "id": "basis_congestion_history", "label": "历史 1 年拥堵", "icon": "history", "reliability": "medium" },
    { "id": "basis_route_segment", "label": "路段卡口数据", "icon": "sensor", "reliability": "high" },
    { "id": "basis_weather", "label": "天气影响（中到高）", "icon": "weather", "reliability": "medium" }
  ],
  "impactScope": {
    "scope": "DAY | TRIP | CANDIDATE_POOL | ITEM",
    "affectedDays": [2],
    "itemIds": [],
    "candidateIds": ["uuid"],
    "placeIds": [381375]
  },
  "counterfactualRows": [
    { "id": "cf_0", "label": "新增：黄金瀑布", "before": "（当前行程）", "after": "2 10:30-12:00" }
  ],
  "action": { "type": "apply_proposal", "proposalId": "proposal_xxx" }
}
```

完整包：`proposal.decisionPack`（`schema: tripnara.planning_decision_pack@v1`）。

**方案卡 UI 映射：**

| UI 区域 | 字段 |
|---------|------|
| 角标「方案 A」+「推荐」 | `badge` + `recommended` |
| 主标题 | `headline`（fallback `title`） |
| 副文案 | `description` |
| 预计结果 ✓ | `outcomeItems[]`（`tone: good`） |
| 代价 • | `costItems[]`（`tone: caution`） |
| 数据依据 footer | `dataBasis[]`（`icon` + `label`） |

`outcomes` / `costs` 字符串数组与 `outcomeItems` / `costItems` 同步，兼容旧客户端。

---

### P1 — 决策簇与写回

`decisionPack.decisionClusters[]` — 最多 14 条 `diagnostics` 聚合为 ≤5 簇：

| 字段 | 说明 |
|------|------|
| `diagnosticCount` | 簇内诊断数 |
| `decisionId` | 决策锚点 `decision_{clusterId}` |
| `dependsOn` | 需先解决的簇 id |
| `resolvesCount` | 本决策可消除的诊断数 |
| `options` | 该簇可选方案（P0 结构） |

**写回后** `POST .../proposals/:id/apply` 响应新增：

- `executionSteps[]` — 逐步执行记录（`done` 状态）
- `validUntil` — 与草案 TTL 对齐
- `monitorWebhookUrl` — 失效轮询地址

**失效监控**：

```
GET /api/trips/:tripId/arrange-itinerary/proposals/:proposalId/monitor
```

```json
{
  "validUntil": "2026-07-06T...",
  "contextVersion": 108,
  "isStale": false,
  "monitorWebhookUrl": "/api/trips/.../proposals/.../monitor"
}
```

`planning-workbench-snapshot` 的 `copilot.decisionClusters` 汇总当前待确认草案的簇摘要。

---

## 前端决策卡片集成

**类型与工具（复制到前端 repo）：**

| 文件 | 用途 |
|------|------|
| `dto/frontend-planning-decision-pack.types.ts` | P0/P1 类型 SSOT |
| `dto/frontend-planning-decision-card.util.ts` | 推荐选项、簇排序、impact 摘要 |
| `dto/frontend-arrange-itinerary-api-client.ts` | API + re-export |

**推荐 UI 流程：**

```
mutation → proposal.decisionPack
  → PlanProposalDecisionSheet
    → options[] 卡片（outcomes / costs / counterfactualRows）
    → applyPlanProposal / discardPlanProposal
    → poll fetchProposalMonitor until isStale
    → executionSteps 步骤条
```

**Copilot 入口：** `fetchCopilotSuggestions` → `suggestion.option` 轻量预览 → `runCopilotAction` 或加载完整 `getPlanProposal`。

**轮询入口：** `fetchPlanningWorkbenchSnapshot` → `copilot.decisionClusters` 队列徽章 → 点击加载 `orchestration.activeProposalId` 完整 `decisionPack`。

**TripConflicts 对齐：** `decisionPack.diagnostics` 合并 `GET /trips/:id/conflicts` 诊断；`options` 可含 `action.payload.source: 'trip_conflicts'` 修复建议。

---

## 决策依据卡（发生了什么 + 上下文六格）

供规划工作台问题说明卡：顶部叙事 + 横向决策依据网格 + 底部可选方案数。

```
GET /api/trips/:tripId/arrange-itinerary/decision-basis?conflictId={optional}&proposalId={optional}
```

| 查询参数 | 说明 |
|----------|------|
| `conflictId` | 可选；指定 `GET /conflicts` 中的冲突 id |
| `proposalId` | 可选；绑定草案，返回 `optionCount`（排除 discard 方案） |

未传 `conflictId` 时自动选取首个 `TRANSPORT_INSUFFICIENT` / `BUFFER_INSUFFICIENT` 冲突。

**响应** `schema: tripnara.planning_decision_basis@v1`：

```json
{
  "schema": "tripnara.planning_decision_basis@v1",
  "tripId": "3e4a1058-...",
  "conflictId": "cfl_transport_...",
  "proposalId": "proposal_xxx",
  "whatHappened": {
    "headline": "发生了什么？",
    "narrative": "第1天：蓝湖温泉 -> 哈尔格林姆斯教堂（约 38.6 km）：预计需要 47 分钟，原计划仅预留 30 分钟缓冲。",
    "dayIndex": 1
  },
  "contextFields": [
    { "id": "field_travel_time", "key": "estimated_travel_minutes", "label": "道路预计耗时", "value": "47 分钟", "subtext": "含当前路况修正", "icon": "travel_time", "tone": "good" },
    { "id": "field_planned_buffer", "key": "planned_buffer_minutes", "label": "原计划缓冲", "value": "30 分钟", "icon": "buffer" },
    { "id": "field_from_dwell", "key": "from_dwell", "label": "蓝湖温泉停留", "value": "2 小时", "subtext": "成员共同选择", "icon": "dwell" },
    { "id": "field_to_reservation", "key": "to_reservation", "label": "哈尔格林姆教堂预约", "value": "无预约", "subtext": "可灵活调整", "icon": "reservation" },
    { "id": "field_lunch", "key": "lunch_reservation", "label": "午餐预约", "value": "12:40", "subtext": "已预订", "icon": "lunch", "tone": "good" },
    { "id": "field_validity", "key": "data_validity", "label": "数据有效期", "value": "今天 18:00", "subtext": "更新于 12:43", "icon": "validity" }
  ],
  "dataValidUntil": "2026-07-06T18:00:00.000Z",
  "updatedAt": "2026-07-06T12:43:00.000Z",
  "optionCount": 2,
  "refreshUrl": "/api/trips/.../arrange-itinerary/decision-basis?conflictId=..."
}
```

### 字段说明

| 区块 | 字段 | 说明 |
|------|------|------|
| 发生了什么 | `whatHappened.narrative` | 后端格式化完整句子，禁止前端拼接 |
| 决策依据 | `contextFields[]` | 按冲突类型动态输出 4–6 格 |
| 数据有效期 | `dataValidUntil` + `updatedAt` | 底部时效展示 |
| 可选方案 | `optionCount` | 与 `decisionPack.options`（不含 discard）对齐 |

### 数据来源

1. `TripConflictsService` — 路段耗时、缓冲、gap、`fromItemId`/`toItemId`
2. `ItineraryItem` — 停留时长、`bookingStatus`/`bookingConfirmation`（预约/午餐）
3. `PlanProposal.decisionPack` — `optionCount`

### 前端集成

| 文件 | 用途 |
|------|------|
| `dto/frontend-planning-decision-basis.types.ts` | 类型 + `DECISION_BASIS_FIELD_ICON_KEYS` |
| `dto/frontend-arrange-itinerary-api-client.ts` | `fetchDecisionBasis(token, tripId, { conflictId, proposalId })` |

**推荐流程：** 选中冲突 / 草案 → `fetchDecisionBasis` → 渲染 `whatHappened` + `contextFields` 网格 → 下方加载 `decisionPack.options` 方案卡。

---

## 决策检查器（四 Tab 统一读模型）

供规划工作台「决策检查器」：`因果链` / `计划差异` / `成员共识` / `可执行性` 一次拉取。

```
GET /api/trips/:tripId/arrange-itinerary/decision-inspector?proposalId=&problemId=&optionId=&conflictId=
```

| 查询参数 | 说明 |
|----------|------|
| `proposalId` | 编排草案模式 — 有待确认 `PlanProposal` 时传入 |
| `problemId` | **决策空间模式** — 与 `decision-problems[].problemId` 对齐；无草案时仅传此项 |
| `optionId` | 可选 — `decisionPack.options[].id`，默认 `recommended`（仅 `proposalId` 模式） |
| `conflictId` | 可选 — 聚焦某条冲突（`trip-conflicts` / `planning-conflicts` id） |

**`proposalId` 与 `problemId` 至少填一项。**

**响应** `schema: tripnara.planning_decision_inspector@v1`：

```json
{
  "schema": "tripnara.planning_decision_inspector@v1",
  "tripId": "...",
  "mode": "problem | proposal",
  "proposalId": "proposal_xxx",
  "problemId": "dp_id:...",
  "optionId": "proposal_xxx_primary",
  "tabEmptyState": {
    "causalChain": false,
    "planDiff": true,
    "memberConsensus": true,
    "feasibility": true
  },
  "refreshUrl": "/api/trips/.../decision-inspector?problemId=...",
  "decisionBasis": { "...": "同 decision-basis 接口，供顶部问题卡" },
  "causalChain": { "...": "同 decision-causal-chain" },
  "planDiff": {
    "optionBadge": "方案 A",
    "optionTitle": "提前 20 分钟离开起点",
    "changeRows": [],
    "impactTags": [],
    "unchangedItems": [],
    "timelineCompare": { "milestones": [] }
  },
  "memberConsensus": {
    "summaryBar": "1 位成员中：0 人支持，0 人有异议，1 人未回复",
    "supportCount": 0,
    "objectionCount": 0,
    "pendingCount": 1,
    "opinions": [{ "displayName": "行程创建者", "stance": "pending" }],
    "aiSummary": [],
    "assessment": {
      "statusMessage": "选定方案后可查看成员共识",
      "canCreatorConfirm": false
    }
  },
  "feasibility": {
    "canSafelyWrite": false,
    "headline": "尚未选定具体方案，暂无法评估写入可行性",
    "gateChecks": [{ "label": "日程可行性", "status": "warn" }],
    "executionSummary": [],
    "verdict": { "status": "feasible", "message": "最终结论：待选方案" }
  }
}
```

### 模式与空态

| `mode` | 触发 | 计划差异 / 可执行性 |
|--------|------|---------------------|
| `problem` | 仅 `problemId`（决策空间选中队列项） | `planDiff` 为空；`feasibility.canSafelyWrite=false`；**因果链首包为空**，Tab 打开时调 `GET decision-causal-chain` |
| `proposal` | 有 `proposalId`（草案确认） | 由草案 diff / validation 投影 |

前端 **必须** 读 `tabEmptyState`：为 `true` 的 Tab 展示空态 UI，**禁止**使用本地 fixture 占位文案。

无 BFF 数据时后端不再返回「希望规避拥堵…」「预订不变」「今天 18:00」等硬编码占位。

### Tab 映射

| Tab | 响应字段 |
|-----|----------|
| 因果链 | `causalChain.nodes[]` |
| 计划差异 | `planDiff` — 详见 [DECISION_INSPECTOR_PLAN_DIFF.md](../decision-semantics/DECISION_INSPECTOR_PLAN_DIFF.md) |
| 成员共识 | `memberConsensus` |
| 可执行性 | `feasibility` |

顶部「发生了什么 + 决策依据六格」：`decisionBasis`（与独立 `GET decision-basis` 同构）。

### 前端集成

```typescript
import { fetchDecisionInspector } from './frontend-arrange-itinerary-api-client';

// 决策空间 — 选中队列项
const inspector = await fetchDecisionInspector(token, tripId, {
  problemId: selectedProblemId,
});

// 编排草案确认
const inspectorWithProposal = await fetchDecisionInspector(token, tripId, {
  proposalId: activeProposalId,
  optionId: selectedOptionId,
  problemId: selectedProblemId,
});

if (inspector.tabEmptyState.planDiff) {
  // 展示「请先生成或选择方案」空态
}
```

| 文件 | 用途 |
|------|------|
| `dto/frontend-planning-decision-inspector.types.ts` | 四 Tab 类型 re-export |
| `dto/frontend-arrange-itinerary-api-client.ts` | `fetchDecisionInspector()` |

---

## 决策因果链（竖向影响传播）

供规划工作台「决策因果链」组件：根因 → 缓冲消耗 → POI 到达延后 → 午餐余量 → 连锁延误风险。

```
GET /api/trips/:tripId/arrange-itinerary/decision-causal-chain?proposalId={optional}&problemId={optional}&optionId={optional}
```

| 查询参数 | 说明 |
|----------|------|
| `proposalId` | 可选；绑定当前待确认草案，模拟 MOVE 级联与交通缓冲消耗 |
| `problemId` | 可选；决策空间模式，与 `decision-problems[].problemId` 对齐；无草案时 Tab 懒加载入口 |
| `optionId` | 可选；已选修复方案 `actions[].actionId`，追加 preview 传播节点 |

**problemId 模式数据来源（优先级）：**

1. `world_context` — 冰岛行程：因果运行时 session 或路段 wind→P90 轻量评估（P1 信号注入）
2. `readiness` — `trip.metadata.readinessCausalPreAnalysis` 级联
3. `problem.assertions[]`（Gateway debug rawLegacy）
4. `option_preview` — 传 `optionId` 时内联 `POST .../options/:id/preview`
5. `decision-checker.evidence.items`（cascade 为空时的兜底）

**Bundle 首包**仍返回 `tabEmptyState.causalChain=true`；Tab 打开时调本接口补全节点。

**响应** `schema: tripnara.planning_causal_chain@v1`：

```json
{
  "schema": "tripnara.planning_causal_chain@v1",
  "tripId": "3e4a1058-...",
  "proposalId": "pp_abc",
  "generatedAt": "2026-07-06T09:30:00.000Z",
  "basisUpdatedAt": "2026-07-06T09:18:00.000Z",
  "basisSource": "mixed",
  "refreshUrl": "/api/trips/.../arrange-itinerary/decision-causal-chain?proposalId=pp_abc",
  "nodes": [
    {
      "id": "node_1",
      "order": 0,
      "severity": "info",
      "description": "道路预计耗时增加 17 分钟（当前路段受交通与天气影响）",
      "source": "validation"
    },
    {
      "id": "node_2",
      "order": 1,
      "severity": "info",
      "description": "原计划交通缓冲被消耗",
      "source": "validation"
    },
    {
      "id": "node_3",
      "order": 2,
      "severity": "warn",
      "description": "哈尔格林姆教堂到达时间延后",
      "entityLabel": "哈尔格林姆教堂",
      "source": "proposal"
    },
    {
      "id": "node_4",
      "order": 3,
      "severity": "risk",
      "description": "午餐前可用余量下降",
      "source": "validation"
    },
    {
      "id": "node_5",
      "order": 4,
      "severity": "risk",
      "description": "当天后续安排存在连锁延误风险",
      "source": "validation"
    }
  ]
}
```

### 节点字段

| 字段 | 说明 |
|------|------|
| `severity` | `info`（绿）/ `warn`（蓝）/ `risk`（红）— 前端按色渲染竖链 |
| `order` | 因果顺序，从 0 递增 |
| `description` | 主文案（后端已格式化，禁止前端拼句子） |
| `entityLabel` / `itemId` | 关联 POI/行程项 |
| `netImpactMinutes` | 净时间影响（分钟） |
| `source` | `proposal` / `validation` / `readiness` / `decision_checker` / `problem_assertion` / `option_preview` / `world_context` |

### 数据来源优先级

1. **有 `proposalId`**：`ItineraryValidationService` 级联模拟（MOVE 变更）+ `diff.timelineChanges`
2. **有 `problemId` + `optionId`**：assertions 根因链 + preview 方案传播链
3. **冰岛 `world_context`**：决策引擎 causal-runtime session 或路段 wind→P90 评估
4. **Readiness**：`trip.metadata.readinessCausalPreAnalysis` → `cascadeUiHints`
5. **兜底**：`GET decision-checker` → `impact.cascade[]`（无草案/无 readiness 时）

`basisUpdatedAt` 供「刷新依据 · N 分钟前」展示；点击刷新重新请求本接口（`refreshUrl`）。

### 前端集成

| 文件 | 用途 |
|------|------|
| `dto/frontend-planning-causal-chain.types.ts` | 类型 + `CAUSAL_CHAIN_SEVERITY_COLORS` + `formatCausalChainBasisAge` |
| `dto/frontend-arrange-itinerary-api-client.ts` | `fetchDecisionCausalChain(token, tripId, { proposalId?, problemId?, optionId? })` |

**推荐流程（决策空间）：** 选中 problem → 打开因果链 Tab → 选方案后带 `optionId` 重新请求 → 按 `nodes[].order` 渲染竖链。

