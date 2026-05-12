# Execution System Governance Kernel (ESGK)

**Path:** `src/agent/runtime/specs/execution-system-governance-kernel.md`  
**性质：** **规则内核（宪法层）** — 决定 **执行子系统内「什么允许变」**；**不是** runtime、**不是** compiler、**不是** replay 引擎；**是** **变更前 / merge 前 / 发布前** 的 **判定入口**（与 CI、人工评审结合）。

**前置：** `execution-contract-governance.md` · `semantic-validation-contract.md` §24–§26 · `execution-algebra.spec.md` v1.1。

---

## §0. 本质一句话

**ESGK is the rule system that decides what can change inside an execution system.**

**工程锚点：** `ExecutionSystemGovernanceKernel.adjudicateV1`（`execution-system-governance-kernel.ts`）— **输入** 为 **已分类的变更报告**（**不** 自动从 git diff 推断）。

**人机 / AI 协同读法：** `execution-governance-interface.md`（EGI）。

---

## §1. 三层治理结构

### Layer 1 — Semantic Constitution（语义宪法）

**定义：** **What the system means**

- canonical trace 定义（§22）、**`~` / FP**（§21–§23）、**normalize 规则**、**execution model 语义**、**replay 语义分层**（§25）。

### Layer 2 — Execution Policy（执行政策）

**定义：** **How execution is allowed to behave**

- §15 router、§13–§14 upgrade / allowlist、fallback 叙事、**snapshot 兼容**、**memory binding 规则**（`AgentMemoryContext` + `execution_memory_binding`）。

### Layer 3 — Mutation Control（变更控制）

**定义：** **What is allowed to change over time**

- schema / fingerprint / **`SEMANTIC_VALIDATION_CONTRACT_REVISION`** / migration / backward compatibility（`execution-contract-governance.md` §3）。

---

## §2. Governance kernel 主函数（读法 ↔ 实现）

**`GovernanceCheck(change) → { allow | reject | require_revision }`**

| 输出 | 含义 |
|------|------|
| **`allow`** | **安全演化**（在已声明分类下不触碰宪法红线，或已伴随契约 bump） |
| **`reject`** | **违反不变量**（触碰语义宪法且 **未** bump 契约） |
| **`require_revision`** | **须 bump** 契约 revision / schema / migration（触碰政策或变更控制面但未完成 bump） |

**实现：** **`adjudicateV1(report)`** — 见 TS 文件；**调用方** 须提供 **`GovernanceMutationReportV1`**（PR 工具或人工表）。

---

## §3. 不变量核心（Invariants）

| ID | 陈述 | 备注 |
|----|------|------|
| **I1** | **`A ~ B` ⇔ `normalize(A)` 与 `normalize(B)` 同 stable JSON** | trace 核 §21–§22 |
| **I2** | **Replay 语义忠实** **`⇒`** **`isReplaySemanticallyFaithfulV1(original, traceAfterReplay)`** | **不** 把「replay 核成功」**等同** 于 I2；字节级见 §20 |
| **I3** | **同一语义输入 material → 同一 `model_fingerprint`（§10 算法不变）** | 材料变 → **须** bump + 台账策略 |
| **I4** | **`execution_model_version` 隔离行为空间** | 与 router / import 策略对齐 |
| **I5** | **`snapshot_id(trace) == snapshot_id(memory)`**（主链绑定） | route_and_run 编排契约 |

---

## §4. 演化规则（与 governance 总表一致）

| 等级 | 含义 |
|------|------|
| **Safe** | 新观测、非语义 metadata、logging shape — **仍** 建议 PR 说明 |
| **Controlled** | router / normalize / 等价核 / regression — **须** revision 或 schema bump + 兼容检查 + **必要时** replay 验证 |
| **Breaking** | 改 §1 输出、改稳定键语义、改 fingerprint material — **须** contract revision + migration + **指纹/回放失效策略** |

---

## §5. 系统收敛（读法）

**`SystemStable()`** **叙事** = **I1–I5 成立** **且** **未授权变更未落地**。

**工程代理：** **`GovernanceCheck(all) == allow`** **在** **所有已申报变更** **已 adjudicate** 的前提下。

---

## §6. 映射表（已有系统 → ESGK 层）

| 系统 | ESGK 层 |
|------|---------|
| semantic-validation（§1–§7） | Constitution |
| execution router（§15） | Policy |
| snapshot ledger（§11–§13） | Mutation Control |
| replay kernel（§17–§20） | Constitution + Policy |
| model versioning | Mutation Control |
| fingerprint（§10） | Constitution |
| memory binding | Policy + Constitution（锚一致 I5） |

---

## §7. 位置（非运行时）

**NOT** runtime / compiler / replay engine。  
**IS：** **pre-execution + pre-merge + pre-deploy** 的 **gate**（与 CI、CODEOWNERS、changelog 并列的工程流程）。

---

## §8. 收口图

```text
[ Governance Kernel / ESGK ]
            ↓
[ Compiler / Reverse / Algebra stack ]
            ↓
[ Execution Runtime ]
```

---

## §9. 冻结（ESGK 层）

**禁止：**

- **runtime** 内 **动态** 决定治理规则
- **per-request** 修改契约等价定义
- **概率** 稳定性裁决
- **ML** 作为 **唯一** adjudicator（可与 **人** 并行，**不得** 覆盖 **reject** 红线）

---

## §10. 若再继续（人机接口）

Developer / Copilot / Runtime Agent **三方治理接口** — **产品/流程** 层；**不在** 本文件定义。

---

**Spec revision:** `2026-05-11`（初版；与 ABI **`2026-05-11x`** §27–§31 对齐）。
