# Context API 接口文档

## 概述

Context API 提供了 TripNARA 上下文编译器的 HTTP 接口，用于构建、压缩、投影和管理上下文包（Context Package）。

**Base URL**: `/context`

**认证**: 当前所有接口均为公开接口（`@Public()`），生产环境可能需要添加认证。

**响应格式**: 所有接口统一使用以下响应格式：

```typescript
{
  success: boolean;
  data?: T;           // 成功时返回数据
  error?: {           // 失败时返回错误信息
    code: string;
    message: string;
    details?: Record<string, any>;
  }
}
```

---

## 1. 构建 Context Package

### 接口信息

- **URL**: `POST /context/build`
- **描述**: 根据 tripId、phase、agent、userQuery 构建 Context Package
- **功能**: 
  - 自动调用相关 skills（countryPack.getBlocks, plan.selectSlices 等）
  - 处理 Token 预算和压缩
  - 支持缓存（Redis + 内存缓存）

### 请求参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| tripId | string | 否 | - | Trip ID |
| userId | string | 否 | - | 当前用户 ID；`includePrivate: true` 时注入私密愿望与领域负责人约束块所必需 |
| phase | string | 是 | - | 规划阶段（如：`planning`, `execution`, `review`） |
| agent | string | 是 | - | 当前 Agent（如：`PLANNER`, `GATEKEEPER`, `CORE_DECISION`） |
| userQuery | string | 是 | - | 用户请求文本 |
| tokenBudget | number | 否 | 3600 | Token 预算（100-100000） |
| includePrivate | boolean | 否 | false | 是否包含私有块 |
| requiredTopics | string[] | 否 | [] | 需要包含的主题块（如：`["VISA", "ROAD_RULES", "SAFETY"]`） |
| excludeTopics | string[] | 否 | [] | 需要排除的主题块 |
| useCache | boolean | 否 | true | 是否使用缓存 |

### 请求示例

```json
{
  "tripId": "trip-123",
  "userId": "user-456",
  "phase": "planning",
  "agent": "PLANNER",
  "userQuery": "帮我规划冰岛7天行程",
  "tokenBudget": 3600,
  "includePrivate": true,
  "requiredTopics": ["VISA", "ROAD_RULES", "SAFETY"],
  "useCache": true
}
```

### 响应示例

**成功响应** (200 OK):

```json
{
  "success": true,
  "data": {
    "contextPackage": {
      "id": "ctx_20250120_123456",
      "tripId": "trip-123",
      "phase": "planning",
      "agent": "PLANNER",
      "userQuery": "帮我规划冰岛7天行程",
      "blocks": [
        {
          "key": "world_model_summary",
          "type": "WORLD_MODEL",
          "text": "冰岛7天自驾行程，包含黄金圈、南岸、冰川等...",
          "priority": 90,
          "visibility": "public",
          "provenance": {
            "source": "skill",
            "identifier": "world.buildContext",
            "timestamp": "2025-01-20T12:34:56Z"
          },
          "estimatedTokens": 150
        },
        {
          "key": "visa_requirements",
          "type": "COUNTRY_VISA",
          "text": "中国公民前往冰岛需要申根签证...",
          "priority": 85,
          "visibility": "public",
          "provenance": {
            "source": "pack",
            "identifier": "iceland-pack",
            "timestamp": "2025-01-20T12:34:56Z"
          },
          "estimatedTokens": 80
        }
      ],
      "totalTokens": 3200,
      "tokenBudget": 3600,
      "compressed": false,
      "createdAt": "2025-01-20T12:34:56Z",
      "metadata": {
        "skillsCalled": ["countryPack.getBlocks", "plan.selectSlices"],
        "cacheHit": false
      }
    }
  }
}
```

