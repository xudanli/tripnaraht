# Google Maps MCP 故障排除指南

## 🔍 常见错误及解决方案

### 错误 0: "Internal server error" (OAuth 回调时)

**症状**:
在浏览器中完成 Google OAuth 授权后，回调到 `auth.smithery.ai/connect` 时显示：
```json
{"error":"Internal server error"}
```

**原因**:
- Smithery 认证服务器临时故障
- OAuth 回调处理过程中服务器端错误
- 网络问题导致回调失败

**解决方案**:

1. **等待并重试**（最常见）:
   - 这是临时服务器错误，通常几分钟后会恢复
   - 等待 2-5 分钟后，重新运行认证助手：
     ```bash
     npm run mcp:auth:google-maps -- --clear
     ```

2. **检查网络连接**:
   ```bash
   curl -I https://auth.smithery.ai
   ```

3. **尝试不同的网络**:
   - 如果使用 VPN，尝试关闭或切换
   - 如果在企业网络，尝试使用移动热点

4. **联系 Smithery 支持**:
   - 如果持续出现此错误，可能是 Smithery 服务问题
   - 检查 Smithery 状态页面（如果有）

5. **使用备用认证方式**（如果可用）:
   - 某些情况下，可以稍后重试
   - 或者等待 Smithery 服务恢复

**注意**: 这个错误发生在服务器端，不是您的配置问题。通常等待几分钟后重试即可解决。

---

### 错误 1: "Session not found or expired"

**症状**:
```
{"error":"Session not found or expired"}
```

**原因**:
- OAuth 会话已过期
- 认证流程未完成
- 认证文件损坏或丢失

**解决方案**:

1. **清理并重新认证**（推荐）:
   ```bash
   npm run mcp:auth:google-maps -- --clear
   ```

2. **手动清理认证文件**:
   ```bash
   rm ~/.tripnara-mcp/google_maps-*
   npm run mcp:auth:google-maps
   ```

3. **验证认证文件**:
   ```bash
   ls -la ~/.tripnara-mcp/google_maps-*
   ```
   应该看到以下文件：
   - `google_maps-tokens.json`
   - `google_maps-client-info.json`
   - `google_maps-code-verifier.txt`

---

### 错误 2: "Unauthorized"

**症状**:
```
UnauthorizedError: Unauthorized
```

**原因**:
- 未完成 OAuth 认证
- Token 已过期
- 权限不足

**解决方案**:

1. **完成首次认证**:
   ```bash
   npm run mcp:auth:google-maps
   ```

2. **检查认证状态**:
   ```bash
   cat ~/.tripnara-mcp/google_maps-tokens.json
   ```

3. **如果 token 过期，重新认证**:
   ```bash
   npm run mcp:auth:google-maps -- --clear
   ```

---

### 错误 3: "Failed to connect"

**症状**:
```
❌ Failed to connect: [错误信息]
```

**原因**:
- 网络连接问题
- 服务器不可用
- 认证配置错误

**解决方案**:

1. **检查网络连接**:
   ```bash
   curl -I https://server.smithery.ai/google_maps
   ```

2. **检查认证配置**:
   ```bash
   ls -la ~/.tripnara-mcp/
   ```

3. **查看详细错误日志**:
   - 检查终端输出的完整错误信息
   - 查看是否有认证 URL 显示

---

### 错误 4: "No code verifier stored"

**症状**:
```
Error: No code verifier stored
```

**原因**:
- 认证流程中断
- 代码验证器文件丢失

**解决方案**:

1. **清理并重新认证**:
   ```bash
   npm run mcp:auth:google-maps -- --clear
   ```

2. **确保完成完整的认证流程**:
   - 不要中断认证过程
   - 等待认证完成后再关闭终端

---

## 🔧 诊断步骤

### 步骤 1: 检查认证文件

```bash
# 列出所有认证文件
ls -la ~/.tripnara-mcp/google_maps-*

# 检查 tokens 文件内容（注意：包含敏感信息）
cat ~/.tripnara-mcp/google_maps-tokens.json
```

### 步骤 2: 测试连接

```bash
# 运行测试脚本
npm run mcp:test:google-maps
```

### 步骤 3: 检查日志

查看终端输出的详细错误信息，特别注意：
- 是否有认证 URL 显示
- 错误消息的完整内容
- 堆栈跟踪信息

---

## 🛠️ 重置认证

如果所有方法都失败，可以完全重置认证：

```bash
# 1. 删除所有认证文件
rm -f ~/.tripnara-mcp/google_maps-*

# 2. 重新运行认证助手
npm run mcp:auth:google-maps

# 3. 完成 OAuth 流程

# 4. 验证认证
npm run mcp:test:google-maps
```

---

## 📞 获取帮助

如果问题仍然存在：

1. **检查文档**:
   - [Google Maps 集成指南](./GOOGLE_MAPS_INTEGRATION.md)
   - [Google Maps 认证指南](./GOOGLE_MAPS_AUTH_GUIDE.md)

2. **查看日志**:
   - 保存完整的错误输出
   - 检查认证文件的内容

3. **联系支持**:
   - 提供错误消息和日志
   - 说明已尝试的解决方案

---

**最后更新**: 2026-02-06
