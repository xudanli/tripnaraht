# 行程编排 · iOS 对接文档

> **状态**：后端可联调  
> **日期**：2026-07-15  
> **读者**：iOS 客户端  
> **原则**：写入类操作 **默认走 PlanProposal 草案**（`commitMode: "proposal"`），用户确认后再 apply；**禁止默认 `direct` 直写正式行程**。

**相关文档**  
- 完整 BFF 说明（含探索/决策检查器细节）：[`ARRANGE_ITINERARY_API.md`](./ARRANGE_ITINERARY_API.md)  
- 决策空间（待决策队列，另一套写链）：[`../../decision-runtime/decision-cases/DECISION_SPACE_IOS_HANDOFF.md`](../../decision-runtime/decision-cases/DECISION_SPACE_IOS_HANDOFF.md)  
- 整体准备度：[`../overall-readiness/OVERALL_TRIP_READINESS_FE_HANDOFF.md`](../overall-readiness/OVERALL_TRIP_READINESS_FE_HANDOFF.md)  
- TS Client / 类型 SSOT：`dto/frontend-arrange-itinerary-api-client.ts`  
- **UWC-1e 有效写回（same-day / remind / PlanVersion-only）**：[`../../decision-runtime/execution/authoritative-write/UWC_1E_WEB_IOS_HANDOFF.md`](../../decision-runtime/execution/authoritative-write/UWC_1E_WEB_IOS_HANDOFF.md) — Preview→Confirm→Apply；页面不得直调 Apply  
- **打开条件：** 提案带 `uwcPreview.open=true` 且含 `timeUpdates` 或 `decisionId`+`planVersionId`+`expectedPlanVersionId`；否则沿用原 Arrange Apply  
- Swagger：`/api-docs` → `trip-arrange-itinerary` / `trip-attraction-explore`

---

## 1. 产品一句话

| 概念 | 含义 | 接口 |
|------|------|------|
| **行程编排** | 把候选 / 空档 / AI 动作变成正式日程 | `arrange-itinerary/*` + `attraction-explore/*` 写入口 |
| **PlanProposal 草案** | 变更预览 + 校验，未写入 | mutation 返回 `proposal` |
| **确认写入** | 用户看过 diff 后落正式行程 | `POST …/proposals/:id/apply` |
| **决策空间** | 车型/保险/冰川等约束确认（**不是**编排草案） | 见 Decision Space handoff |

```
用户操作（放候选 / 加活动 / AI 动作）
  → PlanProposal（diff + validation）
  → UI 确认
  → POST proposals/:id/apply（带 contextVersion）
  → 刷新 schedule-timeline
```

---

## 2. 环境与约定

| 项 | 值 |
|----|-----|
| Base URL | `{HOST}/api` |
| 鉴权 | `Authorization: Bearer <token>`；本地 dev 可无 token |
| Trip 成员 | 非成员 → `FORBIDDEN` |
| 响应包装 | 与决策空间相同：`{ success, data }` / `{ success:false, error }` |
| 默认 `commitMode` | **`proposal`**（省略即 proposal） |
| 联调 trip | `3e4a1058-9218-467f-988a-c18008a14385` |

前缀：

- 编排：`/api/trips/{tripId}/arrange-itinerary/…`
- 探索写入口：`/api/trips/{tripId}/attraction-explore/…`
- 时间轴：`/api/trips/{tripId}/schedule-timeline`

---

## 3. 推荐页面与调用顺序

```
编排页首屏
  GET schedule-timeline?include=items,metrics,travelInfo
  GET arrange-itinerary/planning-workbench-snapshot   // 或拆开拉 overview + orchestration-state
  （可选）GET arrange-itinerary/overview
  （可选）GET conflicts

放候选 / 加活动 / AI 动作
  POST attraction-explore/candidates/:id/place
    或 POST arrange-itinerary/items | gaps | ai-actions
  → 展示 proposal.diff + validation + decisionPack.options

确认
  POST arrange-itinerary/proposals/:id/apply
       body { contextVersion }
  → 刷新 schedule-timeline；轮询 monitor 可选

丢弃
  POST arrange-itinerary/proposals/:id/discard

拖拽改时间（可选）
  POST arrange-itinerary/items/:itemId/analyze-move
  → 同上走 apply

与决策空间桥接（可选）
  GET arrange-itinerary/decision-inspector?problemId=…
  GET arrange-itinerary/decision-causal-chain?problemId=…
```

