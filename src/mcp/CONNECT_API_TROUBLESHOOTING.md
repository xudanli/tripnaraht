# Connect API 问题排查

## ✅ 问题已解决！

**解决方案**：不指定 namespace，让 SDK 自动处理。

```typescript
// ✅ 推荐做法
const client = new AirbnbMcpClientConnectAPI();
```

## 🔍 之前的问题

运行 `npm run mcp:test:airbnb:connect` 时遇到错误：

```
404 Invalid credentials or namespace not found. 
Please ensure that the namespace exists, your token is not expired, 
and your token has access to the specified namespace.
```

**根本原因**：指定了可能不存在的 namespace `'tripnara'`。

## 📋 可能的原因

### 1. API Key 问题

**检查项**:
- ✅ API Key 格式正确（36 个字符的 UUID 格式）
- ❓ API Key 是否有效
- ❓ API Key 是否有访问 Connect API 的权限
- ❓ API Key 是否已过期

**解决方案**:
1. 访问 https://smithery.ai/account/api-keys
2. 检查 API Key 状态
3. 如果无效，创建新的 API Key
4. 确保 API Key 有访问 Connect API 的权限

### 2. Namespace 问题

**问题**: Namespace `tripnara` 可能不存在，需要先创建。

**解决方案**:
根据 Smithery 文档，namespace 应该会自动创建。但如果遇到此错误，可能需要：

1. **使用不同的 namespace 名称**
   ```typescript
   const client = new AirbnbMcpClientConnectAPI('my-app');
   ```

2. **不指定 namespace**（让 SDK 自动创建）✅ **推荐方案**
   ```typescript
   const client = new AirbnbMcpClientConnectAPI();
   ```
   - SDK 会自动使用第一个已存在的 namespace 或创建一个新的
   - **这是当前推荐的做法，已测试通过！**

3. **通过 Smithery Web UI 创建 namespace**
   - 访问 Smithery 网站
   - 在账户设置中创建 namespace

### 3. API Key 权限问题

**可能**: API Key 可能没有访问 Connect API（experimental）的权限。

**解决方案**:
1. 检查 API Key 的权限范围
2. 确保 API Key 有访问 experimental/connect API 的权限
3. 如果不行，联系 Smithery 支持

## 🛠️ 诊断步骤

### 步骤 1: 验证 API Key

运行诊断脚本：

```bash
npx tsx scripts/diagnose-smithery-connection.ts
```

### 步骤 2: 检查 API Key 状态

1. 访问 https://smithery.ai/account/api-keys
2. 查看 API Key 的：
   - 创建时间
   - 最后使用时间
   - 状态（Active/Inactive）
   - 权限范围

### 步骤 3: 尝试创建新的 API Key

1. 删除旧的 API Key（如果可能）
2. 创建新的 API Key
3. 更新 `.env` 文件中的 `SMITHERY_API_KEY`
4. 重新运行测试

### 步骤 4: 检查 Smithery 账户状态

1. 确认账户已激活
2. 确认账户有访问 Connect API 的权限
3. 检查是否有账户限制

## 💡 临时解决方案

如果 Connect API 无法使用，可以：

1. **使用直接 OAuth 方式**（之前实现的 `airbnb-client.ts`）
   ```bash
   npm run mcp:test:airbnb
   ```

2. **联系 Smithery 支持**
   - Email: support@smithery.ai
   - Discord: https://discord.gg/Afd38S5p9A

## 📚 相关资源

- [Smithery Connect API 文档](https://smithery.ai/docs/use/connect-api)
- [Smithery 支持](mailto:support@smithery.ai)
- [Smithery Discord](https://discord.gg/Afd38S5p9A)

## 🔄 下一步

1. **验证 API Key**: 确认 API Key 有效且有正确权限
2. **检查账户**: 确认 Smithery 账户状态正常
3. **联系支持**: 如果问题持续，联系 Smithery 支持获取帮助

---

**注意**: Connect API 是实验性功能，可能需要特定的账户权限或配置。
