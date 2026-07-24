# Decision Semantics — 前端接口文档（V1.5 + V1.6）

统一响应壳：

```typescript
interface StandardResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}
```

Trip 域接口前缀：`/api/trips/:tripId/`  
Swagger tag：`decision-semantics`

Memory Console：`/api/agent/memory/v1/console?trip_id=`  
Agent 调试：`route_and_run` 响应 `observability.*`（无独立 REST）

---

## 1. 推荐交互流程

**Decision Center L1（总览）**

```
GET  decision-center/overview
  → GET decision-problems（L2 列表）
```

**单问题决策链（L2 → L4）**

```
GET  decision-problems
  → GET decision-problems/:id          // 保存 causalTraceRef + 展示 causalStoryView
  → GET decision-problems/:id/options
  → POST decision-problems/:id/options/:optionId/preview   // 校验 traceId 一致
  → POST decision-problems/:id/resolutions                 // body 携带 causalTraceRef
  → POST decision-problems/:id/apply                       // stale → CAUSAL_TRACE_STALE
  → GET decision-problems/:id/causal-trace                 // 可选：技术回放 + 叙事投影
```

**Legacy 决策链（V1.5，无 causal trace）**

```
GET  decision-problems/:id
  → GET decision-problems/:id/options
  → POST decision-problems/:id/options/:optionId/preview
  → POST decisions
  → GET decisions/:decisionId/execution-status   // 轮询执行态
  → GET decisions/:decisionId
  → GET decisions/:decisionId/validation
```

Gate-only / 无 feasibility repair 时：`options` 仍返回 `RULE_ENGINE` 确定性方案；若存在可桥接的 feasibility repair，则 `executionCapability: DIRECT`（见 §3.4）。

Ledger 节点反查用户决策：

```
GET decision-ledger/nodes/:ledgerNodeId/decision
```

或与 Memory Console / `observability.memory_contract.decision_ledger_causality` 本地查表（见 §8）。

**类型包（推荐）**

```typescript
import {
  DecisionCenterOverview,
  DecisionOption,
  ExecutionCapability,
  EXECUTION_CAPABILITY_LABELS,
  CONSTRAINT_ENFORCEMENT_LABELS,
  DecisionExecutionStatusResponse,
} from '@/generated/decision-semantics-contracts';
// 或 alias: '@/generated/decision-semantics-api'
```

生成/校验：`npm run contracts:decision-semantics`

---

## 1.1 Decision Center L1 总览（V1.0 P1）

`GET /api/trips/:tripId/decision-center/overview`

**Response `data`：** `DecisionCenterOverview`

| 字段 | 说明 |
|------|------|
| `headline` | 聚合文案，如「有必须处理的旅行阻塞（2 项）」 |
| `problemCounts.open` | 未 `RESOLVED` / `DISMISSED` 的问题数 |
| `problemCounts.byEnforcement` | 按 `primaryEnforcement` 统计 |
| `feasibility.canStartExecute` | 是否可开始行中 |
| `feasibility.mustHandleCount` | feasibility must_handle 数 |
| `actionableProblemCount` | 含 `executionCapability === 'DIRECT'` 方案的问题数 |
| `affectedDayNumbers` / `affectedMemberIds` | 影响范围 |
| `recentDecisions` | 最近 5 条决策快照（见下） |

**`recentDecisions[]` 每项（DC-FE-007）**

| 字段 | 说明 |
|------|------|
| `decisionId` | 决策 ID |
| `executionStatus` | 用户可见执行态（与 `GET …/execution-status` 同源） |
| `recordStatus` | `DecisionRecord.status`（`EXECUTED` / `PARTIALLY_APPLIED` / …） |
| `needsRepair` | 半成功时为 `true`；L1 待处理条带用 `isDecisionPendingAttention(executionStatus)` |
| `status` | **兼容字段**，等于 `executionStatus` |

L1 页**只调此接口 + `decision-problems`**，不要拼 feasibility / constraints / Gate 原始接口。

---

