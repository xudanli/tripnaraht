# Context Engine API 文档

> 更新时间: 2026-01-21

本文档描述了 Context Engine 的所有 API 端点，用于构建和管理 Agent 所需的上下文信息。

---

## 目录

- [一、概述](#一概述)
- [二、核心接口](#二核心接口)
  - [2.1 构建 Context Package](#21-构建-context-package)
  - [2.2 压缩 Context](#22-压缩-context)
  - [2.3 获取项目状态](#23-获取项目状态)
  - [2.4 写回数据](#24-写回数据)
  - [2.5 获取 Context 指标](#25-获取-context-指标)
- [三、管理接口](#三管理接口)
- [四、数据模型](#四数据模型)
- [五、使用示例](#五使用示例)

---

## 一、概述

Context Engine 是 TripNARA Agent 架构的核心组件，负责：

1. **上下文构建** - 根据行程、阶段、用户查询等信息，构建 Agent 所需的 Context Package
2. **Token 管理** - 在 Token 预算内优化上下文内容
3. **缓存优化** - 支持 Redis + 内存多级缓存
4. **数据压缩** - 智能压缩上下文以节省 Token

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Service                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  Context Engine                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Builder   │  │  Compressor │  │    Cache    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌───────────┐  ┌───────────┐  ┌───────────┐
│  Skills   │  │  Database │  │   Redis   │
└───────────┘  └───────────┘  └───────────┘
```

---

## 二、核心接口

基础路径: `/api/context`

### 2.1 构建 Context Package

#### POST `/api/context/build`

根据输入参数构建 Context Package。

**请求体:**

```json
{
  "tripId": "trip_xyz789",
  "phase": "INITIAL_PLANNING",
  "agent": "planning-assistant",
  "userQuery": "帮我规划一个东京5天的旅行，预算中等",
  "tokenBudget": 8000,
  "includePrivate": false,
  "requiredTopics": ["destination_info", "user_preferences"],
  "excludeTopics": ["internal_logs"],
  "useCache": true
}
```

**请求参数说明:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程 ID |
| phase | string | 是 | 规划阶段 |
| agent | string | 是 | Agent 类型 |
| userQuery | string | 否 | 用户查询 |
| tokenBudget | number | 否 | Token 预算 (默认 8000) |
| includePrivate | boolean | 否 | 是否包含私有数据 (默认 false) |
| requiredTopics | string[] | 否 | 必须包含的主题 |
| excludeTopics | string[] | 否 | 排除的主题 |
| useCache | boolean | 否 | 是否使用缓存 (默认 true) |
| includeApiDocs | boolean | 否 | 是否包含 API 文档 (默认 false) |
| apiDocCategories | string[] | 否 | API 文档类别 (见下表) |

**API 文档类别 (apiDocCategories):**

| 类别 | 说明 |
|------|------|
| ROLL | ROLL 架构相关 API |
| ADMIN | 后台管理 API |
| CONTEXT | Context Engine API |
| TRAINING | 训练相关 API |
| AGENT | Agent 相关 API |
| TRIPS | 行程相关 API |
| DECISION | 决策相关 API |
| ALL | 所有 API (默认) |

**响应:**

```json
{
  "success": true,
  "data": {
    "contextPackage": {
      "id": "ctx_pkg_001",
      "tripId": "trip_xyz789",
      "phase": "INITIAL_PLANNING",
      "agent": "planning-assistant",
      "blocks": [
        {
          "topic": "destination_info",
          "content": "东京是日本的首都...",
          "tokens": 1200,
          "priority": "high",
          "source": "countryPack.getBlocks"
        },
        {
          "topic": "user_preferences",
          "content": "用户偏好: 预算中等, 文化体验...",
          "tokens": 800,
          "priority": "high",
          "source": "userProfile"
        },
        {
          "topic": "seasonal_info",
          "content": "1月东京天气: 平均气温5-10°C...",
          "tokens": 500,
          "priority": "medium",
          "source": "countryPack.getBlocks"
        }
      ],
      "totalTokens": 4500,
      "tokenBudget": 8000,
      "metadata": {
        "buildDuration": 180,
        "cacheHit": false,
        "compressionApplied": false,
        "skillsInvoked": [
          "countryPack.getBlocks",
          "plan.selectSlices"
        ]
      },
      "createdAt": "2026-01-21T10:00:00Z"
    }
  }
}
```

**错误响应:**

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "tripId is required"
  }
}
```

---

### 2.2 压缩 Context

#### POST `/api/context/compress`

压缩已有的 Context Package 以减少 Token 使用。

**请求体:**

```json
{
  "contextPackage": {
    "blocks": [
      {
        "topic": "destination_info",
        "content": "东京是日本的首都，位于关东地区...(详细内容)",
        "tokens": 2500
      }
    ],
    "totalTokens": 10000
  },
  "targetTokens": 5000,
  "preserveTopics": ["user_preferences"],
  "compressionStrategy": "smart"
}
```

**请求参数说明:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| contextPackage | object | 是 | 原始 Context Package |
| targetTokens | number | 是 | 目标 Token 数量 |
| preserveTopics | string[] | 否 | 保留的主题（不压缩） |
| compressionStrategy | string | 否 | 压缩策略: smart, aggressive, minimal |

**响应:**

```json
{
  "success": true,
  "data": {
    "compressedPackage": {
      "blocks": [
        {
          "topic": "destination_info",
          "content": "东京: 日本首都，关东地区...(压缩后)",
          "tokens": 1200,
          "compressed": true
        }
      ],
      "totalTokens": 4800
    },
    "compressionRatio": 0.52,
    "removedTopics": ["internal_logs"],
    "truncatedTopics": ["destination_info"]
  }
}
```

---

### 2.3 获取项目状态

#### POST `/api/context/project-state`

获取当前行程的项目状态摘要。

**请求体:**

```json
{
  "tripId": "trip_xyz789",
  "includeHistory": true,
  "historyLimit": 10
}
```

**响应:**

```json
{
  "success": true,
  "data": {
    "projectState": {
      "tripId": "trip_xyz789",
      "currentPhase": "REFINEMENT",
      "itinerary": {
        "id": "itin_001",
        "status": "DRAFT",
        "dayCount": 5,
        "activityCount": 15,
        "lastModified": "2026-01-21T09:30:00Z"
      },
      "decisions": {
        "pending": 2,
        "approved": 8,
        "rejected": 1
      },
      "history": [
        {
          "timestamp": "2026-01-21T09:30:00Z",
          "action": "activity_added",
          "details": "Added 'Visit Senso-ji Temple'"
        }
      ],
      "constraints": {
        "budget": { "total": 3000, "used": 1500 },
        "dates": { "start": "2026-03-01", "end": "2026-03-05" }
      }
    }
  }
}
```

---

### 2.4 写回数据

#### POST `/api/context/write-back`

将 Agent 生成的数据写回到系统。

**请求体:**

```json
{
  "tripId": "trip_xyz789",
  "writeType": "itinerary_update",
  "data": {
    "activities": [
      {
        "dayIndex": 0,
        "name": "Visit Tokyo Tower",
        "location": { "lat": 35.6586, "lng": 139.7454 },
        "duration": 120,
        "estimatedCost": 1200
      }
    ]
  },
  "source": "planning-assistant",
  "metadata": {
    "runId": "run_abc123",
    "attemptId": "attempt_001"
  }
}
```

**响应:**

```json
{
  "success": true,
  "data": {
    "writeBackId": "wb_001",
    "status": "committed",
    "affectedRecords": 1,
    "timestamp": "2026-01-21T10:05:00Z"
  }
}
```

---

### 2.5 获取 Context 指标

#### GET `/api/context/metrics`

获取 Context Engine 运行指标。

**查询参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| period | string | 否 | 时间周期: hour, day, week |

**响应:**

```json
{
  "success": true,
  "data": {
    "requests": {
      "total": 1250,
      "successful": 1200,
      "failed": 50
    },
    "latency": {
      "avg": 180,
      "p50": 150,
      "p95": 350,
      "p99": 500
    },
    "cache": {
      "hitRate": 0.72,
      "hits": 900,
      "misses": 350
    },
    "tokens": {
      "total": 5625000,
      "avgPerRequest": 4500,
      "compressionSavings": 1875000
    }
  }
}
```

---

## 三、管理接口

管理接口文档请参见: [`ADMIN_API_DOCUMENTATION.md`](./ADMIN_API_DOCUMENTATION.md#二context-engine-管理接口)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/context/admin/metrics` | GET | 详细监控指标 |
| `/api/context/admin/packages` | GET | Context Package 列表 |
| `/api/context/admin/packages/:id` | GET | Context Package 详情 |
| `/api/context/admin/analytics` | GET | 使用分析 |

---

## 四、数据模型

### Context Package

```typescript
interface ContextPackage {
  id: string;
  tripId: string;
  phase: PlanningPhase;
  agent: string;
  
  blocks: ContextBlock[];
  totalTokens: number;
  tokenBudget: number;
  
  metadata: {
    buildDuration: number;
    cacheHit: boolean;
    compressionApplied: boolean;
    skillsInvoked: string[];
  };
  
  createdAt: Date;
}
```

### Context Block

```typescript
interface ContextBlock {
  topic: string;
  content: string;
  tokens: number;
  priority: 'high' | 'medium' | 'low';
  source: string;
  compressed?: boolean;
}
```

### Planning Phase

```typescript
type PlanningPhase = 
  | 'INITIAL_PLANNING'
  | 'DESTINATION_RESEARCH'
  | 'ITINERARY_GENERATION'
  | 'REFINEMENT'
  | 'FINALIZATION'
  | 'EXECUTION';
```

### Block Type (新增 API 文档类型)

```typescript
type BlockType =
  | 'WORLD_MODEL'        // 世界模型摘要
  | 'COUNTRY_VISA'       // 签证/证件要求
  | 'PLAN_SUMMARY'       // 计划摘要
  | 'DECISION_LOG'       // 决策日志摘要
  | 'USER_PROFILE'       // 用户画像
  | 'CONSTRAINTS'        // 约束条件
  | 'API_DOCUMENTATION'  // API 接口文档 (新增)
  | 'SYSTEM_CAPABILITY'  // 系统能力说明 (新增)
  // ... 更多类型
```

### API Doc Category

```typescript
type ApiDocCategory =
  | 'ROLL'              // ROLL 架构 API
  | 'ADMIN'             // 后台管理 API
  | 'CONTEXT'           // Context Engine API
  | 'TRAINING'          // 训练相关 API
  | 'AGENT'             // Agent 相关 API
  | 'TRIPS'             // 行程相关 API
  | 'DECISION'          // 决策相关 API
  | 'ALL';              // 所有 API
```

---

## 五、使用示例

### 5.1 TypeScript 客户端示例

```typescript
import { ContextEngineerService } from './context-engineer.service';

// 构建 Context Package
const contextPackage = await contextEngineer.build({
  tripId: 'trip_xyz789',
  phase: 'INITIAL_PLANNING',
  agent: 'planning-assistant',
  userQuery: '帮我规划东京5天旅行',
  tokenBudget: 8000,
});

console.log(`Built context with ${contextPackage.totalTokens} tokens`);

// 如果超出预算，进行压缩
if (contextPackage.totalTokens > 6000) {
  const compressed = await contextEngineer.compress({
    contextPackage,
    targetTokens: 5000,
    preserveTopics: ['user_preferences'],
  });
  console.log(`Compressed to ${compressed.totalTokens} tokens`);
}
```

### 5.2 cURL 示例

```bash
# 构建 Context Package
curl -X POST http://localhost:3000/api/context/build \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "trip_xyz789",
    "phase": "INITIAL_PLANNING",
    "agent": "planning-assistant",
    "userQuery": "帮我规划东京5天旅行",
    "tokenBudget": 8000
  }'

# 构建包含 API 文档的 Context Package
curl -X POST http://localhost:3000/api/context/build \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "trip_xyz789",
    "phase": "INITIAL_PLANNING",
    "agent": "planning-assistant",
    "userQuery": "如何调用 ROLL API?",
    "tokenBudget": 10000,
    "includeApiDocs": true,
    "apiDocCategories": ["ROLL", "CONTEXT"]
  }'

# 获取指标
curl http://localhost:3000/api/context/metrics?period=day
```

### 5.3 Agent 集成示例

```typescript
// 在 Agent Service 中使用
async handleUserQuery(tripId: string, query: string) {
  // 1. 构建上下文
  const context = await this.contextEngine.build({
    tripId,
    phase: this.getCurrentPhase(tripId),
    agent: 'planning-assistant',
    userQuery: query,
    tokenBudget: 8000,
  });
  
  // 2. 调用 LLM
  const response = await this.llmService.chat({
    systemPrompt: this.buildSystemPrompt(context),
    userMessage: query,
  });
  
  // 3. 写回结果
  if (response.itineraryChanges) {
    await this.contextEngine.writeBack({
      tripId,
      writeType: 'itinerary_update',
      data: response.itineraryChanges,
      source: 'planning-assistant',
    });
  }
  
  return response;
}
```

---

## 错误码说明

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| MISSING_TRIP_ID | 400 | 缺少 tripId 参数 |
| INVALID_PHASE | 400 | 无效的规划阶段 |
| TRIP_NOT_FOUND | 404 | 行程不存在 |
| TOKEN_BUDGET_EXCEEDED | 400 | 无法在预算内构建上下文 |
| COMPRESSION_FAILED | 500 | 压缩失败 |
| CACHE_ERROR | 500 | 缓存操作失败 |

---

## 配置参数

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| CONTEXT_DEFAULT_TOKEN_BUDGET | 8000 | 默认 Token 预算 |
| CONTEXT_CACHE_TTL | 3600 | 缓存 TTL (秒) |
| CONTEXT_MAX_BLOCKS | 50 | 最大 Block 数量 |
| CONTEXT_COMPRESSION_THRESHOLD | 0.9 | 触发压缩的阈值 |

---

*文档由 rl-infra 团队维护*
