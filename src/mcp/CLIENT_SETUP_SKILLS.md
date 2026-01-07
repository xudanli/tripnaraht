# TripNARA MCP Skills Server 客户端配置指南

## 📋 概述

本指南将帮助您配置 MCP 客户端（如 Claude Desktop）来连接 TripNARA MCP Skills Server。

**当前项目路径**: `/home/devbox/project`

---

## 🎯 支持的 MCP 客户端

### 1. Claude Desktop（推荐）⭐

Claude Desktop 是 Anthropic 官方开发的 MCP 客户端，支持 macOS、Windows 和 Linux。

### 2. 其他支持 MCP 的客户端

- **ChatGPT**（如果支持 MCP）
- **自定义 MCP 客户端**

---

## 🔧 配置 Claude Desktop

### 步骤 1: 获取项目绝对路径

```bash
# 在项目目录下运行
cd /home/devbox/project
pwd
# 输出应该是: /home/devbox/project
```

### 步骤 2: 找到 Claude Desktop 配置文件

配置文件位置取决于您的操作系统：

**macOS**:
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows**:
```bash
%APPDATA%\Claude\claude_desktop_config.json
# 完整路径示例: C:\Users\YourUsername\AppData\Roaming\Claude\claude_desktop_config.json
```

**Linux**:
```bash
~/.config/Claude/claude_desktop_config.json
```

### 步骤 3: 创建或编辑配置文件

如果配置文件不存在，创建它：

```bash
# macOS
mkdir -p ~/Library/Application\ Support/Claude
touch ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Windows (PowerShell)
New-Item -ItemType File -Path "$env:APPDATA\Claude\claude_desktop_config.json" -Force

# Linux
mkdir -p ~/.config/Claude
touch ~/.config/Claude/claude_desktop_config.json
```

### 步骤 4: 添加 TripNARA Skills Server 配置

编辑配置文件，添加以下内容（**替换路径为您的实际项目路径**）：

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

**重要**: 
- 将 `/home/devbox/project` 替换为您的实际项目绝对路径
- 使用绝对路径，不要使用相对路径
- 确保 `npm` 在系统 PATH 中

### 步骤 5: 替代配置方式（如果 npm run 有问题）

如果使用 `npm run` 有问题，可以直接使用 `npx tsx`：

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

### 步骤 6: 重启 Claude Desktop

1. **完全退出** Claude Desktop（不要只是关闭窗口）
2. 重新启动 Claude Desktop
3. Claude Desktop 会自动启动 MCP Server

### 步骤 7: 验证连接

在 Claude Desktop 中：

1. 打开 Claude Desktop
2. 查看 MCP Server 连接状态（通常在设置或状态栏中）
3. 在对话中，Claude 应该能够看到并使用以下工具：
   - `tripnara.dem.getProfile`
   - `tripnara.decision.abuCheck`
   - `tripnara.decision.drdrePace`
   - `tripnara.decision.neptuneRepair`
   - `tripnara.routeDirection.pickForIntent`
   - `tripnara.readiness.generateChecklist`
   - `tripnara.countryPack.newSkeleton`
   - `tripnara.countryPack.validate`
   - `tripnara.countryPack.generateRegressionTests`
   - `tripnara.listSkills`

---

## 🧪 测试配置

### 方法 1: 在 Claude Desktop 中测试

在 Claude Desktop 中尝试以下对话：

```
请使用 tripnara.listSkills 列出所有可用的 TripNARA Skills
```

或者：

```
帮我创建一个冰岛的 ReadinessPack 骨架，使用 tripnara.countryPack.newSkeleton
```

### 方法 2: 检查日志

如果连接失败，检查 Claude Desktop 的日志：

**macOS**:
```bash
tail -f ~/Library/Logs/Claude/*.log
```

**Windows**:
```bash
# 在 PowerShell 中
Get-Content "$env:APPDATA\Claude\Logs\*.log" -Tail 50
```

**Linux**:
```bash
tail -f ~/.config/Claude/logs/*.log
```

---

## 🔍 故障排除

### 问题 1: Claude Desktop 无法连接 MCP Server

**检查清单**:

1. ✅ **项目路径是否正确**
   ```bash
   # 确认路径存在
   ls -la /home/devbox/project
   ```

2. ✅ **npm 是否在 PATH 中**
   ```bash
   which npm
   # 应该输出 npm 的路径
   ```

3. ✅ **配置文件格式是否正确**
   ```bash
   # 验证 JSON 格式
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool
   ```

4. ✅ **环境变量是否正确**
   - 确保 `.env` 文件存在于项目根目录
   - 或者确保必要的环境变量已设置

5. ✅ **查看 Claude Desktop 日志**
   - 检查是否有错误信息
   - 查看 MCP Server 启动日志

### 问题 2: MCP Server 启动失败

**可能原因**:

1. **依赖未安装**
   ```bash
   cd /home/devbox/project
   npm install
   ```

2. **TypeScript 编译错误**
   ```bash
   npm run mcp:check
   ```

3. **环境变量缺失**
   - 检查 `.env` 文件
   - 某些服务可能需要 API Key（但 MCP Server 可以在没有 API Key 的情况下运行）

### 问题 3: 工具不可用

**检查**:

1. 确认 MCP Server 已成功启动
2. 在 Claude Desktop 中查看可用工具列表
3. 尝试使用 `tripnara.listSkills` 列出所有工具

---

## 📝 完整配置示例

### 单个 MCP Server 配置

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

### 多个 MCP Server 配置

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npm",
      "args": ["run", "mcp:skills"],
      "cwd": "/home/devbox/project"
    },
    "another-mcp-server": {
      "command": "node",
      "args": ["path/to/another/server.js"],
      "cwd": "/path/to/another/project"
    }
  }
}
```

---

## 🎯 使用示例

配置完成后，您可以在 Claude Desktop 中这样使用：

### 示例 1: 列出所有 Skills

```
用户: 请列出所有可用的 TripNARA Skills
Claude: [自动调用 tripnara.listSkills]
```

### 示例 2: 创建 Pack 骨架

```
用户: 帮我创建一个冰岛的 ReadinessPack 骨架
Claude: [自动调用 tripnara.countryPack.newSkeleton]
```

### 示例 3: 选择路线方向

```
用户: 7月份去冰岛，我想徒步和看风景，推荐什么路线方向？
Claude: [自动调用 tripnara.routeDirection.pickForIntent]
```

---

## 📚 相关文档

- `src/mcp/MCP_SKILLS_GUIDE.md` - Skills Server 详细使用指南
- `src/mcp/README.md` - MCP Server 文档
- [MCP 官方文档](https://modelcontextprotocol.io/)
- [Claude Desktop 文档](https://claude.ai/desktop)

---

## ✅ 配置检查清单

在开始使用前，确认以下项目：

- [ ] Claude Desktop 已安装
- [ ] 项目路径已确认（`/home/devbox/project`）
- [ ] 配置文件已创建并正确配置
- [ ] 配置文件使用绝对路径
- [ ] npm 在系统 PATH 中
- [ ] 项目依赖已安装（`npm install`）
- [ ] Claude Desktop 已重启
- [ ] MCP Server 连接状态正常
- [ ] 可以在 Claude Desktop 中看到工具列表

---

## 🎉 完成！

配置完成后，您就可以在 Claude Desktop 中使用 TripNARA 的所有 Skills 了！

如果遇到问题，请查看故障排除部分或检查日志文件。

