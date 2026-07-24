# 决策空间 · iOS 对接文档（完整）

> **状态**：后端可联调（含 Nara Page Insight P0）  
> **日期**：2026-07-17  
> **读者**：iOS 客户端  
> **原则**：决策空间 **只绑** 已 publish 的 `decision-problems`；机会层单独 inbox，**默认不进队列**。写路径只看 `actionability.writeChain`，不要按引擎名 / `flow` 分支。  
> **规划阶段准入（必出两卡 + 条件触发）**：[`PLANNING_DECISION_SPACE_ADMISSION.md`](./PLANNING_DECISION_SPACE_ADMISSION.md)

**相关后端文档**  
- 产品验收：[`DECISION_CASE_BACKEND_HANDOFF.md`](./DECISION_CASE_BACKEND_HANDOFF.md)  
- SSOT 读/写：[`../../trips/decision-semantics/DECISION_SSOT_FRONTEND_MIGRATION.md`](../../trips/decision-semantics/DECISION_SSOT_FRONTEND_MIGRATION.md)  
- 类型 SSOT：`src/decision-runtime/gateway/contracts/unified-decision-ui.types.ts`  
- Swagger：`/api-docs` → `unified-decision`  
- 跨页 Copilot（P0）：[`../../trips/copilot/ADR-010-Nara-Contextual-Copilot-Page-Insight.md`](../../trips/copilot/ADR-010-Nara-Contextual-Copilot-Page-Insight.md) · [`PAGE_INSIGHT_API.md`](../../trips/copilot/PAGE_INSIGHT_API.md) · [`FRONTEND_INSIGHT_CARD.md`](../../trips/copilot/FRONTEND_INSIGHT_CARD.md) · **本文 §19**

---

## 1. 产品一句话

| 概念 | 含义 | 接口 |
|------|------|------|
| **决策空间 / 待决策列表** | 需要用户处理的已 publish 问题 | `GET /decision-problems` |
| **机会 inbox** | 未过 Eligibility / 门槛不够 | `GET /decision-opportunities` |
| **DecisionCase** | `problemId` 以 `dc_` 开头；车型/保险/冰川等 | 同上列表里的子集，读 `item.decisionCase` |

```
机会层（低门槛） ──publish──► 决策空间队列（problems）
天气 / 封路 / 日载（Canonical）也会直接进 problems，但 writeChain 不同
```

---

## 2. 环境与约定

| 项 | 值 |
|----|-----|
| Base URL | `{HOST}/api`（本地常见 `http://localhost:3000/api`） |
| 鉴权 | 与 Trip API 相同 `Authorization: Bearer <token>`；本地 dev 可无 token |
| Trip 成员 | 非成员 → `FORBIDDEN` |
| 响应包装 | 见 §3 |
| Feature | 后端需 `DECISION_GATEWAY_UNIFIED=1`（否则 Unified 接口 403） |
| 联调 trip | `3e4a1058-9218-467f-988a-c18008a14385` |

---

## 3. 统一响应包装

```json
{
  "success": true,
  "data": { }
}
```

失败：

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND | FORBIDDEN | UNAUTHORIZED | VALIDATION_ERROR | …",
    "message": "…",
    "details": { }
  }
}
```

iOS 建议统一：

```swift
struct APIResponse<T: Decodable>: Decodable {
  let success: Bool
  let data: T?
  let error: APIErrorBody?
}

struct APIErrorBody: Decodable {
  let code: String
  let message: String
  // details 可选，按需 Decode
}
```

先判断 `success`，再解 `data`。

---

## 4. 推荐页面与调用顺序

```
决策空间首页
  GET decision-problems
  ├─ 角标：meta.actionableCount / openCount
  └─ 分组：decisionCase.uiGroup（有则为 Case；无则通用问题区）

问题详情
  GET decision-problems/:id
  └─ 可选 GET …/options（与详情 actions 同形，含 ack）

选方案
  （可选）POST …/options/:actionId/preview
  POST …/resolutions
  POST …/apply          // 或 ?async=1 后轮询 apply-tasks

机会 Tab（可选）
  GET decision-opportunities
  POST …/publish → 刷新 decision-problems
