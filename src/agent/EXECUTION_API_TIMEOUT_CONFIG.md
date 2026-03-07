# 执行页面 API 超时配置 - 方案1实现指南

**日期**: 2026-02-05  
**方案**: 根据 Action 类型设置不同的超时时间  
**状态**: 📝 实现指南

---

## ✅ 一、超时配置方案

### 1.1 配置表

根据不同的 action 类型，设置不同的超时时间：

| Action | 超时时间 | 说明 |
|--------|---------|------|
| `get_status` | 60秒 | 快速响应，无外部依赖 |
| `remind` | 60秒 | 通常不需要 LLM，应该较快 |
| `handle_change` | **300秒** | 需要调用 LLM，可能较慢（建议 5 分钟，避免 120 秒超时） |
| `fallback` | **300秒** | 需要调用 LLM，可能较慢（建议 5 分钟，避免 120 秒超时） |

### 1.2 实现原理

- **快速操作**（`get_status`, `remind`）: 60秒超时足够
- **LLM 操作**（`handle_change`, `fallback`）: 300秒超时，因为 LLM 调用可能需要 30-120 秒，120 秒易超时

---

## 📝 二、前端实现代码

### 2.1 TypeScript 配置

**创建超时配置工具函数**:

```typescript
// src/utils/execution-api-timeout.ts 或类似位置

/**
 * 根据 execution action 类型获取超时时间（毫秒）
 */
export function getExecutionApiTimeout(action: string): number {
  const timeoutConfig: Record<string, number> = {
    'get_status': 60000,      // 60秒（通常很快）
    'remind': 60000,           // 60秒（通常不需要 LLM）
    'handle_change': 300000,   // 300秒/5分钟（需要 LLM，120秒易超时）
    'fallback': 300000,        // 300秒/5分钟（需要 LLM，120秒易超时）
  };

  return timeoutConfig[action] || 60000; // 默认 60 秒
}
```

### 2.2 Axios 实现示例

**使用 Axios 调用 API**:

```typescript
import axios from 'axios';
import { getExecutionApiTimeout } from '@/utils/execution-api-timeout';

async function callExecutionApi(request: {
  tripId: string;
  action: 'get_status' | 'remind' | 'handle_change' | 'fallback';
  // ... 其他参数
}) {
  const timeout = getExecutionApiTimeout(request.action);
  
  try {
    const response = await axios.post(
      '/api/execution/execute',
      request,
      {
        timeout,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data;
  } catch (error: any) {
    // 检查是否是超时错误
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      const elapsedSeconds = Math.floor(timeout / 1000);
      throw new Error(
        `请求超时（已等待 ${elapsedSeconds} 秒）。` +
        `${request.action === 'handle_change' || request.action === 'fallback' 
          ? '此操作需要调用 AI 服务，可能需要更长时间。' 
          : ''}` +
        `请稍后重试或联系技术支持。`
      );
    }
    throw error;
  }
}
```

### 2.3 Fetch API 实现示例

**使用 Fetch API 调用**:

```typescript
import { getExecutionApiTimeout } from '@/utils/execution-api-timeout';

async function callExecutionApi(request: {
  tripId: string;
  action: 'get_status' | 'remind' | 'handle_change' | 'fallback';
  // ... 其他参数
}) {
  const timeout = getExecutionApiTimeout(request.action);
  
  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch('/api/execution/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // 检查是否是超时错误
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      const elapsedSeconds = Math.floor(timeout / 1000);
      throw new Error(
        `请求超时（已等待 ${elapsedSeconds} 秒）。` +
        `${request.action === 'handle_change' || request.action === 'fallback' 
          ? '此操作需要调用 AI 服务，可能需要更长时间。' 
          : ''}` +
        `请稍后重试或联系技术支持。`
      );
    }
    throw error;
  }
}
```

### 2.4 React Hook 实现示例

**创建自定义 Hook**:

