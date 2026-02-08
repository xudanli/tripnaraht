# 规划智能体接口重新设计 - 测试用例

**文档版本**: 1.0  
**设计日期**: 2026-02-08  
**关联文档**: 
- [API_REDESIGN_PRODUCT_MANAGER.md](./API_REDESIGN_PRODUCT_MANAGER.md)
- [API_REDESIGN_DTO_DEFINITIONS.md](./API_REDESIGN_DTO_DEFINITIONS.md)
- [API_REDESIGN_ERROR_HANDLING.md](./API_REDESIGN_ERROR_HANDLING.md)

---

## 📋 目录

- [测试策略](#测试策略)
- [会话管理测试用例](#会话管理测试用例)
- [业务操作测试用例](#业务操作测试用例)
- [对话接口测试用例](#对话接口测试用例)
- [行程操作测试用例](#行程操作测试用例)
- [错误场景测试用例](#错误场景测试用例)
- [性能测试用例](#性能测试用例)

---

## 🎯 测试策略

### 测试类型

1. **单元测试**: 测试单个接口的功能
2. **集成测试**: 测试多个接口的协作
3. **端到端测试**: 测试完整业务流程
4. **性能测试**: 测试接口性能和并发能力
5. **错误测试**: 测试错误处理和边界情况

### 测试工具

- **API 测试**: Postman / Insomnia / curl
- **自动化测试**: Jest / Mocha / Supertest
- **性能测试**: Apache Bench / k6 / Artillery

---

## 📦 会话管理测试用例

### TC-SESSION-001: 创建会话（基本）

**测试目标**: 验证创建会话的基本功能

**前置条件**: 无

**测试步骤**:
1. 发送 POST 请求到 `/api/agent/planning-assistant/v2/sessions`
2. 请求体: `{ "userId": "user_123" }`

**预期结果**:
- HTTP 状态码: 201
- 响应包含 `sessionId`
- 响应包含 `createdAt` 和 `expiresAt`
- `expiresAt` 比 `createdAt` 晚24小时

**测试数据**:
```json
{
  "userId": "user_123"
}
```

**预期响应**:
```json
{
  "sessionId": "session_789",
  "userId": "user_123",
  "createdAt": "2026-02-08T10:00:00Z",
  "expiresAt": "2026-02-09T10:00:00Z"
}
```

---

### TC-SESSION-002: 创建会话（带初始上下文）

**测试目标**: 验证创建会话时支持初始上下文

**前置条件**: 无

**测试步骤**:
1. 发送 POST 请求到 `/api/agent/planning-assistant/v2/sessions`
2. 请求体包含 `context` 字段

**预期结果**:
- HTTP 状态码: 201
- 响应包含 `context` 信息

**测试数据**:
```json
{
  "userId": "user_123",
  "context": {
    "destination": "Iceland",
    "preferences": {
      "budget": { "total": 5000, "currency": "USD" }
    }
  }
}
```

---

### TC-SESSION-003: 获取会话状态

**测试目标**: 验证获取会话状态功能

**前置条件**: 已创建会话

**测试步骤**:
1. 创建会话，获取 `sessionId`
2. 发送 GET 请求到 `/api/agent/planning-assistant/v2/sessions/:sessionId`

**预期结果**:
- HTTP 状态码: 200
- 响应包含完整的会话状态信息

**测试数据**:
```
sessionId: session_789
```

---

### TC-SESSION-004: 获取不存在的会话

**测试目标**: 验证错误处理

**前置条件**: 无

**测试步骤**:
1. 发送 GET 请求到 `/api/agent/planning-assistant/v2/sessions/invalid_session_id`

**预期结果**:
- HTTP 状态码: 404
- 错误码: `2001`
- 错误消息: "会话不存在"

**预期响应**:
```json
{
  "success": false,
  "errorCode": "2001",
  "message": "Session not found",
  "messageCN": "会话不存在",
  "details": {
    "sessionId": "invalid_session_id"
  }
}
```

---

### TC-SESSION-005: 删除会话

**测试目标**: 验证删除会话功能

**前置条件**: 已创建会话

**测试步骤**:
1. 创建会话，获取 `sessionId`
2. 发送 DELETE 请求到 `/api/agent/planning-assistant/v2/sessions/:sessionId`
3. 再次获取会话状态

**预期结果**:
- DELETE 请求返回 200
- 再次获取会话状态返回 404

---

### TC-SESSION-006: 获取对话历史

**测试目标**: 验证获取对话历史功能

**前置条件**: 已创建会话并发送多条消息

**测试步骤**:
1. 创建会话
2. 发送多条消息
3. 发送 GET 请求到 `/api/agent/planning-assistant/v2/sessions/:sessionId/history`

**预期结果**:
- HTTP 状态码: 200
- 响应包含消息列表
- 消息按时间倒序排列

---

## 📦 业务操作测试用例

### TC-RECOMMEND-001: 获取推荐（基本）

**测试目标**: 验证获取推荐的基本功能

**前置条件**: 无

**测试步骤**:
1. 发送 POST 请求到 `/api/agent/planning-assistant/v2/recommendations`
2. 请求体包含基本偏好

**预期结果**:
- HTTP 状态码: 200
- 响应包含推荐列表
- 推荐数量在 1-10 之间（默认 limit=10）

**测试数据**:
```json
{
  "preferences": {
    "budget": { "total": 5000, "currency": "USD" },
    "travelers": { "adults": 2 }
  },
  "limit": 10
}
```

**预期响应**:
```json
{
  "recommendations": [
    {
      "id": "dest_1",
      "name": "Iceland",
      "nameCN": "冰岛",
      "matchScore": 95,
      ...
    }
  ],
  "generatedAt": "2026-02-08T10:00:00Z"
}
```

---

### TC-RECOMMEND-002: 获取推荐（带过滤条件）

**测试目标**: 验证过滤条件功能

**前置条件**: 无

**测试步骤**:
1. 发送 POST 请求，包含 `filters.countryCode`

**预期结果**:
- 所有推荐的国家代码匹配过滤条件

**测试数据**:
```json
{
  "filters": {
    "countryCode": "IS"
  }
}
```

---

### TC-RECOMMEND-003: 获取推荐（limit 超出范围）

**测试目标**: 验证参数验证

**前置条件**: 无

**测试步骤**:
1. 发送 POST 请求，`limit` 设置为 100

**预期结果**:
- HTTP 状态码: 400
- 错误码: `1001`
- 错误消息: "limit 参数无效"

---

### TC-PLAN-001: 生成方案（同步）

**测试目标**: 验证同步生成方案功能

**前置条件**: 无

**测试步骤**:
1. 发送 POST 请求到 `/api/agent/planning-assistant/v2/plans/generate`
2. 请求体包含目的地和偏好

**预期结果**:
- HTTP 状态码: 200
- 响应包含方案列表
- 方案数量符合 `options.count` 参数

**测试数据**:
```json
{
  "destination": "Iceland",
  "preferences": {
    "budget": { "total": 5000, "currency": "USD" },
    "travelers": { "adults": 2 },
    "dateRange": {
      "startDate": "2026-06-01",
      "endDate": "2026-06-10"
    }
  },
  "options": {
    "count": 3,
    "includeBudget": true,
    "includePersonas": true
  }
}
```

---

### TC-PLAN-002: 生成方案（异步）

**测试目标**: 验证异步生成方案功能

**前置条件**: 无

**测试步骤**:
1. 发送 POST 请求到 `/api/agent/planning-assistant/v2/plans/generate-async`
2. 获取 `taskId`
3. 轮询查询任务状态
4. 等待任务完成

**预期结果**:
- 创建任务返回 202
- 任务状态从 PENDING → PROCESSING → COMPLETED
- 完成后返回方案列表

**测试数据**:
```json
{
  "destination": "Iceland",
  "preferences": { ... }
}
```

---

### TC-PLAN-003: 生成方案（缺少目的地）

**测试目标**: 验证参数验证

**前置条件**: 无

**测试步骤**:
1. 发送 POST 请求，不包含 `destination` 字段

**预期结果**:
- HTTP 状态码: 400
- 错误码: `3001`
- 错误消息: "目的地必填"

---

### TC-PLAN-004: 对比方案

**测试目标**: 验证方案对比功能

**前置条件**: 已有多个方案ID

**测试步骤**:
1. 发送 POST 请求到 `/api/agent/planning-assistant/v2/plans/compare`
2. 请求体包含至少2个方案ID

**预期结果**:
- HTTP 状态码: 200
- 响应包含对比结果
- 包含差异列表和推荐

**测试数据**:
```json
{
  "planIds": ["plan_1", "plan_2", "plan_3"],
  "compareFields": ["budget", "duration", "pace"]
}
```

---

### TC-PLAN-005: 对比方案（方案数量不足）

**测试目标**: 验证参数验证

**前置条件**: 无

**测试步骤**:
1. 发送 POST 请求，只包含1个方案ID

**预期结果**:
- HTTP 状态码: 400
- 错误码: `3003`
- 错误消息: "至少需要2个方案进行对比"

---

### TC-PLAN-006: 优化方案

**测试目标**: 验证方案优化功能

**前置条件**: 已有方案ID

**测试步骤**:
1. 发送 POST 请求到 `/api/agent/planning-assistant/v2/plans/:planId/optimize`
2. 请求体包含优化类型和要求

**预期结果**:
- HTTP 状态码: 200
- 响应包含优化后的方案
- 包含变更说明

**测试数据**:
```json
{
  "optimizationType": "pace",
  "requirements": {
    "slowerPace": true
  }
}
```

---

### TC-PLAN-007: 确认方案

**测试目标**: 验证方案确认功能

**前置条件**: 已有方案ID

**测试步骤**:
1. 发送 POST 请求到 `/api/agent/planning-assistant/v2/plans/:planId/confirm`

**预期结果**:
- HTTP 状态码: 200
- 响应包含 `tripId`
- 行程已创建

---

## 📦 对话接口测试用例

### TC-CHAT-001: 智能对话（基本）

**测试目标**: 验证智能对话功能

**前置条件**: 已创建会话

**测试步骤**:
1. 发送 POST 请求到 `/api/agent/planning-assistant/v2/chat`
2. 请求体包含消息内容

**预期结果**:
- HTTP 状态码: 200
- 响应包含回复消息
- 响应包含当前阶段

**测试数据**:
```json
{
  "sessionId": "session_789",
  "message": "我想去冰岛旅行",
  "language": "zh"
}
```

---

## 📦 行程操作测试用例

### TC-TRIP-001: 优化已创建行程

**测试目标**: 验证优化已创建行程功能

**前置条件**: 已有行程ID

**测试步骤**:
1. 发送 POST 请求到 `/api/agent/planning-assistant/v2/trips/:tripId/optimize`
2. 请求体包含优化类型

**预期结果**:
- HTTP 状态码: 200
- 响应包含优化后的行程ID
- 响应包含变更说明

**测试数据**:
```json
{
  "optimizationType": "pace",
  "requirements": {
    "slowerPace": true
  }
}
```

---

### TC-TRIP-002: 优化不存在的行程

**测试目标**: 验证错误处理

**前置条件**: 无

**测试步骤**:
1. 发送 POST 请求，使用不存在的行程ID

**预期结果**:
- HTTP 状态码: 404
- 错误码: `3006`
- 错误消息: "行程不存在"

---

### TC-TRIP-003: 细化行程

**测试目标**: 验证细化行程功能

**前置条件**: 已有行程ID

**测试步骤**:
1. 发送 POST 请求到 `/api/agent/planning-assistant/v2/trips/:tripId/refine`
2. 请求体指定要细化的天数

**预期结果**:
- HTTP 状态码: 200
- 响应包含细化结果
- 包含餐厅、交通、活动等详细信息

---

### TC-TRIP-004: 获取优化建议

**测试目标**: 验证获取优化建议功能

**前置条件**: 已有行程ID

**测试步骤**:
1. 发送 GET 请求到 `/api/agent/planning-assistant/v2/trips/:tripId/suggestions`

**预期结果**:
- HTTP 状态码: 200
- 响应包含建议列表
- 每个建议包含类型、优先级、操作建议

---

## 🔴 错误场景测试用例

### TC-ERROR-001: 会话过期

**测试目标**: 验证会话过期处理

**前置条件**: 创建会话后等待过期（或手动设置过期时间）

**测试步骤**:
1. 获取已过期的会话状态

**预期结果**:
- HTTP 状态码: 410
- 错误码: `2002`
- 错误消息: "会话已过期"

---

### TC-ERROR-002: 请求频率过高

**测试目标**: 验证限流功能

**前置条件**: 无

**测试步骤**:
1. 快速发送多个请求（超过限流阈值）

**预期结果**:
- HTTP 状态码: 429
- 错误码: `1007`
- 错误消息: "请求频率过高"

---

### TC-ERROR-003: 服务器错误

**测试目标**: 验证服务器错误处理

**前置条件**: 模拟服务器错误（如数据库连接失败）

**测试步骤**:
1. 发送正常请求，触发服务器错误

**预期结果**:
- HTTP 状态码: 500
- 错误码: `1008`
- 错误消息: "服务器内部错误"
- 响应包含 `traceId`

---

## ⚡ 性能测试用例

### TC-PERF-001: 推荐接口性能

**测试目标**: 验证推荐接口响应时间

**测试步骤**:
1. 发送100个并发请求到推荐接口
2. 记录响应时间

**预期结果**:
- 平均响应时间 < 2秒
- P95 响应时间 < 5秒
- 错误率 < 1%

---

### TC-PERF-002: 方案生成性能

**测试目标**: 验证方案生成接口性能

**测试步骤**:
1. 发送10个并发请求到方案生成接口
2. 记录响应时间

**预期结果**:
- 平均响应时间 < 30秒
- P95 响应时间 < 60秒
- 错误率 < 5%

---

### TC-PERF-003: 异步任务处理能力

**测试目标**: 验证异步任务处理能力

**测试步骤**:
1. 创建100个异步生成任务
2. 监控任务完成情况

**预期结果**:
- 所有任务在5分钟内完成
- 任务失败率 < 5%

---

## 📝 测试脚本示例

### Postman Collection

```json
{
  "info": {
    "name": "Planning Assistant V2 API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Sessions",
      "item": [
        {
          "name": "Create Session",
          "request": {
            "method": "POST",
            "header": [{"key": "Content-Type", "value": "application/json"}],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"userId\": \"user_123\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/agent/planning-assistant/v2/sessions",
              "host": ["{{baseUrl}}"],
              "path": ["api", "agent", "planning-assistant", "v2", "sessions"]
            }
          }
        }
      ]
    }
  ]
}
```

### Jest 测试示例

```typescript
// planning-assistant-v2.api.spec.ts

import { PlanningAssistantV2Client } from './planning-assistant-v2';

describe('Planning Assistant V2 API', () => {
  const client = new PlanningAssistantV2Client();

  describe('Sessions', () => {
    it('should create a session', async () => {
      const session = await client.createSession({
        userId: 'user_123',
      });

      expect(session.sessionId).toBeDefined();
      expect(session.createdAt).toBeDefined();
      expect(session.expiresAt).toBeDefined();
    });

    it('should get session state', async () => {
      const session = await client.createSession({});
      const state = await client.getSessionState(session.sessionId);

      expect(state.sessionId).toBe(session.sessionId);
      expect(state.phase).toBeDefined();
    });
  });

  describe('Recommendations', () => {
    it('should get recommendations', async () => {
      const result = await client.getRecommendations({
        preferences: {
          budget: { total: 5000, currency: 'USD' },
        },
        limit: 10,
      });

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeLessThanOrEqual(10);
    });
  });
});
```

---

## ✅ 测试检查清单

### 功能测试

- [ ] 所有接口基本功能已测试
- [ ] 所有错误场景已测试
- [ ] 边界情况已测试
- [ ] 参数验证已测试

### 性能测试

- [ ] 响应时间符合要求
- [ ] 并发处理能力符合要求
- [ ] 资源使用合理

### 集成测试

- [ ] 接口间协作正常
- [ ] 数据一致性正确
- [ ] 错误传播正确

---

**文档维护**: QA 团队  
**最后更新**: 2026-02-08
