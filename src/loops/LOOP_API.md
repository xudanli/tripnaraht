# Trip Loop Engineering — Phase 1 + 2 API

> **Swagger Tag**: `trip-loops`  
> **Global prefix**: `/api`  
> **响应**: `{ success, data, error }`

Phase 1 交付 **Readiness Repair Loop**：薄编排层，内部委托 `feasibility-report` 验证链，持久化 `LoopRun` / `LoopIteration`，由 Verifier 裁决退出条件。

## 架构原则

- **Agent 提议，Verifier 裁决**：Loop 不生成新 repair 逻辑，只调度现有 `FeasibilityReportService`
- **Lifecycle ≠ Runtime**：`Trip.status` 不变；响应含 `runtimeState`（如 `VALIDATING` / `WAITING_FOR_HUMAN`）
- **人工批准写库**：`readiness-repair` 默认只 preview；`apply` 端点才写回行程

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/trips/:tripId/loops/readiness-repair` | 运行 Readiness Repair Loop（响应含 `ui`） |
| `GET` | `/trips/:tripId/loops/readiness-repair/latest` | 最近一次 Loop 的 UI 视图 |
| `POST` | `/trips/:tripId/loops/readiness-repair/trigger` | 事件驱动触发（幂等去重） |
| `GET` | `/trips/:tripId/loops/:loopRunId` | 查询 LoopRun + iterations |
| `POST` | `/trips/:tripId/loops/:loopRunId/apply` | 人工批准后应用推荐 patch |

## POST readiness-repair

### 请求体

```json
{
  "triggerEventId": "evt_optional",
  "forceRefreshEvidence": true,
  "runMonteCarlo": true
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "loopRunId": "loop_550e8400-e29b-41d4-a716-446655440000",
    "status": "WAITING_FOR_HUMAN",
    "runtimeState": "WAITING_FOR_HUMAN",
    "before": {
      "readinessScore": 62,
      "hardBlockers": 3,
      "mustHandleCount": 3,
      "suggestAdjustCount": 2,
      "canStartExecute": false,
      "verdictStatus": "NOT_EXECUTABLE",
      "completionRateP10": 0.71
    },
    "after": {
      "readinessScore": 62,
      "hardBlockers": 3,
      "mustHandleCount": 3,
      "suggestAdjustCount": 2,
      "canStartExecute": false,
      "verdictStatus": "NOT_EXECUTABLE"
    },
    "iterations": [
      {
        "sequence": 1,
        "issueId": "issue-gap-glacier-1",
        "blockerId": "coverage-gap:glacier",
        "issueTitle": "冰川徒步时间冲突",
        "proposal": {
          "optionId": "adjust_time",
          "title": "将冰川徒步提前至 09:00",
          "actionType": "adjust_time"
        },
        "validation": {
          "passed": true,
          "previewStatus": "preview",
          "wouldDefer": false,
          "feasibilityScoreBefore": 62,
          "feasibilityScoreAfter": 78,
          "completionRateP10": 0.88
        },
        "decision": "CONTINUE",
        "attemptedOptions": ["adjust_time", "change_restaurant"]
      }
    ],
    "recommendedPatches": [
      {
        "issueId": "issue-gap-glacier-1",
        "blockerId": "coverage-gap:glacier",
        "optionId": "adjust_time",
        "title": "将冰川徒步提前至 09:00",
        "actionType": "adjust_time",
        "previewStatus": "preview"
      }
    ],
    "requiresApproval": true,
    "stopReason": "patches_ready_for_approval",
    "ui": {
      "phase": "awaiting_approval",
      "headline": "发现 1 个问题，待您确认",
      "progress": { "completedChecks": 3, "totalChecks": 5, "label": "已完成 3/5 项检查" },
      "checklist": [{ "id": "schedule", "label": "时间可执行性", "result": "pending" }],
      "issueCards": [{ "issueId": "issue-gap-glacier-1", "recommendation": "将冰川徒步提前至 09:00" }]
    }
  }
}
```

响应 **`ui`** 字段为 C 端决策闭环面板数据（非 Agent trace）。

### 字段说明

| 字段 | 说明 |
|------|------|
| `status` | `RUNNING` / `WAITING_FOR_HUMAN` / `COMPLETED` / `FAILED` / `PAUSED` |
| `runtimeState` | Loop 运行态投影，与 `Trip.status` 正交 |
| `before` / `after` | 来自 `feasibility-report` 聚合快照 |
| `iterations` | 每次 Blocker → Preview → Validate 的持久化记录 |
| `recommendedPatches` | 验证通过的 patch，待人工 apply |
| `requiresApproval` | 是否存在需用户确认的写库操作 |
| `stopReason` | 退出原因（success / max_iterations / no_progress / guardian_deferred 等） |

## POST apply

### 请求体

```json
{
  "patches": [
    {
      "issueId": "issue-gap-glacier-1",
      "optionId": "adjust_time",
      "executeDecision": true,
      "persistDecision": true,
      "runGuardianNegotiation": true
    }
  ]
}
```

### 响应要点

- `applied[]`：每项为 `ApplyRepairResponse`（与 feasibility apply-repair 一致）
- `after`：apply 后 readiness 快照

## 停止策略（READINESS_REPAIR v1）

| 条件 | 行为 |
|------|------|
| `hardBlockers = 0` 且 `readinessScore ≥ 85` 且 `canStartExecute` | `COMPLETED` |
| 连续两次 blocker/readiness 无改善且 proposal 重复 | `WAITING_FOR_HUMAN`（no_progress） |
| `iterations ≥ 5` | `WAITING_FOR_HUMAN` |
| `timeBudgetMs` 超时 | `FAILED` |
| guardian `wouldDefer` | `WAITING_FOR_HUMAN` |

## 数据模型

迁移：`prisma/migrations/add_loop_engineering_phase1.sql`

| 表 | 用途 |
|----|------|
| `loop_runs` | 一次完整循环（跨 HTTP 请求持久化） |
| `loop_iterations` | observe → diagnose → propose → validate 每步 |

## 与 feasibility-report 关系

| Loop 步骤 | 委托接口 |
|-----------|----------|
| Snapshot | `GET/POST feasibility-report` |
| Repair options | `GET …/issues/:issueId/repair-options` |
| Preview | `POST …/preview-repair` |
| Scoped validate | `POST …/validate-scope` |
| Apply | `POST …/apply-repair` |

C 端仍可直接使用 feasibility-report；Loop API 为**决策闭环 UI** 与审计提供统一 envelope。

## 联调

```bash
# 需先应用 migration
psql "$DATABASE_URL" -f prisma/migrations/add_loop_engineering_phase1.sql

