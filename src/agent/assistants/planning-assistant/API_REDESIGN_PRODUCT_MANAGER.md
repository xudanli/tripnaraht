# 规划智能体接口重新设计方案

**文档版本**: 1.0  
**设计日期**: 2026-02-08  
**设计角色**: 产品经理  
**设计原则**: RESTful、职责清晰、易于使用、可扩展

---

## 📋 目录

- [设计目标](#设计目标)
- [当前问题分析](#当前问题分析)
- [重新设计方案](#重新设计方案)
- [接口详细设计](#接口详细设计)
- [迁移方案](#迁移方案)
- [实施优先级](#实施优先级)

---

## 🎯 设计目标

### 核心原则

1. **职责清晰** - 每个接口只做一件事，职责单一
2. **易于使用** - 前端调用简单，不需要复杂的意图识别
3. **可扩展性** - 支持未来功能扩展
4. **性能优化** - 支持异步操作，避免长时间等待
5. **向后兼容** - 平滑迁移，不破坏现有功能

### 业务目标

- ✅ 提升开发效率（前端调用更直观）
- ✅ 降低维护成本（接口职责清晰）
- ✅ 改善用户体验（响应更快，支持异步）
- ✅ 支持业务扩展（新功能易于添加）

---

## 🔍 当前问题分析

### 问题1: 接口职责过重

**现状**:
- `/chat` 接口承担了所有功能：推荐、生成方案、对比、优化、确认等
- 通过意图识别来区分功能，导致接口职责不清晰

**问题**:
- 前端调用复杂，需要理解意图系统
- 难以针对不同功能进行优化（缓存、限流等）
- 错误处理复杂，不同意图的错误类型不同
- 难以监控和分析（无法区分不同功能的调用量）

### 问题2: 缺少明确的业务操作接口

**现状**:
- 所有操作都通过 `/chat` 接口
- 没有专门的推荐接口、方案生成接口、对比接口

**问题**:
- 前端需要构造自然语言消息，而不是直接调用业务接口
- 无法进行精确的参数验证
- 难以进行接口级别的限流和监控

### 问题3: 会话管理不清晰

**现状**:
- `quick-recommend` 内部创建临时会话，用户不知道
- 会话状态查询返回的数据结构可能不够清晰

**问题**:
- 用户无法管理临时会话
- 会话生命周期不透明
- 难以进行会话级别的监控

### 问题4: 缺少对已创建行程的支持

**现状**:
- 文档说支持优化已创建行程，但接口中没有 `tripId` 参数
- 需要明确如何关联已创建的行程

**问题**:
- 无法明确区分"规划新行程"和"优化已创建行程"
- 缺少专门的优化接口

### 问题5: 用户偏好接口位置不当

**现状**:
- 用户偏好接口放在 `planning-assistant` 下
- 但这是用户级别的数据，应该独立

**问题**:
- 用户偏好不仅用于规划助手，还可能用于其他场景
- 接口路径不符合 RESTful 规范

### 问题6: 缺少异步操作支持

**现状**:
- 方案生成可能需要较长时间，但没有异步接口
- 用户需要长时间等待

**问题**:
- 用户体验差（长时间等待）
- 无法处理超时和重试
- 无法显示进度

---

## 🎨 重新设计方案

### 设计理念

**混合架构：AI优先 + 操作式接口**

- **对话接口**（主要入口）: 提供最佳AI体验，智能理解用户意图，支持多轮对话和上下文感知
- **业务接口**（快捷方式）: 提供结构化接口，但内部也使用AI能力，支持自然语言参数
- **智能路由**: 对话接口可以智能路由到业务接口，提供最佳用户体验

### 架构设计

```
规划智能体接口层
├── 会话管理 (Session Management)
│   ├── POST /sessions - 创建会话
│   ├── GET /sessions/:sessionId - 获取会话状态
│   ├── DELETE /sessions/:sessionId - 删除会话
│   └── GET /sessions/:sessionId/history - 获取对话历史
│
├── 对话接口 (Chat Interface) - 主要入口
│   ├── POST /chat - 智能对话（AI增强，支持智能路由）
│   └── POST /chat/stream - 流式对话（可选）
│
├── 业务操作 (Business Operations) - 快捷方式
│   ├── GET /recommendations - 获取目的地推荐（支持自然语言参数）
│   ├── POST /plans/generate - 生成方案（同步，支持自然语言描述）
│   ├── POST /plans/generate-async - 生成方案（异步）
│   ├── GET /plans/generate/:taskId - 查询生成任务状态
│   ├── GET /plans/compare - 对比方案（支持自然语言参数）
│   ├── POST /plans/:planId/optimize - 优化方案
│   └── POST /plans/:planId/confirm - 确认方案
│
└── 行程操作 (Trip Operations)
    ├── POST /trips/:tripId/optimize - 优化已创建行程
    ├── POST /trips/:tripId/refine - 细化行程
    └── GET /trips/:tripId/suggestions - 获取优化建议
```

---

## 📡 接口详细设计

### 1. 会话管理接口

#### 1.1 创建会话

```http
POST /api/agent/planning-assistant/sessions
Content-Type: application/json

{
  "userId": "user_123",           // 可选，用户ID
  "context": {                     // 可选，初始上下文
    "tripId": "trip_456",         // 可选，关联已创建行程
    "destination": "Iceland",      // 可选，初始目的地
    "preferences": {               // 可选，初始偏好
      "budget": { "total": 5000, "currency": "USD" },
      "travelers": { "adults": 2, "children": 0 },
      "dateRange": { "startDate": "2026-06-01", "endDate": "2026-06-10" }
    }
  }
}
```

**响应**:
```json
{
  "sessionId": "session_789",
  "userId": "user_123",
  "createdAt": "2026-02-08T10:00:00Z",
  "expiresAt": "2026-02-09T10:00:00Z",
  "context": {
    "tripId": "trip_456",
    "destination": "Iceland"
  }
}
```

#### 1.2 获取会话状态

```http
GET /api/agent/planning-assistant/sessions/:sessionId
```

**响应**:
```json
{
  "sessionId": "session_789",
  "userId": "user_123",
  "phase": "RECOMMENDING",  // INITIAL, COLLECTING_PREFERENCES, RECOMMENDING, COMPARING_PLANS, CONFIRMING, COMPLETED
  "preferences": { ... },
  "recommendations": [ ... ],
  "selectedDestination": "Iceland",
  "planCandidates": [ ... ],
  "selectedPlanId": "plan_123",
  "confirmedTripId": "trip_456",
  "messageCount": 10,
  "createdAt": "2026-02-08T10:00:00Z",
  "updatedAt": "2026-02-08T10:15:00Z",
  "expiresAt": "2026-02-09T10:00:00Z"
}
```

#### 1.3 删除会话

```http
DELETE /api/agent/planning-assistant/sessions/:sessionId
```

**响应**:
```json
{
  "success": true,
  "sessionId": "session_789"
}
```

#### 1.4 获取对话历史

```http
GET /api/agent/planning-assistant/sessions/:sessionId/history?limit=50&offset=0
```

**响应**:
```json
{
  "messages": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "我想去冰岛旅行",
      "timestamp": "2026-02-08T10:00:00Z",
      "intent": "EXPLORE"
    },
    {
      "id": "msg_2",
      "role": "assistant",
      "content": "好的，我来为您推荐冰岛的目的地...",
      "timestamp": "2026-02-08T10:00:05Z",
      "intent": "RECOMMEND",
      "recommendations": [ ... ]
    }
  ],
  "total": 10,
  "limit": 50,
  "offset": 0
}
```

---

### 2. 业务操作接口

#### 2.1 获取目的地推荐

**接口变更**: 改为 `GET` 方法（符合RESTful规范，支持缓存）

**方式1: GET with query parameters (结构化参数)**
```http
GET /api/agent/planning-assistant/v2/recommendations?preferences[budget][total]=5000&filters[countryCode]=IS&limit=10&language=zh
```

**方式2: GET with natural language (AI增强)**
```http
GET /api/agent/planning-assistant/v2/recommendations?q=我想去一个不太热的地方，预算5000左右&limit=10&language=zh
```

**方式3: POST with complex parameters (复杂参数，支持隐式信号)**
```http
POST /api/agent/planning-assistant/v2/recommendations
Content-Type: application/json

{
  "sessionId": "session_789",     // 可选，关联会话
  "userId": "user_123",           // 可选，用户ID
  "naturalLanguageDescription": "我想去一个不太热的地方，预算5000左右",  // 可选，自然语言描述
  "preferences": {                 // 可选，偏好（会与会话偏好合并）
    "budget": { "total": 5000, "currency": "USD" },
    "travelers": { "adults": 2 },
    "activities": ["hiking", "photography"],
    "travelStyle": "adventure"
  },
  "filters": {                     // 可选，过滤条件
    "countryCode": "IS",           // 国家代码
    "region": "Europe",            // 地区
    "excludeCountries": ["US"]     // 排除国家
  },
  "implicitSignals": {             // 可选，隐式信号（AI增强）
    "browsedDestinations": ["Iceland", "Norway"],
    "clickedPlans": ["plan_1", "plan_2"],
    "currentLocation": { "lat": 64.1265, "lng": -21.8174 }
  },
  "limit": 10,                     // 可选，返回数量，默认10
  "language": "zh"                 // 可选，语言，默认zh
}
```

**响应**:
```json
{
  "recommendations": [
    {
      "id": "dest_1",
      "countryCode": "IS",
      "name": "Iceland",
      "nameCN": "冰岛",
      "description": "...",
      "descriptionCN": "...",
      "highlights": [...],
      "highlightsCN": [...],
      "matchScore": 95,
      "matchReasons": [...],
      "matchReasonsCN": [...],
      "estimatedBudget": {
        "min": 3000,
        "max": 8000,
        "currency": "USD"
      },
      "bestSeasons": ["summer", "autumn"],
      "imageUrl": "https://...",
      "tags": ["adventure", "nature", "photography"]
    }
  ],
  "sessionId": "session_789",
  "preferencesUsed": { ... },
  "generatedAt": "2026-02-08T10:00:00Z"
}
```

#### 2.2 生成方案（同步）

**AI增强**: 支持自然语言描述，AI自动提取参数

```http
POST /api/agent/planning-assistant/v2/plans/generate
Content-Type: application/json

{
  "sessionId": "session_789",     // 可选，关联会话
  "userId": "user_123",           // 可选，用户ID
  "destination": "Iceland",       // 可选，目的地（如果提供naturalLanguageDescription则可选）
  "naturalLanguageDescription": "我想去冰岛，喜欢拍照和徒步，预算5000左右，10天",  // 可选，自然语言描述（AI增强）
  "preferences": {                 // 可选，偏好（会与会话偏好合并）
    "budget": { "total": 5000, "currency": "USD" },
    "travelers": { "adults": 2 },
    "dateRange": {
      "startDate": "2026-06-01",
      "endDate": "2026-06-10"
    },
    "activities": ["hiking", "photography"]
  },
  "constraints": {                 // 可选，约束条件
    "maxDays": 10,
    "mustInclude": ["Reykjavik"],
    "exclude": ["tourist traps"]
  },
  "options": {                     // 可选，生成选项
    "count": 3,                   // 生成方案数量，默认3
    "includeBudget": true,         // 是否包含预算估算
    "includePersonas": true,       // 是否包含三人格评价
    "includeExplanation": true,    // 是否包含AI解释（新增）
    "includeOptimizationTips": true // 是否包含优化建议（新增）
  },
  "language": "zh"                 // 可选，语言，默认zh
}
```

**AI增强说明**:
- 如果提供 `naturalLanguageDescription`，AI会自动提取 `destination`、`preferences`、`constraints` 等参数
- 如果参数不完整，AI会智能补全
- 每个方案都会包含AI生成的解释和优化建议

**响应**:
```json
{
  "plans": [
    {
      "id": "plan_1",
      "name": "Iceland Adventure - 10 Days",
      "nameCN": "冰岛探险 - 10天",
      "description": "...",
      "descriptionCN": "...",
      "destination": "Iceland",
      "duration": 10,
      "highlights": [...],
      "estimatedBudget": {
        "total": 4500,
        "breakdown": {
          "flight": 1200,
          "accommodation": 1800,
          "activities": 1000,
          "food": 500
        },
        "currency": "USD"
      },
      "pace": "moderate",
      "suitability": {
        "score": 92,
        "reasons": [...]
      },
      "personas": {               // 如果 includePersonas=true
        "adventurer": { ... },
        "planner": { ... },
        "relaxer": { ... }
      },
      "warnings": []
    }
  ],
  "sessionId": "session_789",
  "generatedAt": "2026-02-08T10:00:00Z",
  "traceId": "trace_123"
}
```

#### 2.3 生成方案（异步）

```http
POST /api/agent/planning-assistant/plans/generate-async
Content-Type: application/json

{
  // 参数同同步接口
  "sessionId": "session_789",
  "destination": "Iceland",
  ...
}
```

**响应**:
```json
{
  "taskId": "task_456",
  "status": "PENDING",
  "estimatedDuration": 30,        // 预估耗时（秒）
  "createdAt": "2026-02-08T10:00:00Z"
}
```

**查询任务状态**:
```http
GET /api/agent/planning-assistant/plans/generate/:taskId
```

**响应**:
```json
{
  "taskId": "task_456",
  "status": "COMPLETED",          // PENDING, PROCESSING, COMPLETED, FAILED
  "progress": 100,                 // 进度百分比
  "result": {                      // 如果 COMPLETED
    "plans": [ ... ]
  },
  "error": null,                  // 如果 FAILED
  "createdAt": "2026-02-08T10:00:00Z",
  "completedAt": "2026-02-08T10:00:30Z"
}
```

#### 2.4 对比方案

**接口变更**: 改为 `GET` 方法（符合RESTful规范，支持缓存）

**方式1: GET with query parameters**
```http
GET /api/agent/planning-assistant/v2/plans/compare?planIds=plan_1,plan_2,plan_3&compareFields=budget,duration,pace&language=zh
```

**方式2: POST with complex parameters (复杂参数)**
```http
POST /api/agent/planning-assistant/v2/plans/compare
Content-Type: application/json

{
  "sessionId": "session_789",     // 可选
  "planIds": ["plan_1", "plan_2", "plan_3"],  // 必填，至少2个
  "compareFields": [              // 可选，对比维度
    "budget",
    "duration",
    "pace",
    "activities"
  ],
  "language": "zh"
}
```

**响应**:
```json
{
  "plans": [
    {
      "id": "plan_1",
      "name": "...",
      "scores": {
        "budget": 85,
        "duration": 90,
        "pace": 80,
        "activities": 95
      }
    }
  ],
  "comparison": {
    "dimensions": ["budget", "duration", "pace", "activities"],
    "differences": [
      {
        "field": "budget",
        "plan1Value": 4500,
        "plan2Value": 6000,
        "impact": "medium",
        "description": "方案2比方案1贵1500美元"
      }
    ],
    "recommendation": {
      "bestBudget": "plan_1",
      "bestRoute": "plan_2",
      "bestTime": "plan_1",
      "summary": "方案1在预算和时间上更优，方案2在路线安排上更合理"
    }
  }
}
```

#### 2.5 优化方案

```http
POST /api/agent/planning-assistant/plans/:planId/optimize
Content-Type: application/json

{
  "sessionId": "session_789",     // 可选
  "optimizationType": "pace",     // 可选：pace, budget, route, activities
  "requirements": {               // 可选，优化要求
    "slowerPace": true,
    "reduceBudget": 1000,
    "addActivities": ["photography"],
    "removeActivities": ["shopping"]
  },
  "language": "zh"
}
```

**响应**:
```json
{
  "optimizedPlan": {
    "id": "plan_1_optimized",
    "originalPlanId": "plan_1",
    "changes": [
      {
        "type": "pace",
        "description": "节奏从紧凑调整为适中",
        "impact": "medium"
      }
    ],
    "plan": { ... }               // 优化后的方案
  },
  "sessionId": "session_789"
}
```

#### 2.6 确认方案

```http
POST /api/agent/planning-assistant/plans/:planId/confirm
Content-Type: application/json

{
  "sessionId": "session_789",     // 可选
  "userId": "user_123",           // 可选，如果未在会话中
  "options": {                     // 可选
    "saveToCalendar": true,
    "sendReminders": true
  }
}
```

**响应**:
```json
{
  "tripId": "trip_456",
  "planId": "plan_1",
  "sessionId": "session_789",
  "createdAt": "2026-02-08T10:00:00Z",
  "calendarEventId": "cal_123"   // 如果 saveToCalendar=true
}
```

---

### 3. 对话接口（主要入口，AI增强）

#### 3.1 智能对话

**重要变更**: 对话接口是**主要入口**，提供最佳AI体验，支持智能路由到业务接口

```http
POST /api/agent/planning-assistant/v2/chat
Content-Type: application/json

{
  "sessionId": "session_789",     // 必填
  "userId": "user_123",           // 可选
  "message": "我想去冰岛旅行",    // 必填，支持自然语言
  "language": "zh",               // 可选
  "options": {                     // 可选，对话选项
    "autoRoute": true,             // 自动路由到业务接口
    "clarifyIntent": true,        // 意图不明确时澄清
    "stream": false                // 是否流式响应
  },
  "context": {                    // 可选
    "currentLocation": { "lat": 64.1265, "lng": -21.8174 },
    "timezone": "Atlantic/Reykjavik"
  }
}
```

**响应**:
```json
{
  "message": "好的，我来为您推荐冰岛的目的地...",
  "messageCN": "好的，我来为您推荐冰岛的目的地...",
  "phase": "RECOMMENDING",
  "routing": {                    // 可选，智能路由信息
    "target": "recommendations",
    "reason": "检测到推荐意图",
    "params": {
      "destination": "Iceland",
      "preferences": { ... }
    }
  },
  "recommendations": [ ... ],     // 如果路由到推荐接口
  "suggestedActions": [          // 可选，建议操作
    {
      "action": "get_recommendations",
      "label": "查看推荐",
      "labelCN": "查看推荐",
      "params": { "destination": "Iceland" }
    }
  ],
  "sessionId": "session_789"
}
```

**智能路由机制**:
1. **意图识别**: AI分析用户消息，识别意图（推荐、生成、对比等）
2. **智能路由**: 如果意图明确，自动路由到对应的业务接口
3. **结果返回**: 返回业务接口的结果，同时保持对话上下文
4. **对话继续**: 如果意图不明确，继续对话澄清需求

**使用场景**:
- ✅ **主要入口**: 所有用户请求都可以通过对话接口
- ✅ **自然语言交互**: 支持自然语言理解和多轮对话
- ✅ **上下文感知**: 理解对话上下文和历史
- ✅ **智能路由**: 自动路由到最合适的业务接口
- ✅ **复杂查询**: 处理意图不明确的复杂查询

---

### 4. 行程操作接口

#### 4.1 优化已创建行程

```http
POST /api/agent/planning-assistant/trips/:tripId/optimize
Content-Type: application/json

{
  "sessionId": "session_789",     // 可选，创建新会话或使用现有
  "optimizationType": "pace",    // 可选：pace, budget, route, activities
  "requirements": {               // 可选
    "slowerPace": true,
    "reduceBudget": 1000
  },
  "language": "zh"
}
```

**响应**:
```json
{
  "tripId": "trip_456",
  "optimizedTripId": "trip_456_v2",  // 新版本ID
  "changes": [
    {
      "type": "pace",
      "description": "节奏从紧凑调整为适中",
      "impact": "medium",
      "affectedDays": [2, 3, 4]
    }
  ],
  "sessionId": "session_789"
}
```

#### 4.2 细化行程

```http
POST /api/agent/planning-assistant/trips/:tripId/refine
Content-Type: application/json

{
  "sessionId": "session_789",     // 可选
  "days": [2, 3],                 // 可选，指定要细化的天数，默认全部
  "include": {                     // 可选，细化内容
    "restaurants": true,
    "transport": true,
    "activities": true
  },
  "language": "zh"
}
```

**响应**:
```json
{
  "tripId": "trip_456",
  "refinedTripId": "trip_456_refined",
  "refinements": [
    {
      "day": 2,
      "restaurants": [ ... ],
      "transport": [ ... ],
      "activities": [ ... ]
    }
  ],
  "sessionId": "session_789"
}
```

#### 4.3 获取优化建议

```http
GET /api/agent/planning-assistant/trips/:tripId/suggestions?language=zh
```

**响应**:
```json
{
  "suggestions": [
    {
      "type": "optimization",
      "title": "优化行程节奏",
      "titleCN": "优化行程节奏",
      "description": "第2-4天的行程安排较紧，建议适当放松",
      "descriptionCN": "第2-4天的行程安排较紧，建议适当放松",
      "priority": "medium",
      "action": {
        "type": "optimize",
        "params": { "optimizationType": "pace" }
      }
    }
  ],
  "generatedAt": "2026-02-08T10:00:00Z"
}
```

---

### 5. 用户偏好接口（移至用户模块）

**建议**: 将用户偏好接口移至 `/api/users/:userId/preferences`

```http
GET /api/users/:userId/preferences
POST /api/users/:userId/preferences/clear
PUT /api/users/:userId/preferences
```

---

## 🔄 迁移方案

### 阶段1: 新增接口（向后兼容）

**时间**: 1-2周

- ✅ 新增所有新接口
- ✅ 保留现有 `/chat` 接口
- ✅ 前端逐步迁移到新接口
- ✅ 监控新接口使用情况

### 阶段2: 标记旧接口为废弃

**时间**: 2-4周后

- ⚠️ 在文档中标记 `/chat` 为废弃
- ⚠️ 添加废弃警告到响应头
- ⚠️ 继续支持旧接口

### 阶段3: 完全移除旧接口

**时间**: 3-6个月后

- ❌ 移除 `/chat` 接口（或仅保留基础对话功能）
- ❌ 移除 `quick-recommend` 接口（用 `/recommendations` 替代）

---

## 📊 实施优先级

**重要更新**: 根据AI科学家和架构师评审意见，调整实施优先级

### P0 - 立即实施（核心功能 + 基础设施）

1. ✅ **基础设施**
   - 任务服务实现
   - Redis缓存集成
   - 消息队列集成
   - 错误处理和追踪

2. ✅ **会话管理接口**
   - `POST /v2/sessions` - 创建会话
   - `GET /v2/sessions/:sessionId` - 获取会话状态
   - `DELETE /v2/sessions/:sessionId` - 删除会话

3. ✅ **对话接口（主要入口）**
   - `POST /v2/chat` - 智能对话（AI增强，支持智能路由）

4. ✅ **推荐接口**
   - `GET /v2/recommendations` - 获取目的地推荐（改为GET，支持自然语言）

5. ✅ **方案生成接口**
   - `POST /v2/plans/generate` - 生成方案（同步，支持自然语言描述）
   - `POST /v2/plans/generate-async` - 生成方案（异步）

### P1 - 短期实施（重要功能 + AI增强）

4. ✅ **方案对比接口**
   - `GET /v2/plans/compare` - 对比方案（改为GET）

5. ✅ **方案优化接口**
   - `POST /v2/plans/:planId/optimize` - 优化方案
   - `POST /v2/plans/:planId/confirm` - 确认方案

6. ✅ **行程操作接口**
   - `POST /v2/trips/:tripId/optimize` - 优化已创建行程
   - `POST /v2/trips/:tripId/refine` - 细化行程

7. ✅ **AI能力增强**
   - 推荐算法增强（隐式偏好学习）
   - 方案生成AI增强（解释和优化建议）
   - 意图识别优化
   - 智能路由实现

### P2 - 中期实施（增强功能）

8. ✅ **对话历史接口**
   - `GET /v2/sessions/:sessionId/history` - 获取对话历史

9. ✅ **优化建议接口**
   - `GET /v2/trips/:tripId/suggestions` - 获取优化建议

10. ✅ **性能优化**
    - 缓存优化
    - 限流优化
    - 数据库优化

11. ✅ **用户偏好迁移**
    - 迁移到 `/api/users/:userId/preferences`

12. ✅ **扩展功能**
    - 多模态支持（图片、语音输入）
    - 流式响应支持
    - 插件化架构

---

## 📈 预期收益

### 开发效率

- ✅ **前端开发**: 接口调用更直观，减少50%的集成时间
- ✅ **后端开发**: 接口职责清晰，减少30%的维护成本
- ✅ **测试**: 接口测试更简单，提升测试覆盖率

### 用户体验

- ✅ **AI体验**: 对话接口提供最佳AI体验，自然语言交互
- ✅ **响应速度**: 异步接口支持，避免长时间等待
- ✅ **功能明确**: 每个功能有专门接口，用户操作更清晰
- ✅ **智能路由**: 自动路由到最合适的接口，提升效率
- ✅ **错误处理**: 接口级别的错误处理，错误信息更准确

### 业务扩展

- ✅ **新功能**: 易于添加新接口，不影响现有功能
- ✅ **监控分析**: 接口级别的监控，便于分析使用情况
- ✅ **限流控制**: 不同接口可以设置不同的限流策略
- ✅ **AI能力**: 所有接口都支持AI增强，提升智能化水平

---

## ⚠️ 注意事项

1. **向后兼容**: 保留现有 `/chat` 接口，确保平滑迁移
2. **文档更新**: 及时更新 API 文档和使用示例
3. **监控告警**: 监控新接口的使用情况和错误率
4. **用户沟通**: 提前通知前端团队接口变更计划

---

---

## 📝 设计变更记录

### v1.1 (2026-02-08) - 根据评审意见更新

**变更内容**:
- ✅ 重新定位对话接口为主要入口（AI优先）
- ✅ 推荐接口改为GET方法（支持自然语言参数）
- ✅ 对比接口改为GET方法
- ✅ 所有接口支持AI增强（自然语言参数、解释生成等）
- ✅ 更新实施优先级（增加基础设施和AI增强）

**评审依据**:
- [API_REDESIGN_REVIEW_AI_SCIENTIST.md](./API_REDESIGN_REVIEW_AI_SCIENTIST.md)
- [API_REDESIGN_REVIEW_ARCHITECT.md](./API_REDESIGN_REVIEW_ARCHITECT.md)
- [API_REDESIGN_REVIEW_SUMMARY.md](./API_REDESIGN_REVIEW_SUMMARY.md)

---

**文档维护**: 产品经理团队  
**最后更新**: 2026-02-08  
**下次审查**: 实施完成后