```

Apply 成功后：invalidate / 重新拉取 `decision-problems`；若首页有准备度卡，再拉 `timeline-overview` 或 `overall-readiness`。

---

## 5. API 总表

前缀一律：`/api/trips/{tripId}`

### 5.1 决策空间（必接）

| Method | Path | 用途 | HTTP |
|--------|------|------|------|
| `GET` | `/decision-problems` | **待决策列表** | 200 |
| `GET` | `/decision-problems/{problemId}` | 详情 = `problem` + `actions` | 200 |
| `GET` | `/decision-problems/{problemId}/options` | 方案列表 + `requiredAcknowledgements` | 200 |
| `POST` | `/decision-problems/{problemId}/options/{optionId}/preview` | 方案预览 / tradeoffs | 200 |
| `POST` | `/decision-problems/{problemId}/resolutions` | 提交选择（DECIDED） | 200 |
| `POST` | `/decision-problems/{problemId}/apply` | 应用写回 | 200；`?async=1` → **202** |
| `GET` | `/decision-problems/{problemId}/apply-tasks/{taskId}` | 异步 apply 轮询 | 200 |

Query：

- `includeDebug=1`：仅调试，生产 **不要** 依赖 `debug.*`
- `apply?async=1`：长 apply 用 202 + 轮询

### 5.2 机会层（建议接）

| Method | Path | 用途 |
|--------|------|------|
| `GET` | `/decision-opportunities` | 机会 inbox |
| `POST` | `/decision-opportunities/{opportunityId}/publish` | 升级进决策空间 |

### 5.3 辅助（角标 / 深链）

| Method | Path | 用途 |
|--------|------|------|
| `GET` | `/decision-center` | Gateway 聚合总览 |
| `GET` | `/decision-center/overview` | L1 计数 `openCount` / `blockingProblemCount` / `headline` |

### 5.3b 冰岛自驾 Situation（结构化 Knowledge Pack · 推荐接）

| Method | Path | 用途 |
|--------|------|------|
| `GET` | `/iceland-self-drive-situation` | **gate + 车×路 + 天气因果链**（专用 BFF） |

同一对象也会挂在：

- `GET /decision-problems` → 顶层 `data.icelandSelfDriveSituation`
- `GET /decision-problems/{problemId}` → `data.icelandSelfDriveSituation`

**Schema：** `tripnara.iceland.self_drive_situation.client@v1`

**iOS 绑定（优先结构化字段，勿解析 Case `summary` 文案；子块全部 optional）：**

```swift
struct IcelandSelfDriveSituationClient: Decodable {
  let schemaId: String
  let gate: String                 // ALLOW | NEED_CONFIRM | REPLAN_REQUIRED | BLOCK
  let summary: String
  let primaryActions: [String]
  let vehicleRoadFit: VehicleRoadFitClient?
  let weather: WeatherImpactClient?
  let fuel: FuelClient?
  let daylight: DaylightClient?
  let attractionAccess: AttractionAccessClient?
  let activityRisk: ActivityRiskClient?
  let road: RoadPlowClient?
  let lodging: LodgingClient?
  let insurance: InsuranceCoverageClient?
  let aggregateReasons: [String]
  let runbookId: String?
  let deepLink: DeepLink?
}

struct InsuranceCoverageClient: Codable {
  let tier: String                 // BASIC | STANDARD | FULL
  let recommendedTier: String
  let routeExposure: [String]      // GRAVEL_ROAD | FORD_CROSSING | …
  let gaps: [CoverageGapItem]
  let hasHardGap: Bool
  let hasGap: Bool
  let gate: String                 // ALLOW | NEED_CONFIRM
  let fordingExcluded: Bool        // 恒 true
  let recommendedActions: [String]
}

struct CoverageGapItem: Codable {
  let dimension: String            // GRAVEL_CHIP | WATER_FORDING | …
  let status: String               // COVERED | NOT_COVERED | UNCONFIRMED | EXCLUDED
  let triggeredBy: [String]
  let reasonCode: String
}

struct WeatherImpactClient: Decodable {
  let weatherEventId: String
  let effectivePhenomenon: String?
  let delayRangeMin: [Int]?        // [lo, hi] — 禁止当单点 ETA
  let routeSafety: String?
  let fatigueDelta: String?
  let causalChain: [CausalStep]    // 有序：暴露→降速→ETA→预订→负荷→行动
  let recommendedActions: [String]
}

struct CausalStep: Decodable {
  let code: String
  let summaryZh: String
}

struct DaylightClient: Decodable {
  let nightExposureMinutes: Int
  let sameDayDriveMinutes: Int
  let winterBufferMinutes: Int
  let latestDepartureLocalMin: Int?
  let latestArrivalLodgingLocalMin: Int
  let suggestedDrivingWindow: DrivingWindow?
  let gate: String
  let reasons: [String]
  let recommendedActions: [String]
  let stack: DaylightStack         // fullLoadStack 等
}

struct RoadPlowClient: Decodable {
  let plowServiceBand: String?     // DAILY | REDUCED | NOT_PLOWED | UNKNOWN
  let plowRuleCode: String?
  let plowDelayRangeMin: [Int]?    // [lo, hi]
  let roadSegmentId: String?
  let gate: String?
  let reasons: [String]?
  let recommendedActions: [String]?
}

