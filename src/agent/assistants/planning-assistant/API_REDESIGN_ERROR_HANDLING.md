# 规划智能体接口重新设计 - 错误处理规范

**文档版本**: 1.0  
**设计日期**: 2026-02-08  
**关联文档**: [API_REDESIGN_PRODUCT_MANAGER.md](./API_REDESIGN_PRODUCT_MANAGER.md)

---

## 📋 目录

- [错误处理原则](#错误处理原则)
- [错误码定义](#错误码定义)
- [错误响应格式](#错误响应格式)
- [各接口错误处理](#各接口错误处理)
- [客户端处理建议](#客户端处理建议)

---

## 🎯 错误处理原则

1. **统一格式**: 所有错误响应使用统一格式
2. **明确错误码**: 使用标准错误码，便于客户端处理
3. **详细错误信息**: 提供清晰的错误描述和解决建议
4. **可追踪性**: 包含 traceId 便于问题排查
5. **国际化支持**: 错误信息支持多语言

---

## 📊 错误码定义

### 通用错误码 (1xxx)

| 错误码 | HTTP状态码 | 说明 | 客户端处理 |
|--------|-----------|------|-----------|
| `1001` | 400 | 请求参数错误 | 检查请求参数 |
| `1002` | 400 | 请求体格式错误 | 检查 JSON 格式 |
| `1003` | 401 | 未授权 | 检查认证信息 |
| `1004` | 403 | 权限不足 | 检查用户权限 |
| `1005` | 404 | 资源不存在 | 检查资源ID |
| `1006` | 409 | 资源冲突 | 检查资源状态 |
| `1007` | 429 | 请求频率过高 | 降低请求频率 |
| `1008` | 500 | 服务器内部错误 | 稍后重试 |
| `1009` | 503 | 服务不可用 | 稍后重试 |

### 会话相关错误码 (2xxx)

| 错误码 | HTTP状态码 | 说明 | 客户端处理 |
|--------|-----------|------|-----------|
| `2001` | 404 | 会话不存在 | 创建新会话 |
| `2002` | 410 | 会话已过期 | 创建新会话 |
| `2003` | 400 | 会话ID格式错误 | 检查会话ID格式 |
| `2004` | 409 | 会话已存在 | 使用现有会话 |

### 业务操作错误码 (3xxx)

| 错误码 | HTTP状态码 | 说明 | 客户端处理 |
|--------|-----------|------|-----------|
| `3001` | 400 | 目的地必填 | 提供目的地参数 |
| `3002` | 400 | 方案ID不存在 | 检查方案ID |
| `3003` | 400 | 至少需要2个方案进行对比 | 提供至少2个方案ID |
| `3004` | 400 | 方案生成失败 | 检查输入参数，稍后重试 |
| `3005` | 400 | 优化类型不支持 | 使用支持的优化类型 |
| `3006` | 400 | 行程不存在 | 检查行程ID |
| `3007` | 400 | 行程已确认，无法修改 | 创建新行程或使用优化接口 |

### 异步任务错误码 (4xxx)

| 错误码 | HTTP状态码 | 说明 | 客户端处理 |
|--------|-----------|------|-----------|
| `4001` | 404 | 任务不存在 | 检查任务ID |
| `4002` | 400 | 任务已过期 | 重新创建任务 |
| `4003` | 500 | 任务执行失败 | 查看错误详情，重新创建任务 |

### MCP 服务错误码 (5xxx)

| 错误码 | HTTP状态码 | 说明 | 客户端处理 |
|--------|-----------|------|-----------|
| `5001` | 503 | MCP 服务不可用 | 稍后重试 |
| `5002` | 500 | MCP 服务调用失败 | 稍后重试 |
| `5003` | 429 | MCP 服务限流 | 降低请求频率 |

---

## 📦 错误响应格式

### 标准错误响应

```typescript
// dto/error-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ description: '是否成功', example: false })
  success!: boolean;

  @ApiProperty({ description: '错误码', example: '2001' })
  errorCode!: string;

  @ApiProperty({ description: '错误消息（英文）', example: 'Session not found' })
  message!: string;

  @ApiProperty({ description: '错误消息（中文）', example: '会话不存在' })
  messageCN!: string;

  @ApiPropertyOptional({ description: '错误详情' })
  details?: Record<string, any>;

  @ApiPropertyOptional({ description: '追踪ID' })
  traceId?: string;

  @ApiPropertyOptional({ description: '时间戳' })
  timestamp?: string;
}
```

### 错误响应示例

```json
{
  "success": false,
  "errorCode": "2001",
  "message": "Session not found",
  "messageCN": "会话不存在",
  "details": {
    "sessionId": "session_789",
    "suggestion": "Please create a new session"
  },
  "traceId": "trace_abc123",
  "timestamp": "2026-02-08T10:00:00Z"
}
```

---

## 🔧 各接口错误处理

### 1. 会话管理接口

#### POST /sessions

**可能错误**:
- `1001`: 请求参数错误（userId 格式错误）
- `2004`: 会话已存在（如果提供了已存在的 sessionId）
- `1008`: 服务器内部错误

**示例**:
```json
// 400 Bad Request
{
  "success": false,
  "errorCode": "1001",
  "message": "Invalid request parameters",
  "messageCN": "请求参数错误",
  "details": {
    "field": "userId",
    "reason": "Invalid format"
  }
}
```

#### GET /sessions/:sessionId

**可能错误**:
- `2001`: 会话不存在
- `2002`: 会话已过期
- `2003`: 会话ID格式错误

**示例**:
```json
// 404 Not Found
{
  "success": false,
  "errorCode": "2001",
  "message": "Session not found",
  "messageCN": "会话不存在",
  "details": {
    "sessionId": "session_789",
    "suggestion": "Please create a new session"
  }
}
```

#### DELETE /sessions/:sessionId

**可能错误**:
- `2001`: 会话不存在
- `2003`: 会话ID格式错误

---

### 2. 业务操作接口

#### POST /recommendations

**可能错误**:
- `1001`: 请求参数错误（limit 超出范围等）
- `2001`: 会话不存在（如果提供了 sessionId）
- `5001`: MCP 服务不可用（推荐引擎依赖的 MCP 服务）

**示例**:
```json
// 400 Bad Request
{
  "success": false,
  "errorCode": "1001",
  "message": "Invalid request parameters",
  "messageCN": "请求参数错误",
  "details": {
    "field": "limit",
    "reason": "Limit must be between 1 and 50",
    "provided": 100
  }
}
```

#### POST /plans/generate

**可能错误**:
- `3001`: 目的地必填
- `1001`: 请求参数错误
- `2001`: 会话不存在（如果提供了 sessionId）
- `3004`: 方案生成失败
- `5001`: MCP 服务不可用

**示例**:
```json
// 400 Bad Request
{
  "success": false,
  "errorCode": "3001",
  "message": "Destination is required",
  "messageCN": "目的地必填",
  "details": {
    "field": "destination",
    "suggestion": "Please provide a destination"
  }
}
```

#### POST /plans/generate-async

**可能错误**:
- 同 `/plans/generate`
- `4002`: 任务已过期（如果任务创建后长时间未查询）

#### GET /plans/generate/:taskId

**可能错误**:
- `4001`: 任务不存在
- `4002`: 任务已过期

**示例**:
```json
// 404 Not Found
{
  "success": false,
  "errorCode": "4001",
  "message": "Task not found",
  "messageCN": "任务不存在",
  "details": {
    "taskId": "task_456",
    "suggestion": "Please check the task ID or create a new task"
  }
}
```

#### POST /plans/compare

**可能错误**:
- `3003`: 至少需要2个方案进行对比
- `3002`: 方案ID不存在
- `1001`: 请求参数错误

**示例**:
```json
// 400 Bad Request
{
  "success": false,
  "errorCode": "3003",
  "message": "At least 2 plans are required for comparison",
  "messageCN": "至少需要2个方案进行对比",
  "details": {
    "provided": 1,
    "required": 2
  }
}
```

#### POST /plans/:planId/optimize

**可能错误**:
- `3002`: 方案ID不存在
- `3005`: 优化类型不支持
- `1001`: 请求参数错误

**示例**:
```json
// 400 Bad Request
{
  "success": false,
  "errorCode": "3005",
  "message": "Optimization type not supported",
  "messageCN": "优化类型不支持",
  "details": {
    "provided": "invalid_type",
    "supported": ["pace", "budget", "route", "activities"]
  }
}
```

#### POST /plans/:planId/confirm

**可能错误**:
- `3002`: 方案ID不存在
- `1001`: 请求参数错误
- `1008`: 服务器内部错误（保存行程失败）

---

### 3. 对话接口

#### POST /chat

**可能错误**:
- `2001`: 会话不存在
- `2002`: 会话已过期
- `1001`: 请求参数错误（message 为空等）

---

### 4. 行程操作接口

#### POST /trips/:tripId/optimize

**可能错误**:
- `3006`: 行程不存在
- `3007`: 行程已确认，无法修改
- `3005`: 优化类型不支持
- `1001`: 请求参数错误

**示例**:
```json
// 400 Bad Request
{
  "success": false,
  "errorCode": "3007",
  "message": "Trip is confirmed and cannot be modified",
  "messageCN": "行程已确认，无法修改",
  "details": {
    "tripId": "trip_456",
    "suggestion": "Please use the refine endpoint or create a new trip"
  }
}
```

#### POST /trips/:tripId/refine

**可能错误**:
- `3006`: 行程不存在
- `1001`: 请求参数错误

#### GET /trips/:tripId/suggestions

**可能错误**:
- `3006`: 行程不存在

---

## 💡 客户端处理建议

### 1. 错误码处理策略

```typescript
// 客户端错误处理示例

async function handleApiError(error: ErrorResponseDto) {
  switch (error.errorCode) {
    // 会话相关错误 - 创建新会话
    case '2001':
    case '2002':
      return await createNewSession();
    
    // 参数错误 - 提示用户
    case '1001':
    case '3001':
    case '3003':
      showErrorToast(error.messageCN);
      return;
    
    // 资源不存在 - 检查资源ID
    case '3002':
    case '3006':
    case '4001':
      showErrorToast('资源不存在，请刷新页面');
      return;
    
    // 限流 - 降低请求频率
    case '1007':
    case '5003':
      await delay(1000);
      return retry();
    
    // 服务不可用 - 稍后重试
    case '1009':
    case '5001':
      showErrorToast('服务暂时不可用，请稍后重试');
      return;
    
    // 服务器错误 - 记录并提示
    case '1008':
    case '5002':
      logError(error);
      showErrorToast('服务器错误，请稍后重试');
      return;
    
    default:
      showErrorToast(error.messageCN || '未知错误');
  }
}
```

### 2. 重试策略

```typescript
// 重试配置

const RETRY_CONFIG = {
  // 可重试的错误码
  retryableErrors: ['1008', '1009', '5001', '5002', '5003'],
  
  // 重试次数
  maxRetries: 3,
  
  // 重试延迟（毫秒）
  retryDelay: 1000,
  
  // 指数退避
  exponentialBackoff: true,
};

async function callWithRetry<T>(
  apiCall: () => Promise<T>,
  retries = RETRY_CONFIG.maxRetries
): Promise<T> {
  try {
    return await apiCall();
  } catch (error) {
    if (retries > 0 && RETRY_CONFIG.retryableErrors.includes(error.errorCode)) {
      const delay = RETRY_CONFIG.exponentialBackoff
        ? RETRY_CONFIG.retryDelay * Math.pow(2, RETRY_CONFIG.maxRetries - retries)
        : RETRY_CONFIG.retryDelay;
      
      await delay(delay);
      return callWithRetry(apiCall, retries - 1);
    }
    throw error;
  }
}
```

### 3. 错误日志记录

```typescript
// 错误日志记录

function logError(error: ErrorResponseDto, context?: Record<string, any>) {
  const errorLog = {
    errorCode: error.errorCode,
    message: error.message,
    messageCN: error.messageCN,
    traceId: error.traceId,
    timestamp: error.timestamp,
    context,
  };
  
  // 发送到错误追踪服务
  errorTrackingService.log(errorLog);
  
  // 控制台输出（开发环境）
  if (process.env.NODE_ENV === 'development') {
    console.error('API Error:', errorLog);
  }
}
```

---

## 📝 实现示例

### NestJS 异常过滤器

```typescript
// exception-filters/planning-assistant-exception.filter.ts

import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ErrorResponseDto } from '../dto/error-response.dto';

@Catch()
export class PlanningAssistantExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    
    const errorResponse: ErrorResponseDto = {
      success: false,
      errorCode: this.getErrorCode(exception),
      message: exception.message || 'Internal server error',
      messageCN: this.getChineseMessage(exception),
      details: exception.details,
      traceId: request.id || this.generateTraceId(),
      timestamp: new Date().toISOString(),
    };
    
    const status = this.getHttpStatus(exception);
    response.status(status).json(errorResponse);
  }
  
  private getErrorCode(exception: any): string {
    // 根据异常类型返回错误码
    if (exception.errorCode) {
      return exception.errorCode;
    }
    
    // 默认错误码
    return '1008';
  }
  
  private getHttpStatus(exception: any): number {
    // 根据错误码返回 HTTP 状态码
    const errorCode = this.getErrorCode(exception);
    const statusMap: Record<string, number> = {
      '1001': HttpStatus.BAD_REQUEST,
      '1002': HttpStatus.BAD_REQUEST,
      '1003': HttpStatus.UNAUTHORIZED,
      '1004': HttpStatus.FORBIDDEN,
      '1005': HttpStatus.NOT_FOUND,
      '1006': HttpStatus.CONFLICT,
      '1007': HttpStatus.TOO_MANY_REQUESTS,
      '1008': HttpStatus.INTERNAL_SERVER_ERROR,
      '1009': HttpStatus.SERVICE_UNAVAILABLE,
      '2001': HttpStatus.NOT_FOUND,
      '2002': HttpStatus.GONE,
      // ... 其他错误码映射
    };
    
    return statusMap[errorCode] || HttpStatus.INTERNAL_SERVER_ERROR;
  }
  
  private getChineseMessage(exception: any): string {
    // 返回中文错误消息
    const errorCode = this.getErrorCode(exception);
    const messageMap: Record<string, string> = {
      '1001': '请求参数错误',
      '2001': '会话不存在',
      '3001': '目的地必填',
      // ... 其他错误消息
    };
    
    return messageMap[errorCode] || '服务器错误';
  }
  
  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

---

**文档维护**: 后端开发团队  
**最后更新**: 2026-02-08
