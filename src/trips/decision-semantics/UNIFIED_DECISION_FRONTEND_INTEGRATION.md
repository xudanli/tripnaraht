# Unified Decision API — 前端对接指南

> **已废弃（2026-07-03）** — 请改用 **[DECISION_SSOT_FRONTEND_MIGRATION.md](./DECISION_SSOT_FRONTEND_MIGRATION.md)**。  
> 本文档保留仅供 Legacy `flow` 联调回溯；新 UI **不得**再按 `flow` / `CANONICAL_L2` 分支实现。

**读者：** 前端 / 联调 QA  
**版本：** 2026-06-30（RFC-002 Gateway + Phase 3 Canonical Runtime + Iceland Slices 1–3）  
**前提：** 本仓库为 NestJS 后端；前端在独立 repo，通过 HTTP 消费 API。  
**Legacy 基线：** [DECISION_CENTER_FE_MVP_INTEGRATION.md](./DECISION_CENTER_FE_MVP_INTEGRATION.md)（V1.5 apply + poll 仍有效）  
**架构上下文（六层 ↔ API）：** [DECISION_RUNTIME_MATURITY.md §11](../../decision-runtime/DECISION_RUNTIME_MATURITY.md#11-前端与决策中心如何读六层)

---

## 0. 联调启动清单（后端 + 前端）

**联调 Handoff（tripId / problemId / curl）：** [FE_INTEGRATION_HANDOFF.md](./FE_INTEGRATION_HANDOFF.md)

### 0.1 后端准备（本仓库）

1. **写入环境变量** — 复制 [`.env.unified-decision-frontend.example`](../../../.env.unified-decision-frontend.example) 到 `.env` 并重启服务。
2. **跑门禁** — `npm run rfc002:fe-readiness`（pack 认证 + gateway 单测 + L2 状态机契约）。
3. **环境自检** — 写入 `.env` 后 `npm run decision-center:unified-env-check`（7 项开关应全绿）。
4. **API smoke**（需 `npm run dev` 已启动）：

```bash
# 读模型（默认冰岛 fixture trip）
npm run decision-center:unified-qa

# 指定 trip / staging baseUrl
npm run decision-center:unified-qa -- 3e4a1058-9218-467f-988a-c18008a14385 https://staging.example.com/api

# 探测 Canonical L2 evaluate → authorize（会改 trip 状态，勿对生产跑）
npx tsx scripts/unified-decision-frontend-qa.ts --write 3e4a1058-9218-467f-988a-c18008a14385
```

4. **Swagger** — `http://localhost:3000/api-docs`，搜索 `RFC-002` / `decision-center`。
5. **Legacy 回归**（V1.5 仍可用）— `npm run decision-center:staging-qa`。

| 检查项 | 命令 / 预期 |
|--------|-------------|
| Gateway 开关 | `DECISION_GATEWAY_UNIFIED=1`，否则 API 403 |
| Shadow 关闭 | `RFC001_SHADOW_MODE=0`，否则 L2 不写 Effective Plan |
| 三 Slice | 三个 `CANONICAL_*=1` 或兼容 `RFC001_ICELAND_*` |
| Pack | `DECISION_PACK_RUNTIME=1` → `decision-center.activePacks` |
| 单测 | `npm run rfc002:gate` 全绿 |

### 0.2 前端准备（独立 repo）

| 项 | 说明 |
|----|------|
| Feature Flag | `VITE_DECISION_GATEWAY_UNIFIED=1` |
| 路由 | 读 `problem.flow`：`CANONICAL_L2` → evaluate/authorize/execute；`LEGACY_V15` → 旧 apply + poll |
| 类型 | 从后端 `@/generated/unified-decision-contracts` 同步或 copy |
| 鉴权 | 与 Trip API 相同 Bearer；本地 dev 可无 token（`anonymous-dev-user`） |
| 联调行程 | 冰岛：`3e4a1058-9218-467f-988a-c18008a14385`；通用：`807b3c54-4793-4006-a66d-67e79faa6fc2` |

**建议 PR 顺序：** FE-UD-1 读模型 + `flow` → FE-UD-2 道路 L2 → FE-UD-3 天气 → FE-UD-4 列表 + `activePacks` → FE-UD-5 日负荷。

### 0.3 触发 Canonical 问题的快捷方式

| Slice | 主动 API | 典型 authorize `choice` |
|-------|----------|-------------------------|
| 道路 | 行程内已有 road close 问题，或 staging fixture | `cand_a` |
| 天气 | `POST .../weather-hazard/poll` `{ dayIndex, runFull: true }` | `cand_indoor` |
| 日负荷 | `POST .../daily-load/scan` `{ runFull: true }` | `cand_split_day` |

---

## 1. 核心原则（必读）

| 原则 | 说明 |
|------|------|
| **单入口** | Gateway 开时用 `/api/trips/:tripId/decision-*`，不要分叉 internal API |
| **不看目的地** | 禁止 `if (destination === 'IS')` 选接口；用 `flow` + `route.resolution` |
| **双轨 L2** | Canonical：`evaluate → authorize → execute`；Legacy：`options → preview → POST decisions → poll` |
| **类型 SSOT** | `@/generated/unified-decision-contracts`（Canonical）+ `@/generated/decision-semantics-contracts`（Legacy） |
| **Tab vs 决策** | 行程 Tab BFF 只读 Effective Plan 投影；正式 L2 写链仅在 Decision Center（见 [Maturity §11](../../decision-runtime/DECISION_RUNTIME_MATURITY.md#11-前端与决策中心如何读六层)） |

---

## 2. 后端能力一览

| Slice | semanticCapability | Persona | 环境变量（推荐） | 兼容别名 | Gateway |
|-------|-------------------|---------|------------------|----------|---------|
| 道路关闭 | `ROAD_SEGMENT_UNAVAILABLE` | Abu | `CANONICAL_ROAD_SEGMENT_UNAVAILABLE=1` | `RFC001_ICELAND_ROAD_CLOSE=1` | ✅ |
| 天气活动 | `WEATHER_ACTIVITY_PROHIBITED` | Abu | `CANONICAL_WEATHER_ACTIVITY_PROHIBITED=1` | `RFC001_ICELAND_WEATHER_ACTIVITY=1` | ✅ |
| 日驾驶负荷 | `EXCESSIVE_DAILY_LOAD` | Dr.Dre | `CANONICAL_EXCESSIVE_DAILY_LOAD=1` | `RFC001_ICELAND_EXCESSIVE_LOAD=1` | ✅ |
| Unified Gateway | — | — | `DECISION_GATEWAY_UNIFIED=1` | — | ✅ |
| Legacy V1.5 | feasibility / gate / 旧 repair | — | （默认） | — | Fallback |
| Pack 元数据 | — | — | `DECISION_PACK_RUNTIME=1` | — | `activePacks` |
| Pack 规则 | — | — | `DECISION_PACK_RULES=1` | — | 后端评估用，前端无感 |

**路由引擎 ID：** Canonical 问题统一使用 `CANONICAL_DECISION_RUNTIME`（旧值 `RFC001_ICELAND_ROAD_CLOSE` 已废弃，勿硬编码）。后端按 **active destination pack** + capability flag 激活 Canonical，不是 `destination === 'IS'`。

**联调 L2 必须：** `RFC001_SHADOW_MODE=0`（shadow 模式不会产生 Effective Plan）。

---

## 3. Staging 环境变量

```bash
# Gateway + Canonical 三 Slice（推荐 env 名；RFC001_ICELAND_* 仍兼容）
DECISION_GATEWAY_UNIFIED=1
CANONICAL_ROAD_SEGMENT_UNAVAILABLE=1
CANONICAL_WEATHER_ACTIVITY_PROHIBITED=1
CANONICAL_EXCESSIVE_DAILY_LOAD=1
RFC001_SHADOW_MODE=0

# 可选
RFC001_V15_PROJECTION=1          # L1 overview 镜像 Canonical 决策
DECISION_PACK_RUNTIME=1          # decision-center 返回 activePacks
DECISION_PACK_RULES=1            # 后端 pack 规则（前端无需传参）
```

前端 Feature Flag 建议：

```typescript
const useUnifiedGateway =
  import.meta.env.VITE_DECISION_GATEWAY_UNIFIED === '1';
```

---

## 4. API 总览

**全局前缀：** `/api`  
**Trip 域：** `/api/trips/:tripId/...`  
**鉴权：** 与现有 Trip API 相同（`CurrentUser` / Trip member）；Unified Controller 标记 `@Public()` 但仍校验 trip 成员。

**响应包装：**

```typescript
interface StandardResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
```

---

### 4.1 读模型

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `decision-center` | Gateway 聚合：`canonical` + `legacy` + `activePacks?` |
| GET | `decision-problems` | **统一列表**（canonical + legacy 去重），每项含 `flow` |
| GET | `decision-problems/:problemId` | 问题详情，含 `flow: 'CANONICAL_L2' \| 'LEGACY_V15'` |
| GET | `decision-problems/:problemId/options` | 候选 / 修复方案 |
| POST | `decision-problems/:problemId/options/:optionId/preview` | 方案预览 |
| GET | `decision-routes` | 路由审计（debug / ops） |

### 4.2 Canonical L2 写操作（三 Slice 共用）

| 步骤 | 方法 | 路径 | Body / Header |
|------|------|------|----------------|
| 1 评估+定案 | POST | `decision-problems/:problemId/evaluate` | — |
| 2 用户授权 | POST | `decisions/:decisionId/authorize` | `{ choice?: string }` |
| 3 生效 | POST | `decisions/:decisionId/execute` | Header: `Idempotency-Key`（可选） |
| 回滚 | POST | `decisions/:decisionId/rollback` | — |

### 4.3 主动检测（Canonical 专用）

| 方法 | 路径 | Body | 说明 |
|------|------|------|------|
| POST | `weather-hazard/poll` | `{ dayIndex: number; runFull?: boolean }` | 拉取当日天气；`runFull=true` 时走完 pipeline + evaluate |
| POST | `daily-load/scan` | `{ runFull?: boolean }` | 扫描行程日驾驶负荷；`runFull=true` 时生成问题 + PROPOSED |

> 生产环境可在「刷新行程 / 进入 Decision Center」时调用；`runFull` 仅当需要自动开问题卡片时用。

### 4.4 Legacy（Gateway 关或 `flow === 'LEGACY_V15'`）

| 方法 | 路径 |
|------|------|
| GET | `decision-center/overview` |
| GET | `decision-problems/:id/options` |
| POST | `decision-problems/:id/options/:optionId/preview` |
| POST | `decisions` |
| GET | `decisions/:id/execution-status` |

**禁止**对 Canonical 问题走 `POST decisions`。

---

## 5. 双轨流程

```
GET /api/trips/:tripId/decision-center
              │
    ┌─────────┴─────────┐
    │                   │
CANONICAL_L2         LEGACY_V15
(Slices 1–3)         (V1.5 MVP)
    │                   │
evaluate              options
    ↓                   ↓
authorize             preview
    ↓                   ↓
execute               POST decisions → poll
    ↓
Effective Plan 更新
```

**判断用 `flow`，不要猜：**

```typescript
import type { UnifiedDecisionProblemFlow } from '@/generated/unified-decision-contracts';

function handleProblem(item: { flow: UnifiedDecisionProblemFlow }) {
  if (item.flow === 'CANONICAL_L2') {
    return runCanonicalL2(/* ... */);
  }
  return runLegacyV15(/* ... */);
}
```

列表项 / 详情均返回 `flow`：

```json
{
  "ok": true,
  "flow": "CANONICAL_L2",
  "route": {
    "engineId": "CANONICAL_DECISION_RUNTIME",
    "resolution": "PRIMARY",
    "reason": "..."
  },
  "data": { /* Rfc001DecisionCenterProblemView */ }
}
```

---

## 6. 类型与 Helper

```typescript
// Legacy V1.5
import {
  classifyCreateDecisionOutcome,
  buildDecisionIdempotencyKey,
} from '@/generated/decision-semantics-contracts';

// Canonical L2 + Gateway
import {
  UnifiedDecisionCenterView,
  UnifiedDecisionProblemListView,
  UnifiedDecisionProblemFlow,
  Rfc001DecisionCenterTripView,
  Rfc001DecisionCenterProblemView,
  classifyCanonicalL2Phase,
  isCanonicalL2Problem,
  personaLabelForSemanticCapability,
  shouldRefreshItineraryAfterCanonicalExecute,
} from '@/generated/unified-decision-contracts';
```

**L2 阶段（UI 状态机）：**

```typescript
const phase = classifyCanonicalL2Phase({
  semanticCapability: problem.rfc001Problem.semanticCapability,
  recordStatus: problem.record?.recordStatus,
  planVersionStatus: problem.planVersion?.status,
  requiresUserConfirmation: problem.requiresUserConfirmation,
  route: gatewayRoute,
});

// NEEDS_EVALUATE      → CTA「生成方案」→ POST evaluate
// AWAITING_AUTHORIZE  → 展示 candidates，POST authorize { choice }
// AWAITING_EXECUTE    → CTA「确认生效」→ POST execute
// EFFECTIVE           → 完成，刷新 itinerary
// ROLLED_BACK         → 已回滚
// NEEDS_REPAIR        → 人工 / 重试 evaluate
```

---

## 7. Canonical L2 完整示例

```typescript
async function runCanonicalL2(
  tripId: string,
  problemId: string,
  choice: string,
) {
  // 1) Evaluate + finalize → PROPOSED
  const evalRes = await api.post<
    StandardResponse<{
      ok: boolean;
      route: DecisionRouteResult;
      record: { decisionId: string; recordStatus: string };
      planVersion: { status: string };
    }>
  >(`/api/trips/${tripId}/decision-problems/${problemId}/evaluate`);

  const { record } = evalRes.data!;
  const decisionId = record.decisionId;

  // 2) Authorize
  await api.post(`/api/trips/${tripId}/decisions/${decisionId}/authorize`, {
    choice,
  });

  // 3) Execute → EFFECTIVE
  await api.post(
    `/api/trips/${tripId}/decisions/${decisionId}/execute`,
    null,
    {
      headers: {
        'Idempotency-Key': `pv:${tripId}:${decisionId}`,
      },
    },
  );

  await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
}
```

---

## 8. 各 Slice 候选 ID 与 authorize choice

| semanticCapability | Persona | 典型 `choice` | 用户文案方向 |
|--------------------|---------|---------------|--------------|
| `ROAD_SEGMENT_UNAVAILABLE` | Abu | `cand_a` … `cand_e` | 绕路 / 替代路线 |
| `WEATHER_ACTIVITY_PROHIBITED` | Abu | `cand_indoor` | 改为室内活动 |
| `EXCESSIVE_DAILY_LOAD` | Dr.Dre | `cand_split_day` | 拆分超载日 |

```typescript
personaLabelForSemanticCapability(cap);
// 'Abu' | 'Dr.Dre' | 'Neptune' | 'Decision Core'
```

**options 与 candidates：**  
- 列表/详情中 Canonical 问题的 `candidates[]` 来自 read model  
- 也可 `GET decision-problems/:id/options`（Gateway 路由后返回统一 `options`）

---

## 9. 主动检测对接

### 9.1 天气 Poll

```typescript
await api.post(`/api/trips/${tripId}/weather-hazard/poll`, {
  dayIndex: 1,       // 0-based，与 TripDay 顺序一致
  runFull: false,    // true = 检测到变化后直接 evaluate+finalize
});
```

响应（无变化）：

```json
{ "success": true, "data": { "ok": true, "changed": false, "result": null } }
```

响应（有变化 + runFull）：

```json
{
  "success": true,
  "data": {
    "ok": true,
    "changed": true,
    "runFull": true,
    "record": { "decisionId": "...", "recordStatus": "PROPOSED" },
    "problem": { "problemId": "...", "semanticCapability": "WEATHER_ACTIVITY_PROHIBITED" }
  }
}
```

### 9.2 日负荷 Scan

```typescript
await api.post(`/api/trips/${tripId}/daily-load/scan`, {
  runFull: false,    // true = 扫描到超载后直接 runFullFromPlanScan
});
```

响应（未超载）：

```json
{ "success": true, "data": { "ok": true, "overloaded": false, "result": null } }
```

响应（超载 + runFull）：

```json
{
  "success": true,
  "data": {
    "ok": true,
    "overloaded": true,
    "runFull": true,
    "record": { "decisionId": "...", "recordStatus": "PROPOSED" },
    "problem": { "semanticCapability": "EXCESSIVE_DAILY_LOAD" }
  }
}
```

**推荐 UX：** Trip 编辑页 / Decision Center 进入时 `runFull: false` 探测；有 `overloaded` / `changed` 再导航到问题详情走 L2。

---

## 10. 响应形状速查

### 10.1 `GET decision-center`

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.unified_decision_center@v1",
    "tripId": "trip_xxx",
    "activeResolution": "PRIMARY",
    "problemCount": 2,
    "activePacks": {
      "schemaId": "tripnara.active_destination_packs@v1",
      "layers": [{ "packId": "destination.global" }, { "packId": "destination.is" }],
      "supportedSemanticKeys": ["ROAD_SEGMENT_UNAVAILABLE", "WEATHER_ACTIVITY_PROHIBITED", "EXCESSIVE_DAILY_LOAD"]
    },
    "canonical": {
      "schemaId": "tripnara.rfc001_decision_center@v1",
      "problems": [{
        "problemId": "problem_load_...",
        "rfc001Problem": {
          "semanticCapability": "EXCESSIVE_DAILY_LOAD",
          "status": "OPEN",
          "urgency": "HIGH"
        },
        "leadingPersona": "DRDRE",
        "requiresUserConfirmation": true,
        "candidates": [{ "candidateId": "cand_split_day", "label": "..." }],
        "record": { "recordStatus": "PROPOSED", "decisionId": "dec_..." },
        "planVersion": { "status": "PENDING_AUTHORIZATION" }
      }],
      "routing": {
        "problemRoutes": [{
          "problemId": "problem_load_...",
          "engineId": "CANONICAL_DECISION_RUNTIME",
          "resolution": "PRIMARY"
        }]
      }
    },
    "legacy": null
  }
}
```

### 10.2 `GET decision-problems`（统一列表）

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.unified_decision_problems@v1",
    "tripId": "trip_xxx",
    "meta": { "total": 3, "canonicalCount": 2, "legacyCount": 1 },
    "items": [{
      "problemId": "problem_weather_...",
      "flow": "CANONICAL_L2",
      "semanticCapability": "WEATHER_ACTIVITY_PROHIBITED",
      "title": "恶劣天气 · 户外活动受限",
      "status": "OPEN",
      "route": { "resolution": "PRIMARY", "engineId": "CANONICAL_DECISION_RUNTIME" }
    }]
  }
}
```

