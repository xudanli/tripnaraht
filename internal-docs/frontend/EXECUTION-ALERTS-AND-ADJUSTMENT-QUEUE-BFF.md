# 活跃风险提醒 & 待调整项 — Mobile BFF 接口文档

**状态：** 生产可用（ERC Canonical + TEP Phase 0 Local Repair）  
**最后更新：** 2026-07-13  
**关联：** [TEP-PHASE0-CONTRACT-FREEZE.md](../product/TEP-PHASE0-CONTRACT-FREEZE.md) · [EXECUTION-USER-NARRATIVE-CONTRACT.md](./EXECUTION-USER-NARRATIVE-CONTRACT.md) · [IOS-USER-NARRATIVE-CANARY-SAMPLE.md](./IOS-USER-NARRATIVE-CANARY-SAMPLE.md)

---

## 0. 通用约定

| 项 | 值 |
|----|-----|
| Base URL | `{host}/api` |
| 认证 | `Authorization: Bearer <accessToken>` |
| 响应信封 | StandardResponse：`{ success: boolean, data?: T, error?: { code, message } }` |
| 成功 | 通常 HTTP 200 + `success: true` |
| 失败 | 通常 HTTP 200 + `success: false`（少数 401/403/404） |
| 缓存 | 使用 `data.contextVersion` 判断是否需要刷新 |

### 两层分工

| 产品页 | 接口 | 回答的问题 |
|--------|------|-----------|
| **活跃风险提醒**（第一层） | `execution-alerts` | 现在执行有多危险？先看什么？ |
| **待调整项**（第二层） | `adjustment-queue` | 具体要决定什么？怎么改方案？ |

**不要混用：**

- 活跃风险列表页 **不要** 用 `GET /execution-risks` 扁平列表 1:1 渲染
- 两页都 **不要** 用 `GET /internal/attention-dual-read`（Slice 4 内部观测）
- 两页都 **不要** 前端本地聚类 / dedupe

---

## 1. GET 活跃风险提醒 — execution-alerts

### 1.1 请求

```
GET /api/mobile/trips/{tripId}/execution/execution-alerts
Authorization: Bearer <accessToken>
```

| 参数 | 位置 | 说明 |
|------|------|------|
| `tripId` | path | 行程 UUID |

**废弃别名：** `GET .../execution/risk-alerts`（等同本接口）

### 1.2 响应 — `ExecutionAlertsDto`

