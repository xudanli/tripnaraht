# Trip Constraint Solver — 双阶段读模型 API

> **Swagger Tag**: `trip-constraint-solver`  
> **Global prefix**: `/api`  
> **响应**: `{ success, data, error }`

## 行前 — Plan Validation

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/trips/:tripId/feasibility-report` | 整趟可执行性报告 `TripFeasibilityReportDto` |
| `POST` | `/trips/:tripId/feasibility-report/validate` | 重验证并写入 `metadata.feasibilityReportSnapshot`（内聚 refresh-evidence，C 端勿再调 `/readiness/refresh-evidence`） |
| `POST` | `/trips/:tripId/feasibility-report/validate-scope` | 局部验证（day / issue / route） |
| `GET` | `/trips/:tripId/feasibility-report/issues/:issueId/repair-options` | 修复选项（C 端首选；含 guardian + cascade） |
| `POST` | `/trips/:tripId/feasibility-report/issues/:issueId/preview-repair` | 修复预览 diff（Plan B 类走决策引擎 dry-run） |
| `POST` | `/trips/:tripId/feasibility-report/issues/:issueId/apply-repair` | 应用修复 |

### GET feasibility-report 响应要点

| 字段 | 说明 |
|------|------|
| `canStartExecute` | 已验证 + 未过期 + verdict=EXECUTABLE + 无 must_handle |
| `verdict.subheadline` | 基于 **去重后** summary：`N 项必处理、M 项建议调整、K 项待确认` |
| `phaseHint?` | 行前阶段提示（与 `/score` 同源） |
| `coverageDisclosure?` | 覆盖能力披露 |
| `currentTripVersion` / `isStale` | 与 `GET /trips/:id`.revision 对齐 |
| `probabilisticAssessment?` | **POMDP + Monte Carlo** 概率可执行性（`validate` 计算并缓存于 `metadata.feasibilityMonteCarloSnapshot`） |

### probabilisticAssessment 字段（AI-Native）

| 字段 | 说明 |
|------|------|
| `method` | `MONTE_CARLO` / `UNAVAILABLE` |
| `feasibilityProbability` | P(硬约束全部满足)，0–1 |
| `expectedUtility` | 期望效用 E[U] |
| `confidenceInterval` | 效用置信区间 |
| `riskMetrics` | 下行风险、最坏/最好情况、波动率 |
| `dimensionExpectations` | 安全/疲劳/天气等维度期望 |
| `pomdp.beliefRefinement` | `POMDP` 表示已用准备度观测做信念更新 |
| `pomdp.observationProvenance` | 观测来源说明（如 schedule/transport → windSpeed 间接代理） |
| `pomdp.independenceTier` | `INDIRECT_PROXY` / `DIRECT` / `NONE` |
| `pomdp.worldSource` | `world.buildContext` 或降级 `dso_stub` |
| `audit` | validate 审计切片：`session_consistency_score`、`dominant_cid`、`drift_vector`（MC↔确定性对齐，**不覆盖** `must_handle`） |
| `monteCarloDiagnostics` | 采样数、收敛、耗时 |
| `narrative` | 面向用户的概率叙述（含「不覆盖 must_handle 门控」声明） |

**治理原则**：`probabilisticAssessment` 为辅助层；`verdict.status` / `canStartExecute` / `issues[].priority=must_handle` 仍由确定性 readiness + conflicts 决定。

**审计**：`validate` 成功时额外打出 `event=decision_os_audit_report`（phase=`FEASIBILITY_MC_VALIDATE`），并缓存于 `probabilisticAssessment.audit.decisionOsAudit`。

**回放验收**（与 `replay-cgus-suite` 并轨）：

```bash
npm run cgus:replay:bridge
# 或附带标准 CGUS suite：CGUS_SUITE_INCLUDE_BRIDGE=1 npm run cgus:replay
npm run test:bridge-kernel-replay
```

物理冲突对齐固件要求 `session_consistency_score >= 95`（`BRIDGE_REPLAY_MIN_SESSION_SCORE` 可覆盖）。

## Loop Engineering — Readiness Repair（Phase 1）

> 详见 [`src/loops/LOOP_API.md`](../loops/LOOP_API.md)

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/trips/:tripId/loops/readiness-repair` | 运行 Readiness Repair Loop（Blocker → Preview → Validate → 推荐 Patch） |
| `GET` | `/trips/:tripId/loops/:loopRunId` | 查询 LoopRun + iterations |
| `POST` | `/trips/:tripId/loops/readiness-repair/trigger` | 事件驱动触发（幂等去重） |
| `GET` | `/trips/:tripId/loops/readiness-repair/latest` | 最近一次 Loop UI 视图 |

