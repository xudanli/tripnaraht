# Rail MCP 服务集成指南

## 📋 概述

本文档说明如何将 [Smithery 提供的 Rail MCP 服务](https://smithery.ai/server/DeniseLewis200081/rail) 集成到项目中。

### 服务信息

- **服务名称**: Rail MCP Server
- **服务 URL**: `https://server.smithery.ai/DeniseLewis200081/rail`
- **服务类型**: 远程 HTTP/SSE MCP 服务器
- **功能**: 提供铁路查询、时刻表、预订等功能
- **认证要求**: ⚠️ **需要 OAuth 认证**（服务强制要求）

### ⚠️ 重要提示

**Rail MCP 服务需要 OAuth 认证**。如果暂时不需要铁路功能，可以禁用：
- 设置环境变量: `ENABLE_RAIL_MCP=false`
- 详见: [认证说明](./RAIL_MCP_AUTH_REQUIRED.md)

---

## 🔧 集成方式

### 方式 1: 在 Cursor 中使用（推荐）⭐

Rail 工具已经集成到 MCP Skills Server 中，重启 Cursor 后即可使用：

1. **搜索路线**:
   ```
   搜索从巴黎到伦敦的火车路线
   ```

2. **获取时刻表**:
   ```
   获取明天从阿姆斯特丹到布鲁塞尔的火车时刻表
   ```

3. **检查可用性**:
   ```
   检查从柏林到慕尼黑的火车票是否可用
   ```

---

## 🛠️ 可用工具列表

Rail MCP 服务器提供的工具会在连接时动态发现。工具名称格式为 `rail.{tool_name}`。

**注意**: 具体工具列表取决于 Rail MCP 服务器的实现。连接后会自动注册所有可用工具。

---

## 💡 使用场景

### 场景 1: 搜索铁路路线

在生成行程时，搜索城市间的铁路路线：

```typescript
async function searchRailRoute(origin: string, destination: string) {
  const client = getRailClient();
  await client.connect();
  
  const result = await client.callTool('searchRoutes', {
    origin,
    destination,
  });
  
  await client.disconnect();
  return result;
}
```

### 场景 2: 获取时刻表

获取特定日期的火车时刻表：

```typescript
async function getRailSchedule(origin: string, destination: string, date: string) {
  const client = getRailClient();
  await client.connect();
  
  const result = await client.callTool('getSchedule', {
    origin,
    destination,
    date,
  });
  
  await client.disconnect();
  return result;
}
```

### 场景 3: 检查可用性

检查特定路线的车票可用性：

```typescript
async function checkRailAvailability(routeId: string, date: string) {
  const client = getRailClient();
  await client.connect();
  
  const result = await client.callTool('checkAvailability', {
    routeId,
    date,
  });
  
  await client.disconnect();
  return result;
}
```

---

## 🧪 测试连接

### 测试方法 1: 使用测试脚本

运行测试脚本验证集成：

```bash
npm run mcp:test:rail
```

### 测试方法 2: 在 Cursor 中测试

1. 重启 Cursor
2. 在对话中询问："搜索从巴黎到伦敦的火车路线"
3. 如果成功返回路线信息，说明连接正常

---

## ⚠️ 注意事项

1. **认证**: Rail MCP 服务器**需要 OAuth 认证**（根据测试结果）
2. **网络连接**: 需要稳定的网络连接访问 Smithery 服务
3. **服务可用性**: 依赖 Smithery 服务的可用性
4. **工具发现**: 工具列表在连接时动态发现，具体工具取决于服务实现

---

## 🔐 认证

### 是否必须认证？

**是的，Rail MCP 服务需要 OAuth 认证**。根据测试，服务会返回 401 错误，要求认证。

### 认证流程

Rail MCP 客户端会：
1. **先尝试无认证连接**（自动检测）
2. **检测到需要认证后**，自动切换到 OAuth 模式
3. **显示认证 URL**，引导您完成认证
4. **自动保存认证信息**到 `~/.tripnara-mcp/rail-tokens.json`

**手动触发认证**：
```bash
npm run mcp:auth:rail
```

### 如果不想使用 Rail MCP

如果暂时不需要铁路功能，可以**禁用 Rail MCP**：

**方法 1**: 设置环境变量
```bash
# 在 .env 文件中添加
ENABLE_RAIL_MCP=false
```

**方法 2**: 直接注释掉代码
- 在 `mcp-skills-server.ts` 中，Rail MCP 注册代码已经被 `ENABLE_RAIL_MCP` 环境变量控制
- 设置 `ENABLE_RAIL_MCP=false` 即可禁用

**禁用后的影响**:
- Rail 工具将不可用
- 其他 MCP 服务不受影响
- 可以随时重新启用

---

## 📚 相关资源

- [Smithery Rail MCP 服务页面](https://smithery.ai/server/DeniseLewis200081/rail)
- [Rail 客户端源码](../src/mcp/rail-client.ts)
- [Rail 桥接服务器源码](../src/mcp/rail-bridge-server.ts)

---

## 🔄 更新日志

- **2026-02-06**: 初始版本，添加 Rail MCP 集成指南
