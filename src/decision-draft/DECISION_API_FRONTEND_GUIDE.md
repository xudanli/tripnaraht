# 决策相关接口 - 前端对接指南

本文档描述 TripNARA 决策系统的所有接口，包括使用场景和对应的原型页面。

---

## 一、接口模块总览

| 模块 | 基础路径 | 功能 | 原型页面 |
|------|----------|------|----------|
| Decision Draft | `/api/decision-draft` | 决策草案管理、生成、回放 | 决策工作台、决策详情 |
| Decision Replay | `/api/v1/decision-replay` | 决策回放、时间线、What-If | 决策回放面板、模拟器 |
| RLHF Signals | `/api/v1/rlhf` | 用户行为信号、反馈收集 | 全局埋点、评价弹窗 |

---

## 二、Decision Draft API（决策草案）

### 2.1 原型页面：决策工作台

```
┌─────────────────────────────────────────────────────────────────┐
│  决策工作台                                    [生成新草案] [统计] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ 决策步骤 1    │  │ 决策步骤 2    │  │ 决策步骤 3    │          │
│  │ 交通方式选择  │──│ 行程节奏     │──│ POI 筛选     │          │
│  │ ✅ 已批准    │  │ ⏳ 待处理    │  │ ⏳ 待处理    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 当前步骤详情                                                 ││
│  │ 类型: transport-decision                                    ││
│  │ 候选方案: [自驾] [租车] [公共交通]                            ││
│  │ 推荐: 自驾 (置信度: 85%)                                     ││
│  │                                                             ││
│  │ [查看解释] [批准] [修改] [拒绝]                               ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  [应用到行程] [加载回放] [版本历史]                               │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 接口清单

#### 2.2.1 获取行程的决策草案

```
GET /api/decision-draft/trip/:tripId
```

**使用场景**：用户打开行程详情页时，加载该行程的决策草案。

**请求**：
```bash
GET /api/decision-draft/trip/trip-12345
```

**响应**：
```json
{
  "draft_id": "decision-req-1770117319745",
  "plan_id": "plan-12345",
  "plan_version": 1,
  "decision_steps": [
    {
      "id": "decision-transport-001",
      "title": "交通方式选择",
      "type": "transport-decision",
      "status": "approved",
      "confidence": 0.85
    }
  ],
  "user_mode": "toc",
  "metadata": {
    "decision_count": 5,
    "created_at": "2026-02-03T10:00:00Z"
  }
}
```

**前端处理**：
- 渲染决策步骤流程图
- 根据 `status` 显示不同颜色标记
- 根据 `user_mode` 决定显示详略程度

---

#### 2.2.2 获取统计信息

```
GET /api/decision-draft/stats
```

**使用场景**：管理后台显示决策系统运行状态。

**响应**：
```json
{
  "total_drafts": 156,
  "avg_decision_count": 4.2,
  "avg_generation_time_ms": 2500
}
```

---

#### 2.2.3 获取决策草案详情

```
GET /api/decision-draft/:draftId
```

**使用场景**：用户点击某个决策草案查看详情。

**响应**：完整的 DecisionDraft 对象。

---

#### 2.2.4 获取决策解释（ToC/Expert 模式）

```
GET /api/decision-draft/:draftId/explanation?mode=toc
```

**使用场景**：用户点击「为什么这样推荐」查看决策解释。

**参数**：
- `mode`: `toc`（简洁）或 `expert`（详细）

**响应**：
```json
{
  "draft_id": "decision-req-xxx",
  "mode": "toc",
  "explanation": {
    "summary": "根据您的偏好和天气情况，推荐自驾环岛游",
    "key_factors": [
      "天气预报显示未来3天晴朗",
      "您偏好灵活自由的行程",
      "租车价格在预算范围内"
    ],
    "confidence": 0.85
  }
}
```

---

#### 2.2.5 获取单个步骤解释

```
GET /api/decision-draft/:draftId/step/:stepId/explanation
```

**使用场景**：用户点击某个决策步骤的「查看详情」。

---

#### 2.2.6 生成新决策草案

```
POST /api/decision-draft/generate
```

**使用场景**：用户点击「重新生成推荐」或首次创建行程时。

**请求体**：
```json
{
  "trip_id": "trip-12345",
  "user_preferences": {
    "pace": "BALANCED",
    "priority": "EXPERIENCE",
    "budget_level": "MEDIUM"
  },
  "constraints": {
    "must_include": ["glacier-lagoon"],
    "must_avoid": ["crowded-spots"]
  }
}
```

**响应**：新生成的 DecisionDraft 对象。

---

#### 2.2.7 批准/修改决策步骤

```
PUT /api/decision-draft/:draftId/step/:stepId
```

**使用场景**：用户在决策工作台上批准或修改某个决策。

**请求体**：
```json
{
  "action": "approve",  // approve | modify | reject
  "modified_value": null,  // 如果是 modify，填写新值
  "reason": "用户确认"
}
```

---

#### 2.2.8 应用决策到行程

```
POST /api/decision-draft/:draftId/apply
```

**使用场景**：用户确认所有决策后，点击「应用到行程」。

**响应**：
```json
{
  "success": true,
  "trip_id": "trip-12345",
  "applied_decisions": 5,
  "updated_items": ["route", "schedule", "pois"]
}
```

---

#### 2.2.9 获取决策回放数据 ⭐ 新增

```
GET /api/decision-draft/:draftId/replay
```

**使用场景**：用户点击「决策回放」按钮，可视化决策过程。

**响应**：
```json
{
  "draft_id": "decision-req-xxx",
  "timeline": [
    {
      "step_id": "decision-transport-001",
      "timestamp": "2026-02-03T10:00:00Z",
      "decision_type": "transport-decision",
      "summary": "选择自驾方式",
      "status": "approved"
    }
  ],
  "snapshots": [
    {
      "snapshot_id": "snapshot-001",
      "step_id": "decision-transport-001",
      "state": {
        "inputs": [...],
        "outputs": [...],
        "evidence": [...]
      }
    }
  ],
  "visualization": {
    "nodes": [
      { "id": "step-1", "type": "transport", "label": "交通决策", "data": {...} }
    ],
    "edges": [
      { "source": "step-1", "target": "step-2", "label": "→" }
    ]
  }
}
```

**前端处理**：
- 使用 React Flow 或类似库渲染决策流程图
- 点击节点显示快照详情
- 支持时间线回放动画

---

#### 2.2.10 版本管理

```
GET /api/decision-draft/:draftId/versions        # 获取版本列表
GET /api/decision-draft/:draftId/versions/:versionId  # 获取特定版本
GET /api/decision-draft/:draftId/versions/:v1/compare/:v2  # 对比版本
POST /api/decision-draft/:draftId/version        # 创建新版本
POST /api/decision-draft/:draftId/version/:versionId/rollback  # 回滚
POST /api/decision-draft/:draftId/version/:versionId/fork  # 分支
```

**使用场景**：版本历史面板，支持用户回退到之前的决策版本。

---

## 三、Decision Replay API（决策回放）

### 3.1 原型页面：决策回放面板

```
┌─────────────────────────────────────────────────────────────────┐
│  决策回放                                         [What-If 模拟] │
├─────────────────────────────────────────────────────────────────┤
│  时间线 ─────●─────●─────●─────●─────●───────                    │
│            10:00  10:05  10:10  10:15  10:20                    │
│                         ↑ 当前位置                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 快照详情: snap_10_10                                        ││
│  │                                                             ││
│  │ 阶段: PLAN_GEN                                              ││
│  │ 执行者: CoreDecision Agent                                  ││
│  │ 触发: AUTO                                                  ││
│  │                                                             ││
│  │ 决策输出:                                                    ││
│  │ - 推荐方案: 冰川环线 (得分: 87)                               ││
│  │ - 权衡: 时间 vs 体验                                         ││
│  │                                                             ││
│  │ [对比上一个快照] [回放到此点]                                  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  判断点:                                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ❓ 您更看重节省时间还是更多风景？                              ││
│  │    [节省时间] [更多风景]                                     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 接口清单