Loop 为薄编排层，内部委托本模块 `feasibility-report` 链；Verifier 裁决退出条件，写库须经 `apply` 端点。Phase 2 写入 Travel Event Store `LOOP_*` 事件。

**Loop 环境变量**：

```bash
LOOP_AUTO_TRIGGER_ENABLED=true
LOOP_TRIGGER_COOLDOWN_MS=300000
IN_TRIP_LOOP_AUTO_TRIGGER_ENABLED=true
IN_TRIP_EXECUTION_ENABLED=true
TRAVEL_EVENT_STORE_ENABLED=true
```

### 行中 — IN_TRIP_RECOVERY Loop

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/trips/:tripId/loops/in-trip-recovery` | 行中局部恢复 Loop |
| `GET` | `/trips/:tripId/loops/in-trip-recovery/latest` | 行中 UI 视图 |
| `POST` | `/trips/:tripId/loops/:loopRunId/apply-in-trip` | 应用 Environment Radar 方案 |

详见 [`src/loops/LOOP_API.md`](../loops/LOOP_API.md) Phase 3。

### Decision Learning（Phase 4）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/trips/:tripId/loops/decision-learning/run` | 从 LoopRun 物化 Eval Case |
| `GET` | `/trips/:tripId/loops/decision-learning/cases` | 列出已物化 cases |
| `POST` | `/trips/:tripId/loops/decision-learning/replay/:caseId` | 离线 replay |

### Eval 审批（Phase 5）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/trips/:tripId/loops/decision-learning/cases/:caseId/approve` | 批准 eval case |
| `POST` | `/trips/:tripId/loops/decision-learning/cases/:caseId/reject` | 拒绝 eval case |

Trip `COMPLETED` 时自动 batch learning：`LOOP_TRIP_COMPLETED_LEARNING_ENABLED=true`。

详见 [`src/loops/LOOP_API.md`](../loops/LOOP_API.md) Phase 4–5。开启 `DECISION_LEARNING_LOOP_ENABLED=true` 时，Runtime Loop 完成会自动物化 case。

**迁移**（Loop 表）：

```bash
psql "$DATABASE_URL" -f prisma/migrations/add_loop_engineering_phase1.sql
```


```bash
FEASIBILITY_MONTE_CARLO=1          # 0 关闭
FEASIBILITY_MONTE_CARLO_SAMPLES=200  # 50–500
```

**validate 请求体**（可选）：

```json
{
  "forceRefreshEvidence": true,
  "runMonteCarlo": true,
  "monteCarloSampleSize": 200
}
```

### must_handle 判定表（产品 × 研发）

**原则**：`must_handle` = 硬阻塞（不修复则方案不成立）；`severity` 仅作展示，**不单独**升格。

#### Readiness findings → `issues[].priority`

| 上游 `type` | 典型场景 | priority |
|-------------|----------|----------|
| `blocker` | 覆盖缺口 high、POI uncovered、树形 blockers | **must_handle** |
| `must` / `warning` | 单日过满、长途偏长、medium 缺口 | suggest_adjust |
| `should` / `suggestion` | 低优先级建议 | pending_confirm |

> 勿再用 `severity === 'high'` 单独升格（已在 assembler 移除）。

#### Conflicts → `issues[].priority`

| 条件 | priority |
|------|----------|
| `priority` 字段显式指定 | 沿用 |
| `severity === HIGH` | **must_handle** |
| `CLOSURE_RISK` / `TRANSPORT_INSUFFICIENT` | **must_handle** |
| 交通衔接 `isStartTooEarly`（到站过早） | **must_handle** |
| 交通缓冲偏紧（能到但紧） | suggest_adjust |
| 时刻缺失 `missing_times` | pending_confirm |
| `severity === MEDIUM` | suggest_adjust |