struct DeepLink: Decodable {
  let problemIdHint: String
  let semanticKeyHint: String
}
```

渲染建议：

1. 用 `gate` 驱动卡片色 / 是否阻断
2. 用 `weather.causalChain` 做竖向因果步骤（不要只显示「有强风」）
3. 用 `weather.delayRangeMin` / `road.plowDelayRangeMin` 显示「约 X–Y 分钟」
4. 用 `daylight`（有则）显示夜间暴露分钟、最晚离开、`stack.fullLoadStack`
5. 冬季四块按需渲染；缺 key 则不画该卡
6. CTA：`deepLink.problemIdHint` → `GET .../decision-problems/{hint}`（有 `insurance.hasGap` 时优先 `dc_insurance_{tripId}`，否则通常 `dc_vehicle_{tripId}`）
7. 保险：只认 `insurance.gaps` / `routeExposure`；**勿解析** Case `summary`；涉水 `fordingExcluded` 恒 true

> 注意：这与 `travelCausalDecision` / `causal-decisions` **不是同一套**。后者是 TravelCausalDecision（侧风延误产品卡）；本字段是 Knowledge Pack WP4 + 日照负荷。

**Cert 回放：** `DEMO-IS-DAYLIGHT-PLOW-CLIENT`（daylight + plow）；`DEMO-IS-INSURANCE-COVERAGE-GAP`（Coverage Gap + fording EXCLUDED + insurance deepLink）。

非冰岛行程 → `GET` 返回 `NOT_FOUND`；列表/详情则 **省略** 该字段。

**日照输入：** 引擎 hydrate 会用 **SunCalc** 写入 `routeFacts.daylightDriving`（`civilDawnLocalMin` / `civilDuskLocalMin` + 计划腿推导的 `nightExposureMinutes` / `sameDayDriveMinutes`）。上游仍可显式覆盖；禁止客户端猜 dusk/dawn。

示例：90 分钟夜间陌生路 + 当日 4h 驾驶 + 次日早预订 → `daylight.stack.fullLoadStack` + `NEED_CONFIRM` + `END_DAY_EARLIER`。

**冬季四块（Situation 同对象上的 optional 字段，缺则省略）：**

| 字段 | 含义 | 前端注意 |
|------|------|----------|
| `attractionAccess` | 景点**季节/步道**开放不确定（POI Access evaluate live） | 仅 `BLOCKED` / `NEEDS_CONFIRMATION` / 季节类规则入卡；`PENDING_CONFIRMATION` / `UNKNOWN` 勿当 OPEN。**SOFT 安全（涌浪）与拥堵 `FEASIBLE_WITH_RISK` 不进本卡**（避免夏季误报「冬季开放待确认」） |
| `activityRisk` | 活动取消/weather hold | 只认 `cancelReasonCodes` 枚举 |
| `road.plow*` | 清雪服务带 + 延误区间（Gagnaveita `Snjomokstursregla` live） | 禁止把 range 收成单点 ETA |
| `lodging` | 入住/营业不确定（Place openingHours live；空→UNKNOWN） | `hoursUnknown` → 确认入住窗 |
| `insurance` | Route Exposure → Coverage Gap（矩阵，非 PDF） | `gaps[]` + `fordingExcluded`；勿解析 Case summary |

Codable：全部 optional。详情页景点可并行 `GET /poi-access-capacity/evaluate`；行中路况 `GET .../execution/road-conditions` 同结构可选字段 `plowServiceBand` / `plowRuleCode` / `plowDelayRangeMin`。

### 5.4 Canonical L2（封路/天气/日载；`writeChain == EVALUATE_AUTHORIZE_EXECUTE`）

主路径仍可用 **resolutions → apply**（Gateway 内部会映射）。若直接走三步：

| Method | Path |
|--------|------|
| `POST` | `/decision-problems/{problemId}/evaluate` |
| `POST` | `/decisions/{decisionId}/authorize` body `{ "choice": "<actionId>" }` |
| `POST` | `/decisions/{decisionId}/execute` Header `Idempotency-Key` 可选 |

**新产品不要用** `POST /decisions`（Legacy）。

### 5.5 本期不必接（可延后）

- `preference-round`、collaborative-sub-tasks CRUD  
- `causal-trace`  
- `weather-hazard/poll`、`daily-load/scan`（ops / 刷新触发，非决策空间 UI 主路径）

---

## 6. 列表：`GET /decision-problems`

### 6.1 响应形状

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.unified_decision_problems@v2",
    "tripId": "…",
    "generatedAt": "2026-07-15T…",
    "meta": {
      "total": 6,
      "openCount": 6,
      "actionableCount": 6,
      "occurrenceCount": 4,
      "byEnforcement": {
        "BLOCK": 1,
        "REQUIRE_ADJUSTMENT": 5
      }
    },
    "items": [ /* UnifiedDecisionProblemListItem */ ]
  }
}
```

### 6.2 角标规则

| 条件 | 文案建议 |
|------|----------|
| `meta.actionableCount > 0` | 「N 待决策」 |
| 否则 `meta.openCount > 0` | 「N 待处理」 |
| 都为 0 | 空态 / 隐藏角标 |

**禁止**用 `items.count` 当角标。

### 6.3 列表项关键字段

| 字段 | 用途 |
|------|------|
| `problemId` | 详情路由参数 |
| `instanceKey` | **SwiftUI `id` / Diffable** 主键（去重键） |
| `title` / `summary` | 主副文案 |
| `semanticKey` | 分析 / 埋点，勿当 UI 分组键 |
| `workflowStatus` | 流程态（见枚举） |
| `executionStatus` | 执行态 |
| `enforcement` | `BLOCK` / `REQUIRE_ADJUSTMENT` / … |
| `actionability.writeChain` | 写路径分支 |
| `actionability.requiresAction` | 是否需用户操作 |
| `decisionCase` | **有则**按 Case 展示；分组用 `uiGroup` |
| `occurrenceCount` | 发生次数角标 |

`problemId` 以 `dc_` 开头 → DecisionCase（冰岛两壳、体验卡等）。

### 6.4 用 `uiGroup` 分组（DecisionCase）

| `decisionCase.uiGroup` | 展示分区 | `uiGroupLabelZh` |
|------------------------|----------|------------------|
| `MUST_CONFIRM` | 必须确认 | 必须确认 |
| `IMPORTANT_CHOICE` | 重要选择 | 重要选择 |
| `WORTH_CONSIDERING` | 值得考虑 | 值得考虑 |

- **分组 key** 只用枚举 `uiGroup`  
- 中文用 `uiGroupLabelZh` 做展示  
- **没有** `decisionCase` 的项（如午餐窗冲突）放「其他 / 规划问题」区，不要硬塞进三组  

映射参考：

| requiredness / 分 | uiGroup |
|-------------------|---------|
| `BLOCKING` | `MUST_CONFIRM` |
| `IMPORTANT` 或 materiality 6–8 | `IMPORTANT_CHOICE` |
| `OPTIONAL` 已 publish | `WORTH_CONSIDERING` |
| materiality &lt; 6 或 ineligible | **不进** problems（仅机会层） |

### 6.5 样例（联调 trip）

```
dc_insurance_*     MUST_CONFIRM     CONSTRAINT_WRITEBACK
dc_glacier_*       MUST_CONFIRM     CONSTRAINT_WRITEBACK
dc_landing_*       IMPORTANT_CHOICE CONSTRAINT_WRITEBACK
dc_drive_*_d2      IMPORTANT_CHOICE CONSTRAINT_WRITEBACK
dc_ring_south_*    IMPORTANT_CHOICE CONSTRAINT_WRITEBACK
```

