# TripNARA Proactive Decision V1 — 工程任务清单

**文档版本：** 1.0.3  
**状态：** **Phase 5 ACTIVE** — Travel Decision Intelligence Validation · **不开 PD-11** · Phase 4 FROZEN  
**生效日期：** 2026-08-11  
**上位文档：** [RFC-PD-001 — Proactive Decision V1](./rfc-proactive-decision-v1.md)  
**Phase 4 冻结稿：** [PROACTIVE-DECISION-V1-PHASE4-PRODUCTION-READINESS](./PROACTIVE-DECISION-V1-PHASE4-PRODUCTION-READINESS.md)  
**Phase 5 验证计划：** [PROACTIVE-DECISION-V1-PHASE5-VALIDATION](./PROACTIVE-DECISION-V1-PHASE5-VALIDATION.md)  
**架构决策：** [ADR-012 — Observe / Impact / Apply SSOT](../architecture/ADR-012-Proactive-Decision-V1-SSOT.md)  
**Canary 计划：** [PROACTIVE-DECISION-V1-CANARY-PLAN](./PROACTIVE-DECISION-V1-CANARY-PLAN.md)  
**Phase 5 验证计划：** [PROACTIVE-DECISION-V1-PHASE5-VALIDATION](./PROACTIVE-DECISION-V1-PHASE5-VALIDATION.md)  
**Shadow 开跑：** [PROACTIVE-DECISION-V1-PHASE5-SHADOW-CHECKLIST](./PROACTIVE-DECISION-V1-PHASE5-SHADOW-CHECKLIST.md)  
**客户端对接：** [`PROACTIVE_DECISION_IOS_HANDOFF.md`](../../src/trips/proactive-decision/PROACTIVE_DECISION_IOS_HANDOFF.md)  
**契约实现：** `src/trips/proactive-decision/`（Impact DTO · Case Mapper · Orchestrator · Synthesis · Intervention · Draft · ERC · Harness · Canary · **Validation Dataset**）  
**原则：** 接线优先，禁止平行新建 Decision Agent / Confirm-Apply 写链。

### 落地进度（2026-08-11 · Phase 5）

| ID | 状态 | 说明 |
|---|---|---|
| PD-0 ~ PD-10 | ✅ 冻结 | Observe→Apply 技术闭环；**永不回开 PD-11 扩能力** |
| Mobile BFF + 消费契约 | ✅ | L1/L2/Trace/Apply 已挂；iOS 完整体验 🟡 |
| **Phase 4 Production Readiness** | ✅ **FROZEN** | 见 [冻结稿](./PROACTIVE-DECISION-V1-PHASE4-PRODUCTION-READINESS.md) |
| **Phase 5 Validation** | 🔄 **ACTIVE** | Decision Dataset + Useful/Accept/FP；见 [验证计划](./PROACTIVE-DECISION-V1-PHASE5-VALIDATION.md) |

**当前状态一句话：**

> Phase 4 已冻结。Phase 5 只验证「什么时候值得出现」：写 Decision Dataset、算 Useful/Accept/FP、Shadow 收样本——**不要再加能力**。
**核心指标：**Useful Intervention Rate · Accept Rate · False Positive Rate · Regret Reduction（**不是**触发次数）。

**永久禁止：** Push · AutoApply · 平行 Decision Agent · PD-11。

---

## Phase 4 — Production Readiness（优先级重排）

**禁止：**继续开发 PD-11 / 扩 Case / 开 Push / AutoApply。

