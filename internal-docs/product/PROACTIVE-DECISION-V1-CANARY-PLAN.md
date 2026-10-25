# TripNARA Proactive Decision V1 — Canary 放量计划（PD-10 / Phase 4）

**状态：** Phase 4 FROZEN 配套 · Stage 0 Shadow 优先；会签后放量  
**日期：** 2026-08-11  
**上位：** [RFC-PD-001](./rfc-proactive-decision-v1.md) · [Phase 4 Production Readiness（冻结）](./PROACTIVE-DECISION-V1-PHASE4-PRODUCTION-READINESS.md) · [Engineering Backlog](./rfc-proactive-decision-v1-engineering-backlog.md)  
**配置 SSOT：** `src/trips/proactive-decision/config/proactive-canary-config.util.ts`

**产品判断：**不证明「能不能主动」，只验证「什么时候值得出现」。  
**核心指标：**Useful Intervention Rate · Accept Rate · False Positive Rate · Decision Regret Reduction。

---

## 1. 阶段

| Stage | 名称 | 用户可见 | 条件 |
|---|---|---|---|
| **0 / SHADOW** | Shadow | 否 | **默认 / 下一步**；可 100% 跑系统；记录应提醒次数、原因、方案质量、Decision Trace |
| **1 / L1_PASSIVE** | L1 Passive | 应用内被动 | Shadow 指标过门 + 会签；入口优先**执行首页 / 今日行程**条带，不强打断 |
| **2 / L2_IN_APP_INTERRUPT** | L2 Interrupt | 三层打断卡 | L1 稳定后；仅 High Value（`IV > 0.2` ∧ `Confidence > 0.9` ∧ Actionable）；未达降级 L1 条带 |
| **PUSH** | — | — | **V1 暂不做 / 禁止起家** |

全程：**Push 不起家 · AutoApply=false（永久）**。  
Confirm→Apply 另需 `PROACTIVE_DECISION_CONFIRM_APPLY_WRITE_ENABLED=1`。

**Canary 前必须补齐（P0/P1）：**

1. 三黄金案例 E2E（沿海大风 / 道路关闭 Hard Gate / 活动窗口）  
2. Decision Trace 可回放解释  
3. Silent Learning → Travel Memory → Outcome Review  
4. 真实 Trip 回放  

---

## 2. 冻结初值

| 项 | 值 |
|---|---|
| Intervention Threshold | **0.08**（`PROACTIVE_INTERVENTION_THRESHOLD`） |
| Audience | `IS` + `SELF_DRIVE` |
| Cases | 三 Case only |
| Traffic | 默认 0%；allowlist 或百分比放量 |
| Metric gates | Accept≥0.25 · Defer≤0.7 · Useful≥0.5 · Shown≥30 |

---

## 3. Env 一览

```bash
PROACTIVE_DECISION_V1_ENABLED=1
PROACTIVE_CANARY_STAGE=SHADOW          # L1_PASSIVE | L2_IN_APP_INTERRUPT
PROACTIVE_CANARY_TRAFFIC_PERCENT=0
PROACTIVE_CANARY_TRIP_ALLOWLIST=trip_a,trip_b
PROACTIVE_INTERVENTION_THRESHOLD=0.08
PROACTIVE_DECISION_CONFIRM_APPLY_WRITE_ENABLED=0
PROACTIVE_DECISION_CGUS_SEARCH_ENABLED=0
PROACTIVE_SILENT_LEARNING_MEMORY_ENABLED=1   # PD V1 开时默认开；写 Silent→Travel Memory
PROACTIVE_SHADOW_RECORD_ENABLED=1           # Stage 0：默认开；100% 记 Shadow Log，用户不可见
PROACTIVE_L2_MIN_INTERVENTION_VALUE=0.2     # L2 High-Value：IV >
PROACTIVE_L2_MIN_CONFIDENCE=0.9             # L2 High-Value：Confidence >
PROACTIVE_L2_MIN_ACTIONABILITY=0.7          # L2 High-Value：Actionable
```

---

## 4. 观测与回滚

观察：Accept Rate · Defer Rate · Useful Rate · Silent Suppress · Neptune Trigger · Query Reduction（「今天还能去吗」类）。

回滚：将 `PROACTIVE_CANARY_STAGE` 退回 `SHADOW`，或 `PROACTIVE_DECISION_V1_ENABLED=0`。

`evaluateProactiveCanaryAdvance()` 用于阶段晋级门禁（代码 SSOT）。

---

## 5. 产品成功抽检（PD-10.4）

访谈样本（每 Canary 波次 ≥5）：

1. 是否在关键变化时收到过 Nara 提醒？  
2. 是否觉得打扰合理？  
3. 是否据此调整行程？  
4. 是否减少了「今天还能不能去」的主动询问？  

成功表述对照 RFC：用户相信 Nara 会在关键变化时主动给出下一步行动。

---

## 6. 会签

| 角色 | 日期 | 结论 |
|---|---|---|
| Product | | ☐ |
| Algorithm | | ☐ |
| Engineering | | ☐ |
| Client | | ☐ |
