# Google Calendar MCP 认证指南

## 🔐 首次认证流程

首次使用 Google Calendar MCP 服务时，需要完成 OAuth 认证。以下是详细步骤：

---

## 方式 1: 通过 Claude Desktop（推荐）⭐

### 步骤 1: 配置桥接服务器

在 Claude Desktop 配置文件中添加：

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "npx",
      "args": ["tsx", "src/mcp/google-calendar-bridge-server.ts"],
      "cwd": "/home/devbox/project"
    }
  }
}
```

### 步骤 2: 重启 Claude Desktop

完全退出并重新启动 Claude Desktop。

### 步骤 3: 首次使用

当您在 Claude Desktop 中首次使用 Google Calendar 功能时：

1. Claude Desktop 会自动启动桥接服务器
2. 桥接服务器会尝试连接 Google Calendar 服务
3. 如果未认证，会在 stderr 中显示认证 URL
4. **查看 Claude Desktop 的日志**（见下方）找到认证 URL
5. 在浏览器中打开认证 URL
6. 完成 Google 登录和授权
7. 授权完成后，认证信息会自动保存
8. 后续使用无需再次认证

### 查看 Claude Desktop 日志

**macOS**:
```bash
tail -f ~/Library/Logs/Claude/*.log
```

**Windows**:
```bash
# PowerShell
Get-Content "$env:APPDATA\Claude\Logs\*.log" -Tail 50 -Wait
```

**Linux**:
```bash
tail -f ~/.config/Claude/logs/*.log
```

---

## 方式 2: 通过命令行测试脚本

### 步骤 1: 运行测试脚本

```bash
npm run mcp:test:google-calendar
```

### 步骤 2: 完成认证

脚本会显示认证 URL，例如：

```
🔐 ============================================
Google Calendar 认证
============================================

请访问以下 URL 完成 Google Calendar 认证:

https://auth.smithery.ai/googlecalendar/authorize?response_type=code&...

认证完成后，请在回调 URL 中获取授权码。
============================================
```

### 步骤 3: 访问认证 URL

1. **复制认证 URL**（从终端输出中）
2. **在浏览器中打开**
3. **完成 Google 登录**（如果未登录）
4. **授权应用访问您的 Google Calendar**
5. **授权完成后**，浏览器会重定向到回调页面

### 步骤 4: 获取授权码

回调 URL 格式类似：
```
http://localhost:3000/oauth/callback?code=AUTHORIZATION_CODE&state=...
```

**注意**: 对于命令行应用，您需要：
1. 从回调 URL 中提取 `code` 参数
2. 使用认证助手脚本完成认证（见下方）

---

## 方式 3: 使用认证助手脚本

我们提供了一个认证助手脚本，可以引导您完成认证：

```bash
npm run mcp:auth:google-calendar
```

这个脚本会：
1. 尝试连接 Google Calendar 服务
2. 如果需要认证，显示认证 URL
3. 引导您完成认证流程
4. 测试连接是否成功

---

## 🔄 重新认证

如果需要重新认证（例如 token 过期或需要更换账户）：

### 方法 1: 删除认证文件

```bash
rm -rf ~/.tripnara-mcp/googlecalendar-*
```

然后重新运行测试脚本或使用 Claude Desktop。

### 方法 2: 手动删除特定文件

```bash
# 删除 tokens（保留客户端信息）
rm ~/.tripnara-mcp/googlecalendar-tokens.json

# 或删除所有认证信息
rm ~/.tripnara-mcp/googlecalendar-*
```

---

## 📁 认证信息存储位置

认证信息存储在：

```
~/.tripnara-mcp/
├── googlecalendar-tokens.json         # OAuth tokens（包含 access_token 和 refresh_token）
├── googlecalendar-client-info.json    # 客户端注册信息
└── googlecalendar-code-verifier.txt   # PKCE 代码验证器
```

### 文件说明

- **tokens.json**: 包含访问令牌和刷新令牌，用于后续 API 调用
- **client-info.json**: MCP 客户端注册信息
- **code-verifier.txt**: PKCE 流程的代码验证器

---

## 🔒 安全注意事项

1. **不要提交认证文件到版本控制**
   - 确保 `.tripnara-mcp/` 在 `.gitignore` 中

2. **保护认证文件权限**
   ```bash
   chmod 600 ~/.tripnara-mcp/googlecalendar-*
   ```

3. **生产环境建议**
   - 使用加密存储保存 tokens
   - 实现 token 刷新机制
   - 定期轮换访问令牌

---

## ❓ 常见问题

### Q: 认证 URL 打不开？

A: 检查：
1. 网络连接是否正常
2. 能否访问 `https://auth.smithery.ai`
3. 防火墙是否阻止了访问

### Q: 授权后仍然显示未认证？

A: 可能原因：
1. 回调 URL 处理失败
2. Token 保存失败
3. 检查 `~/.tripnara-mcp/` 目录权限

解决方案：
1. 删除认证文件重新认证
2. 检查目录权限：`ls -la ~/.tripnara-mcp/`
3. 确保有写入权限

### Q: Token 过期怎么办？

A: MCP SDK 会自动使用 refresh_token 刷新 access_token。如果刷新失败：
1. 删除 tokens.json
2. 重新完成认证流程

### Q: 可以在多个设备上使用吗？

A: 可以，每个设备需要单独完成认证。认证信息存储在本地，不会跨设备同步。

---

## 🧪 验证认证状态

运行测试脚本验证认证是否成功：

```bash
npm run mcp:test:google-calendar
```

如果看到以下输出，说明认证成功：

```
✅ Connected to Google Calendar MCP server
✅ 测试 1 通过
✅ 测试 2 通过
...
```

---

## 📚 相关文档

- [快速开始指南](./GOOGLE_CALENDAR_QUICKSTART.md)
- [完整集成文档](./GOOGLE_CALENDAR_INTEGRATION.md)
- [Smithery 认证文档](https://smithery.ai/docs/use/connect)

---

**提示**: 首次认证后，认证信息会保存，后续使用无需再次认证，除非 token 过期或手动删除认证文件。
