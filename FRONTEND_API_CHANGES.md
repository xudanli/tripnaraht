# 前端接口变更说明

## 📋 总结

**前端不需要强制修改接口** ✅

Claude 编排功能是**向后兼容**的，现有前端代码可以继续正常工作。

## 🔍 接口变化详情

### API 端点

**无变化** ✅
- 端点：`POST /api/agent/route_and_run`
- 方法：`POST`
- 路径：保持不变

### 请求参数 (Request)

**新增可选字段** ⚠️（可选）

在 `options` 对象中新增了一个可选字段：

```typescript
{
  request_id: string;
  user_id: string;
  message: string;
  trip_id?: string | null;
  conversation_context?: {...};
  options?: {
    // ... 原有字段保持不变
    dry_run?: boolean;
    allow_webbrowse?: boolean;
    max_seconds?: number;
    max_steps?: number;
    max_browser_steps?: number;
    cost_budget_usd?: number;
    llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic';
    
    // 🆕 新增字段（可选）
    use_claude_orchestration?: boolean;  // 是否使用 Claude 编排
  };
}
```

### 响应格式 (Response)

**无变化** ✅

响应格式完全保持不变：

```typescript
{
  request_id: string;
  route: {
    route: 'SYSTEM1_API' | 'SYSTEM1_RAG' | 'SYSTEM2_REASONING' | 'SYSTEM2_WEBBROWSE';
    confidence: number;
    reasons: string[];
    // ...
  };
  result: {
    status: 'OK' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'NEED_CONFIRMATION' | 'FAILED' | 'TIMEOUT';
    answer_text: string;
    payload: {...};
  };
  explain: {
    decision_log: any[];
  };
  observability: {
    latency_ms: number;
    router_ms: number;
    system_mode: 'SYSTEM1' | 'SYSTEM2';
    tool_calls: number;
    browser_steps: number;
    tokens_est: number;
    cost_est_usd: number;
    fallback_used: boolean;
  };
}
```

## ✅ 兼容性说明

### 1. 向后兼容

- ✅ **不传 `use_claude_orchestration`**：系统使用环境变量 `USE_CLAUDE_ORCHESTRATION` 或默认值（false）
- ✅ **现有前端代码无需修改**：可以继续正常工作
- ✅ **响应格式不变**：前端解析逻辑无需修改

### 2. 可选启用

如果前端想启用 Claude 编排，只需在请求中添加：

```typescript
{
  options: {
    use_claude_orchestration: true,
    llm_provider: 'anthropic',  // 可选，推荐指定
  }
}
```

## 📝 前端建议

### 方案 1: 不修改（推荐）

**适用场景**：前端暂时不需要 Claude 编排功能

- ✅ 无需任何修改
- ✅ 继续使用现有接口
- ✅ 系统会根据环境变量决定是否启用 Claude 编排

### 方案 2: 选择性启用

**适用场景**：前端想在某些场景下启用 Claude 编排

**实现方式**：

```typescript
// TypeScript 示例
interface AgentOptions {
  // ... 原有字段
  use_claude_orchestration?: boolean;
  llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic';
}

// 在需要启用 Claude 编排的请求中
const request = {
  request_id: generateRequestId(),
  user_id: currentUserId,
  message: userMessage,
  options: {
    use_claude_orchestration: true,  // 启用 Claude 编排
    llm_provider: 'anthropic',       // 推荐指定
  },
};

// 发送请求
const response = await fetch('/api/agent/route_and_run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request),
});
```

### 方案 3: 全局启用

**适用场景**：前端希望所有请求都使用 Claude 编排

**实现方式**：

```typescript
// 在请求工具函数中统一添加
const defaultOptions = {
  use_claude_orchestration: true,
  llm_provider: 'anthropic',
};

const request = {
  // ...
  options: {
    ...defaultOptions,
    // ... 其他选项
  },
};
```

## 🔍 如何判断是否使用了 Claude 编排

### 方法 1: 检查响应中的 `route.reasons`

如果使用了 Claude 编排，`route.reasons` 中会包含 `"LLM_DECISION"`：

```typescript
if (response.route.reasons?.includes('LLM_DECISION')) {
  console.log('使用了 Claude 编排');
}
```

### 方法 2: 检查 `explain.decision_log`

如果使用了 Claude 编排，`explain.decision_log` 中会包含 Claude 的决策步骤：

```typescript
if (response.explain.decision_log?.length > 0) {
  const hasClaudeDecision = response.explain.decision_log.some(
    log => log.step === 'intent_analysis' || log.step === 'routing_decision'
  );
  if (hasClaudeDecision) {
    console.log('使用了 Claude 编排');
  }
}
```

## 📊 响应示例对比

### 使用 Claude 编排的响应

```json
{
  "request_id": "req-001",
  "route": {
    "route": "SYSTEM2_REASONING",
    "confidence": 0.8,
    "reasons": ["LLM_DECISION"],  // ← 标识使用了 Claude 编排
    // ...
  },
  "explain": {
    "decision_log": [
      {
        "step": "intent_analysis",
        "decision": "analysis",
        "reasoning": "用户请求分析类任务...",
        "timestamp": "2024-01-XX..."
      },
      {
        "step": "routing_decision",
        "decision": "SYSTEM2_REASONING",
        "reasoning": "需要复杂推理...",
        "timestamp": "2024-01-XX..."
      }
    ]
  },
  // ...
}
```

### 不使用 Claude 编排的响应（原有逻辑）

```json
{
  "request_id": "req-001",
  "route": {
    "route": "SYSTEM1_API",
    "confidence": 0.9,
    "reasons": ["HARD_RULE"],  // ← 原有规则路由
    // ...
  },
  "explain": {
    "decision_log": [
      {
        "step": 0,
        "chosen_action": "places.resolve_entities",
        "reason_code": "MISSING_POI_FACTS",
        // ...
      }
    ]
  },
  // ...
}
```

## ⚠️ 注意事项

1. **性能影响**
   - Claude 编排会增加响应时间（~500-1000ms）
   - 建议仅在复杂场景下启用

2. **成本考虑**
   - Claude 编排会增加 API 调用成本
   - 建议根据实际需求选择性启用

3. **错误处理**
   - 如果 Claude 编排失败，系统会自动降级到原有逻辑
   - 前端无需特殊处理

## ✅ 总结

| 项目 | 状态 | 说明 |
|------|------|------|
| API 端点 | ✅ 无变化 | 保持不变 |
| 请求格式 | ⚠️ 新增可选字段 | `options.use_claude_orchestration` |
| 响应格式 | ✅ 无变化 | 完全兼容 |
| 向后兼容 | ✅ 是 | 现有代码无需修改 |
| 前端修改 | ⚠️ 可选 | 仅在需要启用 Claude 编排时修改 |

**结论**：前端**不需要强制修改**，可以根据需求选择性启用 Claude 编排功能。

---

**最后更新**: 2024-01-XX  
**版本**: v1.0
