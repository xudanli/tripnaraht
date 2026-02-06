# Airbnb MCP 认证步骤

## 🔐 完成首次认证

### 步骤 1: 获取认证 URL

运行认证助手脚本：

```bash
npm run mcp:auth:airbnb
```

脚本会显示一个认证 URL，类似：

```
https://auth.smithery.ai/iclickfreedownloads/mcp-server-airbnb/authorize?response_type=code&...
```

### 步骤 2: 完成 Airbnb 认证

1. **复制认证 URL**（从终端输出中）
2. **在浏览器中打开**该 URL
3. **登录 Airbnb 账户**（如果未登录）
4. **授权应用访问您的 Airbnb 账户**
5. **授权完成后**，浏览器会重定向到回调页面

### 步骤 3: 验证认证

完成授权后，运行测试脚本验证：

```bash
npm run mcp:test:airbnb
```

如果看到以下输出，说明认证成功：

```
✅ Connected to Airbnb MCP server
✅ 测试 1 通过
...
```

---

## 📋 当前认证 URL

**请复制以下 URL 并在浏览器中打开**：

```
https://auth.smithery.ai/iclickfreedownloads/mcp-server-airbnb/authorize?response_type=code&client_id=v4.local.l4CK74znPDZnIdaq2QPssxZDu_BNFcCku7iS5oGn7iPrxdbQ2SXnWWjc0ndkwJRB1fcpZqDi64SGss6H66heyDlJAY2yKLLqTcmLCkn9DiERwTOkEZNrxbmIQUdV5YZOtI5j8th_7OSeZe8l_r6GTYoV62kcAAV75DBEM9ysDaMejI4lTgFSXevHT1vAxjLfmC8hENOXvk7w1YmTqXzUKDfvkOIDKknLRWWJNEmmayROMbmRCwWgxuiCWkLeCMNIERPCfoEBgavCSLtCJ5cBjRw05iPXYjrFhUcLtKDgpVhKW9rKZzNXgemNlhZwciDQyrn7wzXwewiwQzWnv5mtYJA6HCnjK4pSqQ2Zobbsd-cBvKZqOvOoh7xrO4L4y1A9groA0gzTt07nkN_nM2j7FFMJBnLMYqhRuoxmBAeOmaGc2H5Calh7LI4uXxAZJxKNzbh_YDFE14__8q6LPcX3MVkjCCEvKrmtzP6F12U6MTB0UCOP9He_QZuPfart3IhSgbAHd-NvxdDBplqEa_nqq3DOTSfZrv5cOdrlOeyhM5a0Og4h3eMGXoBx8-lpa9oF4pRcxEMdYZLbTf8Te-YPGq_ZGqwkijrvTURKbnpuBXkkEeTSusp4Y0CghkO0vuwvwfFTUw&code_challenge=5TDauhX6UOPOH6ucgiw9HTbU9yvUM7k9Hv327QQjXVs&code_challenge_method=S256&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Foauth%2Fcallback&scope=read+write&resource=https%3A%2F%2Fserver.smithery.ai%2Ficlickfreedownloads%2Fmcp-server-airbnb
```

**注意**: 这个 URL 是动态生成的，每次运行脚本都会不同。请使用最新运行的脚本输出的 URL。

---

## ✅ 认证完成后的验证

运行以下命令验证认证是否成功：

```bash
npm run mcp:test:airbnb
```

成功输出示例：

```
🔌 正在连接到 Airbnb MCP 服务器...
✅ Connected to Airbnb MCP server
✅ 连接成功！

🛠️  测试 1: 列出所有可用工具
找到 X 个工具:
  - tool1: 描述
  - tool2: 描述
✅ 测试 1 通过

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
1. 删除认证文件：`rm -rf ~/.tripnara-mcp/mcp-server-airbnb-*`
2. 重新运行认证助手脚本
3. 完成授权流程

### 问题 3: Token 过期

**解决方案**:
- MCP SDK 会自动刷新 token
- 如果刷新失败，删除 tokens.json 重新认证

---

## 📚 相关文档

- [快速开始指南](./AIRBNB_QUICKSTART.md)
- [完整集成文档](./AIRBNB_INTEGRATION.md)
- [MCP 服务器总结](./MCP_SERVERS_SUMMARY.md)

---

**提示**: 完成首次认证后，认证信息会保存，后续使用无需再次认证！
