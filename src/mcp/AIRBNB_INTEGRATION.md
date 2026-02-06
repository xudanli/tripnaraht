# Airbnb MCP 服务集成指南

## 📋 概述

本文档说明如何将 [Smithery 提供的 Airbnb MCP 服务](https://smithery.ai/server/iclickfreedownloads/mcp-server-airbnb) 集成到项目中。

### 服务信息

- **服务名称**: Airbnb MCP Server
- **服务 URL**: `https://server.smithery.ai/iclickfreedownloads/mcp-server-airbnb`
- **服务类型**: 远程 HTTP/SSE MCP 服务器
- **功能**: 提供 Airbnb 相关功能（搜索房源、预订管理等）

---

## 🔧 集成方式

### 方式 1: 在 Claude Desktop 中使用（推荐）⭐

#### 步骤 1: 配置 Claude Desktop

编辑 Claude Desktop 配置文件：

**macOS**:
```bash
open ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows**:
```bash
notepad %APPDATA%\Claude\claude_desktop_config.json
```

**Linux**:
```bash
nano ~/.config/Claude/claude_desktop_config.json
```

#### 步骤 2: 添加 Airbnb MCP 服务器配置

在配置文件中添加以下内容（与现有的其他 MCP 服务器配置并列）：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npx",
      "args": ["tsx", "src/mcp/mcp-skills-server.ts"],
      "cwd": "/home/devbox/project"
    },
    "google-calendar": {
      "command": "npx",
      "args": ["tsx", "src/mcp/google-calendar-bridge-server.ts"],
      "cwd": "/home/devbox/project"
    },
    "airbnb": {
      "command": "npx",
      "args": ["tsx", "src/mcp/airbnb-bridge-server.ts"],
      "cwd": "/home/devbox/project"
    }
  }
}
```

**注意**: 将 `cwd` 路径替换为您的实际项目路径。

#### 步骤 3: 重启 Claude Desktop

完全退出并重新启动 Claude Desktop，配置才会生效。

#### 步骤 4: 首次认证

首次使用时，Claude Desktop 会尝试连接 Airbnb 服务。如果出现认证提示：

1. 查看终端输出（如果手动运行）或 Claude Desktop 日志
2. 访问显示的认证 URL
3. 完成 Airbnb OAuth 认证
4. 认证信息会保存在 `~/.tripnara-mcp/` 目录下

---

### 方式 2: 在代码中使用

#### 基本使用示例

```typescript
import { AirbnbMcpClient } from './src/mcp/airbnb-client';

async function example() {
  const client = new AirbnbMcpClient();
  
  try {
    // 连接
    await client.connect();
    
    // 列出所有可用工具
    const tools = await client.listTools();
    console.log('可用工具:', tools);
    
    // 调用工具（根据实际可用的工具）
    const result = await client.callTool('tool_name', {
      // 工具参数
    });
    console.log('结果:', result);
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    await client.disconnect();
  }
}
```

---

## 🧪 测试

### 测试桥接服务器

```bash
npm run mcp:airbnb
```

### 测试客户端代码

```bash
npm run mcp:test:airbnb
```

### 认证助手

```bash
npm run mcp:auth:airbnb
```

---

## 📁 文件结构

```
src/mcp/
├── airbnb-bridge-server.ts          # 桥接服务器（用于 Claude Desktop）
├── airbnb-client.ts                  # 客户端类（用于代码集成）
└── AIRBNB_INTEGRATION.md             # 集成文档（本文件）

scripts/
├── test-airbnb-mcp.ts               # 测试脚本
└── airbnb-auth.ts                    # 认证助手脚本
```

---

## 🔐 认证信息存储

认证信息（OAuth tokens）存储在：

```
~/.tripnara-mcp/
├── mcp-server-airbnb-tokens.json         # OAuth tokens
├── mcp-server-airbnb-client-info.json    # 客户端信息
└── mcp-server-airbnb-code-verifier.txt   # 代码验证器
```

**安全提示**: 
- 这些文件包含敏感信息，请妥善保管
- 不要将 `~/.tripnara-mcp/` 目录提交到版本控制
- 生产环境建议使用加密存储

---

## 🛠️ 可用方法

### AirbnbMcpClient 类提供的方法：

- `connect()` - 连接到服务器
- `disconnect()` - 断开连接
- `listTools()` - 列出所有可用工具
- `callTool(name, arguments)` - 调用指定工具

---

## 💡 使用场景

### 场景 1: 搜索 Airbnb 房源

```typescript
const client = new AirbnbMcpClient();
await client.connect();

// 根据实际可用的工具调用
const results = await client.callTool('search_listings', {
  location: 'Iceland',
  checkin: '2026-02-10',
  checkout: '2026-02-15',
  guests: 2,
});
```

### 场景 2: 获取房源详情

```typescript
const listing = await client.callTool('get_listing_details', {
  listingId: '12345678',
});
```

### 场景 3: 管理预订

```typescript
// 根据实际可用的工具
const bookings = await client.callTool('list_bookings', {});
```

---

## ❓ 常见问题

### Q: 如何查看可用的工具？

A: 运行测试脚本或使用代码：

```typescript
const client = new AirbnbMcpClient();
await client.connect();
const tools = await client.listTools();
console.log(tools);
```

### Q: 首次连接时出现认证错误？

A: 确保：
1. 网络连接正常
2. 能够访问 `https://server.smithery.ai`
3. 按照提示完成 OAuth 认证流程

### Q: 如何重新认证？

A: 删除认证文件后重新连接：

```bash
rm -rf ~/.tripnara-mcp/mcp-server-airbnb-*
```

然后重新运行测试脚本或使用 Claude Desktop。

---

## 📚 相关文档

- [Google Calendar 集成文档](./GOOGLE_CALENDAR_INTEGRATION.md) - 参考类似的集成方式
- [Smithery Airbnb 服务页面](https://smithery.ai/server/iclickfreedownloads/mcp-server-airbnb)
- [MCP SDK 文档](https://modelcontextprotocol.io/)

---

## 🎉 开始使用

现在您可以：

1. **在 Claude Desktop 中使用**: 配置桥接服务器，享受 AI 助手管理 Airbnb
2. **在代码中集成**: 使用 `AirbnbMcpClient` 类搜索和管理房源
3. **自动化工作流**: 将 TripNara 行程与 Airbnb 预订集成

祝使用愉快！🎊