`schemaId` 当前为 **`tripnara.execution_alerts@v2`**。

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.execution_alerts@v2",
    "tripId": "uuid",
    "contextVersion": 55228,
    "projectionSource": "execution_risk_center",
    "requiredAction": "STOP",
    "banner": {
      "level": "STOP",
      "title": "…",
      "detail": "…"
    },
    "primaryRisk": { },
    "impacts": [ ],
    "independentRisks": [ ],
    "alerts": [ ],
    "aiRecommendation": {
      "title": "建议",
      "detail": "…",
      "evidenceIds": [],
      "basedOnRiskIds": [],
      "headline": "…"
    }
  }
}
```

### 1.3 顶层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `schemaId` | string | `tripnara.execution_alerts@v2`（或 v1 兼容） |
| `tripId` | string | 行程 ID |
| `contextVersion` | number | 上下文版本，用于缓存失效 |
| `projectionSource` | string | `execution_risk_center`（推荐）或 `legacy` |
| `requiredAction` | enum | `STOP` \| `REPLAN` \| `NONE` \| `ACKNOWLEDGE` — 底部 CTA 依据 |
| `banner` | object? | `STOP` / `REPLAN_REQUIRED` 时顶部横幅 |
| `primaryRisk` | ExecutionAlertDto? | **唯一主风险卡** |
| `impacts` | ExecutionAlertImpactDto[] | 主卡下派生影响（**不是独立卡**） |
| `independentRisks` | ExecutionAlertDto[] | 异根因独立风险卡 |
| `alerts` | ExecutionAlertDto[] | **v1 兼容** = `independentRisks`（不含 primary） |
| `aiRecommendation` | object | 全局 AI 建议摘要 |

### 1.4 `ExecutionAlertDto`（primaryRisk / independentRisks 元素）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 稳定 riskId，对接 `GET /execution-risks/{riskId}` |
| `riskId` | string | 同 `id` |
| `riskKey` | string? | 稳定业务键 |
| `presentationRole` | enum? | `PRIMARY` \| `IMPACT` \| `INDEPENDENT` |
| `level` | enum | `STOP` \| `REPLAN_REQUIRED` \| `AT_RISK` |
| `title` | string | 短结论标题 |
| `reason` | string | 事实评估正文（不含方案句） |
| `recommendedAction` | string? | 一句可执行方案 |
| `impact` | string | 影响摘要 |
| `affectedActivities` | string[] | 受影响活动 |
| `affectedRoute` | string? | 受影响路段 |
| `riskType` | string? | 如 `SEVERE_WEATHER`、`SCHEDULE_DELAY` |
| `riskLevel` | enum? | `LOW` \| `MEDIUM` \| `HIGH` \| `CRITICAL` |
| `executionGate` | enum? | `STOP` \| `REPLAN_REQUIRED` \| `AT_RISK` \| `ALLOW` |
| `decisionProblemIds` | string[]? | 关联决策问题，可跳 decision-queue |
| `recommendationIds` | string[]? | 关联推荐，走 recommendations 闭环 |
| `causalChain` | object? | 仅 `primaryRisk` 常见；与 adjustment-queue 同结构 |
| `requiresImmediateAttention` | boolean | `level` 为 STOP / REPLAN_REQUIRED 时为 true |
| `userNarrative` | object? | **Phase B** — `whatHappened` / `impactOnTrip` / `recommendation` / `affected` |
| `userActions` | array? | **Phase B** — 与 `recommendation` 同向的操作按钮 |
| `observedAt` | ISO8601 | 最近观测时间 |
| `evidenceRefs` | string[] | 证据 ID |

### 1.5 `impacts[]` 元素

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 影响项 ID |
| `type` | enum | `SAFETY` \| `ROUTE` \| `DELAY` \| `ITINERARY` \| `ACTIVITY` \| `CONSTRAINT` |
| `label` | string | 展示文案（**无** title/reason/recommendedAction） |
| `sourceRiskId` | string? | 来源 ActiveRisk |

### 1.6 前端渲染契约（v2）

```
1 × primaryRisk 主卡
  └─ impacts[] 子区块（派生影响，非独立卡）
+ N × independentRisks 独立卡
```

| 规则 | 说明 |
|------|------|
| 有 `independentRisks` 时 | **不要**再渲染 `alerts[]`（避免重复） |
| `impacts[]` | 必须在主卡内展示，不要提成独立卡 |
| 实体卡数 | `1 + independentRisks.length`（不含 impacts） |
| 过滤「仅看需立即处理」 | `requiresImmediateAttention === true` |
| `recommendedAction` vs `requiredAction` | `STOP`/`REPLAN` 时后端会抑制「保持原计划」类冲突文案；按钮仍以 `requiredAction` 为准 |

### 1.7 二级接口（点卡片后）

| 动作 | 接口 |
|------|------|
| 风险详情 | `GET /api/trips/{tripId}/execution-risks/{riskId}` |
| 方案推荐 | `GET /api/trips/{tripId}/execution-risks/{riskId}/recommendations` |
| 预览采用 | `POST …/recommendations/{recommendationId}/apply` |
| 确认采用 | `POST …/recommendations/{recommendationId}/confirm` |
| 确认已阅读 | `POST /api/trips/{tripId}/execution-risks/{riskId}/acknowledge` |
| 跳转待调整 | `GET …/execution/adjustment-queue` 或产品内导航 |

### 1.8 curl 示例

```bash
curl -s "$BASE/mobile/trips/$TRIP/execution/execution-alerts" \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## 2. GET 待调整项 — adjustment-queue

### 2.1 请求

```
GET /api/mobile/trips/{tripId}/execution/adjustment-queue
Authorization: Bearer <accessToken>
```

| 参数 | 位置 | 说明 |
|------|------|------|
| `tripId` | path | 行程 UUID |

**Canonical 等价路径（非 Mobile 客户端可用）：**

```
GET /api/trips/{tripId}/execution-risks/adjustment-queue
```

**废弃别名：** `GET .../execution/pending-adjustments`