curl -X POST http://localhost:3000/api/trips/{tripId}/loops/readiness-repair \
  -H "Content-Type: application/json" \
  -d '{"forceRefreshEvidence":true}'

curl http://localhost:3000/api/trips/{tripId}/loops/{loopRunId}

curl -X POST http://localhost:3000/api/trips/{tripId}/loops/{loopRunId}/apply \
  -H "Content-Type: application/json" \
  -d '{"patches":[{"issueId":"issue-1","optionId":"adjust_time"}]}'
```

## Phase 2 — 事件驱动 + UI 适配层

### Travel Event Store — LOOP 事件

`TRAVEL_EVENT_STORE_ENABLED=true` 时写入：

| eventType | 说明 |
|-----------|------|
| `trip.constraint.changed` | 约束变更触发 |
| `trip.itinerary.changed` | 行程变更触发 |
| `loop.started` | Loop 开始 |
| `loop.blocker.detected` | 发现 blocker |
| `loop.repair.proposed` | 提出修复 |
| `loop.validation.passed` / `failed` | 验证结果 |
| `loop.completed` | Loop 结束 |

payload / metadata 含 `loopRunId`、`correlationId`、`causationId`。

### 环境变量

```bash
LOOP_AUTO_TRIGGER_ENABLED=true
LOOP_TRIGGER_COOLDOWN_MS=300000
LOOP_AUTO_TRIGGER_ON_PLANNING=true
TRAVEL_EVENT_STORE_ENABLED=true
```

### 自动触发

1. `TRIP_STATE_CHANGED → PLANNING`
2. `apply-repair` 成功写库 → `ITINERARY_CHANGED`（internal pipeline）
3. `POST …/readiness-repair/trigger`

### UI 视图结构

见响应 `ui`：`phase`、`headline`、`checklist`、`issueCards`、`primaryAction`。

```bash
curl http://localhost:3000/api/trips/{tripId}/loops/readiness-repair/latest

