# Execution Reverse Compiler（反向编译 / 反射层）

**Path:** `src/agent/runtime/specs/execution-reverse-compiler.md`  
**性质：** **终局闭环读法** — 从 **可观测物**（trace / graph / timeline）**朝向** DSL **程序** 的 **重构规范**；**不** 在本仓库实现完整反编译器；**不** 声称 **全局双射**（见 §2）。

**前置：** `execution-compiler-architecture.md`（正向管线）· `execution-dsl.md` · `execution-algebra.spec.md` v1.1 · `semantic-validation-contract.md` §1–§23。

---

## §0. 核心目标

**正向（已有叙事）：** `DSL → … → Runtime → Trace/Graph/Timeline`  
**反向（本文）：** **`Observation → … → DSL program`**

**缺口闭合（逻辑上）：** 在 **同一 canonical 语义类** 上，允许 **从观测反推「等价类中的程序表示」**；**不** 要求 **唯一** 源码字符串。

---

## §1. Reverse pipeline（反向管线 — 目标阶段）

| Stage | 名称 | 输入 / 输出（目标） |
|-------|------|----------------------|
| **R1** | **Runtime capture** | `Execution Plan` + **runtime trace 材料**（graph 快照、route 决策、chain spans、`SemanticModelSnapshotDescriptor` 等） |
| **R2** | **Graph normalization** | Runtime graph → **Canonical Execution Graph**（去 timing / latency / 噪声事件；**语义角色** 对齐） |
| **R3** | **IR reconstruction** | Canonical graph → **Execution IR**（routing / decision / composition 边） |
| **R4** | **AST rehydration** | IR → **DSL AST**（`exec` 块、`compose`、`route`、normalize 意图等） |
| **R5** | **DSL synthesis** | AST → **`exec { … }` 文本**（或等价 **canonical program 表示**） |

**与正向 `N` 的关系：** R2 是 **「在图 / timeline 域上的规范化投影」** 的 **读法**；**≠** 单一代码路径上已有的 **`normalizeExecutionTrace`（§16 切片）** — **若** 要 **统一**，需 **显式** lowering / 遗忘函子（**证明义务**）。

**现状：** **无** 自动化 R1–R5 工具链；**人工** 可由 trace + 契约 **对照** DSL 文档 **重构**。

---

## §2. Fundamental constraint（不可逆性）

**确定性正向** **不蕴含** **唯一反向：**

- **`Forward`**（编译 + 运行）在 **实现域** 上可 **设计为** **确定性**（见 compiler 架构 §4）。  
- **`Reverse`**（观测 → DSL）在 **信息论** 上一般为 **欠定**：**多** 个 DSL 程序可 **产生** **同一** 可观测 **canonical 类**。

**因此必须引入重建类（set-valued inverse）：**

**`RC(obs) = { P : P 为 DSL 程序 且 Forward(P) 与 obs 落在同一 canonical 比较类上 }`**

其中 **「同一 canonical 比较类」** 在 **trace 核** 上 = **同一 `stableJson(N(trace))`**（若 obs 已 **嵌入** §16 trace）；**图 / timeline** 域需 **各自** 的 **NF** 定义（**不得** 偷换）。

---

## §3. Reconstruction objective（目标）

**不求** **唯一** DSL **`P`**。  
**求：** 在 **`RC(obs)`** 内选取 **一个** **规范的、可审计的** **代表元** **`P★`**（**best canonical representative** 的 **工程含义** = **在显式 tie-break 下唯一**）。

---

## §4. Selection rules（打破多义 — 确定性 **选择**）

在 **`RC(obs)` 非空** 且 **已能在 AST 上定义全序** 的前提下，**示例** tie-break（**须** 版本化写入 spec，**禁止** 隐式启发式）：

| Rule | 意图 |
|------|------|
| **S1** | **最小 AST 规模**（节点数 / 深度字典序） |
| **S2** | **最少** `compose` / `⊕` **出现次数** |
| **S3** | **与** 观测中 **route_selector 序**（若存在稳定编码）**对齐** |

**结论：** **`P★`** 由 **`(obs, Γ, RuleVersion)`** **唯一** 确定 **iff** **`RC` 有限且全序完备** — **一般** **需** **限制语言子集** 或 **有界搜索**；**否则** **仅** 保证 **存在性** 叙述。

---

## §5. Reverse fixed point（观测可逆性 — 读法）

**理想等式（修辞）：**

`P ≈ RC(Forward(P))` 中选取的 **`P★`**

**严格读法：**  
**`P ∈ RC(Forward(P))`**（**自反类非空**）且 **`Select(RC(Forward(P))) = P`** **当** **`P` 已是** **该规则下的** **canonical program 形**。

**`DSL = Reverse(Forward(DSL))`（逐字等式）** **仅** 在 **正向投影** 与 **选择规则** **共同冻结** 且 **`P` 在像上** 时成立 — **非** 恒真。

**观测可逆（observationally invertible）** **定义（弱）：** 存在 **确定性** **`Select ∘ RC ∘ Obs`** 使得 **在契约化观测域上** **`Forward(P★)` 与 obs 同 NF**。

---

## §6. Observability as source of truth（读法）

**在反编译叙事下：** **可观测 trace / graph** 是 **「源码材料」** 的 **载体** — **不是** 把 **任意** 日志行当作 DSL；**须** **先** **规范化到 NF** 再进入 **`RC`**。

**与工程：** 现有 **structured trace**（§16）、validation **输出**、ledger **描述符** — **不同** **粒度**；**反编译** **须** **声明** **以哪一层 NF 为主**。

---

## §7. Full system closure（闭环图）

```text
正向：  DSL ──Forward──▶ … ──▶ Trace / Graph / Timeline
反向：  Observation ──Reverse──▶ DSL′  ∈ RC(obs)
闭环：  DSL ≈ Select(RC(Forward(DSL)))   （在规则 P★ 下读作「代表元一致」）
```

---

## §8. 系统形态（三重对偶 — 读法）

| 方向 | 角色 |
|------|------|
| **1. 正向生成** | DSL → execution |
| **2. 等价归约** | execution → **NF**（`N` / graph-normalize） |
| **3. 反向重建** | observation → **DSL 代表元** |

**完整句（目标）：**

**`Execution System ≈ Forward Compiler + Deterministic Runtime + Reverse Synthesis (Select ∘ RC)`**

**现状：** **Forward 核（trace `N`）** **已**；**Reverse 自动化** **未**。

---

## §9. 终局冻结（反向层）

**禁止**（否则 **Select ∘ RC** **失去** **可审计确定性**）：

- **概率** 重建 / **随机** tie-break
- **无版本** 的 **多 DSL 歧义注入**（多套并行 `Select`）
- **runtime 依赖** 的 **反向推断**（未进入冻结 `Γ` / 契约材料）
- **ML 合成 DSL** **与** **核心 `Select`** **混层**（除非 **显式分离** 且 **不声称** 为 **唯一真值**）

---

## §10. 一句话（终局）

**读法：** **在 canonical 语义上，执行系统可呈现为：带规范化编译、受约束运行、以及（规范化的）反向代表元合成的双向语言。**

**非声称：** 全系统已实现 **全自动** **双射** **编译/反编译**。

---

## §11. 若再继续（信息几何 — 工程外）

**Execution as information geometry**（metric / manifold 统一 trace、DSL、graph、等价）— **纯理论**；**不在** 本仓库展开。  
**统一场读法（几何 presentation）：** `execution-semantics-unified-field.md`。

---

**文档 revision：** `2026-05-11`（初版）。