Apply 成功后：刷新时间轴；若首页有准备度卡，再拉 `timeline-overview` / `overall-readiness`。

---

## 4. API 总表（按 iOS 优先级）

### 4.1 P0 必接 — 时间轴 + 草案主链

| Method | Path | 用途 |
|--------|------|------|
| `GET` | `/schedule-timeline?include=items,metrics,travelInfo` | **正式行程时间轴**（编排页主数据） |
| `GET` | `/arrange-itinerary/orchestration-state` | 编排状态机 + `contextVersion` / `activeProposalId` |
| `GET` | `/arrange-itinerary/proposals` | 待确认草案列表 |
| `GET` | `/arrange-itinerary/proposals/{proposalId}` | 草案详情 |
| `POST` | `/arrange-itinerary/proposals/{proposalId}/apply` | **确认写入** |
| `POST` | `/arrange-itinerary/proposals/{proposalId}/discard` | 丢弃草案 |

### 4.2 P0 必接 — 写入入口（均默认出草案）

| Method | Path | 用途 |
|--------|------|------|
| `POST` | `/attraction-explore/candidates/{candidateId}/place` | 候选放入某天 |
| `POST` | `/arrange-itinerary/items` | 添加活动 |
| `POST` | `/arrange-itinerary/gaps` | 插入休息空档 |
| `POST` | `/arrange-itinerary/ai-actions` | AI：`fill_gaps` / `optimize_route` / `arrange_lunch` / `reduce_intensity` / `reduce_driving` / `resolve_conflicts` |
| `POST` | `/attraction-explore/auto-arrange` | 自动编排候选（proposal 模式；空候选 → `NO_CANDIDATES`） |
| `POST` | `/api/mobile/trips/{tripId}/planning/auto-arrange` | 上者 mobile 别名（同契约；**不要**再实现 `planning/ai-optimize`） |

与 `arrange-itinerary/ai-actions` 等价：`POST /attraction-explore/ai-actions`（二选一即可）。

### 4.3 P1 建议接 — 工作台 / Copilot / 拖拽

| Method | Path | 用途 |
|--------|------|------|
| `GET` | `/arrange-itinerary/planning-workbench-snapshot` | **单一轮询入口**（模式/态/冲突/建议/待确认数） |
| `GET` | `/arrange-itinerary/overview` | 左栏路线概览（里程/活动数等） |
| `GET`/`POST` | `/arrange-itinerary/planning-mode` | `manual` \| `copilot` |
| `GET` | `/arrange-itinerary/item-locks` | 锁定 / 可移动分类 |
| `POST` | `/arrange-itinerary/items/{itemId}/analyze-move` | 拖拽后出 `MOVE_ITEM` 草案（仅 proposal） |
| `GET` | `/arrange-itinerary/copilot-suggestions` | 协同建议 |
| `POST` | `/arrange-itinerary/copilot-actions` | 执行建议（仍出草案，不直写） |
| `GET` | `/arrange-itinerary/proposals/{proposalId}/monitor` | 草案时效轮询 |
| `POST` | `/attraction-explore/map/place-proposal` | 地图 POI 插入建议 + 草案 |
| `GET` | `/conflicts` | 行程冲突列表 |

### 4.4 P1/P2 — 决策可读模型（与决策空间共用组件时）

| Method | Path | 用途 |
|--------|------|------|
| `GET` | `/arrange-itinerary/decision-basis` | 「发生了什么」+ 依据六格 |
| `GET` | `/arrange-itinerary/decision-causal-chain` | 因果链竖向节点 |
| `GET` | `/arrange-itinerary/decision-inspector` | 四 Tab 检查器（`proposalId` 或 `problemId`） |
| `GET` | `/decision-space-bundle` | 决策空间首屏聚合（需 `problemId` 或 `proposalId`） |
| `POST` | `/arrange-itinerary/proposals` | 显式按 `intent` 建草案 |

### 4.5 探索侧（放候选前的读数据，P1）

| Method | Path | 用途 |
|--------|------|------|
| `GET` | `/attraction-explore/candidates` | 候选池 |
| `POST` | `/attraction-explore/candidates` | 加入候选（不改时间轴） |
| `GET` | `/attraction-explore/recommendations` | 推荐 |
| `GET` | `/attraction-explore/map` | 地图候选；可加 `includeInsertHints=true` |
| `POST` | `/attraction-explore/search` | 搜索 |
| `POST` | `/attraction-explore/explore-intent` | 自然语言意图编译 |

