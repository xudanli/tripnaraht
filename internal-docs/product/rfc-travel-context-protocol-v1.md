# RFC-003 — Travel Context Protocol

**文档版本：** 1.1.7  
**状态：** Draft（架构 SSOT 草案 — 含 Harness 一体化）  
**生效日期：** 2026-07-05  
**作者：** Product / Architecture  
**审阅：** 待 Engineering + Frontend + Harness 签字

**上位文档：**

- [TripNARA AI Native 产品定位与收敛战略](./TRIPNARA_AI_NATIVE_POSITIONING.md) §5.2
- [旅行本体与世界模型架构说明](./travel-ontology-world-model-v1.md) — Ontology / World Model / Trip World State SSOT
- [Decision Runtime 成熟度](../../src/decision-runtime/DECISION_RUNTIME_MATURITY.md)
- [Exploration API 清单](../../src/trips/exploration/EXPLORATION_API.md)
- [Harness 架构地图](../orchestration/harness-architecture-map.md)

**相关实现（现状）：**

- `src/travel-ontology/` — Travel Ontology 契约（TravelWorldFact、核心实体）
- `src/travel-context/` — Travel Context Protocol（Phase 0 已落地）
- `src/decision-runtime/snapshot/` — Trip Context Snapshot（Trip 阶段 adapter）
- `src/trips/exploration/` — Exploration Consumer BFF
- `src/decision-runtime/gateway/` — Unified Decision Gateway
- `src/agent/context-engine/` — Agent Context Package
- `src/decision-runtime/trigger/intent/` — Trip Intent（NL 入口骨架）
- `src/harness/evals/` — Blocker / Authority / Decision Semantics Harness（待绑定 Revision）

---

## 1. 摘要

TripNARA 不应只做「一个统一的行程上下文 HTTP 接口」，而应建立以 **Travel Context** 为核心的 **Product Runtime Protocol**：

> **所有页面、AI Agent、决策引擎、监控系统围绕同一个旅行世界模型工作，仅读取不同投影；所有修改经 Intent 写回并产生新 Revision。**

**Harness 不是外围 QA，而是同一 Protocol 的可信执行层：**

> **Travel Context 定义 TripNARA 的旅行世界状态；Harness 定义这个世界状态能够被信任的证据。**

二者关系：

```text
Travel Context = Runtime State Protocol
Harness        = Runtime Verification Protocol
```

完整运行闭环：

```text
Context Snapshot → Trigger → Canonical Runtime → Decision Trace
  → Context Diff → New Revision → Harness Invariants → Trusted Travel State
```

本 RFC 定义：

1. **Travel Context Identity** — 跨探索 / 规划 / 行中的统一身份
2. **Travel Context Snapshot** — 八域只读世界状态 SSOT
3. **Projection** — 页面 / Agent / Gateway 的裁剪视图
4. **Intent** — 唯一写路径
5. **Revision / Diff / Subscription** — 并发控制与增量同步
6. **Harness Case + Invariant Registry** — 状态迁移可验证、可回放、可审计

**Trip Context Snapshot**（`GET /api/trips/:tripId/context-snapshot`）保留为 **Trip 阶段 adapter 的输出**，不是废弃，而是 Travel Context Protocol 的一个生命周期切片。

---

## 2. 背景与问题

### 2.1 现状分裂

| 分裂类型 | 表现 |
|----------|------|
| **身份分裂** | `scenarioId`、`tripId`、`conversationId` 各自独立；探索前无统一 `contextId` |
| **状态分裂** | Exploration BFF、Decision Center、Travel Status、Trip API 各自拼装 |
| **生命周期断裂** | `materialize` 创建新 Trip，探索阶段意图 / 淘汰方案 / 研究状态未进入统一 History |
| **Revision 缺失** | 无全局 `basedOnRevision`；多人 + 监控 + AI 自动执行可能静默覆盖 |
| **Agent 记忆分裂** | `AgentMemoryContext`、`DSO`、`TripContextSnapshot` 三套读模型 |
| **Harness 与 Runtime 脱节** | Blocker / Authority / Decision Center Harness 各自 fixture，未绑定 `snapshotId + revision`；测试「接口 200」而非「状态迁移合法」 |

### 2.2 目标陈述

建立 **跨探索、规划、决策、执行持续存在** 的 Travel Context：

- 任意页面看到的行程事实来自 **相同 revision**
- 任意 Agent 判断可追溯到 **具体 Context Snapshot**
- 任意修改经 **Intent → Runtime → Event → 新 Revision**
- 从探索到行中，**上下文不重建、不丢历史**
- 任意 Revision 变化经 **Harness Invariant** 可验证；生产异常可 **Replay 为永久 Case**

---

## 3. 非目标（V1）

- 不替换 Prisma / Trip 表为单一 JSON 文档存储（Snapshot 是 **读模型**，不是写模型）
- 不在 Snapshot 内联 POI 全量、GeoJSON、聊天记录、原始 API 响应
- V1 不要求 Guide-to-Plan 与 Exploration 立即合并为同一 UX（但需共享 `contextId` 迁移路径）
- V1 不实现完整 CRDT / 自动三方合并（Revision 冲突时返回 `REVISION_CONFLICT`，由客户端重拉 + 重提交）

---

## 4. 架构总览

```text
                    Travel Context Snapshot (SSOT)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
  UI Projection         Agent Package         Decision Input
  (views/*)             (context/build)       (Gateway evaluate)
        │                     │                     │
        └─────────────────────┴─────────────────────┘
                              │
        共享锚点：contextId · snapshotId · revision
                  effectivePlanVersion · worldStateVersion
                              │
                      Intent / World Event
                              │
              Constraint Gateway → Canonical Runtime
                              │
              Domain Events → revision++ → Diff → SSE
                              │
              ┌───────────────┴───────────────┐
              │     Harness Verification      │
              │  Case → Anchor → Invariants   │
              │  → Context Diff Assertions    │
              └───────────────────────────────┘
```

**关键原则：**

- 逻辑上 **一个** 旅行世界模型
- 物理上 **多个** 投影接口（不是一个巨大 DTO 给所有消费者）
- Snapshot **只读**；禁止 `PATCH /context-snapshot`
- Harness 与 Runtime **共享 Schema / Revision / Intent 契约**；禁止维护「仅测试用」的虚构 DTO
- Harness 验证的是 **Revision N → N+1 状态迁移是否合法**，不是某个 HTTP 是否返回 200

---

## 5. Travel Context Identity

### 5.1 统一主键