两壳：`dc_vehicle_{tripId}`、`dc_insurance_{tripId}` 在未确认时应出现（`requiredness=BLOCKING`）。首次 list 会 ensure 写入 metadata。

---

## 7. 详情：`GET /decision-problems/{problemId}`

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.unified_decision_problem_detail@v2",
    "tripId": "…",
    "generatedAt": "…",
    "problem": { /* 同列表项 */ },
    "actions": [ /* DecisionAction */ ],
    "actionability": {
      "requiresAction": true,
      "allowedActions": ["REPAIR", "ALTERNATIVE", "…"],
      "writeChain": "CONSTRAINT_WRITEBACK"
    },
    "resolution": null
  }
}
```

已提交未 apply 时 `resolution` 有值，可只显示「应用到行程」。

### 7.1 Action 卡片

| 字段 | 用途 |
|------|------|
| `actionId` | 提交 `selectedActionId` |
| `title` / `summary` | 标题 / 说明 |
| `allowed` | `false` → 灰显不可点 |
| `blockedReason` | 不可选原因 |
| `requiresConfirmation` | 是否需二次确认 |
| `constraintHints.fordingExcluded` | 保险：涉水免责（全档常为 true） |
| `constraintHints.writebackPayload` | 调试/埋点；应用写回由后端完成，客户端不必再写约束 |

冰川等体验：不合格 option `allowed == false`（Eligibility）。

---

## 8. Options：`GET …/options`

与详情 `actions` 同形，额外：

```json
{
  "schemaId": "tripnara.unified_decision_options@v2",
  "actions": [ … ],
  "actionability": { "writeChain": "CONSTRAINT_WRITEBACK" },
  "requiredAcknowledgements": [
    "我已了解该决策对行程的影响与约束说明",
    "我确认已知悉相关风险并自愿承担决策后果"
  ]
}
```

若返回非空 `requiredAcknowledgements`，submit 时 body 的 `acknowledgement` **必须覆盖这些字符串**（原样提交）。

保险样例 action：

| actionId | title | constraintHints |
|----------|-------|-----------------|
| `insurance_basic` | 基础 CDW | `fordingExcluded: true` |
| `insurance_standard` | 标准套餐（含碎石 GP） | 同上 |
| `insurance_full` | 全险 / 低起赔 | 同上 + fording 说明 |

硬文案（UI 固定展示建议）：涉水过河损坏 ≠ 普通保险覆盖（全险仍不可放心过河）。

---

## 9. 写路径

### 9.1 只按 `writeChain` 分支

| `writeChain` | 典型问题 | iOS 行为 |
|--------------|----------|----------|
| `CONSTRAINT_WRITEBACK` | DecisionCase（车型/保险/冰川…） | `resolutions` → `apply` |
| `EVALUATE_AUTHORIZE_EXECUTE` | Canonical 封路/天气/日载 | **同一套** `resolutions` → `apply`（推荐）；或三步 evaluate/authorize/execute |
| `APPLY_AND_POLL` | Legacy | `resolutions` → `apply` |
| `NONE` / 缺失 | Inform / 只读 | 不展示确认 CTA |

### 9.2 Step A — 提交结论

```http
POST /api/trips/{tripId}/decision-problems/{problemId}/resolutions
Content-Type: application/json

{
  "selectedActionId": "insurance_full",
  "idempotencyKey": "resolution:{tripId}:{problemId}:insurance_full",
  "reason": "optional",
  "acknowledgement": [
    "我已了解该决策对行程的影响与约束说明",
    "我确认已知悉相关风险并自愿承担决策后果"
  ]
}
```

兼容字段（后端同样接受，优先 `selectedActionId`）：`actionId`、`optionId`。

成功要点：

- `nextStep == "APPLY"`
- `problem.workflowStatus` → `DECIDED`
- `resolution.resolutionId`（后续协作任务绑定用，可暂存）

### 9.3 Step B — Apply

同步（默认）：

```http
POST /api/trips/{tripId}/decision-problems/{problemId}/apply
```

异步：

```http
POST /api/trips/{tripId}/decision-problems/{problemId}/apply?async=1
→ 202
{ "data": { "taskId": "…", "status": "PENDING", … } }

GET /api/trips/{tripId}/decision-problems/{problemId}/apply-tasks/{taskId}
→ status: PENDING | APPLYING | REVALIDATING | READY | FAILED
→ READY 时带 result（同同步 apply body）
```

同步成功：`problem.executionStatus` → `APPLIED`（再验证后可能 `RESOLVED`）。  
客户端：**刷新列表**；Case 卡应消失或变为已决。

### 9.4 交互状态机（建议）

```
OPEN / WAITING_DECISION
  → 用户选 action → resolutions
DECIDED + 有 resolution
  → 点「应用到行程」→ apply
APPLIED / RESOLVED
  → 成功态 / 返回列表
