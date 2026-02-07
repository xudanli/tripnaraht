# Rail MCP 认证说明

## ❓ 是否必须认证？

**是的，Rail MCP 服务需要 OAuth 认证。**

根据测试结果，`https://server.smithery.ai/DeniseLewis200081/rail` 服务会返回：
- `401 Unauthorized`
- `{"error":"invalid_token","error_description":"Missing Authorization header"}`

这说明服务**强制要求认证**。

---

## ✅ 解决方案

### 方案 1: 完成 OAuth 认证（推荐）

**优点**:
- ✅ 可以使用 Rail MCP 的所有功能
- ✅ 只需认证一次，之后自动使用保存的 token
- ✅ OAuth 回调端点已配置好

**步骤**:
1. 运行认证脚本：
   ```bash
   npm run mcp:auth:rail
   ```

2. 访问显示的认证 URL

3. 完成授权后，浏览器会重定向到 `http://localhost:3000/oauth/callback?code=...`

4. 认证信息会自动保存，之后无需再次认证

---

### 方案 2: 禁用 Rail MCP（如果不需要）

如果暂时不需要铁路功能，可以禁用 Rail MCP：

**方法**: 设置环境变量
```bash
# 在 .env 文件中添加
ENABLE_RAIL_MCP=false
```

**禁用后的影响**:
- Rail 工具将不可用
- 其他 MCP 服务不受影响
- 可以随时重新启用（移除环境变量或设置为 `true`）

---

## 🔄 与其他服务的对比

| 服务 | 是否需要认证 | 说明 |
|------|-------------|------|
| **Weather Direct API** | ❌ 否 | 直接使用 Open-Meteo API，无需认证 |
| **Google Maps Direct API** | ❌ 否 | 使用 API Key，无需 OAuth |
| **PostgreSQL MCP** | ❌ 否 | 无需认证（如果数据库允许） |
| **Rail MCP** | ✅ **是** | **需要 OAuth 认证** |
| **Google Calendar MCP** | ✅ 是 | 需要 OAuth 认证 |
| **Airbnb MCP** | ✅ 是 | 需要 OAuth 认证 |

---

## 💡 建议

1. **如果需要铁路功能**: 完成 OAuth 认证（只需一次）
2. **如果暂时不需要**: 设置 `ENABLE_RAIL_MCP=false` 禁用
3. **如果认证遇到问题**: 
   - 确保服务器正在运行（OAuth 回调需要）
   - 检查 `~/.tripnara-mcp/rail-*.json` 文件权限
   - 查看认证脚本的输出日志

---

## 📝 相关文件

- `src/mcp/rail-client.ts` - Rail MCP 客户端（自动检测是否需要认证）
- `src/mcp/rail-bridge-server.ts` - 桥接服务器
- `scripts/rail-auth.ts` - 认证助手脚本
- `src/main.ts` - OAuth 回调端点（`/oauth/callback`）
