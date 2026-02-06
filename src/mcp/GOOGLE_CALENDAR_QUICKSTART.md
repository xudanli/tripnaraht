# Google Calendar MCP 快速开始指南

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

在配置文件中添加 Google Calendar 桥接服务器：

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
    }
  }
}
```

**注意**: 将 `cwd` 路径替换为您的实际项目路径。

#### 步骤 3: 重启 Claude Desktop

完全退出并重新启动 Claude Desktop。

#### 步骤 4: 首次认证

首次使用时，Claude Desktop 会尝试连接 Google Calendar 服务。如果出现认证提示：

1. 查看终端输出（如果手动运行）或日志
2. 访问显示的认证 URL
3. 完成 Google OAuth 认证
4. 认证信息会保存在 `~/.tripnara-mcp/` 目录下

#### 步骤 5: 使用

在 Claude Desktop 中，您可以：

- "列出我今天的日历事件"
- "创建一个明天下午2点的会议"
- "查找我下周的空闲时间"
- "删除某个事件"

---

### 方式 2: 在代码中使用

#### 基本使用示例

```typescript
import { GoogleCalendarMcpClient } from './src/mcp/google-calendar-client';

async function example() {
  const client = new GoogleCalendarMcpClient();
  
  try {
    // 连接
    await client.connect();
    
    // 获取当前时间
    const now = await client.getCurrentDateTime();
    console.log('当前时间:', now);
    
    // 列出日历
    const calendars = await client.listCalendars();
    console.log('日历列表:', calendars);
    
    // 列出事件
    const events = await client.listEvents({
      maxResults: 10,
    });
    console.log('事件列表:', events);
    
    // 创建事件
    const newEvent = await client.createEvent({
      summary: '测试会议',
      start: {
        dateTime: '2026-02-07T14:00:00+08:00',
        timeZone: 'Asia/Shanghai',
      },
      end: {
        dateTime: '2026-02-07T15:00:00+08:00',
        timeZone: 'Asia/Shanghai',
      },
      description: '这是一个测试事件',
    });
    console.log('创建的事件:', newEvent);
    
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
npm run mcp:google-calendar
```

### 测试客户端代码

```bash
npm run mcp:test:google-calendar
```

---

## 📁 文件结构

```
src/mcp/
├── google-calendar-bridge-server.ts  # 桥接服务器（用于 Claude Desktop）
├── google-calendar-client.ts          # 客户端类（用于代码集成）
└── GOOGLE_CALENDAR_INTEGRATION.md     # 完整集成文档
└── GOOGLE_CALENDAR_QUICKSTART.md      # 快速开始指南（本文件）

scripts/
└── test-google-calendar-mcp.ts         # 测试脚本
```

---

## 🔐 认证信息存储

认证信息（OAuth tokens）存储在：

```
~/.tripnara-mcp/
├── googlecalendar-tokens.json         # OAuth tokens
├── googlecalendar-client-info.json    # 客户端信息
└── googlecalendar-code-verifier.txt   # 代码验证器
```

**安全提示**: 
- 这些文件包含敏感信息，请妥善保管
- 不要将 `~/.tripnara-mcp/` 目录提交到版本控制
- 生产环境建议使用加密存储

---

## 🛠️ 可用方法

### GoogleCalendarMcpClient 类提供的方法：

- `connect()` - 连接到服务器
- `disconnect()` - 断开连接
- `listTools()` - 列出所有可用工具
- `listEvents()` - 列出日历事件
- `createEvent()` - 创建事件
- `deleteEvent()` - 删除事件
- `updateEvent()` - 更新事件
- `findEvent()` - 查找事件
- `getCurrentDateTime()` - 获取当前日期时间
- `findFreeSlots()` - 查找空闲时间段
- `listCalendars()` - 列出所有日历
- `quickAdd()` - 快速添加事件（自然语言）

---

## ❓ 常见问题

### Q: 首次连接时出现认证错误？

A: 确保：
1. 网络连接正常
2. 能够访问 `https://server.smithery.ai`
3. 按照提示完成 OAuth 认证流程

### Q: 如何重新认证？

A: 删除认证文件后重新连接：

```bash
rm -rf ~/.tripnara-mcp/googlecalendar-*
```

然后重新运行连接。

### Q: 可以在生产环境使用吗？

A: 可以，但建议：
1. 使用加密存储保存 tokens
2. 实现 token 刷新机制
3. 添加错误处理和重试逻辑
4. 监控 API 调用频率

---

## 📚 更多信息

- [完整集成文档](./GOOGLE_CALENDAR_INTEGRATION.md)
- [Smithery Google Calendar 服务页面](https://smithery.ai/server/googlecalendar)
- [MCP SDK 文档](https://modelcontextprotocol.io/)

---

## 🎉 开始使用

现在您可以：

1. **在 Claude Desktop 中使用**: 配置桥接服务器，享受 AI 助手管理日历
2. **在代码中集成**: 使用 `GoogleCalendarMcpClient` 类同步行程到日历
3. **自动化工作流**: 将 TripNara 行程自动同步到 Google Calendar

祝使用愉快！🎊
