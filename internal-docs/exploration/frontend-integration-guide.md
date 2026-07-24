# Exploration 前端集成指南 — Hub ①「告诉 AI 我想去哪」

**Audience:** C 端前端  
**Base URL:** `/api/exploration`  
**鉴权:** `Authorization: Bearer <JWT>`  
**PRD:** [prd-exploration-reliability-closure-v1.1.md](../../../internal-docs/exploration/prd-exploration-reliability-closure-v1.1.md)  
**后端 API 清单:** [EXPLORATION_API.md](../../src/trips/exploration/EXPLORATION_API.md)  
**Travel Ontology / Issues 接入:** [frontend-ontology-integration-guide.md](./frontend-ontology-integration-guide.md)

---

## 1. 与「你准备怎么开始？」Hub 的关系

| Hub 卡片 | 路由建议 | 后端入口 |
|----------|----------|----------|
| **① 告诉 AI 我想去哪** | `/explore` | `POST /api/exploration/scenarios` |
| ② 从攻略开始规划 | `/guide-to-plan` | `/api/guide-to-plan/*`（已有，勿混用） |

本文档只覆盖 **① Exploration 探索规划 + 可靠性决策闭环**。

---

## 2. 推荐页面流

```text
/explore                          Hub ① 进入 / 研究默认条件
  → /explore/:scenarioId/principles
  → /explore/:scenarioId/routes    （Variant A/B 由 assignedVariant 决定）
  → /explore/:scenarioId/compare
  → /explore/:scenarioId/routes/:routeId
  → /explore/:scenarioId/routes/:routeId/check
  → /explore/:scenarioId/decisions/:problemId
  → /explore/:scenarioId/continue   （Sprint 4A 商品包装）
```

**Session 状态建议存：**

- `scenarioId`（必须）
- `sessionId`（研究埋点必须）
- `tripId`（materialize 后有值）
- `assignedVariant`（A/B 实验分流）

---

## 3. 首屏：创建 Scenario（Hub ① 点击）

### Consumer 模式（用户可配置条件）

**不传 `researchProtocolId`**，请求体字段生效（需 `EXPLORATION_CONSUMER_MVP_ENABLED=1`）：

```json
{
  "destinationCodes": ["IS"],
  "dateRange": { "startDate": "2026-09-10", "endDate": "2026-09-18" },
  "travelers": [{ "type": "ADULT" }, { "type": "ADULT" }],
  "budget": { "currency": "USD", "min": 3000, "max": 4000 },
  "mobilityContext": { "vehicleType": "4WD_SUV" }
}
```

前端开关：`VITE_EXPLORATION_USER_CONDITIONS=1` → 使用 `startExplorationFromHub(token, { ...conditions })`，**不要**传 protocol。

### 研究模式（冰岛 fixed protocol）

```json
{
  "researchProtocolId": "iceland-discovery-v1"
}
```

**说明：** 传了 `researchProtocolId` 时，协议 `lockedFields` 覆盖用户输入。前端开关：`VITE_EXPLORATION_RESEARCH_MODE=1`。

### 条件 catalog

```http
GET /api/exploration/conditions/catalog?destinationCode=IS
```

返回 `vehicleTypes`、`budgetPresets`。

### GET Scenario（条件页回显 + 锁定态）

```http
GET /api/exploration/scenarios/:scenarioId
```

```json
{
  "data": {
    "scenarioId": "...",
    "sessionId": "...",
    "researchProtocolId": null,
    "lockedFields": [],
    "scenario": {
      "destinationCodes": ["IS"],
      "mobilityContext": { "vehicleType": "4WD_SUV" }
    },
    "materializationStatus": "DRAFT"
  }
}
```

研究模式 `lockedFields`: `["destinationCodes","dateRange","travelers","budget","mobilityContext"]`。

### PATCH 条件（可选，DRAFT 阶段）

```http
PATCH /api/exploration/scenarios/:scenarioId/conditions
```

仅非 `lockedFields` 字段可改；已 materialize → 409。

