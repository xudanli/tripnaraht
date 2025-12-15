# LLM 功能测试指南

本文档说明如何测试新实现的 LLM 集成功能。

## 前置准备

### 1. 配置环境变量

在 `.env` 文件中配置至少一个 LLM 提供商的 API Key：

```bash
# OpenAI (推荐用于快速测试)
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-3.5-turbo  # 可选，默认 gpt-3.5-turbo

# 或使用 Gemini
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-pro  # 可选，默认 gemini-pro

# 或使用 DeepSeek
DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_MODEL=deepseek-chat  # 可选，默认 deepseek-chat

# 或使用 Anthropic Claude
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-3-haiku-20240307  # 可选，默认 claude-3-haiku-20240307
```

**优先级**：系统会按以下顺序选择可用的提供商：
1. OpenAI
2. Gemini
3. DeepSeek
4. Anthropic

### 2. 启动服务器

```bash
# 开发模式（自动重载）
npm run dev

# 或生产模式
npm run build
npm start
```

服务器启动后，访问 `http://localhost:3000/api` 查看 Swagger 文档。

---

## 测试接口

### 1. 自然语言创建行程

**接口**: `POST /trips/from-natural-language`

**功能**: 将自然语言描述转换为行程创建参数，并自动创建行程。

#### 测试用例 1: 完整信息

```bash
curl -X POST http://localhost:3000/trips/from-natural-language \
  -H "Content-Type: application/json" \
  -d '{
    "text": "帮我规划带娃去东京5天的行程，预算2万",
    "llmProvider": "openai"
  }'
```

**预期结果**:
```json
{
  "success": true,
  "data": {
    "trip": {
      "id": "uuid",
      "destination": "JP",
      "startDate": "2024-05-01T00:00:00.000Z",
      "endDate": "2024-05-05T00:00:00.000Z",
      ...
    },
    "parsedParams": {
      "destination": "JP",
      "startDate": "2024-05-01T00:00:00.000Z",
      "endDate": "2024-05-05T00:00:00.000Z",
      "totalBudget": 20000,
      "hasChildren": true,
      "hasElderly": false
    }
  }
}
```

#### 测试用例 2: 信息不足（需要澄清）

```bash
curl -X POST http://localhost:3000/trips/from-natural-language \
  -H "Content-Type: application/json" \
  -d '{
    "text": "我想去日本玩"
  }'
```

**预期结果**:
```json
{
  "success": true,
  "data": {
    "needsClarification": true,
    "clarificationQuestions": [
      "请告诉我您的出行日期？",
      "请告诉我您的预算范围？"
    ],
    "partialParams": {
      "destination": "JP",
      ...
    }
  }
}
```

#### 测试用例 3: 带老人出行

```bash
curl -X POST http://localhost:3000/trips/from-natural-language \
  -H "Content-Type: application/json" \
  -d '{
    "text": "带父母去杭州玩3天，预算1万5"
  }'
```

---

### 2. 自然语言转接口参数

**接口**: `POST /llm/natural-language-to-params`

**功能**: 仅解析自然语言，不创建行程（用于调试）。

```bash
curl -X POST http://localhost:3000/llm/natural-language-to-params \
  -H "Content-Type: application/json" \
  -d '{
    "text": "帮我规划带娃去东京5天的行程，预算2万",
    "provider": "openai"
  }'
```

**预期结果**:
```json
{
  "success": true,
  "data": {
    "params": {
      "destination": "JP",
      "startDate": "2024-05-01T00:00:00.000Z",
      "endDate": "2024-05-05T00:00:00.000Z",
      "totalBudget": 20000,
      "hasChildren": true,
      "hasElderly": false
    },
    "needsClarification": false
  }
}
```

---

### 3. 结果人性化转化

**接口**: `POST /llm/humanize-result`

**功能**: 将接口返回的结构化数据转化为自然语言描述。

#### 测试用例 1: 路线优化结果

```bash
# 先调用路线优化接口获取结果
curl -X POST http://localhost:3000/itinerary-optimization/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "placeIds": [1, 2, 3, 4, 5],
    "config": {
      "date": "2024-05-01",
      "startTime": "2024-05-01T09:00:00.000Z",
      "endTime": "2024-05-01T18:00:00.000Z",
      "pacingFactor": 1.0
    }
  }' > optimization-result.json

# 然后调用人性化转化接口
curl -X POST http://localhost:3000/llm/humanize-result \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "itinerary_optimization",
    "data": <从 optimization-result.json 复制数据>
  }'
```

**预期结果**:
```json
{
  "success": true,
  "data": {
    "description": "根据您的需求，我为您规划了以下行程：\n\n上午9点前往东京塔，预计游玩2小时。之后顺路前往浅草寺，预计游玩1.5小时。中午12:30在附近用餐。下午继续游览其他景点。\n\n整个路线经过优化，避免了折返跑，游玩体验分为85分。"
  }
}
```

#### 测试用例 2: What-If 评估结果

```bash
curl -X POST http://localhost:3000/llm/humanize-result \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "what_if_evaluation",
    "data": {
      "base": {
        "metrics": {
          "windowMissRate": 0.15,
          "completionRate": 0.85
        }
      },
      "candidates": [
        {
          "id": "candidate-1",
          "metrics": {
            "windowMissRate": 0.08,
            "completionRate": 0.92
          }
        }
      ]
    }
  }'
```

---

### 4. 决策支持

**接口**: `POST /llm/decision-support`

**功能**: 基于接口数据提供智能决策建议。