```typescript
/** Schema: tripnara.travel_context_identity@v1 */
interface TravelContextIdentity {
  /** 全生命周期不变；探索创建时分配 */
  contextId: string;

  stage:
    | 'CONVERSATION'
    | 'EXPLORATION'
    | 'SCENARIO_SELECTED'
    | 'TRIP_MATERIALIZED'
    | 'PLANNING'
    | 'READY'
    | 'TRAVELING'
    | 'COMPLETED';

  /** 可选绑定；stage 决定哪个必填 */
  conversationId?: string;
  scenarioId?: string;
  tripId?: string;

  ownerUserId: string;
  createdAt: string;
}
```

### 5.2 生命周期

```text
CONVERSATION          用户表达想法（Guide / NL 入口）
    ↓
EXPLORATION           探索目的地、条件、原则
    ↓
SCENARIO_SELECTED     选中路线 / 方案
    ↓
TRIP_MATERIALIZED     materialize → tripId 绑定（contextId 不变）
    ↓
PLANNING              规划、验证、修复闭环
    ↓
READY                 可行性通过、待出发
    ↓
TRAVELING             行中执行
    ↓
COMPLETED             复盘、偏好学习
```

### 5.3 contextId 分配规则（V1）

| 入口 | contextId 来源 | 说明 |
|------|----------------|------|
| `POST /exploration/scenarios` | **`scenarioId` 即 `contextId`**（V1 简化） | 零迁移：新字段 `ExplorationScenario.contextId` 默认 = `id` |
| Guide-to-Plan session | sessionId → 未来映射 contextId | Phase 2 对齐 |
| 直接建 Trip | 创建时生成 `ctx_*`，写入 `Trip.metadata.travelContextId` | 跳过探索阶段 |

**V1 决策：** Exploration 场景下 `contextId === scenarioId`，避免前端双 ID。materialize 后 `identity.tripId` 填充，`contextId` **不变**。

---

## 6. Travel Context Snapshot — 八域模型

```typescript
/** Schema: tripnara.travel_context_snapshot@v1 */
interface TravelContextSnapshot {
  schemaId: 'tripnara.travel_context_snapshot@v1';

  identity: TravelContextIdentity;

  meta: {
    snapshotId: string;
    revision: number;
    generatedAt: string;
    previousRevision?: number;
    consistency: 'STRONG' | 'EVENTUAL' | 'PARTIAL';
    bindings: {
      constraintsVersion: number;
      effectivePlanVersionId?: string;
      worldStateVersion: string;
    };
    /** 内部 / Harness 可观测（生产环境前端可忽略） */
    observability?: {
      schemaVersion: string;
      authority?: {
        runtime: 'CANONICAL' | 'LEGACY' | 'SHADOW';
        runId?: string;
        gateway?: string;
        policyVersion?: string;
      };
      derivedFrom?: {
        previousRevision?: number;
        triggerType?: 'USER_INTENT' | 'WORLD_EVENT' | 'AGENT_REQUEST' | 'MONITORING_TRIGGER' | 'SYSTEM_COMMAND';
      };
      changedDomains?: TravelContextDomain[];
    };
  };

  intent: TravelIntentContext;
  participants: ParticipantContext;
  contract: TravelContractContext;
  plan: EffectivePlanContext;
  world: TravelWorldContext;
  decisions: DecisionContext;
  monitoring: MonitoringContext;
  history: ContextHistory;
}
```

### 6.1 Intent — 用户想完成什么

```typescript
interface TravelIntentContext {
  primaryGoal?: string;
  destination: {
    status: 'CONFIRMED' | 'CANDIDATE' | 'UNKNOWN';
    countryCode?: string;
    label?: string;
    candidates?: string[];
  };
  dateRange?: { startDate: string; endDate: string; flexibility?: 'FIXED' | 'FLEXIBLE' };
  budget?: { currency: string; min?: number; max?: number; style?: string };
  pacing?: string;
  mustInclude?: string[];
  mustAvoid?: string[];
  experiencePreferences?: string[];
  successCriteria?: string[];
  rankedPrinciples?: string[];
}
```

**现状映射：** `ExplorationInput` + `TripContextGoalView` + `TravelDecisionContract.objectives`

### 6.2 Participants — 谁在这趟旅行里

```typescript
interface ParticipantContext {
  count: number;
  /** 经权限裁剪后的公开成员摘要 */
  publicSummary: Array<{
    memberId: string;
    role: string;
    displayName?: string;
    mobilityBand?: string;
  }>;
  /** 是否已收集完整体能 / 私密偏好（不含 PII 明细） */
  preferenceCoverage: {
    mobility: 'COMPLETE' | 'PARTIAL' | 'MISSING';
    privateWishes: 'COMPLETE' | 'PARTIAL' | 'MISSING';
  };
  governance?: {
    decisionOwnerId?: string;
    requiresMemberConfirm: boolean;
  };
}
```

**投影分层（必须实现）：**

| 投影 | 消费者 | 规则 |
|------|--------|------|
| `publicParticipantContext` | 所有成员页面 | 无 PDI-1 私密心愿 |
| `privateUserContext` | 当前用户 | 含本人私密字段 |
| `agentAuthorizedContext` | Agent（经 consent） | 字段级 allowlist |

### 6.3 Contract — 系统必须遵守什么

```typescript
type ConstraintLevel =
  | 'HARD'
  | 'STRONG_PREFERENCE'
  | 'SOFT_PREFERENCE'
  | 'INFERRED';

interface ContextConstraint {
  id: string;
  level: ConstraintLevel;
  source:
    | 'USER_EXPLICIT'
    | 'USER_BEHAVIOR'
    | 'OFFICIAL_RULE'
    | 'SYSTEM_INFERENCE'
    | 'MEMBER_PREFERENCE';
  confidence: number;
  editable: boolean;
  overridable: boolean;
  label: string;
  domain?: string;
}

interface TravelContractContext {
  constraints: ContextConstraint[];
  changeStrategy?: { archetype: string };
  automation?: { defaultLevel: string };
  teamGovernance?: Record<string, unknown>;
  conflictSummary?: { count: number; blockingCount: number };
}
```

**现状映射：** `TravelDecisionContract` + `buildTravelDecisionContract()`

### 6.4 Plan — 当前生效的行程真相

```typescript
interface EffectivePlanContext {
  effectivePlan: {
    versionId?: string;
    dayCount: number;
    itemCount: number;
    hasEffectivePlan: boolean;
    executabilityStatus?: 'EXECUTABLE' | 'BLOCKED' | 'UNKNOWN';
  };
  /** 已提交待应用 / 系统生成的修改提案摘要 */
  pendingProposal?: {
    proposalId: string;
    source: 'USER' | 'AI' | 'MONITORING';
    summary: string;
  };
  /** 未提交草稿摘要（不含完整日程） */
  draftChanges?: {
    hasDraft: boolean;
    changedDayCount?: number;
  };
  selectedRouteId?: string;
}
```