### 响应（创建 — 关键字段）

```json
{
  "success": true,
  "data": {
    "scenarioId": "uuid",
    "sessionId": "uuid",
    "tripId": null,
    "materializationStatus": "DRAFT",
    "assignedVariant": "THREE_ROUTE_COMPARISON",
    "researchProtocolId": null,
    "lockedFields": [],
    "scenario": { "destinationCodes": ["IS"], "mobilityContext": { "vehicleType": "4WD_SUV" } }
  }
}
```

**前端动作：**

1. 持久化 `scenarioId` + `sessionId`
2. 上报 `exploration_session_started`、`research_variant_assigned`
3. 跳转 `/explore/:scenarioId/principles`

---

## 4. 原则页

### 读取卡片目录

```http
GET /api/exploration/principles/catalog
```

### 提交（内部 lazy materialize + 写 Contract）

```http
PUT /api/exploration/scenarios/:scenarioId/principles
```

```json
{
  "principles": [
    { "principleId": "LOW_DRIVING", "rank": 1 },
    { "principleId": "CORE_EXPERIENCE_FIRST", "rank": 2 }
  ]
}
```

**无需**前端先调 `materialize`；`PUT principles` 会自动物化 Trip。

---

## 5. 路线比较与选择

```http
POST /api/exploration/scenarios/:scenarioId/candidates
GET  /api/exploration/scenarios/:scenarioId/candidates/compare
```

每条候选含轻量 `preview`（`summary`、`totalKm`、`map.mainLine` / `fRoadLine`），供比较页小地图。

### 路线详情（地图 + 每日锚点）

```http
GET /api/exploration/scenarios/:scenarioId/routes/:routeId
```

坐标约定：**一律 `[lng, lat]` WGS84**（GeoJSON 顺序）。

```json
{
  "routeId": "route_remote-highlands-south",
  "title": "高地探索 + 南岸",
  "tagline": "门槛更高，换来更少游客与更强荒野体验",
  "badge": { "label": "小众路线", "tone": "niche" },
  "detail": {
    "summary": "...",
    "totalKm": 960,
    "days": [
      {
        "day": 5,
        "theme": "进入高地区域",
        "experience": "高地 F 路、地热景观",
        "mapPoint": { "lng": -16.7283, "lat": 65.0467 },
        "highlight": true,
        "tip": "部分道路有车辆要求"
      }
    ],
    "map": {
      "mainLine": [[-21.9426, 64.1466], [-19.0083, 63.4186]],
      "fRoadLine": [[-19.0618, 63.9839], [-16.7283, 65.0467]]
    }
  }
}
```

TS client：`fetchRouteDetail(token, scenarioId, routeId)`。

```http
POST /api/exploration/scenarios/:scenarioId/selections
```

```json
{
  "routeId": "route_remote-highlands-south",
  "selectionReason": "更想走小众路段",
  "prioritizedGainIds": ["gain_remote"],
  "acceptedSacrificeIds": ["sac_vehicle"],
  "concernText": "担心2WD不够"
}
```

---

## 6. 可靠性闭环（Sprint 3）

### 6.1 可执行性检查

```http
POST /api/exploration/scenarios/:scenarioId/check
```

同步（默认）：

```json
{}
```

异步（超过 SLA 或前端主动）：

```json
{ "async": true }
```

- 同步 `200`：返回 `{ job, issues }`
- 异步 `202`：返回 `{ jobId, status: "PENDING" }`

轮询：

```http
GET /api/exploration/check-jobs/:jobId
```

`job.status`：`PENDING` → `RUNNING` → `COMPLETED` | `FAILED`。`COMPLETED` 时响应含 `issues`。

**Sprint 5：** job 状态持久化于 Redis（经 `CacheService`），多 Pod 部署下任意实例均可轮询；Redis 不可用时单 Pod 内存降级。Job TTL 默认 24h。

**前端推荐模式：**

