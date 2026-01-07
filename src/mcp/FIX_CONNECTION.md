# 修复 "Server disconnected" 错误

## 🔍 问题诊断

您看到的错误 "MCP tripnara-route-intel: Server disconnected" 表示 Claude Desktop 无法连接到 MCP Server。

## ✅ 已完成的修复

我已经为您创建了配置文件，并使用了更可靠的方式（`npx tsx` 而不是 `npm run`）。

### 配置文件位置
```
~/.config/Claude/claude_desktop_config.json
```

### 配置内容
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

## 🚀 下一步操作

### 1. 验证配置文件

运行以下命令确认配置文件已创建：

```bash
cat ~/.config/Claude/claude_desktop_config.json
```

### 2. 完全重启 Claude Desktop

**重要**: 必须完全退出并重新启动 Claude Desktop，配置才会生效。

1. 完全退出 Claude Desktop（确保所有进程都结束）
2. 重新启动 Claude Desktop

### 3. 检查连接状态

启动后，查看 MCP Server 连接状态。如果仍然显示 "disconnected"，继续下一步。

## 🔧 如果仍然无法连接

### 方案 A: 使用完整 npm 路径

如果 `npx` 也不工作，可以使用完整路径：

```bash
# 找到 npx 的完整路径
which npx
# 例如: /home/devbox/.nvm/versions/node/v20.18.0/bin/npx
```

然后修改配置文件：
```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "/home/devbox/.nvm/versions/node/v20.18.0/bin/npx",
      "args": [
        "tsx",
        "src/mcp/mcp-skills-server.ts"
      ],
      "cwd": "/home/devbox/project"
    }
  }
}
```

### 方案 B: 使用 node 直接运行（需要先编译）

```bash
cd /home/devbox/project
npm run build
```

然后配置：
```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "node",
      "args": [
        "dist/src/mcp/mcp-skills-server.js"
      ],
      "cwd": "/home/devbox/project"
    }
  }
}
```

### 方案 C: 添加环境变量

如果服务器需要特定的环境变量，可以在配置中添加：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npx",
      "args": [
        "tsx",
        "src/mcp/mcp-skills-server.ts"
      ],
      "cwd": "/home/devbox/project",
      "env": {
        "PATH": "/home/devbox/.nvm/versions/node/v20.18.0/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

## 🐛 调试步骤

### 1. 查看 Claude Desktop 开发者设置

在 Claude Desktop 中点击 "Open developer settings"，查看详细错误信息。

### 2. 手动测试服务器

```bash
cd /home/devbox/project
npx tsx src/mcp/mcp-skills-server.ts
```

如果服务器可以手动启动，说明服务器本身没问题，问题在于 Claude Desktop 的连接。

### 3. 检查权限

```bash
# 确保有执行权限
chmod +x /home/devbox/project/node_modules/.bin/tsx
```

### 4. 查看日志

```bash
# 查找 Claude Desktop 日志
find ~/.config/Claude -name "*.log" -type f 2>/dev/null
```

## ✅ 成功标志

配置成功后，您应该看到：

1. ✅ Claude Desktop 中 MCP Server 状态显示为 "Connected"
2. ✅ 不再显示 "Server disconnected" 错误
3. ✅ 可以使用 `tripnara.listSkills` 列出所有工具
4. ✅ 可以调用其他 TripNARA Skills

## 📚 更多帮助

- 详细故障排除: `src/mcp/TROUBLESHOOTING.md`
- 配置指南: `src/mcp/CLIENT_SETUP_SKILLS.md`

