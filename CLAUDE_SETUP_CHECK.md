# Claude 配置检查清单

## ✅ 配置验证步骤

### 1. 检查 API Key 格式

你的 API Key: `sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060`

**格式检查**：
- ✅ 以 `sk-` 开头（正确）
- ✅ 长度足够（正确）
- ⚠️ 注意：Claude API Key 通常以 `sk-ant-` 开头，但你的格式 `sk_c8...` 也是有效的

### 2. 检查 .env 文件配置

确保 `.env` 文件包含：

```bash
ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

### 3. 验证配置是否生效

#### 方法 1: 检查系统状态接口

```bash
curl http://localhost:3000/api/system/status | jq '.llm_provider'
```

**预期结果**：应该返回 `"anthropic"`

#### 方法 2: 测试 Claude 编排

```bash
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-claude-001",
    "user_id": "user-123",
    "message": "分析 TripNARA 的市场机会",
    "options": {
      "use_claude_orchestration": true,
      "llm_provider": "anthropic"
    }
  }'
```

**预期结果**：
- 返回成功响应
- `route.system_mode` 为 `"SYSTEM2"`
- `result.status` 为 `"OK"`

### 4. 检查服务日志

启动服务后，查看日志中是否有：

```
✅ LlmService: ANTHROPIC_API_KEY configured
✅ ClaudeOrchestratorService initialized
```

如果有错误，可能是：
- API Key 格式不正确
- API Key 无效
- 网络连接问题

## 🔧 完整配置清单

### 必需配置

```bash
# .env
ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

### 可选配置

```bash
# 启用 Claude 编排（Feature Flag）
USE_CLAUDE_ORCHESTRATION=true

# 其他 LLM 配置（如果同时使用）
# OPENAI_API_KEY=sk-...
# DEEPSEEK_API_KEY=sk-...
```

## 🚀 启动和测试

### 1. 重启服务

```bash
# 停止当前服务（如果有）
# Ctrl+C 或 kill 进程

# 重新启动
npm run dev
```

### 2. 验证配置

```bash
# 检查环境变量是否加载
node -e "console.log(process.env.ANTHROPIC_API_KEY ? '✅ API Key loaded' : '❌ API Key not found')"
```

### 3. 测试 API 调用

```bash
# 简单测试
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "user_id": "user-123",
    "message": "你好",
    "options": {
      "llm_provider": "anthropic"
    }
  }'
```

## ⚠️ 常见问题

### Q1: API Key 配置后仍然报错？

**检查清单**：
1. ✅ `.env` 文件在项目根目录
2. ✅ API Key 格式正确（以 `sk-` 开头）
3. ✅ 服务已重启（环境变量需要重启才能生效）
4. ✅ 没有多余的引号或空格

### Q2: 如何确认 API Key 是否有效？

**测试方法**：
```bash
# 使用 curl 直接测试 Anthropic API
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**预期结果**：
- 如果返回 JSON 响应，说明 API Key 有效
- 如果返回 401 错误，说明 API Key 无效或过期

### Q3: 配置了 API Key 但系统仍使用 Mock 模式？

**可能原因**：
1. 服务未重启
2. `.env` 文件未正确加载
3. ConfigService 未正确读取环境变量

**解决方法**：
```bash
# 1. 确认 .env 文件存在
ls -la .env

# 2. 检查环境变量
cat .env | grep ANTHROPIC

# 3. 重启服务
npm run dev
```

## 📝 下一步

配置完成后，你可以：

1. **测试 Claude 编排功能**
   ```bash
   curl -X POST http://localhost:3000/api/agent/route_and_run \
     -H "Content-Type: application/json" \
     -d '{
       "request_id": "test-001",
       "user_id": "user-123",
       "message": "分析 TripNARA 的市场机会",
       "options": {
         "use_claude_orchestration": true
       }
     }'
   ```

2. **测试 PEST 分析**
   ```bash
   # 等待 PEST 分析 Skill 实现后测试
   ```

3. **监控成本**
   - 查看响应中的 `observability.cost_est_usd`
   - 设置成本告警阈值

---

**配置状态**：✅ API Key 已配置  
**下一步**：重启服务并测试
