# Decision State Layer

## 阶段冻结：Decision State Takeover Validation V1

**建设期结束。** 当前目标不是证明 MDS「漂亮」，而是证明：

> Decision State 能稳定接管真实决策上下文，并让旧的上下文判断层逐步失去存在价值。

纪律：`No evidence, no feature` · `No divergence, no retirement`  
目标：更少猜、更少问、更少误判 —— **不是让 Decision State 做更多**。

Registry：**冻结 16 类**（`FROZEN_DECISION_CLASS_COUNT`）。能力成熟而 Class 数量不增长 = 健康信号。

---

## 职责（仅三件事）

1. 当前到底是什么决策？（DecisionClass）
2. 这个决策最少需要什么状态？（DecisionStateContract → Projection）
3. 在当前状态下，系统唯一允许做什么？（DecisionReadiness → NextAction）

## 模块边界（冻结）

| 层 | 职责 |
|----|------|
| World State | 保存事实 |
| **Decision State** | **裁剪事实 → MDS** |
| Acquisition | 获取缺失事实 |
| Readiness | 判定能不能继续（**唯一 ASK 权威**） |
| Agent / Solver | 完成决策 |
| Policy / Verification | 限制执行 |
| Renderer | 表达结果 |

Legacy 终态方向（按**行为责任**退役，不按模块整删）：

| Legacy | 最终留下 |
|--------|----------|
| CRE | Context acquisition / compatibility |
| ROR | Observation / advisory |
| InteractionPolicy | UI/interaction safety |
| Hydrator / Sensor | State / evidence acquisition |
| **Decision State** | **唯一 Context Requirement + Next Action authority** |

---

## 不变量（P0 · 零容忍）

| ID | 规则 |
|----|------|
| **INV-01** | ASK_USER 必须引用 declared contract key，且可生成完整 AskUserAudit（incomplete → 禁止出站） |
| **INV-02** | technical failure ≠ business fact（须 Normalization → Evidence → Business State） |
| **INV-03** | undeclared key 缺失不得阻断当前 decision |

真实 Trip / 线上任一违反 → 可直接进修复，无需另立项。

---

## Backlog 准入（仅三类）

### 1. 真实 Trip 暴露的 Decision State 问题

False ASK / Required key 没问 / wrong fallback / Decision Class 错 / Next Action 错 / Contract 不充分。

工单必须附：

```
Trip → Decision Class → Contract → Projection → Readiness
→ Actual Next Action → Expected Next Action → Divergence
```

### 2. 系统不变量违规

INV-01 / INV-02 / INV-03 → P0。

### 3. Legacy retirement evidence

例：`ROR.activity.pace_gap_authority` 在连续真实 Trip 中：无独立正确行为、MDS 已覆盖、或造成 divergence → `RETIRE_CANDIDATE` → Disable → Regression → RC → Delete。

**退役按行为责任项**（如 `CRE.activity.context_requirement_authority`），不说「整删 ROR」。无证据时零删除是正常结果。

**禁止进入 Backlog：** 主动新增 Decision Class、InteractionPolicy 例外、路由特判「提升表现」。

---

## Registry expansion is evidence-gated

新增 Decision Class 必须**同时**满足：

1. 重复真实 Trip  
2. 现有 Contract 无法表达  
3. 不是简单缺字段  
4. 不是 Renderer 差异  
5. 不是 Legacy 行为造成  
6. 确实存在不同的 minimum sufficient state  
7. 确实存在不同的 readiness / next-action semantics  

否则：**不新增 Class**。扩类另需 `DECISION_STATE_REGISTRY_UNFREEZE=1`。

`LOCAL_EDIT`：继续 `OBSERVE ONLY`（`decision_state_unowned_local_edit`）。不预建 ADD/REPLACE/MOVE；重复模式后再定是否 `PLAN.LOCAL_EDIT` 等。

Contract Composition / slimLoad→`compile(contract)`：仅预留接口与长期方向，**本阶段不立项**。

---

## Weekly 运营页（禁止汇报「完成了多少类」）

| 指标 | 看什么 |
|------|--------|
| **False ASK Rate** | North Star：本来能答却追问 |
| Required ASK Miss | 该问却没问 |
| Next Action Divergence | 新旧链最终行为不一致 |
| Undeclared Blocker | INV-03 |
| Sensor False Mapping | INV-02 |
| Invalid ASK Audit | INV-01 |
| Wrong Fallback | FETCH / ASK / CATALOG / BLOCK 选错 |
| Decision Class Drift | 连续对话错误切类 |
| Unowned Local Edit | 是否形成重复模式 |
| Legacy Retirement | 本周有无证据支持删除 |

理想趋势：coverage ↑ · False ASK ↓ · Legacy intervention ↓ · Next Action divergence ↓ · InteractionPolicy exceptions ↓ · static slimLoad dependence ↓ · **Decision Class count = 16**。

---

## 真实 Trip Matrix（A–F）

Unit green（`mds-state-space-attack.spec.ts`）= 机制成立。产品成立靠真实 Trip：

| Attack | 证明 |
|--------|------|
| A Undeclared | 不相关信息缺失绝不追问 |
| B Required | 真缺关键状态一定问对问题 |
| C Sensor | 工具坏了不冒充业务结论 |
| D Multi-gap | 多缺口只产生一个 Next Action |
| **E Intent Shift** | 连续对话切 Decision 不漂移（最重要） |
| **F Cross-domain** | Activity/Lodging/Risk/Plan 不相互污染（最重要） |

E 例链：GUIDANCE → AVAILABILITY → SUITABILITY → RESERVATION_PREP → RISK.PACE_ASSESS → PLAN.DAY_REPLAN，上下文正确继承与裁剪。

---

## Release Gate（V1）

| Gate | 要求 |
|------|------|
| **1 Ask Authority** | MDS takeover 决策：ASK_USER authority = Readiness only |
| **2 Invariants** | 真实 Trip：INV-01/02/03 violation = 0 |
| **3 False ASK** | 不允许系统性重复；孤例可修，同类重复 = P1 |
| **4 Cross-domain Stability** | E / F 必须稳定（单轮过不够） |
| **5 Legacy Reduction** | 每轮须能回答：哪些旧判断职责已被证明不再需要？（可不删代码） |

---

## 阶段结论（冻结）

Decision State Layer **建设期结束**。  
进入 **Takeover Validation V1**：Registry 冻结 16 类，不主动扩域；以真实 Trip 的 A–F 为主要验证手段；以 **False ASK Rate** 为核心运营指标；以 INV-01/02/03 为零容忍边界。

新阶段不通过增加 Contract、InteractionPolicy 或路由例外提升表现，而是通过 divergence 证明哪些旧上下文判断职责可以安全退役。
