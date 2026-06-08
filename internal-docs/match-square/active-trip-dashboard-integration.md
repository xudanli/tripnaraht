# Active Trip Dashboard 前端集成规范

> PRD 3.12 §5.2 · 3.13 行中飞轮 · 单次聚合 API

**doc_version**: 1.0  
**last_reviewed**: 2026-06-07  
**API**: `GET /api/trips/:tripId/active`

---

## 1. 何时调用

成团 `instantiate-trip` 返回 `activeTripPath: /trips/{id}/active` 后，前端路由进入 Active Trip 页时 **首屏请求本接口**（替代多次 scatter GET）。

---

## 2. 响应结构（TypeScript）

```typescript
export type ActiveTripDashboard = {
  version: 'active_trip_dashboard_v1';
  trip: {
    tripId: string;
    name: string;
    destination: string;
    startDate: string;
    endDate: string;
    status: string;
  };
  viewer: {
    userId: string;
    role: 'captain' | 'member';
    canProposeRollback: boolean;
    awaitingViewerAction:
      | 'none'
      | 'confirm_rollback_proposal'
      | 'complete_assigned_task';
  };
  matchSquare: {
    recruitmentPostId: string;
    strategy: string;
    catalogId: string | null;
    vibeChipIds: string[];
    contextualCardIds: string[];
    sealedAt: string | null;
  } | null;
  contextualCards: Array<{
    cardId: string;
    titleZh: string;
    descriptionZh: string;
    toolRoute: string | null;
    vaultLinked: boolean;
    priority: 'critical' | 'high' | 'normal';
  }>;
  crewDnaPanel: Array<{
    userId: string;
    role: 'captain' | 'member';
    displayName: string;
    mbtiType: string | null;
    cardTitle: string | null;
    reputationStars: number | null;
  }>;
  collaborativeTasks: CollaborativeTask[];
  taskSummary: {
    total: number;
    pending: number;
    confirmed: number;
    assignedToViewer: number;
  };
  pendingRollback: RouteRollbackProposal | null;
  routeContractLock: {
    locked: boolean;
    milestones: Array<{ id: string; labelZh: string; vaultStatus: 'locked' | 'pending_vault' }>;
    canCaptainRollbackMilestoneOrder: boolean;
  } | null;
  apiPaths: {
    collaborativeTasks: string;
    decisionEvents: string;
  };
};
```

---

## 3. UI 区块映射

| Dashboard 区块 | 字段 | 交互 |
|----------------|------|------|
| 车队 DNA 看板 | `crewDnaPanel[]` | 只读；MBTI + 称号 + 互评星 |
| 场景工具箱 | `contextualCards[]` | 点击 `toolRoute` 深链 |
| 行前协同任务 | `collaborativeTasks[]` + `taskSummary` | `awaitingViewerAction=complete_assigned_task` 时 CTA |
| Decision 条 | `pendingRollback` + `viewer.canProposeRollback` | 队长 propose / 队员 confirm |
| Route Contract | `routeContractLock` | Phase 3 Vault；只读展示锁状态 |

---

## 4. 写操作（仍用子 API）

| 动作 | API |
|------|-----|
| 任务 confirm/rollback | `POST .../collaborative-tasks/:taskId/events` |
| 路线 Rollback | `POST .../decision-events` |
| Vault 里程碑授权 | `POST .../route-contract-lock/authorize` |
| 队长调整里程碑顺序 | `POST .../route-contract-lock/reorder` |
| 决策 Replay | `GET .../decision-replay` |
| 模板回流预览 | `GET .../template-backflow/preview` |
| 模板回流提交 | `POST .../template-backflow/commit`（队长；`skipIfExists` 可重试） |

操作成功后 **重新 GET `/active`** 或局部 optimistic 更新。

---

## 5. 埋点

进入页：`active_trip_dashboard_view` — `{ tripId, contextualCards[], taskSummary.pending, awaitingViewerAction }`

---

## 6. 相关文档

- [group-formation-trip-instantiation-3.12.md](./group-formation-trip-instantiation-3.12.md)
- [decision-engine-recruitment-task-flywheel-3.13.md](./decision-engine-recruitment-task-flywheel-3.13.md)
- [frontend-integration-guide.md §7](./frontend-integration-guide.md)
