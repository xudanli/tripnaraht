# Decision Problem SSOT — 前端迁移指南（v2）

**版本：** 2026-07-03  
**后端前提：** `DECISION_GATEWAY_UNIFIED=1` + Canonical slices 已开  
**前端前提：** `VITE_DECISION_GATEWAY_UNIFIED=1`（`.env.development` / `.env.production`）  
**类型 SSOT：** `@/generated/unified-decision-contracts`  
**FE 状态：** ✅ FE-SSOT-1～7 已签字（Gateway 开 = 产品主路径；Legacy checker / `POST /decisions` = feature-flag 降级）

---

## 1. 一句话变化

**不要再读 `flow` / `canonicalSummary` / `legacySummary`。**  
所有读路径统一消费 v2 契约；写路径看 `actionability.writeChain`，不看引擎名。

---

## 2. API 对照

| 场景 | 旧做法 | 新做法 |
|------|--------|--------|
| 问题列表 | `GET decision-problems` → `items[].flow` | 同路径，`schemaId = @v2`，读 `semanticKey` / `enforcement` / `actionability` |
| 规划冲突 | 单独信 feasibility 聚合 | **仍用** `GET planning-conflicts`，已与 Decision Problems 对齐（含 F208） |
| L1 总览 | `decision-center/overview` Legacy 计数 | Gateway 开时返回 `unified_decision_center_overview@v2` |
| 问题详情 | `data.flow + data.data` 双轨 | `data.problem + data.actions[]` |
| 方案列表 | `options[].source === 'NEPTUNE'` | `actions[].source === 'ALTERNATIVE_GENERATOR'` |
| 调试 | 生产读 `route.engineId` | 仅 `?includeDebug=1` 读 `debug.authority` |

---

## 3. 类型导入

```typescript
import type {
  UnifiedDecisionProblemListView,
  UnifiedDecisionProblemListItem,
  UnifiedDecisionProblemDetailView,
  UnifiedDecisionOptionsView,
  UnifiedDecisionActionPreviewView,
  UnifiedDecisionCenterOverviewView,
  DecisionAction,
  DecisionWriteChain,
} from '@/generated/unified-decision-contracts';
```

**删除或标记 deprecated：**

```typescript
// ❌ 不要再在新代码中使用
import type { UnifiedDecisionProblemFlow } from '...';
if (item.flow === 'CANONICAL_L2') { ... }
item.canonicalSummary / item.legacySummary
option.source === 'NEPTUNE'
```

---

## 4. 列表页（Decision Center / Plan Studio 角标）

```typescript
const res = await api.get<StandardResponse<UnifiedDecisionProblemListView>>(
  `/api/trips/${tripId}/decision-problems`,
);
const { items, meta } = res.data!;

// 角标：用 meta.openCount / meta.actionableCount，不要用 items.length
badge.text = meta.actionableCount > 0
  ? `${meta.actionableCount} 待决策`
  : meta.openCount > 0
    ? `${meta.openCount} 待处理`
    : '';

// 卡片渲染 — 单一组件，无 flow 分支
items.map((item) => (
  <DecisionProblemCard
    key={item.instanceKey}          // 去重键，不是 problemId
    title={item.title}
    summary={item.summary}
    enforcement={item.enforcement}    // BLOCK | REQUIRE_ADJUSTMENT | ...
    workflowStatus={item.workflowStatus}
    executionStatus={item.executionStatus}
    occurrenceCount={item.occurrenceCount}
    allowedActions={item.actionability.allowedActions}
  />
));
```

**冰岛紧急电话等 INFORM 项不会出现在列表中** — 改从 Readiness / Safety 卡片展示。

---

## 5. L1 总览

```typescript
const overview = await api.get<StandardResponse<UnifiedDecisionCenterOverviewView>>(
  `/api/trips/${tripId}/decision-center/overview`,
);

// v2 字段
overview.data!.totalOpenProblemCount;      // 不含 INFORM
overview.data!.blockingProblemCount;       // BLOCK 数量
overview.data!.occurrenceCount;            // 可能 > problemCount（如缓冲×2）
overview.data!.headline;                   // 直接展示
overview.data!.problems;                   // 与列表同形，可复用卡片组件
```

---

## 6. 详情页

