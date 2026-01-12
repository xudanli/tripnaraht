# Claude 编排调试指南

## 🔍 问题诊断

### 测试结果分析

从测试结果看，Claude 编排没有被触发。可能的原因：

1. **ClaudeOrchestratorService 未注入**
   - 检查 `AgentModule` 是否正确注册了 `ClaudeOrchestratorService`
   - 检查依赖注入是否成功

2. **环境变量格式问题**
   - `.env` 文件中可能有引号：`USE_CLAUDE_ORCHESTRATION="true"`
   - 需要检查字符串比较逻辑

3. **服务未重启**
   - 修改 `.env` 文件后需要重启服务
   - 环境变量在服务启动时加载

## 🔧 调试步骤

### 1. 检查服务日志

查看服务启动日志，确认：
- `ClaudeOrchestratorService` 是否已初始化
- 是否有依赖注入错误

### 2. 检查环境变量

```bash
# 检查环境变量值
grep USE_CLAUDE_ORCHESTRATION .env

# 应该看到：
# USE_CLAUDE_ORCHESTRATION=true
# 或
# USE_CLAUDE_ORCHESTRATION="true"
```

### 3. 验证依赖注入

在 `AgentService` 构造函数中添加日志：

```typescript
constructor(
  // ...
  @Optional() private claudeOrchestrator?: ClaudeOrchestratorService,
) {
  this.logger.log(`ClaudeOrchestratorService injected: ${!!this.claudeOrchestrator}`);
}
```

### 4. 测试请求参数方式

即使环境变量有问题，也可以通过请求参数启用：

```json
{
  "options": {
    "use_claude_orchestration": true
  }
}
```

## 🚀 快速修复

### 方法 1: 确保环境变量正确

```bash
# .env 文件
USE_CLAUDE_ORCHESTRATION=true  # 不要加引号
```

### 方法 2: 重启服务

```bash
# 停止服务
# Ctrl+C

# 重新启动
npm run dev
```

### 方法 3: 使用请求参数（无需重启）

```json
{
  "options": {
    "use_claude_orchestration": true
  }
}
```

## 📝 验证清单

- [ ] `.env` 文件中 `USE_CLAUDE_ORCHESTRATION=true`（无引号）
- [ ] 服务已重启（环境变量已加载）
- [ ] `ClaudeOrchestratorService` 已正确注入
- [ ] `ANTHROPIC_API_KEY` 已配置
- [ ] 请求中包含 `options.use_claude_orchestration: true`

## 🧪 测试命令

```bash
# 测试 1: 使用请求参数（推荐，无需重启）
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "user_id": "user-123",
    "message": "分析 TripNARA 的市场机会",
    "options": {
      "use_claude_orchestration": true,
      "llm_provider": "anthropic"
    }
  }'

# 检查响应中是否有决策日志
# 如果有 decision_log，说明 Claude 编排已执行
```
