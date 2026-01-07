# TripNARA MCP Skills Server 快速开始

## ✅ 步骤 1: 已下载 Claude Desktop

很好！现在让我们完成配置。

## 📝 步骤 2: 创建配置文件

### 在终端中运行以下命令（根据您的系统选择）：

#### macOS:
```bash
mkdir -p ~/Library/Application\ Support/Claude
cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npm",
      "args": ["run", "mcp:skills"],
      "cwd": "/home/devbox/project"
    }
  }
}
EOF
```

#### Windows (PowerShell):
```powershell
$configPath = "$env:APPDATA\Claude\claude_desktop_config.json"
$configDir = Split-Path $configPath
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
@"
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npm",
      "args": ["run", "mcp:skills"],
      "cwd": "/home/devbox/project"
    }
  }
}
"@ | Out-File -FilePath $configPath -Encoding utf8
```

#### Linux:
```bash
mkdir -p ~/.config/Claude
cat > ~/.config/Claude/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npm",
      "args": ["run", "mcp:skills"],
      "cwd": "/home/devbox/project"
    }
  }
}
EOF
```

## 🔍 步骤 3: 验证配置文件

### macOS/Linux:
```bash
# macOS
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Linux
cat ~/.config/Claude/claude_desktop_config.json
```

### Windows:
```powershell
Get-Content "$env:APPDATA\Claude\claude_desktop_config.json"
```

您应该看到类似这样的输出：
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

## 🚀 步骤 4: 重启 Claude Desktop

1. **完全退出** Claude Desktop
   - macOS: 右键点击 Dock 图标 → 退出
   - Windows: 关闭所有窗口，确保进程已结束
   - Linux: 完全退出应用

2. **重新启动** Claude Desktop

## ✅ 步骤 5: 验证连接

启动 Claude Desktop 后：

1. 查看 MCP Server 连接状态（通常在设置或状态栏中）
2. 在对话中尝试：

```
请使用 tripnara.listSkills 列出所有可用的 TripNARA Skills
```

如果 Claude 能够调用工具并返回结果，说明配置成功！

## 🎯 测试示例

配置成功后，您可以尝试：

### 示例 1: 列出所有 Skills
```
列出所有可用的 TripNARA Skills
```

### 示例 2: 创建 Pack 骨架
```
帮我创建一个冰岛的 ReadinessPack 骨架
```

### 示例 3: 选择路线方向
```
7月份去冰岛，我想徒步和看风景，推荐什么路线方向？
```

## ❓ 遇到问题？

### 问题 1: 配置文件格式错误

确保 JSON 格式正确，可以使用在线 JSON 验证器检查。

### 问题 2: Claude Desktop 无法连接

1. 检查项目路径是否正确（使用绝对路径）
2. 确认 npm 在系统 PATH 中：`which npm` 或 `where npm`
3. 查看 Claude Desktop 日志文件

### 问题 3: 工具不可用

1. 确认 MCP Server 已启动（Claude Desktop 会自动启动）
2. 尝试使用 `tripnara.listSkills` 列出所有工具

## 📚 更多帮助

- 详细配置指南: `src/mcp/CLIENT_SETUP_SKILLS.md`
- Skills 使用指南: `src/mcp/MCP_SKILLS_GUIDE.md`
- 故障排除: 查看 `CLIENT_SETUP_SKILLS.md` 中的故障排除部分

---

**当前项目路径**: `/home/devbox/project`

如果您的项目路径不同，请修改配置文件中的 `cwd` 字段。

