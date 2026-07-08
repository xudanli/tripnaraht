# TripNARA Decision Center V1.0

**旅行问题与决策中心** — 下一阶段产品化路线图

> 后端已从「能力缺失」进入「能力待产品化」。目标从 API/DTO/Ledger 是否完整，切换为：**用户遇到真实旅行问题时，能否理解、比较、确认、执行，并看到结果。**

**一句话目标：** 将 Feasibility、Gate、TripConstraint、Ledger 的后台能力，转化为用户可理解、比较、确认、执行和复盘的旅行决策体验。

**契约基线：** Decision Semantics V1.6.1（见 `DECISION_SEMANTICS_V1.5.md`、`DECISION_SEMANTICS_FRONTEND_API.md`）

> **当前实施阶段**
>
> 本文档描述 Decision Center 的完整 V1.0 产品目标与能力边界。
> 当前开发与验收范围以
> [HARNESS_DECISION_CENTER_BASELINE.md](./HARNESS_DECISION_CENTER_BASELINE.md)
> 为准：后端 Release Gate 第一阶段已完成，当前 Sprint 仅落地
> Decision Center 前端对 V1.6.2 执行契约的完整消费。

---

## 原则

### 主读模型

**用户可见的旅行问题，以 `GET …/decision-problems` 为唯一主入口。**

底层接口（feasibility、constraints、Gate、blockers、repair options）继续存在，仅用于：计算、调试、内部服务、特殊专业页。

### UI 语义

- 交互行为看 **`primaryEnforcement`** / `ConstraintAssertion.enforcement`，不看 `HARD`、`must_handle`、原始 Gate 枚举。
- `ConstraintNature` 是本质；`enforcement` 决定卡片类型与按钮。

### 契约冻结（V1.6.1 后短期）

- 允许新增 **optional** 字段
- 禁止：重命名、改枚举含义、同字段多义、`tradeoffs: string[]` 回流

---

## 优先级

| 优先级 | 工作 | 目标 |
|--------|------|------|
| **P0** | 前端冲突中心迁移 | Decision Semantics 成为主读模型 |
| **P0** | 5 条端到端决策链 E2E | preview、权限、执行、重算、validation |
| **P0** | OpenAPI / TS 类型导出 | `@tripnara/decision-semantics-contracts` 或 `src/generated/decision-semantics-api.ts` |
| **P1** | 高频 repair 可执行 | RepairCommand + `executionCapability` |
| **P1** | 决策执行后状态反馈 | 用户可见 mutation 差分 + 重算进度 |
| **P1** | 产品与模型指标 | 漏斗、rollback、resolution |
| **P2** | 独立持久化 | `trip_decision_*` 表（**仅设计，不进当前 Sprint**） |
| **P3** | GPS 轨迹验证 | 执行链成熟后再做 |

---

## Decision Center 页面结构（前端）

### L1 旅行状态总览

- 可执行性、must-handle / 需确认 / 提醒数量
- 受影响天数、成员
- 统一 `primaryEnforcement` 聚合文案

### L2 问题列表

卡片：标题、原因、影响范围、enforcement、证据时效、方案数。

| enforcement | 表现 |
|-------------|------|
| BLOCK | 必须处理 |
| REQUIRE_ADJUSTMENT | 建议立即调整 |
| REQUIRE_CONFIRMATION | 等待用户决定 |
| WARN | 风险提醒 |
| INFORM | 信息更新 |

### L3 问题详情

六问：发生了什么 / 为什么 / 影响谁 / 证据 / 方案 / 谁确认。

结构：结论 → 影响范围 → 证据 → 方案对比 → 权限 → 操作。

### L4 方案对比与确认

Tradeoff 矩阵（时间、成本、景点、疲劳、安全…）；按钮随 `DecisionAuthority.executionMode` / `requiredApprover` 变化。

---

## P0：五条 E2E 验收链

1. **道路关闭 / 不可达** — Gate+Constraint → problem → preview → POST → apply → ledger → validation → node 反查
2. **单日驾驶超时** — 成员归因、结构化 tradeoff、多方案比较
3. **预算增加** — 权限（首期无 payer 则统一 `TRIP_OWNER`）
4. **安全硬约束** — 不可覆盖、`executable: false`、无 mutation
5. **执行结果验证** — CONFIRMED / PARTIAL / REFUTED / INCONCLUSIVE（证据不足不强行 CONFIRMED）

---

## P0：类型导出清单

至少导出：

