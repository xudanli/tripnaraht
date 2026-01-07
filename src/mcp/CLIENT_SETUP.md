# MCP 客户端配置指南

## 什么是 MCP 客户端？

MCP (Model Context Protocol) 客户端是能够连接到 MCP Server 的应用程序。目前最常用的客户端是 **Claude Desktop**。

---

## 📍 MCP 客户端位置

### 1. Claude Desktop（推荐）

**Claude Desktop** 是 Anthropic 开发的官方 MCP 客户端。

#### 下载和安装

- **macOS**: 从 [Anthropic 官网](https://claude.ai/download) 下载
- **Windows**: 从 [Anthropic 官网](https://claude.ai/download) 下载
- **Linux**: 目前可能不支持或有限支持

安装后，Claude Desktop 会自动创建配置文件。

#### 配置文件位置

**macOS**:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows**:
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux** (如果支持):
```
~/.config/Claude/claude_desktop_config.json
```

---

## 🔧 配置 Claude Desktop 连接 TripNara MCP Server

### 步骤 1: 找到项目绝对路径

```bash
# 在项目目录下运行
pwd
# 例如输出: /home/devbox/project
```

### 步骤 2: 编辑 Claude Desktop 配置文件

打开配置文件（如果不存在则创建）：

```bash
# macOS
open ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Windows (在 PowerShell 中)
notepad $env:APPDATA\Claude\claude_desktop_config.json
```

### 步骤 3: 添加 TripNara MCP Server 配置

#### 选项 A: 使用 MCP Skills Server（推荐）⭐

这是新的 Skills Server，提供所有 TripNARA 核心能力：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npm",
      "args": ["run", "mcp:skills"],
      "cwd": "/home/devbox/project"
    }
  }
}
```

#### 选项 B: 使用原始 MCP Server

如果您想使用原始的 MCP Server（提供基础工具）：

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

#### 选项 C: 直接使用 npx tsx（如果 npm run 有问题）

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npx",
      "args": [
        "tsx",
        "src/mcp/mcp-skills-server.ts"
      ],
      "cwd": "/home/devbox/project"
    }
  }
}
```

**注意**: 将 `/home/devbox/project` 替换为您的实际项目绝对路径

### 步骤 4: 重启 Claude Desktop

保存配置文件后，**完全退出并重新启动 Claude Desktop**。

### 步骤 5: 验证连接

在 Claude Desktop 中，您应该能看到：
- MCP Server 连接状态
- 可用的工具列表（如 `hello`, `get_server_info`, `list_trips`, `get_trip`, `search_places`, `get_place`）

---

## 🧪 测试 MCP Server（不使用客户端）

如果只是想测试 MCP Server 是否正常运行，可以直接运行：

```bash
npm run mcp:server
```

您应该看到：
```
Database connected
TripNara MCP Server started and ready
```

**注意**: 直接运行会等待通过 stdio 输入，通常用于调试或测试。实际使用时应该通过 Claude Desktop 等客户端连接。

---

## 🔍 其他 MCP 客户端

### 命令行客户端（开发中）

MCP SDK 可能提供命令行测试工具，但目前主要用于通过 Claude Desktop 使用。

### 自定义客户端

如果您想开发自定义的 MCP 客户端，可以参考：
- [MCP SDK 文档](https://modelcontextprotocol.io/)
- [MCP 规范](https://spec.modelcontextprotocol.io/)

---

## ❓ 常见问题

### Q: 配置文件不存在怎么办？

A: 创建配置文件并添加上述 JSON 内容即可。确保目录存在。

### Q: Claude Desktop 无法连接 MCP Server？

A: 检查：
1. 项目路径是否正确（使用绝对路径）
2. `DATABASE_URL` 环境变量是否设置
3. Node.js 和 npm 是否在系统 PATH 中
4. 查看 Claude Desktop 的日志/错误信息

### Q: 如何查看 Claude Desktop 的日志？

A: 
- **macOS**: `~/Library/Logs/Claude/`
- **Windows**: `%APPDATA%\Claude\Logs\`

### Q: 可以同时运行多个 MCP Server 吗？

A: 可以！在配置文件中添加多个服务器配置：

```json
{
  "mcpServers": {
    "tripnara": {
      "command": "npm",
      "args": ["run", "mcp:server"],
      "cwd": "/home/devbox/project"
    },
    "another-server": {
      ...
    }
  }
}
```

---

## 📚 相关文档

- `src/mcp/CLIENT_SETUP_SKILLS.md` - **Skills Server 详细配置指南（推荐）** ⭐
- `src/mcp/MCP_SKILLS_GUIDE.md` - Skills Server 使用指南
- `src/mcp/README.md` - MCP Server 详细文档
- `START_SERVICES.md` - 服务启动指南
- [MCP 官方文档](https://modelcontextprotocol.io/)
- [Claude Desktop 文档](https://claude.ai/desktop)

