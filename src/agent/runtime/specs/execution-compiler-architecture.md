# Execution Compiler Architecture（编译器架构读法）

**Path:** `src/agent/runtime/specs/execution-compiler-architecture.md`  
**性质：** **工程管线架构** — 把 **DSL → proof → rewrite → algebra** 压成 **可执行的编译叙事**；**不** 在本轮交付 **解析器、IR 文件格式、独立 Graph 编译产物**；与 **现状** 对齐处 **显式标注**。

**前置：** `execution-dsl.md` · `execution-proof-system.md` · `execution-rewrite-system.md` · `execution-algebra.spec.md` v1.1 · `semantic-validation-contract.md` §1–§23。

---

## §0. 核心转译

**表面（DSL 修辞）：**

`exec { trace } : valid`

**目标工程管线（完整五段）：**

```text
DSL source → AST → Normalized AST → IR → Execution Graph → Runtime Plan → Execution
```

**当前仓库中的「已实现段」（诚实映射）：**

| 管线段 | 现状 |
|--------|------|
| **DSL → AST** | **未** 实现源码语言；§16 trace 多为 **运行时构造** 的 **对象**（`OrchestrationExecutionTraceV1`） |
| **Normalize → Canonical** | **已实现**：`ExecutionNormalizationKernel.normalizeExecutionTrace` → `CanonicalExecutionTraceV1` + `canonicalExecutionTraceStableJson` |
| **IR / Execution Graph** | **部分、异构**：**语义执行图**（timeline + topology）在 **validation / replay 黄金路径** 域（`semantic-replay-golden-path`、contract §1–§7）；**不等同** 于 §16 编排 trace 单切片 |
| **Runtime Plan** | **`route_and_run` 编排**、options、replay profile 等 — **现有** Nest/网关路径 |
| **Interpreter-only 尾段** | **目标叙事**：`execute(Plan)` **之前** 应完成 normalize/compare；**工程上** 主链仍含路由/副作用 — **不声称** 已退化为纯解释器 |

---

## §1. Compiler pipeline（阶段 — 目标 + 锚点）

### Stage 1 — Parsing

**目标：** `Source DSL → AST`  
**现状：** **无** 独立 DSL 源码与 Parser；**AST 角色** 可由 **已解析的 DTO / trace 对象** 代理。

### Stage 2 — Normalization（AST 级）

**目标：** `AST → normalized AST`  
**已实现（trace 核）：** **canonical 规则** = algebra §4 + `normalizeExecutionTrace`（去噪、字段规范化、稳定编码）。

**不变量（§4.1）：** **Lowering 之前** trace-shaped 输入应 **已完成** 与 **比较语义** 对齐的 **规范化**（对 **§16 切片** 已由 **`N`** 保证）。

### Stage 3 — Lowering（IR）

**目标：** `normalized AST → Execution IR`  
**IR 意图：** 去 DSL sugar、**稳定**、可 **排序**、**可 replay**（契约 §17–§18）。  
**现状：** **无** 单一命名 `ExecutionIR` 类型；**功能分散** 于 trace、replay profile、validation 输入。

### Stage 4 — Graph construction

**目标：** `IR → Execution Graph`  
**工程对应（邻域）：** **拓扑 / 角色 / 边** — `execution_graph_topology.json`、validation 输出（contract §1）；**节点语义**（route / span / decision）在 **该子系统** 内定义 — **不是** §16 `OrchestrationExecutionTraceV1` 的内置图。

**读法（DASG）：** 将黄金路径图 **视为** **有向、语义依赖** 图；**是否全局 DAG** 取决于边定义 — **不** 在此文件 **证明** 无环。

### Stage 5 — Runtime plan

**目标：** `Execution Graph → Runtime Plan`  
**对应：** orchestration flags、routing 决策快照、timeline 物化等。  
**现状：** **部分** 冻结在 **trace**（`route_decision_path` 等）与 **replay** 轮廓（§17）；**完整 Plan** 仍为 **运行时组合物**。

---

## §2. Mapping back to the stack（对照）