### 10.3 `POST evaluate`

```json
{
  "success": true,
  "data": {
    "ok": true,
    "route": { "resolution": "PRIMARY", "engineId": "CANONICAL_DECISION_RUNTIME" },
    "runId": "run_...",
    "record": {
      "decisionId": "dec_...",
      "recordStatus": "PROPOSED",
      "finalAction": "REPLACE",
      "selectedCandidateId": "cand_split_day",
      "utilityEvaluation": [{ "candidateId": "cand_split_day", "utility": 0.21, "vector": { "...": "..." } }]
    },
    "options": [{
      "id": "cand_split_day",
      "tradeoffs": [
        { "dimension": "POI_COVERAGE", "direction": "IMPROVE", "value": 0.82, "explanation": "体验意图保留" },
        { "dimension": "TIME", "direction": "WORSEN", "value": 0, "unit": "MINUTE", "explanation": "行程时长变化" }
      ]
    }],
    "candidates": [{
      "candidateId": "cand_split_day",
      "abuVerdict": "WARNING",
      "physicalLoad": 1,
      "utility": 0.2125,
      "blocked": false
    }],
    "comparisonView": {
      "schemaId": "tripnara.candidate_comparison@v1",
      "originalIntent": {
        "labels": ["可完成的日行程节奏"],
        "narrative": "当前方案在时间上看似排得下，但当天驾驶与活动负荷已超出团队可舒适完成的范围。"
      },
      "recommendedCandidateId": "cand_split_day",
      "rows": [
        {
          "schemeLabel": "A",
          "title": "维持原计划",
          "recommended": false,
          "selectable": false,
          "safety": { "label": "不通过" },
          "pace": { "label": "高风险", "note": "第 5 日驾驶负荷过高…" },
          "experienceRetentionLabel": "100%",
          "cost": { "label": "¥0" }
        },
        {
          "schemeLabel": "B",
          "title": "拆分超载日，降低驾驶负荷",
          "recommended": true,
          "selectable": true,
          "safety": { "label": "需确认" },
          "pace": { "label": "中等" },
          "experienceRetentionLabel": "82%",
          "cost": { "label": "¥0" }
        }
      ],
      "rejections": [
        { "candidateId": "original", "message": "原计划…因此没有被推荐。" }
      ],
      "headline": "推荐方案 B：拆分超载日，降低驾驶负荷"
    },
    "impactScopeView": {
      "schemaId": "tripnara.impact_scope@v1",
      "trigger": {
        "capability": "EXCESSIVE_DAILY_LOAD",
        "subjectKind": "DAY_LOAD",
        "dayIndex": 5
      },
      "narrative": {
        "templateKey": "impact.daily_load.affects_arrangements",
        "params": {
          "capability": "EXCESSIVE_DAILY_LOAD",
          "subjectKind": "DAY_LOAD",
          "dayIndexes": [5],
          "overloadedDayIndex": 5,
          "arrangementLabels": ["红沙滩"],
          "arrangementCount": 1,
          "directCount": 1,
          "downstreamCount": 0
        }
      },
      "affectedDayIndexes": [5],
      "chain": [
        { "kind": "TRIGGER", "id": "trigger", "entityRefKind": "DAY_LOAD" },
        { "kind": "PLAN_ITEM", "id": "item_1", "label": "红沙滩", "dayIndex": 5 },
        { "kind": "CONSEQUENCE", "id": "consequence_daily_driving_load", "consequenceKind": "DAILY_DRIVING_LOAD", "dayIndex": 5 }
      ],
      "arrangements": [
        { "itemId": "item_1", "label": "红沙滩", "dayIndex": 5, "arrangementKind": "ACTIVITY", "impactType": "AT_RISK", "isDirect": true }
      ]
    },
    "leadingPersona": "DRDRE",
    "generatedAt": "2026-06-30T...",
    "planVersion": { "status": "PENDING_AUTHORIZATION", "planVersionId": "plan_v..." },
    "humanDecisionRequired": false
  }
}
```