### 2.2 响应 — `ExecutionAdjustmentQueueDto`

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.execution_adjustment_queue@v1",
    "tripId": "uuid",
    "contextVersion": 55228,
    "projectionSource": "execution_risk_center",
    "pendingCount": 8,
    "criticalCount": 6,
    "highPriorityCount": 8,
    "linkedActiveRiskCount": 8,
    "headline": "今天需要您决定 7 件事，其中 6 项可能影响行程执行",
    "countsByType": {
      "SAFETY_INTERVENTION": 6,
      "DYNAMIC_REPLAN": 2,
      "TEAM_COORDINATION": 0,
      "EXECUTION_PREPARATION": 0
    },
    "items": [ ],
    "riskClusters": [ ],
    "generatedAt": "2026-07-12T08:00:00.000Z"
  }
}
```

### 2.3 顶层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `schemaId` | string | 固定 `tripnara.execution_adjustment_queue@v1` |
| `tripId` | string | 行程 ID |
| `contextVersion` | number | 上下文版本 |
| `projectionSource` | string | `execution_risk_center` 或 `legacy` |
| `pendingCount` | number | **待处理 N**（= `items.length`，与 headline 同源） |
| `criticalCount` | number | 紧急项数量（`priority === CRITICAL`） |
| `highPriorityCount` | number | 建议尽快处理数量 |
| `linkedActiveRiskCount` | number? | 关联活跃风险数 |
| `headline` | string | 页头摘要文案（**必须由 `items[]` 统计生成**，勿与 decision-queue `openCount` 混用） |
| `countsByType` | Record | 四类调整项计数 |
| `items` | ExecutionInterventionDto[] | **列表数据源（每张卡 1 条）** |
| `riskClusters` | array? | 风险簇摘要，**辅助理解，不替代 items[]** |
| `generatedAt` | ISO8601? | 生成时间 |

### 2.3a TEP 投影管线与去重（IS-CERT-404）

`adjustment-queue` 由两层服务串联（**客户端只读最终 `data`**，勿复刻服务端逻辑）：

```
ExecutionAdjustmentQueueProjectionService.project()
  → ERC Canonical items（decision / cluster / risk）
  → enrichInterventionWithUserNarrative（Phase B 叙事）
  → TepErcBridgeService.enrichAdjustmentQueue()
       ├─ attachTepRecoveryToItem（已有 decision 项绑定 recoveryGraph）
       ├─ projectTepFallbackIntervention（注入 intervention-tep-*）
       ├─ dedupeAdjustmentQueueForTepCanonical（IS-CERT-404）
       └─ enrichInterventionWithUserNarrative（TEP 卡叙事）
