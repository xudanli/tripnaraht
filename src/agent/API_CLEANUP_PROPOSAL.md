# API 清理报告 ✅ 已完成

**执行时间**: 2026-02-03

## 当前 Agent 模块接口统计

| 控制器 | 路径前缀 | 接口数 | 状态 |
|--------|----------|--------|------|
| `agent.controller.ts` | `/agent` | 1 | ✅ 保留（主入口） |
| `agent-admin.controller.ts` | `/agent/admin` | 6 | ✅ 保留（管理） |
| `execution.controller.ts` | `/execution` | 1 | ⚠️ 考虑删除 |
| `trip-detail.controller.ts` | `/trip-detail` | 3 | ⚠️ 考虑删除 |
| `planning-workbench.controller.ts` | `/planning-workbench` | ~20 | ✅ 保留（核心） |
| `decision-replay.controller.ts` | `/api/v1/decision-replay` | 6 | ✅ 保留（AI-Native） |
| `rlhf-signal.controller.ts` | `/api/v1/rlhf` | 10 | ✅ 保留（AI-Native） |
| `context.controller.ts` | `/context` | ~10 | ⚠️ 考虑精简 |
| `training.controller.ts` | `/training` | ~15 | ⚠️ 考虑精简 |
| `planning-assistant.controller.ts` | `/agent/planning-assistant` | 5 | ⚠️ 与 planning-workbench 重复 |
| `journey-assistant.controller.ts` | `/agent/journey-assistant` | 7 | ⚠️ 与 execution 重复 |
| `trip-planner.controller.ts` | `/trip-planner` | ~5 | ⚠️ 与 planning-assistant 重复 |

---

## 建议删除的接口

### 1. `execution.controller.ts` - 可删除 ❌

**原因**：功能已被 `journey-assistant.controller.ts` 覆盖

```
POST /execution/execute
  ↓ 合并到
POST /agent/journey-assistant/events/handle
GET  /agent/journey-assistant/trips/:tripId/status
```

### 2. `trip-detail.controller.ts` - 可删除 ❌

**原因**：功能可通过 `planning-workbench` 和 `decision-replay` 实现

```
POST /trip-detail/execute
GET  /trip-detail/:tripId/status
GET  /trip-detail/:tripId/health
  ↓ 合并到
GET  /api/v1/decision-replay/timeline/:tripId
POST /planning-workbench/evaluate-budget
```

### 3. `planning-assistant.controller.ts` - 可精简 ⚠️

**原因**：与 `trip-planner.controller.ts` 功能高度重叠

建议保留其中一个，推荐保留 `planning-assistant`（更完整）

### 4. `trip-planner.controller.ts` - 可删除 ❌

**原因**：功能被 `planning-assistant` 覆盖

---

## 建议保留的核心接口

### AI-Native 决策系统（必须保留）

```typescript
// Decision Replay API - 决策回放
POST /api/v1/decision-replay/snapshot
GET  /api/v1/decision-replay/timeline/:tripRunId
GET  /api/v1/decision-replay/snapshot/:snapshotId
POST /api/v1/decision-replay/what-if
POST /api/v1/decision-replay/judgment/:tripRunId
GET  /api/v1/decision-replay/judgment/:tripRunId/pending

// RLHF Signal API - 学习信号
POST /api/v1/rlhf/behavior
POST /api/v1/rlhf/execution
POST /api/v1/rlhf/feedback
POST /api/v1/rlhf/quality-assessment
GET  /api/v1/rlhf/signals/:userId
POST /api/v1/rlhf/export
```

### 核心业务接口（必须保留）

```typescript
// Agent 主入口
POST /agent/route_and_run

// 规划工作台
POST /planning-workbench/execute
POST /planning-workbench/compare
POST /planning-workbench/commit
GET  /planning-workbench/weather
GET  /planning-workbench/road-status

// 行程助手（旅途中）
POST /agent/journey-assistant/chat
GET  /agent/journey-assistant/trips/:tripId/status
POST /agent/journey-assistant/events/handle
POST /agent/journey-assistant/schedule/adjust
```

---

## 执行清理步骤

### 步骤 1：删除冗余控制器

```bash
# 删除 execution.controller.ts
rm src/agent/execution.controller.ts

# 删除 trip-detail.controller.ts
rm src/agent/trip-detail.controller.ts

# 删除 trip-planner.controller.ts (保留 planning-assistant)
rm src/agent/assistants/trip-planner/trip-planner.controller.ts
```

### 步骤 2：更新 agent.module.ts

从 controllers 数组中移除已删除的控制器

### 步骤 3：更新相关服务

检查是否有服务依赖被删除的控制器

---

## 清理后的接口结构

```
/agent                          # 主入口
  └── route_and_run            
/agent/admin                    # 管理接口
  ├── runs/stats
  ├── runs
  ├── runs/:id
  └── performance
/agent/planning-assistant       # 规划助手
  ├── sessions
  ├── chat
  └── quick-recommend
/agent/journey-assistant        # 行程助手
  ├── chat
  ├── trips/:tripId/status
  ├── events/handle
  └── schedule/adjust
/api/v1/decision-replay         # 决策回放（AI-Native）
  ├── snapshot
  ├── timeline/:tripRunId
  ├── what-if
  └── judgment/:tripRunId
/api/v1/rlhf                    # RLHF 信号（AI-Native）
  ├── behavior
  ├── execution
  ├── feedback
  └── quality-assessment
/planning-workbench             # 规划工作台
  ├── execute
  ├── compare
  ├── commit
  └── ...
```

---

## 清理执行结果 ✅

以下清理操作已完成：

- [x] 删除 `execution.controller.ts` ✅
- [x] 删除 `trip-detail.controller.ts` ✅
- [x] 删除 `trip-planner.controller.ts` ✅
- [x] 更新 `agent.module.ts` - 移除控制器引用 ✅
- [x] 更新 `trip-planner.module.ts` - 移除控制器 ✅

### 删除的接口统计

| 接口 | 方法 | 路径 | 状态 |
|------|------|------|------|
| Execute | POST | `/execution/execute` | ❌ 已删除 |
| TripDetail Execute | POST | `/trip-detail/execute` | ❌ 已删除 |
| TripDetail Status | GET | `/trip-detail/:tripId/status` | ❌ 已删除 |
| TripDetail Health | GET | `/trip-detail/:tripId/health` | ❌ 已删除 |
| TripPlanner Chat | POST | `/trip-planner/chat` | ❌ 已删除 |
| TripPlanner Sessions | POST | `/trip-planner/sessions` | ❌ 已删除 |
| TripPlanner 其他 | * | `/trip-planner/*` | ❌ 已删除 |

### 保留的服务

以下服务保留用于内部调用（Actions 注册）：
- `ExecutionAgentService` - 执行阶段 Agent 服务
- `TripDetailAgentService` - 行程详情 Agent 服务
- `TripPlannerService` - 行程规划服务