| 优先级 | 任务 | 状态 | 说明 |
|---|---|---|---|
| **P0** | 端到端三黄金案例联调 | ✅ harness | `harness/phase4-golden-cases.e2e.spec.ts` |
| **P0** | Decision Trace 可观测 | ✅ | `trace/proactive-decision-trace*` + surface/BFF 字段 |
| **P1** | Silent Learning → Travel Memory → Outcome Review | ✅ | `memory/ingest-proactive-silent-learning*` + Outcome Review；PD V1 开时默认写入 |
| **P1** | Shadow Canary（Stage 0） | ✅ | `shadow/*`：100% 可记、用户不可见；`proactiveDecisionV1ShadowLog` |
| **P1** | 真实 Trip 回放 | ✅ | `PROACTIVE_TRIP_REPLAY_SCENARIOS`（IS 自驾三黄金行程） |
| **P2** | L1 Passive | ✅ | 执行首页 / 今日行程 `proactiveL1Passive` 条带；非打断 |
| **P2** | L2 Interrupt | ✅ | 仅 High Value（`IV>0.2` ∧ `Confidence>0.9` ∧ Actionable）；未达则降级 L1 |
| **P3** | Push | 暂不做 | V1 禁止 |
| **P3** | Auto Apply | 永久关闭 | 禁止 |

### P0 — 端到端联调（最高优先）

重点不是「接口通不通」，而是完整体验链。

#### 黄金案例 Case A — 沿海大风（Reynisfjara）

| 项 | 要求 |
|---|---|
| 输入 | Reynisfjara · ~16:00 · Wind 14 → 25 m/s |
| 后端 | WorldSignal → Impact → DecisionProblem 正常 |
| 三人格 | Abu=required · Dr.Dre=required · Neptune=conditional |
| 合成输出 | Recommended Option · Confidence · Reason · Impact |
| 目标 | 继续 vs 调整 |
| iOS | 发生了什么 / 影响什么 / 建议什么 / 为什么 + 查看方案 / 暂不调整 |

#### 黄金案例 Case B — 道路关闭

| 项 | 要求 |
|---|---|
| 人格 | Abu + Neptune |
| 目标 | **必须 repair** |
| 硬约束 | **Hard Gate 不可绕过** |

#### 黄金案例 Case C — 活动天气窗口关闭

| 项 | 要求 |
|---|---|
| 人格 | Abu + Dr.Dre + Neptune |
| 目标 | 延期 / 替代活动 |

### P0 — Decision Trace 可观测

一次主动建议必须能回放「为什么产生」，示意：

```json
{
  "signal": "WIND_CHANGE",
  "impact": "REYNISFJARA_AFFECTED",
  "abu": { "risk": "HIGH" },
  "dre": { "utility_drop": true },
  "neptune": { "alternatives": 3 },
  "cgus": { "selected": "MOVE_TO_NEXT_DAY" },
  "intervention": { "value": 0.23 }
}
```

上线后用户问「为什么提醒我？」时，必须能解释。

### P1 — Silent Learning 接通（提前）

```text
Intervention Value → Below Threshold → Silent Learning
  → Travel Memory → Outcome Review
```

主动系统最重要的数据不只是 Accept，而是：**哪些建议没发出去，但其实应该发？**  
已接通：`ingestProactiveSilentLearningIntoMemoryLedger` + Outcome Review 启发式。

### P1 / P2 — Canary 策略（不要直接让用户看到）

| Stage | 名称 | 用户可见 | 行为 |
|---|---|---|---|
| **0** | Shadow | 否 | PD V1 开即可 **100% 记录** Shadow Log（`wouldNotify` / quality / Decision Trace）；`shouldRenderCard=false` |
| **1** | L1 Passive | 被动 | 优先**执行首页 / 今日行程**条带：「Nara 发现可能影响行程的变化」——不强提醒；**不以 Push 起家** |
| **2** | L2 Interrupt | 打断卡 | 仅 High Value：`IV > 0.2` ∧ `Confidence > 0.9` ∧ Actionable（`proactive-l2-high-value-gate`）；未达则**降级 L1 条带** |

全程：Push 暂不做 · AutoApply 永久关。

**真实 Trip 回放 SSOT：** `shadow/proactive-trip-replay.scenarios.ts`（Reynisfjara / F208 / 冰川窗口）。

### P2 — 产品体验约束（iOS 联调时核对）

1. **主动入口：**执行首页 / 今日行程，不做 Push 起家  
2. **卡片层级：**用户只看 发生了什么 → 为什么影响你 → 建议怎么办；**不展示「三人格」**（人格仅解释层 / Trace）  
3. **Confirm 闭环：**确认后必须回到 **Today's Plan**，不停留在 AI 对话  