```

| 代码路径 | 职责 |
|----------|------|
| `execution-adjustment-queue-projection.service.ts` | ERC 基线投影 + 调用 TEP bridge |
| `tep-erc-bridge.service.ts` | RecoveryGraph → `intervention-tep-*` + 去重 + headline 重算 |
| `tep-canonical-dedup.util.ts` | 去重键解析与 `items[]` 过滤 |
| `decision-problem-detector.service.ts` → `persistTepHookProblem` | 决策层 supersede 同 key 的 open canonical problem（非 BFF 直接操作） |

**去重键（冻结）：** `tripId|eventSemanticKey|targetRef|effectivePlanVersionId`  
详见 [TEP-PHASE0-CONTRACT-FREEZE.md §6](../product/TEP-PHASE0-CONTRACT-FREEZE.md)。

| 项类型 | 识别 | 队列行为 |
|--------|------|----------|
| TEP primary | `id` 以 `intervention-tep-` 开头，或 `decisionProblemId` 以 `problem_tep_` 开头 | **始终保留** |
| Canonical duplicate | 与 TEP primary 同 dedup key，但非 TEP primary | **从 `items[]` 移除**（用户不可见） |
| 独立风险 / 无 hook 匹配 | `intervention-risk-*`、`intervention-cluster-*` 等 | 保留 |

**前端禁止：** 本地按 `clusterId` / `linkedRiskIds` / `decisionProblemId` 合并或 dedupe — Slice 4 切向前由后端投影；TEP Phase 0 去重已在 `enrichAdjustmentQueue` 完成。

### 2.4 `items[]` — `ExecutionInterventionDto`

| 字段 | 类型 | 说明 |
|------|------|------|
| `schemaId` | string | `tripnara.execution_intervention@v1` |
| `id` | string | 干预项 ID；决策项通常 = `decisionProblemId` |
| `tripId` | string | 行程 ID |
| `type` | enum | 见 §2.5 |
| `priority` | enum | `CRITICAL` \| `HIGH` \| `MEDIUM` \| `LOW` |
| `title` | string | 卡片标题 |
| `reason` | string | 原因正文 |
| `recommendedAction` | string | 推荐动作文案 |
| `affectedMembers` | string[] | 受影响成员名 |
| `affectedActivities` | string[] | 受影响活动 |
| `alternativeActions` | string[]? | 备选动作 |
| `actionDeadline` | ISO8601? | 处理截止时间 |
| `evidenceRefs` | string[] | 证据 ID |
| `requiresConfirmation` | boolean | 是否需要用户确认 |
| `autoExecutable` | boolean | 是否可自动执行 |
| `reversible` | boolean | 是否可逆 |
| `modifiesEffectivePlan` | boolean | 确认后是否改有效计划 |
| `requiresRevalidation` | boolean | 是否触发重验证 |
| `status` | enum | `OPEN` \| `SNOOZED` \| `ACCEPTED` \| … |
| `decisionProblemId` | string? | 有值 → 走决策 accept 链路 |
| `linkedRiskIds` | string[]? | 关联 `execution-risks/{riskId}` |
| `linkedRiskKeys` | string[]? | 稳定 riskKey |
| `primaryRiskId` | string? | 簇内主风险 |
| `clusterId` | string? | 风险簇 ID |
| `recommendationId` | string? | 纯风险项 → recommendations 闭环 |
| `environmentEventId` | string? | 环境事件 ID |
| `causalChain` | object | **必填** — 卡片「为什么重要」 |
| `guardianCausalChain` | object? | 安全干预 Abu 视角 |
| `causalTraceRef` | object? | 技术 trace 引用 |
| `consequenceImpacts` | array? | 根因后果，「影响」区块 |
| `affectedMembersScope` | enum? | `ALL_MEMBERS` \| `FOCUSED` |
| `userNarrative` | object? | **Phase B** — `whatHappened` / `impactOnTrip` / `recommendation` |
| `userActions` | array? | **Phase B** — 与 recommendation 同向的按钮 |
| `actions` | object | 主/次/延后按钮 |
| `recommendation` | object? | 推荐方案摘要 |

### 2.5a `userNarrative` / `userActions`（Phase B — 优先展示）

见 [EXECUTION-USER-NARRATIVE-CONTRACT.md](./EXECUTION-USER-NARRATIVE-CONTRACT.md)。前端用户面 **优先** 渲染此块；`causalChain` 放入折叠「为什么」。

### 2.5 `items[].type` — 四类调整项

| type | 中文 | 示例 |
|------|------|------|
| `SAFETY_INTERVENTION` | 安全干预 | 缩短户外段、停止执行 |
| `DYNAMIC_REPLAN` | 动态重规划 | 替换景点、午餐窗冲突 |
| `TEAM_COORDINATION` | 团队协调 | 确认集合点 |
| `EXECUTION_PREPARATION` | 执行准备 | 检查装备 |

### 2.6 `items[].actions`

```typescript
actions: {
  primary:   { label, action, actionId?, enabled, count? }
  secondary: { label, action, actionId?, enabled, count? }
  defer?:    { label, action, actionId?, enabled, count? }
}
```

| `action` | 含义 |
|----------|------|
| `accept` | 接受推荐方案 |
| `complete` | 确认完成 |
| `view_alternatives` | 查看替代方案 |
| `view_impact` | 查看影响 |
| `keep_original` | 保留原计划 |
| `defer` / `snooze` | 稍后处理 |

### 2.7 `items[].causalChain`

| 字段 | 说明 |
|------|------|
| `headline` | 因果链标题 |
| `assessment` | 评估正文 |
| `nodes[]` | `WORLD_CHANGE` → `IMPACT` → `CONFLICT` → `OPTION`（→ `OUTCOME`） |

完整回放：

```
GET /api/mobile/trips/{tripId}/execution/interventions/{interventionId}/causal-trace
```

### 2.8 写操作（按 item 分支）

#### A. 有 `decisionProblemId`（决策项）

| UI action | HTTP |
|-----------|------|
| `accept` / `complete` | `POST /api/mobile/trips/{tripId}/decisions/{decisionProblemId}/accept` |
| `defer` / `snooze` | `POST /api/mobile/trips/{tripId}/decisions/{decisionProblemId}/defer` |
| Canonical 等价 | `POST /api/trips/{tripId}/decision-queue/{problemId}/accept-recommended` |

Body 示例：`{ "actionId": "act-1", "optionId": "act-1", "comment": "…" }`

#### B. 无 `decisionProblemId`（纯风险项，`id` 形如 `intervention-risk-*` 或 `intervention-cluster-*`）

```
GET  /api/trips/{tripId}/execution-risks/{primaryRiskId}/recommendations
POST /api/trips/{tripId}/execution-risks/{riskId}/recommendations/{recommendationId}/apply
POST /api/trips/{tripId}/execution-risks/{riskId}/recommendations/{recommendationId}/confirm
```

#### C. TEP Local Repair（`id` 形如 `intervention-tep-*`，无 `decisionProblemId`）

由 `TepErcBridgeService` 从 `PlanVersion.metadata.tep.recoveryGraph` 投影；`actions.primary.action = accept` 时走本分支。

| UI action | HTTP |
|-----------|------|
| `accept`（应用 REMOVE 修复） | `POST /api/mobile/trips/{tripId}/execution/tep-repairs/{interventionId}/accept` |
| Canonical 等价 | `POST /api/trips/{tripId}/executability/repairs/{optionId}/apply` |

**`interventionId`：** `intervention-tep-{RecoveryOption.optionId}`（亦可 body 传 `optionId`）。

**Body 示例：**

```json
{
  "optionId": "REPAIR-SDR101-D1-activity_item_stop_1",
  "basePlanVersionId": "plan_cert_302_v1",
  "comment": "应用驾驶负荷修复"
}
```

**`basePlanVersionId`：** 取自 `items[].recommendation.basePlanVersionId`（ERC 投影时绑定 effective PlanVersion）。与当前 effective 不一致时返回 `STALE_REPAIR_OPTION`（409），客户端应刷新 adjustment-queue 后重试。

**成功响应（Mobile 外层 + `result` 内层）：**

Mobile 信封（`acceptTepRepair`）：

| 字段 | 说明 |
|------|------|
| `contextVersion` | 写回后推送的新上下文版本 |
| `decisionStatus` | 固定 `accepted` |
| `previewSummary` | 用户 comment 或默认文案 |
| `result` | 下方 `TepLocalRepairApplyResult` |

`result`（Canonical `apply` 与 Mobile `result` 同型，由 `TepLocalRepairApplyService` 返回）：

| 字段 | 说明 |
|------|------|
| `planVersionId` | 子 PlanVersion（写回后 effective） |
| `parentPlanVersionId` | 写回前 effective |
| `appliedOptionId` | 已应用的 `RecoveryOption.optionId` |
| `appliedAction` | `REMOVE` \| `REPLACE` |
| `removedRefs` | RecoveryOption `targetRefs`（activity / drive_leg 等） |
| `removedItemIds` | 物化删除的 itinerary item id |
| `createdItemIds` | **REPLACE** 物化新建的 itinerary item id（REMOVE 时省略） |
| `replacementPoiId` | **REPLACE** 时预计算 POI id（REMOVE 时省略） |
| `confirmedBy` | 固定 `USER` |
| `confirmedAt` | ISO8601 |
| `idempotentReplay` | 重复 accept 时为 `true` |
| `itineraryMaterialized` | 是否完成行程物化 |
| `executabilityRefreshed` | 写回后是否触发 `getExecutability(refresh)` |
| `metadataPatch.recoveryGraphApplied` | 写入 `metadata.tep` 的 optionId |
| `metadataPatch.planVersionId` | 与 `planVersionId` 一致 |

**错误码（HTTP 200 + `success: false` 或 ConflictException 信封）：**

| code | 场景 |
|------|------|
| `STALE_REPAIR_OPTION` | `basePlanVersionId` 与当前 effective 不一致（409） |
| `NOT_FOUND` | option / trip / recoveryGraph 缺失 |
| `BAD_REQUEST` | REPLACE 无 `replacementPoiId`、非法 optionId 等 |

**幂等键（服务端）：** `trip:{tripId}:tep-repair:{optionId}`

**Phase 0 边界：**

| 支持 | 不支持 |
|------|--------|
| `action = REMOVE`（SDR-101 负荷修复、IS-CERT-405 日照停靠等） | 运行时 LLM 搜 POI 写回 |
| `action = REPLACE`（SDR-302 预计算 `replacementPoiId`） | 无 `replacementPoiId` 的 REPLACE |
| 幂等 replay | 基于过期 PlanVersion 的盲目写回（→ `STALE_REPAIR_OPTION`） |
| 进程内 inflight 去重 | 多实例分布式锁（文档化 gap，见契约冻结 §7.3） |

**Production 验证（WP-TEP-13）：** IS-CERT-401（幂等写回）、IS-CERT-402（`STALE_REPAIR_OPTION`）已于 **staging PostgreSQL** 通过（2026-07-12）：

```bash
DATABASE_URL="$(grep '^DATABASE_URL=' .env.staging | sed 's/^DATABASE_URL=//' | tr -d '"')" npm run test:tep-writeback-pg
```

**写回后副作用：** 提升 effective PlanVersion → REMOVE 删除 / REPLACE 替换目标行程项 → `getExecutability(refresh)` → decision read model cache invalidate → Mobile `contextVersion` 推送 + 队友 push。

#### D. `repairOptions` 与 `recommendations` — SSOT 分工（冻结）

**原则：维持分工，不要把 `repairOptions` 再投影一份到 `recommendations`。**

方案只在各自 SSOT 维护一份，避免与 `adjustment-queue.alternativeActions` 或双入口 confirm/apply 路径不一致。

| 场景 | SSOT | iOS 入口 |
|------|------|----------|
| 有 `decisionProblemId`（当前 Canary 待调整项） | `GET …/decision-queue/{problemId}` → **`repairOptions[]`** | 待调整项主按钮 → **行程调整建议**（Exec Slip / 决策确认流） |
| 纯环境风险（无决策闭环，`env-rec-*`） | `GET …/execution-risks/{riskId}/recommendations` → **`items[]`** | **风险建议 Sheet**（apply / confirm） |

**语义：**

| API | 含义 |
|-----|------|
| `recommendations` | 纯风险建议（环境事件替代方案等），无 Decision Problem 写回 |
| `repairOptions` | 可确认的决策方案（含 ack、apply、Slip 选项），由 decision-queue 独占 |

**预期空值（不是缺接口）：**

- 当 `adjustment-queue.items[].decisionProblemIds` 非空，或 alert `decisionProblemIds` 非空时，`execution-risks/{id}/recommendations` 返回 `recommendationIds: []` / `items: []` **是正常行为**。
- 客户端 **不得** 因 recommendations 为空而 fallback 到风险建议 Sheet；应统一走 **decision-queue**。

**iOS 路由（已对齐，勿改）：**

```
有 decisionProblemId → Slip / 行程调整建议（repairOptions）
无 decisionProblemId → recommendations Sheet（仅 env-rec 等纯风险项）
```

**禁止：**

| 不要做 | 原因 |
|--------|------|
| 把 `repairOptions` 同步塞进 `recommendations` | 两个入口展示同一批方案，confirm/apply 路径易乱 |
| 用 `alternativeActions` 代替 `repairOptions` 做确认写回 | 调整项叙事字段，非方案 SSOT |
| 有决策项时仍打开「风险建议」Sheet | 与 Canary 用户路径不一致 |

**Canary 用户侧正确路径（示例）：**

```
待调整项 → 点「改走 Exec Slip Canary POI C…」→ 行程调整建议
（不是「风险建议」Sheet）
```

**BFF 实现注记：** `adjustment-queue` 仅投影干预卡与 `actions`；`repairOptions` 由客户端在点击主按钮后 **按需 hydrate** `decision-queue/{problemId}`，不在 BFF 层复制到 recommendations。

### 2.9 前端渲染契约

| 区域 | 数据源 |
|------|--------|
| 待处理 / 紧急 / 高优 / 活跃风险 | `pendingCount` / `criticalCount` / `highPriorityCount` / `linkedActiveRiskCount` |
| 列表 | **`items[]` 逐项渲染**（当前 1 item = 1 卡） |
| 类型角标 | `countsByType` |
| 关联风险 | `linkedRiskIds[0]` → execution-risks 详情 |

| 禁止 | 说明 |
|------|------|
| 用 `riskClusters` 替代 `items[]` | 簇是辅助元数据 |
| 本地按 `clusterId` 合并 | Slice 4 切向前由后端投影 |
| 直接渲染 `decision-queue` | 缺 Intervention 文案与 actions |

### 2.10 curl 示例

```bash
# 待调整项列表（含 intervention-tep-*）
curl -s "$BASE/mobile/trips/$TRIP/execution/adjustment-queue" \
  -H "Authorization: Bearer $TOKEN" | jq

