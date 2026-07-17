# Nara Contextual Copilot

**产品名：** Nara Contextual Copilot（页面上下文副驾驶）  
**工程名：** Page Insight Layer

| 文档 | 说明 |
|------|------|
| [ADR-010](./ADR-010-Nara-Contextual-Copilot-Page-Insight.md) | 架构边界、两段式 Context、contextHash、验收 |
| [PAGE_INSIGHT_API.md](./PAGE_INSIGHT_API.md) | evaluate / get / feedback 契约 |
| [FRONTEND_INSIGHT_CARD.md](./FRONTEND_INSIGHT_CARD.md) | Insight Card + Preview 接线（四页共用一张卡） |
| [ACTIVITY_EDITOR_AI_POLICY.md](./ACTIVITY_EDITOR_AI_POLICY.md) | 活动编辑页对象级 |
| [ITINERARY_DAY_EDITOR_AI_POLICY.md](./ITINERARY_DAY_EDITOR_AI_POLICY.md) | 日程编排日期级 |
| [PLANNING_OVERVIEW_AI_POLICY.md](./PLANNING_OVERVIEW_AI_POLICY.md) | 规划概览行程级 |
| [EXECUTION_HOME_AI_POLICY.md](./EXECUTION_HOME_AI_POLICY.md) | 执行首页行中实时 |
| [DECISION_CASE_AI_POLICY.md](./DECISION_CASE_AI_POLICY.md) | uiGroup 打扰 × semanticKey AI Contract |
| [GENERIC_CONFLICT_AI_POLICY.md](./GENERIC_CONFLICT_AI_POLICY.md) | 午餐等通用冲突：验证门禁优先于提示词 |
| [`contracts/page-insight.types.ts`](./contracts/page-insight.types.ts) | 冻结 TS 类型 |
| [`contracts/page-ai-contracts.ts`](./contracts/page-ai-contracts.ts) | live：决策空间 / 活动 / 日程 / 规划概览 / 执行首页 |
| [`dto/frontend-page-insight-api-client.ts`](./dto/frontend-page-insight-api-client.ts) | Web/iOS 客户端 |

**边界一句话：** Orchestrator 只解释与建议；Decision Core / Plan Proposal 裁决；Action Gateway / arrange-itinerary 写入。

## Live Vertical Slices

```
DECISION_SPACE
ACTIVITY_EDITOR → arrange-itinerary proposal
ITINERARY_DAY_EDITOR → feasibility + repair proposal
PLANNING_OVERVIEW → queue + readiness summary（仅导航）
EXECUTION_HOME → delay / risk / advisory（Banner）
```

**顺序：** 活动编辑 → 日程编排 → 规划概览 → 执行首页

**API：** `POST /api/trips/:tripId/copilot/page-insights:evaluate`  
**不新增写通道。**