**铁律：** `effectivePlan` 是旅行当前真相；AI 建议 **不得** 自动成为 effectivePlan（须 Intent → authorize → execute）。

**现状映射：** `TripContextEffectivePlanView` + RFC-001 plan version store

### 6.5 World — 外部世界

```typescript
type WorldFactKind =
  | 'USER_DECLARED'
  | 'SYSTEM_INFERRED'
  | 'EXTERNAL_OBSERVED'
  | 'OFFICIAL_RULE'
  | 'EFFECTIVE_DECISION';

interface WorldFact {
  factId: string;
  type: string;
  kind: WorldFactKind;
  value: unknown;
  effectiveFrom?: string;
  expiresAt?: string;
  observedAt: string;
  sourceId: string;
  authorityLevel: string;
  confidence: number;
  /** 是否足以触发重规划 */
  replanTrigger?: boolean;
}

interface TravelWorldContext {
  facts: WorldFact[];
  dataCompletenessScore: number;
  lastRefreshedAt?: string;
}
```

**现状映射：** `CanonicalWorldStateSnapshot` + `WorldStateSnapshotService`

### 6.6 Decisions — 待决与进行中的事

```typescript
interface OpenDecision {
  decisionId: string;
  problemType: string;
  title: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status:
    | 'DETECTED'
    | 'ANALYZING'
    | 'WAITING_USER'
    | 'AUTHORIZED'
    | 'EXECUTING'
    | 'RESOLVED'
    | 'FAILED';
  affectedScope?: {
    days?: number[];
    planItemIds?: string[];
    memberIds?: string[];
  };
  recommendedOptionId?: string;
  authorizationRequired: boolean;
}

interface DecisionContext {
  open: OpenDecision[];
  counts: {
    total: number;
    blocking: number;
    actionable: number;
  };
}
```

**现状映射：** `UnifiedDecisionProblemReadModelService` + Exploration issues projection

### 6.7 Monitoring — 系统替用户关注什么

```typescript
interface MonitoringItem {
  itemId: string;
  kind: string;
  status: 'ACTIVE' | 'PENDING' | 'PAUSED';
  headline: string;
  whyMonitoring?: string;
  checkCondition?: string;
  nextCheckAt?: string;
  onChangeNotify?: string;
  onChangeAutoAct?: string;
  authorizationTier?: string;
  lastCheckedAt?: string;
}

interface MonitoringContext {
  activeCount: number;
  items: MonitoringItem[];
  paused: boolean;
}
```

**现状映射：** `TripMonitoringMvpService` + `TravelStatusView.automation`

### 6.8 History — 为什么变成现在这样

```typescript
interface ContextHistoryEntry {
  entryId: string;
  at: string;
  revision: number;
  kind:
    | 'INTENT_HANDLED'
    | 'DECISION_RESOLVED'
    | 'WORLD_FACT_CHANGED'
    | 'PLAN_VERSION_APPLIED'
    | 'EXPLORATION_MILESTONE';
  headline: string;
  actor?: 'USER' | 'AI' | 'SYSTEM' | 'MONITORING';
  refs?: Record<string, string>;
}

interface ContextHistory {
  recent: ContextHistoryEntry[];
  explorationArchive?: {
    rejectedRouteIds?: string[];
    researchProtocolId?: string;
    materializedAt?: string;
  };
}
```

**现状映射：** `decisionHistory` + Decision Replay + Exploration route variant 归档

---

## 7. Snapshot 边界 — 什么 **不** 放进来

| 禁止完整内联 | Snapshot 中保留 |
|-------------|----------------|
| POI 全量详情 | `{ poiId, name, status, detailRef }` |
| 原始天气 / 路况 API 响应 | `WorldFact` 摘要 + `sourceId` |
| 完整聊天记录 | `history.recent` 摘要 |
| 所有候选路线完整结构 | exploration 投影 via `detailRef` |
| GeoJSON 大对象 | `geometryRef` |
| 原始研究材料 | `researchRef` |
| 详细推理链 | Decision Replay `ref` |
| UI 折叠状态 | **永不进入** |

---

## 8. Travel Context Protocol 操作

### 8.1 读取

#### 8.1.1 完整 Snapshot（高权限 / 初始化 / 调试）

```http
GET /api/travel-contexts/:contextId
Authorization: Bearer <JWT>
```

响应：`TravelContextSnapshot` + `meta.revision`

#### 8.1.2 页面 Projection（默认路径）

```http
GET /api/travel-contexts/:contextId/views/:viewName
```

| viewName | 主要域 | 典型页面 |
|----------|--------|----------|
| `overview` | intent, plan 摘要, decisions.count, monitoring | 行程首页 |
| `exploration` | intent, exploration 候选状态, uncertainties | 探索工作台 |
| `plan` | plan, contract 影响, world 摘要 | 行程详情 |
| `decisions` | decisions 全量 + options ref | 决策中心 |
| `monitoring` | monitoring, contract.automation | 授权 / 监控 |
| `participants` | participants（权限裁剪） | 成员页 |
| `feasibility` | contract, plan, world, uncertainties | 可行性报告 |
| `assistant` | overview 摘要 + 当前 page slice hint | AI 助手 |

**统一响应信封：**

```json
{
  "success": true,
  "data": {
    "contextId": "ctx_…",
    "snapshotId": "tctx_ctx_…_27",
    "revision": 27,
    "view": "decisions",
    "data": { },
    "observability": {
      "schemaVersion": "travel-context-v1",
      "changedDomains": ["decisions"]
    }
  }
}
```

完整 Snapshot（`GET /travel-contexts/:id`）的 `meta.observability` 供 Harness / 调试；前端可忽略。

#### 8.1.3 Diff

```http
GET /api/travel-contexts/:contextId/diff?sinceRevision=26
```

```json
{
  "fromRevision": 26,
  "toRevision": 27,
  "changes": [
    {
      "path": "decisions.open",
      "operation": "ADD",
      "entityId": "decision_123"
    },
    {
      "path": "world.facts",
      "operation": "UPDATE",
      "entityId": "road_fact_789"
    }
  ]
}
```

#### 8.1.4 Subscription（SSE）

```http
GET /api/travel-contexts/:contextId/events
Accept: text/event-stream
```

事件：