**错误响应** (400/500):

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "phase is required"
  }
}
```

### Block 类型说明

| Block Type | 说明 |
|------------|------|
| WORLD_MODEL | 世界模型摘要 |
| COUNTRY_VISA | 签证/证件要求 |
| COUNTRY_ROAD_RULES | 道路规则 |
| COUNTRY_SAFETY | 安全信息 |
| COUNTRY_WEATHER | 天气窗口 |
| ABU_RULES | Abu 的硬规则 |
| DRDRE_RULES | Dr.Dre 的节奏规则 |
| NEPTUNE_RULES | Neptune 的哲学规则 |
| PLAN_SUMMARY | 计划摘要 |
| PLAN_DAY | 某天的计划片段 |
| DECISION_LOG | 决策日志摘要 |
| USER_PROFILE | 用户画像 |
| CONSTRAINTS | 约束条件 |

---

## 2. 压缩 Context Package

### 接口信息

- **URL**: `POST /context/compress`
- **描述**: 压缩 Context Package 中的 blocks，使其符合 Token 预算
- **压缩策略**:
  - `aggressive`: 只保留硬门槛和关键决策点
  - `conservative`: 尽量保留，只做摘要
  - `balanced`: 保留关键内容，摘要其他（默认）

### 请求参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| blocks | ContextBlock[] | 是 | - | 需要压缩的块列表 |
| tokenBudget | number | 是 | - | Token 预算（100-100000） |
| strategy | string | 否 | `balanced` | 压缩策略：`aggressive` / `conservative` / `balanced` |
| preserveKeys | string[] | 否 | [] | 需要保留的关键块 key（不会被移除） |

### 请求示例

```json
{
  "blocks": [
    {
      "key": "block-1",
      "type": "WORLD_MODEL",
      "text": "很长的文本内容...",
      "priority": 90,
      "visibility": "public",
      "estimatedTokens": 500
    }
  ],
  "tokenBudget": 2000,
  "strategy": "balanced",
  "preserveKeys": ["block-1"]
}
```

### 响应示例

**成功响应** (200 OK):

```json
{
  "success": true,
  "data": {
    "compressedBlocks": [
      {
        "key": "block-1",
        "type": "WORLD_MODEL",
        "text": "摘要后的文本...",
        "priority": 90,
        "visibility": "public",
        "estimatedTokens": 200
      }
    ],
    "stats": {
      "originalBlocks": 10,
      "compressedBlocks": 8,
      "originalTokens": 5000,
      "compressedTokens": 1950,
      "reductionRatio": 0.61,
      "removedKeys": ["block-3", "block-7"]
    }
  }
}
```

---

## 3. 投影状态

### 接口信息

- **URL**: `POST /context/project-state`
- **描述**: 将全量 State（TripState 或 LangGraphState）投影为 Public/Private 两部分
- **用途**: 
  - LangGraph 节点中使用，确保 prompt 只包含必要信息
  - 保护用户隐私和内部计算细节

### 请求参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| state | object | 是 | - | TripState 或 LangGraphState 对象 |
| includeFullState | boolean | 否 | false | 是否包含完整状态 |
| decisionLogLimit | number | 否 | 5 | 决策日志保留数量（1-100） |
| rejectionLogLimit | number | 否 | 3 | 拒绝日志保留数量（1-50） |
| tokenBudget | number | 否 | - | Token 预算（用于自动裁剪） |

### 请求示例

```json
{
  "state": {
    "user_intent": "规划冰岛7天行程",
    "world_model": { ... },
    "plan": { ... },
    "decision_log": [ ... ]
  },
  "decisionLogLimit": 5,
  "tokenBudget": 3600
}
```

### 响应示例

**成功响应** (200 OK):

```json
{
  "success": true,
  "data": {
    "projection": {
      "public": {
        "user_intent": "规划冰岛7天行程",
        "world_summary": {
          "countryCode": "IS",
          "season": "summer"
        },
        "planning_phase": "planning",
        "decisionLogSummary": [
          {
            "agent": "PLANNER",
            "action": "generate_skeleton",
            "reasonCode": "SUCCESS",
            "explanation": "已生成7天行程骨架",
            "timestamp": "2025-01-20T12:34:56Z"
          }
        ],
        "planSummary": {
          "totalDays": 7,
          "totalSegments": 5,
          "keyHighlights": ["黄金圈", "南岸", "冰川"]
        }
      },
      "private": {
        "fullState": { ... },
        "toolRawOutputs": {
          "poi_search": "ref:/artifacts/poi_search_123.json"
        },
        "debugLogs": ["ref:/artifacts/debug_123.log"],
        "longLists": {
          "pois": "ref:/artifacts/pois_123.json"
        }
      },
      "metadata": {
        "projectedAt": "2025-01-20T12:34:56Z",
        "tokenCount": 3200,
        "truncated": false
      }
    }
  }
}
```

---

## 4. 写入回写

### 接口信息

- **URL**: `POST /context/write-back`
- **描述**: 保存节点的 scratchpad、decisionLogDelta、artifactsRefs
- **用途**: 
  - LangGraph 节点结束时调用
  - 保存中间结果和决策日志增量
  - 存储 artifacts 引用

### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| tripRunId | string | 是 | Trip Run ID |
| attemptNumber | number | 是 | 尝试次数（>= 1） |
| scratchpad | object | 是 | Scratchpad 内容 |
| scratchpad.planOutline | string | 否 | 计划大纲 |
| scratchpad.openQuestions | string[] | 否 | 开放问题列表 |
| scratchpad.constraintsAssumed | string[] | 否 | 假设的约束条件 |
| scratchpad.nextActions | string[] | 否 | 下一步行动列表 |
| scratchpad.failureNotes | string | 否 | 失败备注 |
| decisionLogDelta | any[] | 否 | 决策日志增量 |
| artifactsRefs | object | 否 | Artifacts 引用（key-value 映射） |

### 请求示例

```json
{
  "tripRunId": "run-123",
  "attemptNumber": 1,
  "scratchpad": {
    "planOutline": "已完成的计划大纲...",
    "openQuestions": ["是否需要租车？", "预算范围？"],
    "nextActions": ["decision.abuCheck", "decision.drdrePace"],
    "failureNotes": "某些POI不可用"
  },
  "decisionLogDelta": [
    {
      "agent": "PLANNER",
      "action": "generate_skeleton",
      "timestamp": "2025-01-20T12:34:56Z"
    }
  ],
  "artifactsRefs": {
    "poi_search": "/artifacts/poi_search_123.json",
    "route_plan": "/artifacts/route_plan_123.json"
  }
}
```

### 响应示例

**成功响应** (200 OK):

```json
{
  "success": true,
  "data": {
    "message": "Write back 成功"
  }
}
```

---

## 5. 获取 Context 指标

### 接口信息

- **URL**: `GET /context/metrics`
- **描述**: 获取 Context Package 的质量和性能指标
- **指标类型**:
  - Token 使用、压缩率、命中率
  - 块类型分布、优先级分布
  - 缓存命中率、构建耗时
  - 质量分布（EXCELLENT/GOOD/FAIR/POOR）

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| tripId | string | 否 | 按 Trip ID 过滤 |
| phase | string | 否 | 按规划阶段过滤 |
| agent | string | 否 | 按 Agent 过滤 |
| startTime | string | 否 | 开始时间（ISO 8601） |
| endTime | string | 否 | 结束时间（ISO 8601） |
| limit | number | 否 | 返回最近 N 条记录（1-100，用于 getRecent） |

### 请求示例

```bash
GET /context/metrics?tripId=trip-123&phase=planning&limit=10
```

### 响应示例

**成功响应** (200 OK):

```json
{
  "success": true,
  "data": {
    "summary": {
      "timeRange": {
        "start": "2025-01-20T00:00:00Z",
        "end": "2025-01-20T23:59:59Z"
      },
      "totalRecords": 50,
      "avgTokens": 3200,
      "avgCompressionRate": 0.15,
      "avgHitRate": 0.85,
      "avgNoiseRate": 0.12,
      "cacheHitRate": 0.65,
      "avgBuildTimeMs": 450,
      "qualityDistribution": {
        "EXCELLENT": 20,
        "GOOD": 25,
        "FAIR": 4,
        "POOR": 1
      },
      "topBlockTypes": [
        { "type": "WORLD_MODEL", "count": 50 },
        { "type": "COUNTRY_VISA", "count": 45 },
        { "type": "PLAN_SUMMARY", "count": 40 }
      ]
    },
    "recent": [
      {
        "id": "metrics_123",
        "tripId": "trip-123",
        "phase": "planning",
        "agent": "PLANNER",
        "timestamp": "2025-01-20T12:34:56Z",
        "tokens": {
          "total": 3200,
          "budget": 3600,
          "overBudget": false,
          "overBudgetRate": 0.89
        },
        "blocks": {
          "total": 12,
          "public": 10,
          "private": 2,
          "compressed": false
        },
        "quality": {
          "hitRate": 0.85,
          "noiseRate": 0.12,
          "relevanceScore": 0.92,
          "quality": "EXCELLENT"
        },
        "performance": {
          "buildTimeMs": 450,
          "cacheHit": true,
          "skillsCalled": ["countryPack.getBlocks", "plan.selectSlices"]
        }
      }
    ]
  }
}
```

---

## 错误码说明

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| VALIDATION_ERROR | 400 | 请求参数验证失败 |
| NOT_FOUND | 404 | 资源未找到 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "phase is required",
    "details": {
      "field": "phase",
      "constraint": "isNotEmpty"
    }
  }
}
```