## 2. 决策问题（Decision Problem）

### 2.1 列表

`GET /api/trips/:tripId/decision-problems`

**Response `data`**

```typescript
{
  meta: {
    tripId: string;
    tripVersion: string;
    total: number;
    byType: Partial<Record<DecisionProblemType, number>>;
    byStatus: Partial<Record<DecisionProblemStatus, number>>;
    generatedAt: string;
  };
  items: DecisionProblemSummary[];
}
```

**`DecisionProblemSummary`**

| 字段 | 说明 |
|------|------|
| `id` | 问题 ID |
| `type` | `INFEASIBILITY` \| `RISK` \| `PREFERENCE_CONFLICT` \| … |
| `title` | 标题 |
| `status` | `OPEN` \| `ASSESSING` \| `WAITING_DECISION` \| **`RESOLVED`** \| `DISMISSED` |
| `detectedBy` | **`FEASIBILITY`** \| **`GATE`** \| **`TRIP_CONSTRAINT`**（V1.6 新增）\| … |
| `primaryEnforcement` | `BLOCK` \| `REQUIRE_ADJUSTMENT` \| `REQUIRE_CONFIRMATION` \| `WARN` \| `INFORM` |
| `affectedDayNumbers` | 受影响天数 |
| `resolvedByDecisionId` | **V1.0** 决策执行后回写；`status === 'RESOLVED'` 时有值 |
| `resolvedAt` | 标记解决时间（ISO） |
| `resolutionKind` | `DECISION_EXECUTED` \| `VALIDATION_CONFIRMED` |

列表卡片请用 **`primaryEnforcement`** 决定样式，不要用原始 `HARD/SOFT`。  
**`status === 'RESOLVED'`** 的问题仍可能出现在列表中（Gate 未重算时）；卡片应收起或移入「已处理」分组。

### 2.2 详情

`GET /api/trips/:tripId/decision-problems/:problemId`

**Response `data`：** `DecisionProblemDetail`

```typescript
interface DecisionProblemDetail extends DecisionProblem {
  assertions: ConstraintAssertion[];
}

interface DecisionProblem {
  id: string;
  tripId: string;
  type: DecisionProblemType;
  title: string;
  description: string;
  detectedBy: DecisionProblemDetectedBy;
  detectedAt: string;
  tripVersion: string;
  affectedScope: AffectedScope[];
  status: DecisionProblemStatus;
  semanticKey?: string;
  sourceRefs: DecisionSourceRef[];  // system: FEASIBILITY | GATE | TRIP_CONSTRAINT | …
  assertionIds: string[];
  authority?: DecisionAuthority;
  /** V1.0 — 决策/验证回写 */
  resolvedAt?: string;
  resolvedByDecisionId?: string;
  resolutionKind?: 'DECISION_EXECUTED' | 'VALIDATION_CONFIRMED';
}
```

**与约束控制台对齐**

- `detectedBy === 'TRIP_CONSTRAINT'` 时：`sourceRefs` 中 `system === 'TRIP_CONSTRAINT'` 的 `refId` = **`TripConstraint.id`**（如 `c_max_daily_drive`），可高亮约束卡片。
- 与 `planning-conflicts.relatedConstraintIds` 语义一致。

### 2.3 Canonical Causal Trace v1（Gateway 统一读模型）

当 Gateway 为问题生成 canonical trace 时，以下字段出现在 **详情 / 预览 / 列表 / overview** 响应中。客户端应保存 `causalTraceRef`，并在 submit → apply 链路中回传；服务端在 apply 时校验 `worldStateVersion`，过期返回 `CAUSAL_TRACE_STALE`。

**共享类型**

```typescript
interface CausalTraceReference {
  traceId: string;
  worldStateVersion: string;
  protocolVersion: 'causal-trace-v1';
}

interface CausalStoryView {
  traceId: string;
  worldStateVersion: string;
  headline: string;
  assessment: string;
  chain: Array<{
    nodeId: string;
    type: string;
    title: string;
    description: string;
    sourceRefs?: string[];
  }>;
  recommendedOption?: {
    optionId: string;
    summary: string;
    expectedImprovement?: string;
    tradeoff?: string;
  };
  technicalTraceRef: string;
}
```