#### Verdict 门控

| summary | verdict | canStartExecute（已 validate 且非 stale） |
|---------|---------|------------------------------------------|
| `mustHandle > 0` | NOT_EXECUTABLE | false |
| 仅 suggest / pending | ADJUST_REQUIRED | false |
| 全 0 | EXECUTABLE | true |

#### P1 证据分级（已实现）

| 证据缺口 | 上游 type / severity | priority |
|----------|----------------------|----------|
| 核心 POI + `booking_confirmation` 缺失 | gap severity **high** → `blocker` | must_handle |
| 仅 `weather` 缺失 | gap severity **medium** → `must` | suggest_adjust |
| 路段 `road_closure` + high hazard | `blocker` | must_handle |
| 过满/长途 heuristic | `must`（不因 severity 升格） | suggest_adjust |

### ID 映射（OpenAPI）

- **issueId**（feasibility 路径 / `report.issues[].id`）↔ **blockerId**（readiness 内部）
- 映射函数：`normalizeIssueId` / `resolveIssueIdToBlockerId`
- C 端统一使用 **issueId**；legacy `POST /readiness/repair-options` 使用 blockerId（已 deprecated）

### preview-repair 响应要点（§3.5）

- `previewMode`: `heuristic` | `decision_engine_dry_run`
- `status`: `preview` | `would_defer`（三人格低共识时与 apply 同门控）
- `itineraryDiff`: 结构化行程变更（`time_changed` / `removed` / `added` / `moved_day` 等）
- `impact.estimated`: 分数仍为估算；真实重算见 `validate-scope`
- `wouldDefer` + `guardianNegotiation`: 预览阶段不写库，但展示 apply 是否会 deferred

**请求体**：

```json
{
  "optionId": "option-1",
  "runGuardianNegotiation": true,
  "forceDecisionRepair": false
}
```

### apply-repair 请求体

```json
{
  "optionId": "option-1",
  "executeDecision": true,
  "persistDecision": true,
  "runGuardianNegotiation": true,
  "forceDecisionRepair": false
}
```

响应统一为 `ApplyRepairResponse`（`applied | deferred | redirect` + `guardianNegotiation`）。

### repair-options 响应要点

```typescript
{
  issueId: string;       // 路径参数回显
  blockerId: string;     // readiness 语义
  options: RepairOption[];
  guardianNegotiation?: RepairOptionsGuardianNegotiationView;
  cascadeUiHints?: ReadinessCascadeUiHint[];
  causalPreAnalysis?: NonTransactionalReplanResult;
}
```

#### `road_class`（≥300km 超长路段）

Issue 元数据（`report.issues[]`）：

| 字段 | 值 |
|------|-----|
| `issueKind` | `road_class` |
| `uiHints.primaryAction` | `open_repair` |
| `anchors.segmentId` | 如 `seg-1` |
| `anchors.distanceKm` | 路段距离 |
| `id` | `issue-transport-seg-{n}-long_distance` |

`GET .../repair-options` 返回 **结构性 Plan B**（无 `adjust_time`）：

> **回退合成**：即使 readiness findings 中无对应 blocker（如被 mark 过滤），只要 `coverage.segments` 存在 `seg-{n}` 且含 `long_distance` hazard，仍从 coverage 合成 4 条 options。`issue-transport-seg-8-long_distance` → 解析 `seg-8`。

| optionId | actionType | 说明 |
|----------|------------|------|
| `insert_midpoint_stay` | `change_hotel` | 中途住宿拆段 |
| `move_destination_day` | `move_to_day` | 目的地挪到次日 |
| `alternative_route` | `find_alternative_route` | 换近路线 |
| `reorder_split` | `reorder_pois` | 调整相邻日安排 |

样例（蓝湖 → 塞济斯菲厄泽 620km）：

