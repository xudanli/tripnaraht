# 自然语言创建接口不澄清问题分析

## 问题描述

用户只输入"去冰岛"，系统就成功创建了行程，没有进行澄清询问。系统自动填充了预算（¥35,000）和日期（2024-12-10 到 2024-12-17），但这些信息用户并没有提供。

## 问题根因

### 1. Prompt 与 Schema 不一致

**Prompt 中的要求**（第704行）:
```
如果信息不足，请尽量推断合理默认值，但标记 needsClarification 为 true
```

**问题**：
- Prompt 要求 LLM 标记 `needsClarification`
- 但 JSON Schema 中**没有定义** `needsClarification` 字段
- LLM 无法在返回的 JSON 中包含这个字段（Schema 验证会失败）

**代码位置**：
- Prompt 定义：`src/llm/services/llm.service.ts:704`
- Schema 定义：`src/llm/services/llm.service.ts:777-804`
- 验证逻辑：`src/llm/services/llm.service.ts:129`

### 2. 验证逻辑过于简单

**当前验证逻辑**（第129行）:
```typescript
if (!parsed.destination || !parsed.startDate || !parsed.endDate || !parsed.totalBudget) {
  return {
    needsClarification: true,
    // ...
  };
}
```

**问题**：
- 只检查字段**是否存在**，不检查值是否合理
- LLM 会推断默认值（如使用当前日期、推断预算），所有字段都有值
- 即使值都是推断的，验证也会通过，返回 `needsClarification: false`

### 3. Prompt 引导 LLM 推断默认值

**Prompt 内容**（第694-695行）:
```
- startDate: 开始日期（ISO 8601 格式，如果未指定则使用当前日期）
- endDate: 结束日期（ISO 8601 格式，根据天数推算）
```

**问题**：
- Prompt 明确要求 LLM 推断默认值
- LLM 会按照要求推断，导致所有字段都有值
- 即使信息不足，LLM 也会返回完整的参数

## 解决方案

### 方案 1: 在 JSON Schema 中添加 needsClarification 字段（推荐）

**优点**：
- 与 Prompt 要求一致
- LLM 可以明确标记哪些值是推断的
- 逻辑清晰

**实现**：

1. **修改 JSON Schema**（`getTripCreationSchema` 方法）:
```typescript
private getTripCreationSchema(): any {
  return {
    type: 'object',
    properties: {
      destination: { type: 'string' },
      startDate: { type: 'string' },
      endDate: { type: 'string' },
      totalBudget: { type: 'number' },
      hasChildren: { type: 'boolean' },
      hasElderly: { type: 'boolean' },
      preferences: { type: 'object' },
      // ✅ 添加这个字段
      needsClarification: { 
        type: 'boolean',
        description: '如果任何关键信息是推断的，设置为 true'
      },
      // ✅ 可选：标记哪些字段是推断的
      inferredFields: {
        type: 'array',
        items: { type: 'string' },
        description: '推断的字段列表，如 ["startDate", "totalBudget"]'
      }
    },
    required: ['destination', 'startDate', 'endDate', 'totalBudget'],
  };
}
```

2. **修改验证逻辑**（`naturalLanguageToTripParams` 方法）:
```typescript
// 验证必需字段
const hasAllRequiredFields = parsed.destination && parsed.startDate && parsed.endDate && parsed.totalBudget;

if (!hasAllRequiredFields) {
  // 字段缺失
  return {
    params: parsed as TripCreationParams,
    needsClarification: true,
    clarificationQuestions: this.generateClarificationQuestions(parsed),
  };
}

// ✅ 检查 LLM 标记的 needsClarification
if (parsed.needsClarification === true) {
  return {
    params: parsed as TripCreationParams,
    needsClarification: true,
    clarificationQuestions: this.generateClarificationQuestions(parsed, parsed.inferredFields),
  };
}

return {
  params: parsed as TripCreationParams,
  needsClarification: false,
};
```

3. **优化 Prompt**（`buildTripCreationPrompt` 方法）:
```typescript
private buildTripCreationPrompt(text: string): string {
  return `你是一个智能旅行规划助手。用户说："${text}"

请从用户的自然语言中提取以下信息，并返回 JSON 格式：
- destination: 目的地国家代码（ISO 3166-1 alpha-2，如 JP、CN、US）
- startDate: 开始日期（ISO 8601 格式）
- endDate: 结束日期（ISO 8601 格式）
- totalBudget: 总预算（人民币，元）
- hasChildren: 是否有小孩（布尔值）
- hasElderly: 是否有老人（布尔值）
- preferences: 其他偏好（对象，可选）
- needsClarification: 如果任何关键信息（日期、预算）是推断的，设置为 true
- inferredFields: 推断的字段列表，如 ["startDate", "totalBudget"]

