# AI-Native Decision System API Reference

本文档描述 TripNARA AI-Native 决策系统的 API 接口。

## 概览

AI-Native 决策系统提供以下 API 模块：

| 模块 | 基础路径 | 功能 |
|------|----------|------|
| Decision Replay | `/api/v1/decision-replay` | 决策回放、时间线、What-If 模拟 |
| RLHF Signals | `/api/v1/rlhf` | 信号收集、质量评估、学习信号 |

---

## Decision Replay API

### 时间线管理

#### GET `/api/v1/decision-replay/timeline/:tripRunId`

获取指定行程的完整决策时间线。

**参数**：
- `tripRunId` (path): 行程运行 ID

**响应**：
```json
{
  "trip_run_id": "trip-123",
  "created_at": "2026-03-01T10:00:00Z",
  "snapshots": [...],
  "key_decision_points": [...],
  "total_duration_ms": 15000
}
```

#### GET `/api/v1/decision-replay/timeline/:tripRunId/summary`

获取决策时间线的简化摘要。

**响应**：
```json
{
  "total_snapshots": 5,
  "key_decisions": 2,
  "duration_ms": 15000,
  "phases": [
    { "phase": "RESEARCH", "snapshots": 2, "duration_ms": 5000 },
    { "phase": "PLAN_GEN", "snapshots": 3, "duration_ms": 10000 }
  ]
}
```

### 快照管理

#### GET `/api/v1/decision-replay/snapshot/:tripRunId/:snapshotId`

获取指定的决策快照。

**响应**：
```json
{
  "snapshot_id": "snap_123456",
  "timestamp": "2026-03-01T10:05:00Z",
  "state": {...},
  "decision_node": {...},
  "decision_output": {...},
  "metadata": {
    "step": "PLAN_GEN",
    "actor": "CoreDecision",
    "trigger": "AUTO"
  }
}
```

#### GET `/api/v1/decision-replay/snapshot/:tripRunId/latest`

获取最新的决策快照。

### 决策回放

#### POST `/api/v1/decision-replay/replay/:tripRunId/:snapshotId`

将决策状态回放到指定的快照点。

**响应**：
```json
{
  "restored_state": {...},
  "skipped_steps": ["VERIFY", "NARRATE"],
  "replay_point": "PLAN_GEN"
}
```

#### GET `/api/v1/decision-replay/diff/:tripRunId?from=snap1&to=snap2`

比较两个快照之间的差异。

**参数**：
- `from` (query): 起始快照 ID
- `to` (query): 目标快照 ID

**响应**：
```json
{
  "state_changes": [
    { "field": "current_step", "from": "RESEARCH", "to": "PLAN_GEN" }
  ],
  "decision_changes": [
    { "aspect": "recommendation", "description": "Changed from Plan A to Plan B" }
  ],
  "time_elapsed_ms": 5000
}
```

### What-If 模拟

#### POST `/api/v1/decision-replay/what-if`

执行 What-If 模拟。

**请求体**：
```json
{
  "input": {
    "base_snapshot_id": "snap_123456",
    "changes": [
      {
        "type": "PREFERENCE_CHANGE",
        "field": "priority",
        "original_value": "EXPERIENCE",
        "new_value": "COST"
      }
    ]
  },
  "decision_output": {...}
}
```

**响应**：
```json
{
  "original_snapshot_id": "snap_123456",
  "simulated_output": {...},
  "comparison": {
    "score_change": -5,
    "ranking_changes": [...],
    "tradeoff_changes": {...}
  },
  "insights": [
    "This change would lower your overall score",
    "Prioritizing COST affects your trade-off balance"
  ]
}
```

#### POST `/api/v1/decision-replay/counterfactual/:tripRunId`

生成反事实问题。

**响应**：
```json
{
  "trip_run_id": "trip-123",
  "questions": [
    {
      "question": "What if I prioritize budget over experience?",
      "what_if_input": {...},
      "expected_impact": "May recommend a more budget-friendly option"
    }
  ]
}
```

### 决策风格

