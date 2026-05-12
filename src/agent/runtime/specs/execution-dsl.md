# Execution DSL（语法表面 / 语义映射）

**Path:** `src/agent/runtime/specs/execution-dsl.md`  
**性质：** **语言层 presentation** — 不实现 lexer/parser/字节码；不把 Nest **替换**为「只有 normalize」；仅把 **`execution-proof-system.md`** / algebra / rewrite 中的概念 **语法化**，便于 **人读、机编（未来）** 与 **审计对齐**。

**完整 EPL 立场（程序=商点、`|=`、`⟦·⟧`）：** `execution-epl.md`。

**前置：** `execution-algebra.spec.md` v1.1 · `execution-category-model.md` · `execution-rewrite-system.md` · `execution-proof-system.md` · `semantic-validation-contract.md` §16–§23。

---

## §0. 核心转译

**判断式读法：**

`Γ ⊢ trace : ExecutionValid`

**表面语法（修辞性块）：**

```text
exec { … } : valid
```

**含义：** `exec { … }` 表示 **一个** 良构 **program 项**；`: valid` 表示在冻结 **`Γ`** 下 **可推导**（与 proof system §1 对齐）。**本仓库不** 提供 `exec` 的运行时解释器。

---

## §1. Language definition（语言本体）

**Execution DSL（抽象 BNF 片段）：**

```text
Program   ::= TraceLit | NormalizeExpr | ComposeExpr | EquivAssert | FixedPointAssert
TraceLit  ::= "trace" Block
NormalizeExpr ::= "normalize" "(" Program ")"
ComposeExpr   ::= "compose" "(" Program "," Program ")"
EquivAssert     ::= "assert" Program "≡" Program
FixedPointAssert ::= "assert" "fixedPoint" "(" Program "," Program ")"
```

**读法：** **λ-execution language with normalization semantics** — **仅** 指 **求值语义** 由 **`normalize` 到 NF** 主导；**非** 引入 λ 演算实现。

---

## §2. Core syntax（核心语法 — 与 §16 对齐）

### 2.1 Trace literal（v1 形状）

§16 **无** 自由 `events: [...]` 数组；**literal** 应 **同构** 于 `OrchestrationExecutionTraceV1` 的字段集：

```text
trace {
  schemaId: <const>
  version: <number>
  snapshot_id: <string>
  model_fingerprint: <hex>
  selected_execution_model_version: <string>
  selection_reason: <enum>
  runtime_hint: <string | null>
  route_decision_path: { task_type, route_policy_resolved, intent_mode_*? }
}
```

**禁止：** 在 **未 bump §16 ABI** 的前提下向 literal **注入** 未定义字段（否则 **不是** 当前 `ExecutionTrace`）。

### 2.2 Normalize expression

```text
normalize(T)
```

### 2.3 Composition

```text
compose(A, B)
```

**语义：** **即** algebra 之 **`A ⊕ B`**（**v1**：**仅** 在 **`A ~ B`** 时有 **值**；否则 **stuck / undefined** — 与 `ExecutionCompositionKernel` 一致）。

### 2.4 Equivalence assertion

```text
assert A ≡ B
```

### 2.5 Fixed-point assertion（二元）

```text
assert fixedPoint(A, B)
```

**注意：** 实现中 **`FP`** 为 **对** 谓词；**无** 单参 `fixedPoint(A)`（与 proof system §2 R4 一致）。

---

## §3. Semantic mapping（语义映射）

| DSL 表面 | Algebra | Rewrite | Proof / Type |
|----------|---------|---------|----------------|
| `normalize(x)` | **`N(x)`** | **`x →_norm NF(x)`** | **R1** |
| `compose(A,B)` | **`A ⊕ B`**（侧条件 **`A ~ B`**） | 读作 **join 后** **`→_norm`**（v1 平凡） | **R3** |
| `assert A ≡ B` | **`A ~ B`** | **同 NF** | **`Γ ⊢ A ≡ B`** |
| `assert fixedPoint(A,B)` | **`FP(A,B)`** | **同 NF** | **`Γ ⊢ FP(A,B)`** |

---

## §4. Execution semantics（求值 — 读法）

**Evaluation（部分）：**

- **`eval(trace_lit)`** `=` **`N(trace_lit)`**（**合法** literal 前提）
- **`eval(normalize(T))`** `=` **`N(eval(T))`**（**纯** 组合；**无** 隐式 IO）
- **`eval(compose(A,B))`** `=` **`N(A ⊕ B)`** **若** `A ⊕ B` **有定义**；否则 **无值**（**stuck**）
- **`eval(assert A ≡ B)`** `=` **真** **iff** **`stableJson(N(A)) = stableJson(N(B))`**

**Assertion** 不产生 **trace** 值；产生 **Bool**（或 **typing / judgment** 侧效应 — **presentation**）。

---

## §5. 「Normalization is the runtime」（DSL 语义世界内）

**仅在本 DSL 的 *semantic model* 内：**

**一次「程序」的运行** = **一次到 NF 的归约**（**`→_norm`** 主导）。

**工程边界：** 真实 **route_and_run**、replay deps、ledger **不** 由此文件删除；此处 **只** 定义 **若** 把 **可比较核** 投影到 §16 trace **则** **比较语义** 由 **`N` + `stableJson`** 锚定（与 rewrite §3 诚实边界一致）。

---

## §6. Language properties（继承上层 — 不夸大）

| 性质 | 在 DSL 模型中的读法 |
|------|---------------------|
| **Deterministic** | **`N`** 与 **`stableJson`** 确定 |
| **Confluent（弱）** | **仅** `→_norm` 链：一步到范，**无** 分叉（同 rewrite §3.1） |
| **Terminating** | **`normalize`** 无递归展开 |
| **Type-safe（承接）** | **well-typed literal** ⇒ **schema 合法**；**不** 自动蕴含 timeline 黄金路径 |

---

## §7. System collapse（一句）

**Execution DSL（presentation）** `=` **`(Syntax, Eval, Normalize, Equivalence)`**  
其中 **`Eval`** **以** **`N`** **为核心**，**`Equivalence`** **由** **`stableJson ∘ N`** **定义**。

---

## §8. 叠层对齐（五层）

| 层 | 角色 |
|----|------|
| **Runtime** | 物理执行与物化 trace（**DSL 不替换**） |
| **Algebra** | **`N`, `~`, `⊕`, FP** |
| **Rewrite** | **`→_norm`, NF** |
| **Type / Proof** | **`Γ ⊢ …`** |
| **DSL（本文）** | **`trace {…}`, `normalize`, `compose`, `assert`** |

---

## §9. 终局冻结（语言级）

**禁止：**

- runtime **语义注入** DSL 规则
- **动态** 规则生成（无 ABI + algebra + 本文 bump）
- **自适应** normalize
- **概率** 执行 / **ML** 解释 DSL

否则：**表面语法** 与 **底下代数** **脱钩**，**不再构成语言**。

---

## §10. Compiler view（终点之后 — 非承诺）

**叙事管线（未来若实现编译器）：**

`DSL source → Canonical Trace (NF) → (optional) Execution Graph / Observable`

**当前：** **无** 源码编译器、**无** artifact 格式；仅 **预留** 映射表 §3。

**工程管线（目标 vs 现状）：** `execution-compiler-architecture.md`。  
**反向闭环：** `execution-reverse-compiler.md`（`RC(obs)`、代表元选择）。

---

**文档 revision：** `2026-05-11`（初版）。