```json
{
  "type": "CONTEXT_REVISION_CHANGED",
  "revision": 28,
  "changedDomains": ["world", "decisions", "monitoring"]
}
```

前端收到后：`diff(sinceRevision)` → 局部 invalidate。

### 8.2 写入 — Intent Protocol

**禁止：** `PATCH /travel-contexts/:contextId` 或 `PATCH /context-snapshot`

**唯一写路径：**

```http
POST /api/travel-contexts/:contextId/intents
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "type": "ACCEPT_DECISION_OPTION",
  "payload": {
    "decisionId": "decision_123",
    "optionId": "option_b"
  },
  "basedOnRevision": 27,
  "idempotencyKey": "optional-uuid"
}
```

**处理链路：**

```text
Intent
  → AuthZ + basedOnRevision 校验
  → Constraint Gateway
  → Decision Runtime / Domain Handler
  → Domain Events
  → Snapshot Builder（revision++）
  → Diff + SSE notify
```

**Revision 冲突（409）：**

```json
{
  "success": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Context has moved to revision 29",
    "details": {
      "expectedRevision": 27,
      "currentRevision": 29,
      "changedDomains": ["world", "decisions"]
    }
  }
}
```

#### 8.2.1 V1 Intent 类型（首批）

| type | 替代现状 | stage 要求 |
|------|----------|-----------|
| `CHANGE_EXPLORATION_CONDITIONS` | `PATCH /exploration/scenarios/:id/conditions` | EXPLORATION+ |
| `SET_PRINCIPLES` | `PUT .../principles` | EXPLORATION+ |
| `GENERATE_CANDIDATES` | `POST .../candidates` | EXPLORATION+ |
| `SELECT_ROUTE` | `POST .../selections` | EXPLORATION+ |
| `MATERIALIZE_TRIP` | `POST .../materialize` | EXPLORATION → TRIP_MATERIALIZED |
| `RUN_FEASIBILITY_CHECK` | `POST .../check` | TRIP_MATERIALIZED+ |
| `ACCEPT_DECISION_OPTION` | `POST .../decisions/:id/submit` | TRIP_MATERIALIZED+ |
| `APPLY_DECISION` | `POST .../decisions/:id/apply` | TRIP_MATERIALIZED+ |
| `CHANGE_CONTRACT_CONSTRAINT` | constraints PATCH | TRIP_MATERIALIZED+ |
| `NATURAL_LANGUAGE` | `POST /trips/:id/intent` | 全阶段 |

Exploration 现有 REST **V1 保留为 adapter**；内部转发为 Intent，对外逐步 deprecate。

### 8.3 Agent Context Package

```typescript
// POST /api/context/build — 扩展参数
contextEngine.build({
  contextId: 'ctx_…',
  revision: 27,
  agent: 'ABU',
  task: 'ROAD_SAFETY_VALIDATION',
  includeDomains: [
    'plan.effectivePlan',
    'world.facts',
    'contract.constraints',
    'participants.publicSummary',
  ],
});
```

链路：`TravelContextSnapshot` → Policy → Domain Selection → Permission Filter → Token Compression → `ContextPackage`

**要求：** Agent run 日志必须记录 `{ contextId, snapshotId, revision }`（见 §9.5 Agent Grounding Harness）。

---

## 9. Travel Context × Harness 一体化

### 9.1 定位

Travel Context 不应只是前端统一读取的数据接口，也不只是 Agent 的上下文来源——它还应该是 **TripNARA 所有 Harness 的统一测试协议**。

每一个 Harness Case 必须回答六个问题：

1. 执行前的 Travel Context 是什么。
2. 本次运行基于哪个 `snapshotId + revision`。
3. 什么 Intent、世界事件或用户行为触发了运行。
4. 哪个 Canonical Runtime 处理了它。
5. 哪些上下文字段允许发生变化。
6. 新 Revision 是否满足系统不变量。

Harness 测试的不是「接口返回 200」，而是 **一次 Travel Context 状态迁移是否合法、可解释、可重放**。

### 9.2 职责对照

| 对象 | 主要职责 |
|------|----------|
| Travel Context Snapshot | 某时刻完整、结构化的旅行世界状态 |
| Context Revision | 状态边界；可信版本标识 |
| Intent | 用户或系统希望发生什么变化 |
| Canonical Runtime | 判断 Intent 是否可执行；产生合法状态迁移 |
| Harness Case | 构造输入场景并验证迁移结果 |
| Decision Trace | 运行过程、使用事实、决策路径与权威链路 |
| Context Diff | 旧 Revision → 新 Revision 的结构化变化 |
| Replay | 相同上下文重新执行并验证一致性 |

**共享契约（禁止分叉）：** 相同 Schema · Revision · 事实来源 · 约束定义 · Intent 契约 · Decision Result · 事件格式 · 不变量定义。

### 9.3 统一 Harness Case 契约

所有 Harness（Blocker / Authority / Decision Center / Constraint / Replanning / Agent）使用同一 Case Envelope：

```typescript
type TravelContextDomain =
  | 'intent'
  | 'participants'
  | 'contract'
  | 'plan'
  | 'world'
  | 'decisions'
  | 'monitoring'
  | 'history';

interface TravelContextHarnessCase {
  caseId: string;
  title: string;
  category:
    | 'CONTEXT_ASSEMBLY'
    | 'PROJECTION_CONSISTENCY'
    | 'CONSTRAINT'
    | 'DECISION'
    | 'AUTHORITY'
    | 'REPLANNING'
    | 'AUTOMATION'
    | 'PERMISSION'
    | 'CONCURRENCY'
    | 'REPLAY';

  given: {
    contextFixtureId: string;
    expectedBaseRevision?: number;
    contextOverrides?: Partial<TravelContextSnapshot>;
    externalFacts?: WorldFact[];
    authorizationPolicy?: Record<string, unknown>;
  };

  when: {
    triggerType:
      | 'USER_INTENT'
      | 'WORLD_EVENT'
      | 'AGENT_REQUEST'
      | 'MONITORING_TRIGGER'
      | 'SYSTEM_COMMAND';
    intent?: TravelContextIntent;
    event?: TravelWorldEvent;
    agentRun?: AgentRunRequest;
  };

  expect: {
    outcome:
      | 'APPLIED'
      | 'REJECTED'
      | 'WAITING_USER'
      | 'NO_CHANGE'
      | 'FAILED_SAFE';
    expectedChangedDomains?: TravelContextDomain[];
    forbiddenChangedDomains?: TravelContextDomain[];
    expectedDecisionStatus?: string;
    expectedEvents?: string[];
    expectedRevisionDelta?: number;
    invariants: string[]; // invariantId from Registry
    expectedReasonCodes?: string[];
  };
}
```