```

`allowed == false` 的 action 禁止调用 resolutions。

---

## 10. 机会层

### 10.1 List

```http
GET /api/trips/{tripId}/decision-opportunities
```

```json
{
  "schemaId": "tripnara.decision_opportunities@v1",
  "meta": { "total": 1, "eligibleCount": 1 },
  "items": [{
    "opportunityId": "opp_glacier_…",
    "title": "是否加入冰川体验？",
    "summary": "…",
    "eligible": true,
    "ineligibilityReason": null,
    "eligibility": { "eligible": true, "softWarnings": [], "checks": [] },
    "materiality": { "total": 9, "breakdown": { … } },
    "domain": "EXPERIENCE"
  }]
}
```

- `eligible == false`：展示 `ineligibilityReason` / `eligibility.checks`，禁止或提示不可 publish  
- **禁止**把 opportunities 默认并进决策空间列表  

### 10.2 Publish

```http
POST /api/trips/{tripId}/decision-opportunities/{opportunityId}/publish
```

成功后刷新 `GET decision-problems`，应出现对应 `dc_*` 卡。

---

## 11. `decisionCase` 产品字段（Codable 参考）

```swift
enum DecisionCaseUiGroup: String, Codable {
  case mustConfirm = "MUST_CONFIRM"
  case importantChoice = "IMPORTANT_CHOICE"
  case worthConsidering = "WORTH_CONSIDERING"
}

enum DecisionWriteChain: String, Codable {
  case constraintWriteback = "CONSTRAINT_WRITEBACK"
  case evaluateAuthorizeExecute = "EVALUATE_AUTHORIZE_EXECUTE"
  case applyAndPoll = "APPLY_AND_POLL"
  case none = "NONE"
}

struct DecisionCaseProduct: Codable {
  let sourceKind: String          // REQUIRED_CHOICE | RULE_TRIGGER | OPPORTUNITY | WORLD_EVENT
  let requiredness: String        // BLOCKING | IMPORTANT | OPTIONAL
  let domain: String
  let scope: String               // TRIP | DAY | SEGMENT | ACTIVITY
  let actionKind: String
  let materialityScore: Int
  let materialityBreakdown: MaterialityBreakdown
  let enrichmentStage: String     // SHELL | ENRICHED
  let writebackTargets: [String]
  let uiGroup: DecisionCaseUiGroup
  let uiGroupLabelZh: String
  let eligibility: EligibilitySnapshot?
}

struct UnifiedProblemListItem: Codable, Identifiable {
  var id: String { instanceKey }
  let problemId: String
  let instanceKey: String
  let title: String
  let summary: String
  let semanticKey: String
  let workflowStatus: String
  let executionStatus: String
  let enforcement: String
  let actionability: Actionability
  let occurrenceCount: Int
  let decisionCase: DecisionCaseProduct?
}

struct Actionability: Codable {
  let requiresAction: Bool
  let writeChain: DecisionWriteChain?
  // allowedActions / recommendedAction 按需
}

struct DecisionAction: Codable, Identifiable {
  var id: String { actionId }
  let actionId: String
  let title: String
  let summary: String
  let allowed: Bool
  let blockedReason: String?
  let requiresConfirmation: Bool
  let constraintHints: ConstraintHints?
}

struct ConstraintHints: Codable {
  let fordingExcluded: Bool?
  // writebackPayload: [String: JSONValue]?  可选
}
```

完整字段以 `unified-decision-ui.types.ts` 为准；未知键用 `JSONDecoder` 默认策略忽略即可。

---

## 12. 枚举速查

### workflowStatus（节选）

常见展示：`WAITING_DECISION` / `ASSESSING` / `DECIDED` / `RESOLVED` …

### executionStatus

`NOT_REQUIRED` | `NOT_STARTED` | `DRAFT_CREATED` | `APPLYING` | `APPLIED` | `VERIFIED` | `FAILED` | `ROLLED_BACK`

### enrichmentStage

| 值 | UI |
|----|-----|
| `SHELL` | 壳卡（文案偏通用）；两壳首刷 |
| `ENRICHED` | 路线就绪后更具体 options / 文案 |

---

## 13. 冰岛 P0 Case 表（联调对照）

| semanticKey | problemId 模式 | requiredness | 说明 |
|-------------|----------------|--------------|------|
| `REQUIRED_CHOICE.VEHICLE_ROAD_FIT` | `dc_vehicle_{tripId}` | BLOCKING | **默认必出**；SHELL→ENRICHED |
| `REQUIRED_CHOICE.RENTAL_INSURANCE` | `dc_insurance_{tripId}` | BLOCKING | **默认必出**；涉水免责 |
| `RULE_TRIGGER.FROAD_VEHICLE_MISMATCH` | `dc_froad_{tripId}_{road}` | BLOCKING | 条件：两驱 + 保留 F-road |
| `RULE_TRIGGER.EXCESSIVE_DAILY_DRIVE` | `dc_drive_{tripId}_d{n}` | IMPORTANT | 条件：日驾超硬门槛；与 Canonical 日载去重 |
| `RULE_TRIGGER.LANDING_LONG_DRIVE` | `dc_landing_{tripId}` | IMPORTANT | 条件：落地长驾 |
| `RULE_TRIGGER.RING_VS_SOUTH_SCOPE` | `dc_ring_south_{tripId}` | IMPORTANT | 条件：环岛 vs 南岸 |
| `RULE_TRIGGER.DRIVER_LICENSE_INELIGIBLE` | （建议） | BLOCKING | **待做**：驾照/资格不足 |
| `RULE_TRIGGER.CHILD_SEAT_UNRESOLVED` | （建议） | IMPORTANT | **待做**：儿童座椅临近出发未解决 |
| `OPPORTUNITY.GLACIER_EXPERIENCE` | `dc_glacier_{tripId}` | IMPORTANT+ | 机会层；默认不进队列 |
| `OPPORTUNITY.HIGH_IMPACT_EXPERIENCE` | `dc_exp_{kind}_{tripId}` | IMPORTANT | 过闸才进队列 |

去重：已有 Canonical `EXCESSIVE_DAILY_LOAD` 时，**不应**再展示 DecisionCase 日驾卡。  
产品细则见 [`PLANNING_DECISION_SPACE_ADMISSION.md`](./PLANNING_DECISION_SPACE_ADMISSION.md)。

---

## 14. 深链（准备度 / 其他 Tab → 决策空间）

准备报告等可能下发 `actionCode` / `deepLink`：

| actionCode / deepLink | iOS 建议 |
|-----------------------|----------|
| `OPEN_DECISION_SPACE` / `decision-space` | 打开决策空间列表 |
| `CONFIRM_VEHICLE` | 深链到 `dc_vehicle_{tripId}` 详情 |
| `CONFIRM_RENTAL_INSURANCE` | 深链到 `dc_insurance_{tripId}` 详情 |

整体准备度对接另见：`src/trips/overall-readiness/OVERALL_TRIP_READINESS_FE_HANDOFF.md`。

---

## 15. 联调 Smoke（可直接跑）

```bash
TRIP=3e4a1058-9218-467f-988a-c18008a14385
BASE=http://localhost:3000/api   # 换成你们环境