---

## 使用场景和最佳实践

### 1. 构建 Context Package

**典型流程**:
1. 前端调用 `/context/build` 构建 Context Package
2. 将返回的 `contextPackage.blocks` 用于构建 LLM prompt
3. 根据 `totalTokens` 判断是否需要压缩

**示例代码** (TypeScript):

```typescript
async function buildContext(tripId: string, userQuery: string) {
  const response = await fetch('/context/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripId,
      phase: 'planning',
      agent: 'PLANNER',
      userQuery,
      tokenBudget: 3600,
      requiredTopics: ['VISA', 'ROAD_RULES', 'SAFETY'],
    }),
  });

  const result = await response.json();
  if (result.success) {
    return result.data.contextPackage;
  } else {
    throw new Error(result.error.message);
  }
}
```

### 2. 压缩 Context

**何时使用**:
- Context Package 的 `totalTokens` 超过 `tokenBudget`
- 需要减少 Token 消耗时

**示例代码**:

```typescript
async function compressContext(blocks: ContextBlock[], tokenBudget: number) {
  const response = await fetch('/context/compress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks,
      tokenBudget,
      strategy: 'balanced',
      preserveKeys: ['critical-block-1'], // 保留关键块
    }),
  });

  const result = await response.json();
  if (result.success) {
    return result.data.compressedBlocks;
  } else {
    throw new Error(result.error.message);
  }
}
```

