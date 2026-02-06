# Google Maps MCP OAuth 回调错误处理

## 🔴 错误: "Internal server error" 在 OAuth 回调时

### 问题描述

在完成 Google OAuth 授权后，浏览器回调到 `auth.smithery.ai/connect` 时显示：

```json
{"error":"Internal server error"}
```

### 错误发生位置

```
用户浏览器 → Google OAuth 授权页面 → 用户授权 → 回调到 auth.smithery.ai/connect → ❌ Internal server error
```

### 原因分析

这是 **Smithery 认证服务器的临时故障**，不是您的客户端配置问题。可能的原因：

1. **服务器临时过载**: Smithery 服务器可能正在处理大量请求
2. **OAuth 回调处理错误**: 服务器在处理 OAuth code 交换时出错
3. **网络问题**: 服务器与 Google OAuth 服务器之间的通信问题
4. **服务维护**: Smithery 可能正在进行维护

### 解决方案

#### 方案 1: 等待并重试（推荐）⭐

这是最常见的解决方案，因为大多数情况下这是临时错误：

1. **等待 2-5 分钟**
2. **清理旧的认证信息**:
   ```bash
   npm run mcp:auth:google-maps -- --clear
   ```
3. **重新运行认证助手**:
   ```bash
   npm run mcp:auth:google-maps
   ```
4. **完成新的 OAuth 流程**

#### 方案 2: 检查服务状态

检查 Smithery 服务是否正常：

```bash
# 检查认证服务器
curl -I https://auth.smithery.ai

# 检查 MCP 服务器
curl -I https://server.smithery.ai/google_maps
```

如果服务器返回 5xx 错误，说明是服务器端问题，需要等待服务恢复。

#### 方案 3: 网络诊断

如果怀疑是网络问题：

1. **检查网络连接**:
   ```bash
   ping auth.smithery.ai
   ```

2. **尝试不同的网络**:
   - 如果使用 VPN，尝试关闭
   - 如果在企业网络，尝试使用移动热点
   - 如果在受限网络，可能需要配置代理

3. **检查 DNS**:
   ```bash
   nslookup auth.smithery.ai
   ```

#### 方案 4: 手动重试认证流程

如果自动重试失败：

1. **完全清理认证信息**:
   ```bash
   rm -f ~/.tripnara-mcp/google_maps-*
   ```

2. **重新启动认证流程**:
   ```bash
   npm run mcp:auth:google-maps
   ```

3. **在浏览器中完成授权时**:
   - 确保不要关闭浏览器标签页
   - 等待回调完成（即使显示错误）
   - 然后立即重试

### 预防措施

虽然这是服务器端问题，但可以采取以下措施减少影响：

1. **在低峰时段进行认证**: 避开服务器高负载时段
2. **使用稳定的网络**: 确保网络连接稳定
3. **不要频繁重试**: 避免在短时间内多次重试，可能触发限流

### 何时联系支持

如果以下情况持续出现，可能需要联系 Smithery 支持：

- ✅ 等待 30 分钟后仍然失败
- ✅ 多次重试（5+ 次）都失败
- ✅ 其他用户也报告相同问题
- ✅ 服务器状态检查显示持续错误

### 临时解决方案

如果急需使用 Google Maps 功能，可以考虑：

1. **使用 API Key 方式**（如果服务支持）:
   - 某些已废弃的 API 可能支持直接使用 API Key
   - 但这不是推荐的方式

2. **等待服务恢复**:
   - 大多数情况下，等待一段时间后问题会自动解决

### 相关文档

- [Google Maps 认证指南](./GOOGLE_MAPS_AUTH_GUIDE.md)
- [Google Maps 故障排除](./GOOGLE_MAPS_TROUBLESHOOTING.md)
- [Google Maps 集成指南](./GOOGLE_MAPS_INTEGRATION.md)

---

**最后更新**: 2026-02-06  
**错误类型**: 服务器端临时错误  
**解决难度**: ⭐⭐ (简单，通常等待即可)
