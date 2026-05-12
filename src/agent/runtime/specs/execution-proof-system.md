# Execution Proof System（判定式 / 类型读法）

**Path:** `src/agent/runtime/specs/execution-proof-system.md`  
**性质：** **终局逻辑读法** — 不新增 TS、不扩张 ABI、不改变算子 **extension**；在 **`execution-algebra.spec.md` v1.1**、**`execution-category-model.md`**、**`execution-rewrite-system.md`** 之上，把 trace 核重写为 **带判定式的推导系统** 的 **presentation**。

**Next read:** 语法表面与 `eval` 映射 — `execution-dsl.md`（**无** 解析器实现）。

---

## §0. 核心转译

重写视角 **`(TR, →, NF)`** 可再 **收口**为：

**一个带判定规则的语义推导系统（judgment + rules）**

- **本文件的主域（Main domain）：** §16 **`OrchestrationExecutionTraceV1`** 及其 **canonical 像**（与 algebra / rewrite 文档一致）。
- **不自动等同：** `validateSemanticExecutionGraph` / timeline **黄金路径** 合法性 — 那是 **另一套** 项与规则（`NormalizedSemanticTimelineEvents`）；仅在 §5 **可判定性** 处 **并列** 指工程 **终止** 义务。

---

## §1. Judgment（判定式）

### 1.1 基础形式（抽象）

**`Γ ⊢ J`**

| 符号 | 读法（本 presentation） |
|------|-------------------------|
| **`Γ`** | **冻结的纯输入上下文**（ witness 的有限元组：例如 schema 版本、策略常量、**不含** 非确定 runtime 状态注入）。**不是** 把 Nest 容器塞进判断式。 |
| **`trace`** | **`ExecutionTrace`**（§16 切片） |
| **`ExecutionValid`** | **schema 合法** 且（可选地）满足在 **本文件** 中列出的 **侧条件**（见 §2） |

**具体判定形状（示例）：**

- **`Γ ⊢ trace : ExecutionValid`** — 「在上下文 `Γ` 下，`trace` 为 **可接受输入**」
- **`Γ ⊢ A ≡ B`** — 「在 `Γ` 下，`A` 与 `B` **语义相等**」（由 `normalize` 定义）

---

## §2. Derivation rules（推导规则）

以下规则 **只** 解释 **trace 核**；**侧条件** 与实现一致。

### R1. Normalization（规范化）

```
Γ ⊢ T : ExecutionValid
──────────────────────────────
Γ ⊢ normalize(T) : CanonicalForm
```

**读法：** 合法 trace 必可 **一步** 投影到 canonical（**总函数** `N`）。**CanonicalForm** 指 **`CanonicalExecutionTraceV1`**。

### R2. Equivalence（等价）

```
Γ ⊢ A : ExecutionValid    Γ ⊢ B : ExecutionValid
────────────────────────────────────────────────
Γ ⊢ A ≡ B
```

**侧条件（定义，非额外结构）：** **`A ≡ B`** **当且仅当** **`stableJson(N(A)) = stableJson(N(B))`**（与 algebra §2.2–2.3 同 extension）。

### R3. Composition（组合）

```
Γ ⊢ A : ExecutionValid    Γ ⊢ B : ExecutionValid
────────────────────────────────────────────────
Γ ⊢ A ⊕ B : ExecutionValid
```

**侧条件（v1 工程事实）：** **`A ⊕ B`** **有定义** 仅当 **`A ~ B`**（即 **`A ≡ B`** 在 trace 层读作 `~`）；否则 **无结论**（**部分**推导；与 `ExecutionCompositionKernel` 一致）。**禁止**无侧条件宣称 **总** 可组合。

### R4. Fixed point（不动点关系）

```
Γ ⊢ A : ExecutionValid    Γ ⊢ B : ExecutionValid
────────────────────────────────────────────────
Γ ⊢ FP(A, B)
```

**侧条件：** **`FP(A, B)`** **iff** **`A ~ B`**（§23 / algebra §2.4）。

**自反实例：** **`FP(A, A)`** 由 **`A ~ A`**（algebra L3）可得。

### R5.（可选）Schema 准入

```
────────────────────────────
Γ ⊢ T : ExecutionValid
```

**侧条件：** **`isOrchestrationExecutionTraceV1Schema(T)`** 为真（实现守卫）。非法 schema **不在** 主判断的 **可证** 域内（kernel 对 `~` / `FP` 返回假）。

---

## §3. Soundness（健全性 — 读法）

