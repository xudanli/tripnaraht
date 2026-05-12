# Execution Governance Interface (EGI)

**Path:** `src/agent/runtime/specs/execution-governance-interface.md`  
**性质：** **交互与控制面设计** — 规定 **人、AI、运行时** 如何在 **同一语义宪法** 下协作 **而不** 破坏稳定性；**不** 实现 Copilot UI；**不** 扩展 runtime 决策权。

**前置：** `execution-system-governance-kernel.md` · §27 `adjudicateV1` · `execution-contract-governance.md` · `semantic-validation-contract.md` §24–§27 · `execution-epl.md`。

---

## §0. 核心一句话

**EGI is the controlled interface between humans, AI agents, and a constitutionally governed execution system.**

---

## §1. 三类参与者

### 1.1 Developer（人类）

**职责：** 编写 DSL / policy / routing **intent**；提交 **execution change**；读取 trace / replay / snapshot。  
**边界：** **不得** 在未通过 **治理门** 的情况下 **直接改写** **runtime 语义**（等价定义、normalize、指纹材料等）。

### 1.2 AI Agent（协作者）

**职责：** 生成 **DSL proposal**；提议 plan / route / 优化；**解释** trace / diff / replay 结果。  
**边界：** **不得** **绕过** **ESGK**（`ExecutionSystemGovernanceKernel`）及契约规定的 **validation / compatibility / stability** 链；**不是** 控制面。

### 1.3 Runtime（执行机）

**职责：** **确定性** 执行、trace 物化、**snapshot binding**；**不** 做 **推理 / 治理裁决**。  
**边界：** **完全不可自修改** 语义规则（宪法在 **编译前 / merge 前** 固定）。

---

## §2. 三通道模型

| Channel | 流向 | 内容 |
|---------|------|------|
| **Write** | Human / AI → **Proposal** → **Gate** → Commit | **DSL / 配置变更** 经 **EGI Gate**（见 §3） |
| **Observe** | Runtime → Trace → **Canonical view** | `execution_trace_v1`、memory binding、fingerprint、timeline / graph **只读** 视图 |
| **Replay / Explain** | Trace → **reverse / diff narrative** | debug、audit、回归说明；**须** 遵守 §25 **等价分层** |

---

## §3. Governance Gate（唯一写入入口 — 读法）

**`EGI Gate ≈ ESGK.adjudicateV1 + Validation + Compatibility + Stability`**

| 组件 | 角色 |
|------|------|
| **ESGK** | **`allow` / `reject` / `require_revision`**（§27；**分类** 由人/CI **预填**） |
| **Validation** | `validateSemanticExecutionGraph` 等 **图契约** |
| **Compatibility** | §13 import / execution model lineage |
| **Stability** | `ExecutionModelStability`（§26）等 **钉扎 / replay 忠实** |

**扩展输出 `downgrade`：** **未** 在 v1 `adjudicateV1` 枚举中 — **若** 引入 **受控降级**（如 allowlist 建议），**须** **新 revision** + **显式 API**。

---

## §4. AI 的真实位置

**AI ∉ runtime。**  
**AI = DSL proposal generator + trace interpreter（proposal engine，非 control plane）。**

**可做：** 生成 `exec {…}` 草案、提议 selector、canonical diff 说明、replay **解释**。  
**禁止：** 改 normalize / `~` / fingerprint 语义、**bypass** ESGK、**per-request** 注入等价规则。

---

## §5. Developer 心智模型（三件事）

1. **写语义**（intent / DSL），**不是** 偷偷改内核。  
2. **看差异**（canonical / §20 vs §21），**不是** 只刷屏日志当真理。  
3. **批准演化**（review bump + migration），**不是** 无契约 deploy。

---

## §6. 交互闭环

```text
Human / AI → DSL Proposal → EGI Gate → Execution Commit → Runtime
      ↑___________________________________________|
              Trace / Replay / Explain (Observe + Replay channels)
```

---

## §7. 三层权力

| 层 | 内容 | 权力 |
|----|------|------|
| **Expression** | DSL、AI 生成、intent | **提议** |
| **Governance** | ESGK、兼容、指纹、stability | **唯一裁决（合入前）** |
| **Execution** | runtime、trace、memory | **无自治规则变更** |

---

## §8. 系统形态（收口句）

**A constitutionally governed execution system with an AI-assisted semantic programming interface — where AI proposes, governance adjudicates, runtime executes.**

---

## §9. 结构性结论

- **不是**「AI 系统 / agent 系统 / 纯 runtime 系统」作为 **语义真值** 的定义者。  
- **而是：** **受治理的语义编程环境**；**AI** = **proposal engine**。

---

## §10. 冻结（EGI 边界）

**禁止：**

- AI **绕过** governance  
- runtime **自修改** 规则  
- **动态** 语义突变、**per-request** 规则注入  
- **未验证** 的 schema 演化合入

否则：**治理内核** 形同失效。

---

## §11. 产品化（工程外）

**Developer Experience + Copilot + Execution Debugger** 的 **统一产品** — **下一层**；**不在** 本文件规定 UI。  
**三产品架构（ESP）：** `execution-system-productization.md`（ABI **§29**）。

---

**Spec revision:** `2026-05-11`（初版；`semantic-validation-contract.md` **§28–§31**、`2026-05-11x`）。
