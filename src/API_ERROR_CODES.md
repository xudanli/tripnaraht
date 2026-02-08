# API 错误码定义规范

**版本**: 1.0.0  
**最后更新**: 2026-02-08  
**适用范围**: 所有 API 接口

---

## 📋 目录

- [错误响应格式](#错误响应格式)
- [错误码分类](#错误码分类)
- [错误码列表](#错误码列表)
- [错误处理最佳实践](#错误处理最佳实践)
- [客户端处理指南](#客户端处理指南)

---

## 📖 错误响应格式

### 标准错误响应格式

所有 API 错误响应都遵循以下统一格式：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述（用户友好）",
    "details": {
      "field": "具体错误信息"
    }
  },
  "statusCode": 400,
  "timestamp": "2026-02-08T10:00:00.000Z",
  "path": "/api/agent/planning-assistant/chat",
  "method": "POST"
}
```

### 简化错误响应格式（推荐）

对于前端调用，推荐使用简化格式：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": {}
  }
}
```

---

## 🎯 错误码分类

### 1. 客户端错误（4xx）

| HTTP 状态码 | 错误类别 | 说明 | 客户端处理 |
|------------|---------|------|-----------|
| **400** | 请求错误 | 请求参数错误、格式错误 | 检查请求参数，不重试 |
| **401** | 未认证 | Token 无效或过期 | 重新登录，获取新 Token |
| **403** | 无权限 | 用户无权限访问资源 | 联系管理员或升级权限 |
| **404** | 资源不存在 | 请求的资源不存在 | 检查资源 ID，不重试 |
| **409** | 冲突 | 资源冲突（如重复创建） | 检查资源状态，处理冲突 |
| **429** | 限流 | 请求过于频繁 | 降低请求频率，等待后重试 |

### 2. 服务器错误（5xx）

| HTTP 状态码 | 错误类别 | 说明 | 客户端处理 |
|------------|---------|------|-----------|
| **500** | 内部错误 | 服务器内部错误 | 稍后重试（指数退避） |
| **502** | 网关错误 | 上游服务不可用 | 稍后重试 |
| **503** | 服务不可用 | 服务暂时不可用 | 稍后重试 |
| **504** | 网关超时 | 上游服务超时 | 稍后重试 |

---

## 📚 错误码列表

### 验证错误（VALIDATION_ERROR）

**HTTP 状态码**: `400 Bad Request`

| 错误码 | 说明 | 示例 |
|--------|------|------|
| `VALIDATION_ERROR` | 参数验证失败 | 必填字段缺失、格式错误 |
| `INVALID_PARAMETER` | 无效参数 | 参数值不符合要求 |
| `MISSING_REQUIRED_FIELD` | 缺少必填字段 | 必需字段未提供 |

**响应示例**:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "参数验证失败",
    "details": {
      "sessionId": "sessionId 不能为空",
      "message": "message 必须是字符串"
    }
  },
  "statusCode": 400
}
```

---

### 认证错误（UNAUTHORIZED）

**HTTP 状态码**: `401 Unauthorized`

| 错误码 | 说明 | 示例 |
|--------|------|------|
| `UNAUTHORIZED` | 未认证 | Token 缺失或无效 |
| `TOKEN_EXPIRED` | Token 过期 | Token 已过期，需要刷新 |
| `TOKEN_INVALID` | Token 无效 | Token 格式错误或已失效 |
| `AUTHENTICATION_REQUIRED` | 需要认证 | 接口需要登录但未提供 Token |

**响应示例**:

```json
{
  "success": false,
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Token 已过期，请重新登录",
    "details": {
      "expiredAt": "2026-02-08T09:00:00.000Z"
    }
  },
  "statusCode": 401
}
```

---

### 权限错误（FORBIDDEN）

**HTTP 状态码**: `403 Forbidden`

| 错误码 | 说明 | 示例 |
|--------|------|------|
| `FORBIDDEN` | 无权限 | 用户无权限访问资源 |
| `INSUFFICIENT_PERMISSIONS` | 权限不足 | 需要更高权限 |
| `RESOURCE_ACCESS_DENIED` | 资源访问被拒绝 | 无权访问该资源 |

**响应示例**:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "您无权访问此资源",
    "details": {
      "resource": "trip",
      "resourceId": "trip_123"
    }
  },
  "statusCode": 403
}
```

