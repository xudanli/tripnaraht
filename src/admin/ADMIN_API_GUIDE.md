# 管理后台接口对接指南

本文档描述 TripNARA 管理后台需要对接的所有 API 接口。

---

## 一、管理后台功能模块

| 模块 | 功能 | 基础路径 |
|------|------|----------|
| 行程管理 | 行程列表、统计、导出、世界状态投影、旅行决策合同 | `/api/trips/admin` |
| 地点管理 | POI 增删改查 | `/api/places/admin` |
| 决策监控 | 决策日志 + **决策问题（同日交通偏紧）** | `/api/decision/admin`（logs + `decision-problems`） |
| 目的地配置 | 澄清配置管理（活跃配置台） | `/api/admin/destination-clarification` |
| 决策引擎运维 | 营运策略 P-OPS / 健康检查 / 实况审计 | `/api/decision-engine/v1`（**无** `/admin` 前缀） |
| ~~决策草案~~ | ~~草案统计 / Studio~~ | ~~`/api/decision-draft`~~ **（已废弃）** |
| ~~规划工作台~~ | ~~会话、计划管理~~ | ~~`/api/planning-workbench/admin`~~ **（已废弃）** |
| 准备度配置 | Readiness Pack 管理 | `/api/readiness/admin` |
| 国家知识库 | CountryProfile V2 增删改查 | `/api/admin/countries`（兼容 `/api/countries/admin`） |
| 执行风险知识库 | 风险定义/阈值/因果链/动作版本管理（P0 只读+激活；P1 DRAFT 编辑+harness） | `/api/admin/execution-risk/knowledge` |
| Knowledge Control Center | Entity Identity / resolve / unresolved（Phase 1） | `/api/admin/knowledge` |
| RAG 系统 | 文档、缓存、指标 | `/api/rag` |
| 数据质量 | 地理数据质量监控 | `/api/admin/data-quality` |
| Agent 监控 | Agent 运行状态 | `/api/agent/admin` |
| 用户管理 | 用户列表、统计 | `/api/users/admin` |
| 系统监控 | 性能、错误、缓存 | `/api/system/admin` |
| 联系消息 | 用户消息管理 | `/api/contact/admin` |
| ~~Chain-of-Work（工作链）~~ | ~~步骤草案/执行监控~~ | ~~`/api/chain-of-work/admin`~~ **（已废弃）** |

> **废弃说明**  
> - **工作链** Admin（`/api/chain-of-work/**`）：`decision_drafts` 写路径停更；勿新对接。  
> - **决策草案**（`/api/decision-draft/**`，含 Admin 前端 `/admin/decision-draft`）：与工作链共用 `decision_drafts`，最晚约 2026-05；`stats` 为假数据桩；iOS 不用。  
> - **规划工作台** Admin（`/api/planning-workbench/admin`）：读 `planning_plans`，当前 **0 条**且无稳定写路径；列表恒空。iOS 不调这 5 个接口。  
> - 智能体 / 规划运行请看 **Agent 监控**（`/api/agent/admin/runs`）与 **行程管理**。上述接口暂保留兼容，Swagger 已标 `deprecated`。

---

## 二、核心管理接口

### 2.1 行程管理 `/api/trips/admin`

#### 原型页面：行程管理列表

```
┌─────────────────────────────────────────────────────────────────┐
│  行程管理                                    [导出] [批量操作]   │
├─────────────────────────────────────────────────────────────────┤
│  筛选: [状态 ▼] [国家 ▼] [日期范围]  [搜索...]                  │
├─────────────────────────────────────────────────────────────────┤
│  ☑ ID        用户      目的地    状态    创建时间    操作       │
│  ─────────────────────────────────────────────────────────────  │
│  ☐ trip-001  张三      冰岛      进行中  2026-02-01  [详情]     │
│  ☐ trip-002  李四      挪威      已完成  2026-01-28  [详情]     │
│  ☐ trip-003  王五      冰岛      草稿    2026-02-03  [详情]     │
├─────────────────────────────────────────────────────────────────┤
│  共 156 条  < 1 2 3 4 5 >                                       │
└─────────────────────────────────────────────────────────────────┘
```

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/trips/admin` | 获取行程列表（分页、筛选） |
| GET | `/api/trips/admin/stats` | 获取统计数据 |
| GET | `/api/trips/admin/:id` | 获取行程详情 |
| GET | `/api/trips/admin/:id/world-state` | 获取行程世界状态投影（六域 + 风险总览） |
| GET | `/api/trips/admin/:id/decision-contract` | 获取行程旅行决策合同（只读，免成员校验） |

完整接口文档：[TRAVEL_DECISION_CONTRACT_ADMIN_API.md](./TRAVEL_DECISION_CONTRACT_ADMIN_API.md)
| GET | `/api/trips/admin/:id/export` | 导出行程数据 |
| POST | `/api/trips/admin/batch` | 批量操作 |

**示例：获取行程列表**

```bash
GET /api/trips/admin?page=1&limit=20&status=IN_PROGRESS&destination=IS
# 或 countryCode=IS（与 destination 等价）
# 可选 search=关键词（行程名 / 目的地 / 行程ID / 创建者邮箱或昵称）

