# Execution Contract Governance（宪法层 / 演进规则）

**Path:** `src/agent/runtime/specs/execution-contract-governance.md`  
**性质：** **控制面** — 规定 **哪些 ABI 可扩展、哪些冻结、哪些变更必须 bump revision**；**不** 替代 `semantic-validation-contract.md` 的 **法律效力**，而是 **把散落规则收束为单一治理视图**；**有冲突时以 `semantic-validation-contract.md` + `SEMANTIC_VALIDATION_CONTRACT_REVISION` 为准**。

---

## §0. 权威栈（谁允许改）

| 层级 | 文档 / 常量 | 角色 |
|------|----------------|------|
| **ABI** | `semantic-validation-contract.md`、`SEMANTIC_VALIDATION_CONTRACT_REVISION` | **对外契约**；变更须 **Document revision** + migration |
| **Trace 切片** | §16 `OrchestrationExecutionTraceV1` | **编排观测** 正式形状 |
| **Replay** | §17–§20 | **轮廓 / 执行核 / 字节等价 / 语义等价** |
| **代数 / 核** | `execution-algebra.spec.md` v1.1、各 `*kernel.ts` | **trace-only 真值**；变更 **extension** 须 bump algebra **或** ABI 中引用段 |
| **治理台账** | `semantic-model-snapshot-ledger.ts`、§12–§13 | **指纹 / 导入 / 版本谱系** |

**原则：** **无 revision + 无 algebra/ABI 同步** = **禁止** 改变 **比较真值** 或 **已冻结语义字段**。

---

## §1. 可扩展字段（🟢 允许演进 — 须走流程）

**流程：** **设计评审 → 更新契约 §/migration → 必要时 bump `schemaId`/`version`/`SEMANTIC_VALIDATION_CONTRACT_REVISION` → 测试 → 台账登记（若影响 fingerprint 材料）**。

| 载体 | 可扩展方式 | 备注 |
|------|------------|------|
| **`execution_trace_v1`** | **仅追加** 可选字段、或 bump trace `version` / `schemaId` | **不得** 静默改 **`snapshot_id` / `model_fingerprint` / `route_decision_path` 键语义** |
| **`execution_memory_binding` / `memory_contract`（DTO 观测）** | 追加 **可选** 摘要字段 | **不得** 替代 **`snapshot_id`+`snapshot_version`** 锚定义务 |
| **`SemanticModelSnapshotDescriptor`** | 在 §10 登记新键；**fingerprint 材料** 变更须 bump fingerprint 算法说明 | 与 **ledger export** 对齐 |
| **`OrchestrationReplayProfileV1`** | bump profile `version` / `schemaId`；§17 migration | 与 §16 trace **字段对齐** |

---

## §2. 禁止变更字段 / 语义（🟡 冻结 — 除非整体 revision）

| 项 | 冻结内容 |
|----|----------|
| **`snapshot_id` 语义** | **记忆锚 / replay 对齐键**；**不** 改为「可拼接随机串」等非审计语义 |
| **`model_fingerprint` 算法身份** | **与 §10 material 同源**；**不** 在未 bump 下换哈希输入集合 |
| **等价谓词 `~`（§21–§23）** | **v1 extension** = **`π_norm` 相等**；**禁止** 第二套 **并行** `~` |
| **`normalizeExecutionTrace` 输出形状** | **`CanonicalExecutionTraceV1`** 键集合与 **R1–R3**（contract §22）；**禁止** 无 migration **删键 / 改键名** |
| **`assertReplayEquivalence` 比较键集合（§20）** | **禁止** 在未 bump §20 下 **删比较键** 或 **把 `runtime_hint` 移出**（语义等价另走 §21） |
| **`compareSemanticRegression` 同构字段** | 与 **descriptor** 对齐；**禁止** 静默改 **比较集** |

---

## §3. 必须 bump revision 的边界（🔴）

**以下任一成立 → 须 bump `SEMANTIC_VALIDATION_CONTRACT_REVISION` 和/或相关 `schemaId`/`version`，并写 migration：**

1. **`compareSemanticRegression`** 的 **输入/输出形状** 或 **比较字段集** 变化。  
2. **`normalizeExecutionTrace`** 的 **投影规则** 变化（影响 **`stableJson ∘ N`**）。  
3. **`execution_model_version` 谱系 / import 策略**（§13–§14）变化 **且** 影响 **运行时准入或回归语义**。  
4. **§1 ValidationResult** 顶层或 **`ok`/`lines` 语义**（contract §1–§3）。  
5. **`OrchestrationExecutionTraceV1` `schemaId`/`version`** 或 **§16 已列稳定键语义** 变化。  

**仅实现细节、且不影响任何已登记 ABI 字节/语义：** 可在 **不 bump** revision 的前提下修改 **须** 在 PR 中 **证明** 无契约影响（通常仍建议 bump **文档** 若 touch kernel）。

---

## §4. 与 Replay / Stability 的交叉指针

- **Replay 强保证（审计 vs 语义 vs 全重演）：** `semantic-validation-contract.md` **§25**。  
- **稳定性谓词 `Stable`：** `semantic-validation-contract.md` **§26** + `execution-model-stability.ts`。  
- **治理裁决壳：** **§27** + `execution-system-governance-kernel.md` / `execution-system-governance-kernel.ts`（ESGK）。  
- **人 / AI / runtime 协同：** **§28** + `execution-governance-interface.md`（EGI）。

---

## §5. 修订

本 governance 文档 **revision** 与 **ABI** **解耦**；**变更本文件** 应 **在 PR 描述** 中说明 **是否** 需要 **联动** `semantic-validation-contract.md`。

**Governance doc revision:** `2026-05-11`（初版；与 ABI **`2026-05-11x`** §24–§31 指针对齐）。