**详情 `GET …/decision-problems/:problemId` 附加字段**

| 字段 | 说明 |
|------|------|
| `causalTraceRef` | 当前活跃 trace 身份 |
| `causalStoryView` | 中性叙事投影（因果链 headline + chain） |
| `guardianCausalStoryView` | Abu 安全视角，同一 trace |

**列表项 `items[]` 附加字段（旅行类问题）**

| 字段 | 说明 |
|------|------|
| `causalStoryView.headline` | 列表卡片副标题 enrich |
| `guardianCausalStoryView.headline` | 安全角标文案 |

**Overview `GET …/decision-center/overview` 附加字段**

| 字段 | 说明 |
|------|------|
| `guardianHeadline` | 来自首个开放旅行问题的 Abu 投影 |
| `guardianAssessment` | 同上，完整 assessment |

**预览 `POST …/options/:optionId/preview` 附加字段**

| 字段 | 说明 |
|------|------|
| `causalTraceRef` | 应与详情一致；preview 会 bind 选中 option |
| `causalStoryView` / `guardianCausalStoryView` | 含 recommendedOption |

**提交 `POST …/resolutions` Body**

```typescript
{
  selectedActionId: string;
  causalTraceRef?: CausalTraceReference;  // 推荐必传
  // …
}
```

**Apply stale 错误**

| `error.code` | 含义 |
|--------------|------|
| `CAUSAL_TRACE_STALE` | `worldStateVersion` 已变；需重读 problem + preview 后再 apply |

**技术回放 `GET …/decision-problems/:problemId/causal-trace`**

```typescript
interface CausalTraceReplayView {
  schemaId: 'tripnara.causal_trace_replay@v1';
  tripId: string;
  problemId: string;
  generatedAt: string;
  ref: CausalTraceReference;
  trace: CanonicalCausalTraceV1;  // 完整事实/效应/问题/选项链
  causalStoryView: CausalStoryView;
  guardianCausalStoryView: CausalStoryView;
}
```

类型 SSOT：`@/generated/unified-decision-contracts` → `CausalTraceReference` · `CausalStoryView` · `CausalTraceReplayView`。

**注意：** `planning-decision-causal-chain` BFF 为 Legacy Projection；当 Gateway 已返回 `causalStoryView` 时，前端应优先消费 Gateway 字段，勿再自行拼装 `world_context`。

---

## 3. 决策选项与预览

### 3.1 选项列表

`GET /api/trips/:tripId/decision-problems/:problemId/options`

```typescript
{
  problemId: string;
  tripId: string;
  options: DecisionOption[];
  generatedAt: string;
}
```

**`DecisionOption`（摘要）**

| 字段 | 说明 |
|------|------|
| `id` | 选项 ID；Gate 规则项为固定 id（如 `gate_reach_alt_route`） |
| `type` | `REPAIR` \| `ALTERNATIVE` \| `PLAN_B` \| `ACCEPT_RISK` \| … |
| `source` | `CONSTRAINT_REPAIR` \| **`RULE_ENGINE`**（Gate 确定性方案）\| … |
| `tradeoffs` | `TradeoffDimension[]` |
| `executable` | 是否可执行 |
| `requiresConfirmation` | 是否需要用户确认 |
| `authority` | 决策权限快照 |
| **`repairCommand`** | **V1.0 P1** 结构化修复意图（`commandType` / `targetRefs` / `parameters`） |
| **`executionCapability`** | **V1.0 P1** `DIRECT` \| `PARTIAL` \| `GUIDED_MANUAL` \| `ADVISORY_ONLY` |

**按钮文案（`EXECUTION_CAPABILITY_LABELS`）**