---

## 0. 现状总判

| 结论 | 说明 |
|---|---|
| V1 契约已齐 | Observe→Impact→Case→Problem→Lens→Synthesis→Intervention→Draft→ERC→Harness→Canary |
| 编排已落地 | `ProactiveDecisionOrchestratorService`（flag 默认关） |
| 放量待会签 | Canary 默认 SHADOW；Push/AutoApply 永久关；写链另 flag |

```text
建议接线顺序（硬依赖）

P0  Observe SSOT 冻结
P1  Impact DTO + Case Mapper
P2  Decision Problem 写入既有 store + Trigger evaluate
P3  Lens Activation Policy
P4  CGUS 主动合成入口
P5  Intervention Gate 接线 + 三层卡
P6  Change Draft 投影
P7  Confirm → Apply 权威写链选定
P8  ERC / Mobile 只投影
P9  F1–F10 统一 Harness + 埋点
```

---

## 1. Workstream 总表

| ID | Workstream | Owner | 依赖 | 验收映射 |
|---|---|---|---|---|
| **PD-0** | 编排契约与 SSOT 校正 | Arch + Backend | — | 文档 + 类型契约 |
| **PD-1** | Observe（Weather/Road 摄取） | Backend | PD-0 | F1 |
| **PD-2** | Impact DTO + Case Mapper | Backend + Algo | PD-1 | F2, F3 |
| **PD-3** | Decision Runtime 接线 | Backend | PD-2 | F3 |
| **PD-4** | Lens Activation Policy | Algo + Backend | PD-3 | F4, F5, F9 |
| **PD-5** | CGUS 合成入口 | Algo + Backend | PD-4 | F6 |
| **PD-6** | Intervention Gate + Surface | Backend + Product + Client | PD-5 | F10, P1–P3 |
| **PD-7** | Change Draft → Confirm → Apply | Backend + Client | PD-6 | F7, F8 |
| **PD-8** | ERC 投影 / 队列 | Backend | PD-2, PD-7 | Surface |
| **PD-9** | Harness F1–F10 + 埋点 | Backend + Algo + QA | PD-7 | 全部 Must Pass |
| **PD-10** | Canary / Threshold 冻结 | Product + Algo | PD-6, PD-9 | 指标门禁 |

---

## 2. 分阶段任务（可直接开票）

### PD-0 — 编排契约与 SSOT 校正

**目标：** 冻结一条权威主链，消除双路径歧义。

| Task | 描述 | 产出 | DoD |
|---|---|---|---|
| PD-0.1 | 冻结 Observe SSOT = Guardian evidence events（Vedur / Gagnaveita / road.is 补洞） | [ADR-012](../architecture/ADR-012-Proactive-Decision-V1-SSOT.md) | ✅ |
| PD-0.2 | 冻结 Impact 产出方 = Guardian weather/road analyzer；ERC **不**重写 Impact | ADR-012 + `proactive-impact.types.ts` | ✅ |
| PD-0.3 | Confirm/Apply 权威写链 = **RFC-001 finalize**；Draft 可投影 Agent/ERC | ADR-012 §PD-0.3 | ✅ |
| PD-0.4 | Orchestrator 边界（类型 + 幂等键） | `orchestration/proactive-decision-orchestrator.types.ts` | ✅ 类型；Nest 服务待 PD-3 |
| PD-0.5 | 明确不使用 `proactive-decision-trigger.util.ts` 作为 V1 主入口（保留 NL 快路径） | ADR-012 旁路表 | ✅ |

**关键路径：**

- Ingest：`src/trips/guardian-decision-core/evidence/`
- Impact：`.../detection/weather-activity-impact-analyzer.ts`、road-close impact
- Trigger：`src/decision-runtime/trigger/decision-trigger.gateway.service.ts`
- 禁止充当主链：`src/agent/decision-support/proactive-decision-trigger.util.ts`

---

### PD-1 — Observe（Weather / Road）

