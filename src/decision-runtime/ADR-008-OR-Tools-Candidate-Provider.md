# ADR-008 — OR-Tools as Non-Authoritative Candidate Provider

> **Status:** Accepted（2026-07-14）· **Phase 0 DONE**  
> **Roadmap:** [PLANNING_ENGINE_ROADMAP.md](./PLANNING_ENGINE_ROADMAP.md)  
> **Related:** [ADR-006](./constraints/ADR-006-Unified-Decision-Runtime.md) · [ADR-007](./ADR-007-Decision-Runtime-v2.md) · [DECISION_RUNTIME_MATURITY](./DECISION_RUNTIME_MATURITY.md) · REQ-2026-TRAVEL-ENGINE-01

## Phase 判定（正式）

**Planning Engine Phase 0 — Shadow Candidate Generation = DONE.**

| 说法 | 是否成立 |
|------|----------|
| Planning Engine Complete | ❌ |
| OR-Tools 已成为权威规划引擎 | ❌ |
| Generation / Optimization / 局部 Repair（Shadow）可用 | ✅ |
| Authority / Continuous Planning | ❌ |

原「HOLD」**不是 Bug**，改为里程碑 **M1–M4**（见 Roadmap）。MOVE_DAY ∈ **M2 Multi-day Planning（P2）**，不是 Repair。

## Context

研究报告（REQ-2026）要求：Planning / Solver 生成候选，Decision Runtime 统一验证并授权写回。  
仓库已有 `RepairProvider`（Neptune）、`OptimizationProblem`（**Decision Core 组装输入**）、`DecisionCandidate`。  
需要正式接入 Google OR-Tools（Routing / 后续 CP-SAT），且不破坏现有权威边界。

## Decision

### 1. 角色冻结

**OR-Tools 是非权威的 Optimization / Repair Candidate Provider。**  
**真正的权威始终是 Decision Runtime，不是 Solver。**

| 拥有 | 不拥有 |
|------|--------|
| 候选生成权 | 约束最终解释权 |
| 数学求解权 | 风险裁决权 |
| 局部优化权 | 用户决策权 |
| | 行程写入权 |
| | Plan Version 创建权 |

### 2. 正式主链

```
Travel Context / Effective Plan / Evidence
                  ↓
        SolverProblem（求解投影 IR）
                  ↓
     OR-Tools Solver / Repair Provider
                  ↓
       PlanCandidate[]（2–3，平台行程 IR）
                  ↓
        Constraint Gateway
                  ↓
       OptimizationStrategy
                  ↓
        DecisionCore.finalize
                  ↓
      authorize → execute
                  ↓
          Plan Version
                  ↓
           Re-validation
```

与 ADR-007 主链一致：Solver **只**出现在 Candidate Provider 段；不得直连 Executor。

### 3. 命名边界（避免与现有合同冲突）

| 名称 | 含义 | 位置 |
|------|------|------|
| `OptimizationProblem` | Decision Core / Strategy 组装输入（**已存在**，含 snapshot + 已有候选） | `contracts/optimization-problem.ts` |
| `SolverProblem` | 发给 OR-Tools 的求解投影 IR（**本 ADR 新增**） | `solver/contracts/solver-problem.ts` |
| `SolverResponse` | OR-Tools 服务返回（含 `solverMeta`） | `solver/contracts/solver-response.ts` |
| `DecisionCandidate` | Gateway 之后的平台候选（`TripPlan`） | `candidates/contracts/decision-candidate.ts` |

**禁止**把 OR-Tools 内部 `route index` / `vehicle index` 暴露给 Decision Runtime。  
Provider 内映射：`SolverResponse` → `RepairProposal` / `DecisionCandidate`。

### 4. 三条不可破规则

1. **`solverFeasible ≠ executability`**  
   Solver 找到数学可行解，只代表候选可进入 Gateway；最终状态只来自 Decision Runtime。

2. **Solver Constraint ≠ Canonical Constraint**  
   Canonical → projection → Solver Constraint。  
   平台规则 SSOT 永不锁死在求解器模型里（可替换 Hexaly / Gurobi / 自研）。