# 1) 列表 + 分组字段
curl -s "$BASE/trips/$TRIP/decision-problems" \
  | jq '.data|{meta, items:[.items[]|{problemId,title,writeChain:.actionability.writeChain,uiGroup:.decisionCase.uiGroup}]}'

# 2) 保险 options + ack
curl -s "$BASE/trips/$TRIP/decision-problems/dc_insurance_$TRIP/options" \
  | jq '.data|{writeChain:.actionability.writeChain,actions:[.actions[]|{actionId,title,allowed,constraintHints}],acks:.requiredAcknowledgements}'

# 3) 选全险 → apply（会改 fixture 状态，慎对生产）
ACK='["我已了解该决策对行程的影响与约束说明","我确认已知悉相关风险并自愿承担决策后果"]'
curl -s -X POST "$BASE/trips/$TRIP/decision-problems/dc_insurance_$TRIP/resolutions" \
  -H 'Content-Type: application/json' \
  -d "{\"selectedActionId\":\"insurance_full\",\"idempotencyKey\":\"resolution:$TRIP:ins:full\",\"acknowledgement\":$ACK}" \
  | jq '.data|{nextStep,workflow:.problem.workflowStatus,resolutionId:.resolution.resolutionId}'

curl -s -X POST "$BASE/trips/$TRIP/decision-problems/dc_insurance_$TRIP/apply" \
  | jq '.data|{execution:.problem.executionStatus,apply:.applyResult,revalidation}'

# 4) 机会层
curl -s "$BASE/trips/$TRIP/decision-opportunities" | jq '.data|{meta,items:[.items[]|{opportunityId,title,eligible}]}'
```

期望：

1. 列表 `schemaId` = `@v2`；Case 卡带 `uiGroup` + `CONSTRAINT_WRITEBACK`  
2. 保险三档 + `fordingExcluded` + ack 数组  
3. resolutions → `nextStep=APPLY`；apply → `APPLIED`；再 list 保险卡应消退或状态变化  

---

## 16. iOS DoD（验收清单）

- [ ] 决策空间 **只**请求 `GET decision-problems`  
- [ ] 角标用 `meta.actionableCount` / `openCount`  
- [ ] Case 用 `decisionCase.uiGroup` 分组；有 `uiGroupLabelZh` 做标题  
- [ ] `instanceKey` 作列表稳定 id  
- [ ] `writeChain == CONSTRAINT_WRITEBACK`：resolutions → apply  
- [ ] `allowed == false` 灰显；保险展示涉水免责  
- [ ] options/preview 的 `requiredAcknowledgements` 原样回传  
- [ ] apply 后刷新列表（及准备度若已接入）  
- [ ] 机会层独立入口；publish 后刷新 problems  
- [ ] **不**读 `flow` / **不**默认合并 opportunities / **不**用 `POST /decisions` 做新产品写链  
- [ ] **Copilot P0（§19）**：进页 / 切问题调 evaluate；按 `mode` 展示；PREVIEW 进现有详情；feedback 上报；Insight 失败不挡主 UI  

---

## 17. 常见错误

| code | 场景 | 处理 |
|------|------|------|
| `NOT_FOUND` | problem 未 ensure / 已 resolve 消失 | 回列表刷新 |
| `FORBIDDEN` | 非行程成员 | 提示无权限 |
| `VALIDATION_ERROR` | 缺 acknowledgement / 非法 actionId | 展示 `message` / `details` |
| Gateway 403 | `DECISION_GATEWAY_UNIFIED` 未开 | 找后端开开关 |
| `PAGE_CONTRACT_NOT_FOUND` | Copilot `pageId` 未注册（非 `DECISION_SPACE`） | 检查 body.`pageId` |

---

## 18. 建议实现切片（PR 顺序）

1. **DS-iOS-1** List + meta 角标 + uiGroup section  
2. **DS-iOS-2** Detail + actions（allowed/灰显）  
3. **DS-iOS-3** resolutions → apply（含 ack、idempotencyKey）  
4. **DS-iOS-4** 异步 apply 轮询（可选）  
5. **DS-iOS-5** Opportunities + publish（可选）  
6. **DS-iOS-6** 准备度深链 `OPEN_DECISION_SPACE` / 两壳（可选）  
7. **DS-iOS-7** Nara Page Insight Card（§19）— 依赖 1–2 已有详情路由  

---

## 19. Nara Page Insight（Copilot）· iOS 对接 Checklist

> **目标**：在决策空间工作现场展示结构化 Insight；**不**新开写通道。  
> **契约 SSOT**：[`PAGE_INSIGHT_API.md`](../../trips/copilot/PAGE_INSIGHT_API.md) · [`FRONTEND_INSIGHT_CARD.md`](../../trips/copilot/FRONTEND_INSIGHT_CARD.md) · `tripnara.nara_page_insight@v1`  
> **路径**：与 Web 相同 — `POST/GET /api/trips/{tripId}/copilot/...`（暂无 `/api/mobile/.../copilot` 别名，iOS 直接打 trips 路径即可）

### 19.1 何时请求

| 时机 | 调用 | 说明 |
|------|------|------|
| 进入决策空间列表 / 详情 | `evaluate` | `pageId=DECISION_SPACE` |
| 用户选中另一条 Decision Problem | `evaluate` | 更新 `selectedRefs` |
| 用户点「问 Nara」 | `evaluate` + `forceRefresh: true` | 绕过服务端未过期缓存 |
| 展开 / 关闭 / 点 Preview | `feedback` | 只采集，不改 Insight 内容 |

**Insight 失败或超时：决策空间列表/详情仍可独立使用**（Copilot 是增强层）。

### 19.2 API

| Method | Path |
|--------|------|
| POST | `/api/trips/{tripId}/copilot/page-insights:evaluate` |
| GET | `/api/trips/{tripId}/copilot/page-insights/{insightId}` |
| POST | `/api/trips/{tripId}/copilot/page-insights/{insightId}/feedback` |

**Evaluate 请求（最小）：**

```json
{
  "pageId": "DECISION_SPACE",
  "lifecycle": "PLANNING",
  "selectedRefs": [
    { "entityType": "DECISION_PROBLEM", "entityId": "dc_glacier_{tripId}" }
  ],
  "locale": "zh-CN"
}
```

列表页无选中项时可省略 `selectedRefs`（服务端选最重要开放问题）。  
**禁止**上传完整行程 JSON、选项正文、或自造写参。

**Feedback：**

```json
{
  "type": "ACTION_PREVIEWED",
  "actionRef": "decision-problem:dc_glacier_…"
}
```

`type` ∈ `OPENED` | `DISMISSED` | `SNOOZED` | `ACTION_PREVIEWED` | `ACTION_ACCEPTED` | `ACTION_REJECTED` | `NOT_RELEVANT`

### 19.3 Swift 模型（建议）

```swift
enum InsightMode: String, Decodable { case SILENT, ATTENTION, INTERVENTION }
enum InsightPriority: String, Codable { case P0, P1, P2 }