> **2026-06-30+** evaluate 内联 `options`、`candidates`、**`comparisonView`**、**`impactScopeView`**。方案对比用 `comparisonView`；影响范围用 **`impactScopeView.narrative.templateKey` + params** 做 i18n（标签来自 POI/entity ref，后端不拼中文句子）。

### 10.4 L2 状态与 Effective Plan

| 阶段 | recordStatus | planVersion.status | Effective Plan |
|------|--------------|-------------------|----------------|
| evaluate 后 | `PROPOSED` | `PENDING_AUTHORIZATION` | **不变** |
| authorize 后 | `AUTHORIZED` | `PENDING_AUTHORIZATION` | **不变** |
| execute 后 | `EFFECTIVE` | `EFFECTIVE` | **更新** |

前端在 `execute` 成功后调用 `shouldRefreshItineraryAfterCanonicalExecute(phase)` 决定是否刷新行程视图。

---

## 11. 推荐页面结构

```
DecisionCenterPage
├── useUnifiedGateway ? GET decision-center : GET overview
├── ProblemList
│   └── GET decision-problems → map items by flow
├── ProblemDetail (/:problemId)
│   ├── flow === CANONICAL_L2 → CanonicalL2Panel
│   │   ├── classifyCanonicalL2Phase
│   │   ├── CandidatePicker (choice → authorize)
│   │   └── ExecuteButton
│   └── flow === LEGACY_V15 → LegacyRepairPanel (现有 MVP)
└── ProactiveBanner (optional)
    ├── POST weather-hazard/poll (per day)
    └── POST daily-load/scan
```