#### GET `/api/v1/decision-replay/style/:userId`

获取用户的推断决策风格。

**响应**：
```json
{
  "user_id": "user-123",
  "inferred_preferences": {
    "pace": "BALANCED",
    "priority": "EXPERIENCE",
    "risk_tolerance": "MEDIUM",
    "budget_sensitivity": "MEDIUM"
  },
  "patterns": [...],
  "learning_signals": [...]
}
```

#### GET `/api/v1/decision-replay/style/:userId/preferences`

基于历史推断用户偏好。

**响应**：
```json
{
  "suggested_priority": "EXPERIENCE",
  "suggested_risk_tolerance": "MEDIUM",
  "confidence": 0.7,
  "reasoning": "Based on 15 previous interactions"
}
```

#### POST `/api/v1/decision-replay/style/:userId/signal`

记录用户行为用于决策风格学习。

**请求体**：
```json
{
  "signal_type": "ACCEPT",
  "context": "Accepted adventure plan with scenic route"
}
```

---

## RLHF Signal API

### 行为信号

#### POST `/api/v1/rlhf/behavior`

记录用户交互行为信号。

**请求体**：
```json
{
  "trip_run_id": "trip-123",
  "user_id": "user-456",
  "signal_type": "TIME_SPENT",
  "target": {
    "element_type": "PLAN",
    "element_id": "plan-a",
    "element_context": "comparison view"
  },
  "metadata": {
    "duration_ms": 15000,
    "viewport_visible": true
  }
}
```

**signal_type 可选值**：
- `VIEW` - 查看
- `CLICK` - 点击
- `HOVER` - 悬停
- `SCROLL` - 滚动
- `TIME_SPENT` - 停留时间
- `EXPAND` - 展开详情
- `COLLAPSE` - 收起详情

#### POST `/api/v1/rlhf/behavior/plan-view`

记录用户查看方案的时长。

**请求体**：
```json
{
  "trip_run_id": "trip-123",
  "plan_id": "plan-a",
  "duration_ms": 15000
}
```

#### POST `/api/v1/rlhf/behavior/detail`

记录用户展开/收起详情的行为。

**请求体**：
```json
{
  "trip_run_id": "trip-123",
  "element_type": "PLAN",
  "element_id": "plan-a",
  "action": "EXPAND"
}
```

### 执行信号

#### POST `/api/v1/rlhf/execution`

记录行程执行信号。

**请求体**：
```json
{
  "trip_run_id": "trip-123",
  "signal_type": "DEVIATION",
  "context": {
    "planned_item_id": "activity-001",
    "planned_time": "2026-03-01T09:00:00Z",
    "actual_time": "2026-03-01T09:45:00Z",
    "deviation_minutes": 45,
    "reason": "Traffic delay"
  }
}
```

**signal_type 可选值**：
- `START` - 开始执行
- `DEVIATION` - 显著偏差
- `SKIP` - 跳过活动
- `DELAY` - 延迟
- `EARLY` - 提前
- `COMPLETE` - 完成
- `ABORT` - 中止

#### POST `/api/v1/rlhf/execution/deviation`

记录计划与实际执行的偏差。

**请求体**：
```json
{
  "trip_run_id": "trip-123",
  "planned_item_id": "activity-001",
  "planned_time": "2026-03-01T09:00:00Z",
  "actual_time": "2026-03-01T09:45:00Z",
  "reason": "Traffic delay"
}
```

#### POST `/api/v1/rlhf/execution/skip`

记录用户跳过的计划活动。

**请求体**：
```json
{
  "trip_run_id": "trip-123",
  "planned_item_id": "activity-002",
  "reason": "Weather conditions"
}
```

### 反馈信号

#### POST `/api/v1/rlhf/feedback`

记录用户显式反馈。

**请求体**：
```json
{
  "trip_run_id": "trip-123",
  "user_id": "user-456",
  "decision_point_id": "decision-001",
  "feedback_type": "RATING",
  "value": {
    "rating": 4,
    "comment": "Good recommendations, but pace was too fast"
  },
  "context": {}
}
```

