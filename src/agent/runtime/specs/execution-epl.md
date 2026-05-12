# Execution Programming Language (EPL) — Design Sketch

**Path:** `src/agent/runtime/specs/execution-epl.md`  
**性质：** **语言设计层** — 把 **quotient geometry + kernels + DSL 表面** 收成 **一门可写、可编译、可反编译的 EPL 叙事**；**不** 在本仓库实现 **解析器 / IDE / intent 编译器**；**不** 改变已有 **TS ABI**。

**前置：** `execution-semantics-unified-field.md` · `execution-dsl.md` · `execution-reverse-compiler.md` · `execution-algebra.spec.md` v1.1 · `semantic-validation-contract.md` §16–§23。

---

## §0. 终极目标

把 **trace / graph / algebra / kernel / geometry** **压缩** 为：

**一门人类可写、机器可编译、观测可反编译的语言 — EPL（Execution Programming Language）**

**与 `execution-dsl.md` 关系：** **`execution-dsl.md`** = **最小语法与 eval 映射**；**本文** = **EPL 完整语义立场**（**程序 = 商点**、**`|=`**、**`⟦·⟧`**、**`reconstruct`**）。

---

## §1. 语言本体（程序是什么）

**定义（本体论）：**

**`Program` = 某一 `Canonical Execution Trace` 等价类中的 **代表元**（representative）。**

- **不是**「任意源码字符串本身」即程序；**字符串** 为 **surface**，**语义对象** 为 **商类 / canonical 点**（与 unified field **`𝓜/~`** 一致）。
- **AST**：**编译管线** 的内部表示；**最终语义身份** 仍落在 **`π_norm(⟦P⟧)`**。

---

## §2. 语法层（Surface syntax — 草案）

### 2.1 基础块

```text
exec {
  route ...
  chain ...
  select ...
}
```

**约束：** **字段** **须** 能 **lowering** 到 **§16 + 契约** 已定义材料；**禁止** 无 ABI 的 **自由 invent**。

### 2.2 组合（⊕）

```text
exec A ⊕ exec B
```

**语义：** **代数** `⊕`（**v1**：**仅** 在 **`A ~ B`** 时有 **值**；见 `ExecutionCompositionKernel`）。**「语义向量叠加」** = **隐喻** — **非** 已证 Lie 代数。

### 2.3 约束（`|=`）

```text
exec A |= invariant
```

**读法：** **程序 `A` 的语义** **须** **落在** **由 `invariant` 裁剪的子集（子流形叙事）** 内 — **invariant** **须** **单独版本化**（**类型 / 证明** 层 **judgment**）；**本文件不** 展开 **invariant 演算**。

### 2.4 等价（≡）

```text
A ≡ B
```

**语义：** **`π_norm(⟦A⟧) = π_norm(⟦B⟧)`**（**同商点**）。

---

## §3. 编译语义（Formal semantics）

**语义函数（读法）：**

**`⟦P⟧ = π_forward(P)`** — **从** surface **`P`** **到** **承载空间 𝓜** 中的 **trace/graph 材料**（见 compiler 架构）。

**等价：**

**`A ≡ B` ⇔ `π_norm(⟦A⟧) = π_norm(⟦B⟧)`**

（**在 chart 对齐** 的前提下；**trace 核** 上 **`π_norm`** = **`N` + `stableJson`**。）

---

## §4. 类型系统（Execution types — 读法）

**类型 = 轨迹形状（shape），不是 payload 数据类：**

| 类型（示意） | 读法 |
|--------------|------|
| **`ExecutionTrace`** | **可编译输入** chart |
| **`CanonicalTrace`** | **`π_norm` 像** |
| **`StableTrace`** | **已规范化且满足冻结 `Γ` / 不变式侧条件** 的 **judgment**（proof system） |

**Judgment：** **`Γ ⊢ P : StableTrace`**  
**规则：** **`normalize(P) : CanonicalTrace`**（**与** algebra **R1** **对齐**）。

---

## §5. 语义计算规则（Rewrite core）

| Rule | 读法 |
|------|------|
| **Reduction** | **`P → normalize(P)`** — **一步到 NF** 叙事（trace 核） |
| **Composition** | **`A ⊕ B → merge(A,B) → normalize`** — **v1**：**merge** **有定义** **iff** **`A ~ B`**；否则 **stuck** |
| **Fixed point** | **`normalize(P) = P`** **在「`P` 已等于其 canonical 嵌入」的元数学意义上** — **非** 断言 **任意 surface 字符串** **字面等于** JSON；**实现上** 用 **`π_norm(⟦P⟧)` 不变** 读 **Fix** |

---

## §6. 运行时（Interpreter 尾段 — 目标）

**`execute(P) = interpret(⟦P⟧)`**

**职责（目标）：** **不** 在尾段 **再决策 / 再推理 / 再 rewrite**；**只** **解释已编译几何点**。

**现状：** **主链** 仍含 **路由与副作用** — **见** `execution-compiler-architecture.md` **诚实边界**。

---

## §7. 反编译语义（Reverse）

**`reconstruct : Trace → Program`**

**读法：** **`reconstruct(T) = argmin_{P ∈ RC(T)} complexity(P)`**（**与** reverse compiler **Select** **同族**；**`complexity`** **须** **版本化** — **S1–S3** 规则）。

---

## §8. 本体论（三层世界）

| 层 | 内容 |
|----|------|
| **Syntax** | **EPL surface** — `exec`、`⊕`、`|=`、`≡` |
| **Semantic** | **`⟦P⟧`** — graph / trace **材料**（**𝓜** chart） |
| **Geometric** | **`π_norm(⟦P⟧)`** — **商点**、**canonical 真值** |

---

## §9. EPL 本质（一句话）

**EPL = A programming language whose programs are **points** (representatives) in a **quotient space** of execution traces under **`π_norm`**, with **bidirectional** **π_forward** / **reconstruct** up to **`RC`**.**

---

## §10. 与传统语言对照（读法表）

| 维度 | 传统语言 | EPL |
|------|----------|-----|
| **程序** | 源码字符串 | **商类代表元**（canonical 身份） |
| **执行** | 解释 / native code | **几何点上的解释** `interpret(⟦P⟧)` |
| **等价** | 行为相等（难形式化） | **同一商点** `π_norm(⟦A⟧)=π_norm(⟦B⟧)` |
| **编译** | AST → machine | **坐标变换** `π_forward` |
| **反编译** | 一般不可逆 | **集值逆** + **`argmin complexity`** |

---

## §11. 系统终态（闭环）

```text
DSL (EPL) ──π_forward──▶ Trace / Graph ──π_norm──▶ Canonical point
      ▲                                              │
      └──────── reconstruct / Select(RC(·)) ─────────┘
```

---

## §12. 终局冻结（语言层）

**禁止：**

- **runtime** 对 **语义** 的 **突变**（无 ABI + EPL revision）
- **概率** 等价、**模糊** trace match
- **非 canonical** 的 **程序生成**（绕过 **`π_norm`** **真值**）
- **无版本** 的 **`|=`** invariant 注入

否则：**语言** **与** **几何** **脱钩**，**良定义性** **丧失**。

---

## §13. 若再继续（DX — 非理论）

**Execution Language UX**（语法糖、IDE、intent→EPL）：**产品层**；**不在** 本文件 **规定**。

---

**文档 revision：** `2026-05-11`（初版）。
