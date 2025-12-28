# Google OAuth 错误排查指南

## 错误：`invalid_client` - "The OAuth client was not found"

### 问题描述
使用域名访问时出现 `invalid_client` 错误，提示 "The OAuth client was not found"（错误 401）。

### 可能原因

1. **前端使用的 Client ID 不正确**
   - 前端代码中硬编码的 Client ID 错误
   - 环境变量未设置或设置错误
   - 使用了错误的 Client ID（可能使用了其他项目的 Client ID）

2. **Client ID 与环境不匹配**
   - 开发环境使用了生产环境的 Client ID
   - 生产环境使用了开发环境的 Client ID

3. **Google Cloud Console 配置问题**
   - Client ID 已被删除或禁用
   - 使用了错误的项目/客户端 ID

### 排查步骤

#### 1. 确认 Google Cloud Console 配置

检查 Google Cloud Console 中的 OAuth 客户端配置：

1. 登录 [Google Cloud Console](https://console.cloud.google.com/)
2. 选择正确的项目
3. 进入 **API 和服务** → **凭据**
4. 找到对应的 **OAuth 2.0 客户端 ID**
5. 确认以下信息：
   - **客户端 ID**：复制这个完整的 ID（格式类似：`123456789-abcdefghijklmnop.apps.googleusercontent.com`）
   - **应用类型**：应该是 "Web 应用"
   - **已获授权的 JavaScript 来源**：包含以下域名
     - `http://localhost:5173`（开发环境）
     - `https://tripnara.com`（生产环境）
     - `https://www.tripnara.com`（生产环境）
   - **已获授权的重定向 URI**：包含以下 URI
     - `http://localhost:5173`（Popup 模式）
     - `https://tripnara.com`（Popup 模式）
     - `https://www.tripnara.com`（Popup 模式）

#### 2. 检查前端代码中的 Client ID

**前端环境变量配置**：

**开发环境** - 创建 `.env.development` 或 `.env.local`（React/Vue）：

```env
REACT_APP_GOOGLE_CLIENT_ID=你的完整客户端ID.apps.googleusercontent.com
REACT_APP_API_URL=http://localhost:3000
```

**生产环境** - 创建 `.env.production`：

```env
REACT_APP_GOOGLE_CLIENT_ID=你的完整客户端ID.apps.googleusercontent.com
REACT_APP_API_URL=http://47.253.148.159
```

或 Next.js：

**开发环境** (`.env.local`):
```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=你的完整客户端ID.apps.googleusercontent.com
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**生产环境** (`.env.production`):
```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=你的完整客户端ID.apps.googleusercontent.com
NEXT_PUBLIC_API_URL=http://47.253.148.159
```

**前端代码中使用**：

```javascript
// 确保使用正确的环境变量名
const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID; // React
// 或
const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID; // Next.js

// 验证 Client ID 是否正确加载
console.log('Google Client ID:', clientId);

if (!clientId) {
  console.error('❌ Google Client ID 未配置！请检查环境变量');
}

// 初始化 Google Identity Services
window.google.accounts.oauth2.initCodeClient({
  client_id: clientId, // ✅ 使用环境变量，不要硬编码
  scope: 'openid email profile',
  ux_mode: 'popup',
  callback: async (response) => {
    // ...
  },
});
```

#### 3. 验证 Client ID 格式

Client ID 应该是完整格式，例如：
```
123456789-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
```

**常见错误**：
- ❌ 只使用了数字部分：`123456789`
- ❌ 缺少 `.apps.googleusercontent.com` 后缀
- ❌ 包含多余的空格或换行符

#### 4. 检查前端域名匹配

确认前端访问的域名与 Google Cloud Console 中配置的域名完全一致：

**开发环境**：
- 前端访问：`http://localhost:5173`
- Google Console 必须包含：`http://localhost:5173`

**生产环境**：
- 前端访问：`https://tripnara.com`
- Google Console 必须包含：`https://tripnara.com`
- 如果使用 `www`，也要添加：`https://www.tripnara.com`

⚠️ **注意**：
- 协议必须匹配（`http://` vs `https://`）
- 端口号必须匹配（`:5173`）
- 域名必须完全一致（包括 `www` 前缀）

#### 5. 调试检查清单

创建一个调试页面或添加调试代码：

```javascript
function checkGoogleOAuthConfig() {
  const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
  
  console.log('=== Google OAuth 配置检查 ===');
  console.log('1. Client ID:', clientId);
  console.log('2. Client ID 格式:', clientId?.includes('.apps.googleusercontent.com') ? '✅ 正确' : '❌ 错误');
  console.log('3. 当前域名:', window.location.origin);
  console.log('4. Google Script 已加载:', typeof window.google !== 'undefined');
  
  if (!clientId) {
    alert('❌ 错误：Google Client ID 未配置！\n\n请检查环境变量 REACT_APP_GOOGLE_CLIENT_ID');
    return false;
  }
  
  if (!clientId.includes('.apps.googleusercontent.com')) {
    alert('❌ 错误：Client ID 格式不正确！\n\n应该是完整格式：xxx.apps.googleusercontent.com');
    return false;
  }
  
  console.log('✅ 配置检查通过');
  return true;
}

// 在初始化前调用
if (!checkGoogleOAuthConfig()) {
  return; // 停止初始化
}
```

#### 6. 浏览器控制台检查

打开浏览器开发者工具（F12），检查：

1. **Network 面板**：
   - 查看是否有请求发送到 `accounts.google.com`
   - 检查请求参数中是否包含正确的 `client_id`

2. **Console 面板**：
   - 查看是否有错误信息
   - 检查 Client ID 是否正确打印

3. **Application 面板**：
   - 检查环境变量是否正确加载（如果使用构建工具）

### 解决方案

#### 方案 1：更新前端环境变量

1. 从 Google Cloud Console 复制完整的 Client ID
2. 更新前端的 `.env` 文件
3. **重启开发服务器**（环境变量更改需要重启）
4. 清除浏览器缓存并刷新页面

#### 方案 2：确认使用正确的项目

如果你有多个 Google Cloud 项目：

1. 确认后端使用的 Client ID（查看后端 `.env` 文件中的 `GOOGLE_CLIENT_ID`）
2. 前端必须使用**相同的** Client ID
3. 确保 Google Cloud Console 中配置的域名包含前端访问的域名

#### 方案 3：临时调试（仅用于测试）

```javascript
// 临时硬编码 Client ID 进行测试（⚠️ 不要提交到代码库）
const clientId = '你的完整客户端ID.apps.googleusercontent.com';

window.google.accounts.oauth2.initCodeClient({
  client_id: clientId,
  // ...
});
```

如果硬编码可以工作，说明问题在环境变量配置；如果仍然失败，说明 Client ID 本身有问题。

### 常见错误对比

| 错误信息 | 可能原因 | 解决方案 |
|---------|---------|---------|
| `invalid_client` | Client ID 不存在或错误 | 检查 Client ID 是否正确 |
| `redirect_uri_mismatch` | 重定向 URI 不匹配 | 检查 Google Console 中的授权 URI |
| `unauthorized_client` | 客户端未授权 | 检查应用类型和域名配置 |
| `access_denied` | 用户拒绝了授权 | 用户操作，正常情况 |

### 验证步骤

完成配置后，按以下步骤验证：

1. ✅ 前端代码使用环境变量中的 Client ID
2. ✅ Google Cloud Console 中配置了正确的域名
3. ✅ Client ID 格式正确（包含 `.apps.googleusercontent.com`）
4. ✅ 前端访问的域名与配置的域名完全一致
5. ✅ 开发服务器已重启（如果修改了环境变量）
6. ✅ 浏览器缓存已清除

### 获取帮助

如果问题仍未解决，请提供以下信息：

1. 错误截图（包含完整的错误信息）
2. 浏览器控制台的错误日志
3. Google Cloud Console 中的客户端配置截图（隐藏敏感信息）
4. 前端代码中 Client ID 的配置方式（环境变量还是硬编码）
5. 前端访问的完整 URL