```typescript
import { runFeasibilityCheck, waitForCheckJob } from '@/features/exploration/api/client';

// 1) 先尝试同步（默认）
const result = await runFeasibilityCheck(token, scenarioId);
if (result.mode === 'sync') {
  // 直接渲染 result.issues
}

// 2) 或主动异步 + 轮询（>3s loading UX）
const asyncResult = await runFeasibilityCheck(token, scenarioId, true);
if (asyncResult.mode === 'async') {
  const { job, issues } = await waitForCheckJob(token, asyncResult.jobId);
  if (job.status === 'FAILED') throw new Error(job.error ?? 'Check failed');
  // 渲染 issues
}
```

也可手动 `pollCheckJob` 配合分阶段 loading 文案（见下方 UX）。

**Loading UX（>3s）：** 分阶段文案，不要用假进度条：

```text
正在核对路线结构
→ 正在检查目的地规则
→ 正在确认车辆和道路条件
→ 正在生成可选修复方案
```
```

### 6.2 问题列表

```http
GET /api/exploration/scenarios/:scenarioId/issues
```

**必须同时展示：**

- `displayedIssues[]` — 研究模式通常 1 条
- `totalIssueCount` — 真实问题总数（避免用户以为只有 1 个问题）

每条 issue 含 `source.gatewayAssessmentBatchId` — 用于证据溯源 UI。

### 6.3 修复方案

```http
GET /api/exploration/scenarios/:scenarioId/issues/:issueId/options
```

`issueId` 与 Decision Center 的 `problemId` 一致。

### 6.4 提交 → 应用 → 重新验证

```http
POST /api/exploration/scenarios/:scenarioId/decisions/:problemId/submit
```

```json
{
  "optionId": "<actionId from options>",
  "reason": "可选",
  "acknowledgement": ["我已了解变更影响"]
}
```

```http
POST /api/exploration/scenarios/:scenarioId/decisions/:problemId/apply
```

```http
POST /api/exploration/scenarios/:scenarioId/revalidate
```

**Apply 响应结构：**

```json
{
  "apply": { "...": "gateway apply payload" },
  "revalidation": { "status": "PASSED" | "FAILED" | "PENDING", "message": "..." },
  "originalProblem": {
    "problemId": "...",
    "resolved": true,
    "workflowStatus": "RESOLVED",
    "executionStatus": "VERIFIED"
  },
  "issues": {
    "displayedIssues": [],
    "totalIssueCount": 0,
    "displayPolicy": { "maxIssues": 1, "preferredSeverity": "BLOCK" }
  }
}
```

**页面必须展示：** 原问题是否解决 + 是否产生新问题（不可只 toast「修改成功」）。

---

## 7. 商品包装与承诺（Sprint 4A）

### 7.1 商品卡

```http
GET /api/exploration/scenarios/:scenarioId/continue/packages
```

响应含 `presentationOrder`（拉丁方/随机）、`packages[]`（4 张商品卡定义）。

### 7.2 评分与排序

```http
POST /api/exploration/scenarios/:scenarioId/continue/feedback
```

```json
{
  "packageRankings": ["expert_review", "full_report", "trip_assurance", "auto_repair"],
  "valueScores": { "full_report": 5, "expert_review": 4 },
  "trustScores": { "full_report": 4, "expert_review": 5 },
  "acceptablePriceUsd": { "currency": "USD", "min": 29, "max": 79 },
  "leastPreferredPackageId": "auto_repair"
}
```

### 7.3 行为承诺

```http
POST /api/research/sessions/:sessionId/commitments
```

```json
{ "commitmentType": "NOTIFY_ME", "email": "user@example.com" }
```

或 `{ "commitmentType": "SELF_CHECK" }`

`DEPOSIT` / `PRICE_LOCK` 请走 Sprint 4B 专用支付接口（见 §7.4），勿直接 POST commitments。

### 7.4 订金与价格锁定（Sprint 4B）

需 `RESEARCH_PAYMENT_COMMITMENT_ENABLED=1`。

**法务文案与 SKU：**

```http
GET /api/research/payments/catalog
```

**可退订金流程：**

```http
POST /api/research/sessions/:sessionId/payments/deposit/start
→ 前端用 clientSecret 完成 Stripe Payment Element
POST /api/research/sessions/:sessionId/payments/deposit/confirm
```

沙箱模式（无 `STRIPE_SECRET_KEY`）：`confirm` 即模拟支付成功。

**一键退款：**

```http
POST /api/research/sessions/:sessionId/payments/deposit/refund
```

**价格锁定（无支付）：**

```http
POST /api/research/sessions/:sessionId/price-lock
```

```json
{ "lockedPriceUsd": 49, "email": "user@example.com" }
```

TS client：`fetchPaymentCatalog`、`startResearchDeposit`、`confirmResearchDeposit`、`refundResearchDeposit`、`submitPriceLock`。

---

## 8. 研究埋点

批量上报：

```http
POST /api/research/sessions/:sessionId/events/batch
```

```json
{
  "events": [
    {
      "eventName": "route_selected",
      "payload": {
        "sessionId": "<sessionId>",
        "scenarioId": "<scenarioId>",
        "routeId": "route_...",
        "timestamp": "2026-07-04T08:00:00.000Z",
        "currentStep": "route_selection"
      }
    }
  ]
}
```

每条事件 payload 建议含 PRD §14.5 字段：`sessionId`、`protocolId`、`entryVariant`、`scenarioId`、`tripId`、`appVersion`。

---

## 9. Variant 分流（Phase 1）

读 `assignedVariant`：

| 值 | 页面形态 |
|----|----------|
| `SINGLE_RECOMMENDATION` | 一条推荐路线 +「查看其他可能」入口 |
| `THREE_ROUTE_COMPARISON` | 三路线卡片直接比较 |
| `THEME_FIRST` | Phase 2 再启用 |

---

## 10. 环境要求

| 变量 | 说明 |
|------|------|
| `DECISION_GATEWAY_UNIFIED=1` | 可靠性闭环（issues / options / apply）必需 |
| `EXPLORATION_CONSUMER_MVP_ENABLED` | 功能开关（前端可配合） |
| Redis | Check job 跨 Pod 持久化（Sprint 5）；见 `RedisModule` |
| `EXPLORATION_CHECK_JOB_TTL_SEC` | Check job TTL，默认 86400 |

---

## 11. TypeScript 客户端

完整 client 见后端仓库：

- [frontend-exploration-api-client.ts](../../src/trips/exploration/dto/frontend-exploration-api-client.ts)
- [frontend-exploration-api.types.ts](../../src/trips/exploration/dto/frontend-exploration-api.types.ts)

页面组件清单见 [frontend-routes-scaffold.md](./frontend-routes-scaffold.md)。  
端到端联调清单见 [frontend-e2e-checklist.md](./frontend-e2e-checklist.md)。

```typescript
import { startExplorationFromHub, persistFlowState } from '@/features/exploration/api/client';

const data = await startExplorationFromHub(token, { researchProtocolId: 'iceland-discovery-v1' });
persistFlowState({ scenarioId: data.scenarioId, sessionId: data.sessionId });
```

---

## 12. 常见错误码

| HTTP / code | 含义 | 前端处理 |
|-------------|------|----------|
| `409 SCENARIO_NOT_MATERIALIZED` | 未物化就调用了需 Trip 的接口 | 引导完成 principles 或显式 materialize |
| `503` Gateway 未开 | `DECISION_GATEWAY_UNIFIED` 关闭 | 提示环境未就绪，勿伪造问题 |
| `displayedIssues` 空 + `totalIssueCount=0` | 无 eligible issue | 展示「暂无阻断问题」；研究模式记录 `NO_ELIGIBLE_ISSUE` |

---

## 13. 与 Plan Studio 的关系

同一 `tripId` 在 Exploration 与 Plan Studio / Decision Center 看到的 **issueId / problemId 必须一致**。Exploration 是 Consumer 薄壳；深度编辑可深链 `/trips/:tripId/decision-center`（研究员/debug 用，C 端默认隐藏）。