struct PageInsightEvaluateResponse: Decodable {
  let schema: String
  let evaluation: PageInsightEvaluation
  let insight: NaraPageInsight
}

struct PageInsightEvaluation: Decodable {
  let contextHash: String
  let cacheHit: Bool
  let authoritativeAssembledAt: String
  let llmUsed: Bool
  let degradedReason: String?
}

struct NaraPageInsight: Decodable {
  let id: String
  let tripId: String
  let pageId: String
  let mode: InsightMode
  let priority: InsightPriority
  let insightType: String
  let title: String
  let observation: InsightObservation
  let explanation: InsightExplanation
  let impacts: [InsightImpact]
  let recommendation: InsightRecommendation?
  let actions: [InsightAction]
  let confidence: Double
  let evidenceRefs: [String]
  let context: InsightContextMeta
  let generatedAt: String
  let expiresAt: String?
}

struct InsightObservation: Decodable {
  let summary: String
  let factRefs: [String]
}

struct InsightExplanation: Decodable {
  let summary: String
  let causalChainRefs: [String]?
}

struct InsightImpact: Decodable {
  let dimension: String  // TIME | SAFETY | FATIGUE | COST | …
  let severity: String
  let summary: String
}

struct InsightRecommendation: Decodable {
  let summary: String
  let rationale: String
  let recommendedOptionId: String?
}

struct InsightContextMeta: Decodable {
  let contextHash: String
  let tripVersion: String
  let worldStateVersion: String?
  let decisionWorkspaceVersion: String?
  let pageContractVersion: String
}

/// actions 为 tagged union：按 kind 分支 Decode
enum InsightAction: Decodable {
  case navigation(label: String, pageId: String, entityType: String?, entityId: String?)
  case preview(label: String, actionType: String, payloadRef: String)
  // P0 服务端不下发 COMMAND；若收到可忽略或灰显
  case command(label: String, actionType: String, commandRef: String)

