# 硬编码 Client ID 检查报告

## 检查结果

✅ **后端代码检查**：未发现硬编码的 Google Client ID

后端代码中所有 Client ID 都通过环境变量读取：

```typescript
// src/auth/services/google-oauth.service.ts
this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID') || '';
```

## 问题定位

从错误 URL 可以看到：
```
client_id=your_production_google_client_id_here
```

这说明**前端代码中硬编码了占位符值**，而不是从环境变量读取。

## 解决方案

### 前端需要检查的地方

1. **环境变量配置**
   - 检查 `.env`、`.env.local`、`.env.production` 文件
   - 确认 `REACT_APP_GOOGLE_CLIENT_ID` 或 `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 是否正确配置

2. **代码中的硬编码**
   - 搜索代码中的 `your_production_google_client_id_here`
   - 搜索 `client_id` 的硬编码使用
   - 确保所有地方都使用 `process.env.REACT_APP_GOOGLE_CLIENT_ID`

3. **前端代码示例（正确方式）**

```javascript
// ✅ 正确：使用环境变量
const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

// 验证
if (!clientId) {
  console.error('❌ Google Client ID 未配置！');
  return;
}

window.google.accounts.oauth2.initCodeClient({
  client_id: clientId, // ✅ 使用环境变量
  // ...
});
```

```javascript
// ❌ 错误：硬编码占位符
window.google.accounts.oauth2.initCodeClient({
  client_id: 'your_production_google_client_id_here', // ❌ 这是占位符，不会工作
  // ...
});
```

```javascript
// ❌ 错误：硬编码实际值（不应该提交到代码库）
window.google.accounts.oauth2.initCodeClient({
  client_id: '123456789-xxx.apps.googleusercontent.com', // ❌ 不应该硬编码
  // ...
});
```

## 检查清单

### 后端（✅ 已确认无硬编码）
- [x] `src/auth/services/google-oauth.service.ts` - 使用环境变量
- [x] 其他后端文件 - 未发现硬编码

### 前端（⚠️ 需要检查）
- [ ] 搜索代码中的 `your_production_google_client_id_here`
- [ ] 搜索代码中的 `client_id: 'xxx'` 硬编码
- [ ] 检查所有使用 `window.google.accounts` 的地方
- [ ] 确认环境变量正确配置
- [ ] 确认构建时环境变量被正确注入

## 快速修复步骤

1. **找到硬编码的位置**：
   ```bash
   # 在前端代码库中搜索
   grep -r "your_production_google_client_id" .
   grep -r "client_id.*['\"].*google" .
   ```

2. **替换为环境变量**：
   ```javascript
   // 找到这行
   client_id: 'your_production_google_client_id_here',
   
   // 替换为
   const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
   // ...
   client_id: clientId,
   ```

3. **配置环境变量**：
   ```env
   # .env.production
   REACT_APP_GOOGLE_CLIENT_ID=你的实际客户端ID.apps.googleusercontent.com
   ```

4. **重新构建和部署**：
   - 确保环境变量已配置
   - 重新构建前端应用
   - 清除浏览器缓存
   - 测试登录功能

## 验证

修复后，打开浏览器开发者工具，检查：

1. **Console 输出**：
   ```javascript
   console.log('Google Client ID:', process.env.REACT_APP_GOOGLE_CLIENT_ID);
   ```
   应该显示实际的 Client ID，而不是 `undefined` 或占位符

2. **Network 请求**：
   - 打开 Network 面板
   - 查找发送到 `accounts.google.com` 的请求
   - 检查 `client_id` 参数是否为实际值（格式：`xxx.apps.googleusercontent.com`）

3. **不再出现 `invalid_client` 错误**

