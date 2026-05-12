# Execution System Productization Architecture (ESP)

**Path:** `src/agent/runtime/specs/execution-system-productization.md`  
**性质：** **产品化架构** — 回答 **「复杂宪法级执行系统如何被人类稳定使用、理解、调试、信任」**；**不** 规定具体 UI 框架、**不** 实现 MVP 代码；**与** EGI / ESGK / 契约 **对齐**。

**前置：** `execution-governance-interface.md`（EGI）· `execution-system-governance-kernel.md`（ESGK）· `semantic-validation-contract.md` · `execution-epl.md` · `execution-reverse-compiler.md`。

---

## §0. 终极目标

把体系 **压成** 三件 **可用产品形态**：

1. **Intent Editor** — 写系统（意图 / DSL）  
2. **Execution Explorer** — 看系统（语义时间线 / 结构 / 真值）  
3. **Governance Console** — 管系统（契约、变更、稳定性）

---

## §1. Intent Editor（写 DSL）

**本质：** **不是写传统代码，是写执行意图。**

| 层 | 内容 |
|----|------|
| **输入（Intent）** | 自然语言或表单：**目标、约束、偏好** |
| **中间（AI → DSL）** | 生成 **`exec { … }`** 草案（见 `execution-epl.md`） |
| **关键 UX** | **Plan preview**（将映射到 compiler 管线读法）；**Governance check 结果**（`adjudicateV1` / Gate **可读摘要**） |

**原则：** 用户主视图是 **「可执行意图结构」**，**不是** 原始 TS / Nest。

---

## §2. Execution Explorer（看执行）

**本质：** **不是日志聚合器，是可导航的语义时间线。**

| 视图 | 内容 |
|------|------|
| **Trace** | chain → route → selector → **memory binding**（§16 trace + 观测字段） |
| **Graph** | execution graph / 角色与边（validation 域 fixture） |
| **Canonical** | **NF / 等价类**（`normalize` + `stableJson`；§21–§22） |

**能力：** replay、**两跑 diff**（§20 vs §21 **须标注模式**）、drift **结构化** 高亮、**snapshot 锚** 展示。

**UX 原则：** **默认不看原始 log**；**看结构差异与商点**。

---

## §3. Governance Console（管宪法）

**本质：** **不是通用运维大盘，是「系统法律」执行情况。**

| 模块 | 内容 |
|------|------|
| **Contract Registry** | `schemaId`、`SEMANTIC_VALIDATION_CONTRACT_REVISION`、`execution_model_version` 谱系、ledger export 指针 |
| **Change Review** | DSL / router / normalize 变更 → **`GovernanceMutationReportV1`** → **`adjudicateV1` 结果** |
| **Stability Dashboard** | 指纹漂移率、replay mismatch（按 §25 定义分层）、版本碎片化、**snapshot 不一致** 信号 — **指标定义须版本化** |

---

## §4. 三产品闭环

```text
Intent Editor → Governance Gate (EGI / ESGK) → Runtime
      ↑                                              │
      └──────── Execution Explorer ──────────────────┘
              ↓
      Governance Console (feedback)
```

---

## §5. AI 在产品中的角色（非「系统能力」）

| 角色 | 职责 |
|------|------|
| **DSL Assistant** | intent → DSL；补全；**proposal only** |
| **Trace Interpreter** | 解释执行、**canonical diff**、drift **叙述** |
| **Governance Copilot** | 契约漂移提示、**migration 建议草案**（**须** 过人/CI Gate） |

**禁止：** AI 作为 **唯一** merge 批准者；AI **覆盖** `reject`。

---

## §6. 用户心智模型（三句话）

用户 **不需要** 先懂 execution graph / trace kernel / 等价类 **术语**。

**只需理解：**

1. **我想做什么**（Intent）  
2. **系统实际做了什么**（Trace / Explorer）  
3. **系统是否仍可信**（Governance Console）

---

## §7. 三个核心对象（产品抽象）

| 对象 | 映射 |
|------|------|
| **Intent Object** | 用户意图 → **EPL / DSL** |
| **Execution Object** | trace / graph / runtime snapshot **材料** |
| **Governance Object** | contract revision / version / fingerprint / **stability 谓词** |

---

## §8. 最终产品形态（收口句）

**A governed execution programming platform with AI-assisted intent authoring and semantic observability** — **不是** workflow 引擎、**不是** 无结构 chatbot agent、**不是** 仅编排脚本库。

---

## §9. 产品冻结原则

**禁止退化为：** 纯 log viewer、无治理的 workflow 看板、**无 Gate** 的 prompt 聊天、**无 canonical 真值** 的「AI app」。

否则：**平台坍缩** 为普通 agent 产品，**宪法层** 被旁路。

---

## §10. 若再继续（现实落地）

**信息架构 + 交互设计 + MVP 路径** — 见 **`execution-platform-mvp.md`**（ABI **§30**）；本文件保留 **三产品抽象**，裁剪细节以 MVP 为准。

---

**Spec revision:** `2026-05-11`（初版；ABI **§29–§31**、`2026-05-11x`）。