**现状映射：** 收敛 `src/harness/evals/blockers/blocker-case.schema.ts`、`authority-case.schema.ts` 为此 Envelope 的子集或 adapter。

### 9.4 Harness 执行锚点（Revision Anchor）

每次 Harness 运行必须记录，禁止只记「输入 / 输出 / pass」：

```typescript
interface HarnessExecutionAnchor {
  contextId: string;
  inputSnapshotId: string;
  inputRevision: number;
  effectivePlanVersion?: string;
  worldStateVersion: string;
  constraintVersion: string;
  runtimeAuthority: 'CANONICAL' | 'LEGACY' | 'SHADOW';
  outputSnapshotId?: string;
  outputRevision?: number;
  authorityRunId?: string;
  changedDomains?: TravelContextDomain[];
}
```

示例审计链：

```text
Revision 27 → 道路关闭事件 → Canonical Decision Gateway
  → 生成 Decision Problem → 未修改 Effective Plan → Revision 28
```

**Authority Trace 扩展（升级现有 Authority Audit）：**

```typescript
interface ContextAuthorityTrace {
  authorityRunId: string;
  inputContext: { snapshotId: string; revision: number };
  authority: {
    runtime: 'CANONICAL' | 'LEGACY' | 'SHADOW';
    gateway: string;
    policyVersion: string;
  };
  outputContext?: { snapshotId: string; revision: number };
  changedDomains: string[];
}
```

### 9.5 Harness 六层覆盖

#### 9.5.1 Context Assembly Harness

验证 Snapshot 是否正确组装：Intent 完整、Contract 含用户约束、Effective Plan 唯一、World Fact 带来源与新鲜度、Open Decisions 与 Runtime 一致、Monitoring 真实、私密字段按权限裁剪、过期事实已标记。

#### 9.5.2 Projection Consistency Harness

对比 `overview | plan | decisions | monitoring | Agent Package` 在同一 Revision 下的一致性。

**必测用例：**

| Case ID | 断言 |
|---------|------|
| `PROJECTION-CONSISTENCY-001` | `overview.openDecisionCount === decisions.items.length === snapshot.decisions.counts.total` |
| `PROJECTION-CONSISTENCY-002` | Plan 页与 Decision Center 引用相同 `effectivePlanVersion` |
| `PROJECTION-CONSISTENCY-003` | Agent 不得使用早于页面当前状态的 Revision |

#### 9.5.3 Intent Transition Harness

验证写路径：`Intent → basedOnRevision → AuthZ → Constraint Gateway → Runtime → Event → revision++`；拒绝时 Revision 不变且留下 reasonCode。

#### 9.5.4 Decision Authority Harness

收敛 `src/harness/evals/authority/`。核心不变量：

| ID | 规则 |
|----|------|
| **CTX-AUTH-001** | 只有 Canonical Runtime 可修改 `effectivePlan` |
| **CTX-AUTH-002** | Legacy 可读 Context，不得产生新有效 Revision |
| **CTX-AUTH-003** | Shadow 可出候选，不得写入 effectivePlan / contract / resolvedDecision |
| **CTX-AUTH-004** | 任何写操作必须声明 `inputRevision` |
| **CTX-AUTH-005** | 输出 Revision 必须追溯到唯一 `authorityRunId` |

#### 9.5.5 Agent Grounding Harness

每次 Agent Run 记录 `AgentRunTrace`：`contextId, snapshotId, revision, includedDomains, factRefs, constraintRefs, outputType`。

**必测：** `AGENT-GROUNDING-ABU-001`（道路安全含 world + contract.safety）、`AGENT-GROUNDING-DRE-001`（节奏含 participants + pacing）、`AGENT-GROUNDING-CROSS-001`（三人格同轮同 Revision）。

#### 9.5.6 Monitoring & Replanning Harness

逐阶段断言：`Monitoring 检测 → World Fact → revision++ → Impact → Open Decision → revision++ → 授权策略 → 可选自动修复`，而非只看最终文案。

### 9.6 Context Invariant Registry

所有 Harness 共用注册表，禁止各测试自行散落断言：

```typescript
interface ContextInvariantDefinition {
  invariantId: string;
  domain: string;
  severity: 'BLOCKER' | 'CRITICAL' | 'WARNING';
  description: string;
  evaluate(
    before: TravelContextSnapshot,
    after: TravelContextSnapshot,
    trace: ContextAuthorityTrace,
  ): InvariantResult;
}
```

**首批不变量（P0）：**

| ID | 描述 |
|----|------|
| `CTX-STATE-001` | 一个 Context 只能存在一个 effectivePlan |
| `CTX-STATE-002` | Revision 必须单调递增 |
| `CTX-STATE-003` | Snapshot 不得引用不存在的 Plan Version |
| `CTX-CONSTRAINT-001` | 所有硬约束必须进入 Decision Runtime 输入 |
| `CTX-CONSTRAINT-002` | 违反硬约束的候选不得成为 Effective Plan |
| `CTX-DECISION-001` | 同一问题不得同时存在多个有效 Open Decision |
| `CTX-WORLD-001` | 触发决策的世界事实必须带来源和 observedAt |
| `CTX-WORLD-002` | 过期事实不得直接触发自动执行 |
| `CTX-PRIVACY-001` | 公共 Projection 不得含成员私密偏好原文 |
| `CTX-CONCURRENCY-001` | 基于旧 Revision 的写入不得静默覆盖新状态 |
| `CTX-AUTOMATION-001` | 产生费用或不可逆修改的动作必须要求确认 |

### 9.7 完整 Harness 示例（道路关闭）

```typescript
const roadClosureCase: TravelContextHarnessCase = {
  caseId: 'REPLAN-ROAD-CLOSURE-001',
  title: '道路关闭后创建决策问题，但不得静默修改行程',
  category: 'REPLANNING',
  given: {
    contextFixtureId: 'iceland-south-coast-ready-v3',
    expectedBaseRevision: 27,
    authorizationPolicy: { roadClosure: 'ASK_BEFORE_APPLY' },
  },
  when: {
    triggerType: 'WORLD_EVENT',
    event: {
      type: 'ROAD_CLOSED',
      roadId: 'IS-F208',
      observedAt: '2026-07-05T10:00:00Z',
      sourceId: 'road-authority-is',
    },
  },
  expect: {
    outcome: 'WAITING_USER',
    expectedChangedDomains: ['world', 'decisions', 'monitoring'],
    forbiddenChangedDomains: ['plan', 'contract', 'participants'],
    expectedEvents: [
      'WORLD_FACT_OBSERVED',
      'PLAN_IMPACT_DETECTED',
      'DECISION_PROBLEM_CREATED',
    ],
    expectedRevisionDelta: 1,
    invariants: [
      'CTX-AUTH-001',
      'CTX-CONSTRAINT-001',
      'CTX-WORLD-001',
      'CTX-AUTOMATION-001',
    ],
    expectedReasonCodes: [
      'ROAD_CLOSED',
      'ACTIVE_PLAN_AFFECTED',
      'USER_CONFIRMATION_REQUIRED',
    ],
  },
};
```