```typescript
const res = await api.get<StandardResponse<UnifiedDecisionProblemDetailView>>(
  `/api/trips/${tripId}/decision-problems/${problemId}`,
);
const detail = res.data!;

renderProblemHeader(detail.problem);
renderActionList(detail.actions);           // 不要读 repairOptions / planBHints
renderNegotiation(detail.negotiation);      // 可选

// 写路径分支 — 只看 writeChain
switch (detail.actionability.writeChain) {
  case 'EVALUATE_AUTHORIZE_EXECUTE':
    return <CanonicalL2Panel problem={detail.problem} actions={detail.actions} />;
  case 'APPLY_AND_POLL':
    return <LegacyApplyPanel problem={detail.problem} actions={detail.actions} />;
  default:
    return <InformOnlyPanel />;
}
```

### Canonical L2（writeChain = EVALUATE_AUTHORIZE_EXECUTE）

逻辑不变，只是入口从 `flow` 改为 `writeChain`：

```typescript
async function runCanonicalL2(tripId: string, problemId: string, actionId: string) {
  await api.post(`/api/trips/${tripId}/decision-problems/${problemId}/evaluate`);
  await api.post(`/api/trips/${tripId}/decisions/${decisionId}/authorize`, { choice: actionId });
  await api.post(`/api/trips/${tripId}/decisions/${decisionId}/execute`, null, {
    headers: { 'Idempotency-Key': `pv:${tripId}:${decisionId}` },
  });
}
```

仍可用 `classifyCanonicalL2Phase()`，但输入应来自 `detail.resolution` + `detail.problem.executionStatus`，不再依赖 `Rfc001DecisionCenterProblemView` 作为主 UI 模型。

### Legacy（writeChain = APPLY_AND_POLL）

```typescript
async function runLegacyApply(tripId: string, problemId: string, action: DecisionAction) {
  const preview = await api.post(
    `/api/trips/${tripId}/decision-problems/${problemId}/options/${action.actionId}/preview`,
  );
  await api.post(`/api/trips/${tripId}/decisions`, {
    problemId,
    selectedOptionId: action.actionId,
    idempotencyKey: buildDecisionIdempotencyKey(tripId, problemId, action.actionId),
  });
  // poll GET decisions/:id/execution-status
}
```

---

## 7. 方案 / Action 卡片

```typescript
function ActionCard({ action }: { action: DecisionAction }) {
  if (!action.allowed) {
    return <DisabledAction reason={action.blockedReason} />;
  }

  return (
    <Card
      title={action.title}
      summary={action.summary}
      source={action.source}  // ALTERNATIVE_GENERATOR | CONSTRAINT_SOLVER | ...
      impact={action.expectedImpact}
      onSelect={() => navigate(action.navigationTarget)}
    />
  );
}
```

**enforcement 约束已由后端计算 `allowedActions` / `action.allowed`，前端不要自行加 ACCEPT_RISK 按钮。**

| enforcement | 典型 allowed actions |
|-------------|---------------------|
| BLOCK | REPAIR, ALTERNATIVE, PLAN_B, CANCEL |
| REQUIRE_ADJUSTMENT | REPAIR, ALTERNATIVE, PLAN_B, DEFER |
| REQUIRE_CONFIRMATION | ACCEPT_RISK, REPAIR, ALTERNATIVE |
| WARN | ACCEPT_RISK, DEFER, REPAIR |

---

## 8. Planning Conflicts（规划工作台）

**接口路径不变：** `GET /api/trips/:tripId/planning-conflicts`

前端改动：

```typescript
// ✅ 冲突列表与 Decision Center 应一致（同一 SSOT）
const [problems, conflicts] = await Promise.all([
  api.get(`/api/trips/${tripId}/decision-problems`),
  api.get(`/api/trips/${tripId}/planning-conflicts`),
]);

// 数量对齐：conflicts.summary.total 应 ≈ problems.meta.openCount（PLANNING 投影）
// F208 封路必须两边都有

// 点击冲突 → 用 problemId / semanticKey 跳 Decision Detail
onConflictClick((item) => {
  navigate(`/trips/${tripId}/decisions/${item.id}`);
});
```

`PlanningConflictItem.semanticKey` 现为 **instanceKey**（稳定实例键），可用于与 `decision-problems[].instanceKey` 对齐。

---

## 9. 协作任务（Phase 3）

submit 响应已返回 `collaborativeTask`：

```typescript
interface SubmitDecisionProblemResolutionResponse {
  collaborativeTask?: {
    negotiationTaskId: string;
    resolutionId: string;
    actionPlanId?: string | null;
  };
}

interface CollaborativeTaskItem {
  decisionProblemId?: string;
  resolutionId?: string;
  actionPlanId?: string;
}
```

