# Planning IR Freeze — S4.5 / M1.5

> **状态：FROZEN @ v1（2026-07-14）**  
> Wire IR 对 Nest ↔ Python OR-Tools sidecar 生效。  
> **不晋升权威**；`OptimizationProblem`（平台装配）≠ `SolverProblem`（求解线）。

参考：[ADR-008](../ADR-008-OR-Tools-Candidate-Provider.md) ·
契约：[`contracts/`](./contracts/) ·
Gold：[`lab/gold/`](./lab/gold/)

---

## 1. Frozen schemaIds

| Artifact | schemaId | 变更策略 |
|----------|----------|----------|
| Request | `tripnara.solver_problem@v1` | 破坏性变更 → `@v2`（并存期） |
| Response | `tripnara.solver_response@v1` | 同上 |

常量导出（TS）：`SOLVER_PROBLEM_SCHEMA_ID` / `SOLVER_RESPONSE_SCHEMA_ID`。  
Python：`SolverProblem.schemaId` / `SolverResponse.schemaId` Literals。

---

## 2. RepairOperation 矩阵

| Op | MVP | Runtime |
|----|-----|---------|
| `SHIFT` | ✅ | 固定顺序重排时刻 |
| `SWAP` | ✅ | 顺序置换（优先 locality） |
| `REROUTE` | ✅ | 绕开 `EDGE_FORBIDDEN` |
| `SHORTEN` | ✅ | 缩短 / 丢可选 |
| `REPLACE` | ✅ | `REPLACE_POOL` 优先，否则 drop optional |
| `MOVE_DAY` | ❌ reserved | **必须** `status=ERROR`；属 **M2**，禁止单日 Routing 冒充 |

投影：Canonical → SolverConstraint；SolverCandidate → RFC001 / RepairProposal  
（`adapters/ortools-to-rfc001-repair.adapter.ts`）。平台权威仍走 Gateway + DecisionCore。

---

## 3. Constraint / Objective 语义目录

### 节点字段（MVP 真源）

| 字段 | 语义 |
|------|------|
| `timeWindows` / `fixedStartMin` / `lastEntryMin` | 时间窗与钉死开始 |
| `isBooked` / `isMandatory` / `canRemove` | 可删性与预约钉 |
| `canMoveDay` | 预留 M2；Routing MVP 忽略 |

### `SolverConstraint.kind`

| kind | 状态 | MVP 行为 |
|------|------|----------|
| `DEPOT_FIXED` | **implemented** | depot 锚 |
| `EDGE_FORBIDDEN` | **implemented** | hard arc 成本放大 / 禁跳 |
| `REPLACE_POOL` | **implemented** | REPLACE from→to |
| `TIME_WINDOW` / `FIXED_START` / `BOOKED_PIN` / `MAX_DAY_DRIVE_MIN` | **reserved** | 可出现在 wire；Routing MVP 可忽略（语义已在节点字段） |

### `SolverObjective.kind`

| kind | 状态 |
|------|------|
| `MINIMIZE_TRAVEL` | implemented（主目标） |
| `MAXIMIZE_PRESERVE_BASE` | emitted（软偏好 / lab） |
| `MINIMIZE_LATENESS` / `MINIMIZE_CHANGES` | reserved |

---

## 4. Response / Meta 诚实规则

| 字段 | v1 冻结值 |
|------|-----------|
| `status` | `SOLVED\|PARTIAL\|INFEASIBLE\|TIMEOUT\|ERROR` |
| `solverMeta.engine` | `OR_TOOLS_ROUTING` \| `OR_TOOLS_CP_SAT` |
| `solverMeta.nativeCpSat` | 仅真 `CpSolver` 可为 `true`；**Routing 路径必须 `false`** |
| `dayPlans[].nodeIds` | 平台 nodeId，禁止 Routing 内部 index |

**v1 不改 wire**：ADR 所提 `engine ∈ {routing\|cp_sat\|hybrid}` 与 `nativeCpSat` 派生化属 **@v2 演进**，不在本次 freeze 落地。

---

## 5. Non-goals（冻结边界）

- ❌ Authorization / Plan Version 写入  
- ❌ Continuous / Rolling Horizon  
- ❌ 假 MOVE_DAY、假 CP-SAT  
- ❌ 用 Solver 可行性替代 Constraint Gateway  
- ❌ 改写 `OptimizationProblem` 平台语义

---

## 6. Conformance（CI）

| 检查 | 位置 |
|------|------|
| schemaId + MVP ops + MOVE_DAY reject | Nest `solver/contracts` / mapper specs |
| Python Literals + gold `*.problem.json` 全量 validate | `python/solver/tests/test_ir_freeze.py` |
| `nativeCpSat === false` on Routing lab | gold replay / lab_signoff / client guard |
| ADR-008 gate | `npm run ci:ortools-adr008`（含 IR test） |

新 Solver 实现 **只** 消费本 IR；不得另开平行 wire。

---

## 7. Sign-off

| 项 | 值 |
|----|-----|
| Freeze owner | ADR-008 / Planning Engine |
| Authoritative promotion | **false** |
| Gold synthetic | 60/60 families（provenance 可演进，不破 schemaId） |
| Next after M1.5 | P2/P3 DONE；P4 MOVE_DAY 实现见 [MOVE_DAY_DESIGN_REVIEW](./MOVE_DAY_DESIGN_REVIEW.md) |
