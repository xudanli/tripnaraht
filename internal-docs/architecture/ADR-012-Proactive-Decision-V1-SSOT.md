# ADR-012: Proactive Decision V1 — Observe / Impact / Apply SSOT

**Status:** Accepted（Freeze Candidate 配套）  
**Date:** 2026-08-11  
**Scope:** TripNARA Proactive Decision V1 权威主链边界  
**Related:** [RFC-PD-001](../product/rfc-proactive-decision-v1.md) · [Engineering Backlog](../product/rfc-proactive-decision-v1-engineering-backlog.md) · ADR-011  

---

## Context

RFC-PD-001 将产品模块映射到多个代码目录后，工程上出现歧义：

1. `src/trips/observer/` 是认知 collapse 内核，**不是**天气/道路摄取入口  
2. `execution-risk-center` 擅长风险投影与 Confirm 写链消费，**不是** Impact 主产方  
3. Weather/Road 已有 Guardian L2（Vedur / Gagnaveita → impact → Decision Problem → finalize）与 Agent itinerary-adjust Draft 两套 Confirm/Apply 相关路径  

V1 若不清 SSOT，会平行造 Orchestrator / 第二套写链。

---

## Decision

### PD-0.1 — Observe SSOT

**权威 WorldSignal 来源（V1）：**

| Signal | Source |
|---|---|
| Weather（风 / 暴雪 / 强降雨） | `guardian-decision-core/evidence/` Vedur collector + weather hazard events |
| Road（Closure / Difficulty / Availability） | Gagnaveita collector + `road.is` skill 补洞 |

**明确旁路：**

- `src/trips/observer/` · `observer-rewrite/` — 不作为 V1 摄取  
- NARA Look / `travel-observation/` — 并行 Reality 通道，不阻塞 PD V1  
- `proactive-decision-trigger.util.ts` — 仅 NL 启发式，不充当 PD Orchestrator  

### PD-0.2 — Impact 产出方

**Impact 主产：** Guardian analyzers

- `detection/weather-activity-impact-analyzer.ts`
- `detection/road-close-impact-analyzer.ts`
- （语义对齐）`travel-ontology/p1-weather-deterioration/`

**统一产品契约：** `nara.proactive_impact@v1`  
实现路径：`src/trips/proactive-decision/`

**ERC 职责：** 消费 Impact / Decision 投影到调整队列与用户风险表面；**禁止**在 ERC 内重写 Impact 语义。

### PD-0.3 — Confirm / Apply 权威写链

| 阶段 | 权威 |
|---|---|
| Recommendation → Change Draft / Preview | 可复用 Agent `change_draft` 卡或 ERC recommendation preview（只读投影） |
| **Confirm → Apply（世界变化驱动的行程落盘）** | **Guardian RFC-001 finalize / PlanVersion materialize** |
| ERC Confirm Write flags | 可作为风险中心 UX / 队列确认入口，但必须委托同一 DecisionCore finalize，**不得**平行写 itinerary |

**禁止：** Recommendation 静默 Apply；新建第三套写链。

### PD-0.4 — Orchestrator 边界

引入薄编排层 `ProactiveDecisionOrchestrator`（纯接线，非新 Agent）：

```text
WorldSignal → Impact DTO → Case Mapper → RFC001 Decision Problem
  → Trigger evaluate → (后续) Lens → CGUS → Intervention → Draft
```

- 幂等键建议：`tripId + signalEventId + caseId`  
- Feature flag 可关全链  
- 不拥有独立人格引擎 / 独立 problem store  

---

## Consequences

- 研发按 `src/trips/proactive-decision/` 契约接线，不再争论 Observer/ERC 是否「就是」Impact  
- Harness F1–F10 以 Guardian evidence fixtures 为种子  
- 后续 PD-3+ 只增加适配器与策略配置，不搬迁 Guardian 核心  

## Alternatives considered

1. **以 ERC 为 Impact Engine** — 与现有 analyzer / L2 harness 重复，拒绝  
2. **以 Agent itinerary-adjust Apply 为世界信号权威写链** — 缺 DecisionLedger / PlanVersion 审计，拒绝作为 PD 主写链  
3. **新建 Proactive Agent 运行时** — 违反 RFC 禁止项，拒绝  