---

### 资源未找到（NOT_FOUND）

**HTTP 状态码**: `404 Not Found`

| 错误码 | 说明 | 示例 |
|--------|------|------|
| `NOT_FOUND` | 资源不存在 | 请求的资源不存在 |
| `SESSION_NOT_FOUND` | 会话不存在 | 会话 ID 无效或已过期 |
| `RESOURCE_NOT_FOUND` | 资源未找到 | 通用资源未找到错误 |
| `USER_NOT_FOUND` | 用户不存在 | 用户 ID 无效 |

**响应示例**:

```json
{
  "success": false,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "会话不存在或已过期",
    "details": {
      "sessionId": "550e8400-e29b-41d4-a716-446655440000"
    }
  },
  "statusCode": 404
}
```

---

### 业务逻辑错误（BUSINESS_ERROR）

**HTTP 状态码**: `400 Bad Request` 或 `409 Conflict`

| 错误码 | 说明 | 示例 |
|--------|------|------|
| `BUSINESS_ERROR` | 业务逻辑错误 | 通用业务错误 |
| `INVALID_OPERATION` | 无效操作 | 当前状态下不允许此操作 |
| `RESOURCE_CONFLICT` | 资源冲突 | 资源已存在或状态冲突 |
| `QUOTA_EXCEEDED` | 配额超限 | 超过使用配额 |
| `SESSION_EXPIRED` | 会话已过期 | 会话已过期，需要重新创建 |

**响应示例**:

```json
{
  "success": false,
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "会话已过期，请重新创建会话",
    "details": {
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "expiredAt": "2026-02-08T09:00:00.000Z"
    }
  },
  "statusCode": 400
}
```

---

### 限流错误（RATE_LIMIT_EXCEEDED）

**HTTP 状态码**: `429 Too Many Requests`

| 错误码 | 说明 | 示例 |
|--------|------|------|
| `RATE_LIMIT_EXCEEDED` | 请求过于频繁 | 超过限流阈值 |
| `QUOTA_EXCEEDED` | 配额超限 | 超过每日/每月配额 |

**响应示例**:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "请求过于频繁，请稍后重试",
    "details": {
      "retryAfter": 60,
      "limit": 100,
      "remaining": 0,
      "resetAt": "2026-02-08T10:01:00.000Z"
    }
  },
  "statusCode": 429
}
```

---

### 外部服务错误（PROVIDER_ERROR）

**HTTP 状态码**: `502 Bad Gateway` 或 `503 Service Unavailable`

| 错误码 | 说明 | 示例 |
|--------|------|------|
| `PROVIDER_ERROR` | 外部服务错误 | MCP 服务调用失败 |
| `SERVICE_UNAVAILABLE` | 服务不可用 | 外部服务暂时不可用 |
| `SERVICE_TIMEOUT` | 服务超时 | 外部服务响应超时 |
| `EXTERNAL_API_ERROR` | 外部 API 错误 | 第三方 API 返回错误 |

**响应示例**:

```json
{
  "success": false,
  "error": {
    "code": "PROVIDER_ERROR",
    "message": "外部服务暂时不可用，请稍后重试",
    "details": {
      "service": "google_maps",
      "reason": "API quota exceeded"
    }
  },
  "statusCode": 503
}
```

---

### 内部服务器错误（INTERNAL_ERROR）

**HTTP 状态码**: `500 Internal Server Error`

| 错误码 | 说明 | 示例 |
|--------|------|------|
| `INTERNAL_ERROR` | 内部服务器错误 | 服务器内部错误 |
| `DATABASE_ERROR` | 数据库错误 | 数据库操作失败 |
| `PROCESSING_ERROR` | 处理错误 | 数据处理失败 |

**响应示例（开发环境）**:

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "服务器内部错误",
    "details": {
      "error": "Database connection failed"
    }
  },
  "statusCode": 500
}
```

