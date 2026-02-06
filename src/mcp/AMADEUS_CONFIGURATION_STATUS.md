# Amadeus MCP 配置状态

## 当前问题

即使通过 Smithery Connect API 的 `headers` 传递 Amadeus API 凭证，调用工具时仍然报告 "Configuration required"。

## 测试结果

### ✅ 成功的测试
- 连接创建成功，状态为 `connected`
- Headers 已正确传递（`amadeus-client-id`, `amadeus-client-secret`）
- `ping` 工具可以调用成功（在测试脚本中）

### ❌ 失败的测试
- `search_flight_offers` 工具调用时报告 "Configuration required"
- 即使连接状态为 `connected`，配置似乎没有被服务器读取

## 可能的原因

根据 Smithery 文档，配置传递取决于服务器端是否定义了配置 schema（使用 `x-from` metadata）。如果服务器没有定义配置 schema，则：

1. **Headers 传递可能不起作用** - 服务器可能不会读取 headers 中的配置
2. **需要在 Smithery 平台上手动配置** - 通过 UI 界面配置凭证
3. **配置可能需要通过其他方式传递** - 如查询参数（如果服务器支持）

## 解决方案

### 方案 1: 在 Smithery 平台上手动配置（推荐）

1. 访问 https://smithery.ai/server/almogqwinz/mcp-amadeus-api
2. 登录您的 Smithery 账户
3. 在服务器设置中配置 Amadeus API 凭证：
   - API Key (Client ID): `pjYQqsUBVbaW4sIsEQbVvWN5e9hwpMKe`
   - API Secret (Client Secret): `G3UeGUiulAGEQA3J`
   - Base URL/Hostname: `test` 或 `test.api.amadeus.com`
4. 保存配置后，通过 Connect API 连接即可使用

### 方案 2: 检查服务器配置 schema

查看 Amadeus MCP 服务器的 `smithery.yaml` 或源代码，确认：
- 是否定义了配置 schema
- 配置字段的 `x-from` metadata 是什么
- 是否需要特定的 header 名称或查询参数

### 方案 3: 直接使用 Amadeus API（不通过 MCP）

如果 MCP 服务器配置问题无法解决，可以直接调用 Amadeus API：

```typescript
import Amadeus from 'amadeus';

const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_CLIENT_ID,
  clientSecret: process.env.AMADEUS_CLIENT_SECRET,
  hostname: 'test', // 或 'production'
});

const response = await amadeus.shopping.flightOffersSearch.get({
  originLocationCode: 'SYD',
  destinationLocationCode: 'BKK',
  departureDate: '2026-05-02',
  adults: 1,
});
```

## 当前代码状态

代码已更新为通过 `headers` 传递配置：
- ✅ 支持 `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET` 环境变量
- ✅ 支持 `AMADEUS_API_KEY` / `AMADEUS_API_SECRET` 环境变量（兼容）
- ✅ 自动传递 `amadeus-hostname`（如果设置了 `AMADEUS_HOSTNAME`）
- ✅ 连接创建成功，状态为 `connected`
- ❌ 工具调用时仍然报告需要配置

## 下一步

1. 在 Smithery 平台上手动配置凭证
2. 或联系 Amadeus MCP 服务器维护者，确认配置传递方式
3. 或考虑直接使用 Amadeus API SDK