### 4.6 本期不必接

- `commitMode: "direct"`（兼容 Web 旧行为，新产品勿用）  
- OR-Tools `ortoolsShadow` 当写入源（仅 shadow 展示；apply 只认 `proposal.changes`）  
- 手改 `trip.metadata.userLockedItemIds`（锁展示用 `item-locks` 即可）  
- 决策空间写链 `decision-problems` resolutions/apply（那是另一产品面）

---

## 5. 核心响应形状

### 5.1 proposal 模式统一外壳

```json
{
  "success": true,
  "data": {
    "mode": "proposal",
    "tripId": "…",
    "orchestrationState": {
      "phase": "AWAITING_CONFIRMATION",
      "activeProposalId": "proposal_…",
      "contextVersion": 108,
      "updatedAt": "…"
    },
    "proposal": { /* PlanProposal */ }
  }
}
```

AI 动作额外可能有：`answer`、`suggestedActions`。

### 5.2 PlanProposal（关键字段）

| 字段 | iOS 用途 |
|------|----------|
| `proposalId` | apply / discard / monitor 路径参数 |
| `intent` | 文案 / 埋点 |
| `contextVersion` | **apply 必带回**；过期 → 409 |
| `changes[]` | 机器可读变更 |
| `diff.summary` / `diff.timelineChanges` | 确认 Sheet 主文案 |
| `validation.status` | `PASS` / `WARN` / `BLOCK` |
| `validation.conflicts` | 冲突列表 UI |
| `tradeoffs[]` | 代价提示 |
| `decisionPack` | 方案卡（有则优先用，见 §7） |
| `requiresConfirmation` | 恒 true（proposal 模式） |
| `status` | 如 `AWAITING_CONFIRMATION` |
| `expiresAt` | TTL |

### 5.3 Apply body / 结果

```http
POST /api/trips/{tripId}/arrange-itinerary/proposals/{proposalId}/apply
Content-Type: application/json

{ "contextVersion": 108, "force": false }
```

| 条件 | 结果 |
|------|------|
| `contextVersion` 不匹配 | **409** `CONTEXT_VERSION_CONFLICT`；同时 `orchestration-state.phase` → `CONTEXT_STALE` → 刷新 state / 重建草案 |
| `validation.status == BLOCK` 且 `force != true` | **400** → 展示 conflicts，勿强写 |
| 成功 | `status: APPLIED`；可选 `executionSteps`、`scheduleTimeline`、`monitorWebhookUrl` |

### 5.4 OrchestrationPhase

`IDLE` · `ANALYZING` · `GENERATING` · `VALIDATING` · `PREVIEW` · `AWAITING_CONFIRMATION` · `APPLYING` · `COMPLETED` · `CONTEXT_STALE` · `NO_FEASIBLE_PLAN` · `PARTIAL_RESULT` · `FAILED`

UI：有 `activeProposalId` 且 phase=`AWAITING_CONFIRMATION` → 展示「待确认」角标。

---

## 6. 写入 Body 速查

### 放候选

```json
POST …/attraction-explore/candidates/{candidateId}/place
{
  "dayIndex": 3,
  "startTime": "10:30",
  "endTime": "12:00",
  "insertMode": "append",
  "anchorItemId": "optional-uuid",
  "removeFromCandidates": true
}
```

`dayIndex` 为 **1-based**。`insertMode`: `append` | `before` | `after`。

### 加活动 / 空档

```json
POST …/arrange-itinerary/items
{
  "dayIndex": 2,
  "type": "ATTRACTION",
  "startTime": "14:00",
  "endTime": "16:00",
  "placeId": 381382,
  "placeName": "可选"
}

POST …/arrange-itinerary/gaps
{
  "dayIndex": 2,
  "startTime": "12:00",
  "endTime": "13:00",
  "label": "休息"
}
```

### AI 动作

```json
POST …/arrange-itinerary/ai-actions
{
  "action": "fill_gaps",
  "dayIndex": 2,
  "candidateIds": ["optional"]
}
```

`action`: `fill_gaps` | `optimize_route` | `arrange_lunch` | `reduce_intensity` | `reduce_driving` | `resolve_conflicts`  
（后两者映射到路线优化语义；必须小写蛇形）