```json
{
  "success": true,
  "data": {
    "issueId": "issue-transport-seg-1-long_distance",
    "blockerId": "transport-seg-1-long_distance",
    "blockerMessage": "第1天 · 蓝湖 → 塞济斯菲厄泽 · 超长距离行驶(>300km)，强烈建议分段或中途住宿",
    "options": [
      {
        "id": "insert_midpoint_stay",
        "title": "中途住宿拆段",
        "actionType": "change_hotel",
        "impact": "high",
        "payload": {
          "strategy": "midpoint_overnight",
          "segmentId": "seg-1",
          "fromItemId": "item-blue-lagoon",
          "toItemId": "item-seyðisfjörður",
          "validateScope": { "type": "route", "segmentId": "seg-1" }
        },
        "metadata": { "issueKind": "road_class", "primaryAction": "open_repair" }
      },
      {
        "id": "move_destination_day",
        "title": "目的地挪到次日",
        "actionType": "move_to_day",
        "payload": {
          "suggestedValue": { "dayNumber": 2 },
          "itemId": "item-seyðisfjörður",
          "segmentId": "seg-1"
        }
      }
    ],
    "cascadeUiHints": [
      {
        "id": "issue-transport-seg-1-long_distance:road-class",
        "riskLevel": "HIGH",
        "recommendation": "建议中途住宿或拆成两日驾驶，避免单次超长路段"
      }
    ]
  }
}
```

`preview-repair` / `apply-repair`：road_class 结构性方案走 **payload 本地模拟**（`applyStructuralRepairToPlan`），不依赖 Neptune DAG；其他 action 仍走决策引擎 dry-run。

`move_to_day` 等跨天变更：`trip-plan-persistence` 对仍在 plan 中的 item 只做 `update(tripDayId)`，不会先删后改（避免 `No record was found for an update`）。

### validate-scope 行为

| scope | 重算逻辑 |
|-------|----------|
| `day` | 按日重跑 `getConflicts(tripId, date)` + 过滤 readiness findings |
| `issue` | 过滤 readiness / issues 至单 issue |
| `route` | 按 segment 所在日重跑 `getConflicts` + 过滤 readiness findings |

响应为局部 `TripFeasibilityReportDto`（含 scoped verdict / overallScore / canStartExecute）。

### validate-scope 请求体

```json
{ "scope": { "type": "day", "dayNumber": 3 } }
{ "scope": { "type": "issue", "issueId": "issue-gap-1" } }
{ "scope": { "type": "route", "segmentId": "seg-day3-drive" } }
```

### 聚合来源

- `CoverageMapService.getReadinessScore` → dimensions / issues / phaseHint / coverageDisclosure
- `TripConflictsService.getConflicts` → schedule/transport issues + L3-PROOF
- `metadata.feasibilityReportSnapshot` → `verifiedAt` / `verifiedForTripVersion` / `isStale`

### 版本字段

`GET /trips/:id` 响应含 `revision`、`revisionLabel`（权威来源：`metadata.revision`，写回行程时 bump）。

## 行中 — Runtime Assurance

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/trips/:tripId/in-trip/execution-advisory` | `TripExecutionAdvisoryDto` |

要求：`IN_TRIP_EXECUTION_ENABLED=true` 且 `status=TRAVELING`。

## C 端弃用接口

| 弃用 | 替代 |
|------|------|
| `GET /readiness/trip/:tripId/score` | `GET …/feasibility-report` |
| `POST /readiness/repair-options` | `GET …/issues/:issueId/repair-options` |
| `POST /readiness/auto-repair` | `POST …/apply-repair` |
| `POST /readiness/refresh-evidence` | `POST …/validate` |

## 错误码

| code | 场景 |
|------|------|
| `EXECUTION_ADVISORY_NOT_IN_TRIP` | 非 TRAVELING |
| `EXECUTION_ADVISORY_DISABLED` | 行中模块未启用 |

## 联调示例

```bash
curl http://localhost:3000/api/trips/{tripId}/feasibility-report
curl -X POST http://localhost:3000/api/trips/{tripId}/feasibility-report/validate \
  -H "Content-Type: application/json" -d '{"forceRefreshEvidence":true}'
curl http://localhost:3000/api/trips/{tripId}/feasibility-report/issues/{issueId}/repair-options
```