```typescript
// src/hooks/useExecutionApi.ts

import { useState, useCallback } from 'react';
import axios from 'axios';
import { getExecutionApiTimeout } from '@/utils/execution-api-timeout';

interface ExecutionRequest {
  tripId: string;
  action: 'get_status' | 'remind' | 'handle_change' | 'fallback';
  remindParams?: any;
  changeParams?: any;
  fallbackParams?: any;
}

export function useExecutionApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (request: ExecutionRequest) => {
    setLoading(true);
    setError(null);
    
    const timeout = getExecutionApiTimeout(request.action);
    const startTime = Date.now();
    
    try {
      const response = await axios.post(
        '/api/execution/execute',
        request,
        {
          timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      return response.data;
    } catch (err: any) {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      
      // 检查是否是超时错误
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        const errorMessage = 
          `请求超时（已等待 ${elapsedSeconds} 秒）。` +
          `${request.action === 'handle_change' || request.action === 'fallback' 
            ? '此操作需要调用 AI 服务，可能需要更长时间。' 
            : ''}` +
          `请稍后重试或联系技术支持。`;
        
        setError(errorMessage);
        console.error('[Execute Page] 超时错误:', {
          action: request.action,
          timeout,
          elapsedSeconds,
          error: err,
        });
        
        throw new Error(errorMessage);
      }
      
      setError(err.message || '请求失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { execute, loading, error };
}
```

---

## 🎯 三、使用示例

### 3.1 在组件中使用

```typescript
import { useExecutionApi } from '@/hooks/useExecutionApi';

function ExecutePage() {
  const { execute, loading, error } = useExecutionApi();
  
  const handleGetStatus = async () => {
    try {
      const result = await execute({
        tripId: 'trip-id',
        action: 'get_status',
      });
      console.log('状态:', result);
    } catch (err) {
      console.error('错误:', err);
    }
  };
  
  const handleChange = async () => {
    try {
      const result = await execute({
        tripId: 'trip-id',
        action: 'handle_change',
        changeParams: {
          changeType: 'time_change',
          changeDetails: { /* ... */ },
        },
      });
      console.log('变更结果:', result);
    } catch (err) {
      // 如果是超时，会显示友好的错误消息
      console.error('错误:', err);
    }
  };
  
  return (
    <div>
      <button onClick={handleGetStatus} disabled={loading}>
        获取状态
      </button>
      <button onClick={handleChange} disabled={loading}>
        处理变更
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

---

## ✅ 四、错误处理改进

### 4.1 超时错误识别

**已实现**:
- ✅ 识别 `ECONNABORTED` 错误（Axios 超时）
- ✅ 识别 `AbortError` 错误（Fetch API 超时）
- ✅ 识别包含 "timeout" 的错误消息

### 4.2 用户友好的错误提示

**错误消息包含**:
- ✅ 已等待的时间（秒）
- ✅ 可能的原因说明（对于 LLM 操作）
- ✅ 建议操作（稍后重试或联系技术支持）

### 4.3 调试日志

**记录的信息**:
- ✅ Action 类型
- ✅ 超时设置
- ✅ 实际等待时间
- ✅ 错误详情

---

## 📊 五、配置说明

### 5.1 超时时间选择

**60秒** (`get_status`, `remind`):
- 这些操作通常很快（< 1秒）
- 60秒足够处理大部分情况
- 如果超时，可能是网络问题

**300秒** (`handle_change`, `fallback`):
- 这些操作需要调用 LLM
- LLM 调用可能需要 30-120 秒
- 加上网络延迟和处理时间，300秒（5分钟）更安全，避免「请求超时（已等待 120 秒）」报错

### 5.2 可调整性

**如果需要调整**:
- 修改 `getExecutionApiTimeout()` 函数中的配置
- 所有调用会自动使用新的超时时间
- 不需要修改每个调用点

---

## 🧪 六、测试建议

### 6.1 测试不同 Action

```typescript
// 测试 get_status（应该很快）
await execute({ tripId: '...', action: 'get_status' });

// 测试 handle_change（可能需要更长时间）
await execute({ 
  tripId: '...', 
  action: 'handle_change',
  changeParams: { /* ... */ },
});

// 测试 fallback（可能需要更长时间）
await execute({ 
  tripId: '...', 
  action: 'fallback',
  fallbackParams: { /* ... */ },
});
```

### 6.2 测试超时场景

- 模拟网络延迟
- 测试超时错误处理
- 验证错误消息显示

---

## ✅ 七、总结

### 7.1 实现步骤

1. ✅ 创建 `getExecutionApiTimeout()` 工具函数
2. ✅ 在 API 调用中使用动态超时
3. ✅ 改进错误处理（识别超时错误）
4. ✅ 添加用户友好的错误提示
5. ✅ 添加调试日志

### 7.2 优势

- ✅ **灵活性**: 根据操作类型设置合适的超时时间
- ✅ **用户体验**: 快速操作不会等待太久，慢速操作有足够时间
- ✅ **可维护性**: 集中管理超时配置，易于调整
- ✅ **错误处理**: 明确的错误提示，便于用户理解

---

**下一步**: 在前端代码中实现此配置，替换现有的固定超时设置