#### 3.2.1 获取决策时间线

```
GET /api/v1/decision-replay/timeline/:tripRunId
```

**使用场景**：打开决策回放面板时，加载完整时间线。

**响应**：
```json
{
  "trip_run_id": "trip-123",
  "created_at": "2026-02-03T10:00:00Z",
  "snapshots": [
    {
      "snapshot_id": "snap_001",
      "timestamp": "2026-02-03T10:00:00Z",
      "phase": "RESEARCH",
      "actor": "GeoAgent"
    }
  ],
  "key_decision_points": [...],
  "total_duration_ms": 15000
}
```

---

#### 3.2.2 获取快照详情

```
GET /api/v1/decision-replay/snapshot/:tripRunId/:snapshotId
```

**使用场景**：用户点击时间线上某个节点，查看该时刻的系统状态。

---

#### 3.2.3 回放到指定快照

```
POST /api/v1/decision-replay/replay/:tripRunId/:snapshotId
```

**使用场景**：用户想要「回到这个决策点重新选择」。

---

#### 3.2.4 快照对比

```
GET /api/v1/decision-replay/diff/:tripRunId?from=snap1&to=snap2
```

**使用场景**：对比两个时间点的决策差异。

**响应**：
```json
{
  "state_changes": [
    { "field": "recommended_plan", "from": "Plan A", "to": "Plan B" }
  ],
  "decision_changes": [...],
  "time_elapsed_ms": 5000
}
```

---

#### 3.2.5 What-If 模拟 ⭐

```
POST /api/v1/decision-replay/what-if
```

**使用场景**：用户想探索「如果我更看重成本会怎样」。

**原型页面：What-If 模拟器**

