# Claude API Key 配置指南

## 📍 配置位置

Claude API Key 需要在 **环境变量** 中配置。

## 🔧 配置方式

### 方式 1: `.env` 文件（推荐）

在项目根目录创建或编辑 `.env` 文件：

```bash
# Claude (Anthropic) API 配置
ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022


```

**API Key 格式**：
- Claude API Key 通常以 `sk-ant-` 开头
- 完整格式：`sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

**模型选择**：
- `claude-3-5-sonnet-20241022` - Claude 3.5 Sonnet（推荐，平衡性能与成本）
- `claude-3-opus-20240229` - Claude 3 Opus（最强性能，成本较高）
- `claude-3-haiku-20240307` - Claude 3 Haiku（快速、低成本）

### 方式 2: 系统环境变量

```bash
# Linux/macOS
export ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
$env:ANTHROPIC_MODEL="claude-3-5-sonnet-20241022"
```

### 方式 3: Docker 环境变量

```yaml
# docker-compose.yml
services:
  app:
    environment:
      - ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
      - ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

## 🔍 代码中的读取位置

API Key 在以下位置被读取：

### 1. LlmService (`src/llm/services/llm.service.ts`)

```typescript
// 第 75 行：读取 API Key
const anthropicKey = this.configService?.get<string>('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY;

// 第 682-685 行：调用 Anthropic API
private async callAnthropic(prompt: string, schema?: any): Promise<string> {
  const apiKey = this.configService?.get<string>('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured (checked ConfigService and process.env)');
  }
  // ...
}
```

### 2. ClaudeOrchestratorService (`src/agent/services/claude-orchestrator.service.ts`)

通过 `LlmService` 间接使用，指定 `LlmProvider.ANTHROPIC`：

```typescript
const response = await this.llmService.callLlmWithSchema(
  LlmProvider.ANTHROPIC,  // 指定使用 Anthropic
  prompt,
  schema,
);
```

## ✅ 验证配置

### 1. 检查环境变量

```bash
# Linux/macOS
echo $ANTHROPIC_API_KEY

# Windows (PowerShell)
echo $env:ANTHROPIC_API_KEY
```

### 2. 检查服务状态

访问系统状态接口：

```bash
curl http://localhost:3000/api/system/status
```

查看返回的 `llm_provider` 字段：
- 如果配置了 `ANTHROPIC_API_KEY`，应该返回 `"anthropic"`
- 如果未配置，可能返回 `"mock"` 或 `"unavailable"`

### 3. 测试 API 调用

```bash
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "user_id": "user-123",
    "message": "测试 Claude 编排",
    "options": {
      "use_claude_orchestration": true,
      "llm_provider": "anthropic"
    }
  }'
```

## 🔐 安全建议

1. **不要提交 `.env` 文件到 Git**
   - `.env` 文件已在 `.gitignore` 中
   - 使用 `.env.example` 作为模板

2. **使用环境变量管理工具**（生产环境）
   - AWS Secrets Manager
   - HashiCorp Vault
   - Kubernetes Secrets

3. **API Key 格式验证**
   - Claude API Key 以 `sk-ant-` 开头
   - 如果格式不正确，API 调用会失败

## 📝 完整配置示例

### `.env` 文件示例

```bash
# ============================================
# Claude (Anthropic) API 配置
# ============================================
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# ============================================
# Claude 编排功能（Feature Flag）
# ============================================
USE_CLAUDE_ORCHESTRATION=true

# ============================================
# 其他 LLM 配置（可选）
# ============================================
# OPENAI_API_KEY=sk-...
# DEEPSEEK_API_KEY=sk-...
# GEMINI_API_KEY=...
```

## 🚨 常见问题

### Q1: 如何获取 Claude API Key？

**A**: 
1. 访问 [Anthropic Console](https://console.anthropic.com/)
2. 注册/登录账号
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 复制 API Key（格式：`sk-ant-api03-...`）

### Q2: API Key 配置后仍然报错？

**A**: 检查以下几点：
1. ✅ API Key 格式是否正确（以 `sk-ant-` 开头）
2. ✅ 环境变量是否已加载（重启服务）
3. ✅ `.env` 文件是否在项目根目录
4. ✅ 是否有权限访问环境变量

### Q3: 如何切换不同的 Claude 模型？

**A**: 修改 `ANTHROPIC_MODEL` 环境变量：

```bash
# 使用 Claude 3.5 Sonnet（推荐）
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# 使用 Claude 3 Opus（最强性能）
ANTHROPIC_MODEL=claude-3-opus-20240229

# 使用 Claude 3 Haiku（快速、低成本）
ANTHROPIC_MODEL=claude-3-haiku-20240307
```

### Q4: 配置后需要重启服务吗？

**A**: 是的，修改环境变量后需要重启服务：

```bash
# 停止服务
# Ctrl+C 或 kill 进程

# 重新启动
npm run dev
```

### Q5: 如何验证 API Key 是否有效？

**A**: 可以通过系统状态接口验证：

```bash
curl http://localhost:3000/api/system/status | jq '.llm_provider'
```

如果返回 `"anthropic"`，说明配置成功。

## 📚 相关文档

- [Claude 编排实现](./CLAUDE_ORCHESTRATION_IMPLEMENTATION.md)
- [Claude 使用指南](./claude.md)
- [环境变量配置](./ENV_FILE_ISSUES.md)

---

**配置位置总结**：
- ✅ **环境变量名**：`ANTHROPIC_API_KEY`
- ✅ **配置文件**：`.env`（项目根目录）
- ✅ **读取位置**：`LlmService` (`src/llm/services/llm.service.ts`)
- ✅ **使用位置**：`ClaudeOrchestratorService`、`LlmService`