Response:
{
  "data": {
    "items": [
      {
        "id": "trip-001",
        "name": "冰岛环岛 7 日",
        "destination": "IS",
        "startDate": "2026-02-01T00:00:00.000Z",
        "endDate": "2026-02-07T00:00:00.000Z",
        "status": "IN_PROGRESS",
        "durationDays": 7,
        "budgetConfig": { "...": "..." },
        "pacingConfig": { "...": "..." },
        "createdAt": "2026-01-15T10:00:00.000Z",
        "updatedAt": "2026-02-03T08:30:00.000Z",
        "owner": {
          "userId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
          "role": "OWNER",
          "email": "zhangsan@example.com",
          "displayName": "张三",
          "avatarUrl": "https://..."
        },
        "stats": {
          "daysCount": 7,
          "itemsCount": 28,
          "collaboratorsCount": 2,
          "likesCount": 5,
          "collectionsCount": 1,
          "sharesCount": 0
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 156,
      "totalPages": 8
    }
  }
}
```

**示例：获取统计数据**

```bash
GET /api/trips/admin/stats?startDate=2026-01-01&endDate=2026-02-03

Response:
{
  "data": {
    "total_trips": 156,
    "active_trips": 45,
    "completed_trips": 89,
    "by_country": {
      "IS": 78,
      "NO": 45,
      "GL": 33
    },
    "by_status": {
      "draft": 22,
      "active": 45,
      "completed": 89
    }
  }
}
```

**示例：获取行程世界状态投影**

只读组装已有落库与 `Trip.metadata`（环境事件、RFC-001 道路断言、冰岛自驾 drivingSettings、日程、执行风险等）。**不**在 GET 时抓取外部实时天气/路况；缺域字段为 `null`，`completeness` 为 0..1。

```bash
GET /api/trips/admin/:id/world-state

Response:
{
  "data": {
    "schemaId": "tripnara.admin_trip_world_state@v1",
    "tripId": "trip-001",
    "capturedAt": "2026-08-13T08:00:00.000Z",
    "environment": {
      "location": "Vík",
      "weather": null,
      "precipitation": null,
      "visibility": null,
      "alerts": ["[HIGH] WEATHER: Blizzard Yellow Warning"]
    },
    "road": {
      "currentSegment": "Highway 1",
      "surfaceCondition": null,
      "riskLevel": "high",
      "closures": null,
      "recommendedSpeedLimit": null
    },
    "vehicle": {
      "model": "4WD SUV",
      "tires": null,
      "driveMode": "4WD",
      "heightLimit": "高底盘",
      "wadingAbility": "Low / restricted"
    },
    "plan": {
      "currentDay": "Day 4",
      "origin": "Vík",
      "destination": "Jökulsárlón",
      "plannedDriveTime": "~3h",
      "midpointStops": 2,
      "lodging": "Hotel near glacier lagoon"
    },
    "team": {
      "size": 4,
      "composition": "含儿童；驾驶者 2 人",
      "staminaStatus": null,
      "driverStatus": "经验: intermediate",
      "preferences": "节奏 balanced；避免夜间驾驶"
    },
    "constraints": {
      "latestArrivalTime": null,
      "maxDailyDrivingHours": 6,
      "drivingPreferences": "Avoid night driving",
      "budgetLevel": "Medium",
      "safetyPriority": null
    },
    "riskOverview": {
      "overallRiskLevel": "high",
      "recommendationText": "建议谨慎，考虑调整行程",
      "impacts": {
        "safety": "high",
        "time": "medium",
        "experience": "unknown",
        "cost": "low"
      }
    },
    "completeness": {
      "environment": 0.4,
      "road": 0.4,
      "vehicle": 0.6,
      "plan": 0.83,
      "team": 0.6,
      "constraints": 0.4
    },
    "provenance": [
      { "domain": "environment", "source": "prisma.TripEnvironmentEvent", "observedAt": "..." }
    ]
  }
}
```

**示例：获取行程旅行决策合同**

只读合成，与用户侧 `GET /api/trips/:tripId/constraints` **同构**（`meta.sections` 7+2 分区 + `items` + `contract`），**不**校验行程成员。愿望/风险上下文优先用 OWNER。可选筛选：`type` / `category` / `status` / `conflictOnly`。

> **性能**：Admin 默认走 **轻量读**（跳过 planning-conflicts / 风险聚合），响应含 `degraded.planningConflictsSkipped=true`。冲突高亮可能为空；完整冲突请用 `POST /api/trips/:tripId/constraints/check`。

```bash
GET /api/trips/admin/:id/decision-contract
# 可选 ?conflictOnly=true&type=HARD

Response:
{
  "data": {
    "schemaId": "tripnara.admin_trip_decision_contract@v1",
    "tripId": "trip-001",
    "capturedAt": "2026-08-13T13:00:00.000Z",
    "contextUserId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "degraded": {
      "planningConflictsSkipped": true,
      "riskActivationSkipped": true
    },
    "meta": {
      "tripId": "trip-001",
      "constraintsVersion": 3,
      "total": 12,
      "byType": { "HARD": 5, "SOFT": 6, "EXTERNAL": 1 },
      "byStatus": { "ACTIVE": 10, "DRAFT": 2 },
      "conflictCount": 1,
      "pendingConfirmCount": 0,
      "countryCode": "IS",
      "sections": [
        { "key": "travel_objectives", "label": "旅行目标", "constraintIds": [], "contractBlock": "objectives" },
        { "key": "hard_must_satisfy", "label": "必须满足", "constraintIds": ["c_time_range", "c_budget_total"] },
        { "key": "soft_prefer", "label": "尽量满足", "constraintIds": ["c_pacing_level"] },
        { "key": "team_members", "label": "团队成员", "constraintIds": ["c_travelers"], "contractBlock": "team_governance" },
        { "key": "change_strategy", "label": "风险与变化策略", "constraintIds": [], "contractBlock": "change_strategy" },
        { "key": "automation", "label": "自动化授权", "constraintIds": [], "contractBlock": "automation" },
        { "key": "conflicts_and_impact", "label": "冲突与影响", "constraintIds": [], "contractBlock": "conflicts" },
        { "key": "readonly_official", "label": "目的地规则", "constraintIds": ["c_official_is_froad_2wd"], "readonly": true }
      ]
    },
    "items": [ /* TripConstraint 卡片，按 id 索引 */ ],
    "contract": {
      "schemaId": "tripnara.travel_decision_contract@v1",
      "tripId": "trip-001",
      "constraintsVersion": 3,
      "objectives": {
        "rankedPrinciples": ["SAFETY", "PACE", "CORE_EXPERIENCE"],
        "version": 1
      },
      "displayPrinciples": [
        { "key": "SAFETY", "label": "安全第一", "rank": 1 },
        { "key": "PACE", "label": "行程轻松", "rank": 2 }
      ],
      "compiledWeights": { "legacy": {}, "canonical": {} },
      "changeStrategy": {
        "archetype": "BALANCED",
        "tolerances": { "maxBudgetOverrunPct": 10 }
      },
      "automation": {
        "defaultLevel": "SUGGEST",
        "autoAllowed": [],
        "confirmationRequired": ["change_lodging"]
      },
      "teamGovernance": { "rules": [] },
      "conflicts": {
        "hasConflicts": true,
        "mustHandle": 1,
        "suggestAdjust": 0,
        "pendingConfirm": 0,
        "conflictConstraintIds": ["c_time_range"]
      }
    }
  }
}
```

> Admin 详情页按 `meta.sections` 分区渲染；有 `contractBlock` 的区块读 `contract.*`，其余用 `constraintIds` 从 `items` 取卡片。  
> 完整 Admin 对接：[TRAVEL_DECISION_CONTRACT_ADMIN_API.md](./TRAVEL_DECISION_CONTRACT_ADMIN_API.md)  
> 用户侧字段：[TRAVEL_DECISION_CONTRACT_FRONTEND_API.md](../trips/trip-constraint-solver/TRAVEL_DECISION_CONTRACT_FRONTEND_API.md)

---

### 2.2 决策监控 `/api/decision/admin`

> **状态：活跃（保留）** — `decision_logs` 持续写入（例：2026-08 千级、近 7 日仍有增量）。与 Agent Runs 互补：本模块看行程决策引擎日志，Agent 看智能体回合。

**列表 / 详情 enrichment（2026-08）**：近年细节多在 `metadata`（列上 `availableOptions` / `confidenceLevel` 等常为空）。Admin 响应已把关键字段提升到顶层：

| 字段 | 说明 |
|------|------|
| `step` / `actor` | 来自 `metadata.route_and_run` |
| `requestId` / `tripRunId` / `durationMs` / `source` | 请求与关联 Agent Run |
| `requestMessagePreview` / `inputsSummaryPreview` / `outputsSummaryPreview` | 用户话 / 输入输出摘要 |
| `explanationPreview` | 解释截断预览 |
| `statistics` | 如幻觉抽查统计 |
| `trip` | `{ id, name, destination, status }` |
| `outcomeCount` | 关联 outcome 数 |
| `contentKind` | `orchestration`（route_and_run 步骤）\| `engine`（更接近决策引擎） |
| 详情另有 | 全文 `requestMessage`、`routeAndRun`、`hallucinationAuditZh`、`links.tripRunAdminPath` 等 + 完整 `metadata` |

##### 列表筛选（看「同日交通偏紧 / 路封」请用 engine）

现网默认 `all` 会被 `route_and_run` 编排步骤淹没（PLAN_GEN / NARRATE / GATE_EVAL…）。**决策监控页默认建议**：

```bash
# 决策引擎向（路封、PHYSICAL、非 route_and_run）
GET /api/decision/admin/logs?contentKind=engine&page=1&limit=20

# 仅 Agent 编排步骤（与 Agent Runs 互补的步骤流水）
GET /api/decision/admin/logs?contentKind=orchestration

# 精确：只要物理/实时路况类
GET /api/decision/admin/logs?decisionSource=PHYSICAL
GET /api/decision/admin/logs?reasonCode=REALTIME_ROAD_CLOSED

# 手动排除编排
GET /api/decision/admin/logs?excludeSource=route_and_run
```

| Query | 含义 |
|-------|------|
| `contentKind=all` | 默认；全部 |
| `contentKind=orchestration` | `metadata.source=route_and_run` |
| `contentKind=engine` | 非 `route_and_run` **或** `decisionSource=PHYSICAL` |
| `source` | 精确匹配 `metadata.source` |
| `excludeSource` | 排除某 source |
| `reasonCode` | `reasonCodes` 包含该码 |

「同日交通偏紧」类**产品决策问题**仍主要在 `GET /api/trips/:tripId/decision-problems`（见下节联查），日志 `engine` 筛的是引擎写入的 PHYSICAL/非编排行。

#### Admin 对接：系统方案 + 因果链（必读）

决策日志页若要展示「系统给出的方案」和「因果链」，**不能只调** `/decision/admin/logs*`。  
现网 `userChoice` / `availableOptions` / `systemRecommendation` / `decision_outcomes` **几乎全空**；方案与因果在 **Agent Run** 与 **行程决策问题** 接口上。

##### 推荐调用顺序（详情页）

```
1) GET  /api/decision/admin/logs/:logId
      → 取 tripId、tripRunId、step、explanation、routeAndRun …

2) 若有 tripRunId：
   GET  /api/agent/admin/runs/:tripRunId
      → 系统方案 / 最终决策：observability.decisionTrace
         · options[]
         · finalDecision.selected / reason / modeFinal
      → 用户接受/改稿：outcome / feedback（accept|edit|…）

3) 若有 tripId（展示统一决策问题方案 + 因果）：
   GET  /api/trips/:tripId/decision-problems
      → 取 problemId（可取 open / 最近一条）

   GET  /api/trips/:tripId/decision-problems/:problemId/options
      → 系统候选方案列表

   GET  /api/trips/:tripId/decision-problems/:problemId/causal-trace
      → 该问题的因果链回放（技术 + 叙事投影）

   可选：
   GET  /api/trips/:tripId/causal-decisions
   GET  /api/trips/:tripId/causal-decisions/:decisionId
```

列表页：
- **同日交通偏紧 / 决策问题（推荐）**：`GET /api/decision/admin/decision-problems?sameDayTravelOnly=true`
- 看**决策引擎日志类**：`GET /api/decision/admin/logs?contentKind=engine`
- 看**编排步骤流水**：`GET /api/decision/admin/logs?contentKind=orchestration`
- 点进决策问题详情后再调 options / causal-trace（见下表）。

##### 决策问题 Admin API（同日交通偏紧）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/decision/admin/decision-problems` | 聚合列表（可 `tripId` / `sameDayTravelOnly` / `scanTrips` / `q`） |
| GET | `/api/decision/admin/decision-problems/:tripId/:problemId` | 问题详情 |
| GET | `/api/decision/admin/decision-problems/:tripId/:problemId/options` | 系统候选方案 |
| GET | `/api/decision/admin/decision-problems/:tripId/:problemId/causal-trace` | 因果链 |

```bash
# 跨最近行程扫「同日交通偏紧」
GET /api/decision/admin/decision-problems?sameDayTravelOnly=true&scanTrips=30

# 某行程全部决策问题
GET /api/decision/admin/decision-problems?tripId={tripId}

# 方案 + 因果
GET /api/decision/admin/decision-problems/{tripId}/{problemId}/options
GET /api/decision/admin/decision-problems/{tripId}/{problemId}/causal-trace
```

需开启 `DECISION_GATEWAY_UNIFIED`。列表**优先读**表 `decision_problem_projections`（物化投影，按 `trip_revision` 失效）；miss/stale 时现算并写回。跨行程默认走索引（`is_same_day_travel`），不再逐行程 collect。

| 机制 | 说明 |
|------|------|
| 物化表 | `decision_problem_projections`（`@@unique(tripId, problemId)` + 同日交通索引） |
| 新鲜度 | `trip_revision` = `buildPlanningConflictsCacheKey(trip)` |
| 写路径 | `invalidateCache` → `scheduleRefresh`；resolution apply 等已挂钩 |
| 读路径 | 产品 list / Admin list → 投影；详情 options/causal 仍现算 |
| 开关 | `DECISION_PROBLEM_PROJECTION=0` 关闭（回退 live） |
| 强制刷新 | `POST /api/decision/admin/decision-problems/refresh?tripId=` |

前端建议：`/admin/decision` 增加 Tab「决策问题」调上述 API；「日志」Tab 继续用 `contentKind` 筛 logs。

**立即可验：**

```bash
# 物化指定行程
POST /api/decision/admin/decision-problems/refresh?tripId=5945a3ab-75d2-4911-ae82-9647c8c29e96

# 扫同日交通偏紧（读投影表）
GET /api/decision/admin/decision-problems?sameDayTravelOnly=true

# 产品路径（命中投影后应变快）
GET /api/trips/{tripId}/decision-problems
```

##### 接口对照