  enum CodingKeys: String, CodingKey {
    case kind, label, actionType, payloadRef, commandRef, target
  }
  // Decode: switch kind — NAVIGATION / PREVIEW / COMMAND
}
```

完整字段以 API 响应 / [`page-insight.types.ts`](../../trips/copilot/contracts/page-insight.types.ts) 为准。
### 19.4 UI：`NaraPageInsightCard`

| `mode` | 何时 | 展示 |
|--------|------|------|
| `SILENT` | 无开放问题；或仅有队列已展示的常规待决（无阻塞/无方案实质分歧） | 仅轻量「问 Nara」；**不**铺正文 |
| `ATTENTION` | 方案实质分歧 / 证据过期；或用户 `forceRefresh`（问 Nara） | 一行轻提示，点击展开卡片 |
| `INTERVENTION` | `BLOCKING` / `MUST_CONFIRM` / 安全相关 | 默认展开 |

**策略要点（决策空间）：** 队列本身已展示 unresolved；**不要**把「有待决 / actionable」当成主动 ATTENTION。点「问 Nara」时带 `forceRefresh: true`。

查因：读响应 `data.evaluation`：

- `modeReason`（常见 `QUEUE_ALREADY_SURFACES` / `CACHE_HIT` / `SELECTED_NOT_IN_QUEUE`）  
- `focusResolveStatus` + `clientSelectedRef` + `openProblemIdsSample` / `openInstanceKeysSample`  
- `workspacePresentForFocused`（Workspace 有行 ≠ 在 open 队列）

`selectedRefs.entityId` 请传 Gateway 的 `problemId`，或列表 `instanceKey`（Assembler 两者都认）。详见 [`PAGE_INSIGHT_API.md`「为何是 SILENT」](../../trips/copilot/PAGE_INSIGHT_API.md)。

卡片只绑结构化字段（**禁止**解析 Markdown）：

**优先（顾问短卡）：** 有 `insight.advisorCopy` 时只渲染三行，**不要**再铺 observation / impacts / causalDecisionCard（会与详情同文）。

```
advisorCopy.title
advisorCopy.body
advisorCopy.advice
actions[]
```

**降级（无 advisorCopy）：**

```
title
发生了什么 ← observation.summary
影响       ← impacts[]（dimension · summary）
推荐       ← recommendation?.summary + rationale
按钮       ← actions[]
```

建议放在：详情页顶部折叠区，或列表选中后的 Bottom Sheet（移动端默认表面见 Contract：`RIGHT_RAIL` → iOS 用 sheet / 内嵌条均可）。

### 19.5 PREVIEW → 现有 Decision 路由（关键）

`payloadRef` 形如 `decision-problem:{problemId}`。

| action | iOS 行为 |
|--------|----------|
| `kind=PREVIEW`, `OPEN_DECISION` | 打开**已有** problem 详情（同 §DS-iOS-2） |
| `kind=PREVIEW`, `COMPARE_OPTIONS` | 打开同一详情的 options / 比较区（已有 `GET .../options` 或 Bundle） |
| `kind=NAVIGATION`, `pageId=DECISION_SPACE` | 聚焦 `target.entityRef` 对应列表项 |

解析示例：

```swift
func problemId(from payloadRef: String) -> String? {
  guard payloadRef.hasPrefix("decision-problem:") else { return nil }
  return String(payloadRef.dropFirst("decision-problem:".count))
}
```

等价 HTTP（已有，勿新写 Preview 引擎）：

- `GET /api/trips/{tripId}/decision-problems/{problemId}`
- `GET /api/trips/{tripId}/decision-problems/{problemId}/options`
- `GET /api/trips/{tripId}/decision-space-bundle?problemId=...&surface=default`

点 Preview 后：`feedback` `type=ACTION_PREVIEWED`，`actionRef=payloadRef`。

**P0 不做：** 根据 Insight 直接 `resolutions` / `apply`；等用户在现有决策 UI 确认后再走 §DS-iOS-3。

### 19.6 联调 Smoke（Copilot）

```bash
TRIP=3e4a1058-9218-467f-988a-c18008a14385
BASE=http://localhost:3000/api

# evaluate（冰川卡若已 publish）
curl -s -X POST "$BASE/trips/$TRIP/copilot/page-insights:evaluate" \
  -H 'Content-Type: application/json' \
  -d "{\"pageId\":\"DECISION_SPACE\",\"lifecycle\":\"PLANNING\",\"selectedRefs\":[{\"entityType\":\"DECISION_PROBLEM\",\"entityId\":\"dc_glacier_$TRIP\"}],\"locale\":\"zh-CN\"}" \
  | jq '.data|{schema, mode:.insight.mode, title:.insight.title, actions:.insight.actions, cacheHit:.evaluation.cacheHit, hash:.evaluation.contextHash}'

# 同上下文再打一次 → cacheHit 应为 true
# feedback
INS=$(curl -s -X POST "$BASE/trips/$TRIP/copilot/page-insights:evaluate" \
  -H 'Content-Type: application/json' \
  -d "{\"pageId\":\"DECISION_SPACE\",\"lifecycle\":\"PLANNING\"}" | jq -r '.data.insight.id')
curl -s -X POST "$BASE/trips/$TRIP/copilot/page-insights/$INS/feedback" \
  -H 'Content-Type: application/json' \
  -d '{"type":"OPENED"}' | jq .
```

期望：`schema=tripnara.nara_page_insight@v1`；无问题或仅常规待决 → `SILENT`；多方案实质分歧 → `ATTENTION`；阻塞/安全 → `INTERVENTION`；`forceRefresh` 可将 SILENT 升为解释卡；无 `COMMAND`。

### 19.7 Copilot DoD

- [ ] 进入决策空间触发 `evaluate`  
- [ ] 切换当前 `problemId` 再 `evaluate`（`selectedRefs` 更新）  
- [ ] `SILENT` / `ATTENTION` / `INTERVENTION` 三种 UI 态正确  
- [ ] 卡片只渲染结构化字段，不解析 Markdown  
- [ ] `PREVIEW` 进入**现有**详情 / options，不新建写 API  
- [ ] `OPENED` / `DISMISSED` / `ACTION_PREVIEWED` feedback 已报  
- [ ] Copilot 网络失败时主决策 UI 仍可用  
- [ ] 同上下文重复进入可接受缓存（`cacheHit`）；「问 Nara」用 `forceRefresh`  
- [ ] **不**在 Insight 卡上直接 apply / resolutions  

### 19.8 推荐 PR 切分

1. Codable + API client（evaluate / get / feedback）  
2. `NaraPageInsightCard` + mode 外壳（SILENT 入口）  
3. PREVIEW → 现有详情路由 + feedback  
4. 列表选中联动 `selectedRefs`  

---

**一句话**：iOS 决策空间 = `GET decision-problems` 按 `uiGroup` 展示待决策；DecisionCase 一律 `resolutions` → `apply`；机会层单独拉、勿混队列。Nara Insight = 同页解释层，`evaluate` → 卡片 → PREVIEW 回现有详情。
