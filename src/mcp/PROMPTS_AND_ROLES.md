# MCP Prompts 和角色定义说明

## 📋 关于角色定义文件

### 基本配置（必需）

在 Claude Desktop 配置文件中，**只需要配置如何启动 MCP Server**，这是必需的：

```json
{
  "mcpServers": {
    "tripnara": {
      "command": "npm",
      "args": ["run", "mcp:server"],
      "cwd": "/home/devbox/project"
    }
  }
}
```

**这个配置已经足够让 Claude Desktop 连接到 MCP Server 并使用工具了。**

---

## 🔍 角色定义/系统提示词的位置

### 1. MCP Server 中的 Prompts（可选）

MCP Server **支持注册 prompts**，可以用来提供系统提示词或角色定义，但目前我们的实现中**没有使用**（因为工具描述已经足够清晰）。

如果要添加 prompts，可以在 `mcp-server.ts` 中这样注册：

```typescript
server.registerPrompt(
  'tripnara_assistant',
  {
    description: 'TripNara 旅行规划助手角色定义',
    arguments: [],
  },
  async () => {
    return {
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: `你是 TripNara 旅行规划助手。
            你可以使用以下工具来帮助用户：
            - list_trips: 列出所有行程
            - get_trip: 获取行程详情
            - search_places: 搜索地点
            - get_place: 获取地点详情
            ...`,
          },
        },
      ],
    };
  }
);
```

**但这不是必需的**，因为：
- 工具的描述（`description`）已经足够让 AI 理解如何使用
- Claude Desktop 会自动发现和使用工具

### 2. Claude Desktop 的系统提示词（可选）

Claude Desktop 本身支持系统提示词功能，这是**Claude Desktop 的功能**，不是 MCP 配置的一部分：

- 在 Claude Desktop 的对话设置中可以设置系统提示词
- 这个提示词会影响整个对话的行为
- 与 MCP Server 配置是分开的

---

## ✅ 总结

### 必需配置

✅ **Claude Desktop 配置文件** (`claude_desktop_config.json`)：
- 配置如何启动 MCP Server
- 这是**唯一必需的配置**

### 可选增强

🔧 **MCP Server Prompts**（如果需要）：
- 可以在 MCP Server 中注册 prompts
- 提供更详细的角色定义或系统提示词
- **目前不是必需的**（工具描述已足够）

🔧 **Claude Desktop 系统提示词**（如果需要）：
- 在 Claude Desktop 界面中设置
- 影响整体对话行为
- 与 MCP 配置独立

---

## 📝 当前状态

我们的 MCP Server **目前只注册了工具（tools）**，没有注册 prompts，这是**完全正常的做法**：

- ✅ 工具的描述字段已经提供了足够的信息
- ✅ Claude Desktop 会自动发现和使用这些工具
- ✅ AI 可以通过工具描述理解如何使用它们

---

## 🎯 建议

**对于大多数使用场景**：
- ✅ 只需要配置 `claude_desktop_config.json`（我们已经提供了）
- ✅ 不需要额外的角色定义文件
- ✅ 工具的描述已经足够清晰

**如果您想要更精细的控制**：
- 可以考虑在 MCP Server 中添加 prompts（可选）
- 或者在 Claude Desktop 中设置系统提示词（可选）

---

## 🔗 相关文档

- `MCP_CLIENT_CONFIG.md` - Claude Desktop 配置指南
- `src/mcp/README.md` - MCP Server 文档
- [MCP 官方文档](https://modelcontextprotocol.io/) - 了解更多关于 prompts 的信息