**目标：** Weather/Road Update 稳定进入 PD 主链（F1）。

| Task | 描述 | 产出 | DoD |
|---|---|---|---|
| PD-1.1 | 盘点并白名单 V1 Trigger：风 / 暴雪 / 强降雨 / Road Closure / Difficulty / Availability | `signals/proactive-trigger-allowlist.util.ts` | ✅ |
| PD-1.2 | 将 Vedur / Gagnaveita 事件规范化为 `WorldSignal` | `signals/normalize-proactive-world-signal.util.ts` | ✅ |
| PD-1.3 | 订阅入口接到 Orchestrator（天气/道路 pipeline 可选接线） | Weather + Road pipelines + flag | ✅ flag 默认关 |
| PD-1.4 | 双路径收敛：`world-model-push` vs Guardian monitoring | 文档 + 代码注释 | ⏳ |

**种子测试：** `guardian-decision-core/evidence/evidence-resolver.weather.spec.ts`、vedur specs、`travel-ontology/.../weather-deterioration.detection.spec.ts`

---

### PD-2 — Impact DTO + Case Mapper

**目标：** 产出 RFC 形态 Impact，并映射三 Case（F2 / F3）。

| Task | 描述 | 产出 | DoD |
|---|---|---|---|
| PD-2.1 | 实现统一 Impact DTO | `contracts/proactive-impact.types.ts` + `toProactiveImpactWireJson` | ✅ 附录 A snake_case 导出 |
| PD-2.2 | 适配 weather / road impact → Impact DTO | `adapters/build-proactive-impact.util.ts` | ✅ |
| PD-2.3 | Case Mapper（仅三 Case） | `mappers/proactive-case.mapper.ts` | ✅ |
| PD-2.4 | `decisionRequired=false` 短路 | Mapper LOW / 无 affectedItems | ✅；Memory 落盘待 PD-6 |
| PD-2.5 | 对齐 ontology weather impact（`affectedPlanItemIds`）字段语义 | 对齐表 | ⏳ 与 PD-3 一并收敛 |

**关键路径：**

- `src/trips/guardian-decision-core/detection/`
- `src/travel-ontology/p1-weather-deterioration/weather-plan-impact.resolver.ts`
- ERC 仅消费：`src/trips/execution-risk-center/`（不在此重写 Impact）

---

### PD-3 — Decision Problem + Runtime 接线

**目标：** Impact → 既有 Decision Problem store → Trigger evaluate（F3）。

| Task | 描述 | 产出 | DoD |
|---|---|---|---|
| PD-3.1 | Impact+Case → RFC001 Decision Problem writer | `writers/open-proactive-decision-problem.util.ts` | ✅ 复用既有 store |
| PD-3.2 | 经 Trigger Gateway `CANONICAL_PROBLEM_EVALUATE` | `build-proactive-evaluate-trigger.util.ts` + catalog `lineage_only` | ✅ 返回 trigger；dispatch 由调用方/Gateway |
| PD-3.3 | 产品入口 kind：`PROACTIVE_WORLD_SIGNAL`（metadata） | trigger metadata + catalog id | ✅ |
| PD-3.4 | 收敛并行：ontology weather pilot vs Guardian L2 | 收敛说明 | ⏳ |

**关键路径：**

- `src/trips/guardian-decision-core/persistence/rfc001-decision-problem.store.ts`
- `src/decision-runtime/trigger/decision-trigger-wiring.catalog.ts`
- `src/decision-runtime/gateway/services/iceland-self-drive-situation-product.service.ts`

---

### PD-4 — Lens Activation Policy

**目标：** 按需激活 Abu / Dr.Dre / Neptune（F4 / F5 / F9）。

