# LLM 提供商可配置化修复

## 🐛 问题

用户发现即使选择了 DeepSeek 模型，Claude 编排服务仍然强制使用 Anthropic API。

### 根本原因

`ClaudeOrchestratorService` 中所有 LLM 调用都硬编码了 `LlmProvider.ANTHROPIC`：

```typescript
// 所有方法都硬编码使用 ANTHROPIC
await this.llmService.callLlmWithSchema(LlmProvider.ANTHROPIC, prompt, schema);
```

这导致：
1. 即使请求中指定了 `llm_provider: 'deepseek'`，仍然使用 Anthropic
2. 即使系统默认提供商是 DeepSeek，仍然使用 Anthropic
3. 当 Anthropic 不可用时（如组织账户被禁用），无法降级到其他提供商

## ✅ 修复方案

### 1. 支持可配置的 LLM 提供商

**添加 `getLlmProvider` 方法**：
- 优先使用请求参数中的 `llm_provider`
- 如果未指定或为 `'auto'`，使用系统默认提供商

### 2. 添加降级机制

**添加 `callLlmWithFallback` 方法**：
- 首先尝试主提供商
- 如果失败，自动尝试降级提供商（DeepSeek → OpenAI → Gemini）
- 记录降级日志

### 3. 修改所有 LLM 调用

将所有硬编码的 `LlmProvider.ANTHROPIC` 替换为：
- 从请求参数或系统默认值获取提供商
- 使用 `callLlmWithFallback` 方法（支持自动降级）

## 📋 代码修改

### 新增方法

```typescript
/**
 * 获取 LLM 提供商（支持请求参数和降级机制）
 */
private getLlmProvider(request: RouteAndRunRequestDto): LlmProvider {
  // 1. 优先使用请求参数中的 llm_provider
  const requestProvider = request.options?.llm_provider;
  if (requestProvider && requestProvider !== 'auto') {
    switch (requestProvider) {
      case 'openai': return LlmProvider.OPENAI;
      case 'deepseek': return LlmProvider.DEEPSEEK;
      case 'gemini': return LlmProvider.GEMINI;
      case 'anthropic': return LlmProvider.ANTHROPIC;
    }
  }
  
  // 2. 使用系统默认提供商
  return this.llmService.getDefaultProvider();
}

/**
 * 使用 LLM 调用，支持降级机制
 */
private async callLlmWithFallback(
  primaryProvider: LlmProvider,
  prompt: string,
  schema: any,
  operationName: string,
): Promise<string> {
  // 首先尝试主提供商
  try {
    return await this.llmService.callLlmWithSchema(primaryProvider, prompt, schema);
  } catch (error: any) {
    // 如果主提供商失败，尝试降级提供商
    const fallbackProviders = this.getFallbackProviders(primaryProvider);
    for (const fallbackProvider of fallbackProviders) {
      try {
        return await this.llmService.callLlmWithSchema(fallbackProvider, prompt, schema);
      } catch (fallbackError: any) {
        continue;
      }
    }
    throw error;
  }
}
```

### 修改的方法

1. **`orchestrate`** - 获取 LLM 提供商并传递给所有子方法
2. **`analyzeIntent`** - 接受 `provider` 参数，使用 `callLlmWithFallback`
3. **`decideRouting`** - 接受 `provider` 参数，使用 `callLlmWithFallback`
4. **`selectSkills`** - 接受 `provider` 参数，使用 `callLlmWithFallback`
5. **`planExecution`** - 接受 `provider` 参数，使用 `callLlmWithFallback`

## 🚀 使用方式

### 方式 1: 通过请求参数指定

```json
{
  "request_id": "req-001",
  "user_id": "user-123",
  "message": "推荐一些好吃的地方",
  "options": {
    "use_claude_orchestration": true,
    "llm_provider": "deepseek"  // 指定使用 DeepSeek
  }
}
```

### 方式 2: 使用系统默认值

```json
{
  "request_id": "req-001",
  "user_id": "user-123",
  "message": "推荐一些好吃的地方",
  "options": {
    "use_claude_orchestration": true,
    "llm_provider": "auto"  // 或省略，使用系统默认值
  }
}
```

系统默认提供商的优先级：
1. DeepSeek（如果配置了 `DEEPSEEK_API_KEY`）
2. OpenAI（如果配置了 `OPENAI_API_KEY`）
3. Gemini（如果配置了 `GEMINI_API_KEY`）
4. Anthropic（如果配置了 `ANTHROPIC_API_KEY`）
5. DeepSeek（默认）

## ✅ 降级机制

当主提供商失败时，自动尝试：

1. **DeepSeek**（优先，成本低、速度快）
2. **OpenAI**（其次）
3. **Gemini**（最后）

例如：
- 如果指定 `llm_provider: 'anthropic'` 但 Anthropic 失败
- 自动降级到 DeepSeek → OpenAI → Gemini

## 📋 修改文件

- ✅ `src/agent/services/claude-orchestrator.service.ts`
  - 添加 `getLlmProvider` 方法
  - 添加 `getFallbackProviders` 方法
  - 添加 `callLlmWithFallback` 方法
  - 修改所有 LLM 调用方法，支持可配置提供商和降级

---

**最后更新**: 2024-01-12  
**状态**: ✅ 已修复，等待服务重启验证
