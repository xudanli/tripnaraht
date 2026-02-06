# Amadeus MCP 服务器设置配置指南

## 📍 当前页面说明

您当前看到的 **"API Keys"** 页面是用于管理 **Smithery 平台本身的 API 密钥**（如 `SMITHERY_API_KEY`），**不是**配置 Amadeus MCP 服务器设置的地方。

## 🔍 如何找到服务器设置

### ⚠️ 重要说明

根据 Smithery 文档，**服务器配置方式取决于服务器是否定义了配置 schema**：

- **如果服务器定义了配置 schema**：Smithery 会自动生成配置表单，用户可以通过 UI 配置
- **如果服务器没有定义配置 schema**：无法通过 Smithery UI 配置，需要在服务器端配置

### 方法 1: 通过 "Run" 按钮尝试配置

1. **访问服务器页面**
   - 点击顶部导航栏的 **"MCPs"** 链接，或直接访问：
   - https://smithery.ai/server/almogqwinz/mcp-amadeus-api

2. **点击 "Run" 按钮**
   - 在服务器页面右侧找到 **"Run"** 按钮（橙色）
   - 点击后会打开聊天界面

3. **查看是否有配置提示**
   - 如果服务器定义了配置 schema，首次连接时会显示配置表单
   - 输入以下信息（如果提示）：
     ```
     Client ID: pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe
     Client Secret: G3UeGUiulAGEQA3J
     Hostname: test
     ```

4. **如果看不到配置表单**
   - 说明服务器可能没有定义配置 schema
   - 需要查看服务器源代码或文档

### 方法 2: 通过 Connect API 配置（当前已实现，但可能不生效）

根据 Smithery 文档，**只有服务器定义了配置 schema 时，才能通过 Connect API 传递配置**。

**当前代码已实现：**
```typescript
const conn = await smithery.experimental.connect.connections.create(namespace, {
  mcpUrl: 'https://server.smithery.ai/@almogqwinz/mcp-amadeus-api',
  headers: {
    'amadeus-client-id': process.env.AMADEUS_CLIENT_ID,
    'amadeus-client-secret': process.env.AMADEUS_CLIENT_SECRET,
  },
});
```

**当前状态：** 即使传递了 headers，服务器仍然报告需要配置，说明：
- ❌ 服务器可能**没有定义配置 schema**
- ❌ 或者 header 名称不正确（需要查看服务器的 `x-from` metadata）

### 方法 3: 检查服务器源代码（推荐）

查看 Amadeus MCP 服务器是否定义了配置 schema：

1. **访问 GitHub 仓库**
   - https://github.com/almogqwinz/mcp-amadeus-api
   - 查看 `smithery.yaml`、`server.py` 或服务器源代码

2. **查找配置 schema**
   - 查看是否定义了 `configSchema`（TypeScript）或 JSON Schema
   - 确认 `x-from` metadata 指定的 header 名称
   - 例如：
     ```typescript
     configSchema: z.object({
       clientId: z.string().meta({"x-from": {header: "amadeus-client-id"}}),
       clientSecret: z.string().meta({"x-from": {header: "amadeus-client-secret"}}),
     })
     ```

3. **如果没有配置 schema**
   - 说明服务器需要在部署时配置环境变量
   - 或者服务器维护者需要在服务器端硬编码配置
   - **这种情况下，用户无法通过 Smithery UI 或 Connect API 配置**

## 🔧 推荐的配置步骤

### 步骤 1: 尝试通过 "Run" 按钮配置

1. 访问：https://smithery.ai/server/almogqwinz/mcp-amadeus-api
2. 点击 **"Run"** 按钮
3. 如果提示配置，输入以下信息：
   ```
   Client ID: pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe
   Client Secret: G3UeGUiulAGEQA3J
   Hostname: test
   ```

### 步骤 2: 检查连接状态

配置完成后，运行测试脚本验证：

```bash
npm run test:amadeus:search
```

### 步骤 3: 如果仍然失败

如果通过 UI 配置后仍然失败，可能需要：

1. **检查服务器是否支持配置**
   - 查看服务器文档或 GitHub Issues
   - 确认服务器是否实现了配置 schema

2. **使用直接 API 调用（备选方案）**
   - 不通过 MCP，直接使用 Amadeus API SDK
   - 参考 `AMADEUS_CONFIGURATION_STATUS.md` 中的方案 3

## 📝 当前配置状态

- ✅ 代码已支持通过 headers 传递配置
- ✅ 环境变量已设置（`.env` 文件）
- ✅ 连接创建成功（状态：`connected`）
- ❌ 工具调用时报告需要配置

## 💡 下一步操作

### 立即尝试：

1. **访问服务器页面**
   - 打开：https://smithery.ai/server/almogqwinz/mcp-amadeus-api
   - 点击 **"Run"** 按钮
   - 查看是否有配置表单出现

2. **如果没有配置表单**
   - 检查服务器 GitHub 仓库：https://github.com/almogqwinz/mcp-amadeus-api
   - 查看是否有 `configSchema` 定义
   - 查看 Issues 或文档，了解如何配置

3. **如果服务器不支持用户配置**
   - 考虑联系服务器维护者，请求添加配置支持
   - 或使用备选方案：直接调用 Amadeus API SDK

### 备选方案：直接使用 Amadeus API

如果 MCP 服务器配置问题无法解决，可以直接使用 Amadeus API SDK：

```bash
npm install amadeus
```

```typescript
import Amadeus from 'amadeus';

const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_CLIENT_ID,
  clientSecret: process.env.AMADEUS_CLIENT_SECRET,
  hostname: 'test',
});

const response = await amadeus.shopping.flightOffersSearch.get({
  originLocationCode: 'SYD',
  destinationLocationCode: 'BKK',
  departureDate: '2026-05-02',
  adults: 1,
});
```

---

**总结：** 如果服务器没有定义配置 schema，**无法通过 Smithery UI 或 Connect API 配置**。需要在服务器端配置，或使用直接 API 调用。