| Task | 描述 | 产出 | DoD |
|---|---|---|---|
| PD-4.1 | 实现 Activation Policy 配置与评估器 | `lenses/evaluate-lens-activation.util.ts` | ✅ |
| PD-4.2 | 天气风险默认：Abu + Dr.Dre 必参；Neptune 仅 `Need Alternative=true` | 同左 + 单测 | ✅ |
| PD-4.3 | 复用既有 strategies（策略调用待 PD-5 接线） | 输出 `lensOrder` 供下游 | ✅ 计划；执行待 CGUS |
| PD-4.4 | Hard Gate 不变量：HARD_BLOCK 不可被建议绕过 | `assert-hard-gate-invariant.util.ts` | ✅ |
| PD-4.5 | `mustAdjust` / `mustRepair` 强制全链路 | Policy + Orchestrator road 默认 mustRepair | ✅ |

**关键路径：**

- `src/trips/decision/strategies/{abu,dr-dre,neptune}-strategy.service.ts`
- `src/trips/decision/services/persona-closure-loop.service.ts`
- `src/trips/guardian-decision-core/adapters/abu-weather-activity-constraint.adapter.ts`
- Fixtures：`persona-closure.examples.ts`（含 froad-2wd）

---

### PD-5 — CGUS 主动合成入口

**目标：** Case 候选 → Recommended / Confidence / Reason / Impact（F6）。

| Task | 描述 | 产出 | DoD |
|---|---|---|---|
| PD-5.1 | 新增 PD 合成入口（编排调用，非平行 OPTIMIZE 产品） | `synthesis/synthesize-proactive-recommendation.util.ts` | ✅ 确定性 CGUS-shaped；`ProactiveCgusRankPort` 预留全量 CGUS |
| PD-5.2 | 输出契约对齐提醒卡 L3 + Intervention 评分字段 | `proactive-synthesis.types.ts` | ✅ Recommended / Confidence / Reason / Impact / improvement / actionability |
| PD-5.3 | Verify / Policy Gate 置于 CGUS 之后、Intervention 之前 | Hard Gate 再校验 | ✅ |
| PD-5.4 | 环境门控与现有 KERNEL_CGUS 纪律对齐，Canary 可关 | `PROACTIVE_DECISION_SYNTHESIS_ENABLED` / `PROACTIVE_DECISION_CGUS_SEARCH_ENABLED` | ✅ 全量 CGUS 默认关 |

**关键路径：** `src/trips/decision/optimization/cgus-search.service.ts`、`src/decision/kernel/optimization-engine-adapter.service.ts`

---

### PD-6 — Intervention Gate + 三层提醒卡

**目标：** 只在值得打断时通知；否则 Silent Learning（F10 / P1–P3）。

| Task | 描述 | 产出 | DoD |
|---|---|---|---|
| PD-6.1 | 将 CGUS 结果映射为 `InterventionCandidate`（复用 freeze 工具） | `evaluate-proactive-intervention.util.ts` | ✅ |
| PD-6.2 | 对齐公式：`Improvement × Confidence × Actionability − Attention Cost` | `compute-intervention-value.util.ts` | ✅ 默认可配置 `PROACTIVE_INTERVENTION_THRESHOLD` |
| PD-6.3 | Threshold SSOT 配置（初值 0.08） | env + resolve helper | ✅ |
| PD-6.4 | 未过阈 → Silent Learning → Travel Memory 落盘 | `ProactiveSilentLearningV1` + `ingestProactiveSilentLearningIntoMemoryLedger` | ✅ CANDIDATE；Outcome Review 启发式 |
| PD-6.5 | 过阈 → 装配三层卡 + 三按钮 | `build-proactive-reminder-card.util.ts` | ✅ |
| PD-6.6 | 通知权限：保持默认关闭（notifyUser/push/autoApply false） | Gate 输出恒关闭 | ✅ |
| PD-6.7 | 客户端：卡片渲染 +「为什么」 | iOS/FE | ✅ L1 条带契约已挂 BFF；L2 打断卡契约齐；客户端渲染联调中 |

**关键路径：**

- `src/agent/decision-intelligence/intervention-intelligence/`
- `src/agent/decision-intelligence/proactive-surface-pilot/`
- `src/agent/delivery/product/v1-journey-contract.util.ts`（`PROACTIVE_SURFACE_ONLY`）

---

### PD-7 — Change Draft → Confirm → Apply

