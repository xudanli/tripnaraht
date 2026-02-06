# Connect API 快速开始

## ✅ 已完成的设置

1. ✅ 已安装 `@smithery/api` 包
2. ✅ 已创建 Airbnb Connect API 客户端
3. ✅ 已创建测试脚本

## 🚀 快速开始（3 步）

### 步骤 1: 获取 API Key

**详细步骤请参考**: [API Key 申请指南](./SMITHERY_API_KEY_SETUP.md)

**快速步骤**:
1. 访问 https://smithery.ai 并登录（如果没有账户，先注册）
2. 访问 https://smithery.ai/account/api-keys
3. 点击 "Create API Key" 或 "New API Key"
4. 输入名称（例如：`TripNara Development`）
5. 复制生成的 API Key（只显示一次，请立即保存）

### 步骤 2: 设置环境变量

在 `.env` 文件中添加：

```bash

```

或在终端中：

```bash
export SMITHERY_API_KEY="your-api-key-here"
```

### 步骤 3: 运行测试

```bash
npm run mcp:test:airbnb:connect
```

## 📋 完整流程

### 首次使用

1. **设置 API Key**（见步骤 2）

2. **运行测试脚本**
   ```bash
   npm run mcp:test:airbnb:connect
   ```

3. **如果提示需要 OAuth 认证**
   - 脚本会显示认证 URL
   - 在浏览器中打开并完成认证
   - 脚本会自动保存 connectionId
   - 重新运行脚本即可自动连接

4. **验证连接**
   - 如果看到 "✅ 连接成功！" 说明设置完成
   - 可以开始使用 Airbnb MCP 服务

### 后续使用

connectionId 已保存，直接运行：

```bash
npm run mcp:test:airbnb:connect
```

会自动使用保存的 connectionId 连接。

## 💻 在代码中使用

```typescript
import { AirbnbMcpClientConnectAPI } from './src/mcp/airbnb-client-connect-api';

const client = new AirbnbMcpClientConnectAPI();
await client.connect();

// 列出工具
const tools = await client.listTools();

// 调用工具
const result = await client.callTool('tool_name', {});
```

## 📚 相关文档

- [Connect API 设置指南](./AIRBNB_CONNECT_API_SETUP.md) - 详细设置步骤
- [Connect API 使用指南](./AIRBNB_CONNECT_API_GUIDE.md) - 完整使用文档
- [认证问题排查](./AIRBNB_AUTH_TROUBLESHOOTING.md) - 问题排查

---

**现在就开始**: 设置 `SMITHERY_API_KEY` 并运行 `npm run mcp:test:airbnb:connect`！
