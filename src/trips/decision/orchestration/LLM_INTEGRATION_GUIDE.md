# LangGraph Agent LLM 集成指南

## 当前状态

PlannerAgentService 和 NarratorAgentService **已经实现了 LLM 集成**，但需要通过环境变量启用。

## 实现检查

### ✅ PlannerAgentService

**位置**: `src/trips/decision/orchestration/planner-agent.service.ts`

**状态**: ✅ **已集成 LLM**

- ✅ 使用 `LlmService.callLlmWithSchema()` 方法
- ✅ 支持结构化输出（JSON Schema）
- ✅ 有回退机制（LLM 失败时使用规则匹配）
- ⚠️ 启用条件：需要 `OPENAI_API_KEY` 环境变量

**关键代码**:
```typescript
// 检查是否启用 LLM
this.useLlm = !!llmService && !!process.env.OPENAI_API_KEY;

// LLM 分析
if (this.useLlm && this.llmService) {
  try {
    return await this.analyzeQueryWithLlm(query);
  } catch (error) {
    // 回退到规则匹配
    return this.analyzeQueryWithRules(query);
  }
}
```

### ✅ NarratorAgentService

**位置**: `src/trips/decision/orchestration/narrator-agent.service.ts`

**状态**: ✅ **已集成 LLM**

- ✅ 使用 `LlmService.callLlmWithSchema()` 方法
- ✅ 支持生成友好的自然语言解释
- ✅ 有回退机制（LLM 失败时使用模板）
- ⚠️ 启用条件：需要 `OPENAI_API_KEY` 环境变量

**关键代码**:
```typescript
// 检查是否启用 LLM
this.useLlm = !!llmService && !!process.env.OPENAI_API_KEY;

// LLM 生成解释
if (this.useLlm && this.llmService) {
  try {
    return await this.generateExplanationWithLlm(coreToolOutput, complianceResult);
  } catch (error) {
    // 回退到模板模式
    return this.generateSuccessExplanation(coreToolOutput, complianceResult);
  }
}
```

## 如何启用 LLM

### 方法 1: 设置环境变量（推荐）

```bash
# .env 文件
OPENAI_API_KEY=sk-your-api-key-here
```

### 方法 2: 使用其他 LLM 提供商

代码中已经支持多种 LLM 提供商，但 Planner/Narrator 目前硬编码使用 OpenAI。可以修改代码支持其他提供商：

```typescript
// 当前代码（planner-agent.service.ts:96）
const response = await this.llmService!.callLlmWithSchema(
  LlmProvider.OPENAI,  // 硬编码为 OpenAI
  prompt,
  schema
);

// 可以改为使用默认提供商
const response = await this.llmService!.callLlmWithSchema(
  this.llmService.defaultProvider,  // 使用配置的默认提供商
  prompt,
  schema
);
```

**支持的提供商**:
- `LlmProvider.OPENAI` - OpenAI GPT
- `LlmProvider.DEEPSEEK` - DeepSeek
- `LlmProvider.GEMINI` - Google Gemini
- `LlmProvider.ANTHROPIC` - Anthropic Claude

## 验证 LLM 是否启用

### 检查日志

当服务启动时，会输出日志：

```
[PlannerAgentService] Planner Agent: LLM 已启用
[NarratorAgentService] Narrator Agent: LLM 已启用
```

如果没有启用，会看到：

```
[PlannerAgentService] Planner Agent: 使用规则匹配模式（LLM 未启用）
[NarratorAgentService] Narrator Agent: 使用模板模式（LLM 未启用）
```

### 测试方法

1. **启动服务**:
   ```bash
   npm run dev
   ```

2. **查看启动日志**，确认是否看到 "LLM 已启用"

3. **测试 Planner Agent**:
   - 发送一个自然语言查询
   - 检查日志中是否有 LLM 调用记录
   - 如果 LLM 启用，应该看到更准确的参数提取

4. **测试 Narrator Agent**:
   - 执行一次决策流程
   - 检查返回的解释文本
   - 如果 LLM 启用，解释应该更自然、更友好

## 改进建议

### 1. 使用配置服务（而不是直接读取环境变量）

**当前问题**: 直接使用 `process.env.OPENAI_API_KEY`，不符合 NestJS 最佳实践

**改进方案**:
```typescript
constructor(
  @Optional() private readonly llmService?: LlmService,
  private readonly configService: ConfigService,  // 添加 ConfigService
) {
  // 使用 ConfigService 读取配置
  const apiKey = this.configService.get<string>('OPENAI_API_KEY') || 
                 this.configService.get<string>('DEEPSEEK_API_KEY') ||
                 this.configService.get<string>('ANTHROPIC_API_KEY');
  this.useLlm = !!llmService && !!apiKey;
}
```

### 2. 支持多 LLM 提供商（使用默认提供商）

**当前问题**: 硬编码使用 `LlmProvider.OPENAI`

**改进方案**:
```typescript
// 在 LlmService 中添加 getDefaultProvider() 方法
async analyzeQueryWithLlm(query: string) {
  const provider = this.llmService?.getDefaultProvider() || LlmProvider.OPENAI;
  const response = await this.llmService!.callLlmWithSchema(
    provider,  // 使用默认提供商
    prompt,
    schema
  );
}
```

### 3. 改进启用检测逻辑

**当前问题**: 只检查 `OPENAI_API_KEY`，即使配置了其他提供商的 API Key 也不会启用

**改进方案**:
```typescript
constructor(
  @Optional() private readonly llmService?: LlmService,
  private readonly configService: ConfigService,
) {
  // 检查是否有任何 LLM API Key
  const hasAnyApiKey = !!(
    this.configService.get<string>('OPENAI_API_KEY') ||
    this.configService.get<string>('DEEPSEEK_API_KEY') ||
    this.configService.get<string>('GEMINI_API_KEY') ||
    this.configService.get<string>('ANTHROPIC_API_KEY')
  );
  this.useLlm = !!llmService && hasAnyApiKey;
}
```

## 模块配置检查

确保 `DecisionModule` 正确导入了 `LlmModule`:

```typescript
// src/trips/decision/decision.module.ts
@Module({
  imports: [
    LlmModule,  // 确保导入 LlmModule
    // ... 其他模块
  ],
  providers: [
    PlannerAgentService,
    NarratorAgentService,
    // ... 其他服务
  ],
  // ...
})
export class DecisionModule {}
```

## 总结

✅ **LLM 集成已完成**，代码实现是正确的

⚠️ **需要设置环境变量**才能启用 LLM 功能

💡 **改进建议**：
1. 使用 ConfigService 而不是直接读取环境变量
2. 支持多 LLM 提供商（使用默认提供商）
3. 改进启用检测逻辑（检查所有可能的 API Key）

这些改进是可选的，不影响核心功能。当前实现已经可以使用，只需要配置 API Key 即可。

