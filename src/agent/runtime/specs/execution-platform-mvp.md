# Execution Platform MVP Architecture（可落地最小路径）

**Path:** `src/agent/runtime/specs/execution-platform-mvp.md`  
**性质：** **现实约束与裁剪** — 从 **宪法级执行理论** 收敛为 **「3 个页面 + 1 条稳定执行链」**；**不** 在本仓库实现前端；**不** 扩展 runtime 智能。

**前置：** `execution-system-productization.md`（ESP）· `execution-governance-interface.md`（EGI）· `semantic-validation-contract.md` §16–§31 · `execution-platform-delivery-plan.md`（§31）。

---

## §0. MVP 总目标（收口一句）

**从 “execution theory system” 收敛成 “3 个可用页面 + 1 条稳定执行链”。**

**唯一主链：** **`Intent → Execute → Observe → Govern`**（闭环一次即可迭代）。

---

## §1. MVP 四层架构

### Layer 1 — Intent（一个页面：Intent Editor）

**仅保留：** 输入 intent → **AI 生成 DSL**（`execution-epl.md`）→ **execution plan preview**（读法映射 compiler 管线，**可无** 全功能 AST 视图）。

**砍掉：** 多 DSL 并行编辑、手写 graph、**policy DSL 编辑器**。

### Layer 2 — Execution（后台：`route_and_run`）

**必须：** **确定性** 主路径、**snapshot binding**、**`execution_trace_v1` 发射**（与现编排一致）。

**不做：** runtime 自适应优化、**v1 多模型自动选择**（保持现有 router **单次** 语义）、启发式 replan。

### Layer 3 — Observability（一个页面：Execution Explorer）

**仅三件事：**

1. **Trace timeline** — chain / route / selector / memory binding（**结构化**，非原始 log）。  
2. **Graph view（极简）** — **静态 DAG**；**无** 动画、**无** ML 聚类。  
3. **Replay** — 同 **snapshot** 重跑；**两跑 compare**（§20 / §21 **须 UI 标注模式**）。

**不做：** 全语义几何可视化、drift taxonomy UI、多 run 聚类。

### Layer 4 — Governance（一个页面：Governance Console 最小版）

**仅三件事：**

1. **Contract version** — `schemaId`、`contractRevision`（`SEMANTIC_VALIDATION_CONTRACT_REVISION`）、`executionModelVersion`。  
2. **Snapshot registry** — 列 snapshot、看 **fingerprint**、**两快照 compare**（ledger / descriptor **已有能力边界**）。  
3. **Drift alert（最小）** — **ok / fail**（或 **pass / block**）；**无** 分类学 UI。

**不做：** policy DSL UI、**规则创作** 系统、taxonomy 引擎。

---

## §2. MVP 核心数据流（唯一主路径）

```text
Intent → DSL (AI) → Governance Check (ESGK minimal + 必要 CI) → route_and_run
  → execution_trace_v1 (+ binding) → Explorer → Replay / Compare → Console feedback
```

**`Governance Check`：** MVP 可用 **`adjudicateV1`** + **现有** validation / regression **脚本** **组合**；**不必** 一次做满 EGI Gate 全自动化。

---

## §3. 删减原则（强制）

| 禁止方向 | 说明 |
|----------|------|
| **能力扩张** | 无新 taxonomy、无语义分级、无 runtime 自适应 **作为 MVP 范围** |
| **理论可视化** | 无 manifold / geometry UI、无 ML clustering |
| **平台化治理** | 无多租户契约系统、无 **authoring** 级 policy 产品 |

---

## §4. MVP 的单一价值主张

**不是**「更强 AI / 工作流 / agent」。  
**而是：** **可解释、可重放、可验证的执行**（canonical + replay + contract drift **可机读**）。

---

## §5. 三个页面（必须存在 — 产品定义）

| Page | 最小功能 |
|------|----------|
| **Intent Editor** | 输入 → DSL → preview |
| **Execution Explorer** | trace + **简** graph + replay/compare |
| **Governance Console** | contract 行 + snapshot 表 + **二元** drift |

---

## §6. MVP 成功标准（三条）

1. **同一 intent（钉死 DSL + 钉死 `Γ`）** → **重复执行** → **同一 `execution_trace_v1` 语义类**（§21，或 §20 若含 hint 一致需求须写明）。  
2. **任选已存 trace + 对齐 snapshot** → **replay** → **结构一致**（§25 **语义** 或 §20 **字节** — **验收须选定一种**）。  
3. **contract drift** → **输出可机读 ok/fail**（**无** 人工解释依赖 — 指 **validation / contract guard** 路径已有或可接 **boolean**）。

**诚实注：** (1) 在 **真实 LLM** 生成 DSL 时 **可能** 需 **「DSL 冻结」** 或 **golden intent** 子集才能 **严格** 满足；MVP 可 **先用 deterministic DSL fixture** 证明链再扩。

---

## §7. 技术裁剪（相对当前单体）

**必留后端：** `route_and_run`、`execution_trace_v1`、snapshot ledger、validation kernel、replay kernel、**只读** memory binding。

**可延后：** taxonomy、geometry UI、algebra **扩张**、高级 governance DSL、**多模型** 路由产品化。

---

## §8. 三块落地形态（现实版）

```text
Frontend:  Intent Editor | Execution Explorer | Governance Console
Backend:   route_and_run | trace kernel | snapshot ledger
Core:      ESGK (minimal adjudicate) | validation | replay
```

---

## §9. 收口一句

**This MVP is not a full platform — it is a deterministic execution substrate with three user-facing surfaces for intent, observation, and governance.**

---

## §10. 再往下（交付）

**里程碑 / 风险 / 交付模式** — **`execution-platform-delivery-plan.md`**（ABI **§31**）；甘特与资源排期见该文 §6。

---

**Spec revision:** `2026-05-11`（初版；ABI **§30–§31**、`2026-05-11x`）。