### 3. 监控 Context 质量

**定期调用** `/context/metrics` 监控 Context Package 的质量：

```typescript
async function getContextMetrics(tripId: string) {
  const response = await fetch(
    `/context/metrics?tripId=${tripId}&limit=10`
  );
  const result = await response.json();
  if (result.success) {
    const { summary, recent } = result.data;
    console.log('平均 Token 使用:', summary.avgTokens);
    console.log('缓存命中率:', summary.cacheHitRate);
    console.log('质量分布:', summary.qualityDistribution);
  }
}
```

---

## 注意事项

1. **缓存策略**: 
   - 默认启用缓存（`useCache: true`）
   - 相同参数的请求在 5 分钟内会返回缓存结果
   - 如需强制刷新，设置 `useCache: false`

2. **Token 预算**:
   - 默认 Token 预算为 3600（60% of 6k）
   - 可根据实际需求调整，建议不超过 6000

3. **Block 优先级**:
   - 优先级范围：0-100
   - 高优先级（>= 80）: 硬规则、关键决策
   - 中优先级（50-79）: 重要信息
   - 低优先级（< 50）: 辅助信息

4. **性能优化**:
   - 使用缓存减少重复构建
   - 合理设置 `requiredTopics` 和 `excludeTopics` 过滤不需要的块
   - 监控指标，及时发现问题

5. **错误处理**:
   - 所有接口都可能返回错误，前端需要处理错误情况
   - 建议使用统一的错误处理中间件

---

## 更新日志

- **2025-01-20**: 初始版本，提供 5 个核心接口

---

## 联系方式

如有问题或建议，请联系后端团队。