| 能力 | 方法 | 路径 | 鉴权 / 说明 |
|------|------|------|-------------|
| 决策步骤列表 | GET | `/api/decision/admin/logs` | Admin；步骤流水（可 contentKind） |
| **决策问题列表（同日交通偏紧）** | GET | `/api/decision/admin/decision-problems` | Admin 聚合；非 decision_logs |
| **问题详情 / 方案 / 因果** | GET | `/api/decision/admin/decision-problems/:tripId/:problemId[/options|/causal-trace]` | Admin |
| 决策步骤详情 | GET | `/api/decision/admin/logs/:id` | Admin；含 `tripRunId`、`links.tripRunAdminPath` |
| 统计 / 分析 | GET | `/api/decision/admin/stats`、`.../analytics` | Admin |
| Fact vs 推理 | GET | `/api/decision/admin/logs/:id/qa-view` | 可选；非方案列表 |
| **系统方案（智能体回合）** | GET | `/api/agent/admin/runs/:tripRunId` | Admin；看 `observability.decisionTrace` |
| Agent 列表（按行程） | GET | `/api/agent/admin/runs?tripId=` | 无 tripRunId 时兜底 |
| **决策问题列表** | GET | `/api/trips/:tripId/decision-problems` | 行程成员鉴权（Admin 用管理员身份或 god-key 视网关配置） |
| **系统候选 options** | GET | `/api/trips/:tripId/decision-problems/:problemId/options` | 方案卡片数据源 |
| **因果链** | GET | `/api/trips/:tripId/decision-problems/:problemId/causal-trace` | 因果回放 |
| 开放因果决策 | GET | `/api/trips/:tripId/causal-decisions` | 产品因果决策 BFF |
| 知识库因果链（配置） | GET | `/api/admin/execution-risk/knowledge/versions/:versionId/causal-chains` | **不是**某次用户决策运行时因果，勿混用 |

##### 前端字段映射（建议）

| UI 区块 | 优先数据源 |
|---------|------------|
| 步骤时间线 / 解释 / 原因码 | `decision/admin/logs` 的 `step`、`actor`、`explanation`、`reasonCodes` |
| 「同日交通偏紧」 | **`GET /api/decision/admin/decision-problems?sameDayTravelOnly=true`**（不是 logs） |
| 「系统给出的方案」 | 问题：`.../decision-problems/:tripId/:problemId/options`；或 Agent Run `decisionTrace` |
| 「用户选择 / 改稿」 | **不要**用日志 `userChoice`；用 Agent Run 的 `outcome.latestEvent` / `feedback` |
| 「因果链」 | `.../decision-problems/:tripId/:problemId/causal-trace` |
| 跳转 Agent 运行 | 详情 `links.tripRunAdminPath` 或自拼 `/api/agent/admin/runs/{tripRunId}` |

##### 空态处理

| 情况 | UI 建议 |
|------|---------|
| 有 log、无 `tripRunId` | 只展示步骤流水；方案区显示「无关联 Agent Run」 |
| 有 Run、`decisionTrace.options` 为空 | `decisionCompleteness` 常为 `PARTIAL`；可只展示 `finalDecision` |
| 无 `decision-problems` | 因果/候选方案区空态；勿报接口错误为「日志坏了」 |
| 日志上 `systemRecommendation === null` | **正常**（现网未写该列） |

##### 伪代码

```ts
// Tab「决策问题」列表（同日交通偏紧）
async function loadSameDayTravelProblems() {
  return api.get('/api/decision/admin/decision-problems', {
    params: { sameDayTravelOnly: true, scanTrips: 10, page: 1, limit: 20 },
  });
}

// 已知 tripId 时（更快）
async function loadTripProblems(tripId: string) {
  return api.get('/api/decision/admin/decision-problems', {
    params: { tripId, sameDayTravelOnly: true },
  });
}

// 详情：方案 + 因果（用列表项 links，或自拼）
async function loadProblemDetail(tripId: string, problemId: string) {
  const [detail, options, causalTrace] = await Promise.all([
    api.get(`/api/decision/admin/decision-problems/${tripId}/${problemId}`),
    api.get(`/api/decision/admin/decision-problems/${tripId}/${problemId}/options`),
    api.get(`/api/decision/admin/decision-problems/${tripId}/${problemId}/causal-trace`),
  ]);
  return { detail, options, causalTrace };
}
```

##### 和 Agent 运行页的分工

| 页面 | 主接口 | 职责 |
|------|--------|------|
| `/admin/decision` | `decision/admin/logs*` + 联查上表 | 决策步骤流水；详情联查方案/因果 |
| `/admin/agent`（或 Agent Runs） | `agent/admin/runs*` | 整轮智能体观测、Outcome、Replay |

---

#### 原型页面：决策分析仪表盘

```
┌─────────────────────────────────────────────────────────────────┐
│  决策分析                                                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ 总决策数     │  │ 现实驱动率   │  │ 平均置信度   │              │
│  │   12,456    │  │    78.5%    │  │    0.82     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│  决策来源分布                      Persona 触发分布              │
│  ┌────────────────────┐          ┌────────────────────┐        │
│  │ ██████████ API 65% │          │ ████████ Safety 40%│        │
│  │ ████ Cache 20%     │          │ ██████ Cost 30%    │        │
│  │ ██ Heuristic 15%   │          │ ████ Experience 20%│        │
│  └────────────────────┘          │ ██ Comfort 10%     │        │
│                                  └────────────────────┘        │
├─────────────────────────────────────────────────────────────────┤
│  HEURISTIC 热点（需关注）                                        │
│  ─────────────────────────────────────────────────────────────  │
│  1. 冰岛高地 F-road 通行判断 - 使用启发式 42 次                   │
│  2. 格陵兰天气预测 - 缺少实时数据 28 次                           │
└─────────────────────────────────────────────────────────────────┘
```

**接口列表**（Admin 前端 `/admin/decision` 实际调用）：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/decision/admin/logs` | 决策日志列表 |
| GET | `/api/decision/admin/logs/:id` | 决策日志详情 |
| GET | `/api/decision/admin/stats` | 决策统计 |
| GET | `/api/decision/admin/analytics` | 决策分析（含热点） |
| POST | `/api/decision/admin/logs/export` | 导出 |

服务层另有 `/api/decision-stats/overview|by-type|trends` 等，当前页面未用。

**示例：获取决策统计**

```bash
GET /api/decision/admin/stats?startDate=2026-01-01&countryCode=IS

Response:
{
  "data": {
    "distribution": {
      "total": 12456,
      "bySource": {
        "REALTIME_API": 8100,
        "CACHED": 2491,
        "HEURISTIC": 1865
      },
      "bySourcePercentage": {
        "REALTIME_API": 0.65,
        "CACHED": 0.20,
        "HEURISTIC": 0.15
      },
      "realityDrivenRatio": 0.785
    },
    "personaStats": {
      "SAFETY_GUARDIAN": 4982,
      "COST_OPTIMIZER": 3737,
      "EXPERIENCE_SEEKER": 2491,
      "COMFORT_KEEPER": 1246
    }
  }
}
```

**示例：获取分析数据（含热点）**

```bash
GET /api/decision/admin/analytics?startDate=2026-01-01

Response:
{
  "data": {
    "stats": {...},
    "heuristicHotspots": [
      {
        "location": "Iceland F-roads",
        "count": 42,
        "reason": "缺少实时路况 API"
      }
    ],
    "personaStats": {...},
    "overallScore": 0.82
  }
}
```

---

### 2.3 决策草案管理 `/api/decision-draft` — **已废弃**

> **Status: DEPRECATED（2026-08）**  
> - Admin 前端 `/admin/decision-draft` 读写 `decision_drafts`（与已废弃的 Chain-of-Work **同一数据池**）。  
> - 库内共约 43 条，**最晚 2026-05-08**；之后无产品写路径产出。iOS / mobile **不调用**。  
> - `GET /decision-draft/stats` 为硬编码桩（恒返回 0），不能当真实监控。  
> - 前端文档路径常带 `/admin/...`，后端多数在无 `admin` 前缀路由（如 `POST /generate`、`PUT /:id/step/...`）；勿新对接。  
> - **观测智能体决策**请用 `GET /api/agent/admin/runs`（及 feedback / replay / metrics）。  
> - HTTP 暂保留兼容，OpenAPI 已标 `deprecated`；模块内部生成器（行程创建异步等）保留，勿整包删除。

**接口清单（Admin 前端曾用 / 可调，均为废弃）**：

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/decision-draft/stats` | 统计（桩，恒 0） |
| POST | `/api/decision-draft/generate` | 生成草案 |
| GET | `/api/decision-draft/:draftId` | 详情 |
| PUT | `/api/decision-draft/:draftId/step/:stepId` | 编辑步骤 |
| PUT | `/api/decision-draft/:draftId/steps/batch` | 批量编辑 |
| PUT | `/api/decision-draft/:draftId/steps/reorder` | 重排 |
| POST | `/api/decision-draft/:draftId/regenerate` | 重生成 |
| POST | `/api/decision-draft/:draftId/version` | 存版本 |
| POST | `/api/decision-draft/:draftId/version/:vid/rollback` | 回滚 |
| POST | `/api/decision-draft/:draftId/version/:vid/fork` | Fork |
| GET | `/api/decision-draft/:draftId/explanation` | 解释 |
| GET | `/api/decision-draft/:draftId/versions` | 版本列表 |
| GET | `/api/decision-draft/:draftId/debug-info` | 调试 |
| POST | `/api/decision-draft/:draftId/preview-impact` | 影响预览 |
| GET | `/api/decision-draft/:draftId/replay` | 回放 |
| GET | `/api/decision-draft/admin/list` | 列表（页面未用） |
| GET | `/api/decision-draft/admin/quality-stats` | 质量统计（未用） |
| GET | `/api/decision-draft/admin/user-styles` | 用户风格（未用） |
| GET | `/api/decision-draft/admin/anomalies` | 异常（未用） |

---

### 2.4 规划工作台管理 `/api/planning-workbench/admin` — **已废弃**

> **Status: DEPRECATED（2026-08）**  
> - Admin 前端 `/admin/planning-workbench` 所接 5 个只读接口均读 `planning_plans`（`PlanningPlan`）；当前库内 **0 行**，且代码侧无稳定 `create/upsert` 写路径（工作台态多在 StateStore）。  
> - 「会话」与「方案」实质同一实体（`sessionId` ≡ `PlanningPlan.id`）。  
> - **不要**用本模块观测真实规划/智能体活动；改用 `GET /api/agent/admin/runs`、行程 Admin。  
> - HTTP 暂保留兼容，OpenAPI 已标 `deprecated`；请勿新对接。

