# 执行页面 API 超时配置 - 实现总结

**日期**: 2026-02-05  
**方案**: 方案1 - 根据 Action 类型设置不同的超时时间  
**状态**: ✅ 配置文档已创建

---

## ✅ 一、已完成的工作

### 1.1 后端状态

- ✅ `/api/execution/execute` 接口正常运行
- ✅ `get_status` action 响应快速（~11ms）
- ✅ 所有 action 类型都已实现
- ✅ 错误处理已完善

### 1.2 前端配置文档

- ✅ 创建了 `EXECUTION_API_TIMEOUT_CONFIG.md` 实现指南
- ✅ 提供了完整的代码示例（Axios 和 Fetch API）
- ✅ 提供了 React Hook 实现示例
- ✅ 更新了 API 文档，添加超时配置说明

---

## 📝 二、超时配置方案

### 2.1 配置表

| Action | 超时时间 | 说明 |
|--------|---------|------|
| `get_status` | **60秒** | 快速响应，无外部依赖 |
| `remind` | **60秒** | 通常不需要 LLM |
| `handle_change` | **120秒** | 需要调用 LLM，可能较慢 |
| `fallback` | **120秒** | 需要调用 LLM，可能较慢 |

### 2.2 实现方式

**创建工具函数**:
```typescript
export function getExecutionApiTimeout(action: string): number {
  const timeoutConfig: Record<string, number> = {
    'get_status': 60000,
    'remind': 60000,
    'handle_change': 120000,
    'fallback': 120000,
  };
  return timeoutConfig[action] || 60000;
}
```

**在 API 调用中使用**:
```typescript
const timeout = getExecutionApiTimeout(request.action);
const response = await axios.post('/api/execution/execute', request, {
  timeout,
});
```

---

## 🎯 三、前端需要实现的内容

### 3.1 创建工具函数

**文件**: `src/utils/execution-api-timeout.ts`（或类似位置）

**内容**: 参考 `EXECUTION_API_TIMEOUT_CONFIG.md` 第 2.1 节

### 3.2 更新 API 调用代码

**找到现有的 API 调用代码**，替换固定超时为动态超时：

```typescript
// 修改前
const response = await axios.post('/api/execution/execute', request, {
  timeout: 60000, // 固定 60 秒
});

// 修改后
import { getExecutionApiTimeout } from '@/utils/execution-api-timeout';

const timeout = getExecutionApiTimeout(request.action);
const response = await axios.post('/api/execution/execute', request, {
  timeout, // 根据 action 动态设置
});
```

### 3.3 改进错误处理

**确保超时错误识别**:
- ✅ 识别 `ECONNABORTED`（Axios）
- ✅ 识别 `AbortError`（Fetch API）
- ✅ 显示友好的错误消息

---

## 📊 四、优势

### 4.1 灵活性

- ✅ 快速操作（`get_status`）不会等待太久
- ✅ 慢速操作（`handle_change`, `fallback`）有足够时间完成

### 4.2 用户体验

- ✅ 减少不必要的超时错误
- ✅ 明确的错误提示（区分不同操作类型）
- ✅ 更好的错误恢复建议

### 4.3 可维护性

- ✅ 集中管理超时配置
- ✅ 易于调整和扩展
- ✅ 清晰的代码结构

---

## ✅ 五、下一步

1. **前端实现**:
   - 创建 `getExecutionApiTimeout()` 工具函数
   - 更新现有的 API 调用代码
   - 测试不同 action 的超时行为

2. **测试验证**:
   - 测试 `get_status` action（应该很快）
   - 测试 `handle_change` action（可能需要更长时间）
   - 测试 `fallback` action（可能需要更长时间）
   - 验证超时错误处理

3. **监控和优化**:
   - 监控实际响应时间
   - 根据实际情况调整超时配置
   - 优化 LLM 调用性能（如果可能）

---

**状态**: ✅ 配置文档已创建，等待前端实现  
**参考文档**: `EXECUTION_API_TIMEOUT_CONFIG.md`
