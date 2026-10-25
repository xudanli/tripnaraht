# Phase 5 — Shadow 开跑 Checklist（Wave 0）

**状态：** **GO** — 2026-08-11 正式进入运营 Shadow 波次  
**上位：** [Phase 5 Validation](./PROACTIVE-DECISION-V1-PHASE5-VALIDATION.md) · [Canary Plan](./PROACTIVE-DECISION-V1-CANARY-PLAN.md) · [iOS Handoff](../../src/trips/proactive-decision/PROACTIVE_DECISION_IOS_HANDOFF.md)

> 目标：在**用户不可见**前提下，跑通编排 + 写 Decision Dataset / Shadow Log，验证「什么时候该介入」。  
> **禁止：** Push · AutoApply · PD-11 · Confirm→Apply 写链（本波次保持关闭）。

---

## 1. Env（Shadow 默认）

```bash
PROACTIVE_DECISION_V1_ENABLED=1
PROACTIVE_CANARY_STAGE=SHADOW
PROACTIVE_CANARY_TRAFFIC_PERCENT=0
# 可选：dogfood trip
# PROACTIVE_CANARY_TRIP_ALLOWLIST=trip_xxx,trip_yyy
PROACTIVE_INTERVENTION_THRESHOLD=0.08
PROACTIVE_DECISION_CONFIRM_APPLY_WRITE_ENABLED=0
PROACTIVE_SHADOW_RECORD_ENABLED=1
PROACTIVE_SILENT_LEARNING_MEMORY_ENABLED=1
```

说明：

- Shadow 下 **L1/L2 不展示**（`shouldRender*=false`），用户无感。
- PD V1 开后，天气/道路 pipeline ingest 会写：
  - `trip.metadata.proactiveDecisionV1Surface`
  - `trip.metadata.proactiveDecisionV1Shadow`（ring）
  - `trip.metadata.proactiveDecisionV1Dataset`（ring）

---

## 2. 每日观测（按 Trip）

| 步骤 | 动作 |
|---|---|
| 1 | 选 IS 自驾 Trip，触发天气/道路 impact（或等真实信号） |
| 2 | `GET /mobile/trips/:tripId/execution/proactive-decision` → 确认 Shadow 下无卡 |
| 3 | `GET .../execution/proactive-decision/validation` → 看 `metrics` + `canary` |
| 4 | 抽查 Dataset：`trigger / impact / recommended / wouldNotify / qualityScore` |

关注指标（**不是**触发次数）：

- `wouldNotify` / Impact Precision proxy  
- Shadow quality（有推荐、Hard Gate、why 可解释）  
- `canary.advance.mayAdvance`（Shadow 代理样本**不会单独放行 L1**）

回滚：`PROACTIVE_DECISION_V1_ENABLED=0` 或 `PROACTIVE_CANARY_STAGE=SHADOW`（保持）并关 allowlist。

---

## 3. Client 并行（W3 · 可与 Shadow 并行准备）

对接契约：[PROACTIVE_DECISION_IOS_HANDOFF.md](../../src/trips/proactive-decision/PROACTIVE_DECISION_IOS_HANDOFF.md)

会签升 **L1_PASSIVE** 前必须齐：

- [ ] L1 条带文案（无人格名）
- [ ] 渲染后 `POST .../impression` `{ surface: "L1_PASSIVE" }`
- [ ] Useful / Not Useful → `POST .../feedback`
- [ ] CTA → Confirm → Today's Plan（Apply 写链仍可关）

---

## 4. 离开 Wave 0 / 议 L1 的门槛

见 Canary：`Accept≥0.25 · Defer≤0.7 · Useful≥0.5 · Shown≥30`  
另需：iOS P0 勾选 + Product / Algo / Eng / Client 会签。

**本波次成功定义：** Dataset 持续增长 + Shadow quality 可抽检 + 无用户投诉（本应不可见）。

---

## 5. 会签（Wave 0 启动）

| 角色 | Wave 0 GO | 日期 |
|---|---|---|
| Engineering | ✅ 管道就绪 | 2026-08-11 |
| Product | ☐ | |
| Algorithm | ☐ | |
| Client | ☐ | |
