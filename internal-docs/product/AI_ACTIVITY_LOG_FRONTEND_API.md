# AI 活动记录 · 前端接口文档

> 对应 UI：AI 活动记录页（今日统计 + 时间线 + 详情侧栏）  
> 版本 1.0.0 · 2026-07-04  
> 类型参考：`src/trips/travel-status/dto/frontend-travel-status-api.types.ts`

---

## 1. 页面与接口

| UI 区块 | 接口 | 说明 |
|---------|------|------|
| 今日统计卡片 | `GET .../ai-activity-log` → `summary` | 动作数 / 自动完成 / 等待确认 / 最近重验证 |
| 时间线 + Tab 筛选 | 同上 → `items[]` + `filterTags` | 前端按 Tab 过滤 |
| 详情侧栏 | `GET .../ai-activity-log/:activityId` | 执行原因 / 依据 / 撤销 |
| 撤销操作 | `POST .../ai-completed-work/:logId/undo` | 沿用现有 undo API |
| 查看方案 | `GET .../decision-queue/:problemId` | 待确认项 |

**推荐加载：**

```text
GET /api/trips/:tripId/ai-activity-log
→ 选中首条或用户点击项
GET /api/trips/:tripId/ai-activity-log/:activityId
```

授权中心「最近自动执行记录」仍可用 `travel-status.aiCompletedWork`（最近 10 条摘要）；完整时间线用本接口。

---

## 2. `GET /api/trips/:tripId/ai-activity-log`

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.ai_activity_log@v1",
    "tripId": "trip-1",
    "generatedAt": "2026-07-04T15:10:00.000Z",
    "summary": {
      "todayActionCount": 18,
      "todayActionDelta": 6,
      "autoCompletedCount": 14,
      "autoCompletedPct": 78,
      "waitingConfirmCount": 2,
      "waitingConfirmPct": 11,
      "latestRevalidation": {
        "activityId": "acl_abc",
        "occurredAt": "2026-07-04T15:10:00.000Z",
        "title": "完成重验证"
      }
    },
    "filters": ["ALL", "AUTO", "WAITING_CONFIRM", "WRITTEN_BACK", "CANCELLED"],
    "items": [
      {
        "activityId": "acl_abc",
        "eventId": "EVT-20260704-1432-ABC1",
        "occurredAt": "2026-07-04T14:32:00.000Z",
        "category": "MONITORING",
        "categoryLabel": "环境监控",
        "filterTags": ["ALL", "AUTO", "WRITTEN_BACK"],
        "statusTag": "AUTO_EXECUTED",
        "statusLabel": "已自动执行",
        "title": "自动重新检查天气",
        "reason": "第 3 天风速发生变化",
        "problemId": "problem_1",
        "automatic": true,
        "reversible": true,
        "actions": {
          "viewEvidence": { "enabled": true, "href": "/trips/trip-1/decision-queue/problem_1" },
          "viewDiff": { "enabled": true, "href": "/trips/trip-1/ai-activity-log/acl_abc" },
          "viewPlan": { "enabled": false }
        },
        "detailHref": "/trips/trip-1/ai-activity-log/acl_abc"
      }
    ]
  }
}
```

### UI 映射

| UI | 字段 |
|----|------|
| 今日 AI 动作数 | `summary.todayActionCount` |
| 较昨日 | `summary.todayActionDelta`（正数展示 `+N`） |
| 自动完成 | `summary.autoCompletedCount` / `autoCompletedPct` |
| 等待确认 | `summary.waitingConfirmCount` / `waitingConfirmPct` |
| 最近重验证 | `summary.latestRevalidation` |
| Tab 筛选 | 客户端过滤 `items[].filterTags` |
| 时间线图标 | `category` → 前端 icon map |
| 状态标签 | `statusLabel` |
| 查看依据 | `actions.viewEvidence` |
| 查看差异 | `actions.viewDiff` |
| 查看方案 | `actions.viewPlan` |

### Tab 与 `filterTags`

| Tab | 过滤条件 |
|-----|---------|
| 全部 | 所有 `items` |
| 已自动执行 | `filterTags` 含 `AUTO` |
| 等待确认 | 含 `WAITING_CONFIRM` |
| 已写回 | 含 `WRITTEN_BACK` |
| 已撤销 | 含 `CANCELLED` |

### `category` 枚举

| 值 | UI 图标建议 |
|----|------------|
| `MONITORING` | 天气/监控 |
| `TIME_ROUTE` | 路线/时间 |
| `ACTIVITY` | 活动/体验 |
| `BUDGET_BOOKING` | 预算/预订 |
| `SAFETY` | 安全 |
| `TEAM_PRIVACY` | 团队 |
| `VALIDATION` | 重验证/可行性 |
| `OTHER` | 默认 |

---

## 3. `GET /api/trips/:tripId/ai-activity-log/:activityId`

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.ai_activity_log_detail@v1",
    "tripId": "trip-1",
    "activityId": "acl_abc",
    "eventId": "EVT-20260704-1510-ABC1",
    "occurredAt": "2026-07-04T15:10:00.000Z",
    "statusTag": "USER_CONFIRMED",
    "statusLabel": "用户确认",
    "title": "完成重验证",
    "executionReason": "行程已更新…需要重新验证整体可行性…",
    "evidence": [
      { "label": "实时天气", "detail": "置信度 HIGH · 新鲜度 FRESH", "updatedAt": "2026-07-04T15:05:00.000Z" },
      { "label": "行程规则", "detail": "影响第 2、3 天" }
    ],
    "impactMetrics": {
      "feasibilityScore": { "before": 87, "after": 91 },
      "riskLevel": { "before": "低", "after": "低" }
    },
    "confirmedBy": { "userId": "user_1", "displayName": "Danny" },
    "reversible": true,
    "undo": { "enabled": true, "logId": "acl_abc", "undoActionId": "original" }
  }
}
```

> `impactMetrics.feasibilityScore` 在后续 apply 链写入后逐步补齐；无数据时字段省略。

| UI | 字段 |
|----|------|
| 执行原因 | `executionReason` |
| 使用依据 | `evidence[]` |
| 修改前后 | `impactMetrics` |
| 确认人 | `confirmedBy` |
| 撤销此操作 | `undo.enabled` → `POST .../ai-completed-work/:logId/undo` |

---

## 4. 数据来源（后端 SSOT）

| 来源 | 存储 | 用途 |
|------|------|------|
| 自动修改 | `trip.metadata.automationChangeLog` | 已写回 / 可撤销 |
| 决策 resolution | `trip.metadata.decisionProblemResolutions` | 用户确认 / 自动 apply |
| 待确认 | Decision Queue 开放项 | 等待确认 Tab |
| 动作分类 | `automation-action.catalog` | `category` / 标题 |

**C 端勿用：** `autoAllowed` / `confirmationRequired` 作活动记录展示源。

---

## 5. 相关文档

- [AUTOMATION_AUTHORIZATION_CENTER_FRONTEND_API.md](./AUTOMATION_AUTHORIZATION_CENTER_FRONTEND_API.md) — 授权中心  
- [AI_AUTOMATION_AUTHORIZATION_CENTER.md](./AI_AUTOMATION_AUTHORIZATION_CENTER.md) — 产品 SSOT