**响应示例（生产环境）**:

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "服务器内部错误，请稍后重试"
  },
  "statusCode": 500
}
```

---

## 💡 错误处理最佳实践

### 1. 客户端重试策略

#### 可重试的错误（5xx）

```typescript
// 指数退避重试
async function retryWithBackoff(
  fn: () => Promise<any>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<any> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (i === maxRetries - 1) throw error;
      
      const statusCode = error.response?.status || error.statusCode;
      if (statusCode >= 500) {
        // 指数退避：1s, 2s, 4s
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

#### 不可重试的错误（4xx）

```typescript
// 4xx 错误不重试，直接返回错误
if (statusCode >= 400 && statusCode < 500) {
  // 不重试，返回错误给用户
  return handleClientError(error);
}
```

---

### 2. 错误码映射

```typescript
// 错误码到用户友好消息的映射
const ERROR_MESSAGES: Record<string, string> = {
  'VALIDATION_ERROR': '请检查输入参数',
  'SESSION_NOT_FOUND': '会话已过期，请重新开始',
  'TOKEN_EXPIRED': '登录已过期，请重新登录',
  'RATE_LIMIT_EXCEEDED': '请求过于频繁，请稍后重试',
  'PROVIDER_ERROR': '服务暂时不可用，请稍后重试',
  'INTERNAL_ERROR': '服务器错误，请稍后重试',
};

function getErrorMessage(errorCode: string): string {
  return ERROR_MESSAGES[errorCode] || '发生未知错误';
}
```

---

### 3. 错误日志记录

```typescript
// 记录错误日志（用于调试）
function logError(error: any, context?: any) {
  console.error('API Error:', {
    code: error.error?.code,
    message: error.error?.message,
    statusCode: error.statusCode,
    path: error.path,
    context,
  });
  
  // 发送到错误监控服务（如 Sentry）
  if (process.env.NODE_ENV === 'production') {
    // Sentry.captureException(error);
  }
}
```

---

## 📱 客户端处理指南

### JavaScript/TypeScript

```typescript
interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  statusCode: number;
}

async function handleApiError(error: ApiError): Promise<void> {
  const { code, message, details } = error.error;
  
  switch (code) {
    case 'VALIDATION_ERROR':
      // 显示字段错误
      showFieldErrors(details);
      break;
      
    case 'TOKEN_EXPIRED':
      // 重新登录
      redirectToLogin();
      break;
      
    case 'SESSION_NOT_FOUND':
      // 重新创建会话
      await createNewSession();
      break;
      
    case 'RATE_LIMIT_EXCEEDED':
      // 显示限流提示
      showRateLimitMessage(details.retryAfter);
      break;
      
    case 'PROVIDER_ERROR':
    case 'INTERNAL_ERROR':
      // 显示错误提示，建议重试
      showRetryableError(message);
      break;
      
    default:
      // 显示通用错误
      showErrorMessage(message);
  }
}
```

---

### React Hook 示例

```typescript
import { useState, useCallback } from 'react';

function useApiError() {
  const [error, setError] = useState<ApiError | null>(null);
  
  const handleError = useCallback((error: ApiError) => {
    setError(error);
    
    // 根据错误码处理
    switch (error.error.code) {
      case 'TOKEN_EXPIRED':
        // 清除 Token，跳转登录
        localStorage.removeItem('token');
        window.location.href = '/login';
        break;
        
      case 'SESSION_NOT_FOUND':
        // 重新创建会话
        // createNewSession();
        break;
        
      default:
        // 显示错误提示
        // showNotification(error.error.message);
    }
  }, []);
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  return { error, handleError, clearError };
}
```

---

## 🔗 相关文档

- [API 文档模板](./API_DOCUMENTATION_TEMPLATE.md)
- [产品经理接口梳理](./API_PRODUCT_MANAGER_REVIEW.md)
- [规划助手 API 文档](./agent/assistants/planning-assistant/API_DOCUMENTATION.md)

---

## 📝 更新日志

### v1.0.0 (2026-02-08)

- ✅ 初始版本
- ✅ 定义标准错误响应格式
- ✅ 定义错误码分类和列表
- ✅ 添加客户端处理指南

---

**文档维护**: 后端开发团队  
**技术支持**: [联系方式]  
**最后更新**: 2026-02-08