**鉴权**：`AdminStrictAuthGuard` — 须 `Authorization: Bearer <accessToken>`（`POST /api/admin/auth/login` 获取，角色 ADMIN/OPERATOR），或配置 `ADMIN_GOD_API_KEY` 时使用 `x-admin-god-key` / `Bearer <god-key>`。

**接口列表（均为废弃）**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/planning-workbench/admin/sessions` | 会话列表 |
| GET | `/api/planning-workbench/admin/sessions/:id` | 会话详情 |
| GET | `/api/planning-workbench/admin/sessions/stats` | 会话统计 |
| GET | `/api/planning-workbench/admin/plans` | 计划列表 |
| GET | `/api/planning-workbench/admin/plans/:id` | 计划详情 |

---

### 2.5 地点管理 `/api/places/admin`

#### 原型页面：POI 管理

```
┌─────────────────────────────────────────────────────────────────┐
│  地点管理                                    [新增] [批量导入]   │
├─────────────────────────────────────────────────────────────────┤
│  筛选: [类型 ▼] [国家 ▼] [城市 ▼]  [搜索...]                    │
├─────────────────────────────────────────────────────────────────┤
│  ID      名称           类型      城市      坐标        操作     │
│  ─────────────────────────────────────────────────────────────  │
│  1       黄金瀑布       景点      冰岛      64.3,-20.1  [编辑]   │
│  2       蓝湖温泉       温泉      冰岛      63.9,-22.4  [编辑]   │
│  3       雷克雅未克机场  机场      冰岛      64.1,-21.9  [编辑]   │
└─────────────────────────────────────────────────────────────────┘
```

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/places/admin` | 地点列表 |
| GET | `/api/places/admin/:id` | 地点详情 |
| POST | `/api/places/admin` | 创建地点 |
| PUT | `/api/places/admin/:id` | 更新地点 |
| DELETE | `/api/places/admin/:id` | 删除地点 |
| POST | `/api/places/admin/batch` | 批量获取 |

---

### 2.6 国家知识库 `/api/admin/countries`

**鉴权**：`AdminStrictAuthGuard` — `Authorization: Bearer <accessToken>`（ADMIN/OPERATOR）或 `x-admin-god-key` / `Bearer <ADMIN_GOD_API_KEY>`。

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/countries/profiles` | 档案列表（`page`, `limit`, `q`, `schemaVersion`） |
| GET | `/api/admin/countries/profiles/:isoCode` | 档案详情（同公开 profile，含 V2 字段） |
| POST | `/api/admin/countries/profiles` | 创建 V2 档案（Zod 校验） |
| PUT | `/api/admin/countries/profiles/:isoCode` | 全量更新 |
| PATCH | `/api/admin/countries/profiles/:isoCode` | 部分更新（JSON 浅合并，升为 V2） |
| DELETE | `/api/admin/countries/profiles/:isoCode` | 硬删除 |
| POST | `/api/admin/countries/profiles/validate` | 仅校验 JSON，不落库 |

兼容旧路径：`/api/countries/admin/...` 与上表等价。

请求体与 `data/country-profiles/{ISO}.v2.json` 同构（`schemaVersion: 2` 必填）。

完整接口文档：[src/countries/COUNTRY_PROFILE_ADMIN_API.md](../countries/COUNTRY_PROFILE_ADMIN_API.md)

---

### 2.6b 执行风险知识库 `/api/admin/execution-risk/knowledge`

**鉴权**：`AdminStrictAuthGuard`（同国家知识库）。

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/execution-risk/knowledge/versions` | 版本列表 |
| GET | `/api/admin/execution-risk/knowledge/versions/active` | 当前激活版本 |
| GET | `/api/admin/execution-risk/knowledge/versions/:versionId` | 版本详情 |
| POST | `/api/admin/execution-risk/knowledge/versions/import` | 从 Package 导入 DRAFT |
| POST | `/api/admin/execution-risk/knowledge/versions/:versionId/validate` | 结构校验（可选 `runHarness`）→ VALIDATED |
| POST | `/api/admin/execution-risk/knowledge/versions/:versionId/activate` | 激活（默认 smoke harness；可 `skipHarnessGate`） |
| GET/POST/PUT/PATCH/DELETE | `.../versions/:versionId/definitions[/:knowledgeCode]` | 风险定义（写仅 DRAFT） |
| GET/POST/PUT/PATCH/DELETE | `.../versions/:versionId/severity-rules[/:ruleId]` | 阈值规则（写仅 DRAFT） |
| GET/POST/PUT/PATCH/DELETE | `.../versions/:versionId/causal-chains[/:chainId]` | 因果链（写仅 DRAFT） |
| GET/POST/PUT/PATCH/DELETE | `.../versions/:versionId/actions[/:actionCode]` | 干预动作（写仅 DRAFT） |
| GET | `/api/admin/execution-risk/knowledge/constraint-bindings` | 风险↔约束映射列表 |
| GET | `.../constraint-bindings/templates` | 约束模板目录（下拉真源 CODE_REGISTRY） |
| GET | `.../constraint-bindings/templates/:templateId` | 模板详情 |
| GET | `.../constraint-bindings/resolve` | 按风险码+门禁解析约束（无 DB 行时回退默认种子） |
| POST | `.../constraint-bindings/seed-defaults` | 导入默认映射种子 |

运行时（P1.3）：`ActiveRisk.constraintBinding` → Feasibility issues / 约束 CONFLICTED / Advisory 门禁 / Apply `validation.constraintTemplateIds`。

完整接口文档：[src/trips/execution-risk-center/ADMIN_RISK_KNOWLEDGE_API.md](../trips/execution-risk-center/ADMIN_RISK_KNOWLEDGE_API.md)

---

### 2.6c Knowledge Control Center `/api/admin/knowledge`（Phase 1）

**鉴权**：同国家知识库。产品设计见 [knowledge-control-center-admin-api.md](../../internal-docs/product/knowledge-control-center-admin-api.md)。

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/knowledge/health` | 健康度（Phase 1 子集） |
| GET | `/api/admin/knowledge/entities` | 实体列表 |
| GET | `/api/admin/knowledge/entities/create-types` | **新建**可选类型（中文 + 联动能力） |
| POST | `/api/admin/knowledge/entities/sync` | **同步** CPRE / Country Pack / place_db / ontology → DB |
| GET | `/api/admin/knowledge/entities/sync` | 最近一次同步结果（进程内） |
| GET | `/api/admin/knowledge/entities/sync/runs` | 同步运行历史（DB） |
| POST | `/api/admin/knowledge/entities` | **新建** Identity 规范实体（≠ resolve；`origin=ADMIN` 持久化） |
| PATCH | `/api/admin/knowledge/entities/:id` | **更新** Identity（部分字段；不可改 ID；持久化） |
| GET | `/api/admin/knowledge/entities/unresolved` | 未解析 / 待治理 subject |
| GET | `/api/admin/knowledge/entities/:canonicalEntityId` | 实体详情 |
| POST | `/api/admin/knowledge/entities/resolve` | Identity 解析调试 |
| POST | `/api/admin/knowledge/entities/check-subjects` | 批量校验 subjectId |

#### 新建实体类型

1. `GET /api/admin/knowledge/entities/create-types` — 可选类型（含 `cascade.country` / `cascade.poi` / `linkableTypes`）
2. 前端按 cascade 自建表单；`POST /entities` 可传 `linkedPoiId` / `linkedEntityIds` / `country`

#### Identity / 本体持久化与同步

- **表**：`knowledge_entity_identities`（Identity）、`knowledge_ontology_catalog_snapshots`（本体投影快照）、`knowledge_identity_sync_runs`（同步审计）
- **SSOT**：DB 可用时以 DB 为准（boot 加载后 overlay 内存种子）；DB 不可用则内存 fallback（与 DecisionCase 同模式）
- **Admin 写**：`POST/PATCH /entities` → `origin=ADMIN`，异步 upsert；**sync 不覆盖 ADMIN 行**
- **启动**：Registry flush 非 ADMIN 种子；Sync 服务自动跑 `country_pack` + `ontology_snapshot`
- **迁移**：`prisma/migrations/20260814_knowledge_entity_identity.sql`

#### POST `/api/admin/knowledge/entities/sync`

```json
{ "sources": ["cpre", "country_pack", "place_db", "ontology_snapshot"] }
```

省略 `sources` = 全部。返回 `runId` / `status` / `stats`（各源 created/updated/skippedAdmin）。

#### POST `/api/admin/knowledge/entities` — 显式新建 Identity

**鉴权**：`AdminStrictAuthGuard`（同其它 Knowledge Admin）。  
**作用**：往 Identity 目录写入一条规范实体（不是 ontology types 目录本身）；DB 可用时持久化，`origin=ADMIN`。  
**与 resolve 区分**：`POST .../resolve` 是解析/对齐已有 subject；本接口是**显式新建**。

**Request body**

| 字段 | 中文名 | 必填 | 说明 |
|------|--------|------|------|
| `name` | 展示名 | 条件 | 选 `linkedPoiId` 时可省略（自动回填） |
| `type` | 本体类型码 | 是 | 须与 `GET /ontology/types` 的 `typeId` 一致（如 `Place`、`RouteSegment`） |
| `canonicalEntityId` | 规范实体ID | 否 | 不传则后端按类型规则生成；选 POI 时默认用 poiId |
| `domain` | 领域 | 否 | 如 `Place` / `Mobility` 或 `PLACE` / `MOBILITY` |
| `country` | 国家码 | 否 | 如 `JP` / `IS`；选 POI 时可回填 |
| `linkedPoiId` | 关联POI | 否 | CPRE 如 `is.reynisfjara`；已存在则 CONFLICT |
| `linkedEntityIds` | 关联实体列表 | 否 | 其它已有规范 ID |
| `aliases` | 别名列表 | 否 | `string[]` |
| `description` | 描述 | 否 | 文本说明 |
| `status` | 状态 | 否 | `enabled` / `draft`（内部映射 ACTIVE / PENDING） |
| `properties` | 扩展属性 | 否 | 任意对象 |

成功（HTTP **200**，信封 `success: true`；亦可按客户端约定视作创建成功）：

```json
{
  "success": true,
  "data": {
    "canonicalEntityId": "place:tokyo_station",
    "id": "place:tokyo_station",
    "subjectId": "place:tokyo_station",
    "name": "Tokyo Station",
    "type": "Place",
    "domain": "PLACE",
    "status": "enabled",
    "aliases": ["東京駅"],
    "createdAt": "2026-08-14T00:00:00.000Z"
  }
}
```

失败（`success: false`）：

| `error.code` | 场景 |
|--------------|------|
| `VALIDATION_ERROR` | 缺 name/type，或 type 不在 ontology 投影 |
| `CONFLICT` | 显式 `canonicalEntityId` 已存在 |

创建成功后可立刻被 `GET /entities`、`GET /entities/:id` 查到。

#### PATCH `/api/admin/knowledge/entities/:canonicalEntityId` — 更新 Identity

**作用**：部分更新已有规范实体（**不可改** `canonicalEntityId`）。

| 字段 | 中文名 | 必填 | 说明 |
|------|--------|------|------|
| `name` | 展示名 | 否 | |
| `type` | 本体类型码 | 否 | 须在 ontology types 中 |
| `domain` | 领域 | 否 | |
| `country` | 国家码 | 否 | |
| `aliases` | 别名列表 | 否 | **整表替换** |
| `description` | 描述 | 否 | |
| `status` | 状态 | 否 | enabled / draft |
| `properties` | 扩展属性 | 否 | **浅合并** |
| `linkedPoiId` | 关联POI | 否 | |
| `linkedEntityIds` | 关联实体列表 | 否 | **替换** identity_link |

成功：`success: true` + 与创建相同的 `data` 形（含 `updatedAt`）。  
失败：`NOT_FOUND`（ID 不存在）· `VALIDATION_ERROR`（空 body / 非法 type）· `CONFLICT`（关联 POI 被占用）。

实现：`src/knowledge-system/`。World State Admin：**已实现**（见 2.6c 续）。Relations 见后续 Phase。

---

### 2.6c-2 World State Inspector `/api/admin/knowledge/world-state`

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/knowledge/world-state/monitoring` | 监控大盘：sources / KPIs / alerts / trends |
| GET | `/api/admin/knowledge/world-state/sources` | 数据源健康（road.is / weather.is） |
| GET | `/api/admin/knowledge/world-state/alerts` | 告警列表（type / severity / status） |
| GET | `/api/admin/knowledge/world-state/snapshots` | Snapshot 列表（factCount / staleFactCount / status / recentChangeCategories） |
| GET | `/api/admin/knowledge/world-state/snapshots/:snapshotId` | 详情 + freshness |
| POST | `/api/admin/knowledge/world-state/snapshots/generate` | **生成**快照（≠ register；`tripId` + optional `mode`） |
| POST | `/api/admin/knowledge/world-state/snapshots/register` | 注册已有 CanonicalSnapshot 到治理台 |
| GET | `/api/admin/knowledge/world-state/diff` | 结构化 Diff：`summary` + `changes[]`（含 worsened/improved） |
| GET | `/api/admin/knowledge/world-state/facts` | WorldFact 列表（见下方筛选契约） |
| GET | `/api/admin/knowledge/world-state/facts/:factId` | Fact 详情 + `provenance` |
| GET | `/api/admin/knowledge/world-state/stale-facts` | 过期事实（不得 HARD BLOCK） |

