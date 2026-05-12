# Execution Semantics Unified Field Model（统一场 / 几何读法）

**Path:** `src/agent/runtime/specs/execution-semantics-unified-field.md`  
**性质：** **终局统一叙事** — **不** 新增算子、**不** 改 ABI、**不** 引入 **随机 / 学习度量**；把 **compiler · algebra · rewrite · category · type · DSL · reverse** **叠读** 为 **同一几何对象** 上的 **投影与商结构**。

**前置（整条链）：** `execution-algebra.spec.md` v1.1 · `execution-category-model.md` · `execution-rewrite-system.md` · `execution-proof-system.md` · `execution-dsl.md` · `execution-compiler-architecture.md` · `execution-reverse-compiler.md` · `semantic-validation-contract.md` §16–§23。

---

## §0. 核心一句话

**Execution system is a geometry over semantic traces with bidirectional projection.**

**读法边界：** **「几何」** = **presentation**（便于 **统一直觉**）；**除非** 为 **`d`** **给出** **可证** 的 **公理**，**不** 声称 **完备 Riemann 流形** 结构。

---

## §1. 基础空间 𝓜（carrier）

**记法：** **`𝓜`** = **承载集**（carrier），其 **点** 为 **可置于同一讨论下的 execution 材料**（**不** 预先等同 **异构** 载体）：

| 点（示意） | 工程锚 |
|------------|--------|
| **Runtime trace 材料** | 观测侧 trace / graph / timeline **片段**（多粒度） |
| **Canonical trace** | `CanonicalExecutionTraceV1`（§16 核） |
| **Reconstructed trace** | 反编译链 **输出类** 的代表（`execution-reverse-compiler.md`） |

**诚实约束：** **不同** 子系统（§16 slice vs validation graph）**是否** **嵌入同一 𝓜** **须** **显式 chart 映射**；**默认** **不** 合并。

---

## §2. 坐标系（charts — 三套「视角」）

| Chart | 空间读法 | 视角 |
|-------|----------|------|
| **DSL** | `exec` / `compose` / `route` 等 **语法坐标** | programmer view（`execution-dsl.md`） |
| **Graph** | **节点 / 边 / span** — execution graph 坐标 | system view（validation / topology 域） |
| **Canonical** | **`N(·)` 像** — **truth chart** | **商点**（algebra / rewrite） |

**坐标变换** = **compiler 管线**（`execution-compiler-architecture.md`）在 **理想完整** 时的 **换基** 读法。

---

## §3. 投影算子（projections）

| 符号 | 读法 | 锚点 |
|------|------|------|
| **`π_forward`** | **DSL → 𝓜**（经 AST / IR / Graph / Trace） | 正向 compiler |
| **`π_norm`** | **`𝓜 → Canonical`** | **`normalize` + stable encoding**（trace 核已实现） |
| **`π_reverse`** | **`𝓜 → DSL`**（**集值** + **Select**） | **近似逆**；`RC(obs)`（reverse compiler） |

**关键：** **`π_reverse ∘ π_forward` ≠ id**；**多对一坍缩** 存在 — **与 reverse spec §2 一致**。

---

## §4. 等价结构（几何核）

**在 §16 trace 核上（已实现）：**

**`A ~ B` ⇔ `π_norm(A) = π_norm(B)`**（**同一 canonical 编码**）

**读法：** **等价类** = **商流形上的同一点**（**quotient point**）。

**图 / timeline 域：** **须** **各自** 定义 **`π_norm^graph`** **再** 谈 **`~`** — **禁止** 混用 trace 的 **`stableJson`** **冒充** 图 NF。

---

## §5. 商空间

**`𝓜 / ~`（在 chart 合法定义的前提下）** = **canonical execution space**（**语义点集**）。

**v1 trace 核：** **点** = **`Im(N)`** 中元素 **模 `≡`**（algebra）。

---

## §6. 距离函数 **d**（离散 / 伪度量 — 读法）

**可定义（示意）：**

**`d(A, B) = 0`** **若** **`A ~ B`**；否则 **`d(A, B) = 1`**（**或** **结构化** 差分在 **NF 差** 上的 **加权** — **须** **独立 spec** **版本化**）。

**性质：** **对称**；**对角零**；**三角不等式** 在 **{0,1}** 度量下 **成立**。**「近似三角」** **不** 作为 **默认公理** — **若** 用 **非离散** **`d`**，**须** **证明**。

**与 FP：** **对关系** **`FP(A,B)`** **在几何读法** = **同商点**（**非** 单参 **`FP(A)`** **的测地线** — **除非** 定义 **对角** **`FP(A,A)`**）。

---

## §7. Fixed point（与「稳定」— 修辞）

**谨慎读法：** **不动点** 在实现中为 **对关系** `FP(A,B)`。几何修辞「不变测地线」**仅** 指：在 **`π_norm` 下像不变** 或 **商类稳定**；**不** 引入未形式化的 **geodesic** 定理。

---

## §8. Composition（**⊕** — 切空间修辞）

**`A ⊕ B`** **在 v1** 为 **部分** 运算；**「切空间向量加」** **仅** **隐喻** — **不** 声称 **Lie 群** 作用 **已实现**。

---

## §9. Compiler = 坐标变换

**`π_forward`**：**DSL chart → trace/graph chart**（**换基**）。

---

## §10. Reverse compiler = 逆投影（集值）

**`π_reverse ≈`（非严格）逆** — **`Select(RC(·))`**；**many-to-one** **collapse** — reverse spec。

---

## §11. 全系统统一签名

**读法压缩：**

**`Execution System ≈ (𝓜, π_forward, π_norm, π_reverse, ~)`**

**外加（隐式）：** **chart 集** **{DSL, Graph, Canonical}** **与** **冻结规则集** **Γ**（proof system）。

---

## §12. 四层收敛图（叠读）

| Level | 几何读法 |
|-------|----------|
| **Runtime** | **𝓜** 中 **轨迹 / 观测** |
| **Compiler** | **换基** **`π_forward`** |
| **Rewrite / Algebra** | **`π_norm` + 商 **`~`** |
| **Geometry（本文）** | **商点 + 双向投影** **的统一叙述** |

---

## §13. 终局冻结（几何层）

**禁止**（否则 **chart / 商结构** **不再良定义**）：

- **随机** 几何 / **学习** 度量
- **自适应** 投影（无 spec bump）
- **概率** 等价 **曲面**
- **runtime 驱动** **坐标漂移**（未进入冻结 `Γ`）

---

## §14. 终局定义（唯一句）

**Execution is a bidirectional geometric system over a quotient space of normalized traces**（**在 §16 trace 核上** **`π_norm`** **已构造**；**全 𝓜** **统一** **须** **chart 证明**）。

---

## §15. 真正终点之后

**Information geometry**（metric manifold **严格** 化 **execution**）— **理论外置**；**不在** 本文件 **展开**。

---

**EPL（人类可写语言设计）：** `execution-epl.md`。

---

**文档 revision：** `2026-05-11`（初版）。