验证目标：`worldFacts` 新增关闭事实 · `openDecisions` 新增问题 · `monitoring` 更新 · **`effectivePlan` 未变** · Revision 27→28 · Canonical Authority 唯一。

### 9.8 生产回放（Production Replay）

每次生产运行持久化：`inputRevision · trigger · runtimeVersion · factsUsed · constraintVersion · authorizationPolicy · outputRevision · contextDiff`。

```text
Production Trace → Anonymize → Freeze Context Fixture → Replay Case → Regression Suite
```

线上异常（如「道路关闭但未创建 Decision Problem」）固化为 `REGRESSION-ROAD-CLOSURE-20260705-001`，纳入发布前重放。**真实旅行异常转化为永久 Harness Case**，形成数据飞轮。

### 9.9 与现有 Harness 收敛（不新建第七套）

保留现有套件，统一底层 Fixture / Revision Anchor / Invariant Registry：

```text
src/harness/
├── protocol/                          # 新增 — 与 travel-context 共享类型
│   ├── harness-case.types.ts          # TravelContextHarnessCase
│   ├── context-fixture.types.ts
│   ├── execution-anchor.types.ts
│   └── invariant.types.ts
├── fixtures/
│   ├── contexts/                      # TravelContextSnapshot fixtures
│   ├── world-events/
│   └── authorization-policies/
├── invariants/                        # Context Invariant Registry
│   ├── context-state/
│   ├── authority/
│   ├── constraints/
│   ├── decisions/
│   ├── privacy/
│   └── concurrency/
├── evals/                             # 现有 — 逐步迁移 Case Envelope
│   ├── blockers/                      # src/harness/evals/blockers/
│   ├── authority/                     # src/harness/evals/authority/
│   ├── projections/                   # 新增
│   ├── agents/                        # 新增
│   ├── monitoring/                    # 新增
│   └── replanning/                    # 新增
├── replay/
│   ├── production-trace-importer.ts
│   └── replay-runner.ts
└── reports/
    ├── context-diff-reporter.ts
    └── authority-trace-reporter.ts
```

**迁移原则：** `blocker-case.schema` / `authority-case.schema` → adapter 到 `TravelContextHarnessCase`；新 Case 必须带 `HarnessExecutionAnchor`。

### 9.10 API 可观测性（Harness 友好响应）

前端默认只用 `revision · changedDomains · snapshotId`；内部 / Harness 可读完整 observability（见 §6 Snapshot `meta.observability`）。

Intent 响应与 SSE 事件应携带：

```json
{
  "contextId": "ctx_123",
  "snapshotId": "tctx_ctx_123_28",
  "revision": 28,
  "schemaVersion": "travel-context-v1",
  "authority": { "runtime": "CANONICAL", "runId": "run_987" },
  "derivedFrom": { "previousRevision": 27, "triggerType": "WORLD_EVENT" },
  "changedDomains": ["world", "decisions"]
}
```

---

## 10. 前端契约

### 10.1 Provider

```tsx
<TravelContextProvider contextId={contextId}>
  <TripApplication />
</TravelContextProvider>
```

### 10.2 Hooks

```typescript
const overview = useTravelContextView('overview');
const { revision, submitIntent, refresh } = useTravelContext();

await submitIntent({
  type: 'ACCEPT_DECISION_OPTION',
  payload: { decisionId, optionId },
});
```

### 10.3 Provider 职责

- revision 管理与 `basedOnRevision` 注入
- Projection 缓存（key: `contextId:view:revision`）
- Diff 增量合并
- SSE 连接与 domain 级 invalidate
- `REVISION_CONFLICT` 重试策略
- 权限裁剪（不暴露 `privateUserContext` 给其他成员）

### 10.4 页面 = 投影（非独立产品逻辑）

| 页面 | view |
|------|------|
| 行程首页 | `overview` |
| 行程详情 | `plan` |
| 探索工作台 | `exploration` |
| 决策中心 | `decisions` |
| 约束控制台 | `contract` slice from `plan` + dedicated future view |
| AI 助手 | `assistant` |
| 授权中心 | `monitoring` |
| 成员页 | `participants` |
| 可行性报告 | `feasibility` |
| 行中状态 | `overview` + realtime world diff |

---

## 11. 与现有工程映射

| Travel Context 组件 | 现有模块 | 迁移动作 |
|----------------------|----------|----------|
| Snapshot Builder (Trip 阶段) | `TripContextSnapshotAssemblerService` | 包装为 adapter |
| Snapshot Builder (Exploration) | `ExplorationScenarioService` + variants | **新建** `ExplorationContextAdapter` |
| Identity | `ExplorationScenario.id` | 加 `contextId` 字段（V1 = id） |
| Decisions 域 | `UnifiedDecisionProblemReadModelService` | 复用 |
| Contract 域 | `TravelDecisionContract` builder | 复用 + 映射 `ContextConstraint` |
| World 域 | `WorldStateSnapshotService` | 复用 +  enrich `WorldFactKind` |
| Monitoring 域 | `TripMonitoringMvpService` | 复用 +  enrich UI 字段 |
| Intent Router | `TripIntentRouterService` | 扩展 typed intent |
| Agent Package | `ContextEngineerService.build()` | 增加 `contextId/revision` 入参 |
| History | Decision Replay + resolution store | 投影为 `ContextHistoryEntry` |
| Harness Case Envelope | `src/harness/evals/blockers/`、`authority/` | 收敛到 `TravelContextHarnessCase` |
| Invariant Registry | 散落 assertion 文件 | `src/harness/invariants/` |
| Execution Anchor | `harness-trace.types.ts` | 扩展 `HarnessExecutionAnchor` |

### 11.1 向后兼容别名（过渡期）

```http
GET /api/trips/:tripId/context-snapshot
  → 内部 resolve contextId from Trip.metadata
  → 返回 TravelContextSnapshot 的 trip 等价视图（schema 兼容层）
```

---

## 12. Exploration Materialize 迁移方案