| 值 | 建议按钮 |
|----|----------|
| `DIRECT` | 确认并应用 |
| `PARTIAL` | 确认并尝试应用 |
| `GUIDED_MANUAL` | 查看操作指引 |
| `ADVISORY_ONLY` | 已知悉 |

### 3.2 Gate-only 确定性选项（V1.6 P1 + V1.0 桥接）

无 feasibility issue 且 `detectedBy === 'GATE'`（或 `semanticKey` 以 `gate:` 开头）时，`options` 返回规则引擎方案，**不再只有**「确认并继续评估」。

| Gate 类型 | `option.id` 示例 | 含义 |
|-----------|------------------|------|
| REACHABILITY | `gate_reach_alt_route` / `gate_reach_split_leg` / `gate_reach_change_mode` | 换路线 / 拆段 / 换交通 |
| SAFETY | `gate_safety_shift_date` / `gate_safety_alt_activity` / `gate_safety_cancel` | 改期 / 替代 / 取消 |
| DATA_MISSING | `gate_data_attach_evidence` / `gate_data_revalidate` / `gate_data_downgrade_unconfirmed` | 补证据 / 重验 / 降级 |
| DEM | `gate_dem_alt_route` / `gate_dem_vehicle_adjust` / `gate_dem_cancel_segment` | 换路线 / 车型 / 取消路段 |

这些选项 **`source: 'RULE_ENGINE'`**。

**V1.0 执行桥接：** 若 Trip 上存在可匹配的 feasibility repair（同 affected days / 路线类 issue），Gate 选项可 **`executionCapability: 'DIRECT'`**，`POST decisions` 会桥接到 `feasibility.applyRepair` 或 `validate()`（如 `gate_data_revalidate`）。无匹配时仍为 `GUIDED_MANUAL`，状态多为 `APPROVED` 而非 `EXECUTED`。

### 3.3 预览

`POST /api/trips/:tripId/decision-problems/:problemId/options/:optionId/preview`

```typescript
{
  problemId: string;
  optionId: string;
  tripId: string;
  predictedImpact?: SemanticImpactDeclaration;
  tradeoffs: TradeoffDimension[];
  proposedMutations: TripMutationSet;
  authority: DecisionAuthority;
  repairCommand?: RepairCommand;
  executionCapability?: ExecutionCapability;
  repairPreview?: Record<string, unknown>;  // feasibility preview 透传
  generatedAt: string;
}
```

---

## 4. 记录决策

`POST /api/trips/:tripId/decisions`

**Body**

```typescript
{
  problemId: string;
  selectedOptionId: string;
  reason?: string;
  acknowledgement?: string[];   // 硬约束 / 需确认时必填
  rejectedOptionIds?: string[];
  idempotencyKey?: string;        // 幂等键；重复 POST 返回 IDEMPOTENT_REPLAY
  execute?: boolean;              // 默认 true：批准后调用 feasibility.applyRepair
}
```

**Response `data`**

```typescript
{
  decision: DecisionRecord;
  tripVersionAfter?: string;
  appliedMutations?: TripMutationSet;
  executionStatus?: DecisionExecutionStatus;  // V1.0 P1
  problemResolution?: {                       // V1.0 — EXECUTED 后回写
    problemId: string;
    status: 'RESOLVED';
    semanticKey: string;
    resolvedAt: string;
    resolvedByDecisionId: string;
    resolution: 'DECISION_EXECUTED' | 'VALIDATION_CONFIRMED';
  };
  idempotentReplay?: boolean;  // 首次 apply: false；幂等重放: true（勿用 null 判断，缺省视为 undefined=未走重放）
  effectiveDecisionId?: string;
  /** applyRepair 后 route/feasibility 重算一致性（Release Gate STATE-BLOCKER-PARTIAL-001） */
  postApplyCoherence?: DecisionPostApplyCoherenceV1;
  /** 半成功态：前端不得展示「已完成」，需引导继续修复 */
  needsRepair?: boolean;
  /** 证据过期时阻断 auto-repair（Release Gate POLICY-BLOCKER-STALE-001） */
  evidenceFreshnessBlock?: DecisionEvidenceFreshnessVerdict;
  applyResult?: {
    status: string;
    message: string;
    actionType?: string;
    persisted?: boolean;
    blockerId?: string;
  };
}
```

