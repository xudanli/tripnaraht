# Airbnb MCP Connect API 设置指南

## ✅ 已完成的设置

1. ✅ 已安装 `@smithery/api` 包
2. ✅ 已创建 Connect API 客户端 (`airbnb-client-connect-api.ts`)
3. ✅ 已创建测试脚本 (`test-airbnb-connect-api.ts`)

## 📋 设置步骤

### 步骤 1: 获取 Smithery API Key

**详细步骤请参考**: [API Key 申请指南](./SMITHERY_API_KEY_SETUP.md)

**快速步骤**:
1. **访问 Smithery 官网**: https://smithery.ai
2. **登录或注册账户**（如果没有账户）
3. **访问 API Keys 页面**: https://smithery.ai/account/api-keys
4. **创建 API Key**:
   - 点击 "Create API Key" 或 "New API Key"
   - 输入名称（例如：`TripNara Development`）
   - 点击 "Create" 或 "Generate"
5. **复制并保存 API Key**（只显示一次，请立即保存）

### 步骤 2: 设置环境变量

#### 方式 1: 使用 .env 文件（推荐）

在项目根目录的 `.env` 文件中添加：

```bash
SMITHERY_API_KEY=your-api-key-here
```

**注意**: 确保 `.env` 文件在 `.gitignore` 中，不要提交到版本控制。

#### 方式 2: 使用 export 命令（临时）

```bash
export SMITHERY_API_KEY="your-api-key-here"
```

#### 方式 3: 在脚本中设置（不推荐）

```bash
SMITHERY_API_KEY="your-api-key-here" npm run mcp:test:airbnb:connect
```

### 步骤 3: 验证设置

运行测试脚本验证设置：

```bash
npm run mcp:test:airbnb:connect
```

如果看到以下输出，说明设置成功：

```
🔌 正在连接到 Airbnb MCP 服务器（使用 Connect API）...
✅ Connected to Airbnb MCP server via Connect API
✅ 连接成功！
```

## 🔐 首次认证流程

### 如果出现 OAuth 认证提示

1. **脚本会显示认证 URL**
   ```
   🔐 ============================================
   Airbnb 认证
   ============================================
   
   请访问以下 URL 完成 Airbnb 认证:
   
   https://auth.smithery.ai/...
   ```

2. **访问认证 URL**
   - 在浏览器中打开显示的 URL
   - 完成 Airbnb 登录和授权

3. **保存 connectionId**
   - 脚本会自动保存 `connectionId` 到 `~/.tripnara-mcp/airbnb-connection-id.txt`
   - 下次运行脚本时会自动使用保存的 connectionId

4. **重新运行脚本**
   ```bash
   npm run mcp:test:airbnb:connect
   ```
   - 这次应该会自动连接成功

## 📁 文件位置

- **客户端类**: `src/mcp/airbnb-client-connect-api.ts`
- **测试脚本**: `scripts/test-airbnb-connect-api.ts`
- **connectionId 存储**: `~/.tripnara-mcp/airbnb-connection-id.txt`

## 💻 在代码中使用

```typescript
import { AirbnbMcpClientConnectAPI } from './src/mcp/airbnb-client-connect-api';

async function example() {
  // 使用保存的 connectionId（如果有）
  const configDir = path.join(os.homedir(), '.tripnara-mcp');
  const connectionIdFile = path.join(configDir, 'airbnb-connection-id.txt');
  let connectionId: string | undefined;
  
  if (fs.existsSync(connectionIdFile)) {
    connectionId = fs.readFileSync(connectionIdFile, 'utf-8').trim();
  }

  // 不指定 namespace，让 SDK 自动处理（推荐）
const client = new AirbnbMcpClientConnectAPI(undefined, connectionId);
  
  try {
    await client.connect();
    
    // 列出工具
    const tools = await client.listTools();
    console.log('可用工具:', tools);
    
    // 调用工具
    const result = await client.callTool('tool_name', {});
    console.log('结果:', result);
    
  } catch (error: any) {
    if (error.message?.includes('OAuth authorization required')) {
      // 需要 OAuth 认证
      const connectionId = client.getConnectionId();
      if (connectionId) {
        // 保存 connectionId，认证完成后使用 reconnect()
        await client.reconnect(connectionId);
      }
    }
  } finally {
    await client.disconnect();
  }
}
```

## 🔄 迁移指南

如果您之前使用直接 OAuth 方式，可以迁移到 Connect API：

1. **设置环境变量**
   ```bash
   export SMITHERY_API_KEY="your-api-key"
   ```

2. **更新代码**
   - 使用 `AirbnbMcpClientConnectAPI` 替代 `AirbnbMcpClient`
   - 参考上面的代码示例

3. **测试**
   ```bash
   npm run mcp:test:airbnb:connect
   ```

## ❓ 常见问题

### Q: 如何获取 API Key？

A: 访问 https://smithery.ai/account/api-keys，登录后创建新的 API Key。

### Q: API Key 安全吗？

A: 
- ✅ API Key 应该保密，不要提交到版本控制
- ✅ 生产环境建议使用环境变量或密钥管理服务
- ✅ 可以创建多个 API Key，按用途分别管理

### Q: connectionId 是什么？

A: connectionId 是 Smithery Connect API 为每个连接分配的唯一标识符。保存后可以用于后续连接，无需重新认证。

### Q: 如何重新认证？

A: 删除保存的 connectionId 文件：

```bash
rm ~/.tripnara-mcp/airbnb-connection-id.txt
```

然后重新运行测试脚本。

## 📚 相关文档

- [Connect API 使用指南](./AIRBNB_CONNECT_API_GUIDE.md)
- [认证问题排查](./AIRBNB_AUTH_TROUBLESHOOTING.md)
- [快速开始指南](./AIRBNB_QUICKSTART.md)
- [Smithery Connect API 文档](https://smithery.ai/docs/use/connect-api)

---

**下一步**: 设置 `SMITHERY_API_KEY` 环境变量，然后运行 `npm run mcp:test:airbnb:connect` 开始使用！