# TEP Local Repair 写回（Mobile）
curl -s -X POST "$BASE/mobile/trips/$TRIP/execution/tep-repairs/intervention-tep-REPAIR-SDR101-D1-activity_$ITEM/accept" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment":"应用修复"}' | jq

# Canonical 等价
curl -s -X POST "$BASE/trips/$TRIP/executability/repairs/REPAIR-SDR101-D1-activity_$ITEM/apply" \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## 3. 两页关系 & 典型导航

```
执行总览
  ├─ 活跃风险提醒 (execution-alerts)
  │     primaryRisk + independentRisks
  │     requiredAction = STOP → 「重新规划今日行程」
  │
  └─ 待调整项 (adjustment-queue)
        items[] 完整决策卡 + actions
        ├─ 有 decisionProblemId → decision-queue/{id}.repairOptions → Slip / 行程调整建议
        ├─ 无 decisionProblemId + env-rec → execution-risks/{id}/recommendations → 风险建议 Sheet
        └─ intervention-tep-*   → execution/tep-repairs/{id}/accept
```

| 从 Alert 页 | 到 Adjustment 页 |
|-------------|------------------|
| 底部 CTA `REPLAN` / `STOP` | 导航到待调整项 |
| `decisionProblemIds[0]` | 可深链到对应 `items[].id` |
| TEP 修复卡 `intervention-tep-*` | `actions.primary` → `tep-repairs/.../accept` |

