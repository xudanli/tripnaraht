# Execution Category Model（范畴视角）

**Path:** `src/agent/runtime/specs/execution-category-model.md`  
**性质：** **纯解释层** — 不重写算子语义、不新增 API、不改变 `execution-algebra.spec.md` v1.1 中已冻结的定律；仅把同一套结构用 **可组合语言** 再叙述一遍，便于迁移与对外对齐。

**前置：** 实现与形式规则以 **`execution-algebra.spec.md` v1.1** 与 `semantic-validation-contract.md` §16–§23 为准。

**Related:** 重写 / 范式 / 合流 / 终止的 **TRS 读法** — `execution-rewrite-system.md`；判定式 / 推导 / 可判定性 — `execution-proof-system.md`；DSL 表面 — `execution-dsl.md`（同样 **零代码**）。

---

## §0. 核心转译（Category View）

在 **解释层** 上，可把当前 **trace 代数闭包** 记为：

**Execution trace kernel ≅ 一个小型范畴 𝓔（presentation）**

- **对象**侧：以 **标准形** 为「点」；**态射**侧：以 **保等价类的可组合变换** 为箭头（见 §1–§4）。
- 下文的 𝓔 **不是** 指整个 Nest / runtime 大系统，而是 **§16 编排 trace + normalize + ~ + FP + ⊕（v1 部分定义）** 所张成的 **语义子宇宙**。

---

## §1. Objects（对象）

**建议记法：** `Obj(𝓔) = CanonicalExecutionTrace`（实现类型：`CanonicalExecutionTraceV1`）

- **直觉：** `normalize(T)` 的像 = 范畴里的 **一个对象**；同一 `stableJson` 的等价类 = **同一个点**（与 `~` 的商一致）。
- **注意：** 工程上仍从 `ExecutionTrace` 输入；范畴 presentation 以 **canonical 为对象** 时，**遗忘函子**方向是 `U : Obj(𝓔) ↪` 输入侧材料，由 `normalize` 给出 **左伴**式投影（读法即可，不必在 TS 里实现范畴库）。

---

## §2. Morphisms（态射）

**读法（工程化）：** 箭头 **`f : A → B`** 表示 **在不变坏 §3 定律的前提下**，从对象 `A` 到对象 `B` 的 **可允许的语义变换**。

- **与 `⊕` 的关系：** 当 **`⊕` 有定义** 且与等价类相容时，可把「在类内选代表、或与相容上下文合并」读作 **从某一规范代表走向另一规范代表** 的 morphism 族；**v1** 的 `conflictFreeMerge` 在 `A ~ B` 上退化为 **类内常值投影**（代数 spec §13 已说明），故 **Hom 集**在 v1 上非常稀疏 — 这是 **诚实** 的，不是范畴失败，而是 **ABI 尚未给出丰富图结构**。
- **未实现的 chaining / overlay：** 在 ABI 未定义前，**不**宣称存在合法的 `sequentialCompose` / `overlayCompose` 箭头族。

---

## §3. Identity morphism（恒等）

**记法：** `id_A : A → A`

- **与实现对应：** **canonical 稳定** — `normalize` 在 canonical 上的 **spec 级恒等扩张**（见 algebra spec §2.1 / L1）；**无信息步进** 的 replay 读作 **恒等路径**（仍属解释，不替代 §18–§19 的精确 API）。
- **与 FP 的关系：** 对 **同一对象**（或同一同构类）上的 **自环可观测性**，读作「在规范化下 **不变**」；**不**把 FP 重新实现为「求 terminal 的唯一态射」—— v1 中 FP 是 **trace 对上的关系谓词**（§23），此处仅为 **叙事对齐**。

---

## §4. Composition（组合）

**范畴公理（读法）：** 满足 **结合律** 与 **恒等律** 的 `∘`，与代数里的 **`⊕`（在定义域内）** 对齐。

- **v1 事实域：** 在 **`A ~ B ~ C`** 且仅用 **conflict-free merge** 时，代数 spec 已记录 **结合性**（左偏代表元下退化为同一代表）。
- **一般式 `(f ∘ g)(A) = f(g(A))`：** 仅在将来 **全定义** 的 `⊕` / 链式 ABI 上才应声称 **一般范畴**；当前 **禁止** 为凑范畴而添加未在 trace 中载明的 `g`。

---

## §5. Functor（系统间映射）

此处是 **分层翻译**，不是单个 TS 函数名。

| 读法 | 数学角色 | 工程锚点（只读） |
|------|----------|------------------|
| **`F`** | `ExecutionTrace → CanonicalExecutionTrace` 的 **结构保持投影** | `normalize`（`ExecutionNormalizationKernel.normalizeExecutionTrace`） |
| **`G`（宽函子）** | 从 **更大运行世界** 到 **可比较语义工件** 的 **复合管道**（多阶段） | **叙述上** = 校验图 / 快照 / trace 物化等 **多条已有管道** 的 **串接**；**不是** 单一 `G()` 导出符号 |

**边界：** `G` **不得**被实现为偷偷依赖 runtime 打分或启发式等价 — 否则破坏 algebra freeze（algebra spec §10）。

---

## §6. Fixed point（与「不变」的读法）

- **不把 FP 改名为 terminal：** 避免与范畴论标准术语 **冲突**（terminal 唯一到同构，语义过强）。
- **安全读法：** **同构类稳定** — 若 `A`、`B` 在 canonical 上 **不可区分**（`A ~ B`），则二者在 𝓔 的 presentation 下 **处于同一对象 / 同构类**；FP 作为 **对关系** 标记「**已重合**」。

---

## §7. The big picture（对照表）

| 工程概念 | 范畴读法（𝓔 presentation） |
|----------|---------------------------|
| trace（§16） | 投影前的材料；经 `F` 入 Obj(𝓔) |
| `normalize` | 投影函子 `F` |
| `~` / `≡` | 对象上的 **同一性**（或同构类） |
| `⊕`（有定义处） | 生成/复合 morphism 的 **代数原语**（v1 极弱） |
| FP（对关系） | 「两点已在 Obj(𝓔) 中重合」的 **外部可判定** |
| replay（无步进） | 恒等路径的 **叙事**（精确契约仍见 §18–§20） |

**一句压缩：** **`(𝓔, F, ~, FP, ⊕)`** — 𝓔 以 **canonical 对象为点**、以 **保定律的变换** 为箭；**实现细节不由此文件增删**。

---

## §8. 终局冻结（范畴层）

在 **维持 𝓔 为良定义 presentation** 的前提下，**禁止**：

- 新增 **第二套** 比较维度或 **并行** equivalence
- runtime 参与 **态射相等** 或 **对象同一性**
- **概率态射**、自适应 normalize、动态等价规则

若破坏上述任一条，**范畴读法失效**，须回到 algebra spec 修订而非「口头升级范畴」。

---

## §9. 若继续（理论向，非本仓库义务）

- **A. Type-theory view：** 判断式 `Γ ⊢ trace : ValidExecution` — 需独立 typing 规范。  
- **B. Rewrite view：** `normalize` / `⊕` 作为重写规则系统 — 需 TRS / 收敛性陈述。

**本文档 revision：** `2026-05-11`（初版，与 algebra spec v1.1 对齐）。
