# Departure Gate API

> **Schema**: `tripnara.departure_gate@v1`  
> **Base**: `/api/trips/:tripId/departure-gate`  
> **SSOT**: [`PRODUCT_READINESS_MODEL.md`](../../../internal-docs/product/PRODUCT_READINESS_MODEL.md)

## 职责

组合门控 — **不重新计算规则**，聚合：

| 输入 | 来源 |
|------|------|
| `planVerdict` | `GET /feasibility-report` |
| `preparationVerdict` | Readiness Pack（出发准备域）+ checklist + finding marks |
| `evidenceFreshness` | feasibility 版本 / stale |

## GET `/api/trips/:tripId/departure-gate`

### Response `data`

| 字段 | 说明 |
|------|------|
| `status` | `READY` · `BLOCKED_BY_PLAN` · `BLOCKED_BY_PREPARATION` · `BLOCKED_BY_BOTH` · `REVALIDATION_REQUIRED` |
| `canStartExecution` | **组合结论** — 可以出发 |
| `canStartExecutePlanOnly` | 仅计划侧（≈ 历史 `feasibility-report.canStartExecute`） |
| `planVerdict` | 行程方案判决 |
| `preparationVerdict` | 出发准备判决 |
| `evidenceFreshness` | 验证时效 |
| `travelStatusSummary` | 三行摘要（非加权总分） |
| `links` | 深链 |

### 状态优先级

1. `REVALIDATION_REQUIRED` — 未验证或 `isStale`
2. `BLOCKED_BY_BOTH`
3. `BLOCKED_BY_PLAN`
4. `BLOCKED_BY_PREPARATION`
5. `READY`

### 示例

```json
{
  "success": true,
  "data": {
    "schema": "tripnara.departure_gate@v1",
    "tripId": "3e4a1058-9218-467f-988a-c18008a14385",
    "status": "BLOCKED_BY_BOTH",
    "canStartExecution": false,
    "canStartExecutePlanOnly": false,
    "planVerdict": {
      "status": "NOT_EXECUTABLE",
      "canExecutePlan": false,
      "headline": "行程方案暂不可执行",
      "mustHandleCount": 2,
      "isStale": false
    },
    "preparationVerdict": {
      "status": "BLOCKED",
      "canDepartByPreparation": false,
      "openBlockerCount": 1,
      "completionPercent": 45,
      "headline": "出发准备有阻塞项"
    },
    "travelStatusSummary": {
      "planLabel": "行程方案暂不可执行",
      "preparationLabel": "出发准备有阻塞项",
      "validationLabel": "验证：今天 14:30"
    }
  }
}
```

## 与 legacy 字段

| Legacy | 替换 |
|--------|------|
| `feasibility-report.canStartExecute` | `canStartExecutePlanOnly` 或 `planVerdict.canExecutePlan` |
| 用户「能不能出发」 | `canStartExecution` |

## C 端映射

| `status` | 用户文案 |
|----------|----------|
| `READY` | 可以出发 |
| `BLOCKED_BY_PLAN` | 需先调整行程方案 |
| `BLOCKED_BY_PREPARATION` | 尚有出发准备事项未完成 |
| `BLOCKED_BY_BOTH` | 行程与出发准备均需处理 |
| `REVALIDATION_REQUIRED` | 行程已变更，请重新验证 |
