# Airbnb MCP 使用 Connect API 指南

## 🎯 为什么使用 Connect API？

Smithery Connect API 提供了更可靠的认证流程：

- ✅ **自动客户端注册** - 无需手动处理客户端注册
- ✅ **自动 OAuth 处理** - 简化 OAuth 流程
- ✅ **更好的错误处理** - 清晰的错误信息
- ✅ **安全性** - 凭证加密存储

## 📋 设置步骤

### 步骤 1: 获取 Smithery API Key

1. 访问 https://smithery.ai/account/api-keys
2. 登录您的 Smithery 账户
3. 创建新的 API Key
4. 复制 API Key

### 步骤 2: 设置环境变量

```bash
export SMITHERY_API_KEY="your-api-key-here"
```

或在 `.env` 文件中：

```
SMITHERY_API_KEY=your-api-key-here
```

### 步骤 3: 安装依赖

```bash
npm install @smithery/api
```

### 步骤 4: 使用 Connect API 客户端

```typescript
import { AirbnbMcpClientConnectAPI } from './src/mcp/airbnb-client-connect-api';

async function example() {
  const client = new AirbnbMcpClientConnectAPI();
  
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
      // 按照错误信息中的 URL 完成认证
      // 然后使用 connectionId 重新连接
      const connectionId = client.getConnectionId();
      if (connectionId) {
        await client.reconnect(connectionId);
      }
    } else {
      console.error('错误:', error);
    }
  } finally {
    await client.disconnect();
  }
}
```

## 🔐 OAuth 流程

### 首次连接

1. **调用 `connect()`**
   ```typescript
   await client.connect();
   ```

2. **如果抛出 `SmitheryAuthorizationError`**
   - 错误信息包含 `authorizationUrl`
   - 访问该 URL 完成 OAuth
   - 保存 `connectionId`

3. **认证完成后重新连接**
   ```typescript
   await client.reconnect(savedConnectionId);
   ```

### 后续使用

使用保存的 `connectionId` 直接连接：

```typescript
// 不指定 namespace，让 SDK 自动处理（推荐）
const client = new AirbnbMcpClientConnectAPI(undefined, savedConnectionId);
await client.connect();
```

## 📝 完整示例

```typescript
import { AirbnbMcpClientConnectAPI } from './src/mcp/airbnb-client-connect-api';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function main() {
  // 尝试加载保存的 connectionId
  const configDir = path.join(os.homedir(), '.tripnara-mcp');
  const connectionIdFile = path.join(configDir, 'airbnb-connection-id.txt');
  
  let savedConnectionId: string | undefined;
  if (fs.existsSync(connectionIdFile)) {
    savedConnectionId = fs.readFileSync(connectionIdFile, 'utf-8').trim();
  }

  // 不指定 namespace，让 SDK 自动处理（推荐）
const client = new AirbnbMcpClientConnectAPI(undefined, savedConnectionId);

  try {
    await client.connect();
    
    // 保存 connectionId
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const connectionId = client.getConnectionId();
    if (connectionId) {
      fs.writeFileSync(connectionIdFile, connectionId);
    }
    
    // 使用客户端
    const tools = await client.listTools();
    console.log('可用工具:', tools);
    
  } catch (error: any) {
    if (error.message?.includes('OAuth authorization required')) {
      console.log('\n需要完成 OAuth 认证');
      console.log('请按照错误信息中的 URL 完成认证');
      console.log('认证完成后，使用保存的 connectionId 重新运行\n');
    } else {
      console.error('错误:', error);
    }
  } finally {
    await client.disconnect();
  }
}

main();
```

## 🔄 迁移指南

如果您当前使用直接 OAuth 方式，可以迁移到 Connect API：

1. **安装依赖**
   ```bash
   npm install @smithery/api
   ```

2. **设置环境变量**
   ```bash
   export SMITHERY_API_KEY="your-api-key"
   ```

3. **更新代码**
   - 使用 `AirbnbMcpClientConnectAPI` 替代 `AirbnbMcpClient`
   - 按照上面的示例更新代码

4. **测试**
   ```bash
   npm run mcp:test:airbnb
   ```

## 📚 相关文档

- [Smithery Connect API 文档](https://smithery.ai/docs/use/connect-api)
- [认证问题排查](./AIRBNB_AUTH_TROUBLESHOOTING.md)
- [快速开始指南](./AIRBNB_QUICKSTART.md)

---

**建议**: 对于生产环境，使用 Connect API 是更好的选择。