**feedback_type 可选值**：
- `ACCEPT` - 接受推荐
- `REJECT` - 拒绝推荐
- `MODIFY` - 修改推荐
- `QUESTION` - 提出疑问
- `RATING` - 评分
- `COMMENT` - 评论

#### POST `/api/v1/rlhf/feedback/accept`

记录用户接受推荐方案。

#### POST `/api/v1/rlhf/feedback/reject`

记录用户拒绝推荐方案。

#### POST `/api/v1/rlhf/feedback/rating`

记录用户对决策的评分（1-5）。

### 质量评估

#### POST `/api/v1/rlhf/quality/:tripRunId/:decisionPointId`

评估指定决策点的质量。

**响应**：
```json
{
  "trip_run_id": "trip-123",
  "decision_point_id": "decision-001",
  "assessed_at": "2026-03-01T15:00:00Z",
  "metrics": {
    "prediction_accuracy": 0.85,
    "user_satisfaction": 0.80,
    "execution_adherence": 0.75,
    "overall_quality": 0.80
  },
  "factors": [...],
  "improvement_signals": [
    {
      "signal_type": "HIGH_SKIP_RATE",
      "description": "3 activities were skipped - consider adjusting pace",
      "priority": "HIGH"
    }
  ]
}
```

### 学习信号

#### GET `/api/v1/rlhf/learning/:tripRunId`

基于收集的信号生成学习信号。

**响应**：
```json
[
  {
    "signal_id": "learn_123456",
    "timestamp": "2026-03-01T15:00:00Z",
    "signal_category": "PREFERENCE",
    "signal_strength": 0.6,
    "observation": {
      "context": "Plan comparison",
      "user_action": "Spent 15s on plan adventure",
      "system_prediction": null,
      "actual_outcome": null
    },
    "learning_target": {
      "model_component": "RANKING",
      "adjustment_direction": "INCREASE",
      "adjustment_magnitude": 0.1
    }
  }
]
```

### 摘要

#### GET `/api/v1/rlhf/summary/:tripRunId`

获取行程的信号收集摘要。

**响应**：
```json
{
  "behavior_count": 15,
  "execution_count": 8,
  "feedback_count": 3,
  "deviations": 2,
  "skips": 1,
  "acceptances": 2,
  "rejections": 0,
  "avg_rating": 4.0
}
```

---

## 错误响应

所有 API 在出错时返回以下格式：

```json
{
  "error": "Error message describing what went wrong"
}
```

常见错误码：
- `404` - 资源不存在（时间线、快照等未找到）
- `400` - 请求参数无效
- `500` - 服务器内部错误

---

## 使用示例

### 完整决策回放流程

```typescript
// 1. 用户完成行程规划
const tripRunId = 'trip-123';

// 2. 获取决策时间线
const timeline = await fetch(`/api/v1/decision-replay/timeline/${tripRunId}`);

// 3. 用户想要探索 "如果我更看重成本会怎样？"
const whatIfResult = await fetch('/api/v1/decision-replay/what-if', {
  method: 'POST',
  body: JSON.stringify({
    input: {
      base_snapshot_id: timeline.snapshots[2].snapshot_id,
      changes: [
        { type: 'PREFERENCE_CHANGE', field: 'priority', original_value: 'EXPERIENCE', new_value: 'COST' }
      ]
    },
    decision_output: timeline.snapshots[2].decision_output
  })
});

// 4. 展示对比结果
console.log('Score change:', whatIfResult.comparison.score_change);
console.log('Insights:', whatIfResult.insights);
```

### 完整 RLHF 信号收集流程

