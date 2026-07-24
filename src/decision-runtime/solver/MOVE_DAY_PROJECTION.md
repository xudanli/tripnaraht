# MOVE_DAY Projection — P4.d

> Shadow 投影完成；**不写 Plan Version**。  
> Flag：`OR_TOOLS_MOVE_DAY_SHADOW=1`（Nest + sidecar）。

## 映射

| 源 | 目标 | 备注 |
|----|------|------|
| `diffHint.movedDayPairs` | RFC001 `MOVE_ITEM` | `parameters.operation=MOVE_DAY`, `shadowOnly=true` |
| 各 `dayPlans[]` | RFC001 `MOVE_ITEM` reorder | `orderedNodeIds` + `dayIndex` |
| 同上 | `PlanProposalChange[]` | note 含 `[ortools-shadow] MOVE_DAY` |
| 多日 `dayPlans` | `RoutePlanDraft` | 先改 `dayIndex` 再按日排序 |

实现：[`adapters/ortools-move-day-projection.util.ts`](./adapters/ortools-move-day-projection.util.ts)

## Apply 隔离

`selectAuthoritativePlanProposalChanges` 过滤 `ortools-shadow`+`MOVE_DAY` notes。  
`isOrtToolsMoveDayShadowApplyLeak` 检测误 apply。

## 非目标

- ❌ 自动 authorize / execute  
- ❌ 默认开启 flag  
- ❌ 冒充 Native CP-SAT  
