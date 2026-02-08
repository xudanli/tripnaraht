# 规划智能体接口重新设计 - 迁移指南

**文档版本**: 1.0  
**设计日期**: 2026-02-08  
**目标受众**: 前端开发团队  
**关联文档**: 
- [API_REDESIGN_PRODUCT_MANAGER.md](./API_REDESIGN_PRODUCT_MANAGER.md)
- [API_REDESIGN_DTO_DEFINITIONS.md](./API_REDESIGN_DTO_DEFINITIONS.md)

---

## 📋 目录

- [迁移概述](#迁移概述)
- [接口对照表](#接口对照表)
- [迁移步骤](#迁移步骤)
- [代码迁移示例](#代码迁移示例)
- [常见问题](#常见问题)
- [回滚方案](#回滚方案)

---

## 🎯 迁移概述

### 迁移策略

**分阶段迁移**，确保平滑过渡：

1. **阶段1**: 新接口上线，旧接口保留（1-2周）
2. **阶段2**: 前端逐步迁移到新接口（2-4周）
3. **阶段3**: 标记旧接口为废弃（1个月后）
4. **阶段4**: 完全移除旧接口（3-6个月后）

### 迁移原则

- ✅ **向后兼容**: 旧接口继续可用，不会立即失效
- ✅ **渐进式迁移**: 可以逐个功能迁移，不需要一次性全部迁移
- ✅ **平滑过渡**: 新旧接口可以并存使用
- ✅ **充分测试**: 每个迁移步骤都要充分测试

---

## 📊 接口对照表

### 会话管理

| 旧接口 | 新接口 | 变更说明 |
|--------|--------|---------|
| `POST /sessions` | `POST /v2/sessions` | 增强：支持初始上下文 |
| `GET /sessions/:sessionId` | `GET /v2/sessions/:sessionId` | 增强：返回更多信息 |
| - | `DELETE /v2/sessions/:sessionId` | 新增：删除会话 |
| - | `GET /v2/sessions/:sessionId/history` | 新增：获取对话历史 |

### 业务操作

| 旧接口 | 新接口 | 变更说明 |
|--------|--------|---------|
| `POST /chat` (推荐) | `POST /v2/recommendations` | 新增：专门的推荐接口 |
| `POST /chat` (生成方案) | `POST /v2/plans/generate` | 新增：同步生成接口 |
| - | `POST /v2/plans/generate-async` | 新增：异步生成接口 |
| - | `GET /v2/plans/generate/:taskId` | 新增：查询任务状态 |
| `POST /chat` (对比) | `POST /v2/plans/compare` | 新增：专门的对比接口 |
| `POST /chat` (优化) | `POST /v2/plans/:planId/optimize` | 新增：优化方案接口 |
| `POST /chat` (确认) | `POST /v2/plans/:planId/confirm` | 新增：确认方案接口 |
| `GET /quick-recommend` | `POST /v2/recommendations` | 替换：使用推荐接口 |

### 对话接口

| 旧接口 | 新接口 | 变更说明 |
|--------|--------|---------|
| `POST /chat` | `POST /v2/chat` | 保留：作为辅助功能 |

### 行程操作

| 旧接口 | 新接口 | 变更说明 |
|--------|--------|---------|
| `POST /chat` (优化行程) | `POST /v2/trips/:tripId/optimize` | 新增：优化已创建行程 |
| - | `POST /v2/trips/:tripId/refine` | 新增：细化行程 |
| - | `GET /v2/trips/:tripId/suggestions` | 新增：获取优化建议 |

---

## 🔄 迁移步骤

### 步骤1: 准备工作（1-2天）

1. **了解新接口**
   - 阅读 [API_REDESIGN_PRODUCT_MANAGER.md](./API_REDESIGN_PRODUCT_MANAGER.md)
   - 阅读 [API_REDESIGN_DTO_DEFINITIONS.md](./API_REDESIGN_DTO_DEFINITIONS.md)
   - 查看 Swagger 文档（新接口上线后）

2. **创建 API 客户端**
   - 创建新的 API 客户端文件（如 `planningAssistantV2.ts`）
   - 保持旧客户端不变（向后兼容）

3. **环境配置**
   - 添加新接口的基础路径配置
   - 添加功能开关（Feature Flag）控制新旧接口切换

### 步骤2: 迁移会话管理（1-2天）

**优先级**: P0

**迁移内容**:
- 创建会话
- 获取会话状态
- 删除会话（新增功能）

**影响范围**: 小

**测试重点**:
- 会话创建和状态查询
- 会话过期处理
- 会话删除功能

### 步骤3: 迁移推荐功能（2-3天）

**优先级**: P0

**迁移内容**:
- 从 `POST /chat` 迁移到 `POST /v2/recommendations`
- 替换 `GET /quick-recommend` 为 `POST /v2/recommendations`

**影响范围**: 中

**测试重点**:
- 推荐结果一致性
- 参数传递正确性
- 错误处理

### 步骤4: 迁移方案生成（3-5天）

**优先级**: P0

**迁移内容**:
- 从 `POST /chat` 迁移到 `POST /v2/plans/generate`
- 实现异步生成（可选，提升用户体验）

**影响范围**: 大

**测试重点**:
- 方案生成结果一致性
- 异步任务状态查询
- 错误处理和重试

### 步骤5: 迁移方案对比和优化（2-3天）

**优先级**: P1

**迁移内容**:
- 方案对比功能
- 方案优化功能
- 方案确认功能

**影响范围**: 中

**测试重点**:
- 对比结果准确性
- 优化效果验证
- 确认流程完整性

### 步骤6: 迁移行程操作（2-3天）

**优先级**: P1

**迁移内容**:
- 优化已创建行程
- 细化行程
- 获取优化建议

**影响范围**: 中

**测试重点**:
- 行程优化效果
- 细化内容完整性
- 建议准确性

### 步骤7: 清理和优化（1-2天）

**优先级**: P2

**迁移内容**:
- 移除旧接口调用代码
- 统一错误处理
- 优化代码结构

**影响范围**: 小

---

## 💻 代码迁移示例

### 示例1: 创建会话

#### 旧代码

```typescript
// 旧接口调用
const response = await fetch('/api/agent/planning-assistant/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user_123' }),
});

const { sessionId } = await response.json();
```

#### 新代码

```typescript
// 新接口调用（支持初始上下文）
const response = await fetch('/api/agent/planning-assistant/v2/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user_123',
    context: {
      destination: 'Iceland',
      preferences: {
        budget: { total: 5000, currency: 'USD' },
        travelers: { adults: 2 },
      },
    },
  }),
});

const data = await response.json();
const { sessionId, createdAt, expiresAt } = data;
```

#### 迁移建议

```typescript
// 使用 API 客户端封装
import { PlanningAssistantV2Client } from '@/api/planning-assistant-v2';

const client = new PlanningAssistantV2Client();

// 创建会话
const session = await client.createSession({
  userId: 'user_123',
  context: {
    destination: 'Iceland',
  },
});

console.log(`会话创建成功: ${session.sessionId}`);
console.log(`过期时间: ${session.expiresAt}`);
```

---

### 示例2: 获取推荐

#### 旧代码（使用 chat 接口）

```typescript
// 旧接口：通过 chat 接口获取推荐
const response = await fetch('/api/agent/planning-assistant/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session_789',
    message: '请给我推荐目的地',
    language: 'zh',
  }),
});

const data = await response.json();
const recommendations = data.recommendations || [];
```

#### 旧代码（使用 quick-recommend）

```typescript
// 旧接口：快速推荐
const response = await fetch(
  '/api/agent/planning-assistant/quick-recommend?budget=5000&travelersCount=2&language=zh'
);

const data = await response.json();
const recommendations = data.recommendations || [];
```

#### 新代码

```typescript
// 新接口：专门的推荐接口
const response = await fetch('/api/agent/planning-assistant/v2/recommendations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session_789',  // 可选
    preferences: {
      budget: { total: 5000, currency: 'USD' },
      travelers: { adults: 2 },
      activities: ['hiking', 'photography'],
    },
    filters: {
      countryCode: 'IS',  // 可选
    },
    limit: 10,
    language: 'zh',
  }),
});

const data = await response.json();
const recommendations = data.recommendations;
```

#### 迁移建议

```typescript
// 使用 API 客户端封装
import { PlanningAssistantV2Client } from '@/api/planning-assistant-v2';

const client = new PlanningAssistantV2Client();

// 获取推荐
const result = await client.getRecommendations({
  sessionId: 'session_789',
  preferences: {
    budget: { total: 5000, currency: 'USD' },
    travelers: { adults: 2 },
  },
  filters: {
    countryCode: 'IS',
  },
  limit: 10,
});

console.log(`推荐了 ${result.recommendations.length} 个目的地`);
```

---

### 示例3: 生成方案

#### 旧代码

```typescript
// 旧接口：通过 chat 接口生成方案
const response = await fetch('/api/agent/planning-assistant/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session_789',
    message: '我想去冰岛，帮我生成方案',
    language: 'zh',
  }),
});

const data = await response.json();
const plans = data.planCandidates || [];

// 需要等待较长时间，用户体验差
```

#### 新代码（同步）

```typescript
// 新接口：同步生成方案
const response = await fetch('/api/agent/planning-assistant/v2/plans/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session_789',
    destination: 'Iceland',
    preferences: {
      budget: { total: 5000, currency: 'USD' },
      travelers: { adults: 2 },
      dateRange: {
        startDate: '2026-06-01',
        endDate: '2026-06-10',
      },
    },
    constraints: {
      maxDays: 10,
    },
    options: {
      count: 3,
      includeBudget: true,
      includePersonas: true,
    },
    language: 'zh',
  }),
});

const data = await response.json();
const plans = data.plans;
```

#### 新代码（异步，推荐）

```typescript
// 新接口：异步生成方案（推荐）
// 1. 创建异步任务
const createResponse = await fetch('/api/agent/planning-assistant/v2/plans/generate-async', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session_789',
    destination: 'Iceland',
    preferences: { ... },
  }),
});

const { taskId, estimatedDuration } = await createResponse.json();

// 2. 轮询查询任务状态
const pollStatus = async () => {
  const statusResponse = await fetch(
    `/api/agent/planning-assistant/v2/plans/generate/${taskId}`
  );
  const status = await statusResponse.json();

  if (status.status === 'COMPLETED') {
    return status.result.plans;
  } else if (status.status === 'FAILED') {
    throw new Error(status.error.message);
  } else {
    // 继续轮询
    await new Promise(resolve => setTimeout(resolve, 2000));
    return pollStatus();
  }
};

const plans = await pollStatus();
```

#### 迁移建议

```typescript
// 使用 API 客户端封装（支持异步）
import { PlanningAssistantV2Client } from '@/api/planning-assistant-v2';

const client = new PlanningAssistantV2Client();

// 异步生成方案（推荐）
const plans = await client.generatePlanAsync({
  sessionId: 'session_789',
  destination: 'Iceland',
  preferences: {
    budget: { total: 5000, currency: 'USD' },
    travelers: { adults: 2 },
  },
  options: {
    count: 3,
    includePersonas: true,
  },
  onProgress: (progress) => {
    console.log(`生成进度: ${progress}%`);
  },
});

console.log(`生成了 ${plans.length} 个方案`);
```

---

### 示例4: 对比方案

#### 旧代码

```typescript
// 旧接口：通过 chat 接口对比方案
const response = await fetch('/api/agent/planning-assistant/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session_789',
    message: '对比一下方案1和方案2',
    language: 'zh',
  }),
});

const data = await response.json();
const comparison = data.comparison;
```

#### 新代码

```typescript
// 新接口：专门的对比接口
const response = await fetch('/api/agent/planning-assistant/v2/plans/compare', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session_789',
    planIds: ['plan_1', 'plan_2', 'plan_3'],
    compareFields: ['budget', 'duration', 'pace', 'activities'],
    language: 'zh',
  }),
});

const data = await response.json();
const { plans, dimensions, differences, recommendation } = data;
```

---

### 示例5: 优化已创建行程

#### 旧代码

```typescript
// 旧接口：通过 chat 接口优化行程
const response = await fetch('/api/agent/planning-assistant/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session_789',
    message: '这个路线太赶了，帮我优化一下',
    language: 'zh',
  }),
});
```

#### 新代码

```typescript
// 新接口：专门的优化接口
const response = await fetch(
  '/api/agent/planning-assistant/v2/trips/trip_456/optimize',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'session_789',
      optimizationType: 'pace',
      requirements: {
        slowerPace: true,
      },
      language: 'zh',
    }),
  }
);

const data = await response.json();
const { optimizedTripId, changes } = data;
```

---

## 🔧 API 客户端封装示例

```typescript
// api/planning-assistant-v2.ts

export class PlanningAssistantV2Client {
  private baseUrl = '/api/agent/planning-assistant/v2';

  /**
   * 创建会话
   */
  async createSession(params: {
    userId?: string;
    context?: {
      tripId?: string;
      destination?: string;
      preferences?: any;
    };
  }) {
    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.messageCN || error.message);
    }

    return response.json();
  }

  /**
   * 获取会话状态
   */
  async getSessionState(sessionId: string) {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.messageCN || error.message);
    }

    return response.json();
  }

  /**
   * 获取推荐
   */
  async getRecommendations(params: {
    sessionId?: string;
    userId?: string;
    preferences?: any;
    filters?: any;
    limit?: number;
    language?: 'en' | 'zh';
  }) {
    const response = await fetch(`${this.baseUrl}/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.messageCN || error.message);
    }

    return response.json();
  }

  /**
   * 异步生成方案
   */
  async generatePlanAsync(params: {
    sessionId?: string;
    userId?: string;
    destination: string;
    preferences?: any;
    constraints?: any;
    options?: any;
    language?: 'en' | 'zh';
    onProgress?: (progress: number) => void;
  }): Promise<any[]> {
    // 1. 创建异步任务
    const createResponse = await fetch(`${this.baseUrl}/plans/generate-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(error.messageCN || error.message);
    }

    const { taskId, estimatedDuration } = await createResponse.json();

    // 2. 轮询查询状态
    return this.pollTaskStatus(taskId, params.onProgress);
  }

  /**
   * 轮询任务状态
   */
  private async pollTaskStatus(
    taskId: string,
    onProgress?: (progress: number) => void
  ): Promise<any[]> {
    const maxAttempts = 60; // 最多轮询60次（2分钟）
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(`${this.baseUrl}/plans/generate/${taskId}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.messageCN || error.message);
      }

      const status = await response.json();

      if (status.status === 'COMPLETED') {
        return status.result.plans;
      } else if (status.status === 'FAILED') {
        throw new Error(status.error?.messageCN || status.error?.message || '任务失败');
      }

      // 更新进度
      if (onProgress && status.progress !== undefined) {
        onProgress(status.progress);
      }

      // 等待2秒后继续轮询
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    throw new Error('任务超时');
  }

  /**
   * 对比方案
   */
  async comparePlans(params: {
    sessionId?: string;
    planIds: string[];
    compareFields?: string[];
    language?: 'en' | 'zh';
  }) {
    const response = await fetch(`${this.baseUrl}/plans/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.messageCN || error.message);
    }

    return response.json();
  }

  /**
   * 优化已创建行程
   */
  async optimizeTrip(params: {
    tripId: string;
    sessionId?: string;
    optimizationType?: 'pace' | 'budget' | 'route' | 'activities';
    requirements?: any;
    language?: 'en' | 'zh';
  }) {
    const response = await fetch(
      `${this.baseUrl}/trips/${params.tripId}/optimize`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: params.sessionId,
          optimizationType: params.optimizationType,
          requirements: params.requirements,
          language: params.language,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.messageCN || error.message);
    }

    return response.json();
  }
}
```

---

## ❓ 常见问题

### Q1: 新旧接口可以同时使用吗？

**A**: 可以。新旧接口会并存一段时间，可以逐步迁移。建议：
- 新功能使用新接口
- 旧功能逐步迁移
- 避免混用（同一功能不要同时使用新旧接口）

### Q2: 如果新接口出错，可以回退到旧接口吗？

**A**: 可以。建议：
- 实现功能开关（Feature Flag）
- 新接口失败时自动降级到旧接口
- 记录降级日志，便于排查问题

### Q3: 异步生成方案如何显示进度？

**A**: 使用轮询方式查询任务状态：
- 每2秒查询一次任务状态
- 根据 `progress` 字段显示进度条
- 任务完成后获取结果

### Q4: 如何处理会话过期？

**A**: 实现会话管理：
- 检查会话的 `expiresAt` 字段
- 过期前自动刷新会话
- 过期后创建新会话并恢复状态（如果可能）

### Q5: 错误处理有什么变化？

**A**: 新接口使用统一的错误响应格式：
- 所有错误都有 `errorCode` 和 `messageCN`
- 客户端可以根据 `errorCode` 进行统一处理
- 参考 [API_REDESIGN_ERROR_HANDLING.md](./API_REDESIGN_ERROR_HANDLING.md)

---

## 🔙 回滚方案

### 如果新接口出现问题

1. **立即回滚**
   - 使用功能开关关闭新接口
   - 前端切换回旧接口
   - 通知用户（如需要）

2. **问题排查**
   - 查看错误日志和 traceId
   - 分析错误原因
   - 修复问题

3. **重新上线**
   - 修复后重新测试
   - 小范围灰度发布
   - 确认无误后全量发布

### 回滚检查清单

- [ ] 功能开关已配置
- [ ] 旧接口代码已保留
- [ ] 回滚流程已测试
- [ ] 监控告警已配置

---

## 📝 迁移检查清单

### 迁移前

- [ ] 已阅读所有相关文档
- [ ] 已创建 API 客户端封装
- [ ] 已配置功能开关
- [ ] 已准备测试环境

### 迁移中

- [ ] 会话管理已迁移
- [ ] 推荐功能已迁移
- [ ] 方案生成已迁移
- [ ] 方案对比已迁移
- [ ] 行程操作已迁移
- [ ] 错误处理已更新
- [ ] 单元测试已通过
- [ ] 集成测试已通过

### 迁移后

- [ ] 旧接口调用已移除
- [ ] 代码已优化
- [ ] 文档已更新
- [ ] 用户反馈已收集

---

**文档维护**: 前端开发团队  
**最后更新**: 2026-02-08
