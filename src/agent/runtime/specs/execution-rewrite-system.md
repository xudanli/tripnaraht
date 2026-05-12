# Execution Rewrite System（重写视角）

**Path:** `src/agent/runtime/specs/execution-rewrite-system.md`  
**性质：** **终局数学化读法** — 不新增算子、不改 TS、不扩张 ABI；把已在 **`execution-algebra.spec.md` v1.1**、**`execution-category-model.md`** 与契约 §16–§23 中冻结的结构，用 **重写系统 (T, →)** 的语言再统一一遍。

**Next read（同层级）：** 判定式 / 推导 / 可判定性读法 — `execution-proof-system.md`；语法表面 — `execution-dsl.md`。

---

## §0. 核心转译

在 **presentation** 级别，可把 **trace 核** 记为：

**`(T, →)`**

- **`T`**：此处取 **§16 `OrchestrationExecutionTraceV1` 的值空间**（再并上其 **canonical 像**，若把 `CanonicalExecutionTraceV1` 视为范式项）。
- **`→`**：**语义重写关系** 的最小生成：当前工程上 **主规则** 即 **一步规范化**（见 §1）。

**边界：** 全栈（router / replay / ledger / validation 图）**不是** 单一齐次项代数；下文 **§3–§5** 严格区分 **「已形式化的子系统」** 与 **「跨子系统的设计叙事」**。

---

## §1. Rewrite relation（重写关系）

### 1.1 基础规则（已实现、确定性）

**归约：**

`T →_norm N(T)`  

其中 **`N` = `normalize`**（`ExecutionNormalizationKernel.normalizeExecutionTrace`），**`N(T)`** 的类型为 **`CanonicalExecutionTraceV1`**。

- **一步：** 当前实现 **无** 多步 `→_norm` 链（非迭代求值）；**spec 级** 在 canonical 上令 **`N` 为恒等** 时，得到 **`N(N(T)) = N(T)`**（algebra spec L1）。

### 1.2 展开规则（composition，部分定义）

**读法：**

`(A ⊕ B) → … → N(·)`  

**v1 工程事实：** `⊕` 为 **部分** 运算；**`conflictFreeMerge`** 仅在 **`A ~ B`** 时有定义，且 **`A ⊕ B = A`**，故 **`N(A ⊕ B) = N(A) ≡ N(B)`**。不存在独立的 **「merge 机器」** 重写链 — **merge 已坍缩为类内左代表**。

### 1.3 等价 / 坍缩（collapse）

**`A ~ B`**（algebra §2.3）⇔ **`N(A) ≡ N(B)`**（`stableJson` 相等）。

- **读作重写：** 可记 **`A ↭ B`** 为 **「在同一范式类上可互相坍缩」** 的 **对称壳**；**不是** 在实现里对 `A`、`B` 做来回 **有向** rewrite step 队列。
- **join：** `A`、`B` 的 **公共范式** 为 **`N(A)`**（与 `N(B)` 同一对象）。

---

## §2. Normal form（范式）

**定义：** **`NF(T) = N(T)`**（`canonicalExecutionTraceStableJson` 的载体对象）。

| 性质 | 陈述 | 备注 |
|------|------|------|
| **可达性** | 对任意 **类型合法** 的 `T : ExecutionTrace`，`**∃**` 范式 **`N(T)`**（总可调用 `normalize`） | 不讨论「非法 JSON」等解析前项 |
| **稳定性** | **`N(N(T)) = N(T)`**（algebra 约定：`N|_Canonical = id`） | 与 **终止性** 一致：范式上 **无** 进一步 `→_norm` |

---

## §3. Confluence（合流 / Church–Rosser）

### 3.1 子系统 **`{→_norm}`**（严格）

仅含 **一步到范式** 的关系时：

- 从任意 `T` 出发，**至多一步** 到达 **`N(T)`**；**无分叉分支** ⇒ **CR / 合流** 为 **空真（vacuously）** 的强性质。
- **不要**把此 triviality **误推销**为「全平台所有路径的 Church–Rosser 定理」。

### 3.2 跨路径（router / replay / ledger）— **设计读法，非形式化 TRS**

**叙事对齐：** 若各路径最终都 **投影到同一 compare 接口**（例如 **对 §16 trace 使用同一 `N` 与 `stableJson`**），则可 **口语化** 为「在 **该接口** 上 **join**」。  
**事实边界：** router 产物、replay 轮廓、ledger 描述符 **类型不同**；**不经显式嵌入 / 遗忘函子**，**不存在**单一项集上的 **一个** `→` 使三者自动 CR。**若**将来给出 **统一的项代数 T′** 与 **规则集 R**，才可谈 **真正的** multi-rule CR **证明义务**。

---

## §4. Termination（终止性）

| 片段 | 陈述 |
|------|------|
| **`normalize`** | **一次调用即止**；无自触发递归（纯函数） |
| **replay** | **不**在本文件内证明 TRS 终止；工程契约见 **`semantic-validation-contract.md` §18–§20**（禁止核内再路由等） |
| **ledger import** | 同理；**非** 本重写视角的 rewrite 规则表的一部分 |

---

## §5. Critical pairs（冲突分析 — 读法清单）

以下为 **工程冲突面** 的 **分类读法**，**不是** 已完成 Knuth–Bendix 完备化的 critical pair 演算表。

| 对 | 读法上的「消解」 |
|----|------------------|
| **routing vs replay** | **replay 冻结路由**（契约 §18）；比较语义 **回退到 trace / canonical** |
| **ledger import vs runtime trace** | **指纹 / 版本 / import 闸门**（§10、§13）；**不**把 ledger 行与 §16 trace **混为同一 rewrite 项** 除非有明确嵌入 |
| **`⊕` vs `N` 次序** | **v1**：`A ~ B` 时 **`N(A⊕B)=N(A)`**；依赖 **代数 C3 / L1**，**无** 独立 completion 规则 |

---

## §6. Rewrite view of your stack（分层）

| 层 | 读法 |
|----|------|
| **Runtime** | **项生成**（trace 物化），**不是** 范式演算本身 |
| **Algebra** | **`~`、FP、`⊕`**（定律见 algebra spec） |
| **Category** | **对象 / 态射 presentation**（`execution-category-model.md`） |
| **Rewrite（本文）** | **`→_norm` + 范式 / 坍缩读法**；**多规则 CR** 仅预留 **证明位** |

---

## §7. The final unification（签名）

**读法压缩：**

**Execution trace kernel ≅ `(TR, →, NF, ⊕)`**

| 组件 | 含义（本文件范围） |
|------|---------------------|
| **`TR`** | §16 trace（及 canonical 像） |
| **`→`** | **主生成元**：`→_norm`；**`↭`** 为 **`~`** 的对称壳（读法） |
| **`NF`** | **`N`** |
| **`⊕`** | algebra v1.1 **部分** 组合 |

---

## §8. 终局冻结（重写层）

**禁止**（否则 **confluence / termination 叙事** 与 **可审计性** 同时崩坏）：

- runtime **依赖** 的 rewrite 规则
- **概率** 归约
- **自适应** normalize
- **动态** 演化等价（无 spec bump）
- **ML 驱动** 重写

---

## §9. 若再继续（理论终点）

- **Execution as proof system：** `Γ ⊢ trace : valid_execution`  
- **Execution as type system：** `trace : ValidExecutionTrace`

二者均需 **独立** 判断式 / 类型论规范 — **不在** 本仓库本轮交付内。

---

**文档 revision：** `2026-05-11`（初版；与 algebra v1.1 / category model 对齐）。