```
┌─────────────────────────────────────────────────────────────────┐
│  What-If 模拟器                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  基于快照: snap_10_10 (10:10)                                   │
│                                                                 │
│  修改条件:                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 优先级: [体验优先] → [成本优先] ✎                            ││
│  │ 风险承受: [中等]                                             ││
│  │ + 添加更多条件                                               ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│                    [运行模拟]                                    │
│                                                                 │
│  模拟结果:                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 原方案             vs           新方案                       ││
│  │ 冰川环线                        南部经济游                    ││
│  │ 得分: 87                        得分: 82 (-5)                ││
│  │ 成本: ¥15,000                   成本: ¥9,800 (-35%)          ││
│  │                                                             ││
│  │ 洞察:                                                        ││
│  │ • 成本降低35%，但会错过北部冰川景点                            ││
│  │ • 建议折中方案: 精选冰川路线                                   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**请求体**：
```json
{
  "input": {
    "base_snapshot_id": "snap_001",
    "changes": [
      {
        "type": "PREFERENCE_CHANGE",
        "field": "priority",
        "original_value": "EXPERIENCE",
        "new_value": "COST"
      }
    ]
  }
}
```

---

#### 3.2.6 用户判断点

```
GET /api/v1/decision-replay/judgment/:tripRunId/pending  # 获取待判断列表
POST /api/v1/decision-replay/judgment/:tripRunId  # 提交判断
```

**使用场景**：系统在关键决策点请求用户输入。

---

## 四、RLHF Signal API（信号收集）

### 4.1 原型页面：无显式 UI，全局埋点

这些接口主要用于前端埋点，收集用户行为数据。

### 4.2 接口清单（按场景分类）

#### 4.2.1 页面浏览埋点

```
POST /api/v1/rlhf/behavior/plan-view
```

**触发场景**：用户查看某个方案超过 3 秒。

**请求体**：
```json
{
  "trip_run_id": "trip-123",
  "plan_id": "plan-adventure",
  "duration_ms": 15000
}
```

---

#### 4.2.2 交互行为埋点

```
POST /api/v1/rlhf/behavior/detail
```

**触发场景**：用户展开/收起详情。

**请求体**：
```json
{
  "trip_run_id": "trip-123",
  "element_type": "PLAN",
  "element_id": "plan-adventure",
  "action": "EXPAND"  // EXPAND | COLLAPSE
}
```

---

#### 4.2.3 用户反馈

```
POST /api/v1/rlhf/feedback/accept   # 接受推荐
POST /api/v1/rlhf/feedback/reject   # 拒绝推荐
POST /api/v1/rlhf/feedback/rating   # 评分
```

**原型页面：评价弹窗**

```
┌─────────────────────────────────────────┐
│  您对本次推荐满意吗？                     │
│                                         │
│  ⭐ ⭐ ⭐ ⭐ ☆                           │
│                                         │
│  [可选] 留下您的建议:                    │
│  ┌─────────────────────────────────────┐│
│  │                                     ││
│  └─────────────────────────────────────┘│
│                                         │
│         [跳过]  [提交]                   │
└─────────────────────────────────────────┘
```

---

#### 4.2.4 执行偏差记录

```
POST /api/v1/rlhf/execution/deviation
POST /api/v1/rlhf/execution/skip
```

**触发场景**：行程执行过程中检测到偏差（GPS定位、时间延迟等）。

---

#### 4.2.5 获取信号摘要

```
GET /api/v1/rlhf/summary/:tripRunId
```

**使用场景**：管理后台查看某个行程的信号收集情况。

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

## 五、前端集成示例

### 5.1 React Hook 示例

```typescript
// hooks/useDecisionDraft.ts
import { useState, useEffect } from 'react';

export function useDecisionDraft(tripId: string) {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/decision-draft/trip/${tripId}`)
      .then(res => res.json())
      .then(data => {
        setDraft(data);
        setLoading(false);
      });
  }, [tripId]);

  const approvStep = async (stepId: string) => {
    await fetch(`/api/decision-draft/${draft.draft_id}/step/${stepId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' })
    });
    // 刷新数据
  };

  const loadReplay = async () => {
    const res = await fetch(`/api/decision-draft/${draft.draft_id}/replay`);
    return res.json();
  };

  return { draft, loading, approvStep, loadReplay };
}
```

### 5.2 埋点 Hook 示例

```typescript
// hooks/useRLHF.ts
export function useRLHF(tripRunId: string) {
  const trackPlanView = async (planId: string, durationMs: number) => {
    await fetch('/api/v1/rlhf/behavior/plan-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_run_id: tripRunId, plan_id: planId, duration_ms: durationMs })
    });
  };

  const submitRating = async (decisionPointId: string, rating: number, comment?: string) => {
    await fetch('/api/v1/rlhf/feedback/rating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_run_id: tripRunId, decision_point_id: decisionPointId, rating, comment })
    });
  };

  return { trackPlanView, submitRating };
}
```

---

## 六、状态码说明

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 401 | 未授权（需要 JWT Token） |
| 403 | 无权限（Studio/Admin 接口） |
| 404 | 资源不存在 |
| 500 | 服务器错误 |

---

## 七、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.2.0 | 2026-02-03 | 添加 `/replay` 端点 |
| 1.1.0 | 2026-02-03 | 添加用户判断点 API |
| 1.0.0 | 2026-02-01 | 初始版本 |