### 12.1 今天的行为（问题）

```text
POST /exploration/scenarios/:id/materialize
  → 新建 tripId（randomUUID）
  → Trip.metadata.explorationScenarioId = scenarioId
  → scenario.status = MATERIALIZED
  → 探索阶段数据留在 exploration 表，History 无归档
```

参考：`ExplorationTripMaterializerService.materializeShell()`

### 12.2 目标行为

```text
POST /api/travel-contexts/:contextId/intents
  { "type": "MATERIALIZE_TRIP", "basedOnRevision": N }

  1. contextId 不变（= scenarioId）
  2. identity.stage: EXPLORATION → TRIP_MATERIALIZED
  3. identity.tripId := 新 tripId
  4. history.explorationArchive := {
       rejectedRouteIds, selectedRouteId, principles, researchProtocolId
     }
  5. revision := N + 1
  6. 发出 EXPLORATION_MILESTONE 事件
```

### 12.3 数据迁移（Prisma）

**Phase 1 迁移 — 仅加字段，不改行为：**

```sql
-- exploration_scenarios.context_id UUID NOT NULL DEFAULT id
-- trips.metadata->>'travelContextId' 写入 contextId
```

**Phase 2 — materialize 写 History：**

在 `materializeShell` 事务内追加：

1. 读取 active + archived `ExplorationRouteVariant`
2. 写入 `Trip.metadata.travelContext.explorationArchive`
3. 写入 `Trip.metadata.travelContextId = scenarioId`

**Phase 3 — Intent 化：**

`ExplorationOrchestrator.materialize()` → `TravelContextIntentHandler.handle(MATERIALIZE_TRIP)`

### 12.4 字段映射（Exploration → Travel Context）

| Exploration 源 | Travel Context 域 |
|----------------|-------------------|
| `initialInput.destinationCodes` | `intent.destination` |
| `initialInput.dateRange` | `intent.dateRange` |
| `initialInput.travelers` | `participants` + `contract` 种子 |
| `initialInput.budget` | `intent.budget` |
| Consumer principles | `intent.rankedPrinciples` + `contract.constraints` |
| `ExplorationRouteVariant` (active) | `plan.selectedRouteId` + exploration view refs |
| `ExplorationRouteVariant` (archived) | `history.explorationArchive.rejectedRouteIds` |
| `candidatesStatus` | `exploration` projection |
| materialize 后 trip | `identity.tripId` + `plan.effectivePlan` shell |

### 12.5 验收用例（Materialize 连续性的 DoD）

1. 探索页 `GET .../views/exploration` revision = 5，含 3 条候选
2. 用户 `SELECT_ROUTE` → revision = 6
3. 用户 `MATERIALIZE_TRIP` → revision = 7，`identity.tripId` 非空，`stage = TRIP_MATERIALIZED`
4. 首页 `GET .../views/overview` revision = 7，**同一 contextId**，`history.explorationArchive.rejectedRouteIds` 含 2 条
5. Agent build 日志含 `{ contextId, revision: 7 }`

---

## 13. 分阶段落地

### 13.1 Travel Context 工程 Phase

| Phase | 范围 | 交付物 | 周期（估） |
|-------|------|--------|-----------|
| **0** ✅ | 类型 + adapter 壳 | `src/travel-context/`；GET `/travel-contexts/:id` + `views/*` | 已完成 |
| **1** ✅ | Identity + Exploration 读 | `contextId` 显式字段；`EXPLORATION-PROJECTION-001`；Revision Service | 已完成 |
| **2** ✅ | Trip 读 + 前端 Provider | Trip adapter + open decisions；8 views；`createTravelContextProvider` | 已完成 |
| **3** ✅ | Intent + Revision | typed intent；`POST /intents`；`basedOnRevision`；409 | 已完成 |
| **4** ✅ | Materialize 连续性 | §12 迁移；History archive 写入 trip.metadata | 已完成 |
| **5** ✅ | Diff + SSE | `GET /diff`；`GET /events` SSE；revision journal | 已完成 |
| **6** ✅ | Agent 绑定 | `context/build` 接 Travel Context；`travelContextGrounding` metadata | 已完成 |

### 13.2 Harness 一体化 Phase

| Phase | 范围 | 交付物 |
|-------|------|--------|
| **H-P0** | Revision 绑定 | Authority / Blocker Harness 增加 input/output Revision Anchor；真实 Context Fixture；首批 Invariant Registry；Context Diff 输出 |
| **H-P1** | Projection Harness | `PROJECTION-CONSISTENCY-001~003`；跨页面 Revision 一致 gate |
| **H-P2** | Agent Grounding | `AgentRunTrace`；三人格同 Revision 用例 |
| **H-P2b** | Intent + Replanning | `INTENT-TRANSITION-001~003`；`REPLAN-ROAD-CLOSURE-001` |
| **H-P3** | 生产回放 | Production Trace → Fixture → Regression Suite |

**并行约束：** Phase 3 前 **不得** 删除现有 Exploration REST；H-P0 可与 Context Phase 1–2 并行。

---

## 14. 成功标准（Protocol + Harness DoD）

### 14.1 Travel Context

- [ ] 任意两个页面（exploration + decision-center）响应含相同 `contextId` + `revision`
- [ ] 任意 Agent run 审计含 `{ contextId, snapshotId, revision }`
- [ ] 任意状态变更可追溯到 `IntentHandled` history entry
- [ ] materialize 前后 `contextId` 不变，exploration 淘汰方案进入 `history.explorationArchive`
- [ ] 无页面直接 PATCH snapshot；写操作均经 `/intents`
- [ ] Projection 响应不含 POI 全量 / GeoJSON（仅 ref）
- [ ] 成员 A 不可通过 snapshot 读取成员 B 的 PDI-1 私密字段

### 14.2 Harness 一体化

- [ ] **状态一致：** 任意页面、Agent、Decision Runtime 可声明使用的 Context Revision
- [ ] **状态迁移可验证：** 每次 Revision 变化有 trigger · runtime · events · diff · authorityRunId
- [ ] **生产可重放：** 线上错误可基于当时 Snapshot 重建 Harness Case
- [ ] **约束不旁路：** 任何 Plan 修改经相同 Constraint Invariant
- [ ] **权威唯一：** 只有 Canonical Runtime 产生有效状态 Revision（CTX-AUTH-001~005）
- [ ] **页面不说谎：** Projection 核心事实由 Harness 自动一致性验证
- [ ] **Agent 不脱离世界：** Agent 输出可追溯到 Snapshot + Fact + Constraint

---