```typescript
// 1. 用户查看方案对比
await fetch('/api/v1/rlhf/behavior/plan-view', {
  method: 'POST',
  body: JSON.stringify({
    trip_run_id: 'trip-123',
    plan_id: 'plan-adventure',
    duration_ms: 15000
  })
});

// 2. 用户接受推荐
await fetch('/api/v1/rlhf/feedback/accept', {
  method: 'POST',
  body: JSON.stringify({
    trip_run_id: 'trip-123',
    decision_point_id: 'decision-001',
    chosen_option_id: 'plan-adventure'
  })
});

// 3. 行程执行中记录偏差
await fetch('/api/v1/rlhf/execution/deviation', {
  method: 'POST',
  body: JSON.stringify({
    trip_run_id: 'trip-123',
    planned_item_id: 'activity-glacier-hike',
    planned_time: '2026-03-02T09:00:00Z',
    actual_time: '2026-03-02T10:30:00Z',
    reason: 'Weather delay'
  })
});

// 4. 用户评分
await fetch('/api/v1/rlhf/feedback/rating', {
  method: 'POST',
  body: JSON.stringify({
    trip_run_id: 'trip-123',
    decision_point_id: 'decision-001',
    rating: 4,
    comment: 'Good overall, but weather predictions could be better'
  })
});

// 5. 获取质量评估
const quality = await fetch(`/api/v1/rlhf/quality/trip-123/decision-001`, {
  method: 'POST',
  body: JSON.stringify(decisionOutput)
});

// 6. 生成学习信号
const learningSignals = await fetch('/api/v1/rlhf/learning/trip-123');
```

---

## 用户判断点 API

### POST /api/v1/decision-replay/judgment/:tripRunId

提交用户判断并触发重新评估。

**请求体**:
```json
{
  "judgment_point_id": "string",      // 判断点 ID
  "selected_option": "string",        // 用户选择的选项
  "user_id": "string",                // 可选，用户 ID
  "context": {}                       // 可选，附加上下文
}
```

**响应**:
```json
{
  "success": true,
  "trip_run_id": "trip-123",
  "judgment_applied": {
    "judgment_point_id": "jp-001",
    "selected_option": "option-b"
  },
  "current_snapshot_id": "snap_123_abc",
  "message": "User judgment recorded. Re-evaluation should be triggered by the orchestrator.",
  "suggested_action": "TRIGGER_REEVALUATION"
}
```

### GET /api/v1/decision-replay/judgment/:tripRunId/pending

获取待处理的判断点列表。

**响应**:
```json
{
  "trip_run_id": "trip-123",
  "pending_judgments": [
    {
      "id": "jp-001",
      "question": "What's more important: saving time or having more scenic stops?",
      "options": [
        { "id": "time", "label": "Save time" },
        { "id": "scenic", "label": "More scenic stops" }
      ],
      "context": "Route choice between direct highway and coastal road"
    }
  ],
  "total": 1,
  "snapshot_id": "snap_123_abc"
}
```

---

## 数据质量标注

所有 Domain Agent 返回现在都包含 `data_quality` 字段：

```typescript
interface DataQuality {
  source_type: 'REALTIME_API' | 'CACHED' | 'HISTORICAL' | 'ESTIMATED' | 'MOCK';
  freshness_seconds: number;
  confidence: number;        // 0-1
  coverage: number;          // 0-1
  retrieved_at: string;
  expires_at?: string;
  fallback_info?: {
    original_source: string;
    fallback_reason: string;
    quality_impact: 'NONE' | 'MINOR' | 'MODERATE' | 'SIGNIFICANT';
  };
}
```

**示例**:
```json
{
  "terrain_type": "MOUNTAINOUS",
  "difficulty": "HARD",
  "evidence": [...],
  "data_quality": {
    "source_type": "REALTIME_API",
    "freshness_seconds": 0,
    "confidence": 0.9,
    "coverage": 1.0,
    "retrieved_at": "2026-02-03T10:00:00Z",
    "expires_at": "2026-02-03T11:00:00Z"
  }
}
```

---

## 鉴权

所有 API 端点都需要 JWT 鉴权：

```bash
curl -X GET /api/v1/decision-replay/timeline/trip-123 \
  -H "Authorization: Bearer <your-jwt-token>"
```

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.1.0 | 2026-02-03 | 添加用户判断点 API、数据质量标注、JWT 鉴权 |
| 1.0.0 | 2026-02-03 | 初始版本，包含 Decision Replay 和 RLHF Signal API |