**`DecisionRecord` 新增 / 重要字段（V1.6）**

```typescript
interface DecisionRecord {
  id: string;                    // dec_{timestamp}_{random}
  tripId: string;
  problemId: string;
  selectedOptionId: string;
  status: 'PROPOSED' | 'APPROVED' | 'EXECUTED' | …;
  validationStatus: 'PENDING' | 'CONFIRMED' | 'REFUTED' | …;
  tripVersionBefore: string;
  tripVersionAfter?: string;
  decidedAt: string;
  actualMutation?: TripMutationSet;

  // V1.6 P0 — Agent Decision Ledger 关联
  ledgerRefs?: {
    sourceNodeIds: string[];
    invalidatedNodeIds?: string[];
    recomputedNodeIds?: string[];
    ledgerRunId?: string;              // lr_{decisionId}
    ledgerSnapshotVersion?: number;
    causedByAnnotatedNodeIds?: string[]; // V1.6.1 已写入 caused_by 的节点
  };

  expectedOutcomes?: ExpectedOutcome[];
  validationBaseline?: DecisionValidationBaseline;
  lastOutcomeValidation?: DecisionOutcomeValidation;
  postApplyCoherence?: DecisionPostApplyCoherenceV1;
  needsRepair?: boolean;
}
```

**Release Gate 辅助类型（V1.6.2）**

```typescript
interface DecisionPostApplyCoherenceV1 {
  outcome: 'COMPLETE' | 'ROLLED_BACK' | 'PARTIALLY_APPLIED';
  phase: 'route_recalc';
  failureCode?: string;
  failureMessage?: string;
  needsRepair?: boolean;
}

interface DecisionEvidenceFreshnessVerdict {
  blocked: boolean;
  reasonCode?: 'DATA_STALE';
  staleEvidenceTypes: string[];
  message?: string;
  requiresEvidenceRefresh?: boolean;
}
```

**错误码（message 前缀）**

| message | 含义 |
|---------|------|
| `DECISION_ACKNOWLEDGEMENT_REQUIRED` | 需传 `acknowledgement` |
| `DECISION_APPLY_FAILED` | applyRepair 失败 |
| `DECISION_PROBLEM_NOT_FOUND` | 问题不存在 |
| `DECISION_RECORD_NOT_FOUND` | 决策不存在 |
| `DATA_STALE`（`applyResult.blockerId` 或 `evidenceFreshnessBlock.reasonCode`） | 修复依据证据过期，**未调用 applyRepair**；需刷新证据后重试 |

---

## 4.1 Release Gate 执行态 — 前端必处理（V1.6.2）

后端 Release Gate 已强制以下语义；前端 Decision Center **不得**把所有 `200` 响应都当作「修复成功」。

| 场景 | 识别字段 | 前端行为 |
|------|----------|----------|
| **幂等重复提交** | `executionStatus === 'IDEMPOTENT_REPLAY'` 或 `idempotentReplay === true` | 展示「已处理过」，**不要**再次刷新行程或弹成功 toast；可跳转 `effectiveDecisionId` |
| **半成功（路线未重算完）** | `needsRepair === true` 或 `postApplyCoherence.outcome === 'PARTIALLY_APPLIED'` | **禁止**展示「已完成」；展示 `postApplyCoherence.failureMessage`，提供「继续修复 / 联系支持」入口 |
| **已回滚** | `postApplyCoherence.outcome === 'ROLLED_BACK'` 或 `executionStatus === 'ROLLED_BACK'` | 展示回滚说明，行程版本应等于执行前；引导重新选方案 |
| **证据过期阻断** | `evidenceFreshnessBlock?.blocked === true` | **未修改行程**；展示 `requiresEvidenceRefresh` 引导（刷新路况/天气后再决策） |

