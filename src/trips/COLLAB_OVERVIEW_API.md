# 行程详情 · 成员 Tab 协作聚合 BFF API

> **版本**: 1.0.0  
> **Base**: `/api/trips/:tripId/collab-overview`  
> **状态**: 已实现  
> **关联 UI**: `TripDetailMembersTab`、`useCollabOverview`  
> **关联文档**: [DECISION_PROFILING_API.md](./decision-profiling/DECISION_PROFILING_API.md)、[TIMELINE_OVERVIEW_API.md](./TIMELINE_OVERVIEW_API.md)

**最后更新**: 2026-07-02

---

## 1. 概述

成员 Tab 原先通过 `useCollabOverview` 并行 7+ 接口，协作进度/讨论数在无数据时用 `collab-team-health.ts` heuristic。本 BFF **一次聚合**：

| 聚合源 | 原路径 |
|--------|--------|
| 协作者 | `GET /trips/:id/collaborators` |
| 协商任务 | `GET /trips/:tripId/collaborative-tasks` |
| 领域主张摘要 | `GET /trips/:tripId/domain-influence` |
| Silent Vote | `GET /trips/:tripId/silent-votes` |
| 决策画像 onboarding | `GET /trips/:tripId/decision-profiling/onboarding` |
| 摩擦雷达（摘要） | `GET /trips/:tripId/decision-profiling/friction-radar` |
| 心愿摘要 | `GET /trips/:tripId/wishes/summary` |
| Optimization V2 团队 | 仅返回 `teamId` + `fetchPath`（完整团队仍 `GET /v2/user/team/:teamId`） |

---

## 2. `GET /api/trips/:tripId/collab-overview`

### Query

| 参数 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `include` | 否 | 全部 | `members` `tasks` `domain` `votes` `profiling` `wishes` `health` |
| `preset` | 否 | — | `shell` → `include=members,health`；`full` → 默认全量。显式 `include` 优先 |

**首屏推荐：** `?preset=shell`（冰岛 fixture p95 ~80ms vs 全量 ~1.5s）

### 响应 `data`（核心字段）

```typescript
interface CollabOverviewResponse {
  tripId: string;
  teamId?: string | null;
  team?: { teamId: string | null; fetchPath: string | null };
  memberCount: number;
  travelerCount?: number;
  collaborators: Array<{
    id: string;
    userId: string;
    email?: string | null;
    displayName?: string | null;
    role: string;
  }>;
  teamHealth: {
    progressPercent: number;    // 画像 35% + 领域 35% + 协商任务 30%
    discussionCount: number;      // in_discussion + pending 任务 + open 投票
    highFrictionCount: number;
    compatibilityBand?: 'high' | 'needs_negotiation' | 'high_risk';
    status: 'healthy' | 'attention' | 'at_risk';
  };
  collaborativeTasks: CollaborativeTaskItem[];
  collaborativeTaskCount: number;
  domainInfluence?: {
    memberCount: number;
    completionRate: number;
    rulesConfirmed: boolean;
    balanceWarningCount: number;
    allMembersClaimed: boolean;
  };
  openSilentVoteCount: number;
  silentVotes: Array<{ id: string; title: string; status: string; closesAt?: string | null }>;
  profilingOnboarding?: OnboardingStatus;
  frictionRadar?: {
    completionRate: number;
    highRiskAlerts: FrictionAlert[];
    compatibility: ConsumptionCompatibility;
    computedAt: string;
  };
  wishSummary?: {
    privateCount: number;
    mineCount: number;
    teamCount: number;
    agentEligibleCount: number;
  };
  generatedAt: string;
}
```

### teamHealth 计算

| 字段 | 规则 |
|------|------|
| `progressPercent` | `profilingCompletion×0.35 + domainCompletion×0.35 + taskConsensus×0.30` |
| `discussionCount` | `in_discussion` 任务 + `pending` 任务 + `open` Silent Vote |
| `status` | 有 red 摩擦 / `high_risk` → `at_risk`；有讨论或 `needs_negotiation` → `attention`；否则 `healthy` |

### 示例

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/trips/{tripId}/collab-overview"
```

```json
{
  "success": true,
  "data": {
    "tripId": "trip-uuid",
    "teamId": "team-123",
    "team": { "teamId": "team-123", "fetchPath": "/v2/user/team/team-123" },
    "memberCount": 3,
    "travelerCount": 3,
    "collaborators": [],
    "teamHealth": {
      "progressPercent": 68,
      "discussionCount": 2,
      "highFrictionCount": 0,
      "compatibilityBand": "needs_negotiation",
      "status": "attention"
    },
    "collaborativeTasks": [],
    "collaborativeTaskCount": 0,
    "openSilentVoteCount": 0,
    "silentVotes": [],
    "generatedAt": "2026-07-02T12:00:00.000Z"
  }
}
```

### 容错

子数据源失败时降级为空/默认值，整包仍 200；失败项写 warn 日志。

### 鉴权

生产环境需登录且为行程成员；非生产可用 `anonymous-dev-user`（与 decision-profiling 一致）。

---

## 3. 前端对接

类型与 client 示例见 [`dto/frontend-trip-detail-tab-api.types.ts`](./dto/frontend-trip-detail-tab-api.types.ts)、[`dto/frontend-trip-detail-tab-api-client.ts`](./dto/frontend-trip-detail-tab-api-client.ts)、[`TRIP_DETAIL_TAB_FRONTEND.md`](./TRIP_DETAIL_TAB_FRONTEND.md)。

```typescript
// 建议封装
tripCollabApi.getOverview(tripId, { include?: string })

// TripDetailMembersTab 首屏（与 GET /trips/:id 并行）
const [trip, collab] = await Promise.all([
  tripsApi.getById(id),
  tripCollabApi.getOverview(id),
]);

// 替换 heuristic
collab.teamHealth.progressPercent
collab.teamHealth.discussionCount
collab.collaborativeTasks
collab.profilingOnboarding?.teamCompletionRate

// Optimization V2 团队详情（有 teamId 时二段加载）
if (collab.team?.fetchPath) teamApi.get(collab.team.teamId)
```

---

## 4. 代码索引

| 路径 | 说明 |
|------|------|
| `services/collab-overview.service.ts` | BFF 聚合 |
| `utils/collab-overview.util.ts` | teamHealth / metadata |
| `dto/collab-overview.dto.ts` | 响应类型 |
| `trips.controller.ts` | 路由 |

---

## 5. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-07-02 | 初版：成员 Tab P1 BFF |