**Snapshots 列表字段**：`factCount` · `staleFactCount` · `status`（HEALTHY/DEGRADED/STALE/INCOMPLETE）· `recentChangeCategories`（road/weather/poi/activity）· `weatherCount`/`poiCount`。Query：`tripId` · `status` · `page` · `pageSize`。

**Facts 筛选契约**（query）：`country` · `factType` · `entityType` · `entityId` · `predicate` · `provider`/`source` · `freshness` · `confidenceMin`/`confidenceMax` · `timeFrom`/`timeTo` · `tripId` · `snapshotId` · `page`/`pageSize`。详情含 `provenance.jobId` / `dataset` / `license`（有则返回）。

**Diff 契约**：`summary.{added,updated,removed,worsened,improved,total}` + `changes[]`（`object` · `oldValue` · `newValue` · `impactLevel` · `source`）。调试字段：`engine` / `engineSummary` / `engineChanges`。

**Generate vs Register**：`POST .../snapshots/generate` 按 `tripId` 克隆最新或种子空壳；`POST .../snapshots/register` 接收完整 Canonical JSON。二者勿混用。

Demo Diff：`fromSnapshotId=ws_demo_phase2_open` → `toSnapshotId=ws_demo_phase2_closed`（F208 OPEN→CLOSED → kind `WORSENED`）。

运行时工具：`assertDecisionConsumerUsesSnapshot`、`filterFactsForHardBlock`（`src/knowledge-system/world-state/`）。

---

### 2.6c-3 Relations `/api/admin/knowledge/relations`（Phase 3）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/knowledge/relations` | 投影关系列表（内存缓存，DB SSOT） |
| GET | `/api/admin/knowledge/relations/projections` | 原始类型 → V1 词表 |
| GET | `/api/admin/knowledge/relations/:relationId` | 关系详情 |
| POST | `/api/admin/knowledge/relations` | **新建** manual 关系（持久化，reproject 保留） |
| PATCH | `/api/admin/knowledge/relations/:relationId` | 更新 manual 关系 |
| DELETE | `/api/admin/knowledge/relations/:relationId` | 删除（投影边下次 reproject 会回来） |
| POST | `/api/admin/knowledge/relations/reproject` | 重新投影 adapters 并 upsert `knowledge_relations`（保留 created_at） |
| GET | `/api/admin/knowledge/vocabulary/relations` | 十二词 + count |
| GET | `/api/admin/knowledge/entities/:id/relations` | 实体关系 Tab |

Adapters：Golden Set → `CO_VISIT`/`SOFT_ALTERNATIVE`；POI alt → `ALTERNATIVE_TO`；Causal JSON → `INCREASES_RISK_OF`/`AFFECTS`；Spatial → `CONNECTED_TO`。  
投影关系写入 `knowledge_relations`（`source=manual` 在 reproject 时保留）。图谱仍按内存注册表 BFS 拼装，**不是** Neo4j。

---

### 2.6c-3b Knowledge Graph 视图 `/api/admin/knowledge/graph`（产品四 Tab）

> 基于 `knowledge_relations` **投影拼装** nodes/edges，**不是** Neo4j。前端也可继续用 `/relations` 列表兜底。

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/knowledge/graph/subgraph` | 图谱浏览（q/entityType/relationType/country/focusEntityId/limit） |
| POST | `/api/admin/knowledge/graph/path-query` | 路径查询（shortest / semantic / constraint） |
| POST | `/api/admin/knowledge/graph/impact-analysis` | 影响分析（direct/indirect/risk/alternative） |

`subgraph` 响应：`nodes[]` · `edges[]` · `stats`。  
`path-query` 响应：`candidates[]` · `analytics` · `inventory`。  
`impact-analysis` 响应：`summary` · `graph` · `entities[]` · `charts`。

---

### 2.6c-3c Ontology 目录 `/api/admin/knowledge/ontology`（产品四 Tab）

> 类型/属性来自 **travel-ontology contracts 投影**（`src/travel-ontology/catalog/`，枚举引用 contracts 的 `*_VALUES` const），再经 knowledge-system 叠加 Identity 扩展类型与中文 overlay。  
> **不是**前端本地 stub；也**不是**在 Admin 层手写平行枚举列表。  
> 类型对象含 `source`: `travel-ontology-contract` | `identity-extension`。

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/knowledge/ontology/overview` | 实体视图：领域卡 / 统计 / 最近更新 |
| GET | `/api/admin/knowledge/ontology/types` | 类型词汇列表（domain/kind/q） |
| GET | `/api/admin/knowledge/ontology/types/:id` | 类型详情 + attributes + relatedPredicates |
| GET | `/api/admin/knowledge/ontology/attributes` | 属性管理列表（读 `knowledge_ontology_attributes`；`dataSource=db|projection`） |
| GET | `/api/admin/knowledge/ontology/attributes/:id` | 属性详情（如 `RouteSegment.currentRoadStatus`） |
| POST | `/api/admin/knowledge/ontology/sync` | 投影灌表并刷新内存目录 |
| POST | `/api/admin/knowledge/ontology/export` | 本体导出（`scope`: full/types/attributes） |
| GET | `/api/admin/knowledge/ontology/export/history` | 导出历史 |
| GET | `/api/admin/knowledge/ontology/export/:exportId` | 某次导出 payload |
| GET | `/api/admin/knowledge/ontology/validate` | 校验摘要（orphan attr / enum / Identity 覆盖） |

#### GET `/ontology/overview` 响应字段

| 字段 | 中文名 | 说明 |
|------|--------|------|
| `catalogVersion` | 目录版本 | 如 `tripnara.travel_ontology_catalog@v1` |
| `domains[]` | 领域卡片列表 | 各领域统计 |
| `domains[].domain` | 领域码 | TRAVELER / PLACE / MOBILITY … |
| `domains[].displayName` | 领域中文名 | 旅行者 / 地点 / 移动 … |
| `domains[].typeCount` | 类型数 | |
| `domains[].attributeCount` | 属性数 | |
| `domains[].predicateCount` | 谓词数 | |
| `domains[].entityInstanceCount` | Identity 实例数 | 来自 Entity Registry |
| `stats` | 汇总统计 | typeCount / attributeCount / registeredEntityCount … |
| `recentUpdates[]` | 最近更新 | `name` 为中文展示名 |

#### GET `/ontology/types` · `/types/:id`

**Query**

| 字段 | 中文名 | 必填 | 说明 |
|------|--------|------|------|
| `domain` | 领域 | 否 | 过滤 |
| `kind` | 类型种类 | 否 | ENTITY / VALUE_OBJECT / FACT / ASSESSMENT / ENUM |
| `q` | 搜索词 | 否 | 匹配 typeId / name / displayName / description |
| `page` / `pageSize` | 分页 | 否 | |

**类型对象字段**

