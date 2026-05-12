# Execution Platform Delivery Engineering Plan

**Path:** `src/agent/runtime/specs/execution-platform-delivery-plan.md`  
**性质：** **工业化交付** — **非** 新理论、**非** 新内核；**工程路径**、**里程碑**、**风险**、**停止设计的决策边界**。  
**前置：** `execution-platform-mvp.md`（§30）· `execution-system-productization.md` · `semantic-validation-contract.md`（含 **§31**）。

---

## §0. 关键事实

**缺的不再是「能力」。**  
**唯一缺口：** **如何稳定交付**，而不是继续扩展系统设计。

---

## §1. 交付拆解（里程碑）

### Milestone 1 — Execution Core Freeze（**相对本仓库当前主线：已完成**）

- `route_and_run`、§16 **`execution_trace_v1`**、snapshot / memory binding、replay / validation / regression **核** — **见既有契约与实现**。

### Milestone 2 — MVP UI Skeleton（**下一步**）

**只做三页骨架（无优化、无高级 UI）：**

| 页面 | 最小内容 |
|------|----------|
| **Intent Editor** | 输入 + **DSL 预览**（可占位） |
| **Execution Explorer** | **trace 只读** 时间线 |
| **Governance Console** | **snapshot 列表** + 契约 revision **只读** |

### Milestone 3 — End-to-End Closed Loop

**目标：** 一条 **intent**（或 **钉死 DSL fixture**）→ 生成/载入 DSL → **Gate**（最小）→ **执行** → **trace** → **Explorer** → **replay** → **governance OK**。

**验收清单（可勾选）：** intent 输入 → DSL → 执行 → `execution_trace_v1` → replay 成功 → **`adjudicateV1` / drift** 路径 **二元** 可过。

### Milestone 4 — Stability Hardening

**只做三件事：**

1. **Contract drift alert**（可机读 ok/fail，**无** taxonomy UI）。  
2. **Snapshot consistency**（指纹 / 版本对齐检查）。  
3. **Replay 确定性 CI**（钉死输入 + 比对 §20 或 §21 **事先选定的一种**）。

---

## §2. 系统风险点（当前阶段）

### R1 — ABI / 契约膨胀

**现象：** 多 **schema 层**、**多 revision**、trace / validation / replay **并行契约**。  
**风险：** 任意改动 **边际成本上升**；回归面扩大。  
**缓解：** **Contract freeze** 窗口；**少 bump**、**小 PR**；**治理文档** `execution-contract-governance.md` **守门**。

### R2 — Replay 偏移

**触发：** `normalize` 规则漂移、router hint 语义扩张、memory binding **未文档** 的隐语义。  
**风险：** **replay 产出** 与 **原始** **偏离** 预期等价类。  
**缓解：** §25 **显式选** §20 vs §21 验收；**normalize / router 变更** 强制 **revision + CI replay**。

### R3 — UI 过拟合

**触发：** 复杂 graph 动效、taxonomy 面板、**无 Gate** 的「AI 解释一切」。  
**风险：** 产品退化为 **log / agent 可视化玩具**，**不是** execution platform。  
**缓解：** **死守** `execution-platform-mvp.md` **删减原则**。

---

## §3. 决策（唯一）

**停止系统设计扩张，进入交付控制模式（Delivery Control）。**

---

## §4. Delivery Mode — 只做 / 不做

| ✅ 只做 | ❌ 不做 |
|---------|---------|
| Bug fix | 新 abstraction |
| **Contract freeze**（按治理 bump） | 新 semantic 理论层 |
| **UI skeleton**（三页） | 新 kernel（无 ABI 驱动） |
| **E2E 路径稳定** | 新 DSL 语法扩张 |
| **CI 确定性**（replay / regression） | 新「几何 / 范畴」文档链扩张（除非修复错误） |

---

## §5. 收口一句

**语言设计阶段已收敛；当前阶段 = 工业化交付（骨架 → 闭环 → 硬化）。**

---

## §6. Roadmap 工件（可选）

**Milestone 日期 / 负责人 / 依赖** — 建议 **Jira / Linear / 内部 `docs/roadmap/`**；**不在** 本文件维护甘特图。

---

**Spec revision:** `2026-05-11`（初版；ABI **§31**、`2026-05-11x`）。
