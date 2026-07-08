# TripNARA Decision Semantics V1.5

> **Swagger Tag**: `decision-semantics`  
> **Global prefix**: `/api`  
> **响应**: `{ success, data, error }`

旅行决策解释与闭环语义层（Decision Explanation Layer）。**不重新计算**天气、路线、Gate 或 Feasibility，而是将现有子系统结果归一为统一契约。

## 目标

补齐 Decision Lifecycle 四条链：

| 链 | 对象 | V1.5 阶段 |
|----|------|-----------|
| 影响链 | `AffectedScope` + `MemberImpact` | P1（read 合成 + 基础推导） |
| 权限链 | `DecisionAuthority` | P0（规则矩阵） |
| 变更链 | `TripMutationSet` | P1（preview 对齐，write 后续） |
| 验证链 | `DecisionOutcomeValidation` | P2 |

## 标准对象（7 + 3）

1. `DecisionProblem` — 系统正在解决什么问题  
2. `ConstraintAssertion` — HARD/SOFT/RISK/INFORMATION_GAP 归一  
3. `AffectedScope` — 影响范围与成员影响  
4. `DecisionOption` — repair / alternative / Plan B 聚合  
5. `TradeoffDimension` — 结构化方案代价  
6. `DecisionAuthority` — 谁提出 / 批准 / 否决  
7. `DecisionRecord` — 决策记录（P1+ 持久化）  
8. `TripMutationSet` / `TripMutation` — 实体级变更（P1）  
9. `DecisionOutcomeValidation` — 预测 vs 实际（P2）

## 与现有系统关系

| 源系统 | Adapter | 说明 |
|--------|---------|------|
| `FeasibilityIssueDto` | `from-feasibility-issue.adapter` | 主入口 |
| Gate violations | `from-gate-violation.adapter` | 后续 |
| `TripConstraint` | `from-trip-constraint.adapter` | 后续 |
| repair / multi-plan | `decision-option.aggregator` | options 端点 |

**不替换** `FeasibilityIssueDto`、Gate、`TripConstraint`；通过 `sourceRefs[]` 双向引用。

**Decision Ledger**（`agent/memory/decision-ledger`）继续负责失效/重算 DAG；本层负责用户可见决策生命周期。

## API（V1.5）

### 读路径

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/trips/:tripId/decision-problems` | 列表（feasibility + Gate/DSO 合成，按 semanticKey 去重） |
| `GET` | `/trips/:tripId/decision-problems/:problemId` | 详情 + assertions + affectedScope + authority |
| `GET` | `/trips/:tripId/decision-problems/:problemId/options` | 聚合 DecisionOption[] + tradeoffs |

### 预览与写路径（P1）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/trips/:tripId/decision-problems/:problemId/options/:optionId/preview` | `TripMutationSet` + tradeoffs + authority |
| `POST` | `/trips/:tripId/decisions` | 记录 DecisionRecord（metadata.decisionSemantics.records） |
| `GET` | `/trips/:tripId/decisions/:decisionId` | 读取决策记录 |

`POST decisions` body:

```json
{
  "problemId": "dp_issue-daily-drive-d3",
  "selectedOptionId": "insert_buffer_after_day3",
  "reason": "优先保证老人休息",
  "acknowledgement": ["已知晓驾驶时长风险"],
  "execute": true
}
```

| 字段 | 说明 |
|------|------|
| `execute` | 默认 `true`；`APPROVED` 后调用 `feasibility.applyRepair` |
| `executeDecision` / `persistDecision` | 透传 applyRepair（默认 true） |
| `runGuardianNegotiation` | 默认 false（决策语义层已做 authority 校验） |

成功执行后：

- `decision.status` → `EXECUTED`
- `tripVersionAfter` → 行程 revision（apply 后重读）
- `applyResult` → applyRepair 摘要
- `appliedMutations.versionAfter` 写入 mutation 快照

`execute: false` 或 repair 返回 `deferred` 时仅记录 `PROPOSED` / `APPROVED`，不改行程。

不可覆盖硬约束时，缺少 `acknowledgement` → **400** `DECISION_ACKNOWLEDGEMENT_REQUIRED`。  
applyRepair 失败 → **400** `DECISION_APPLY_FAILED`。

### 验证（P2）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/trips/:tripId/decisions/:decisionId/validation` | prediction vs actual |

**响应 `DecisionOutcomeValidation`：**

| 字段 | 说明 |
|------|------|
| `expectedOutcomes[]` | 决策时写入（来自 tradeoffs + 问题消解预期） |
| `observedOutcomes[]` | 当前 feasibility + POI 行中反馈 |
| `verdict` | `PENDING` / `CONFIRMED` / `PARTIALLY_CONFIRMED` / `REFUTED` / `INCONCLUSIVE` |
| `confidence` | 0–1 指标匹配率 |
| `failureReasons[]` | `PREDICTION_ERROR` / `INSUFFICIENT_EVIDENCE` 等 |

**客观指标（V1）：**

| metric | 预期来源 | 观测来源 |
|--------|----------|----------|
| `CONSTRAINT_VIOLATION` | 问题应被消解 | 问题是否仍在 decision-problems 中 |
| `DRIVING_DURATION` | tradeoff FATIGUE/TIME | feasibility daily_drive anchors |
| `ACTIVITY_COMPLETION` | POI 覆盖 tradeoff | `PoiExecutionFeedback` |
| `ARRIVAL_TIME` | TIME tradeoff | POI feedback `arrivalTime` |

结果会回写 `decision.validationStatus` 与 `lastOutcomeValidation`。

