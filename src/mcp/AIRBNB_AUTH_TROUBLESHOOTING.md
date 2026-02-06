# Airbnb MCP 认证问题排查

## 🔍 问题描述

在尝试连接 Airbnb MCP 服务时，遇到 `invalid_client` 错误：

```json
{"error":"invalid_client", "error_description":"Invalid client_id"}
```

## 📋 可能的原因

1. **客户端未注册**: MCP SDK 需要先注册客户端才能使用 OAuth
2. **服务配置问题**: Airbnb MCP 服务可能需要特殊配置
3. **认证流程问题**: 可能需要使用 Smithery Connect API 而不是直接 OAuth

## 🔧 解决方案

### 方案 1: 使用 Smithery Connect API（推荐）⭐

Smithery 提供了 Connect API，可以自动处理 OAuth 和客户端注册。这需要：

1. **获取 Smithery API Key**
   - 访问 https://smithery.ai/account/api-keys
   - 创建 API Key

2. **安装 Smithery API SDK**
   ```bash
   npm install @smithery/api
   ```

3. **使用 Connect API**
   ```typescript
   import { createConnection } from '@smithery/api/mcp';
   import { Client } from '@modelcontextprotocol/sdk/client/index.js';

   try {
     const { transport } = await createConnection({
       mcpUrl: 'https://server.smithery.ai/iclickfreedownloads/mcp-server-airbnb',
     });

     const client = new Client({
       name: 'tripnara-airbnb-client',
       version: '1.0.0',
     });

     await client.connect(transport);
     // 现在可以使用了
   } catch (error) {
     if (error instanceof SmitheryAuthorizationError) {
       // 需要 OAuth，重定向用户到 error.authorizationUrl
       console.log('请访问:', error.authorizationUrl);
     }
   }
   ```

### 方案 2: 修复直接 OAuth（当前实现）

如果继续使用直接 OAuth，可能需要：

1. **确保客户端信息正确保存**
   - 检查 `~/.tripnara-mcp/mcp-server-airbnb-client-info.json` 是否存在
   - 如果不存在，MCP SDK 会在首次连接时自动注册

2. **检查 OAuth Provider 配置**
   - 确保 `clientMetadata` 配置正确
   - 确保 `redirectUrl` 正确

3. **手动触发客户端注册**
   - 删除现有的客户端信息文件
   - 重新运行认证脚本

### 方案 3: 检查服务状态

1. **验证服务 URL**
   - 确认服务 URL 正确: `https://server.smithery.ai/iclickfreedownloads/mcp-server-airbnb`
   - 检查服务是否可用

2. **查看服务页面**
   - 访问 https://smithery.ai/server/iclickfreedownloads/mcp-server-airbnb
   - 查看服务是否需要特殊配置

## 🛠️ 临时解决方案

### 步骤 1: 清理现有认证信息

```bash
rm -rf ~/.tripnara-mcp/mcp-server-airbnb-*
```

### 步骤 2: 重新运行认证

```bash
npm run mcp:auth:airbnb
```

### 步骤 3: 如果仍然失败

考虑使用 Smithery Connect API（方案 1），它提供了更可靠的认证流程。

## 📚 相关资源

- [Smithery Connect API 文档](https://smithery.ai/docs/use/connect-api)
- [MCP OAuth 规范](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [Smithery 支持](mailto:support@smithery.ai)

## 💡 建议

对于生产环境，建议使用 **Smithery Connect API**（方案 1），因为：

- ✅ 自动处理客户端注册
- ✅ 自动处理 OAuth 流程
- ✅ 更可靠的错误处理
- ✅ 更好的安全性

对于开发/测试环境，可以继续使用直接 OAuth，但需要确保客户端正确注册。

---

**注意**: 如果问题持续存在，建议联系 Smithery 支持或查看服务的具体配置要求。
