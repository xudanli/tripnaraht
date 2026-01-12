# JSON 提取优化修复

## 🐛 问题

从日志中发现，Claude API 返回的是中文文本而不是 JSON 格式：

```
Unexpected token '根', "根据意图分析结果,以"... is not valid JSON
Unexpected token '根', "根据提供的信息和原则"... is not valid JSON
```

## 🔍 根本原因

1. **Prompt 不够强调 JSON 格式**：虽然 prompt 中提到了 JSON 格式，但 Claude 可能仍然返回解释性文本
2. **缺少 JSON 提取逻辑**：代码直接使用 `JSON.parse()`，没有处理可能包含 markdown 代码块或解释性文本的情况
3. **没有错误恢复机制**：当 JSON 解析失败时，没有尝试从文本中提取 JSON

## ✅ 修复方案

### 1. 优化 Prompt（强化 JSON 格式要求）

**文件**: `src/llm/services/llm.service.ts`

在 `callAnthropic` 方法中，更强调 JSON 格式要求：

```typescript
if (schema) {
  body.messages[0].content += `\n\n【重要】你必须只返回 JSON 格式，不要包含任何其他文本、解释或 markdown 代码块标记。

请严格按照以下 JSON Schema 返回结果：

${JSON.stringify(schema, null, 2)}

要求：
1. 只返回 JSON 对象，不要包含 \`\`\`json 或 \`\`\` 标记
2. 不要添加任何解释性文字
3. 确保 JSON 格式完全有效
4. 所有字段必须符合 schema 定义`;
}
```

**文件**: `src/agent/services/claude-orchestration-prompts.ts`

在所有 prompt 的 `[输出要求]` 部分，添加强调：

```
【重要】你必须只返回 JSON 格式，不要包含任何其他文本、解释或 markdown 代码块标记（如 ```json）。

直接返回 JSON 对象，格式如下：
```

### 2. 添加 JSON 提取方法

**文件**: `src/agent/services/claude-orchestrator.service.ts`

添加 `extractJSONFromResponse` 方法，用于从文本中提取 JSON：

```typescript
/**
 * 从 LLM 响应中提取 JSON（处理可能包含 markdown 代码块或解释性文本的情况）
 */
private extractJSONFromResponse(response: string): any {
  if (!response || typeof response !== 'string') {
    throw new Error('响应为空或格式不正确');
  }

  let cleaned = response.trim();
  
  // 移除 markdown 代码块标记
  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?\s*```$/i, '');
  cleaned = cleaned.trim();
  
  // 尝试提取 JSON 对象（如果响应中包含其他文本）
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  cleaned = cleaned.trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (parseError: any) {
    this.logger.error(`JSON 解析失败，原始响应（前500字符）: ${response.substring(0, 500)}`);
    this.logger.error(`清理后的内容（前500字符）: ${cleaned.substring(0, 500)}`);
    throw parseError;
  }
}
```

### 3. 替换所有 JSON.parse 调用

将所有直接使用 `JSON.parse(response)` 的地方替换为 `extractJSONFromResponse(response)`：

- `analyzeIntent` 方法
- `decideRouting` 方法
- `selectSkills` 方法
- `generateExecutionPlan` 方法

## 🧪 验证修复

修复后，重启服务，测试请求应该：

1. **不再出现 JSON 解析错误**
2. **能够正确提取 JSON**（即使 Claude 返回了 markdown 代码块或解释性文本）
3. **日志中显示正确的意图分析、路由决策和 Skills 选择**

## 📋 修改文件清单

- ✅ `src/llm/services/llm.service.ts` - 优化 `callAnthropic` 的 prompt
- ✅ `src/agent/services/claude-orchestrator.service.ts` - 添加 `extractJSONFromResponse` 方法，替换所有 `JSON.parse` 调用
- ✅ `src/agent/services/claude-orchestration-prompts.ts` - 优化所有 prompt 的 JSON 格式要求

---

**最后更新**: 2024-01-12  
**状态**: ✅ 已修复，等待服务重启验证
