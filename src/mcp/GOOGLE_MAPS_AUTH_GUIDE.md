# Google Maps MCP 认证指南

## 📋 概述

Google Maps MCP 服务使用 OAuth 2.0 认证。首次使用需要完成一次性的授权流程。

---

## 🔐 认证步骤

### 步骤 1: 运行认证助手

```bash
npm run mcp:auth:google-maps
```

### 步骤 2: 复制认证 URL

脚本会显示一个认证 URL，类似：

```
https://auth.smithery.ai/google_maps/authorize?response_type=code&client_id=...
```

### 步骤 3: 在浏览器中打开 URL

1. 复制完整的认证 URL
2. 在浏览器中打开该 URL
3. 您会被重定向到 Google OAuth 授权页面

### 步骤 4: 完成 Google 授权

1. 登录您的 Google 账号（如果尚未登录）
2. 查看权限请求
3. 点击"允许"或"授权"
4. 授权完成后，您会被重定向回应用

### 步骤 5: 验证认证

授权完成后，重新运行认证助手：

```bash
npm run mcp:auth:google-maps
```

如果看到以下消息，说明认证成功：

```
✅ 认证成功！Google Maps MCP 客户端已连接。
```

---

## 💾 认证信息存储

认证信息会自动保存在：

```
~/.tripnara-mcp/google_maps-tokens.json
~/.tripnara-mcp/google_maps-client-info.json
~/.tripnara-mcp/google_maps-code-verifier.txt
```

**重要提示**:
- 这些文件包含敏感信息，请妥善保管
- 不要将这些文件提交到版本控制
- 如果文件丢失，需要重新完成认证流程

---

## 🔄 重新认证

如果遇到以下情况，需要重新认证：

1. **认证过期**: 如果收到 "Unauthorized" 或 "Session not found or expired" 错误
2. **文件丢失**: 如果认证文件被删除
3. **更换账号**: 如果需要使用不同的 Google 账号

### 方法 1: 使用清理选项（推荐）

```bash
npm run mcp:auth:google-maps -- --clear
```

这会自动清理旧的认证信息并开始新的认证流程。

### 方法 2: 手动清理

1. 删除旧的认证文件：
   ```bash
   rm ~/.tripnara-mcp/google_maps-*
   ```

2. 重新运行认证助手：
   ```bash
   npm run mcp:auth:google-maps
   ```

---

## ⚠️ 常见问题

### Q: 认证 URL 打不开怎么办？

**A**: 确保：
- URL 完整复制（可能很长）
- 网络连接正常
- 浏览器允许打开外部链接

### Q: 在浏览器中完成授权后，显示 "Internal server error"？

**A**: 这是 Smithery 认证服务器的临时错误，不是您的配置问题。

**解决方案**:
1. **等待 2-5 分钟**后重试（最常见）
2. 清理认证信息并重新开始：
   ```bash
   npm run mcp:auth:google-maps -- --clear
   ```
3. 检查网络连接是否正常
4. 如果持续出现，可能是 Smithery 服务问题，稍后再试

---

### Q: 授权后仍然显示 "Unauthorized" 或 "Session not found or expired"？

**A**: 可能的原因：
- 授权流程未完全完成
- 认证文件未正确保存
- 会话已过期
- 需要等待几秒钟让认证信息同步

**解决方案**:
1. 等待 10-30 秒
2. 清理旧的认证信息并重新认证：
   ```bash
   npm run mcp:auth:google-maps -- --clear
   ```
3. 如果仍然失败，手动删除认证文件并重新认证：
   ```bash
   rm ~/.tripnara-mcp/google_maps-*
   npm run mcp:auth:google-maps
   ```

### Q: 可以使用多个 Google 账号吗？

**A**: 当前实现使用单例模式，一次只能使用一个账号。如果需要切换账号，需要：
1. 删除当前认证文件
2. 使用新账号重新认证

### Q: 认证信息会过期吗？

**A**: OAuth token 可能会过期。如果过期：
- 系统会自动尝试刷新 token
- 如果刷新失败，需要重新认证

---

## 🧪 测试认证

完成认证后，运行测试脚本验证：

```bash
npm run mcp:test:google-maps
```

如果测试通过，说明认证成功。

---

## 📚 相关文档

- [Google Maps 集成指南](./GOOGLE_MAPS_INTEGRATION.md)
- [MCP 服务器集成总结](./MCP_SERVERS_SUMMARY.md)

---

**最后更新**: 2026-02-06