| 字段 | 中文名 | 说明 |
|------|--------|------|
| `typeId` | 类型码（英文） | API/创建实体用，如 `Place`；**UI 勿当标题** |
| `name` / `displayName` / `label` | 中文名 | **UI 主展示**，如「地点」「路线区段」 |
| `nameEn` | 英文名 | 同 typeId，调试用 |
| `kind` | 种类 | ENTITY / VALUE_OBJECT / FACT … |
| `kindDisplayName` | 种类中文名 | 实体 / 值对象 / 事实 / 评估 |
| `domain` | 领域码 | PLACE / MOBILITY … |
| `domainDisplayName` | 领域中文名 | 地点 / 移动 … |
| `description` | 描述 | |
| `schemaRef` | 契约引用 | travel-ontology / identity |
| `source` | 来源 | `travel-ontology-contract` \| `identity-extension` |
| `sourceDisplayName` | 来源中文名 | 旅行本体契约 / Identity 扩展 |
| `attributeIds` | 属性ID列表 | |
| `attributeCount` | 属性数量 | |
| `requiredAttributeCount` | 必填属性数 | |
| `enumAttributeCount` | 枚举属性数 | |
| `predicateCount` | 相关谓词数 | |
| `instanceCount` | Identity 实例数 | |
| `status` / `statusDisplayName` | 状态 | ACTIVE→启用 |
| `updatedAt` | 更新时间 | |
| `attributes[]` | 属性明细 | **列表默认内嵌**（`includeAttributes=false` 可关） |
| `relatedPredicates[]` | 相关谓词 | 列表默认内嵌 |

`overview` 另含：`domains[].types[]`（领域下类型摘要）+ 顶层 `types[]`。

#### GET `/ontology/attributes` · `/attributes/:id`

**数据落表**：`knowledge_ontology_attributes`（boot / `POST /ontology/sync` / Identity `ontology_snapshot` 从契约投影灌入）。  
列表响应含 `dataSource`：`db`（已读表）| `projection`（DB 不可用回退）。`origin=ADMIN` 行不被投影覆盖。

**Identity「填写属性」同源**：新建/编辑实体必须调  
`GET /ontology/attributes?ownerTypeId={type}&limit=200`（可选 `domain`，大小写不敏感）。  
默认 `status=enabled`，与属性管理 Tab 默认一致。`pageSize`/`limit` 最大 500；有 `ownerTypeId` 时默认 200。  
**禁止**另开 schema，也**不要**把 `GET /types/:id` 的 `attributes` 当独立表单源（投影已对齐，但仍以本列表接口为准）。

**属性对象字段**

| 字段 | 中文名 | 说明 |
|------|--------|------|
| `attributeId` | 属性ID / 字段码 | 如 `Place.openingHours`；亦可作 properties key |
| `fieldKey` / `nameEn` | 英文字段码 | 稳定 fieldKey；提交 properties 可用 |
| `name` / `displayName` / `label` | 中文名 | **UI 必显** |
| `ownerTypeId` | 所属类型ID | 等于筛选 type |
| `applicableEntityTypes` | 适用类型 | 至少含 `ownerTypeId` |
| `domain` | 领域码 | |
| `domainDisplayName` | 领域中文名 | |
| `ownerTypeDisplayName` | 所属类型中文名 | |
| `valueKind` | 值类型 | string / number / boolean / enum / object / array / datetime |
| `valueKindDisplayName` | 值类型中文名 | 字符串 / 枚举 … |
| `valueSchema` / `valueSchemaName` | 值结构提示 | 表单控件辅助 |
| `exampleValue` | 示例值 | |
| `enumValues` | 枚举选项 | `valueKind=enum` 时；每项含 `value` + `displayName` |
| `enumCount` | 枚举项数量 | |
| `required` / `requiredLabel` | 是否必填 | 必填 / 可选 |
| `description` | 描述 | |
| `status` / `statusDisplayName` | 状态 | **API：`enabled`/`draft`/`deprecated`**（默认筛 enabled） |
| `updatedAt` | 更新时间 | |

`POST/PATCH /entities` 的 `properties`：`{ [attributeId|fieldKey]: value }`，按 `valueKind` 校验；未知 key / 类型不符 / 缺非信封必填 → `VALIDATION_ERROR`。

**枚举值结构示例**（`RouteSegment.currentRoadStatus`）：

```json
"enumValues": [
  { "value": "OPEN", "displayName": "开放" },
  { "value": "OPEN_WITH_CAUTION", "displayName": "谨慎通行" },
  { "value": "CLOSED", "displayName": "封闭" },
  { "value": "UNKNOWN", "displayName": "未知" }
]
```

#### POST `/ontology/export` · history · validate

| 字段 / 项 | 中文名 | 说明 |
|-----------|--------|------|
| `scope` | 导出范围 | `full` / `types` / `attributes` |
| `note` | 备注 | 可选 |
| `exportId` | 导出ID | |
| `validate.status` | 校验状态 | `PASS` / `PASS_WITH_WARNINGS` / `FAIL` |

`overview.domains[]`：`domain` · `typeCount` · `attributeCount` · `predicateCount` · `entityInstanceCount`。  
`validate.status`：`PASS` / `PASS_WITH_WARNINGS` / `FAIL`。

---

### 2.6c-4 Traveler Context `/api/admin/knowledge/traveler-context`（Phase 4）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/knowledge/traveler-context` | ETC consume coverage（env） |
| GET | `/api/admin/knowledge/traveler-context/:tripId` | ETC Inspector + sourceBreakdown |
| GET | `/api/admin/knowledge/traveler-context/:tripId/diff` | L1 Memory → L2 Override → Effective |

Demo：`tripId=demo-ks-phase4`（L1 SLOW → L2 RELAXED）。Env：`EFFECTIVE_TRAVELER_CONTEXT_CONSUME=off|shadow|active`。

运行时：`assertGateReadsEffectiveTravelerContext`（`src/knowledge-system/traveler-context/`）。

---

### 2.6c-5 Decision Cases `/api/admin/knowledge/decision-cases`（Phase 5）

> 知识库 DecisionCase（Episode 投影），**不是** `decision-runtime/decision-cases` 队列问题。

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/knowledge/decision-cases` | 列表（country/decisionType/situationTags/riskType/outcome/userChoice/regret/tripId） |
| GET | `/api/admin/knowledge/decision-cases/:caseId` | Situation → Outcome / Regret |
| GET | `/api/admin/knowledge/decision-cases/:caseId/similar` | SQL facet 相似（无 embedding） |
| POST | `/api/admin/knowledge/decision-cases/ingest` | 摄入 DecisionEpisodeV1 |
| POST | `/api/admin/knowledge/decision-cases/reproject` | 从 TravelMemoryRuntime 热 Map 重投影 |

Demo：`tripId=demo-ks-phase5`（F208 OPEN accept / CLOSED override regret）。

持久化：表 `knowledge_decision_cases`（`prisma/migrations/20260813_knowledge_decision_cases.sql`）。DB 不可用时进程内回退。

---

### 2.6c-6 Semantic + Overview `/api/admin/knowledge`（Phase 6）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/knowledge/health` | 健康度指标（非知识总量仪表盘） |
| GET | `/api/admin/knowledge/overview` | health 结构化别名（metrics + redLines） |
| GET | `/api/admin/knowledge/documents` | RAG 语料轻链（`knowledge_files` / demo） |
| GET | `/api/admin/knowledge/documents/:documentId` | 文档详情 |
| GET | `/api/admin/knowledge/retrieval-traces` | 检索轨迹（解释层 ONLY） |

红线：`hardBlockEligible` 恒为 `false`；`assertVectorMustNotHardBlock`。完整检索仍用 `POST /api/rag/chunks/retrieve`。

运行时收敛（骨架钉主链）：

| Env | 作用 |
|-----|------|
| `KNOWLEDGE_RUNTIME_SSOT_ENFORCE=off\|shadow\|active` | prepareTick / ConstraintGateway ingress；默认 off，shadow 记审计，active 违规 throw |
| `EFFECTIVE_TRAVELER_CONTEXT_CONSUME=off\|shadow\|active` | ETC；active 时 Gate ingress 要求 ETC |

挂接点：`prepareTick` · `ConstraintEvaluationGateway` · Ontology `selectFactsForOntologyHardBlock`（仅排除 stale 道路/天气）。

---

### 2.7 准备度配置 `/api/readiness/admin`

#### 原型页面：Readiness Pack 管理

```
┌─────────────────────────────────────────────────────────────────┐
│  准备度配置                                          [新增]      │
├─────────────────────────────────────────────────────────────────┤
│  Pack 列表                                                      │
│  ─────────────────────────────────────────────────────────────  │
│  ID      名称           目的地    检查项数   创建时间    操作     │
│  1       冰岛冬季准备   IS        12        2026-01-01  [编辑]   │
│  2       挪威峡湾准备   NO        8         2026-01-15  [编辑]   │
└─────────────────────────────────────────────────────────────────┘
```

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/readiness/admin/packs` | Pack 列表 |
| GET | `/api/readiness/admin/packs/:id` | Pack 详情 |
| POST | `/api/readiness/admin/packs` | 创建 Pack |
| PUT | `/api/readiness/admin/packs/:id` | 更新 Pack |
| DELETE | `/api/readiness/admin/packs/:id` | 删除 Pack |

---

### 2.7 Agent 监控 `/api/agent/admin`

#### 原型页面：Agent 运行监控

```
┌─────────────────────────────────────────────────────────────────┐
│  Agent 监控                                                     │
├─────────────────────────────────────────────────────────────────┤
│  运行统计                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ 总运行数     │  │ 成功率      │  │ 平均耗时     │              │
│  │   5,678     │  │   96.5%     │  │   2.3s      │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│  最近运行                                                       │
│  ─────────────────────────────────────────────────────────────  │
│  ID          类型          状态      耗时      时间              │
│  run-001     route_plan    success   1.8s      10:30:05        │
│  run-002     chat          success   0.5s      10:29:58        │
│  run-003     route_plan    failed    -         10:29:45        │
└─────────────────────────────────────────────────────────────────┘
```

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/agent/admin/runs/stats` | 运行统计 |
| GET | `/api/agent/admin/performance` | 性能指标 |
| GET | `/api/agent/admin/evaluation/failure-patterns` | **① Outcome→Evaluation 失败模式聚合** |
| GET | `/api/agent/admin/metrics/policy` | **③ Agent/Tool/Memory Policy Metrics** |
| GET | `/api/agent/admin/runs` | 运行列表 |
| GET | `/api/agent/admin/runs/compare` | **② 对比两个已有 Run** |
| GET | `/api/agent/admin/runs/:id` | 运行详情 |
| POST | `/api/agent/admin/runs/:id/feedback` | 写入用户反馈 / Outcome |
| POST | `/api/agent/admin/runs/:id/benchmark` | 写入 Golden Set / Benchmark |
| POST | `/api/agent/admin/runs/:id/replay` | **② Decision Replay 重跑+对比** |
| GET | `/api/agent/admin/attempts` | 尝试列表 |
| GET | `/api/agent/admin/attempts/:id` | 尝试详情 |
| POST | `/api/agent/admin/runs/:id/cancel` | 取消运行 |