- submit 成功后绑定 `collaborativeTask.resolutionId`
- apply 成功后刷新 `actionPlanId`
- 协商列表应与 submit 返回一致

---

## 10. detectors / origin（多源 lineage）

```typescript
item.detectors: Array<{ detectorId: string; label: string; sourceRefIds?: string[] }>;
item.origin: {
  authority: 'CANONICAL' | 'LEGACY';
  primaryDetector: string;
  engineId?: string;
  triggerEventId?: string;
};
```

用 `detectors` / `origin` 展示发现来源，**不要**用 `debug.flow` 做产品文案。

---

## 11. 删除清单（PR 验收）

- [ ] 全仓库无 `flow === 'CANONICAL_L2'`（除 dev debug 面板）
- [ ] 无 `canonicalSummary` / `legacySummary` 渲染分支
- [ ] 无 `NEPTUNE` / `CONSTRAINT_REPAIR` 展示文案
- [ ] 列表/冲突/总览三处 open 数量一致
- [ ] 紧急电话不在 Decision Queue，在 Readiness/Safety
- [ ] Action 按钮尊重 `action.allowed` / `blockedReason`
- [ ] Legacy 写链仅当 `writeChain === 'APPLY_AND_POLL'`

---

## 12. Phase 3 — 统一写路径（resolutions + apply）

### 12.1 两步闭环

```
用户选择 action
    ↓
POST .../decision-problems/:problemId/resolutions   → workflowStatus=DECIDED
    ↓
POST .../decision-problems/:problemId/apply         → executionStatus=APPLIED
    ↓
重新验证通过后                                       → workflowStatus=RESOLVED
```

**不要再**对新产品 UI 直接走 `POST decisions`（Legacy 仍可用作 apply 内部实现）。

### 12.2 提交结论

```typescript
const res = await api.post<StandardResponse<SubmitDecisionProblemResolutionResponse>>(
  `/api/trips/${tripId}/decision-problems/${problemId}/resolutions`,
  {
    selectedActionId: action.actionId,
    idempotencyKey: `resolution:${tripId}:${problemId}:${action.actionId}`,
    reason: '团队确认绕行 F208',
    acknowledgement: ['我已了解对 Day 3 行程的影响'],
  },
);

// res.data.resolution.resolutionId  — 协作任务应绑定此 ID
// res.data.nextStep === 'APPLY'
// res.data.problem.workflowStatus === 'DECIDED'
```

| writeChain | submit 内部行为 |
|------------|----------------|
| `EVALUATE_AUTHORIZE_EXECUTE` | evaluate → authorize(choice=actionId) |
| `APPLY_AND_POLL` | **仅写入 resolution metadata**（不再 createDecision execute=false） |

`res.data.collaborativeTask` — submit 后立即返回 `negotiationTaskId` + `resolutionId`。

### 12.3 应用决策（Plan Gate / 时间轴）

```typescript
const applied = await api.post<StandardResponse<ApplyDecisionProblemResponse>>(
  `/api/trips/${tripId}/decision-problems/${problemId}/apply`,
);

// applied.data.problem.executionStatus === 'APPLIED'
// applied.data.applyResult.actionPlanId — Canonical Plan Version
// applied.data.revalidation.status — PENDING | PASSED | FAILED
// 当问题从 SSOT 读模型消失或 Legacy validateDecision=CONFIRMED 时，apply 会自动标记 VERIFIED

await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
await queryClient.invalidateQueries({ queryKey: ['planning-conflicts', tripId] });
await queryClient.invalidateQueries({ queryKey: ['decision-problems', tripId] });
```

| writeChain | apply 内部行为 |
|------------|----------------|
| `EVALUATE_AUTHORIZE_EXECUTE` | execute(decisionId) |
| `APPLY_AND_POLL` | createDecision(execute=true) + poll |

### 12.4 前端组件建议

```typescript
function DecisionProblemActions({ detail }: { detail: UnifiedDecisionProblemDetailView }) {
  const hasResolution = detail.resolution?.status === 'AUTHORIZED' || detail.resolution?.status === 'PROPOSED';

  if (detail.problem.executionStatus === 'APPLIED') {
    return <ResolvedBanner />;
  }

  if (hasResolution) {
    return (
      <Button onClick={() => applyResolution(detail.problem.problemId)}>
        应用到行程
      </Button>
    );
  }

  return detail.actions.map((action) => (
    <ActionCard
      key={action.actionId}
      action={action}
      onSelect={() => submitResolution(detail.problem.problemId, action.actionId)}
    />
  ));
}
```

