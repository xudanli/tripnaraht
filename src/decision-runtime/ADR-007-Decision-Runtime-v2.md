# ADR-007: Decision Runtime v2 — 统一主链路、可插拔策略与 Decision Lab

## Status

Accepted (2026-07-01)

## Context

ADR-006 已冻结决策权边界（Decision Core 唯一决策、Executor 唯一写库、Constraint Gateway 统一语义）。下一阶段目标不是把 CP-SAT / ε-constraint / LNS 直接塞进 Legacy orchestrator，而是建设：

1. **一条统一决策主链路**
2. **多个可替换求解策略**
3. **一套独立实验验证环境（decision-lab）**

实验协议要求生产与 Lab 共用：Canonical Snapshot、目标函数版本、约束语义、策略接口、可复现运行环境。

## Decision

### 1. 唯一正式架构（主链路）

```
用户请求 / 世界事件
  → Decision Trigger Gateway（待 Sprint 7）
  → Canonical WorldStateSnapshot（一次 Run 一个 snapshotId）
  → Constraint Evaluation Gateway
  → Optimization Problem Assembler
  → Decision Core
       → Mandatory Feasibility Gate（L1）
       → Optimization Strategy Selector
       → Solver Strategy
       → Post Validation（Gateway 二次验证）
       → Representative Candidate Selector
       → Structured Explanation Builder
  → Authorization Policy
  → Effective Plan Executor
  → Effective Plan + Decision Record + Travel Event Store
```

### 2. 职责边界（不可违反）

| 组件 | 可以 | 不可以 |
|------|------|--------|
| TripDecisionEngine / Legacy Adapter | 生成候选 | 形成正式决定、写 Effective Plan |
| Constraint Gateway | 评估、归一化 | 直接 execute |
| Abu / Dr.Dre | 风险/负荷 Provider | 修改行程、最终排序 |
| Neptune | 修复候选生成 | 直接写库 |
| Decision Core | finalize、选优、DecisionRecord | 直接写 ItineraryItem |
| Effective Plan Executor | 唯一行程变更 | 重新做方案选择 |
| LLM | 候选、解释 | 硬约束判断、最终排序 |

### 3. 统一合同（`src/decision-runtime/contracts/`）

| 合同 | 文件 | 说明 |
|------|------|------|
| CanonicalWorldStateSnapshot | `world-state-snapshot.ts` | 一次 Decision Run 绑定单一 snapshotId |
| ConstraintEvaluation | `constraint-evaluation.ts` | 扩展 ADR-006 assertion，含 actionPolicy / relaxable |
| ObjectiveSemantics | `objective-definition.ts` | 首批 8 目标 + registry 版本 |
| OptimizationProblem | `optimization-problem.ts` | Assembler 输出 |
| OptimizationResult | `optimization-result.ts` | feasibilityStatus ≠ terminationReason |
| DecisionCandidate | `decision-candidate.ts` | re-export 自 candidates 模块 |
| EvidenceReference | `evidence-reference.ts` | 结构化证据引用 |

**OptimizationResult 关键语义：**

- `TIME_LIMIT` + `hasIncumbent: true` → `feasibilityStatus: FEASIBLE`
- 超时 **不等于** INFEASIBLE
- L1 BLOCK + REJECT 不可进入优化

### 4. 可插拔策略（`src/decision-runtime/optimization/`）

```typescript
interface OptimizationStrategy {
  strategyId: string;
  supports(profile: OptimizationProblemProfile): boolean;
  solve(problem: OptimizationProblem, budget: SolverBudget): Promise<OptimizationResult>;
}
```

首批策略 ID（实现分 Sprint 交付）：

| strategyId | Sprint | 生产默认 |
|------------|--------|----------|
| `legacy-frozen` | 5 | ✅ 直至 Lab 签核 |
| `weighted-score` | 4 | Lab |
| `cp-sat-lexicographic` | 4 | Lab |
| `cp-sat-epsilon` | 4 | Lab |
| `bounded-lns-repair` | 7 | 行中局部 |
| `rule-fallback` | 4 | 无 incumbent 降级 |

NSGA-III / POMDP / Decision OS **不进入**生产 Strategy Selector。

### 5. Decision Lab（`src/decision-lab/`）

- 与 `decision-runtime` **共用 contracts**
- **禁止** import 生产 Effective Plan Executor 写路径
- 包含：Fixture、Seed、Benchmark Runner、结果导出
- 启用：`DECISION_LAB_ENABLED=1`

### 6. 环境开关收敛

| 变量 | 值 | 说明 |
|------|-----|------|
| `DECISION_RUNTIME_MODE` | LEGACY / SHADOW / CANARY / CANONICAL | 已有 |
| `OPTIMIZATION_STRATEGY_MODE` | AUTO / LEGACY / WEIGHTED / CPSAT_LEX / CPSAT_EPSILON | 新增 |
| `DECISION_LAB_ENABLED` | 0 / 1 | 新增 |

详见 `DECISION_RUNTIME_ENV.md`。

### 7. 迁移 Sprint（摘要）

| Sprint | 交付 | 状态 |
|--------|------|------|
| 1 | 决策权 / 执行权 / ADR-006 contracts | ✅ 大部分完成 |
| 2 | Canonical Snapshot + Gateway 扩展 | 🔄 Gateway ✅；Snapshot 合同 ✅（实现待迁） |
| 3 | Objective Registry + 候选适配 | 📋 合同 ✅；Registry 实现待做 |
| 4 | Decision Lab + Weighted / CP-SAT runners | 📋 骨架 ✅ |
| 5 | 全量规划 Shadow | 待 Lab benchmark |
| 6 | Canary | 待指标门槛 |
| 7 | 行中 Bounded LNS + ReplanningTriggerPolicy | 待做 |
| 8 | Legacy 收敛 | 待 Canonical 达标 |

## Architecture Invariants

1. 只有 `DecisionCore.finalize()` 形成正式决策
2. 只有 `EffectivePlanExecutor` 修改 Effective Plan
3. L1 不参与加权、不可 relax
4. UNKNOWN ≠ PASS ≠ BLOCK
5. 超时不等于无解
6. 全策略同一 snapshot + 同一 objective formulaVersion
7. Solver 输出必须 Post Validation
8. Lab 不写生产行程

## Consequences

- 新求解器必须先实现 `OptimizationStrategy` + Lab benchmark，再进入 Selector
- `WorldStateStoreService`（guardian-core）需逐步对齐 `CanonicalWorldStateSnapshot`
- `ConstraintAssertion` 可渐进映射到 `ConstraintEvaluation`
- Decision Core 内部组件（Mandatory Gate、Explanation Builder）分 PR 拆入 guardian-core / decision-runtime

## References

- ADR-006: `constraints/ADR-006-Unified-Decision-Runtime.md`
- **Maturity & governance:** `DECISION_RUNTIME_MATURITY.md`（六层映射、`legacy-frozen` vs Legacy Runtime、成熟度与收敛优先级）
- Contracts: `contracts/index.ts`
- Lab: `../decision-lab/decision-lab.module.ts`
- Env: `DECISION_RUNTIME_ENV.md`