Apply 还可选：

```json
{ "contextVersion": 123, "enabledItemIds": ["cand-uuid"], "comment": "采用自动编排草案" }
```

`enabledItemIds` 对应 `proposal.schemePreview.executableItems[].id`。

提案响应请优先展示：

1. `proposal.schemePreview`（analysisSteps / suggestions / comparison / timelinePreview）
2. 否则回退 `proposal.diff` + `validation.warnings`

### 显式创建草案

```json
POST …/arrange-itinerary/proposals
{
  "intent": "AUTO_ARRANGE",
  "payload": { "candidateIds": ["uuid-1"] }
}
```

`intent`: `PLACE_CANDIDATE` | `ADD_ITEM` | `INSERT_REST_GAP` | `AUTO_ARRANGE` | `FILL_GAP` | `OPTIMIZE_ROUTE` | `ARRANGE_LUNCH` | `REDUCE_INTENSITY`

### 拖拽分析

```json
POST …/arrange-itinerary/items/{itemId}/analyze-move
{
  "dayIndex": 2,
  "startTime": "15:30",
  "endTime": "17:00"
}
```

仅支持 proposal（传 `direct` → 400）。

### Copilot 动作（需 `planning-mode=copilot`）

```json
POST …/arrange-itinerary/copilot-actions
{
  "action": "draft_for_candidate",
  "candidateId": "uuid"
}
```

`action`: `draft_for_candidate` | `draft_all_must_go` | `fill_gaps` | `execute_suggestion`  
已有待确认草案时可能 400。

---

## 7. `decisionPack` 方案卡（有则用）

`proposal.decisionPack` schema：`tripnara.planning_decision_pack@v1`

| UI | 字段 |
|----|------|
| 角标「方案 A」+ 推荐 | `options[].badge` + `recommended` |
| 标题 | `headline`（fallback `title`） |
| 结果 | `outcomeItems[]`（`tone: good`） |
| 代价 | `costItems[]`（`tone: caution`） |
| 依据 footer | `dataBasis[]` |
| 确认动作 | `action.type == apply_proposal` → apply 该 `proposalId` |

兼容：`outcomes` / `costs` 字符串数组与 items 同步。

---

## 8. Codable 参考（精简）

```swift
enum PlanProposalCommitMode: String, Codable {
  case proposal, direct
}

enum OrchestrationPhase: String, Codable {
  case IDLE, ANALYZING, GENERATING, VALIDATING, PREVIEW
  case AWAITING_CONFIRMATION, APPLYING, COMPLETED
  case CONTEXT_STALE, NO_FEASIBLE_PLAN, PARTIAL_RESULT, FAILED
}

struct OrchestrationState: Codable {
  let tripId: String
  let phase: OrchestrationPhase
  let activeProposalId: String?
  let contextVersion: Int
  let message: String?
  let updatedAt: String
}

struct PlanProposalValidation: Codable {
  let status: String // PASS | WARN | BLOCK
  let warnings: [String]
  let conflicts: [[String: AnyCodable]] // 或专用 Conflict 模型
}

struct PlanProposal: Codable, Identifiable {
  var id: String { proposalId }
  let proposalId: String
  let tripId: String
  let intent: String
  let basePlanVersion: Int
  let contextVersion: Int
  let affectedDays: [Int]
  let tradeoffs: [String]
  let validation: PlanProposalValidation
  let requiresConfirmation: Bool
  let status: String
  let createdAt: String
  let expiresAt: String
  // changes / diff / decisionPack 按需 Decode
}

struct PlanProposalMutationResponse: Codable {
  let mode: PlanProposalCommitMode
  let tripId: String
  let orchestrationState: OrchestrationState
  let proposal: PlanProposal?
  let answer: String?
}
```

与决策空间共用同一套 `APIResponse<T>` 包装即可。

---

## 9. 错误处理

| HTTP / code | 场景 | iOS 处理 |
|-------------|------|----------|
| 409 / `CONTEXT_VERSION_CONFLICT` | 行程已变 / 草案过期（`phase` 同时为 `CONTEXT_STALE`） | Toast + 拉 `orchestration-state`，丢弃旧草案或重建 |
| 400 | BLOCK 未 force；copilot 已有待确认草案；analyze-move 传了 direct | 展示 `message` + conflicts |
| 403 `FORBIDDEN` | 非成员 | 无权限空态 |
| 404 | proposal 不属于 trip / 已丢弃 | 回列表刷新 |
| 202 | `auto-arrange` 在 direct 历史语义；proposal 模式仍看 `data.proposal` | 以 `data.mode` 为准 |