---

## 12. 与 Legacy MVP 共存

| 场景 | 做法 |
|------|------|
| 仅 Legacy | 完全沿用 DECISION_CENTER_FE_MVP |
| 仅 Canonical | Gateway + evaluate/authorize/execute |
| 混合 | **优先** `GET decision-problems` 统一列表（已去重）；勿再并行两个 list API |
| L1 recentDecisions | `RFC001_V15_PROJECTION=1` 时 Canonical 镜像进 overview |

---

## 13. 禁止事项

1. ❌ 调用 `/api/internal/rfc001/iceland/...`（deprecated，仅 harness）
2. ❌ `if (destination === 'IS')` / `if (engineId === 'RFC001_ICELAND_ROAD_CLOSE')` 选 API
3. ❌ Canonical 问题走 `POST decisions` + execution-status poll
4. ❌ 仅用 HTTP 200 判断成功（看 `success` + `recordStatus` / Legacy state machine）
5. ❌ authorize 前假设 Effective Plan 已变（必须 execute 后才刷新 itinerary）

---

## 14. 前端 PR 拆分建议

| PR | 内容 | 验收 |
|----|------|------|
| FE-UD-1 | 类型包 + `VITE_DECISION_GATEWAY_UNIFIED` + GET decision-center / decision-problems | 渲染 Canonical 卡片 + `flow` 标签 |
| FE-UD-2 | Canonical L2 三步（道路 `cand_a`） | 联调 road L2 |
| FE-UD-3 | 天气 UI（`cand_indoor`）+ weather poll | WX-L2 |
| FE-UD-4 | L1 统一列表 + activePacks 展示 | 无重复卡片 |
| FE-UD-5 | Dr.Dre 日负荷（`cand_split_day`）+ daily-load scan | LOAD-L2 |