---

## 4. Slice 4 边界（当前）

| 项 | 状态 |
|----|------|
| `ATTENTION_ROOT_CAUSE_PRIMARY_SSO` | **0** — 未切用户面 |
| Internal Dual-Read | 仅 `GET /internal/attention-dual-read`，不进上述两页 |
| 当前 Canary | Alert 11 卡、Adjustment 8 项为 ERC 预期，非 Slice 4 收敛后形态 |

Slice 4 切向后，**待调整项**将首先受益（强风链 4 项 → 1 Primary）；**活跃风险提醒**接口路径不变，语义仍由 ERC 负责。

---

## 5. 参考

| 文档 | 路径 |
|------|------|
| Native 总文档 | [`src/auth/EXECUTE_NATIVE_API.md`](../../src/auth/EXECUTE_NATIVE_API.md) |
| Web P2 对接 | [TEP-SELF-DRIVE-WEB-P2-INTEGRATION.md](./TEP-SELF-DRIVE-WEB-P2-INTEGRATION.md) |
| Web P3 对接 | [TEP-SELF-DRIVE-WEB-P3-INTEGRATION.md](./TEP-SELF-DRIVE-WEB-P3-INTEGRATION.md) |
| **TEP Phase 0 契约冻结（签字）** | [`TEP-PHASE0-CONTRACT-FREEZE.md`](../product/TEP-PHASE0-CONTRACT-FREEZE.md) |
| **TEP Phase 0 状态** | [`TEP-PHASE0-STATUS.md`](../product/TEP-PHASE0-STATUS.md) |
| TEP 工程契约 | [`TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md`](../product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md) |
| iOS 叙事样例 | [`IOS-USER-NARRATIVE-CANARY-SAMPLE.md`](./IOS-USER-NARRATIVE-CANARY-SAMPLE.md) |
| ERC Canonical | 同上 §6.1.1 / §6.1.2 |
| Slice 4 Internal | [`SLICE-4-INTERNAL-DUAL-READ-BFF-HANDOFF.md`](./SLICE-4-INTERNAL-DUAL-READ-BFF-HANDOFF.md) |
| Swagger | 启动后 `/api-docs`，tag `mobile-execution` / `tep-self-drive` |