### 12.5 协作任务绑定 resolutionId

```typescript
// 协商任务列表会返回：
task.resolutionId   // 用户 submit 之后才有
task.actionPlanId   // apply 之后才有

// 创建后续子任务（查住宿、确认取消政策）应引用：
interface CollaborativeTaskRef {
  problemId: string;
  resolutionId: string;   // 必填（submit 后）
  actionPlanId?: string;  // apply 后
}
```

---

## 13. 推荐 PR 顺序（更新）

| PR | 内容 |
|----|------|
| FE-SSOT-1 | 类型升级 + 列表/总览 v2 + 去掉 flow |
| FE-SSOT-2 | 详情/actions + writeChain 分支 |
| FE-SSOT-3 | planning-conflicts 与 decision-problems 数量对齐验收 |
| FE-SSOT-4 | Canonical L2 改用 actions + resolution 状态 |
| FE-SSOT-5 | Legacy apply 改用 actions preview |
| FE-SSOT-6 | resolutions + apply 两步写路径 |
| FE-SSOT-7 | 协作任务绑定 resolutionId |

---

## 14. 联调命令

```bash
npm run decision-center:unified-qa
npm run rfc002:fe-readiness
npx jest src/decision-runtime/gateway/utils/unified-decision-ssot.spec.ts
```

---

## 15. 前端 PR Checklist（签字版 · 2026-07-03）

**验收：** `npm run decision-center:unified-qa`（11/11 API + 26 contract tests）  
**签字前人工路径（Plan Studio · F208）：** 选问题 → 选 action → `POST .../resolutions` → `POST .../apply` →（若有）PATCH 协作子任务

### FE-SSOT-1 — 类型 + 列表/总览

- [x] 从 `@/generated/unified-decision-contracts` 导入 v2 类型（部分 internal util 仍 `@/types/unified-decision`，contracts re-export，不阻断）
- [x] 删除 `flow === 'CANONICAL_L2'` 分支（debug 除外；util 层保留 flow→writeChain 映射）
- [x] `GET decision-problems` 使用 `meta.openCount` / `meta.actionableCount`（`decision-list-badge.util.ts` → `WorkbenchDecisionQueuePanel`）
- [x] `GET decision-center/overview` 使用 v2 字段（`decision-center-overview-v2.util.ts`）
- [x] 列表卡片 `key={item.instanceKey}`（`DecisionProblemList.tsx`）

### FE-SSOT-2 — 详情 + actions

- [x] 详情读 `problem` + `actions[]`（feasibility/readiness 面仍用 `repairOptions`，非 Queue 域）
- [x] `action.source` → `ALTERNATIVE_GENERATOR`（`decisionActionSourceLabel` · `DecisionActionCard`）
- [x] 展示 `detectors[]` / `origin`（`ActionSourceBadges`）
- [x] 写分支只看 `actionability.writeChain`（`resolveDetailWriteChain`）

### FE-SSOT-3 — 数量对齐

- [x] 并行 `decision-problems` + `planning-conflicts`（`useDecisionSurfaceAlignmentProbe`）
- [x] `conflicts.summary.total ≈ problems.meta.openCount`（DEV `DecisionSurfaceAlignmentDevHint` · QA UD-08）
- [x] F208 封路两边可见（probe 默认 `entityRef='F208'`）
- [x] Timeline `stats.conflictCount` 与 planning-conflicts 一致（`TripDetailTimelineTab` · `ssot_planning_conflicts`）

### FE-SSOT-4~5 — Action 组件统一

- [x] 单一 `DecisionActionCard`，尊重 `action.allowed` / `blockedReason`
- [x] Preview → `POST .../options/:actionId/preview`（`decisionProblemsApi.previewOption`）
- [x] Gateway 开时禁双套 options UI（`PlanningWorkbenchDecisionSpace` 走 `DecisionProblemResolutionSection`；Gateway **关** 保留 checker/matrix 降级）

### FE-SSOT-6 — 写路径（核心）

- [x] `POST .../resolutions` → `POST .../apply`（`useDecisionProblemActions`）
- [x] Gateway 开时不直接 `POST .../decisions`（`useDecisionProblemFlow` 仅降级）
- [x] apply 后 `revalidation.status` 轮询（`pollDecisionProblemApplyUntilSettled`）
- [x] invalidate decision-problems / planning-conflicts / trip（`decisionProblemWriteQueryKeys`）

### FE-SSOT-7 — 协作任务

