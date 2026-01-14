# Claude 编排服务使用指南

## 概述

`ClaudeOrchestratorService` 使用 Claude 3.5 Sonnet 作为智能编排引擎，统一管理路由决策、Skills 选择和执行编排。

## 启用方式

### 方式 1: 环境变量（全局启用）

```bash
# .env
USE_CLAUDE_ORCHESTRATION=true
```

### 方式 2: 请求参数（单次请求启用）

```json
{
  "request_id": "req-001",
  "user_id": "user-123",
  "message": "分析 TripNARA 的市场机会",
  "options": {
    "use_claude_orchestration": true
  }
}
```

## 工作流程

```
用户请求
  ↓
Claude Orchestrator
  ├─ 1. 意图分析（Claude）
  ├─ 2. 路由决策（Claude）
  ├─ 3. Skills 选择（Claude）
  ├─ 4. 执行计划编排（Claude）
  └─ 5. 执行计划
      ↓
结果整合与响应
```

## 功能特性

### 1. 智能意图分析

- 理解用户真实意图
- 评估请求复杂度
- 识别所需能力

### 2. 智能路由决策

- 根据意图分析选择 System 1/2
- 考虑成本、速度、准确性
- 动态调整预算

### 3. 动态 Skills 选择

- 根据意图和路由选择 Skills
- 考虑依赖关系
- 优化执行顺序

### 4. 执行计划编排

- 识别可并行执行的步骤
- 处理依赖关系
- 设计错误处理策略

## 使用示例

### 示例 1: PEST 分析请求

```json
{
  "request_id": "req-001",
  "user_id": "user-123",
  "message": "/分析 TripNARA（决策型旅行应用）— 面向全球市场",
  "options": {
    "use_claude_orchestration": true
  }
}
```

**Claude 编排流程**：
1. 意图分析：识别为 `analysis` 类型，复杂度 `complex`
2. 路由决策：选择 `SYSTEM2_ANALYSIS`
3. Skills 选择：选择 `analysis.pestAnalysis`
4. 执行计划：编排 PEST 分析执行步骤
5. 执行：调用 PEST 分析 Skill

### 示例 2: 简单查询请求

```json
{
  "request_id": "req-002",
  "user_id": "user-123",
  "message": "查询我的行程",
  "options": {
    "use_claude_orchestration": true
  }
}
```

**Claude 编排流程**：
1. 意图分析：识别为 `simple_query` 类型，复杂度 `simple`
2. 路由决策：选择 `SYSTEM1_API`
3. Skills 选择：无需 Skills，直接返回路由决策
4. 执行：由 AgentService 的 System 1 路径处理

## 降级策略

如果 Claude 编排失败，系统会自动降级到原有的规则驱动路由：

```typescript
try {
  // 使用 Claude 编排
  return await this.claudeOrchestrator.orchestrate(request, context);
} catch (error) {
  // 降级到原有逻辑
  this.logger.warn('Claude 编排失败，降级使用原有路由逻辑');
  return this.legacyRouteAndRun(request);
}
```

## 性能优化

### 1. 缓存策略

- 意图分析结果缓存（相同请求复用）
- 路由决策缓存（相似请求复用）
- Skills 选择结果缓存

### 2. 快速路径

- 对于明确的简单请求，直接返回（不调用 Claude）
- 只在复杂场景使用 Claude 编排

### 3. 成本控制

- 设置每次编排的 Token 预算上限
- 使用更小的模型做简单决策（Claude Haiku）
- 监控并记录成本

## 调试

### 查看决策日志

响应中的 `explain.decision_log` 包含完整的决策过程：

```json
{
  "explain": {
    "decision_log": [
      {
        "step": "intent_analysis",
        "decision": "analysis",
        "reasoning": "用户请求是 PEST 分析",
        "timestamp": "2024-01-XX..."
      },
      {
        "step": "routing_decision",
        "decision": "SYSTEM2_ANALYSIS",
        "reasoning": "需要调用分析类 Skills",
        "timestamp": "2024-01-XX..."
      }
    ]
  }
}
```

### 日志级别

设置日志级别查看详细调试信息：

```bash
LOG_LEVEL=debug npm run dev
```

## 注意事项

1. **成本考虑**：Claude 编排会增加 API 调用成本，建议：
   - 只在复杂场景启用
   - 实现缓存策略
   - 监控成本使用

2. **性能考虑**：Claude 编排会增加响应时间，建议：
   - 对于简单请求，使用快速路径
   - 实现并行执行
   - 设置合理的超时时间

3. **错误处理**：确保有完善的降级策略，避免 Claude 编排失败影响用户体验

## 未来改进

- [ ] 实现意图分析结果缓存
- [ ] 实现路由决策缓存
- [ ] 实现并行执行优化
- [ ] 实现成本监控和告警
- [ ] 支持分层模型（Haiku/Sonnet/Opus）
