# TripNARA — Phase 5 Travel Decision Intelligence Validation

**文档版本：** 1.1.0  
**状态：** **ACTIVE · Wave 0 Shadow GO** — 工程管道就绪；运营收 Decision Outcome；**不开 PD-11**  
**日期：** 2026-08-11  
**上位：** [Phase 4 Production Readiness（冻结）](./PROACTIVE-DECISION-V1-PHASE4-PRODUCTION-READINESS.md) · [RFC-PD-001](./rfc-proactive-decision-v1.md) · [Canary Plan](./PROACTIVE-DECISION-V1-CANARY-PLAN.md)  
**开跑清单：** [PROACTIVE-DECISION-V1-PHASE5-SHADOW-CHECKLIST](./PROACTIVE-DECISION-V1-PHASE5-SHADOW-CHECKLIST.md)

---

## 一句话

> 验证 **Nara 是否知道什么时候应该介入**；积累 **Travel Decision Dataset**；不扩 PD-11 / 不开 Push / 不开 AutoApply。

---

## Goals（冻结）

| Goal | 指标 | 含义 |
|---|---|---|
| **G1** | Impact Precision ↑ | 判断「是否真有影响」更准 |
| **G2** | Useful Intervention Rate ↑ | 发出的建议真有价值 |
| **G3** | Accept ↑ · Regret ↓ | 用户信任上升、后悔下降 |

**禁止当北极星：** 触发次数 / CARD_SHOWN 原始计数。

---

## Workstreams

### W1 — Decision Dataset（最高优先 · 工程）

每次主动决策落一条（Shadow 亦写）：

```json
{
  "trigger": "weather_change",
  "impact": true,
  "recommended": true,
  "user_visible": false,
  "user_action": null,
  "outcome": null
}
```

工程契约：`nara.proactive_decision_dataset_record@v1`  
存储：`trip.metadata.proactiveDecisionV1Dataset`（ring）  
代码：`src/trips/proactive-decision/validation/`

### W2 — 四大验证指标（工程）

| 指标 | 计算（V1） |
|---|---|
| Useful Intervention Rate | useful / (useful + notUseful)；无反馈时 null |
| Accept Rate | (confirm+apply) / shown |
| False Positive Rate | notUseful / shown；或 defer/(shown) 作噪音代理 |
| Regret Reduction | V1 用 regretReported 反向：1 − regretRate（样本足够时） |

### W3 — iOS 体验验收（产品 / Client）

见 Phase 4 冻结稿 + iOS Handoff：认知文案、Confirm→Today's Plan。

### W4 — 运营 Shadow 波次（产品 / Eng）

**Wave 0：GO（2026-08-11）** — 见 [Shadow Checklist](./PROACTIVE-DECISION-V1-PHASE5-SHADOW-CHECKLIST.md)。

真 Trip 开 `PROACTIVE_DECISION_V1_ENABLED=1` + `PROACTIVE_CANARY_STAGE=SHADOW`，持续收 Dataset。

---

## 入口 / 出口

**进入 Phase 5：** Phase 4 已 FROZEN。  

**离开 Phase 5（可议 L1 放量）：**

- Dataset 有效样本 ≥ Canary `minShownEvents`（或 Shadow wouldNotify 等价样本量）
- Useful / Accept / FP 达到会签门槛（见 Canary Plan）
- iOS P0 验收清单勾选完成
- Product / Algo / Eng / Client 会签

仍禁止：Push · AutoApply · PD-11。

---

## 工程落地（W1 / W2 · 2026-08-11）

| 项 | 状态 | 路径 |
|---|---|---|
| Dataset 契约 | ✅ | `validation/proactive-decision-dataset.types.ts` |
| Persist 写入 | ✅ | Orchestrator → `ProactiveDecisionSurfacePersistService` → `metadata.proactiveDecisionV1Dataset` |
| CTA/Confirm/Apply patch | ✅ | `MobileProactiveDecisionService` |
| Useful 反馈 | ✅ | `POST .../execution/proactive-decision/feedback` `{ useful: boolean }` |
| **Shown 曝光** | ✅ | `POST .../execution/proactive-decision/impression` `{ surface: L1_PASSIVE \| L2_INTERRUPT }` |
| 验证摘要 | ✅ | `GET .../execution/proactive-decision/validation`（含 **Canary 晋级门禁**） |
| 指标计算 | ✅ | `computeProactiveValidationMetrics` · `evaluateProactiveValidationCanary` |

Shadow 阶段 `user_visible=false` 仍写 Dataset；L1/L2 **实际渲染后**客户端上报 impression；用户动作后 patch `user_action` / `outcome`。

---

## 会签

| 角色 | Phase 5 启动 | 日期 |
|---|---|---|
| Engineering | ✅ Wave 0 管道 GO | 2026-08-11 |
| Product | ☐ | |
| Algorithm | ☐ | |
| Client | ☐ | |