**Attempt 列表/详情 enrichment**：除原有 outline / questions / artifacts 外，另返回：

- `trip` / `user`（展示名、目的地）
- 更完整的 `run`（`currentAgent`、`entryPoint`、`requestId`、`errorMessage` 等）
- `skillsInvoked`（= `nextActions`）、`artifactsSummary`、`resultPreview` / `planOutlinePreview`
- `durationSeconds` / `latencyMs` / `userAction`
- 详情另含 `response`、`conversationTrail`、`siblingAttemptCount`、可选 `memorySnapshot`
- 列表支持筛选：`tripId`、`userId`、`tripRunId`、`status`

**说明**：多数 `agent_chat` / 规划侧运行会写 `TripRun.metadata`（`latency_ms`、`entry_point`、`error` 等），但**不一定**创建 `TripAttempt`（库内约仅少数 run 有 attempt）。列表/详情已把 metadata 关键字段提升到顶层，并附带 `trip` / `user` 展示信息。

**输入上下文 / 记忆（详情）**：新产生的 run 会在 `metadata` 写入 `input_context`（`conversation_context` 摘要）与 `memory_summary` / `memory_snapshot_id`。详情接口额外返回：

- `inputContext`：当时携带的对话上下文摘要
- `memorySummary`：记忆装载层摘要（L0–L4 等）
- `memorySnapshot`：若 Redis 快照仍在 TTL 内，返回可调试的记忆投影
- `conversationTrail`：关联会话消息（有 `conversation_id` / `request_id` 时更准；旧数据可能仅为行程最近消息）
- `response`（详情）/ `responsePreview`（列表）：Agent **返回内容**（从 `AgentConversationMessage` 按 `request_id` 回填；TripRun 本身不存全文）
- **Skill / MCP / 工具调用**（列表 + 详情）：
  - `skillsInvoked` / `mcpInvoked`：工具 ID 列表
  - `toolCallsCount` / `stepsExecuted`
  - `toolInvocationSummary`：分类明细（skill / mcp / live_tool，含 ok、latencyMs）
  - `toolsSource`：数据来源（`trip_run_metadata` | `conversation_summary_json` | `trip_attempt_next_actions` | …）
  - **新 run**：完成时写入 `metadata.tool_invocation_summary` / `skills_invoked` / `mcp_invoked`
  - **旧 run**：尽力从会话 `summaryJson`、attempt `nextActions` 回填；无痕迹时为空数组 / `null`

**Decision OS Observability V1（已冻结 — 停止扩字段）**

```
TripRun V1 = Runtime + Decision Trace + Evidence + Memory + Tools + Outcome + Evaluation(schema)
```

阶段定位：已从 Agent Runtime Logging → **Decision Observability（可观测）**。  
下一阶段目标：**可优化 Agent**（用记录驱动进化），不是「还能记录什么」。

| V1 已完成（冻结） | 说明 |
|-----------|------|
| Run Identity / Agent Trace / Tool Trace / Memory Trace | 列表+详情可观测 |
| Evidence Contract / Failure Taxonomy / Quality Schema | `observability_v1` |
| Feedback / Behavior / Outcome 写入 API | M1 写入已通 |
| Benchmark 写入 API | M2 入口已通 |
| `decisionCompleteness` | 无 Options → PARTIAL |

**禁止**：继续往 TripRun / `observability_v1` 堆空字段。后续能力靠**数据生产与聚合**，不靠 schema 膨胀。

| 下一阶段（数据生产 → 优化） | 目标 | Admin API |
|----------|------|-----------|
| **① Outcome → Evaluation 闭环** | Outcome 聚合 → failure pattern（如 `SAFETY_MISJUDGMENT`×37）→ Policy/Prompt | `GET .../evaluation/failure-patterns` |
| **② Decision Replay** | TripRun clone → route_and_run → Compare（Safety/Preference 差分） | `POST .../runs/:id/replay`、`GET .../runs/compare` |
| **③ Agent Policy Metrics** | Agent / Tool / Memory **级**聚合 | `GET .../metrics/policy` |

**① 失败模式聚合示例**

```bash
GET /api/agent/admin/evaluation/failure-patterns?minCount=1&limit=500
# → patterns: [{ patternId: "SAFETY_MISJUDGMENT", count: 37, suggestedActions: ["policy","prompt","model"], sampleRunIds: [...] }]
```

**② Decision Replay 示例**

```bash
# 重跑并对比
POST /api/agent/admin/runs/:id/replay
{ "mode": "reexecute" }

# 仅对比两个已有 Run
GET /api/agent/admin/runs/compare?sourceRunId=...&targetRunId=...
# 或 POST .../replay { "mode": "compare_only", "compareToRunId": "..." }
```

**③ Policy Metrics 示例**

```bash
GET /api/agent/admin/metrics/policy?limit=500
# → agents[{ successRate, acceptRate, severeFailureRate, topPatterns }]
# → tools[{ calls, changedDecisionRate, usefulRate }]
# → memory[{ helpfulRate, wrongRate, acceptRateWhenPresent }]
```

生产路径（唯一主线）：

```
客户端埋点 → Outcome 数据 → Golden Set → Replay → Policy Optimization
```

暂缓：Decision Stability（无 Outcome 时稳定错误无意义）、Tool counterfactual 单独工程、step token timeline。

**Decision Completeness**：无 Options 的 Run 标 `decisionCompleteness: PARTIAL`（不得自称 FULL）。链路目标：Goal → Constraints → Evidence → Options → Decision → Outcome。

**Decision OS 决策审计字段**

| 块 | 字段 | 用途 |
|----|------|------|
| Completeness | `decisionCompleteness` | FULL \| PARTIAL \| MINIMAL |
| P0 Decision Trace | `decisionTrace` | goal / constraints / options / finalDecision / cockpitRows |
| P0 Evidence Trace | `evidenceTrace` | VERIFIED\|STALE\|ASSUMED\|UNAVAILABLE + bucket |
| P0 Step Timeline | `steps` | agent / action / tool / durationMs |
| P0 Failure Taxonomy | `failure` | category / stage / type / severity / recoverable |
| P1 Memory Impact | `memoryTrace` | 记忆影响 + content |
| P1 Tool Effectiveness | `toolEvaluation` | changedDecision + contributionScore |
| M1 Outcome | `outcome` | latestEvent / trustSignal / verified |
| P1 Feedback | `feedback` / `behavior` | 评分与行为（可由 outcome 推导） |
| P2 Quality / Bench | `qualityMetrics` / `benchmark` | toolEfficiency；Golden 可写 |

**Feedback / Outcome 写入（M1）**

```bash
POST /api/agent/admin/runs/:id/feedback
Content-Type: application/json

# 推荐：旅行强信号（比 5 星更有价值）
{
  "outcomeEvent": "edit",
  "outcomeDetail": "改了第3天酒店",
  "dayIndex": 2,
  "source": "mobile"
}

# 亦可：accept | reject | regenerate | abandon | delete_day | bypass_ai
# 兼容旧字段：rating / accepted / modified / behavior
```

| outcomeEvent | trustSignal | 含义 |
|--------------|-------------|------|
| accept | HIGH_TRUST | 接受推荐 |
| edit | PARTIAL_CORRECT | 局部修改 |
| regenerate | LOW_SATISFACTION | 重新生成 |
| reject | LOW_SATISFACTION | 拒绝 |
| delete_day | SEVERE_FAILURE | 删除整天 |
| abandon / bypass_ai | TRUST_DECLINE | 放弃 / 绕开 AI |

写入后更新 `outcome` + 自动投影 `feedback`/`behavior`，并旁路镜像 RLHF 表。

**Benchmark 写入（Golden Set / CI）**

```bash
POST /api/agent/admin/runs/:id/benchmark
Content-Type: application/json

{
  "taskId": "ICE-023",
  "pass": false,
  "score": 72,
  "failedDimension": ["budget_constraint"]
}
```

亦可在 `route_and_run` 请求中带：

```json
{
  "options": {
    "golden_eval_task_id": "ICE-023",
    "golden_eval": { "pass": true, "score": 90, "failedDimension": [] }
  }
}
```

成功路径会写入 `observability_v1.benchmark`。

**示例：运行列表**