---

## 10. 与决策空间 / 准备度的边界

| 产品面 | 写什么 | iOS 入口 |
|--------|--------|----------|
| **行程编排** | 日程项时间 / 候选入轴 | 本稿 `proposals` → `apply` |
| **决策空间** | 车型、保险、冰川等约束 | `DECISION_SPACE_IOS_HANDOFF.md` |
| **整体准备度** | 只读分数 + CTA 深链 | `OVERALL_TRIP_READINESS_FE_HANDOFF.md` |

桥接：决策检查器可用同一 UI，靠 query 区分 —

- 编排确认：`decision-inspector?proposalId=`
- 决策队列项：`decision-inspector?problemId=`

**不要**把 `decision-problems` 的 apply 和 `arrange-itinerary/proposals` 的 apply 混成一条写链。

---

## 11. 联调 Smoke

```bash
TRIP=3e4a1058-9218-467f-988a-c18008a14385
BASE=http://localhost:3000/api

# 1) 时间轴
curl -s "$BASE/trips/$TRIP/schedule-timeline?include=items,metrics,travelInfo" \
  | jq '.data|{tripId,dayCount:(.days|length?)}'

# 2) 编排态 + 工作台快照
curl -s "$BASE/trips/$TRIP/arrange-itinerary/orchestration-state" | jq '.data'
curl -s "$BASE/trips/$TRIP/arrange-itinerary/planning-workbench-snapshot" \
  | jq '.data|{phase:.orchestration.phase,pending:.proposals.pendingCount?}'

# 3) 候选列表 → 放一天（出草案）—— 换成真实 candidateId
# CID=$(curl -s "$BASE/trips/$TRIP/attraction-explore/candidates" | jq -r '.data.candidates[0].id')
# curl -s -X POST "$BASE/trips/$TRIP/attraction-explore/candidates/$CID/place" \
#   -H 'Content-Type: application/json' \
#   -d '{"dayIndex":2,"startTime":"10:30","endTime":"12:00"}' \
#   | jq '.data|{mode,proposalId:.proposal.proposalId,phase:.orchestrationState.phase,diff:.proposal.diff.summary,validation:.proposal.validation.status}'

# 4) apply（使用上一步 contextVersion + proposalId）
# curl -s -X POST "$BASE/trips/$TRIP/arrange-itinerary/proposals/$PID/apply" \
#   -H 'Content-Type: application/json' \
#   -d "{\"contextVersion\":$CV}" | jq '.data|{status,appliedChangeCount,phase:.orchestrationState.phase}'
```

---

## 12. iOS DoD

- [ ] 所有编排写入默认 **不出** `commitMode: "direct"`  
- [ ] mutation 后展示 `diff` + `validation`，用户确认再 apply  
- [ ] apply **带回** `contextVersion`；处理 409 stale  
- [ ] `BLOCK` 不可默认 force；先展示 conflicts  
- [ ] apply / discard 后刷新 `schedule-timeline`  
- [ ] 有 `activeProposalId` 时展示待确认入口  
- [ ] `dayIndex` 按 1-based 传参  
- [ ] 决策空间写链与编排 apply **分清**  
- [ ] 有 `decisionPack` 时用方案卡字段，不前端硬拼 narrative  

---

## 13. 建议实现切片

1. **AI-iOS-1** `schedule-timeline` + 只读 overview / orchestration-state  
2. **AI-iOS-2** place candidate / items → proposal Sheet → apply / discard  
3. **AI-iOS-3** ai-actions + auto-arrange（proposal）  
4. **AI-iOS-4** workbench-snapshot 轮询 + 冲突角标  
5. **AI-iOS-5** analyze-move（拖拽）  
6. **AI-iOS-6** decisionPack 方案卡 + monitor（可选）  
7. **AI-iOS-7** decision-inspector / causal-chain 与决策空间共用（可选）  

---

**一句话**：iOS 行程编排 = mutation 拿 `PlanProposal` → 展示 diff/校验 → `apply(contextVersion)` 写入 → 刷新时间轴；默认禁止 `direct`。