- [x] submit 绑定 `collaborativeTask.resolutionId`；apply 读 `actionPlanId`
- [x] apply 展示 `suggestedSubTasks`（`useDecisionProblemActions.applyToTrip`）
- [x] 子任务 POST 含 `{ problemId, resolutionId, actionPlanId? }`
- [x] PATCH status / assigneeUserId（`DecisionCollaborativeSubTasksPanel`）
- [x] submit `suggestedFollowUps`；apply `autoSuggestedCount`
- [x] 取消子任务 → PATCH `status: cancelled`（无 DELETE）

### 验收门禁

- [x] `npm run decision-center:unified-qa` 全绿
- [x] 紧急电话不在 Decision Queue（`filterDecisionQueueSummaries`）
- [x] 三处 open 数量一致（QA UD-08）

### 签字栏

| 角色 | 姓名 | 日期 | 签认 |
|------|------|------|------|
| FE | | | ☐ |
| BE / BFF | | | ☐ |
| QA | | | ☐ |
| 架构 | | | ☐ |

### 架构结论（Gateway ON = SSOT 主路径）

| 关切 | SSOT（Gateway ON） | Legacy 降级（Gateway OFF） |
|------|-------------------|---------------------------|
| 角标 | `meta.openCount` / `actionableCount` | 客户端 open count |
| 详情方案 | `detail.actions[]` | checker / matrix |
| 写链 | `actionability.writeChain` | flowKind 映射 |
| 确认 | resolutions → apply | POST decisions + poll |
| Action UI | `DecisionActionCard` | `DecisionSpaceOptionCard` |

**产品门控：** `canUseProblemWriteApi`，非 `flow === 'CANONICAL_L2'`。

**已知 deferred（非阻断）：** 全量 types 迁 contracts；Gateway 100% 后 deprecate `useDecisionProblemFlow`；apply poll 超时显式 UI；Gateway 退役后再删 `DecisionSpaceOptionCard`。

**前端代码索引：** `DecisionActionCard.tsx` · `DecisionActionsPanel.tsx` · `useDecisionProblemActions.ts` · `decision-apply-polling.util.ts` · `PlanningWorkbenchDecisionSpace.tsx` · `useDecisionSurfaceAlignmentProbe.ts`

---

## 16. Collab 子任务 API + Timeline conflictCount 对齐

### 16.1 协作跟进子任务（Collab Sub-task）

**前置**：用户已通过 `POST .../decision-problems/:problemId/resolutions` 提交结论（`workflowStatus = DECIDED`），拿到 `collaborativeTask.resolutionId`。

#### 创建

```http
POST /trips/{tripId}/decision-problems/{problemId}/collaborative-sub-tasks
Content-Type: application/json

{
  "resolutionId": "res_p1_abc",
  "title": "查酒店取消政策",
  "description": "备选酒店 B 的退改条款",
  "kind": "CANCELLATION_POLICY",
  "assigneeUserId": "user_42"
}
```

**`kind` 枚举**：`ACCOMMODATION_LOOKUP` | `CANCELLATION_POLICY` | `TEAM_CONFIRM` | `BOOKING_FOLLOWUP` | `OTHER`

**响应**（`tripnara.decision_collaborative_subtask_create@v1`）：

```json
{
  "schemaId": "tripnara.decision_collaborative_subtask_create@v1",
  "tripId": "trip_1",
  "problemId": "p1",
  "generatedAt": "2026-07-03T04:00:00.000Z",
  "subTask": {
    "id": "csub_a1b2c3d4e5f6",
    "tripId": "trip_1",
    "problemId": "p1",
    "resolutionId": "res_p1_abc",
    "actionPlanId": "ap_1",
    "kind": "CANCELLATION_POLICY",
    "title": "查酒店取消政策",
    "status": "pending",
    "createdAt": "2026-07-03T04:00:00.000Z",
    "createdByUserId": "user_1"
  }
}
```

**错误码**：

| HTTP | code | 含义 |
|------|------|------|
| 404 | NOT_FOUND | 该 problem 尚无 resolution（需先 submit） |
| 400 | VALIDATION_ERROR | `COLLAB_SUBTASK_RESOLUTION_MISMATCH` — body.resolutionId 与存储不一致 |

#### 列表

```http
GET /trips/{tripId}/decision-problems/{problemId}/collaborative-sub-tasks
GET /trips/{tripId}/decision-problems/{problemId}/collaborative-sub-tasks?resolutionId=res_p1_abc
```

**响应**（`tripnara.decision_collaborative_subtasks@v1`）：`{ items: DecisionCollaborativeSubTaskView[] }`