## 15. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Snapshot 变超级 DTO | Schema Registry + 域 Owner + 仅 projection 对外 |
| 双写期 Exploration REST vs Intent | Adapter 模式；REST 内部调 IntentHandler |
| Revision 计算不一致 | 中心化 `TravelContextRevisionService`；禁止各模块自算 |
| 性能（大 trip 装配慢） | view 级 lazy domain；overview 限 50ms SLA |
| Harness 与 Context 类型分叉 | `src/harness/protocol/` 从 `travel-context/domain` re-export；单 Schema Registry |
| 生产 Replay PII | Anonymize 管道；Fixture 不含 raw 用户数据 |

---

## 16. 开放问题

1. **contextId 对外是否等于 scenarioId** — V1 提议相等以简化；长期是否改为独立 UUID？
2. **revision 数字 vs 字符串** — Trip 现用 `computeTripContextRevision()` 字符串；Protocol 提议单调整数 + bindings 子版本。是否整数 revision 为主、字符串为 debug？
3. **Guide-to-Plan 合并时机** — 与 Exploration 统一 contextId 在 Phase 2 还是独立 Phase？
4. **SSE vs WebSocket** — V1 SSE 足够？行中是否需要 WS 双向？
5. **Harness Fixture 存储** — Git JSON vs DB；生产 Replay 保留周期？

---

## 17. 附录 A — 建议工程目录

```text
src/travel-context/
├── domain/
│   ├── travel-context.types.ts
│   ├── travel-context-identity.ts
│   ├── travel-context-revision.ts
│   └── travel-context-policy.ts
├── snapshot/
│   ├── travel-context-snapshot-builder.service.ts
│   ├── adapters/
│   │   ├── trip-context.adapter.ts          # wraps TripContextSnapshotAssembler
│   │   └── exploration-context.adapter.ts
│   └── travel-context-revision.service.ts
├── projections/
│   ├── projection-resolver.service.ts
│   ├── overview.projection.ts
│   ├── exploration.projection.ts
│   ├── decisions.projection.ts
│   └── plan.projection.ts
├── intents/
│   ├── travel-context-intent.controller.ts
│   ├── travel-context-intent-router.service.ts
│   └── handlers/
│       ├── materialize-trip.handler.ts
│       ├── accept-decision.handler.ts
│       └── exploration.handlers.ts
├── diff/
│   └── travel-context-diff.service.ts
├── subscriptions/
│   └── travel-context-events.controller.ts
└── agent-package/
    └── travel-context-context-engine-bridge.service.ts
```

**Harness 收敛目录（§9.9，与 travel-context 共享类型）：**

```text
src/harness/
├── protocol/                    # harness-case.types.ts 等 — import from travel-context/domain
├── fixtures/contexts/           # TravelContextSnapshot JSON fixtures
├── invariants/                  # CTX-* Invariant Registry
├── evals/                       # 现有 blockers/ authority/ + 新增 projections/ agents/
├── replay/                      # production-trace-importer, replay-runner
└── reports/                     # context-diff-reporter, authority-trace-reporter
```

---

## 18. 附录 B — 相关文档索引

| 文档 | 关系 |
|------|------|
| [TRIPNARA_AI_NATIVE_POSITIONING.md](./TRIPNARA_AI_NATIVE_POSITIONING.md) | 上位战略 §5.2 |
| [travel-compiler-integration-v1.md](./travel-compiler-integration-v1.md) | Plan 域 `canonicalTravelGraph` |
| [AUTOMATION_AUTHORIZATION_CENTER_FRONTEND_API.md](./AUTOMATION_AUTHORIZATION_CENTER_FRONTEND_API.md) | monitoring 投影 |
| [prd-exploration-reliability-closure-v1.1.md](../exploration/prd-exploration-reliability-closure-v1.1.md) | Exploration Intent 迁移源 |
| [Harness 架构地图](../orchestration/harness-architecture-map.md) | Harness 收敛上位 |
| [harness-quality-loop-runbook](../orchestration/harness-quality-loop-runbook.md) | Quality Loop |
| [PATENT_MAPPING.md](../../src/agent/context-engine/PATENT_MAPPING.md) | Agent Context Package 专利对齐 |

---

**变更记录**

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-07-05 | 初稿：Protocol 定义 + Exploration materialize 迁移 |
| 1.0.1 | 2026-07-05 | **Phase 0 落地**：`src/travel-context/` 类型、adapter、GET API |
| 1.1.0 | 2026-07-05 | **Harness 一体化**：§9 全章、Invariant Registry、H-P0~P3 路线图、DoD 扩展 |
| 1.1.1 | 2026-07-05 | **H-P0 落地**：`src/harness/protocol/`、`invariants/`、`PROJECTION-CONSISTENCY-001~003` |
| 1.1.2 | 2026-07-05 | **H-P1 起步**：AU-P0 Authority + Execution Anchor；`CONTEXT-ASSEMBLY-001`；replay importer 壳 |
| 1.1.3 | 2026-07-05 | **H-P1 完成**：AU-P1-004~008 + Execution Anchor；`AGENT-GROUNDING-CROSS/ABU/DRE-001`；replay fixture 持久化 |
| 1.1.4 | 2026-07-05 | **H-P2b 落地**：`INTENT-TRANSITION-001~003`；`REPLAN-ROAD-CLOSURE-001`；`CTX-WORLD-001`；`REPLAY-REGRESSION-001` E2E |
| 1.1.5 | 2026-07-05 | **H-P3 落地**：Context Diff；RFC001→Travel Context bridge L2；Regression Gate |
| 1.1.6 | 2026-07-05 | **Travel Context Phase 1**：`exploration_scenarios.context_id`；Revision Service；EXPLORATION-PROJECTION-001 |
| 1.1.7 | 2026-07-05 | **Travel Context Phase 2**：Trip adapter + 8 views；resolve/by-trip；`createTravelContextProvider` |
| 1.1.8 | 2026-07-05 | **Travel Context Phase 3**：`POST /intents`；`TravelContextIntentService`；409 `REVISION_CONFLICT`；Provider `submitIntent` |
| 1.1.9 | 2026-07-05 | **Travel Context Phase 4**：materialize/selectRoute 写 `trip.metadata.travelContext.explorationArchive`；snapshot 优先读 trip archive |
| 1.2.0 | 2026-07-05 | **Travel Context Phase 5**：`GET /diff`；`GET /events` SSE；revision journal + Provider incremental sync |
| 1.2.1 | 2026-07-05 | **Travel Context Phase 6**：`POST /context/build` 扩展 contextId/revision/includeDomains；TRAVEL_CONTEXT block |
