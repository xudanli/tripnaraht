# Airbnb MCP 快速开始指南

## 🚀 快速开始

### 方式 1: 在 Claude Desktop 中使用（推荐）

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

#### 步骤 2: 添加配置

在配置文件中添加 Airbnb 桥接服务器：

```json
{
  "mcpServers": {
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

完全退出并重新启动 Claude Desktop。

#### 步骤 4: 首次认证

首次使用时，Claude Desktop 会尝试连接 Airbnb 服务。如果出现认证提示：

1. 查看 Claude Desktop 日志找到认证 URL
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
├── AIRBNB_INTEGRATION.md            # 完整集成文档
└── AIRBNB_QUICKSTART.md             # 快速开始指南（本文件）

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

## 📋 首次认证步骤

1. **运行认证助手**:
   ```bash
   npm run mcp:auth:airbnb
   ```

2. **复制认证 URL**（从输出中）

3. **在浏览器中打开**并完成 Airbnb 登录和授权

4. **验证认证**:
   ```bash
   npm run mcp:test:airbnb
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

A: 这是正常的，需要完成首次 OAuth 认证。按照上面的步骤完成认证即可。

### Q: 如何重新认证？

A: 删除认证文件后重新连接：

```bash
rm -rf ~/.tripnara-mcp/mcp-server-airbnb-*
```

然后重新运行测试脚本。

---

## 📚 相关文档

- [完整集成文档](./AIRBNB_INTEGRATION.md)
- [Google Calendar 集成文档](./GOOGLE_CALENDAR_INTEGRATION.md) - 参考类似的集成方式
- [Smithery Airbnb 服务页面](https://smithery.ai/server/iclickfreedownloads/mcp-server-airbnb)

---

## 🎉 开始使用

现在您可以：

1. **在 Claude Desktop 中使用**: 配置桥接服务器，享受 AI 助手管理 Airbnb
2. **在代码中集成**: 使用 `AirbnbMcpClient` 类搜索和管理房源
3. **自动化工作流**: 将 TripNara 行程与 Airbnb 预订集成

祝使用愉快！🎊