#### 与 Collab 任务列表合并

`GET /trips/{tripId}/collaborative-tasks`（domain-influence）在 Gateway 启用时会 **追加** 子任务项：

| 字段 | 值 |
|------|-----|
| `isSubTask` | `true` |
| `subTaskKind` | 同上 kind 枚举 |
| `subTaskStatus` | `pending` / `in_progress` / `completed` / `cancelled` |
| `resolutionId` / `actionPlanId` | 与 submit / apply 绑定一致 |

#### 前端 TypeScript

```typescript
import type {
  CreateDecisionCollaborativeSubTaskRequest,
  CreateDecisionCollaborativeSubTaskResponse,
  ListDecisionCollaborativeSubTasksResponse,
  DecisionCollaborativeSubTaskView,
} from '@/generated/unified-decision-contracts';

async function createFollowUp(
  tripId: string,
  problemId: string,
  resolutionId: string,
) {
  const res = await api.post<CreateDecisionCollaborativeSubTaskResponse>(
    `/trips/${tripId}/decision-problems/${problemId}/collaborative-sub-tasks`,
    {
      resolutionId,
      title: '团队确认备选方案',
      kind: 'TEAM_CONFIRM',
    } satisfies CreateDecisionCollaborativeSubTaskRequest,
  );
  return res.subTask;
}
```

**写路径顺序**：

```
submit resolutions → collaborativeTask.resolutionId
  → (optional) create collaborative-sub-tasks
apply → collaborativeTask.actionPlanId 更新
  → invalidate collaborative-tasks / decision-problems
```

---

### 16.2 Timeline `conflictCount` SSOT 对齐

Timeline BFF（`GET /trips/{tripId}/timeline-overview?include=stats`）的 `stats.conflictCount` **优先**取 `planning-conflicts.summary.total`（与 `GET decision-problems` 的 `meta.openCount` 同源投影）。

新增字段 **`stats.conflictCountSource`**：

| 值 | 含义 |
|----|------|
| `ssot_planning_conflicts` | 来自 `PlanningConflictsService` / Unified Decision Problem 投影 |
| `schedule_conflicts` | 回退：日程冲突 API 列表长度（Gateway 不可用或 SSOT 加载失败） |

#### 前端三处数量校验（FE-SSOT-3）

同一 `tripId` 并行请求：

```typescript
const [problems, conflicts, timeline] = await Promise.all([
  api.get(`/trips/${tripId}/decision-problems`),
  api.get(`/trips/${tripId}/planning-conflicts`),
  api.get(`/trips/${tripId}/timeline-overview?include=stats`),
]);

const openCount = problems.meta.openCount;
const conflictTotal = conflicts.summary.total;

expect(conflictTotal).toBe(openCount);
expect(timeline.stats.conflictCount).toBe(conflictTotal);
expect(timeline.stats.conflictCountSource).toBe('ssot_planning_conflicts');
```

**注意**：

- `conflictCountSource === 'schedule_conflicts'` 时，Timeline 数字可能与 decision-problems 不一致 — UI 应展示 SSOT 来源徽章或触发 refresh
- Gateway 启用时 **`problems.meta.openCount` 与 `planning-conflicts.summary.total` 由同一 `listProblems(queueOnly)` 投影**，`DecisionSurfaceAlignmentDevHint` 应为 Δ0
- F208 封路类问题在三处均应可见（openCount ≥ 1）
- 紧急电话（INFORM）**不计入** openCount / conflictCount

#### TypeScript 类型

```typescript
import type { TimelineOverviewStats } from '@/types/frontend-trip-detail-tab-api';

// TimelineOverviewStats.conflictCountSource:
// 'ssot_planning_conflicts' | 'schedule_conflicts'
```

---

### 16.3 更新协作子任务（PATCH）

```http
PATCH /trips/{tripId}/decision-problems/{problemId}/collaborative-sub-tasks/{subTaskId}
Content-Type: application/json

{
  "status": "in_progress",
  "assigneeUserId": "user_42"
}
```

**可更新字段**：`status` | `assigneeUserId` | `title` | `description`

**`status` 枚举与 UI 文案**：

| API 值 | UI 下拉 |
|--------|---------|
| `pending` | 待处理 |
| `in_progress` | 进行中 |
| `completed` | 已完成 |
| `cancelled` | 已取消 |

**响应**（`tripnara.decision_collaborative_subtask_update@v1`）：`{ subTask: DecisionCollaborativeSubTaskView }`