```bash
GET /api/agent/admin/runs?page=1&limit=20&status=FAILED

Response:
{
  "data": {
    "items": [
      {
        "id": "2abf3672-...",
        "tripId": "5945a3ab-...",
        "userId": "5872f534-...",
        "userQuery": "推荐租车",
        "planningPhase": "EXECUTION",
        "currentAgent": "ExecutionAgent",
        "status": "FAILED",
        "createdAt": "2026-08-08T10:45:41.456Z",
        "startedAt": "2026-08-08T10:45:41.456Z",
        "completedAt": "2026-08-08T10:47:11.425Z",
        "duration": 89,
        "durationSeconds": 89,
        "latencyMs": 90019,
        "entryPoint": "itinerary_day_editor",
        "modeFinal": "CLAUDE_DYNAMIC",
        "requestId": "ios-...",
        "fallbackUsed": false,
        "errorMessage": "TIMEOUT:CLAUDE_DYNAMIC",
        "failureCode": "ORCHESTRATION_TIMEOUT",
        "attemptCount": 0,
        "latestAttempt": null,
        "skillsInvoked": ["skill.route.suggest"],
        "skillsInvokedCount": 1,
        "mcpInvoked": ["live_tool.mcp.hotel"],
        "mcpInvokedCount": 1,
        "toolCallsCount": 2,
        "stepsExecuted": [],
        "toolsSource": "conversation_summary_json",
        "decisionSelected": null,
        "evidenceBucket": { "verified": 0, "stale": 0, "assumed": 0, "unavailable": 0 },
        "stepCount": 0,
        "failureCategory": "EXECUTION_ERROR",
        "failureRecoverable": true,
        "failure": {
          "category": "EXECUTION_ERROR",
          "stage": "OPTIMIZE",
          "type": "ORCHESTRATION_TIMEOUT",
          "severity": "HIGH",
          "recoverable": true,
          "domain": "TIMEOUT",
          "code": "ORCHESTRATION_TIMEOUT"
        },
        "responsePreview": "…",
        "trip": { "id": "...", "name": "...", "destination": "CN", "status": "PLANNING" },
        "user": { "userId": "...", "email": "...", "displayName": "Danny", "avatarUrl": "..." },
        "metadata": { "...": "原始 metadata 保留" }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 62, "totalPages": 4 }
  }
}
```

---

### 2.8 RAG 系统 `/api/rag`

#### 原型页面：知识库管理

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/rag/stats` | RAG 统计 |
| GET | `/api/rag/documents` | 文档列表 |
| GET | `/api/rag/documents/:id` | 文档详情 |
| PUT | `/api/rag/documents/:id` | 更新文档 |
| DELETE | `/api/rag/documents/:id` | 删除文档 |
| GET | `/api/rag/cache/stats` | 缓存统计 |
| POST | `/api/rag/cache/clear` | 清除缓存 |
| GET | `/api/rag/monitoring/metrics` | 监控指标 |
| GET | `/api/rag/monitoring/performance` | 性能数据 |
| GET | `/api/rag/monitoring/quality` | 质量数据 |
| GET | `/api/rag/monitoring/cost` | 成本数据 |

---

### 2.9 数据质量 `/api/admin/data-quality`

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/data-quality/dashboard` | 质量仪表盘 |
| GET | `/api/admin/data-quality/geographic/dashboard` | 地理数据仪表盘 |
| GET | `/api/admin/data-quality/geographic/assess/:countryCode` | 国家数据评估 |
| POST | `/api/admin/data-quality/physical-reality/upload` | 上传物理数据 |
| POST | `/api/admin/data-quality/validate/coordinates` | 坐标验证 |

---

### 2.10 目的地配置 `/api/admin/destination-clarification`

> **状态：活跃配置台（保留）** — 库内约 7 个目的地（IS/GL/K2/AL/SJ/XZ/LF 等）均 `enabled`；NL 创建行程 gate 会读配置。更新不勤，但非死接口。

**接口列表**（Admin 前端 `/admin/destination-clarification`）：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/destination-clarification` | 配置列表 |
| GET | `/api/admin/destination-clarification/:destinationCode` | 配置详情 |
| POST | `/api/admin/destination-clarification/:destinationCode` | 创建/更新配置 |
| PATCH | `/api/admin/destination-clarification/:destinationCode/enable` | 启用 |
| PATCH | `/api/admin/destination-clarification/:destinationCode/disable` | 禁用 |
| POST | `/api/admin/destination-clarification/:destinationCode/test` | 测试配置 |

---

### 2.10b 决策引擎运维 `/api/decision-engine/v1`

> **路径注意（重要）**  
> - 后端 Controller 为 `@Controller('decision-engine/v1')` → 完整前缀 **`/api/decision-engine/v1`**。  
> - Admin 前端若写成 `/admin/decision-engine/v1/...` **会 404**（除非自建 BFF 反代）。请统一改为 `/api/decision-engine/v1/...`。  
> - 对应页面：`/admin/decision-engine/operational-policy`、`/admin/decision-engine/ops-reality`。

#### 营运策略（P-OPS）— 保留

无独立业务表：默认策略合并环境变量 `OPS_OPERATIONAL_POLICY_JSON`；`GET` 始终有返回。

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/decision-engine/v1/operational-policy` | 生效营运策略 |
| GET | `/api/decision-engine/v1/health` | 健康检查 |

#### 实况审计（ops-reality）— 接口保留，**当前无快照**

> **数据说明（2026-08）**：表 `ops_reality_audit_snapshots` 当前环境 **0 行**。Admin 按行程查 / outcome 回填 / replay 比对会空。  
> 写路径已挂在 decision-engine / agent outcome bridge，**勿标废弃**；页面宜提示「暂无审计快照」，勿与「接口已死」混淆。

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/decision-engine/v1/ops-reality-audit/by-trip/:tripId` | 按行程查快照 |
| POST | `/api/decision-engine/v1/ops-reality-audit/:snapshotId/outcome` | 回填 outcome |
| GET | `/api/decision-engine/v1/ops-reality-audit/:snapshotId/replay-compare` | Replay 比对 |

---

### 2.11 用户管理 `/api/users/admin`

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/users/admin` | 用户列表（含 iOS 个人中心摘要） |
| GET | `/api/users/admin/stats` | 用户统计 |
| GET | `/api/users/admin/:id` | 用户详情（含摘要） |
| GET | `/api/users/admin/:id/detail` | 用户详细信息（含 iOS 完整块 + 证件元数据） |
| PUT | `/api/users/admin/:id` | 更新用户 |
| DELETE | `/api/users/admin/:id` | 删除用户 |

**列表 enrichment（对齐 iOS 个人中心）**：字段来自 `User` + `UserProfile.preferences.other`（见 `src/mobile/PERSONAL_CENTER_IOS_API.md`）。  
**国籍写入路径（仅 iOS）**：`PATCH /api/mobile/users/me/identity` — 对接文档 [`src/mobile/IDENTITY_IOS_HANDOFF.md`](../mobile/IDENTITY_IOS_HANDOFF.md)。

| 字段 | 说明 |
|------|------|
| `platformRole` | `USER` \| `OPERATOR` \| `ADMIN` |
| `identity` | phone / legalFullName / dateOfBirth / nationality / residencyRegion / preferredLanguage（未填为 `null`；可读 legacy `preferences.nationality`） |
| `travelPortrait` | travelPace / restFrequency / mobilityLimitation / nightDrivingAcceptance / gravelAcceptance / 家庭与晕车标记 |
| `driverSummary` | 同 iOS `driver-profile/summary`（qualificationStatus、经验年数、完成度等） |
| `hasIdentity` / `hasTravelPortrait` / `hasDriverProfile` | 是否已写入对应 other 键 |
| `tripCount` / `documentCount` / `emergencyContactCount` | 行程协作数、证件库数、紧急联系人数 |

**详情 `/admin/:id/detail` 另含**：`identity` / `travelPortrait` / `driverProfile` 完整对象、`emergencyContacts`、`documents`（无 signedUrl）、原始 `profile.preferences`。

---

### 2.12 系统监控 `/api/system/admin`

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/system/admin/metrics` | 系统指标 |
| GET | `/api/system/admin/performance` | 性能数据 |
| GET | `/api/system/admin/errors` | 错误日志 |
| GET | `/api/system/admin/requests` | 请求日志 |
| GET | `/api/system/admin/database` | 数据库状态 |
| GET | `/api/system/admin/cache` | 缓存状态 |

---

### 2.13 联系消息 `/api/contact/admin`

**接口列表**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/contact/admin/messages` | 消息列表 |
| GET | `/api/contact/admin/messages/:id` | 消息详情 |
| PUT | `/api/contact/admin/messages/:id/status` | 更新状态 |
| POST | `/api/contact/admin/messages/:id/reply` | 回复消息 |

---

### 2.14 Chain-of-Work 管理 `/api/chain-of-work/admin` — **已废弃**

> **Status: DEPRECATED（2026-08）**  
> - 对应 Admin 前端 `/admin/chain-of-work`；读写 `decision_drafts`，业务写路径已基本停产。  
> - **不要**用本模块观测智能体 System2；改用 `GET /api/agent/admin/runs`（及详情/统计/指标）。  
> - HTTP 仍可用（兼容旧 Admin），OpenAPI 已标 `deprecated`；后续将下线 Controller，模块内部（如编排恢复）保留。

**接口列表（均为废弃）**：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/chain-of-work/admin/stats` | 统计数据 |
| GET | `/api/chain-of-work/admin/draft` | 草案列表 |
| GET | `/api/chain-of-work/admin/draft/:draftId` | 草案详情 |
| POST | `/api/chain-of-work/admin/draft/batch` | 批量操作 |
| GET | `/api/chain-of-work/admin/execution` | 执行列表 |
| GET | `/api/chain-of-work/admin/execution/:executionId` | 执行详情 |
| GET | `/api/chain-of-work/admin/config` | 获取配置 |
| PUT | `/api/chain-of-work/admin/config` | 更新配置 |

非 Admin 的 `/api/chain-of-work/*`（generate/save/execute/version 等）同样 **已废弃**，请勿新对接。

---

## 三、管理后台仪表盘推荐

### 首页仪表盘应展示：

1. **核心指标卡片**
   - 总行程数 (`/api/trips/admin/stats`)
   - 活跃用户数 (`/api/users/admin/stats`)
   - 今日决策数 (`/api/decision/admin/stats`)
   - 系统健康度 (`/api/system/admin/metrics`)

2. **图表**
   - 行程趋势图（按日/周/月）
   - 决策来源分布饼图
   - Agent 运行成功率趋势

3. **告警列表**
   - HEURISTIC 热点 (`/api/decision/admin/analytics`)
   - 数据质量问题 (`/api/admin/data-quality/dashboard`)
   - 系统错误 (`/api/system/admin/errors`)

---

## 四、鉴权说明

所有 Admin 接口需要以下权限之一：
- `admin` 角色
- `ops` 角色
- `studio` 角色（部分接口）

请求头需携带 JWT Token：

```bash
Authorization: Bearer <your-admin-jwt-token>
```

---

## 五、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.1.0 | 2026-08-16 | 旅行决策合同 Admin 独立文档 |
| 1.0.0 | 2026-02-03 | 初始版本 |
