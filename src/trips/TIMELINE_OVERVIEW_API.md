# 行程详情 · 时间轴 Tab 聚合 BFF API

> **版本**: 1.0.0  
> **Base**: `/api/trips/:tripId/timeline-overview`  
> **状态**: 已实现  
> **关联 UI**: `TripDetailTimelineTab`  
> **关联文档**: [TRIP_FILES_API.md](./TRIP_FILES_API.md)、[TRIP_DETAIL_API_DOCUMENTATION.md](./TRIP_DETAIL_API_DOCUMENTATION.md)

**最后更新**: 2026-07-02

---

## 1. 概述

时间轴 Tab 顶部统计（可行性 / 节奏 / 冲突）与侧栏（规划进度、待办、今日提醒）原先为前端 mock 或多接口拼装。本 BFF **一次聚合**以下读模型：

| 聚合源 | 原路径 |
|--------|--------|
| 冲突 → 可行性分数 | `GET /trips/:id/conflicts` |
| 指标 → 节奏分数 | `GET /trips/:id/metrics` |
| **整体准备度** | `GET /trips/:id/overall-readiness`（五维投影） |
| 规划进度（兼容内部） | `GET /trips/:id/pipeline-status` |
| 待办 | `GET /trips/:id/tasks` |
| 提醒 | `GET /trips/:id/persona-alerts` |
| 新建议数 | `GET /trips/:id/suggestions?status=new` |
| 待确认预订 | DB `ItineraryItem.bookingStatus` |
| 待补充文件 | `GET /trips/:id/files/stats`（可选） |

---

## 2. `GET /api/trips/:tripId/timeline-overview`

### Query

| 参数 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `include` | 否 | `stats,pipeline,tasks,reminders,readiness` | 逗号分隔：`stats` `pipeline` `tasks` `reminders` `readiness` `suggestions` `health` |
| `preset` | 否 | — | `shell` → `stats,readiness`；`full` → phase-2（含 readiness，无 suggestions 列表）。显式 `include` 优先 |

**首屏推荐：** `?preset=shell`（含整体准备度卡片）

**Suggestions 列表：** 默认不含；角标用 `stats.newSuggestionCount`。需要列表时追加 `suggestions`。

### 响应 `data`

```typescript
interface TimelineOverviewResponse {
  tripId: string;
  stats: {
    feasibilityScore: number;       // 0–100，由冲突严重度推导
    paceScore: number;              // 0–100，由 metrics 平均疲劳推导
    conflictCount: number;
    pendingConfirmationCount: number; // NEED_BOOKING / 未订 accommodation 等
    filesPendingCount?: number;     // trip_files PENDING（模块可用时）
    newSuggestionCount: number;
  };
  /** 内部 pipeline；主 UI 用 overallReadiness */
  planning: {
    progressPercent: number;
    completedStages: number;
    totalStages: number;
    currentStageName?: string;
    stages: PipelineStage[];
  };
  overallReadiness?: {
    score: number;
    state: string;
    stateLabelZh: string;
    evidenceConfidence: number;
    blockerCount: number;
    pendingConfirmationCount: number;
    dimensions: Array<{ code: string; labelZh: string; score: number }>;
    topPriority?: { title: string; actionCode?: string };
    reportDeepLink: string;
  };
  tasks: Task[];
  incompleteTaskCount: number;
  todayReminders: PersonaAlert[];
  health?: TripHealth;
  generatedAt: string;
}
```

### 分数计算规则

| 字段 | 规则 |
|------|------|
| `feasibilityScore` | 100 − Σ(冲突扣分)；HIGH −25、MEDIUM −15、LOW −5，上限扣 95 |
| `paceScore` | `100 − avg(每日 fatigue)`，fatigue 来自 metrics |
| `overallReadiness.score` | 五维加权；见 [OVERALL_TRIP_READINESS_API.md](./overall-readiness/OVERALL_TRIP_READINESS_API.md) |
| `planning.progressPercent` | 内部：`completedStages / totalStages × 100`（非主分数） |
| `pendingConfirmationCount` | `NEED_BOOKING`/`PENDING`/`UNBOOKED`，或需预订类型且无确认状态 |

### 示例

```bash
curl -s "http://localhost:3000/api/trips/{tripId}/timeline-overview"
curl -s "http://localhost:3000/api/trips/{tripId}/timeline-overview?include=stats,tasks,health"
```

```json
{
  "success": true,
  "data": {
    "tripId": "trip-uuid",
    "stats": {
      "feasibilityScore": 60,
      "paceScore": 76,
      "conflictCount": 3,
      "pendingConfirmationCount": 2,
      "filesPendingCount": 1,
      "newSuggestionCount": 4
    },
    "planning": {
      "progressPercent": 50,
      "completedStages": 3,
      "totalStages": 6,
      "currentStageName": "风险评估与缓冲",
      "stages": []
    },
    "overallReadiness": {
      "score": 78,
      "state": "NEAR_READY",
      "stateLabelZh": "接近就绪",
      "evidenceConfidence": 81,
      "blockerCount": 0,
      "pendingConfirmationCount": 3,
      "dimensions": [
        { "code": "ROUTE", "labelZh": "路线", "score": 84 },
        { "code": "ACCOMMODATION", "labelZh": "住宿", "score": 100 },
        { "code": "TRANSPORT", "labelZh": "交通", "score": 68 },
        { "code": "ACTIVITY", "labelZh": "活动", "score": 72 },
        { "code": "MEMBER", "labelZh": "成员", "score": 60 }
      ],
      "topPriority": {
        "title": "租车保险方案尚未确认",
        "actionCode": "CONFIRM_RENTAL_INSURANCE"
      },
      "reportDeepLink": "/api/trips/trip-uuid/overall-readiness"
    },
    "tasks": [],
    "incompleteTaskCount": 2,
    "todayReminders": [],
    "generatedAt": "2026-07-02T12:00:00.000Z"
  }
}
```

### 容错

子数据源失败时 **降级为空/默认值**，不阻断整包响应；失败项写入服务端 warn 日志。

---

## 3. 前端对接

类型与 client 见 [`TRIP_DETAIL_TAB_FRONTEND.md`](./TRIP_DETAIL_TAB_FRONTEND.md)。

```typescript
// 建议封装
tripTimelineApi.getOverview(tripId, { include?: string })

// TripDetailTimelineTab 首屏（与 GET /trips/:id 并行）
const [trip, overview] = await Promise.all([
  tripsApi.getById(id),
  tripTimelineApi.getOverview(id),
]);

// 替换 mock
overview.stats.feasibilityScore  // 原 62%
overview.stats.paceScore         // 原 76
overview.stats.conflictCount     // 原 3
overview.overallReadiness        // 主卡片：整体准备度
overview.tasks                   // 侧栏待办
overview.todayReminders          // 侧栏提醒
overview.planning.progressPercent // 仅内部兼容，勿作主分数
```

---

## 4. 代码索引

| 路径 | 说明 |
|------|------|
| `services/timeline-overview.service.ts` | BFF 聚合 |
| `utils/timeline-overview.util.ts` | 分数 / 进度计算 |
| `dto/timeline-overview.dto.ts` | 响应类型 |
| `trips.controller.ts` | 路由 |

---

## 5. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-07-02 | 初版：时间轴 Tab P1 BFF |