**FE 类型别名**（与 `Update*` 同形）：

```typescript
import type {
  PatchDecisionCollaborativeSubTaskRequest,
  PatchDecisionCollaborativeSubTaskResponse,
} from '@/generated/unified-decision-contracts';

// API client
decisionProblemsApi.patchCollaborativeSubTask(tripId, problemId, subTaskId, body);
```

**UI**：`DecisionCollaborativeSubTasksPanel` 每条子任务状态下拉 → PATCH；共享常量：

```typescript
import {
  DECISION_COLLAB_SUBTASK_STATUS_OPTIONS,
  labelForCollaborativeSubTaskStatus,
} from '@/generated/unified-decision-contracts';
```

---

### 16.4 Apply 后自动建议子任务

首次 `POST .../apply` 成功且该 `resolutionId` **尚无**手动创建的子任务时，后端按 `semanticKey` 自动 seed：

| semanticKey 模式 | 自动创建 |
|------------------|----------|
| `ROAD_SEGMENT_*` / `FEASIBILITY_FAILURE` | `TEAM_CONFIRM` + `BOOKING_FOLLOWUP` |
| `BOOKING_*` / 住宿相关 | `ACCOMMODATION_LOOKUP` + `CANCELLATION_POLICY` |
| 其他 | `TEAM_CONFIRM` |

**Apply 响应新增字段**：

```typescript
interface ApplyDecisionProblemResponse {
  suggestedSubTasks?: DecisionCollaborativeSubTaskView[];
  collaborativeTask?: {
    negotiationTaskId: string;
    resolutionId: string;
    actionPlanId?: string | null;
  };
}
```

**前端处理**（`normalizeApplyDecisionProblemResponse` + `useDecisionProblemActions.applyToTrip`）：

```typescript
const apply = normalizeApplyDecisionProblemResponse(
  await decisionProblemsApi.applyToTrip(tripId, problemId),
);

// 更新 actionPlanId
if (apply.collaborativeTask?.actionPlanId) {
  collabStore.bindActionPlan(problemId, apply.collaborativeTask.actionPlanId);
}

// 自动 seed 子任务
if (apply.suggestedSubTasks?.length) {
  collabStore.setSubTasks(problemId, apply.suggestedSubTasks);
  toast.success(`已自动创建 ${apply.suggestedSubTasks.length} 项跟进子任务`);
}

// done 阶段：DecisionCollaborativeSubTasksPanel 展示列表（可 PATCH 状态）
queryClient.invalidateQueries(['collaborative-tasks', tripId]);
queryClient.invalidateQueries(['decision-problems', tripId]);
```

**semanticKey 预览工具**（与后端 apply seed 规则一致，供测试 / submit 前预览）：

```typescript
import {
  buildSuggestedSubTasks,
  previewCollaborativeFollowUps,
} from '@/generated/unified-decision-contracts';

previewCollaborativeFollowUps(problem.semanticKey);
// 或 submit 响应中的 suggestedFollowUps（服务端已算好）
```

**幂等**：若用户已在 apply 前手动 `POST .../collaborative-sub-tasks`，则 **不会** 重复 seed，仅同步 `actionPlanId`。

---

### 16.5 Submit 预建议（`suggestedFollowUps`）

`POST .../resolutions` 响应在 apply 之前返回 **只读** 跟进建议（与 §16.4 同模板，**不写入** metadata）：

```typescript
interface SubmitDecisionProblemResolutionResponse {
  suggestedFollowUps?: DecisionCollaborativeFollowUpSuggestion[];
  // kind + title + description — 同 apply seed
}
```

前端可在「已决策、待应用」步骤展示 checklist，引导用户提前 `POST .../collaborative-sub-tasks` 或等待 apply 自动 seed。

---

### 16.6 删除子任务（DELETE）

```http
DELETE /trips/{tripId}/decision-problems/{problemId}/collaborative-sub-tasks/{subTaskId}
```

**响应**（`tripnara.decision_collaborative_subtask_delete@v1`）：`{ deleted: true, subTaskId }`

取消但不删除记录请用 `PATCH` + `status: "cancelled"`。

---

## 17. Plan Studio 联调验收（Collab 写路径）

**写路径顺序（完整）**：

```
1. POST .../resolutions          → collaborativeTask.resolutionId + suggestedFollowUps（预览）
2. POST/PATCH collaborative-sub-tasks  → 手动创建 / 更新状态（可选）
3. POST .../apply                → suggestedSubTasks[] + collaborativeTask.actionPlanId
4. PATCH collaborative-sub-tasks/:id   → done 阶段状态下拉更新
```