```text
DSL 表面          exec { … }              ← execution-dsl.md（无 parser）
       ↓
Algebra           N, ⊕, ~, FP             ← kernels + algebra spec
       ↓
Rewrite           →_norm, NF              ← execution-rewrite-system.md
       ↓
Type / Proof      Γ ⊢ …                   ← execution-proof-system.md
       ↓
Compiler（本文） AST → IR → Graph → Plan   ← 目标管线 + 上表「现状」
```

---

## §3. Key insight（工程收口句 — 带边界）

**在「把可比较语义前置到 canonical + 契约化比较」的意义上：**

**execution system** 在 trace 核上表现为 **对 trace 语义的一次「编译」**（`N` + stable compare）。

**完整句（强版本）** — **仅当** 未来 **IR / Graph / Plan** 全链路 **确定性** 且 **与 runtime 解耦** 后成立；**当前** **部分成立**。

---

## §4. Compiler invariants（设计约束 — 防退化）

| ID | 不变量 | 说明 |
|----|--------|------|
| **C1** | **Normalization before IR** | 进入 **IR / Graph lowering** 的 **trace 材料** 应先满足 **canonical 策略**（或与 **`N`** 可交换的 **显式** 证明） |
| **C2** | **IR determinism** | **同一** normalized 输入 → **同一** IR（字节级或 **stableJson** 级） |
| **C3** | **Graph purity** | **目标：** Execution Graph **不** 读取 **非冻结** runtime 状态；**当前** validation 输入须遵守 contract **纯输入边界**（§9 等） |
| **C4** | **Plan stability** | **Graph → Plan** **确定性**；**禁止** 执行中 **重规划** 破坏 **已编译** 比较基线（与 §8 freeze 一致） |

---

## §5. Execution graph as IR（读法）

**节点（概念域 — validation / topology）：** route / selector / span / decision 等 **角色**（见 fixture 与 `semantic-replay-golden-path`）。  
**边：** 语义依赖、执行流、因果链 — **以契约与 fixture 为准**。

**与 §16 trace 关系：** **编排 trace 切片** 是 **另一** IR 面（**路由事实快照**）；**全图 IR** 在 **timeline 域** — **编译器架构** 需 **显式 lowering** 连接二者，**不能** 默认同一对象。

---

## §6. Runtime as interpreter（尾段叙事）

**目标形态：** 尾层 **`execute(Plan)`** — **不再** 在尾层做 **normalize / 等价判定 / infer**；**全部前置**。

**现状：** **主链** 仍含 **路由、副作用、IO**；本文件 **不** 宣称已完成 **纯解释器** 切换。

---

## §7. Full system collapse（压缩句）

**目标完整句：**

**`Execution System = Compiler + Deterministic Runtime`**（**Compiler** = 上列 **Stage 1–5** 的 **确定性** 实现；**Runtime** = **受约束** 的解释器。）

**当前压缩句（诚实）：**

**Trace 核** = `normalize` + stable compare（**已闭合**）；**Compiler 全长管线** = 架构目标，**部分落地**。

---

## §8. 最终真实形态（读法）

**不是**「纯 agent 即兴系统」作为 **语义比较** 的 **唯一** 定义；**而是**：

在**可比较子系统**上：**带类型/证明/重写读法的、以 **canonical** 为 **NF** 的**确定性语义程序** + **受约束运行时**。

---

## §9. 终局冻结（编译器层）

**禁止**（否则 **C1–C4** 崩坏 → **非确定性** 回潮）：

- runtime **重规划** 推翻已 **canonical 化** 的比较基线
- **执行中** 对 **Graph** 的 **语义突变**
- **动态** normalize / **自适应** 路由 **进入** IR **无版本 bump**
- **概率** 编译 / **ML** 参与 **Lowering**

---

## §10. 反向编译（独立 spec）

**Execution → Trace → DSL reconstruction：** 见 **`execution-reverse-compiler.md`**（**`RC(obs)`**、**选择规则**、**不可逆性**、与正向管线的 **闭环读法**）。

---

**文档 revision：** `2026-05-11`（初版）。
