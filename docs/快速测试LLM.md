# 快速测试 LLM 功能

## 快速开始（5分钟）

### 1. 配置 API Key

在项目根目录创建或编辑 `.env` 文件：

```bash
# 选择其中一个配置（推荐 OpenAI，最容易获取）
OPENAI_API_KEY=sk-your-key-here

# 或者使用其他提供商
# GEMINI_API_KEY=your-key-here
# DEEPSEEK_API_KEY=your-key-here
# ANTHROPIC_API_KEY=your-key-here
```

### 2. 启动服务器

```bash
npm run dev
```

等待服务器启动完成（看到 `🚀 Application is running on: http://localhost:3000`）。

### 3. 运行测试脚本

```bash
./scripts/test-llm-integration.sh
```

或者手动测试：

### 4. 手动测试（使用 curl）

#### 测试 1: 自然语言创建行程

```bash
curl -X POST http://localhost:3000/trips/from-natural-language \
  -H "Content-Type: application/json" \
  -d '{
    "text": "帮我规划带娃去东京5天的行程，预算2万"
  }' | jq
```

#### 测试 2: 自然语言转参数

```bash
curl -X POST http://localhost:3000/llm/natural-language-to-params \
  -H "Content-Type: application/json" \
  -d '{
    "text": "去日本玩5天，预算2万"
  }' | jq
```

#### 测试 3: 结果人性化转化

```bash
curl -X POST http://localhost:3000/llm/humanize-result \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "itinerary_optimization",
    "data": {
      "happinessScore": 85,
      "schedule": {
        "stops": [
          {"kind": "POI", "name": "东京塔", "startMin": 540, "endMin": 660}
        ]
      }
    }
  }' | jq
```

### 5. 使用 Swagger UI 测试

1. 打开浏览器访问：`http://localhost:3000/api`
2. 找到 `llm` 标签
3. 展开 `POST /llm/natural-language-to-params`
4. 点击 "Try it out"
5. 填写测试数据：
   ```json
   {
     "text": "帮我规划带娃去东京5天的行程，预算2万"
   }
   ```
6. 点击 "Execute"

---

## 常见问题

### Q: 提示 "API Key not configured"
**A**: 检查 `.env` 文件是否配置了至少一个 LLM 提供商的 API Key。

### Q: 提示 "API error: 401"
**A**: API Key 无效或已过期，请检查 API Key 是否正确。

### Q: 解析结果不准确
**A**: 
- 尝试提供更详细的信息（如明确日期、预算等）
- 可以尝试不同的 LLM 提供商（在请求中指定 `provider` 参数）
- 查看服务器日志了解 LLM 的原始响应

### Q: 响应很慢
**A**: 
- LLM API 调用需要时间（通常 2-5 秒）
- 可以尝试使用更快的模型（如 GPT-3.5-Turbo 而不是 GPT-4）
- 检查网络连接

---

## 获取 API Key

### OpenAI
1. 访问 https://platform.openai.com/api-keys
2. 登录并创建新的 API Key
3. 复制到 `.env` 文件

### Gemini (Google)
1. 访问 https://makersuite.google.com/app/apikey
2. 创建 API Key
3. 复制到 `.env` 文件

### DeepSeek
1. 访问 https://platform.deepseek.com/api_keys
2. 创建 API Key
3. 复制到 `.env` 文件

### Anthropic (Claude)
1. 访问 https://console.anthropic.com/
2. 创建 API Key
3. 复制到 `.env` 文件

---

## 更多测试示例

查看完整测试指南：`docs/LLM功能测试指南.md`