**Plan Studio 手测步骤**：

1. 打开含 OPEN 决策问题的 trip（F208 封路或 legacy APPLY_AND_POLL 均可）
2. 选 action → **提交结论** → 确认 `resolutionId` 绑定；可选查看 `suggestedFollowUps`
3. （可选）手动 **创建子任务** 或 **PATCH 状态**
4. **应用到行程** → toast「已自动创建 N 项跟进子任务」（若后端 seed）
5. **done** 面板展示子任务列表；下拉改状态 → PATCH 成功
6. 刷新后 `GET collaborative-sub-tasks` 与 Collab 任务列表 `isSubTask=true` 项一致

**后端单测**：`decision-collaborative-subtask*.spec` + `unified-decision-resolution.service.spec`（11+ cases）

**联调脚本**：`npm run decision-center:unified-qa`（UD-10~12）；写路径加 `--write`

---

## 18. 性能：前后端联调要点（2026-07-03）

Network 面板若出现 `decision-problems` ~30s、`options` ~60s，通常是 **重复触发全量 feasibility + 串行 preview** 叠加。后端已做以下优化；前端需配合减少无效请求。

### 18.1 后端（已落地）

| 端点 | 优化 |
|------|------|
| `GET decision-problems/:id` | 复用 trip 快照（collector + collectRows 缓存）；LEGACY 走 `enrichTradeoffs=false`，不再 previewRepair |
| `GET .../options` | `decision-space-option-projection` 按 `tripId+problemId+revision` 缓存 10s；tradeoffs/routePreview 完整数值走 `POST .../preview` |
| `GET decision-center` | 与 list 共享 `readModel.listProblems + getOverview`，去掉 legacy `getOverview` 的 N×getOptions 与 canonical 全量 `getTripView` |
| `GET decision-problems`（列表） | 不写 lineage；collectRows 短缓存 |

| 机制 | 说明 |
|------|------|
| Collector 短缓存 | 同 revision 10s 内复用 `collect()` + feasibility report |
| Repair 预加载 | `getRepairOptions` / `previewRepair` 共享同一份 report |
| collectRows 缓存 | 列表 + 详情 + options 同 trip 共享 rows |
| apply 后失效 | `invalidateCache` + `invalidateOptionsCache` |

写路径（`apply` / repair）会清缓存，10s 内 stale 可接受。

### 18.2 前端（Gateway ON · 已签字）

Plan Studio Decision Center 在 `VITE_DECISION_GATEWAY_UNIFIED=1` 下已走 SSOT 主路径（见 §15 签字版）：

- 读：`detail.actions[]`，**产品 UI 不再依赖** `GET .../options` 渲染方案卡  
- 写：`resolutions` → `apply`；Preview 才打 `POST .../preview`  
- 降级：Gateway **关** 时仍保留 checker/matrix + `DecisionSpaceOptionCard`（非 SSOT 缺口）

若 Network 仍见 `GET .../options`，排查：Gateway 是否关、旧 tab 缓存、或非 Decision Queue 域（feasibility/readiness）。

**仍建议（性能）：**

```typescript
const [problems, conflicts] = await Promise.all([
  api.get(`/api/trips/${tripId}/decision-problems`),
  api.get(`/api/trips/${tripId}/planning-conflicts`),
]);
```

**Abort / 超时**

- 切换 problem 时对 in-flight `GET .../options` 与 `GET .../:problemId` 做 `AbortController.abort()`
- 读路径正常应 < 5s；长超时仅留给 preview/apply

**React Query**

```typescript
queryClient.prefetchQuery(['decision-problems', tripId], fetchProblems, { staleTime: 10_000 });
// 不要 prefetch 全量 options
```

### 18.3 验收

| 场景 | 期望 |
|------|------|
| 仅打开 Decision Queue 列表 | 1× `decision-problems`，无 `options` |
| 点开单个问题 | 1× `decision-problems/:id`（含 actions），无额外 `options` |
| 用户点 Preview | 1× `POST .../options/:actionId/preview`（含完整 tradeoffs） |
| `GET decision-center` | 与 list 同量级（共享读模型，无 N×options） |
| 同 trip 10s 内刷新 | 明显快于首次（缓存命中） |

```bash
time curl -s "$BASE/trips/$TRIP/decision-problems" | jq '.data.meta.openCount'
time curl -s "$BASE/trips/$TRIP/decision-problems/$PROB" | jq '.data.actions | length'
```