3. **引擎标签诚实（禁止 Routing 冒充 CP-SAT）**  
   - 今日线：`engine: 'OR_TOOLS_ROUTING'` + `nativeCpSat: false`（RoutingModel + Time Dimension + GLS）。  
   - **仅**真 `cp_model.CpModel` / `CpSolver`（`Add` / IntervalVar / …）→ 才可报 CP-SAT。  
   - 仓库 `cp-sat-lexicographic` **不是**原生 OR-Tools CP-SAT。  
   - **@v2 演进（S4.5 冻结后）**：`solverMeta.engine ∈ { routing | cp_sat | hybrid }`，`nativeCpSat` 降为派生只读；**v1 wire 不改**（见 [PLANNING_IR_FREEZE](./solver/PLANNING_IR_FREEZE.md)）。

### 5. 第一刀切法（已完成 → Phase 0）

Python sidecar + SHIFT/SWAP/REROUTE/SHORTEN/REPLACE（单日）+ Nest Shadow。  
**禁止**在单日 Routing 上硬做 MOVE_DAY（那是 Multi-day Assignment / TDTOPTW，属 **M2**）。

### 6. Milestones & Sprint

| 阶段 | 内容 | Milestone |
|------|------|-----------|
| S0–S4 | IR + Routing MVP + Evaluate/Planning Shadow + Lab/CI | **M1 DONE** |
| **S4.5** | **Planning IR Freeze**（SolverProblem / Response / Repair op 投影）— [DONE](./solver/PLANNING_IR_FREEZE.md) | **M1.5 DONE** |
| S5–S6 | MOVE_DAY + 住宿锚点 + 日容量 — [设计 DONE](./solver/MOVE_DAY_DESIGN_REVIEW.md)；实现 = P4 | **M2** |
| （并行） | Native CP-SAT SHIFT — [DONE MVP](./solver/NATIVE_CPSAT.md) | **M3 Shadow** |
| S7+ | Rolling Horizon / Continuous | 后置 |
| 发布授权后 | Authoritative canary | **M4 Release Gate**（工程 READY ≠ 已授权） |

Shadow 规则（M4 之前强制）：

```
authoritativeProvider = legacy-frozen / neptune-repair（现网）
shadowProvider        = ortools-repair
```

### 7. Lab Sign-off & Authority Checklist

**合成 Lab（已有）**

| 类 | 签核线 |
|----|--------|
| 已建模硬约束满足率 | 100% |
| Gateway 绕过 / 未授权写入 / 固定预约误改 / 非法 execute | 0 |
| 固定 seed 可复现率 | 100% |
| 单日 20 / 50 POI 修复 P95 | ≤ 1s / ≤ 2s |
| 超时可降级率 | 100% |

**权威晋升前追加（M4 必备）**

| 类 | 签核线 |
|----|--------|
| **Candidate Stability** | 固定 seed + fixture + constraints，连续 ≥100 次 Candidate Hash 一致率 **100%** |
| **Repair Locality** | 基准 ~20 activities 时，Repair 触及宜 **2–4** 项，禁止「全表重排当修复」 |
| 真实金样 Replay | [Planning Gold Dataset](./solver/lab/gold/README.md) 族场景全绿 |
| Evidence stale 主链 | **DONE** — Evidence/snapshot 变 → 丢弃旧 shadow、强制重算（[详文](./solver/EVIDENCE_STALE_MAIN_CHAIN.md)） |
| 产品书面签核 + Canary/回滚 | **Release Governance** — Artifact 签核 + `shadow→selected→5%→…→100%`；一键回 legacy |

道路关闭 harness：绕行仍经 Gateway、拒绝不写回、Evidence 变更强制重验。

## Implementation (S0–S2)

