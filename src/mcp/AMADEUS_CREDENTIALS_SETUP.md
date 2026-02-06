# Amadeus API 凭证配置指南

## 📋 凭证说明

根据您提供的图片，Amadeus API 需要两个凭证：

1. **API Key (Client ID)**: `pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe`
   - 这是可见的 API Key
   - 用于标识您的应用

2. **API Secret (Client Secret)**: （被掩码）
   - 这是私密的 API Secret
   - 需要点击眼睛图标查看完整值
   - **重要**: 请妥善保管，不要泄露

3. **Base URL**: `test.api.amadeus.com`
   - 测试环境的 API 地址

## 🔧 配置方式

### 方式 1: 通过 Smithery 平台配置（推荐）⭐

根据 Smithery 文档，MCP 服务器的配置（如 API 密钥）通常在 Smithery 平台上完成：

1. **访问 Smithery 平台**
   - 登录 https://smithery.ai
   - 访问 Amadeus MCP 服务器页面：https://smithery.ai/server/almogqwinz/mcp-amadeus-api
   - 或者通过 "Run" 按钮打开聊天界面

2. **配置凭证**
   - 首次连接时，Smithery 会提示配置 Amadeus API 凭证
   - 输入以下信息：
     - **API Key**: `pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe`
     - **API Secret**: `G3UeGUiulAGEQA3J`（从 .env 文件中获取）
     - **Base URL**: `test.api.amadeus.com`
   - 保存配置

3. **使用连接**
   - 配置完成后，通过 Connect API 连接即可使用
   - 凭证会保存在 Smithery 平台上，后续连接自动使用

### 方式 2: 通过环境变量（如果支持）

如果 Smithery Connect API 支持传递配置，可以在 `.env` 文件中设置：

```bash
# Amadeus API 凭证
AMADEUS_API_KEY=pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe
AMADEUS_API_SECRET=your-api-secret-here
AMADEUS_BASE_URL=test.api.amadeus.com
```

**注意**: 当前代码已支持读取这些环境变量，但需要确认 Smithery Connect API 是否支持传递配置。

### 方式 3: 直接使用 Amadeus API（不通过 MCP）

如果 MCP 服务不支持配置凭证，可以直接调用 Amadeus API：

```typescript
// 直接使用 Amadeus API
const amadeus = require('amadeus');

const client = new amadeus({
  clientId: 'pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe',
  clientSecret: 'your-api-secret',
  hostname: 'test',
});
```

## 📝 当前状态

- ✅ 代码已更新，支持读取环境变量
- ⚠️ 需要确认 Smithery Connect API 是否支持传递配置
- ⚠️ 如果 Connect API 不支持，需要在 Smithery 平台上配置

## 🔍 验证配置

运行测试脚本检查配置：

```bash
npm run test:amadeus:service
```

如果看到 "Configuration required" 错误，说明需要配置凭证。

## 💡 建议

1. **首先尝试**: 在 Smithery 平台上配置 Amadeus API 凭证
2. **如果不行**: 联系 Smithery 支持或查看 Amadeus MCP 服务文档
3. **备选方案**: 直接使用 Amadeus API SDK（不通过 MCP）

---

**状态**: ⚠️ 需要配置 Amadeus API 凭证才能使用搜索功能
