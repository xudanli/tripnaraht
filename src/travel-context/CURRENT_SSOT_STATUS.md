# TravelContext SSOT 状态（P0-2）

> 代码常量：[`current-ssot-status.constants.ts`](./current-ssot-status.constants.ts)

## 冻结口径

| | |
|--|--|
| **当前运行 SSOT** | `OrchestratorState` + `DecisionState` / DSO 双轨 |
| **目标上下文 SSOT** | RFC-003 `TravelContext` |
| **本轮** | 仅标注；**不**贯通 Claude SM 主链 |

## 迁移表

| 数据 | 当前来源 | 目标来源 |
|------|----------|----------|
| Trip binding | Orchestrator metadata / `trip_id` | `TravelContextIdentity` |
| Effective Plan | 多处 `plan_version` / `planVersionId` | `effectivePlanVersionId` |
| Research snapshot | conversation / DSO | TravelContext evidence |
| Team constraints | research metadata | TravelContext constraints |
| Page context | client meta | PageAIContract / TravelContext |