**轮询终止态扩展：** 除 `APPLIED` / `RESOLVED` / `FAILED` / `RECORDED` 外，以下亦为**终态**，应停止 loading：

- `IDEMPOTENT_REPLAY`
- `PARTIALLY_APPLIED`
- `ROLLED_BACK`

**`needsRepair` 与 L1 总览：** `recentDecisions` 中若 `status === 'PARTIALLY_APPLIED'`，L1 banner 应计入「待处理」而非「已解决」。

**共享状态机（推荐直接 import）：**

```typescript
import {
  classifyCreateDecisionOutcome,
  classifyExecutionStatusPoll,
  shouldPollDecisionExecution,
  buildDecisionIdempotencyKey,
  isDecisionPendingAttention,
  DECISION_EXECUTION_TERMINAL_STATUSES,
} from '@/generated/decision-semantics-contracts';
```

实现：`src/trips/decision-semantics/frontend/decision-center-execution-state-machine.util.ts`  
单测：`decision-center-execution-state-machine.util.spec.ts`

**前端 MVP 联调一页说明：** `DECISION_CENTER_FE_MVP_INTEGRATION.md`

---

## 5. 读取决策

`GET /api/trips/:tripId/decisions/:decisionId`

**Response `data`：** `DecisionRecord`（同上）

---

## 5.1 决策执行状态（V1.0 P1 — 轮询）

`GET /api/trips/:tripId/decisions/:decisionId/execution-status`

**Response `data`：** `DecisionExecutionStatusResponse`

| 字段 | 说明 |
|------|------|
| `status` | `RECORDED` → `APPLYING` → `APPLIED` → `RESOLVED` / `PARTIALLY_RESOLVED` / `FAILED` / `ROLLED_BACK` / `PARTIALLY_APPLIED` / `IDEMPOTENT_REPLAY` |
| `explanation` | 用户可见说明 |
| `recordStatus` | 底层 `DecisionRecord.status`（含 `PARTIALLY_APPLIED`、`ROLLED_BACK`） |
| `validationStatus` / `validationVerdict` | 验证进度 |
| `repairCommandApplied` | 是否产生 mutation |
| `effectiveDecisionId` | 幂等 replay 审计行指向的有效决策 ID |
| `postApplyCoherence` / `needsRepair` | 同 §4 Response；半成功时 polling 也应返回 |

**轮询建议：** `POST decisions` 后每 2–3s 调一次，直到 `status` ∈ 终态集合：

`APPLIED` \| `RESOLVED` \| `FAILED` \| `RECORDED`（仅记录未执行）\| `IDEMPOTENT_REPLAY` \| `PARTIALLY_APPLIED` \| `ROLLED_BACK`

**禁止：** `PARTIALLY_APPLIED` 时展示绿色成功态；`IDEMPOTENT_REPLAY` 时重复触发行程刷新。

---

## 6. 决策结果验证

`GET /api/trips/:tripId/decisions/:decisionId/validation`

**Response `data`：** `DecisionOutcomeValidation`

```typescript
{
  id: string;                      // val_{decisionId}
  decisionId: string;
  tripId: string;
  expectedOutcomes: ExpectedOutcome[];
  observedOutcomes: ObservedOutcome[];
  experienceOutcomes?: ExperienceOutcome[];  // V1.6 P3，不参与主 verdict
  verdict: OutcomeValidationVerdict;
  evaluatedAt?: string;
  confidence?: number;
  explanation?: string;
  failureReasons?: OutcomeFailureReason[];
}
```

### 6.1 `verdict`

| 值 | UI 建议 |
|----|---------|
| `CONFIRMED` | 预测与观测一致 |
| `PARTIALLY_CONFIRMED` | 部分一致；若含 `DATA_STALE` 需提示「Ledger 已重算」 |
| `REFUTED` | 预测被 refute |
| `PENDING` | 尚未执行或证据不足 |
| `INCONCLUSIVE` | 无法判断 |

### 6.2 `failureReasons`