curl -X POST http://localhost:3000/api/trips/{tripId}/loops/readiness-repair/trigger \
  -H "Content-Type: application/json" \
  -d '{"triggerType":"ITINERARY_CHANGED","externalEventId":"edit-1","force":true}'
```

## Phase 3 预留

- Travel Event replay 引擎
- Product Improvement Eval Loop 自动 materialize

---

## Phase 3 — 行中 IN_TRIP_RECOVERY Loop

### 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/trips/:tripId/loops/in-trip-recovery` | 运行行中恢复 Loop |
| `GET` | `/trips/:tripId/loops/in-trip-recovery/latest` | 最近一次 UI 视图 |
| `POST` | `/trips/:tripId/loops/in-trip-recovery/trigger` | 事件驱动触发 |
| `POST` | `/trips/:tripId/loops/:loopRunId/apply-in-trip` | 应用 Environment Radar 方案 |

**前置条件**：`IN_TRIP_EXECUTION_ENABLED=true` 且 `Trip.status=TRAVELING`。

### 支持的触发源（Phase 3 首批 3 类）

| 触发 | 来源 |
|------|------|
| 天气不可执行 | Environment Radar `type=weather` |
| 道路封闭 / 交通延误 | Environment Radar `type=traffic` |
| 用户晚出发 | `delayMinutes ≥ 15`（execution-advisory） |

Environment Radar 创建事件后自动调用 `LoopTriggerBridge.notifyEnvironmentDetected`（internal pipeline）。

### 行中 UI 三层结构（`ui` 字段）

```json
{
  "headline": "今天的计划出现变化",
  "layers": {
    "happened": "道路 1 号公路部分路段预计延误 55 分钟",
    "impact": "迟到概率 68% → 推荐方案可降至约 14%",
    "action": "跳过午餐停留点，改为沿途简餐"
  },
  "primaryAction": { "label": "采用调整", "loopRunId": "loop_...", "planCount": 1 }
}
```

### 环境变量

```bash
IN_TRIP_LOOP_AUTO_TRIGGER_ENABLED=true
IN_TRIP_EXECUTION_ENABLED=true
```

### 联调

```bash
curl -X POST http://localhost:3000/api/trips/{tripId}/loops/in-trip-recovery \
  -H "Content-Type: application/json" -d '{"environmentEventId":"env-uuid"}'

curl -X POST http://localhost:3000/api/trips/{tripId}/loops/{loopRunId}/apply-in-trip \
  -H "Content-Type: application/json" \
  -d '{"plans":[{"environmentEventId":"env-uuid","planId":"plan-uuid"}]}'
```

---

## Phase 4 — Decision Learning Loop（Product Improvement）

将已完成的 **Trip Runtime Loop**（Readiness Repair / In-Trip Recovery）物化为 **Eval Case**，写入 `src/trips/decision/evaluation/e2e-cases/generated/loops/`，供离线 replay 与人工审批。

### 架构

- **Runtime Loop 完成** → `LoopLearningBridge`（`DECISION_LEARNING_LOOP_ENABLED=true` 时）自动物化单条 case
- **Decision Learning Loop** → 批量扫描 `LoopRun`，分类为 `GOLDEN` / `FAILURE` / `REGRESSION` / `EDGE`
- **六元组**：Context → Options → Decision → Reason → Outcome → Counterfactual
- **Replay**：重新运行对应 loop，对比 `replayExpectations`（不自动写库）

