# Connect API 问题解决方案

## ✅ 问题已解决！

**问题**：`404 Invalid credentials or namespace not found` 错误

**解决方案**：不指定 namespace，让 SDK 自动处理

## 🎯 关键发现

通过测试发现，当不指定 namespace 时，`createConnection` 函数会自动：
1. 使用第一个已存在的 namespace，或
2. 创建一个新的 namespace

这避免了手动创建 namespace 的麻烦，也解决了 namespace 不存在的问题。

## 📝 代码更改

### 之前（有问题）

```typescript
// ❌ 指定可能不存在的 namespace
const client = new AirbnbMcpClientConnectAPI('tripnara');
```

### 现在（已修复）

```typescript
// ✅ 不指定 namespace，让 SDK 自动处理
const client = new AirbnbMcpClientConnectAPI();
// 或明确传入 undefined
const client = new AirbnbMcpClientConnectAPI(undefined);
```

## 🧪 测试结果

```
✅ Connected to Airbnb MCP server via Connect API
✅ 连接成功！
💾 已保存 connectionId: meadowlark-bEDi
🛠️  测试 1: 列出所有可用工具
找到 4 个工具:
  - airbnb_search
  - airbnb_listing_details
  - getListingPhotos
  - analyzeListingPhotos
✅ 测试 1 通过
```

## 📚 相关文件

- **客户端实现**: `src/mcp/airbnb-client-connect-api.ts`
- **测试脚本**: `scripts/test-airbnb-connect-api.ts`
- **诊断脚本**: `scripts/test-smithery-api-direct.ts`

## 💡 最佳实践

1. **不指定 namespace**：让 SDK 自动处理，避免 namespace 不存在的问题
2. **保存 connectionId**：首次连接后保存 connectionId，后续可以直接使用
3. **处理 OAuth**：如果需要 OAuth 认证，SDK 会自动提示并提供授权 URL

## 🔄 后续步骤

现在可以正常使用 Airbnb MCP 服务了！

1. **运行测试**：
   ```bash
   npm run mcp:test:airbnb:connect
   ```

2. **在代码中使用**：
   ```typescript
   import { AirbnbMcpClientConnectAPI } from './src/mcp/airbnb-client-connect-api';
   
   const client = new AirbnbMcpClientConnectAPI();
   await client.connect();
   const tools = await client.listTools();
   ```

3. **处理 OAuth**（如果需要）：
   - SDK 会自动检测是否需要 OAuth
   - 如果需要，会抛出 `SmitheryAuthorizationError` 并提供授权 URL
   - 完成授权后，使用返回的 `connectionId` 重新连接

---

**状态**: ✅ 已解决并测试通过