| 值 | 含义 |
|----|------|
| **`DATA_STALE`** | Agent Ledger 在决策后又发生重算，原预测可能过期（V1.6 P0） |
| `PREDICTION_ERROR` | 预测与观测不符 |
| `EXECUTION_DEVIATION` | 执行偏离 |
| `INSUFFICIENT_EVIDENCE` | 证据不足 |

### 6.3 `ObservedOutcome.source`（V1.6 P2 扩展）

| source | 含义 |
|--------|------|
| `SYSTEM_INFERENCE` | 可行性报告推断 |
| `POI_FEEDBACK` | POI 行中反馈 |
| **`USER_ARRIVAL_CLICK`** | 用户点「已到达」/ arrivalTime |
| **`ITINERARY_ITEM_STATUS`** | 行程项 start/end |
| **`BOOKING_CHECKIN`** | 预订签到 / bookedAt |
| **`NAVIGATION_EVENT`** | 导航/ motion / itinerary 变更事件 |
| `GPS` | 预留，V1.7+ |

同 metric 多条观测时，服务端按 **confidence + 来源优先级** 合并，前端直接展示返回列表即可。

### 6.4 `ExperienceOutcome`（V1.6 P3）

```typescript
{
  metric: 'USER_SATISFACTION' | 'REGRET' | 'GROUP_CONFLICT';
  value: number | string;
  source: 'USER_CONFIRMATION' | 'SURVEY';
  observedAt: string;
  context?: string;
}
```

**单独区域展示**（如「体验反馈」），**不要**与 `verdict` 主结论混为一谈。

---

## 7. Ledger 节点 → 用户决策（V1.6.1）

`GET /api/trips/:tripId/decision-ledger/nodes/:ledgerNodeId/decision`

**Response `data`**

```typescript
{
  decisionId: string;
  record?: DecisionRecord;   // 可能仅有 decisionId（metadata 有索引但 record 已裁剪）
}
```

**用途**

- Agent 调试 UI / 行程卡片上点击 Ledger `nodeId` 跳转决策详情。
- 与 `ledgerRefs.causedByAnnotatedNodeIds`、Memory Console `decision_ledger_causality` 同源。

**404：** `DECISION_NOT_FOUND_FOR_LEDGER_NODE: {ledgerNodeId}`

---

## 8. Memory Console（Agent 记忆看板）

`GET /api/agent/memory/v1/console?trip_id={tripId}`  
需登录；`FEATURE_MEMORY_CONSOLE=1`。

**Response 新增字段（V1.6.1）**

```typescript
{
  revision: 'v1';
  user_id: string;
  l0: …;
  l1: …;
  l2_recent: …;
  trip_constraints?: …;

  decision_ledger_causality?: {
    revision: 'v1';
    trip_id: string;
    ledger_node_to_decision_id: Record<string, string>;  // nodeId → decisionId
    links: Array<{
      ledger_node_id: string;
      decision_id: string;
      problem_id?: string;
      decided_at?: string;
      status?: DecisionRecordStatus;
      source: 'trip_metadata' | 'ledger_caused_by' | 'merged';
    }>;
    decision_records_count: number;
    ledger_snapshot_version?: number;
  };

  meta: {
    l2_total_count: number;
    feature_flags: {
      constraint_sink: boolean;
      memory_console: boolean;
      decision_semantics: boolean;  // 有 causality links 时为 true
    };
  };
}
```

**UI 侧栏 section（`deriveMemoryConsoleUiStateV1`）**

当 `decision_ledger_causality.links.length > 0` 时增加 section：**`decision_ledger_causality`**

文案键：

- `memory.ui.console.decision_ledger_causality` → 「决策账本关联」
- `memory.ui.console.decision_ledger_link_row` → 「Ledger 节点 → 用户决策」

Mock fixture：`fixtures/agent/memory-console.console.v1.json`

---

## 9. Agent route_and_run 调试观测

无独立 REST；消费 **`POST /api/agent/route-and-run`**（或等价）响应：

