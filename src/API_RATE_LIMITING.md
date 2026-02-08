# API 限流和配额管理规范

**版本**: 1.0.0  
**最后更新**: 2026-02-08  
**适用范围**: 所有 API 接口

---

## 📋 目录

- [限流策略](#限流策略)
- [配额管理](#配额管理)
- [限流规则](#限流规则)
- [配额查询](#配额查询)
- [超限处理](#超限处理)
- [最佳实践](#最佳实践)

---

## 🎯 限流策略

### 限流目的

1. **保护服务**: 防止恶意请求和 DDoS 攻击
2. **公平使用**: 确保所有用户公平使用资源
3. **成本控制**: 控制 API 调用成本
4. **性能保障**: 保证系统稳定性和响应速度

---

### 限流类型

#### 1. 用户级别限流（User-Level Rate Limiting）

**策略**: 基于用户 ID 或 Token 进行限流

**适用场景**: 
- 用户端 API
- 需要认证的接口

**示例**:
```
用户 user_123: 100 次/分钟
用户 user_456: 100 次/分钟
```

#### 2. IP 级别限流（IP-Level Rate Limiting）

**策略**: 基于客户端 IP 地址进行限流

**适用场景**:
- 公开接口
- 防止恶意请求

**示例**:
```
IP 192.168.1.1: 50 次/分钟
IP 10.0.0.1: 50 次/分钟
```

#### 3. 全局限流（Global Rate Limiting）

**策略**: 对整个 API 进行全局限流

**适用场景**:
- 保护后端服务
- 控制总体负载

**示例**:
```
全局: 10000 次/分钟
```

---

## 💰 配额管理

### 配额类型

#### 1. 免费用户配额

| 配额类型 | 限制 | 重置周期 |
|---------|------|---------|
| **请求次数** | 1000 次/天 | 每日 00:00 UTC |
| **会话数** | 10 个/天 | 每日 00:00 UTC |
| **MCP 调用** | 500 次/天 | 每日 00:00 UTC |

#### 2. 付费用户配额

| 配额类型 | 限制 | 重置周期 |
|---------|------|---------|
| **请求次数** | 10000 次/天 | 每日 00:00 UTC |
| **会话数** | 100 个/天 | 每日 00:00 UTC |
| **MCP 调用** | 5000 次/天 | 每日 00:00 UTC |

#### 3. 企业用户配额

| 配额类型 | 限制 | 重置周期 |
|---------|------|---------|
| **请求次数** | 100000 次/天 | 每日 00:00 UTC |
| **会话数** | 1000 个/天 | 每日 00:00 UTC |
| **MCP 调用** | 50000 次/天 | 每日 00:00 UTC |

---

## 🚦 限流规则

### 用户端核心接口

| 接口 | 限流规则 | 说明 |
|------|---------|------|
| `POST /api/agent/planning-assistant/sessions` | 10 次/分钟 | 防止频繁创建会话 |
| `POST /api/agent/planning-assistant/chat` | 60 次/分钟 | 对话接口限流 |
| `GET /api/agent/planning-assistant/sessions/:id` | 100 次/分钟 | 查询接口限流 |
| `GET /api/agent/planning-assistant/quick-recommend` | 20 次/分钟 | 快速推荐限流 |
| `GET /api/agent/planning-assistant/users/:id/preferences` | 30 次/分钟 | 偏好查询限流 |
| `POST /api/agent/planning-assistant/users/:id/preferences/clear` | 5 次/分钟 | 清除操作限流 |

---

### MCP 服务接口

| 服务 | 限流规则 | 说明 |
|------|---------|------|
| **Google Maps Direct** | 100 次/分钟 | 受 API 配额限制 |
| **Weather Direct API** | 200 次/分钟 | 免费服务，宽松限流 |
| **Hotel Direct API** | 50 次/分钟 | 受 API 配额限制 |
| **Restaurant Direct API** | 50 次/分钟 | 受 API 配额限制 |
| **Exa MCP** | 20 次/分钟 | 受 API 配额限制 |
| **Translation Direct API** | 100 次/分钟 | 受 API 配额限制 |
| **Vision Service** | 30 次/分钟 | 计算密集型，严格限流 |

---

### 管理后台接口

| 接口 | 限流规则 | 说明 |
|------|---------|------|
| `GET /api/admin/*` | 100 次/分钟 | 管理接口限流 |
| `POST /api/admin/*` | 50 次/分钟 | 写操作限流 |
| `GET /api/training/*` | 200 次/分钟 | 训练接口限流 |

---

## 📊 配额查询

### 查询配额使用情况

**端点**: `GET /api/quota/usage`

**说明**: 查询当前用户的配额使用情况

**认证**: 需要认证（JWT Token）

#### 请求示例

```bash
curl -X GET "https://api.example.com/api/quota/usage" \
  -H "Authorization: Bearer {token}"
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "userId": "user_123456",
    "userType": "free",
    "quotas": {
      "requests": {
        "limit": 1000,
        "used": 350,
        "remaining": 650,
        "resetAt": "2026-02-09T00:00:00.000Z"
      },
      "sessions": {
        "limit": 10,
        "used": 3,
        "remaining": 7,
        "resetAt": "2026-02-09T00:00:00.000Z"
      },
      "mcpCalls": {
        "limit": 500,
        "used": 120,
        "remaining": 380,
        "resetAt": "2026-02-09T00:00:00.000Z"
      }
    },
    "rateLimits": {
      "chat": {
        "limit": 60,
        "remaining": 45,
        "resetAt": "2026-02-08T10:01:00.000Z"
      },
      "sessions": {
        "limit": 10,
        "remaining": 8,
        "resetAt": "2026-02-08T10:01:00.000Z"
      }
    }
  }
}
```

---

### 查询特定接口限流状态

**端点**: `GET /api/quota/rate-limit/:endpoint`

**说明**: 查询特定接口的限流状态

**认证**: 需要认证（JWT Token）

#### 请求示例

```bash
curl -X GET "https://api.example.com/api/quota/rate-limit/chat" \
  -H "Authorization: Bearer {token}"
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "endpoint": "chat",
    "limit": 60,
    "remaining": 45,
    "resetAt": "2026-02-08T10:01:00.000Z",
    "window": "1 minute"
  }
}
```

---

## ⚠️ 超限处理

### 限流超限响应

**HTTP 状态码**: `429 Too Many Requests`

**响应格式**:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "请求过于频繁，请稍后重试",
    "details": {
      "limit": 60,
      "remaining": 0,
      "resetAt": "2026-02-08T10:01:00.000Z",
      "retryAfter": 60
    }
  },
  "statusCode": 429
}
```

**响应头**:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1707393660
Retry-After: 60
```

---

### 配额超限响应

**HTTP 状态码**: `429 Too Many Requests`

**响应格式**:

```json
{
  "success": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "配额已用完，请升级账户或等待重置",
    "details": {
      "quotaType": "requests",
      "limit": 1000,
      "used": 1000,
      "resetAt": "2026-02-09T00:00:00.000Z",
      "upgradeUrl": "https://example.com/upgrade"
    }
  },
  "statusCode": 429
}
```

---

### 客户端处理建议

#### 1. 检测限流响应

```typescript
async function callAPI(endpoint: string, options: RequestInit) {
  const response = await fetch(endpoint, options);
  
  if (response.status === 429) {
    const error = await response.json();
    const retryAfter = error.error.details.retryAfter || 60;
    
    // 等待后重试
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return callAPI(endpoint, options); // 重试
  }
  
  return response.json();
}
```

#### 2. 读取限流响应头

```typescript
function getRateLimitInfo(response: Response) {
  return {
    limit: parseInt(response.headers.get('X-RateLimit-Limit') || '0'),
    remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '0'),
    reset: parseInt(response.headers.get('X-RateLimit-Reset') || '0'),
    retryAfter: parseInt(response.headers.get('Retry-After') || '60'),
  };
}

// 使用示例
const response = await fetch('/api/agent/planning-assistant/chat', options);
const rateLimitInfo = getRateLimitInfo(response);

if (rateLimitInfo.remaining < 10) {
  console.warn('限流警告：剩余请求数较少');
}
```

#### 3. 指数退避重试

```typescript
async function callAPIWithRetry(
  endpoint: string,
  options: RequestInit,
  maxRetries = 3
): Promise<any> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(endpoint, options);
      
      if (response.status === 429) {
        const error = await response.json();
        const retryAfter = error.error.details.retryAfter || Math.pow(2, i);
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return response.json();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
}
```

---

## 💡 最佳实践

### 1. 客户端优化

#### 请求合并

```typescript
// 不推荐：频繁调用
for (const id of ids) {
  await fetch(`/api/places/${id}`);
}

// 推荐：批量请求
await fetch('/api/places/batch', {
  method: 'POST',
  body: JSON.stringify({ ids }),
});
```

#### 缓存响应

```typescript
// 缓存响应，减少 API 调用
const cache = new Map();

async function getPlace(id: string) {
  if (cache.has(id)) {
    return cache.get(id);
  }
  
  const response = await fetch(`/api/places/${id}`);
  const data = await response.json();
  cache.set(id, data);
  return data;
}
```

#### 请求去重

```typescript
// 防止重复请求
const pendingRequests = new Map();

async function getPlace(id: string) {
  if (pendingRequests.has(id)) {
    return pendingRequests.get(id);
  }
  
  const promise = fetch(`/api/places/${id}`).then(res => res.json());
  pendingRequests.set(id, promise);
  
  try {
    const data = await promise;
    return data;
  } finally {
    pendingRequests.delete(id);
  }
}
```

---

### 2. 服务端优化

#### 限流算法

**令牌桶算法（Token Bucket）**:
- 每个用户维护一个令牌桶
- 每秒添加固定数量的令牌
- 请求消耗令牌，令牌不足时拒绝请求

**滑动窗口算法（Sliding Window）**:
- 维护一个时间窗口内的请求计数
- 超过限制时拒绝请求
- 窗口滑动，自动清理过期计数

#### 分布式限流

**Redis 实现**:

```typescript
import Redis from 'ioredis';

class RateLimiter {
  constructor(private redis: Redis) {}
  
  async checkLimit(key: string, limit: number, window: number): Promise<boolean> {
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, window);
    }
    
    return current <= limit;
  }
}
```

---

### 3. 监控和告警

#### 监控指标

- **限流触发次数**: 统计限流触发频率
- **配额使用率**: 监控配额使用情况
- **用户分布**: 分析用户使用模式
- **峰值流量**: 识别流量峰值

#### 告警规则

- **限流触发率 > 5%**: 发送告警
- **配额使用率 > 80%**: 发送告警
- **异常流量**: 检测异常流量模式

---

## 🔗 相关文档

- [API 错误码定义](./API_ERROR_CODES.md)
- [API 版本管理](./API_VERSIONING.md)
- [产品经理接口梳理](./API_PRODUCT_MANAGER_REVIEW.md)

---

## 📝 更新日志

### v1.0.0 (2026-02-08)

- ✅ 初始版本
- ✅ 定义限流策略和规则
- ✅ 定义配额管理规则
- ✅ 添加客户端处理指南

---

**文档维护**: 后端架构团队  
**技术支持**: [联系方式]  
**最后更新**: 2026-02-08