**目标：** 建议可预览、可确认、可执行；禁止静默改行程（F7 / F8）。

| Task | 描述 | 产出 | DoD |
|---|---|---|---|
| PD-7.1 | CGUS 推荐 → Change Draft 投影 | `project-proactive-change-draft.util.ts` → `change_draft` 卡 | ✅ |
| PD-7.2 | `[查看方案]` / `[暂不调整]` / `[为什么]` | `handleProactiveReminderCta` | ✅ |
| PD-7.3 | Confirm → Apply 走 RFC-001 finalize 权威写链 | `ProactiveRfc001ApplyAdapterService` + Mobile `POST .../apply` | ✅ Nest finalize→authorize→execute；写链 flag 默认关 |
| PD-7.4 | Apply 后 Receipt / Verify 字段 | `ProactiveApplyReceiptV1` | ✅ |
| PD-7.5 | 无 Confirm 不得 Apply；无 Preview 不得 Confirm | lifecycle + 单测 | ✅ |

**关键路径：**

- Draft：`src/agent/delivery/conversation/adapters/from-itinerary-adjust.ts`
- Apply：`src/agent/orchestration/graph/nodes/intake-itinerary-adjust-apply.util.ts`
- ERC：`execution-risk-apply.service.ts` / `execution-risk-confirm-write.service.ts`
- Guardian：`rfc001-decision-finalize.service.ts`
- 矩阵：`src/trips/confirm-apply-idempotency.matrix.spec.ts`

---

### PD-8 — ERC / Mobile Surface（只投影）

**目标：** ERC 作为风险/调整队列与用户侧投影，不承担 Impact 重写。

| Task | 描述 | 产出 | DoD |
|---|---|---|---|
| PD-8.1 | 消费 PD Impact/Decision 投影到调整队列 | `erc/project-proactive-to-erc.util.ts` | ✅ 同源 decisionProblemId |
| PD-8.2 | 环境雷达/既有聚合与 PD 主链去重 | `dedupeProactiveErcProjections` | ✅ |
| PD-8.3 | Feature flags 与 PD Canary 对齐 | `proactive-decision-flag-matrix.util.ts` | ✅ 写链/Push 默认关 |

---

### PD-9 — F1–F10 统一 Harness + 埋点

**目标：** 一条回放覆盖 RFC 功能门禁；埋点可算 Accept / FP / Useful。

| Task | 描述 | 产出 | DoD |
|---|---|---|---|
| PD-9.1 | 新建 `proactive-decision-v1.harness.spec.ts` 串全链 | `harness/proactive-decision-v1.harness.spec.ts` | ✅ |
| PD-9.2 | Fixture：Reynisfjara / F-road / 冰川窗口 | `PROACTIVE_V1_HARNESS_FIXTURES` | ✅ |
| PD-9.3 | 复用并挂接既有种子测试 | `harness/README.md` | ✅ |
| PD-9.4 | 埋点事件 schema | `telemetry/proactive-telemetry.util.ts` | ✅ |
| PD-9.5 | Neptune Trigger / Silent Suppress / Accept Rate | reduce + compute helpers | ✅ |

**种子测试索引：**

| F# | 种子 |
|---|---|
| F1 | vedur / weather evidence specs |
| F2 | `iceland-weather-activity-l2.spec.ts`；road-close `ICE-IMPACT-001` |
| F3 | Guardian detector；weather-decision.builder |
| F4 | `abu-weather-activity-constraint.adapter.spec.ts`；persona-closure |
| F5 | `persona-closure.examples.ts`；repair-skip specs |
| F6 | `cgus-search.service.spec.ts` |
| F7 | `productization.spec.ts` PG-ADJUST；conversation-turn-result |
| F8 | `confirm-apply-idempotency.matrix.spec.ts`；execution-risk-p0 harness |
| F9 | road-close `ICE-BLOCK-001`；`persona-closure-froad-2wd-001` |
| F10 | `intervention-intelligence.spec.ts`；`proactive-surface-pilot.spec.ts` |

---

### PD-10 — Canary / Threshold 冻结

**目标：** 产品可感知主动决策，且默认不打扰。