`DecisionProblem`, `ConstraintAssertion`, `AffectedScope`, `DecisionOption`, `TradeoffDimension`, `DecisionAuthority`, `TripMutationSet`, `DecisionRecord`, `DecisionOutcomeValidation`, `DecisionLedgerRefs`, `ExperienceOutcome`

枚举：`DecisionEnforcement`, `ConstraintNature`, `TradeoffDimensionKey`, `OutcomeValidationVerdict`, `DecisionExecutionMode`, `ObservedOutcomeSource`

---

## P1：RepairCommand（设计草案）

```typescript
interface RepairCommand {
  commandType:
    | 'REPLACE_POI' | 'REMOVE_ITEM' | 'MOVE_ITEM' | 'CHANGE_ROUTE'
    | 'SPLIT_JOURNEY' | 'CHANGE_HOTEL' | 'ADD_BUFFER' | 'CHANGE_DATE'
    | 'CHANGE_TRANSPORT_MODE';
  targetRefs: EntityReference[];
  parameters: Record<string, unknown>;
  sourceOptionId: string;
  expectedTripVersion: string;
}
```

链：`DecisionOption → RepairCommand → preview → authority → apply → actualMutation`

**executionCapability：** `DIRECT` | `PARTIAL` | `GUIDED_MANUAL` | `ADVISORY_ONLY`

首批 8 类确定性动作：删/移/替 POI、缓冲、改出发、拆段、换路线、换住宿。

---

## P1：决策执行状态（读模型）

```typescript
type DecisionExecutionStatus =
  | 'RECORDED' | 'APPLYING' | 'APPLIED' | 'RECOMPUTING'
  | 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'FAILED' | 'ROLLED_BACK';
```

用户可见：已改什么 → 正在重检什么 → 重算完成 / 新问题 / 可执行性分数变化。

---

## P1：产品指标（示例）

- 问题质量：dedupe rate、actionable rate、member attribution、evidence freshness、fallback rate
- 漏斗：view → expand → preview → confirm → apply → resolve → validate
- 效果：rollback rate、prediction error、recurring problems

---

## P2：持久化迁移（设计保留，不进当前 Sprint）

**当前策略：** `Trip.metadata.decisionSemantics` 足以支撑 **前端 MVP** 与 Release Gate 联调；**不优先**独立库表迁移。

**表设计（保留草案，不实施）：** `trip_decision_problems`, `trip_decision_records`, `trip_decision_validations`（JSONB 先行）。

**触发迁移：以下至少满足两项**

| # | 条件 |
|---|------|
| 1 | 前端 Decision Center **已真实上线**（用户流程经生产验证） |
| 2 | 单 Trip 决策量 **接近 100**（逼近 metadata `MAX_RECORDS` 上限） |
| 3 | 需要 **跨 Trip** 查询 |
| 4 | 需要 **option 成功率** 等产品统计 |
| 5 | metadata **并发写冲突** 在现网出现 |
| 6 | 要将决策样本用于 **训练** |
| 7 | **审计**要求提高 |

**提前迁移的风险：** 在用户流程尚未验证前，把大量时间花在可能错误的数据结构优化上。

**当前 Sprint 聚焦：** 前端 MVP 联调（`DECISION_CENTER_FE_MVP_INTEGRATION.md`）、metadata 路径上的执行态 / resolution / 幂等，而非表迁移。

---

## Sprint 计划

| Sprint | 交付 |
|--------|------|
| **S1** | TS 类型、列表/详情/tradeoff/authority/preview — 用户能看懂并进入确认 |
| **S2** | POST decisions、RepairCommand、apply、mutation 差分、resolved、Ledger 状态 |
| **S3** | validation UI、DATA_STALE、ExperienceOutcome、埋点漏斗 |
| **S4** | 冰岛 5 类高频场景端到端 |

---

## 当前后端就绪度（V1.6.1）

| 能力 | 状态 |
|------|------|
| decision-problems 聚合（feasibility+Gate+TripConstraint） | ✅ |
| options / preview / POST decisions / validation | ✅ |
| ledgerRefs + caused_by + 反查 API | ✅ |
| Gate RULE_ENGINE 选项 | ✅（执行与 feasibility 未完全统一） |
| 轻量 validation 观测 + ExperienceOutcome | ✅ |
| Memory Console / route_and_run causality | ✅ |
| RepairCommand / executionCapability | ❌ 设计在 P1 |
| DecisionExecutionStatus 读模型 | ❌ P1 |
| 前端主读模型 / E2E 业务链 | ❌ P0 前端 |
| TS 契约包 | ❌ P0 |

**立即开工：** OpenAPI/TS 导出 → 冲突中心迁移 → 5 条 E2E。
