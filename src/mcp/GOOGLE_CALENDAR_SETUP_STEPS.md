# Google Calendar MCP 设置步骤

## 🎯 快速设置指南

### 步骤 1: 获取认证 URL

运行认证助手脚本：

```bash
npm run mcp:auth:google-calendar
```

脚本会显示一个认证 URL，类似：

```
https://auth.smithery.ai/googlecalendar/authorize?response_type=code&...
```

### 步骤 2: 完成 Google 认证

1. **复制认证 URL**（从终端输出中）
2. **在浏览器中打开**该 URL
3. **登录 Google 账户**（如果未登录）
4. **授权应用访问您的 Google Calendar**
5. **授权完成后**，浏览器会重定向到回调页面

### 步骤 3: 获取授权码

回调页面 URL 格式类似：

```
http://localhost:3000/oauth/callback?code=AUTHORIZATION_CODE_HERE&state=...
```

**重要**: 
- 对于命令行应用，MCP SDK 会自动处理认证流程
- 您只需要完成浏览器中的授权即可
- 认证信息会自动保存到 `~/.tripnara-mcp/` 目录

### 步骤 4: 验证认证

重新运行测试脚本：

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

## 🔄 完整认证流程说明

### 对于命令行应用

1. **首次连接** → 显示认证 URL
2. **用户授权** → 在浏览器中完成 Google OAuth
3. **自动保存** → MCP SDK 自动保存 tokens
4. **后续使用** → 自动使用保存的 tokens

### 对于 Claude Desktop

1. **配置桥接服务器** → 在 Claude Desktop 配置文件中添加
2. **重启 Claude Desktop** → 自动启动桥接服务器
3. **首次使用** → 查看日志找到认证 URL
4. **完成授权** → 在浏览器中完成
5. **自动保存** → 认证信息保存到本地

---

## 📋 当前认证 URL

**请复制以下 URL 并在浏览器中打开**：

```
https://auth.smithery.ai/googlecalendar/authorize?response_type=code&client_id=v4.local.WiZGzRuhUhcg26Tz098owXmoBRdjKys5RZLK7Cn5QXz59EyHp3INobT1P-8ryiR0x76cSRzVbYQLkEcZi6ajG5A1WXCADgewmhxcDlC3-VEZtLiDkOfA0kQUlPc3-PHcSFn6kn8XeGz2q9eumIY2VQSzHLfAAy4--9EYSZSvBw0McRdCxA1iDVfMPlADSA1zudv-A0ci2l-Bu9KjnOva9BjegiV-QkTUNGalb5g8HVR1nDtTdAtECBtyEo0R35IfJOwoBYz5mlJrhU6u9Lf0iXX0HzHpTb_EB6iiPvp9tk4MJdTSsnV-2dfmmplgUqW0Ba3sKKZiiAAQ0_DQlHp3Nxu6nlQIynWL_Gepp8aw2tqcBbhow469VPCzICXpsJY36fSRQ3Pjj0MdiE5QJwFobG8b7agcqJ64-VCpBFR2NdX8CJwlPRfDTw1C9wjiaBewBRrKV3lZ5opJdWIRIDP28fvNlk8mALllD3ZaP0xuLGgPhkkY0Pca7tDNpe-p9FoYzOBCKTiFzECBAsMrbWK9LA5tprvMrC1TFA1dNS5-I5qDhF7GwB2lWWr8AF9kRO9PEzATnpL69c3BZVcgGfdYpHKAmhbXsXDKDS0m6isGL6Rvq6RojwEddl2d9pIGB37xYl5oKrcenHVe9WjUDQ&code_challenge=mMze4Dz10MwUY6dw8Aa9ORdw360MV0TnQahHZfJV318&code_challenge_method=S256&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Foauth%2Fcallback&scope=read+write&resource=https%3A%2F%2Fserver.smithery.ai%2Fgooglecalendar
```

**注意**: 这个 URL 是动态生成的，每次运行脚本都会不同。请使用最新运行的脚本输出的 URL。

---

## ✅ 认证完成后的验证

运行以下命令验证认证是否成功：

```bash
npm run mcp:test:google-calendar
```

成功输出示例：

```
🔌 正在连接到 Google Calendar MCP 服务器...
✅ Connected to Google Calendar MCP server
✅ 连接成功！

📅 测试 1: 获取当前日期时间
结果: {...}
✅ 测试 1 通过

📋 测试 2: 列出所有日历
结果: {...}
✅ 测试 2 通过

...
🎉 所有测试完成！
```

---

## 🆘 如果遇到问题

### 问题 1: 认证 URL 打不开

**解决方案**:
- 检查网络连接
- 确认能访问 `https://auth.smithery.ai`
- 尝试复制 URL 到其他浏览器

### 问题 2: 授权后仍然未认证

**解决方案**:
1. 删除认证文件：`rm -rf ~/.tripnara-mcp/googlecalendar-*`
2. 重新运行认证助手脚本
3. 完成授权流程

### 问题 3: Token 过期

**解决方案**:
- MCP SDK 会自动刷新 token
- 如果刷新失败，删除 tokens.json 重新认证

---

## 📚 相关文档

- [认证指南](./GOOGLE_CALENDAR_AUTH_GUIDE.md) - 详细的认证说明
- [快速开始](./GOOGLE_CALENDAR_QUICKSTART.md) - 快速开始指南
- [完整集成文档](./GOOGLE_CALENDAR_INTEGRATION.md) - 完整的集成文档

---

**提示**: 完成首次认证后，认证信息会保存，后续使用无需再次认证！
