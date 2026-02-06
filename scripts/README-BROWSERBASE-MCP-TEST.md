# Browserbase MCP API 测试指南

## 📋 概述

本文档介绍如何测试 Browserbase MCP 服务的 API 端点。

## 🔧 前置条件

### 1. 环境变量配置

在 `.env` 文件中配置 Browserbase MCP 服务器 URL（可选）：

```bash
# Browserbase MCP 服务器 URL（可选，有默认值）
BROWSERBASE_MCP_SERVER_URL=https://server.smithery.ai/@browserbasehq/mcp-browserbase

# Browserbase API Key（如果服务需要）
BROWSERBASE_API_KEY=your-api-key-here
BROWSERBASE_PROJECT_ID=your-project-id-here
```

**注意**: Browserbase MCP 服务可能需要 Browserbase API Key 和 Project ID。请确保在服务器端正确配置。

### 2. 启动服务

确保 NestJS 应用正在运行：

```bash
npm run start:dev
```

## 🧪 运行自动化测试

### 使用测试脚本

```bash
npm run test:browserbase-mcp:api
```

或者直接运行：

```bash
npx tsx scripts/test-browserbase-mcp-api.ts
```

### 测试覆盖

测试脚本会测试以下端点：

1. ✅ **健康检查** - `GET /api/browserbase-mcp/health`
2. ✅ **列出工具** - `GET /api/browserbase-mcp/tools`
3. ✅ **创建会话** - `POST /api/browserbase-mcp/session/create`
4. ✅ **导航** - `POST /api/browserbase-mcp/navigate`
5. ✅ **截图** - `POST /api/browserbase-mcp/screenshot`
6. ✅ **执行 JavaScript** - `POST /api/browserbase-mcp/evaluate`
7. ✅ **错误处理** - 无效参数测试

## 📡 手动测试（使用 curl）

### 1. 健康检查

```bash
curl http://localhost:3000/api/browserbase-mcp/health
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "available": true,
    "service": "browserbase-mcp"
  }
}
```

### 2. 列出工具

```bash
curl http://localhost:3000/api/browserbase-mcp/tools
```

### 3. 创建浏览器会话

```bash
curl -X POST http://localhost:3000/api/browserbase-mcp/session/create \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "viewport": {
      "width": 1920,
      "height": 1080
    }
  }'
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "sessionId": "session-123456"
  }
}
```

### 4. 导航到 URL

```bash
curl -X POST http://localhost:3000/api/browserbase-mcp/navigate \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123456",
    "url": "https://example.com",
    "waitUntil": "load"
  }'
```

### 5. 截图

```bash
curl -X POST http://localhost:3000/api/browserbase-mcp/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123456",
    "fullPage": false,
    "quality": 90
  }'
```

### 6. 执行 JavaScript

```bash
curl -X POST http://localhost:3000/api/browserbase-mcp/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123456",
    "script": "document.title"
  }'
```

### 7. 点击元素

```bash
curl -X POST http://localhost:3000/api/browserbase-mcp/click \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123456",
    "selector": "button#submit",
    "waitForNavigation": false
  }'
```

## 🌐 Swagger UI

访问 Swagger UI 查看完整的 API 文档：

```
http://localhost:3000/api-docs
```

在 Swagger UI 中：
1. 找到 `browserbase-mcp` 标签
2. 展开各个端点
3. 点击 "Try it out" 进行测试

## ⚠️ 常见问题

### 1. 服务不可用

**错误**: `Browserbase MCP service is not available`

**解决方案**:
- 检查 `BROWSERBASE_MCP_SERVER_URL` 环境变量
- 确保 Browserbase MCP 服务器可访问
- 检查网络连接

### 2. 认证错误

**错误**: `Authentication failed` 或 `Invalid API key`

**解决方案**:
- 确保在服务器端配置了 `BROWSERBASE_API_KEY` 和 `BROWSERBASE_PROJECT_ID`
- 检查 API Key 是否有效
- 确认 Project ID 是否正确

### 3. 会话创建失败

**错误**: `Failed to create session`

**解决方案**:
- 检查 Browserbase 账户状态
- 确认账户有足够的配额
- 检查 API Key 权限

### 4. 导航超时

**错误**: `Navigation timeout`

**解决方案**:
- 检查目标 URL 是否可访问
- 尝试增加超时时间
- 检查网络连接

## 📚 相关文档

- **设置指南**: `src/mcp/BROWSERBASE_MCP_SETUP_GUIDE.md` - API Key 申请指南 ⭐
- **前端 API 文档**: `src/mcp/BROWSERBASE_MCP_FRONTEND_API.md`
- **Browserbase 官方文档**: https://docs.browserbase.com
- **Smithery 服务器页面**: https://smithery.ai/server/@browserbasehq/mcp-browserbase

---

**最后更新**: 2026-02-06