### 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/trips/:tripId/loops/decision-learning/run` | 物化 eval cases（可选抽样 replay） |
| `GET` | `/trips/:tripId/loops/decision-learning/cases` | 列出本行程已物化 cases |
| `POST` | `/trips/:tripId/loops/decision-learning/replay/:caseId` | 回放单个 case |

### POST decision-learning/run

```json
{
  "loopRunId": "loop_optional_single_run",
  "limit": 20,
  "runReplay": false,
  "skipExisting": true
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "loopRunId": "loop_learning_1710000000000",
    "status": "COMPLETED",
    "materialized": [
      {
        "id": "loop-eval-readiness_repair-abc12345-regression",
        "kind": "REGRESSION",
        "loopType": "READINESS_REPAIR",
        "sixTuple": {
          "context": { "tripId": "...", "before": { "readinessScore": 62 } },
          "options": [{ "id": "opt-a", "title": "调整时间", "validationPassed": true }],
          "decision": { "chosenOptionId": "opt-a", "requiresApproval": true },
          "counterfactual": { "rejectedOptionId": "opt-b", "note": "..." }
        },
        "replayExpectations": { "expectedStatus": "WAITING_FOR_HUMAN", "mustImproveBlockers": true }
      }
    ],
    "skipped": [{ "loopRunId": "loop_xyz", "reason": "already_materialized" }]
  }
}
```

### Case 分类规则

| Kind | 条件 |
|------|------|
| `GOLDEN` | `COMPLETED` + `success_criteria_met` / `on_track` |
| `FAILURE` | `FAILED` / `no_progress_detected` / readiness 下降 |
| `REGRESSION` | `WAITING_FOR_HUMAN` + 多轮迭代 / guardian 延迟 |
| `EDGE` | 单轮边界场景 |

### 环境变量

```bash
DECISION_LEARNING_LOOP_ENABLED=true   # Runtime loop 完成时自动物化
```

### 联调

```bash
curl -X POST http://localhost:3000/api/trips/{tripId}/loops/decision-learning/run \
  -H "Content-Type: application/json" \
  -d '{"limit":10,"runReplay":true}'

curl http://localhost:3000/api/trips/{tripId}/loops/decision-learning/cases

curl -X POST http://localhost:3000/api/trips/{tripId}/loops/decision-learning/replay/loop-eval-readiness_repair-abc12345-regression
```

---

## Phase 5 — Eval 人工审批 + Trip 完成批量 Learning

Product Improvement Loop 的治理层：Eval Case 需人工批准后才能进入 approved corpus；行程 `COMPLETED` 时自动 sweep 物化全部 LoopRun。

### 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/trips/:tripId/loops/decision-learning/cases?approvalStatus=PENDING` | 按审批状态过滤 |
| `POST` | `/trips/:tripId/loops/decision-learning/cases/:caseId/approve` | 批准（GOLDEN 晋升 `approved/`） |
| `POST` | `/trips/:tripId/loops/decision-learning/cases/:caseId/reject` | 拒绝（禁止 replay） |

### 审批流

```
物化 case (approval=PENDING)
    ↓  人工 review
approve → GOLDEN 写入 generated/loops/approved/ + approved-index.json
reject  → replay 被阻断
```

### Trip 完成 Sweep

监听 `TRIP_STATE_CHANGED → COMPLETED`（独立于 readiness auto-trigger）：

```bash
DECISION_LEARNING_LOOP_ENABLED=true
LOOP_TRIP_COMPLETED_LEARNING_ENABLED=true
LOOP_TRIP_COMPLETED_LEARNING_LIMIT=50   # 默认 50
```

### 联调

```bash
curl "http://localhost:3000/api/trips/{tripId}/loops/decision-learning/cases?approvalStatus=PENDING"

curl -X POST http://localhost:3000/api/trips/{tripId}/loops/decision-learning/cases/{caseId}/approve \
  -H "Content-Type: application/json" -d '{"note":"good golden path"}'
```