---

## 15. 联调自检（后端）

```bash
npm run rfc002:gate

# 或分项
npx jest src/trips/guardian-decision-core/e2e/iceland-road-close-l2.spec.ts
npx jest src/trips/guardian-decision-core/e2e/iceland-weather-activity-l2.spec.ts
npx jest src/trips/guardian-decision-core/e2e/iceland-excessive-daily-load-l2.spec.ts
npm run gateway:test
npm run packs:certify
```

---

## 16. 后端 SSOT 文件

| 路径 | 说明 |
|------|------|
| `src/decision-runtime/gateway/controllers/unified-decision.controller.ts` | Unified REST 路由 |
| `src/decision-runtime/gateway/contracts/decision-gateway.types.ts` | Gateway 类型 |
| `src/generated/unified-decision-contracts/index.ts` | 前端 re-export 入口 |
| `src/decision-runtime/gateway/frontend/canonical-decision-l2-state-machine.util.ts` | L2 phase / persona helper |
| `src/trips/guardian-decision-core/adapters/decision-center-bridge.adapter.ts` | Canonical → 展示字段 |
| `docs/rfc/RFC-002_GLOBAL_DECISION_RUNTIME.md` | 架构 RFC |

---

## 17. 常见问题

**Q: evaluate 和 poll/scan 的 `runFull` 区别？**  
A: `runFull: true` 在检测后立即 evaluate+finalize，适合「一键诊断」；问题详情页内仍应显式走 evaluate → authorize → execute，保证用户确认。

**Q: choice 不传会怎样？**  
A: authorize 可能使用 Decision Core 默认推荐候选（`selectedCandidateId`）；生产建议 UI 必传用户所选 `candidateId`。

**Q: `route.resolution !== 'PRIMARY'` 怎么办？**  
A: 展示 `MANUAL_REVIEW` / `LEGACY_FALLBACK` 等文案，走 Legacy 或联系运维；不要强行 Canonical execute。

**Q: 前端需要传 pack 参数吗？**  
A: 不需要。`DECISION_PACK_RUNTIME` / `DECISION_PACK_RULES` 仅后端读取 destination pack 文件。