| 层 | 路径 |
|----|------|
| Python sidecar | `python/solver/`（FastAPI `:8091`, `POST /v1/solve`） |
| Wire contracts | `src/decision-runtime/solver/contracts/` |
| Nest client / provider | `OrToolsSolverClient` · `OrToolsRepairProvider` (`providerId=ortools-repair`) |
| Context key | `providerContext.ortools.solverProblem` |
| Road-close 投影 | `solver/projection/road-close-solver-problem.projector.ts` → `EDGE_FORBIDDEN` |
| Shadow 双跑 | `solver/shadow/ortools-repair-shadow.service.ts`（`writeAttempted: false`） |
| Evaluate 主链桥 | `OrToolsRoadEvaluateShadowBridge` ← `RoadSegmentUnavailableEvaluateService` |
| day-order → TripPlan | `materialize/` + `MOVE_ITEM` on `RoutePlanDraft` |
| Gateway 实评 | `ConstraintEvaluationGatewayService.evaluateCandidate`（shadow 候选） |
| Workspace 附件 | `DecisionWorkspace.ortoolsShadow`（`shadowAuthority: false`） |
| Harness | `solver/harness/ortools-road-close-shadow.harness.spec.ts` |
| Ops API | `GET /decision-engine/v1/ortools-shadow/health|metrics|lab-signoff/gate` |
| Frontend Shadow 对接 | [FRONTEND_SHADOW_INTEGRATION.md](./solver/FRONTEND_SHADOW_INTEGRATION.md) |
| Lab Sign-off CLI | `python/solver/lab_signoff.py`（权威晋升恒为 false） |
| CI gate | `npm run ci:ortools-adr008` · `.github/workflows/ortools-adr008-ci.yml` |
| REPLACE_POOL | evaluate：`ICELAND_POI_ALTERNATIVES` → `alt:{node}`；miss 则 synthetic；Python 真·换点 |
| Evaluate deepen | 主 op 无候选 → `SHORTEN` → `REPLACE`（仍不写权威） |
| Materialize | REPLACE strict drop/alt · SHORTEN 时长戳 · RFC001 REMOVE/REPLACE/SHIFT ops |
| Evidence 新鲜度 | [EVIDENCE_STALE_MAIN_CHAIN](./solver/EVIDENCE_STALE_MAIN_CHAIN.md) — evaluate 丢弃 + `selectUsable*` + `staleDiscardTotal` |
| S4 Planning | `OPTIMIZE_ROUTE` / `AUTO_ARRANGE` → `PlanProposal.ortoolsShadow`（densest-day VRPTW） |
| Apply guard | `selectAuthoritativePlanProposalChanges` — apply 永不写 `shadowChanges` |
| Planning Lab | `ortoolsShadow.labCompare` + `GET .../planning-lab/compare`（legacy vs OR-Tools 秩序/路程） |
| Live smoke | `npm run smoke:ortools-live` → sidecar health + MVP ops + harness |
| Planning Gold Dataset | `solver/lab/gold/`（P0；M4 必要非充分） |
| Planning IR Freeze | [PLANNING_IR_FREEZE.md](./solver/PLANNING_IR_FREEZE.md)（S4.5 / M1.5 DONE） |
| MOVE_DAY | [设计](./solver/MOVE_DAY_DESIGN_REVIEW.md) + `move_day_solver.py` + [P4.d 投影](./solver/adapters/ortools-move-day-projection.util.ts)（flag 默认关） |
| Native CP-SAT | [NATIVE_CPSAT](./solver/NATIVE_CPSAT.md) — SHIFT `CpSolver`；`OR_TOOLS_NATIVE_CPSAT`（默认关） |
| M4 Release Gate | [M4-RA-01](./solver/M4_RA_01_SELECTED_TRIPS_PILOT.md) · [AUTHORITY_CANARY](./solver/AUTHORITY_CANARY.md) · [planning-signoff](./solver/lab/planning-signoff/README.md) |
| Roadmap | [PLANNING_ENGINE_ROADMAP.md](./PLANNING_ENGINE_ROADMAP.md) |

## Consequences

- 新增 `solver/` 合同与 Python 服务；Nest `OrToolsRepairProvider` 实现既有 `RepairProvider`。
- `DecisionCandidateSource` 增加 `OR_TOOLS_REPAIR`。
- 不改写现有 `OptimizationProblem` 语义；Solver wire 以 S4.5 `@v1` 冻结（演进走 `@v2`）。
- **M4 未解除前**禁止将 OR-Tools 设为 authoritative。

## Phase 0 success criterion（已满足于 Shadow）

```
真实/投影问题 → OR-Tools 2–3 候选 → Gateway →（不写权威）
→ 未授权不可写入 → 可观测 / 可复现 / 可与 legacy 比较
```

