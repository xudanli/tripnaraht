# Claude Desktop 客户端配置步骤

## 📋 您需要设置的配置

在 Claude Desktop 配置文件中，您需要添加以下配置来连接 TripNara MCP Server。

---

## 🔧 配置步骤

### 1. 找到配置文件位置

根据您的操作系统：

**macOS**:
```bash
open ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows** (PowerShell):
```bash
notepad $env:APPDATA\Claude\claude_desktop_config.json
```

**Linux** (如果支持):
```bash
nano ~/.config/Claude/claude_desktop_config.json
```

### 2. 添加配置内容

如果配置文件不存在，创建它。如果已存在，添加 `mcpServers` 部分。

**完整配置文件示例**:

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

**重要**: 将 `/home/devbox/project` 替换为您的**实际项目绝对路径**。

### 3. 获取项目绝对路径

在项目目录下运行：

```bash
cd /home/devbox/project
pwd
```

将输出的路径复制到配置文件中。

---

## 📝 配置说明

### 配置项解释

- **`"tripnara"`**: MCP Server 的名称（可以自定义）
- **`"command"`**: 运行命令（使用 `npm`）
- **`"args"`**: 命令参数（运行 `npm run mcp:server`）
- **`"cwd"`**: 工作目录（项目绝对路径）

### 替代方案（如果 npm run 不工作）

如果使用 `npm run` 有问题，可以直接使用 `npx tsx`:

```json
{
  "mcpServers": {
    "tripnara": {
      "command": "npx",
      "args": [
        "tsx",
        "/home/devbox/project/src/mcp/mcp-server.ts"
      ],
      "cwd": "/home/devbox/project"
    }
  }
}
```

---

## ✅ 配置完成后

1. **保存配置文件**
2. **完全退出 Claude Desktop**（不只是关闭窗口）
3. **重新启动 Claude Desktop**
4. **验证连接**: 在 Claude Desktop 中，您应该能看到 TripNara MCP Server 连接成功

---

## 🔍 验证配置是否成功

在 Claude Desktop 中：
- 查看 MCP Server 连接状态
- 尝试使用工具，例如：`hello`、`get_server_info`、`list_trips` 等

---

## ⚠️ 常见问题

### 问题 1: 配置文件格式错误

确保 JSON 格式正确：
- 使用双引号 `"`，不要使用单引号 `'`
- 最后一个项后面不要有逗号
- 使用 JSON 验证工具检查格式

### 问题 2: 路径问题

- 必须使用**绝对路径**，不能使用相对路径
- Linux/macOS: 使用 `/` 作为路径分隔符
- Windows: 使用 `\\` 或 `/` 作为路径分隔符

### 问题 3: 环境变量

确保 MCP Server 需要的环境变量已设置（如 `DATABASE_URL`）：
- 可以在项目根目录的 `.env` 文件中设置
- 或者通过系统环境变量设置

### 问题 4: Node.js 和 npm 路径

确保 `node` 和 `npm` 在系统 PATH 中：
```bash
which node
which npm
```

如果不在 PATH 中，需要在配置中使用完整路径：
```json
{
  "mcpServers": {
    "tripnara": {
      "command": "/usr/bin/npm",
      "args": ["run", "mcp:server"],
      "cwd": "/home/devbox/project"
    }
  }
}
```

---

## 📚 更多信息

- 详细文档: `src/mcp/CLIENT_SETUP.md`
- MCP Server 文档: `src/mcp/README.md`
- [MCP 官方文档](https://modelcontextprotocol.io/)