```bash
curl -X POST http://localhost:3000/llm/decision-support \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "评估当前行程的稳健度，并提供优化建议",
    "contextData": {
      "schedule": {
        "stops": [...],
        "metrics": {
          "totalTravelMin": 120,
          "totalWalkMin": 60
        }
      },
      "riskMetrics": {
        "windowMissRate": 0.15,
        "completionRate": 0.85
      }
    },
    "provider": "openai"
  }'
```

**预期结果**:
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "title": "提前出发时间",
        "description": "建议将第一个景点的时间提前30分钟，可以降低时间窗口错过概率",
        "confidence": 0.85,
        "reasoning": "当前行程时间安排较紧，提前出发可以为后续行程留出缓冲时间"
      },
      {
        "title": "减少景点数量",
        "description": "可以考虑减少1-2个景点，提高完成率",
        "confidence": 0.75,
        "reasoning": "当前行程包含5个景点，时间分配较紧张"
      }
    ],
    "summary": "当前行程整体稳健度中等，建议通过提前出发时间和适当减少景点数量来提升完成率。"
  }
}
```

---

## 完整测试流程示例

### 场景：用户通过自然语言创建并优化行程

```bash
# 步骤 1: 自然语言创建行程
TRIP_RESPONSE=$(curl -X POST http://localhost:3000/trips/from-natural-language \
  -H "Content-Type: application/json" \
  -d '{
    "text": "帮我规划带娃去东京5天的行程，预算2万"
  }')

# 提取 tripId
TRIP_ID=$(echo $TRIP_RESPONSE | jq -r '.data.trip.id')
echo "Created trip: $TRIP_ID"

# 步骤 2: 添加景点并优化路线
OPTIMIZE_RESPONSE=$(curl -X POST http://localhost:3000/itinerary-optimization/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "placeIds": [1, 2, 3, 4, 5],
    "config": {
      "date": "2024-05-01",
      "startTime": "2024-05-01T09:00:00.000Z",
      "endTime": "2024-05-01T18:00:00.000Z",
      "pacingFactor": 1.0,
      "hasChildren": true
    }
  }')

# 步骤 3: 人性化转化优化结果
curl -X POST http://localhost:3000/llm/humanize-result \
  -H "Content-Type: application/json" \
  -d "{
    \"dataType\": \"itinerary_optimization\",
    \"data\": $(echo $OPTIMIZE_RESPONSE | jq '.data')
  }"
```

---

## 使用 Swagger UI 测试

1. 启动服务器后，访问 `http://localhost:3000/api`
2. 找到 `llm` 和 `trips` 标签
3. 展开对应的接口
4. 点击 "Try it out"
5. 填写请求参数
6. 点击 "Execute" 执行

---

## 常见问题排查

### 1. API Key 未配置

**错误信息**: `OPENAI_API_KEY not configured`

**解决方法**: 在 `.env` 文件中配置至少一个 LLM 提供商的 API Key。

### 2. LLM API 调用失败

**错误信息**: `OpenAI API error: 401` 或类似

**解决方法**:
- 检查 API Key 是否正确
- 检查 API Key 是否有足够的额度
- 检查网络连接

### 3. 解析结果不符合预期

**可能原因**:
- LLM 模型理解有误
- Prompt 需要优化
- 输入信息过于模糊

**解决方法**:
- 提供更详细的输入信息
- 查看 LLM 返回的原始响应（在日志中）
- 调整 prompt（修改 `llm.service.ts` 中的 prompt 方法）

### 4. 类型错误

**错误信息**: `Type 'xxx' is not assignable to type 'yyy'`

**解决方法**: 检查 DTO 定义和实际返回的数据结构是否匹配。

---

## 调试技巧

### 1. 查看 LLM 原始响应

在 `llm.service.ts` 中添加日志：

```typescript
private async callOpenAI(prompt: string, schema?: any): Promise<string> {
  // ... 现有代码 ...
  
  const response = await fetch(...);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  // 添加日志
  this.logger.debug('LLM Response:', content);
  
  return content;
}
```

### 2. 测试不同的 LLM 提供商

```bash
# 测试 OpenAI
curl -X POST http://localhost:3000/llm/natural-language-to-params \
  -H "Content-Type: application/json" \
  -d '{"text": "去日本5天", "provider": "openai"}'

# 测试 Gemini
curl -X POST http://localhost:3000/llm/natural-language-to-params \
  -H "Content-Type: application/json" \
  -d '{"text": "去日本5天", "provider": "gemini"}'
```

### 3. 验证 JSON 解析

如果 LLM 返回的 JSON 格式不正确，可以在 `llm.service.ts` 中添加验证：

```typescript
try {
  const parsed = JSON.parse(response);
  // 验证必需字段
  if (!parsed.destination) {
    throw new Error('Missing required field: destination');
  }
  return parsed;
} catch (error) {
  this.logger.error('Failed to parse LLM response:', response);
  throw error;
}
```

---

## 性能测试

### 测试响应时间

```bash
time curl -X POST http://localhost:3000/trips/from-natural-language \
  -H "Content-Type: application/json" \
  -d '{"text": "去日本5天，预算2万"}'
```

### 并发测试

```bash
# 使用 Apache Bench
ab -n 10 -c 2 -p request.json -T application/json \
  http://localhost:3000/llm/natural-language-to-params
```

---

## 下一步

1. **集成到前端**: 在前端界面中添加自然语言输入框
2. **优化 Prompt**: 根据实际使用情况调整 prompt，提高解析准确率
3. **添加缓存**: 对常见的自然语言输入进行缓存，减少 LLM 调用
4. **错误处理**: 完善错误处理逻辑，提供更友好的错误提示
5. **A/B 测试**: 测试不同 LLM 提供商的效果，选择最适合的模型