### 9.1 `observability.memory_contract.decision_ledger_causality`

与 Memory Console §8 **同结构**（不含 `ledger_snapshot_version` 时可能省略）。

额外 layer：`decision_ledger_causality_hydrated`

### 9.2 `observability.ledger_healing.user_decision_by_node_id`

```typescript
Record<string, string>  // ledgerNodeId → decisionId
```

与 `ledger_healing.affected_node_ids` 配合：对 affected 节点查表跳转决策。

示例：

```json
{
  "ledger_healing": {
    "status": "CONVERGED",
    "affected_node_ids": ["POI_REYNISFJARA"],
    "user_decision_by_node_id": {
      "POI_REYNISFJARA": "dec_1710000000_abc123"
    }
  }
}
```

---

## 10. 前端类型速查

```typescript
type DecisionProblemDetectedBy =
  | 'FEASIBILITY' | 'GATE' | 'TRIP_CONSTRAINT' | 'VERIFY' | 'GUARDIAN' | 'EXECUTION_MONITOR' | 'USER';

type ConstraintEnforcement =
  | 'BLOCK' | 'REQUIRE_ADJUSTMENT' | 'REQUIRE_CONFIRMATION' | 'WARN' | 'INFORM';

type DecisionOptionSource =
  | 'CONSTRAINT_REPAIR' | 'NEPTUNE' | 'MULTI_PLAN' | 'USER' | 'RULE_ENGINE';

type OutcomeValidationVerdict =
  | 'PENDING' | 'CONFIRMED' | 'PARTIALLY_CONFIRMED' | 'REFUTED' | 'INCONCLUSIVE';

type OutcomeFailureReason =
  | 'PREDICTION_ERROR' | 'DATA_STALE' | 'EXECUTION_DEVIATION'
  | 'USER_BEHAVIOR_CHANGE' | 'EXTERNAL_EVENT' | 'INSUFFICIENT_EVIDENCE';
```

---

## 11. 与现有模块分工

| 模块 | 用途 | Decision Semantics 关系 |
|------|------|-------------------------|
| `GET …/planning-conflicts` | 冲突中心 | `TRIP_CONSTRAINT` 问题与 `relatedConstraintIds` 对齐 |
| `GET …/constraints` | 约束控制台 | `sourceRefs.refId` 高亮卡片 |
| `GET …/feasibility-report` | 可行性 | repair 仍走 feasibility；Semantics 聚合展示 |
| `POST …/feasibility-report/validate` | 重新验证 | 与 `gate_data_revalidate` 选项配合 |
| Memory Console | 用户记忆 | `decision_ledger_causality` 展示 Ledger↔决策 |
| route_and_run | Agent 调试 | `memory_contract` / `ledger_healing` 跳转决策 |

---

## 12. 版本变更摘要

| 版本 | 变更 |
|------|------|
| V1.5 | 决策生命周期 API、preview、POST decisions、validation |
| V1.6 P0 | `DecisionRecord.ledgerRefs`、`validation.failureReasons: DATA_STALE` |
| V1.6 P1 | `detectedBy: TRIP_CONSTRAINT`、Gate `RULE_ENGINE` options |
| V1.6 P2 | `ObservedOutcome.source` 轻量执行源 |
| V1.6 P3 | `validation.experienceOutcomes` |
| V1.6.1 | `ledgerRefs.causedByAnnotatedNodeIds`、`GET decision-ledger/nodes/…/decision`、Memory Console + route_and_run causality |
| **V1.0 Decision Center** | `GET decision-center/overview`；`repairCommand` + `executionCapability`；Gate→feasibility 桥接；`GET decisions/…/execution-status`；**problem `RESOLVED` 回写** |
| **V1.6.2 Release Gate** | `idempotencyKey` + `IDEMPOTENT_REPLAY`；`postApplyCoherence` / `needsRepair` / `PARTIALLY_APPLIED` / `ROLLED_BACK`；`evidenceFreshnessBlock`（apply 前 DATA_STALE 阻断） |