注意：
- 如果用户明确提到日期，使用用户提供的日期
- 如果用户明确提到预算，使用用户提供的预算
- 如果用户未明确提到日期或预算，可以推断合理默认值，但必须：
  1. 设置 needsClarification 为 true
  2. 在 inferredFields 中列出推断的字段
- 不要为了填充字段而随意推断，如果信息严重不足，某些字段可以留空（但需要在返回中标记）

返回的 JSON 格式示例：
{
  "destination": "JP",
  "startDate": "2024-05-01T00:00:00.000Z",
  "endDate": "2024-05-05T00:00:00.000Z",
  "totalBudget": 20000,
  "hasChildren": true,
  "hasElderly": false,
  "preferences": {},
  "needsClarification": false,
  "inferredFields": []
}`;
}
```

4. **优化 generateClarificationQuestions**:
```typescript
private generateClarificationQuestions(parsed: any, inferredFields?: string[]): string[] {
  const questions: string[] = [];
  
  if (!parsed.destination) {
    questions.push('请告诉我您想去哪个国家或地区？');
  }
  
  // ✅ 如果字段是推断的，也要询问
  if (inferredFields?.includes('startDate') || inferredFields?.includes('endDate') || 
      (!parsed.startDate || !parsed.endDate)) {
    questions.push('请告诉我您的出行日期？');
  }
  
  if (inferredFields?.includes('totalBudget') || !parsed.totalBudget) {
    questions.push('请告诉我您的预算范围？');
  }
  
  return questions;
}
```

### 方案 2: 修改 Prompt，不要推断默认值（保守方案）

**优点**：
- 实现简单
- 确保用户提供所有关键信息

**缺点**：
- 用户体验可能较差（必须提供所有信息）
- 不符合"智能推断"的期望

**实现**：

修改 Prompt，移除推断默认值的指令：
```typescript
private buildTripCreationPrompt(text: string): string {
  return `你是一个智能旅行规划助手。用户说："${text}"

请从用户的自然语言中提取以下信息，并返回 JSON 格式：
- destination: 目的地国家代码（ISO 3166-1 alpha-2，如 JP、CN、US）
- startDate: 开始日期（ISO 8601 格式，**必须是用户明确提到的日期**）
- endDate: 结束日期（ISO 8601 格式，**必须是用户明确提到的日期**）
- totalBudget: 总预算（人民币，元，**必须是用户明确提到的预算**）
- hasChildren: 是否有小孩（布尔值）
- hasElderly: 是否有老人（布尔值）
- preferences: 其他偏好（对象，可选）

注意：
- 如果用户未明确提到日期，startDate 和 endDate 可以为 null
- 如果用户未明确提到预算，totalBudget 可以为 null
- 不要推断或猜测用户未提供的信息

...`;
}
```

然后修改验证逻辑，如果字段为 null，返回需要澄清。

### 方案 3: 添加启发式验证（折中方案）

不修改 Schema，在验证逻辑中添加启发式检查：

```typescript
// 检查日期是否为默认值（当前日期）
const isDefaultDate = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date.getTime() === today.getTime();
};

// 检查预算是否为常见默认值
const isDefaultBudget = (budget: number): boolean => {
  // 常见推断的预算值：30000, 35000, 40000 等
  const commonDefaults = [30000, 35000, 40000, 50000];
  return commonDefaults.includes(budget);
};

// 在验证逻辑中添加
if (!parsed.destination || !parsed.startDate || !parsed.endDate || !parsed.totalBudget) {
  return { needsClarification: true, ... };
}

// 检查是否为推断的默认值
const hasInferredValues = 
  isDefaultDate(parsed.startDate) || 
  isDefaultBudget(parsed.totalBudget);

if (hasInferredValues) {
  // 可以标记为需要澄清，或者只记录日志
  this.logger.warn('Detected inferred values, consider asking for clarification');
  // 可以选择返回 needsClarification: true
}
```

**缺点**：
- 不够精确（无法准确判断是否是推断值）
- 维护成本高（需要维护默认值列表）

## 推荐方案

**推荐使用方案 1**，因为：
1. ✅ 与现有 Prompt 设计一致
2. ✅ 逻辑清晰，LLM 可以明确标记推断的字段
3. ✅ 易于维护和扩展
4. ✅ 用户体验好（智能推断 + 明确标记）

## 相关文件

- `src/llm/services/llm.service.ts` - LLM 服务实现
- `src/trips/trips.controller.ts:67-167` - 自然语言创建接口
- `src/llm/dto/llm-request.dto.ts` - DTO 定义

