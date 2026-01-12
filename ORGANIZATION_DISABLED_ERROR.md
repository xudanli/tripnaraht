# 组织账户被禁用错误分析

## 🐛 错误信息

```
Anthropic API error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"This organization has been disabled."},"request_id":"req_011CX3mDDVf33wU2Gjv9Jspf"}
```

## 🔍 问题分析

### 错误原因

代理服务 `https://hongmacode.com/api` 的组织账户被禁用了。这可能是：
1. **账户欠费**：API 使用量超过配额或账户余额不足
2. **违规使用**：违反了 Anthropic 的使用条款
3. **账户暂停**：管理员暂停了账户
4. **代理服务问题**：代理服务本身的问题

### 当前行为

从日志看，系统有**降级机制**：

1. **意图分析失败** → 使用默认值：
   ```typescript
   {
     intentType: 'simple_query',
     complexity: 'simple',
     requiredCapabilities: ['data_query'],
     confidence: 0.5,
     reasoning: '意图分析失败，使用默认值',
   }
   ```

2. **路由决策成功** → 返回 `SYSTEM1_API`（置信度 0.5）

3. **最终执行** → System 1 路径完成

## 📋 当前意图识别逻辑

### 流程

1. **步骤 1: 分析用户意图** (`analyzeIntent`)
   - 使用 Claude API 分析用户消息
   - 返回：`intentType`, `complexity`, `requiredCapabilities`, `confidence`, `reasoning`
   - **错误处理**：如果失败，返回默认值（`simple_query`, `simple`）

2. **步骤 2: 选择路由策略** (`decideRouting`)
   - 基于意图分析结果，决定使用 System 1 还是 System 2
   - 返回：`route`, `confidence`, `reasoning`, `budget`
   - **错误处理**：如果失败，返回默认值（`SYSTEM2_REASONING`, 置信度 0.5）

3. **步骤 3: 根据路由决策选择执行路径**
   - 如果 `route.startsWith('SYSTEM1')` → 直接返回，由 `AgentService` 处理
   - 如果 `route.startsWith('SYSTEM2')` → 继续执行 Skills 选择和计划编排

### 降级机制

**意图分析降级**：
```typescript
catch (error: any) {
  this.logger.warn(`[Claude Orchestrator] 意图分析失败，使用默认值: ${error?.message}`);
  return {
    intentType: 'simple_query',
    complexity: 'simple',
    requiredCapabilities: ['data_query'],
    confidence: 0.5,
    reasoning: '意图分析失败，使用默认值',
  };
}
```

**路由决策降级**：
```typescript
catch (error: any) {
  this.logger.warn(`[Claude Orchestrator] 路由决策失败，使用默认值: ${error?.message}`);
  return {
    route: 'SYSTEM2_REASONING',
    confidence: 0.5,
    reasoning: '路由决策失败，使用默认值',
    budget: {
      max_seconds: 60,
      max_steps: 8,
      max_browser_steps: 0,
    },
  };
}
```

## ✅ 当前状态

从日志看：
- ✅ **配置正确**：使用正确的模型和代理 URL
- ⚠️ **API 错误**：代理服务的组织账户被禁用
- ✅ **降级成功**：意图分析失败后使用默认值，路由决策成功
- ✅ **执行成功**：最终返回 System 1 路径并完成

## 🔧 解决方案

### 方案 1: 联系代理服务提供商

联系 `https://hongmacode.com/api` 的提供商，检查：
- 账户状态
- 是否欠费
- 是否违规
- 如何恢复账户

### 方案 2: 使用其他代理服务

如果当前代理服务不可用，可以：
1. 切换到其他 Anthropic 代理服务
2. 或直接使用官方 Anthropic API（如果网络允许）

### 方案 3: 优化降级逻辑

当前降级逻辑已经工作，但可以优化：
- 当 API 失败时，可以尝试使用其他 LLM 提供商（如 OpenAI、DeepSeek）
- 或者使用规则引擎作为降级方案

## 📊 意图识别逻辑总结

### 当前流程

```
用户请求
  ↓
[步骤 1] 意图分析 (analyzeIntent)
  ├─ 成功 → 返回意图分析结果
  └─ 失败 → 降级到默认值 (simple_query, simple)
  ↓
[步骤 2] 路由决策 (decideRouting)
  ├─ 成功 → 返回路由决策 (SYSTEM1_API / SYSTEM2_REASONING)
  └─ 失败 → 降级到默认值 (SYSTEM2_REASONING)
  ↓
[步骤 3] 根据路由选择执行路径
  ├─ SYSTEM1 → 直接返回，由 AgentService 处理
  └─ SYSTEM2 → 继续 Skills 选择和计划编排
```

### 意图分析维度

1. **意图类型** (`intentType`)：
   - `simple_query`: 简单查询
   - `complex_planning`: 复杂规划
   - `analysis`: 分析请求
   - `decision`: 决策请求
   - `mixed`: 混合类型

2. **复杂度** (`complexity`)：
   - `simple`: 单一操作，无需推理
   - `medium`: 需要多步操作，但逻辑清晰
   - `complex`: 需要深度推理、优化、多轮交互

3. **所需能力** (`requiredCapabilities`)：
   - `data_query`: 数据查询能力
   - `planning`: 规划能力
   - `analysis`: 分析能力
   - `decision`: 决策能力
   - `web_browsing`: 网络浏览能力

### 路由决策规则

- **System 1（快速路径）**：
  - `SYSTEM1_API`: 简单查询（< 3 秒）
  - `SYSTEM1_RAG`: 知识库查询（< 5 秒）

- **System 2（推理路径）**：
  - `SYSTEM2_REASONING`: 复杂推理（5-60 秒）
  - `SYSTEM2_ANALYSIS`: 分析请求（10-120 秒）
  - `SYSTEM2_WEBBROWSE`: 需要网络浏览（10-180 秒）

---

**最后更新**: 2024-01-12  
**状态**: ⚠️ 代理服务账户被禁用，但降级机制正常工作