**陈述 A（保守、与实现一致）：**

若 **`Γ ⊢ T : ExecutionValid`**（R5 + 侧条件），则 **`N(T)`** 是 **良构** `CanonicalExecutionTraceV1`，且 **`stableJson(N(T))`** 为 **有限** 字符串。

**不声称（避免伪 soundness）：**「**任意** 可推导 `trace` **本身** **属于** `CanonicalExecutionTrace` 类型」— 对象 lives in **trace** 类型；**像** lives in **canonical**。

**陈述 B（与 `~` 对齐）：** 若 **`Γ ⊢ A ≡ B`**，则 **`N(A)`** 与 **`N(B)`** 作为 **canonical 值** **相等**（同一 **NF** 类）。

---

## §4. Completeness（完备性 — 读法）

**弱完备（tautological，真）：**  
对 **`Im(N)`** 中任一 **`C`**，存在 **`T`** 使得 **`N(T) = C`**（取 **`T`** 为 **任一** 原像 — 非空由 **`C ∈ Im(N)`** 定义）。

**强完备（非自动、证明义务）：**  
「**每一个** 语法上良型的 **`CanonicalExecutionTraceV1` 值** 都落在 **`Im(N)`**」— **需** 对类型 **inhabitant** 与 **构造函数** 做归纳，**本仓库不交付证明**。

---

## §5. Decidability（可判定性 — 工程保证）

在 **主域** 上，下列谓词在 **有限步** 内可计算（**纯函数 / 有界输入**）：

| 谓词 / 过程 | 终止依据 |
|-------------|----------|
| **`N(T)`** | 单次投影，无递归 |
| **`A ~ B`** / **`FP(A, B)`** | 字符串比较 |
| **`A ⊕ B`（若定义）** | 常数步 |
| **`validateSemanticExecutionGraph`（并行域）** | **实现** 须在有限事件集上终止 — **契约 / CI 义务**，**不是** 本判断式系统的形式定理 |

---

## §6. Execution type system（类型读法）

**（Presentation only — 非 TypeScript 子类型实现）**

| 记号 | 读法 |
|------|------|
| **`Trace`** | §16 `ExecutionTrace` |
| **`CanonicalTrace`** | **`CanonicalExecutionTrace`**；**可视为** `Trace` 经 **`N`** 的 **像类型**（**不**声称 TS nominal subtype） |
| **`ValidTrace`** | 满足 **R5** 的 **谓词** `ExecutionValid` |

**Typing（读法）：**

**`N : Trace → CanonicalTrace`**（总函数于 **合法 schema** 的 **工程定义域**；非法输入 **不** 进入 `~` / `FP` 的 **真** 分支。）

**Subtyping（读法）：**  
**`CanonicalTrace` ⊆ 某「可比较语义载体」** — 仅表示 **比较在 canonical 上进行**；**不** 自动推出 **`CanonicalTrace <: Trace`** 在 TS 里成立。

---

## §7. Full system collapse（一句统一）

**读法（压缩）：**

**Execution trace kernel ≅ 「在冻结 `Γ` 下，对 §16 trace 的 **可判定** 合法性、等价与（部分）组合所生成的推导闭包」**

**λ 记法（修辞）：** **`(λΓ. Γ ⊢ trace : ExecutionValid)`** — **非** 仓库内可执行项。

---

## §8. 四层 + 本层（稳定叠放）

| 层 | 角色 |
|----|------|
| **Runtime** | trace **生成** / 路由（**不** 进入判断式本体） |
| **Algebra / Category** | 算子与对象 presentation |
| **Rewrite** | **`→_norm`**、NF、合流 / 终止 **读法** |
| **Proof / Type（本文）** | **Judgment + rules + 可判定性叙事** |

---

## §9. 终局冻结（证明层）

**禁止**（否则 **sound / decidable** 叙事 **同时** 失效）：

- runtime **语义注入**判断式（非冻结 `Γ`）
- **自适应** typing / 规则
- **概率** validity
- **动态** 规则生成（无 spec bump）
- **学习式** validation 作为 **推导规则** 来源

---

## §10. 若再继续（真 · 理论外置）

- **Γ ⊢ trace : ValidExecution** 的 **完整** 证明论 / Kripke 语义  
- **Curry–Howard** 级别：trace **as** proof term  

**不在** 本仓库本轮交付内。

---

**文档 revision：** `2026-05-11`（初版；与 algebra v1.1、category、rewrite 文档对齐）。