## 权威字段规则

以下字段**必须由规则/代码确定**，LLM 仅可生成 narrative：

- `ConstraintAssertion.enforcement` / `overridable`
- `DecisionAuthority.requiredApprover` / `executionMode`
- `EvidenceReference.validUntil`
- `TripMutationSet.versionBefore/After`
- `DecisionOutcomeValidation.verdict`

## 模块布局

```
src/trips/decision-semantics/
├── DECISION_SEMANTICS_V1.5.md
├── decision-semantics.module.ts
├── types/decision-semantics.types.ts
├── authority/decision-authority.matrix.ts
├── normalizers/
│   ├── from-feasibility-issue.adapter.ts
│   ├── constraint-semantic.normalizer.ts
│   └── tradeoff.normalizer.ts
├── propagation/impact-propagation.service.ts
├── services/
│   ├── decision-semantics.service.ts
│   └── decision-repair-executor.service.ts
└── controllers/decision-semantics.controller.ts
```

## V1.5 已完成

- **P0**: `TradeoffDimension`, `ConstraintAssertion`, `DecisionAuthority` — ✅  
- **P1**: read API + preview + `POST decisions` → `applyRepair` + `tripVersionAfter` — ✅  
- **P2**: `GET decisions/:id/validation` — ✅  

## V1.6+ 路线图（尚未覆盖项优先级）

与 Decision Ledger 分工不变：**Ledger = 失效/重算 DAG；Semantics = 用户可见决策生命周期**。下一阶段的缺口是**两套系统之间的关联 ID**。

### P0 — Decision Ledger `nodeId` 关联（下一步最值得做）

无关联 ID 时会出现：

- Semantics 不知道底层为何重新计算  
- Ledger 不知道哪个用户决策触发了节点失效  
- Validation 无法区分「原决策预测」与「重算后的新预测」

**契约扩展**（不改 Ledger 本体，只在 `DecisionRecord` 上挂引用）：

```typescript
interface DecisionLedgerRefs {
  /** 决策所依据 / 消费的 Ledger 节点 */
  sourceNodeIds: string[];
  /** apply / mutation 后失效的节点 */
  invalidatedNodeIds?: string[];
  /** 增量重算产出的节点 */
  recomputedNodeIds?: string[];
  /** 一次 invalidation + recompute 批次 */
  ledgerRunId?: string;
}

interface DecisionRecord {
  ledgerRefs?: DecisionLedgerRefs;
}
```

**目标闭环**：

```
Decision → Mutation → Ledger invalidation → Recompute
  → New assertion / prediction → Validation
```

**集成落点（实现时）**：

- 写入：`POST decisions` 执行成功后，从 `incremental-recompute-orchestrator` / `decision-runtime-kernel.prepare` 读取 `invalidatedNodeIds` 写入 `ledgerRefs`  
- 读取：`GET validation` 若 `ledgerRunId` 之后存在重算节点，verdict 标注 `failureReasons: DATA_STALE` 或拆分为「原决策验证 / 重算后验证」  
- Ledger 侧：节点 `lineage` 或 edge `caused_by` 可反查 `decisionId`（可选 V1.6.1）

---

### P1 — TripConstraint 独立 Adapter

当前主要聚合 feasibility + Gate；`TripConstraint` 未进统一层时，冲突中心仍可能出现**双轨语义**。

新增 `TripConstraintSemanticAdapter`（只读映射，不改 `TripConstraint` 模型）：

```
TripConstraint → ConstraintAssertion → AffectedScope → DecisionProblem
```

与 `inferConflictConstraintIds` / 约束控制台 `relatedConstraintIds` 对齐，避免同一冲突在 constraints 与 decision-problems 各说各话。

---

### P1 — Gate-only 确定性 Repair Recipe

Gate-only 问题 fallback 多，会直接伤害用户对语义层的信任（用户不关心问题来自 Gate 还是 feasibility，只关心「有没有可用方案」）。

高频 Gate 类型 → 确定性 repair（规则引擎，非 Neptune 自由生成）：

| Gate 类型 | 优先 repair |
|-----------|-------------|
| `REACHABILITY` | 换路线、拆段、换交通方式 |
| `SAFETY` | 改日期、替代活动、取消 |
| `DATA_MISSING` | 补充证据、重新 validate、降级为未确认 |
| `DEM` | 换路线、调整车型、取消路段 |

输出仍为统一 `DecisionOption[]` + `TradeoffDimension[]`。

---

### P2 — 更精确的到达/执行验证（先轻后重）

完整 GPS 轨迹验证价值高，但依赖定位授权、后台轨迹、隐私与地图匹配，适合 V1.7+。

**V1.6 优先轻量客观源**（扩展 `ObservedOutcome.source`）：

- 用户点击「已到达」  
- 活动开始/结束、行程项状态变化  
- 预订签到  
- 导航开始/结束事件  

不必从完整 GPS 轨迹起步。

---

### P3 — 满意度（ExperienceOutcome，非主 verdict）

「用户满意 ≠ 决策正确」，继续保持谨慎。

- 满意度归入 **`ExperienceOutcome`**（体验层）  
- **`DecisionCorrectness`** 仍以客观指标为主（约束消解、驾驶时长、活动完成等）  
- 可作为 validation 的**补充维度**，不参与主 `verdict` 计算  

```typescript
interface ExperienceOutcome {
  metric: 'USER_SATISFACTION' | 'REGRET' | 'GROUP_CONFLICT';
  value: number | string;
  source: 'USER_CONFIRMATION' | 'SURVEY';
}
```
