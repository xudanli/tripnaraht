# Anthropic 代理配置完成

## ✅ 已完成的配置

### 1. 代码修改

已修改 `src/llm/services/llm.service.ts` 的 `callAnthropic` 方法，支持自定义 base URL：

```typescript
// 支持自定义 base URL（用于代理）
const baseUrl = this.configService?.get<string>('ANTHROPIC_BASE_URL') || 
                process.env.ANTHROPIC_BASE_URL || 
                'https://api.anthropic.com';

// 构建完整的 API URL
const apiUrl = baseUrl.endsWith('/v1/messages') 
  ? baseUrl 
  : `${baseUrl.replace(/\/$/, '')}/v1/messages`;
```

### 2. 环境变量配置

`.env` 文件中的配置：

```bash
ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_BASE_URL=https://hongmacode.com/api
```

### 3. API URL 构建

- Base URL: `https://hongmacode.com/api`
- 最终 API URL: `https://hongmacode.com/api/v1/messages`

## 🚀 下一步

### 1. 重启服务

修改 `.env` 文件后，**必须重启服务**才能生效：

```bash
# Docker 方式
docker restart tripnara-app

# 或直接运行
# 停止服务（Ctrl+C）
# 重新启动
npm run dev
```

### 2. 验证配置

重启后，查看服务日志：

```bash
docker logs tripnara-app --tail 50 | grep -i anthropic
```

应该看到：
```
[Anthropic] 调用 API: https://hongmacode.com/api/v1/messages, model: claude-3-5-sonnet-20241022
```

### 3. 测试请求

发送测试请求：

```bash
curl -X POST http://127.0.0.1:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "user_id": "user-123",
    "message": "测试",
    "options": {
      "use_claude_orchestration": true,
      "llm_provider": "anthropic"
    }
  }'
```

**成功标志**：
- 不再出现 `invalid x-api-key` 错误
- 日志中显示使用代理 URL
- 响应中包含决策日志

## 📋 配置检查清单

- [x] 代码已修改支持自定义 base URL
- [x] `.env` 文件中 `ANTHROPIC_BASE_URL` 已配置
- [x] `ANTHROPIC_BASE_URL` 格式正确（无引号、无空格）
- [ ] 服务已重启（待执行）
- [ ] 日志验证通过（待验证）
- [ ] 测试请求成功（待测试）

## ⚠️ 注意事项

1. **代理服务兼容性**：确保 `https://hongmacode.com/api` 代理服务：
   - 兼容 Anthropic API 的请求格式
   - 支持 `/v1/messages` 端点
   - 正确处理请求头（`x-api-key`, `anthropic-version`）

2. **API Key 格式**：使用代理时，API Key 格式可能不受限制（代理服务会处理），但建议使用正确的格式。

3. **错误处理**：如果代理服务返回错误，代码会记录详细的错误信息，便于调试。

## 🔄 切换配置

如果需要切换回官方 Anthropic API：

```bash
# 方式 1: 注释掉 ANTHROPIC_BASE_URL
# ANTHROPIC_BASE_URL=https://hongmacode.com/api

# 方式 2: 设置为官方 URL
ANTHROPIC_BASE_URL=https://api.anthropic.com
```

---

**最后更新**: 2024-01-12  
**状态**: ✅ 配置完成，待重启服务验证