| Task | 描述 | 产出 | DoD |
|---|---|---|---|
| PD-10.1 | 冻结 Threshold 初值与 Canary 人群/场景 | `proactive-canary-config.util.ts` + Canary Plan | ✅ Threshold=0.08 |
| PD-10.2 | 仅 L1 Passive → 再 L2 In-App Interrupt（Push 仍默认关） | Canary Plan §1 | ✅ |
| PD-10.3 | 观察 Accept / FP / Useful / Query Reduction | telemetry + `evaluateProactiveCanaryAdvance` | ✅ |
| PD-10.4 | 产品成功表述抽检（定性） | Canary Plan §5 访谈清单 | ✅ 模板；执行待会签波次 |

---

## 3. 权威主链（冻结建议）

```text
Vedur / Gagnaveita / road.is  (WorldSignal)
        ↓
ProactiveDecisionOrchestrator
        ↓
Guardian Impact Analyzers → Impact DTO
        ↓
Case Mapper (三 Case only)
        ↓
RFC001 Decision Problem Store
        ↓
Trigger Gateway evaluate
        ↓
Lens Activation → Abu / Dr.Dre / (Neptune?)
        ↓
CGUS → Verify / Hard Gate
        ↓
Intervention Gate
   ├── Silent Learning → Travel Memory
   └── Three-layer Card → Change Draft → Confirm → Apply
                              (权威写链：PD-0.3 选定)
        ↓
ERC / Mobile 投影（只读队列 + 同源 ID）
```

**明确旁路（V1 不依赖）：**

- `src/trips/observer/` collapse 内核  
- NARA Look / RealityOS（并行通道）  
- `proactive-decision-trigger.util.ts`（NL 启发式）  

---

## 4. 建议迭代切片（已完成 S1–S3 技术闭环 → 进入 Phase 4）

| 阶段 | 交付 | 用户可见？ |
|---|---|---|
| **S1–S3** | PD-0 ~ PD-10 技术闭环 + Mobile BFF | 否（默认 Shadow / flag 关） |
| **Phase 4 P0** | 三黄金案例 E2E + Decision Trace | 否（联调 / Shadow） |
| **Phase 4 P1** | Silent Learning 落盘 + Shadow Canary + 真实 Trip 回放 | 否（用户不可见） |
| **Phase 4 P2** | L1 Passive → L2 High-Value Interrupt | 逐步可见 |
| **不做** | PD-11 · Push · AutoApply | — |

---

## 5. 风险与禁止项

| 风险 | 缓解 |
|---|---|
| 把 ERC 当成 Impact Engine 重写 | PD-0.2 / PD-8：ERC 只投影 |
| 平行 Confirm-Apply | PD-0.3 一票否决第三套写链 |
| 全量三人格过触发 | PD-4.2 默认 Neptune 按需 |
| 过早开 Push | PD-6.6 / PD-10.2 默认关 |
| Observer 路径表误导研发 | 以本文 §3 为准，回写 RFC 映射表 |

**禁止：**

1. 新建第二套 Decision Agent  
2. Recommendation → 自动 Apply  
3. 全局 `proactive=true` 授权通知  
4. V1 纳入酒店价格 / 餐厅排队 / 兴趣变化  

---

## 6. 开票优先级（立刻可做）

1. **PD-0.1–0.4** 架构会：Observe SSOT + Impact DTO + 写链选定 + Orchestrator 边界  
2. **PD-2.1–2.3** Impact DTO + 三 Case Mapper（最大产品杠杆）  
3. **PD-9.1** Harness 骨架（先挂 F1–F3 空断言，防漂移）  
4. **PD-4.1–4.2** Lens Policy（算法可并行）  
5. **PD-6.2–6.3** Intervention 公式对齐 + Threshold 草稿（产品并行）  

---

## 7. 会签

| 角色 | 日期 | 结论 |
|---|---|---|
| Architecture | | ☐ |
| Backend | | ☐ |
| Algorithm | | ☐ |
| Product | | ☐ |
| Client | | ☐ |
