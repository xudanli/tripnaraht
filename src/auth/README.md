# TripNARA Authentication System

## 概述

基于 Google OAuth 2.0 的认证系统，实现了 BFF（Backend for Frontend）架构模式。

## 架构设计

### 登录流程（双方案）

#### 方案 1：Code Model（主方案，推荐）
```
前端 → Google Identity Services → 获取 authorization code
前端 → POST /auth/google/code (code)
后端 → 交换 Google token → 验证 ID token → 创建/查找用户 → 下发 TripNARA 会话
```

**优点：**
- 符合 OAuth 2.0 Web Server 流程
- 安全性高（敏感交换在后端）
- 便于未来扩展（如增量授权 Google Calendar/Gmail/Drive）

#### 方案 2：ID Token（加速登录）
```
前端 → Google One Tap / Sign-In Button → 获取 ID token (JWT)
前端 → POST /auth/google/id-token (idToken)
后端 → 验证 ID token → 创建/查找用户 → 下发 TripNARA 会话
```

**优点：**
- 实现简单
- 适合 One Tap 快速登录
- 回访用户转化率高

### 会话管理

- **Access Token**: 15 分钟 JWT（前端内存存储）
- **Refresh Token**: 30 天，httpOnly cookie（服务端存储哈希）
- **Token 旋转**: 每次 refresh 都会旋转 refresh token，提升安全性

### 用户建模

```typescript
User {
  id: UUID (主键)
  googleSub: string? (Google 用户唯一 ID，优先用于账号识别)
  email: string? (邮箱，用于展示/联系)
  emailVerified: boolean?
  displayName: string?
  avatarUrl: string?
}

UserProfile {
  userId: UUID (关联 User.id)
  preferences: Json? (用户偏好)
}
```

### 账号合并策略

- 优先使用 `googleSub` 作为唯一标识
- 如果通过邮箱找到现有用户但 `googleSub` 不同，会绑定 `googleSub`（需验证邮箱一致且 verified）

## API 端点

### POST /auth/email/send-code
发送邮箱验证码用于注册。

**请求：**
```json
{
  "email": "user@example.com"
}
```

**响应：**
```json
{
  "message": "验证码已发送，请查收邮件"
}
```

### POST /auth/email/register
使用邮箱和验证码注册新用户。

**请求：**
```json
{
  "email": "user@example.com",
  "code": "123456",
  "displayName": "John Doe"  // 可选
}
```

**响应：**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "John Doe",
    "avatarUrl": null,
    "emailVerified": true
  },
  "accessToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

### POST /auth/google/code
交换 Google OAuth authorization code 获取会话。

**请求：**
```json
{
  "code": "4/0AX4XfWi..."
}
```

**响应：**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "User Name",
    "avatarUrl": "https://...",
    "emailVerified": true
  },
  "accessToken": "eyJhbGci..."
}
```

**Cookie：** `refresh_token` (httpOnly, Secure in production)

### POST /auth/google/id-token
验证 Google ID token 并创建会话（One Tap / Button 登录）。

**请求：**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjE2..."
}
```

**响应：** 同上

### POST /auth/refresh
刷新 access token（使用 refresh token cookie）。

**响应：**
```json
{
  "accessToken": "eyJhbGci..."
}
```

**Cookie：** 新的 `refresh_token`（token 旋转）

### POST /auth/logout
登出并撤销 refresh token。

**响应：**
```json
{
  "message": "Logged out successfully"
}
```

## 前端集成

### 1. 加载 Google Identity Services

在 `index.html` 中添加：

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

### 2. 初始化 GIS（方案 1：Code Model）

```javascript
const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID; // 使用环境变量

window.google.accounts.id.initialize({
  client_id: clientId, // ✅ 使用环境变量，不要硬编码
  callback: handleCredentialResponse,
});

// 获取 authorization code
window.google.accounts.oauth2.initCodeClient({
  client_id: clientId, // ✅ 使用环境变量，不要硬编码
  scope: 'openid email profile',
  ux_mode: 'popup', // 或 'redirect'
  callback: async (response) => {
    const { code } = response;
    
    // 发送到后端
    const result = await fetch('/auth/google/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      credentials: 'include', // 重要：包含 cookies
    });
    
    const { user, accessToken } = await result.json();
    // 存储 accessToken（内存或 sessionStorage）
    // 进入应用
  },
});

// 触发登录
document.getElementById('sign-in-button').onclick = () => {
  window.google.accounts.oauth2.requestCode();
};
```

### 3. One Tap / Button 登录（方案 2）

```javascript
const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID; // 使用环境变量

window.google.accounts.id.initialize({
  client_id: clientId, // ✅ 使用环境变量，不要硬编码
  callback: async (response) => {
    const { credential } = response; // 这是 ID token
    
    const result = await fetch('/auth/google/id-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: credential }),
      credentials: 'include',
    });
    
    const { user, accessToken } = await result.json();
    // 存储 accessToken，进入应用
  },
});

// One Tap（自动弹出）
window.google.accounts.id.prompt();

// 或使用按钮
window.google.accounts.id.renderButton(
  document.getElementById('buttonDiv'),
  { theme: 'outline', size: 'large' }
);
```

### 4. 使用 Access Token

```javascript
// 在 API 请求中添加 Bearer token
fetch('/api/users/profile', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
  credentials: 'include',
});
```

### 5. 刷新 Token

```javascript
// Access token 过期时，自动刷新
async function refreshAccessToken() {
  const response = await fetch('/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  
  const { accessToken } = await response.json();
  return accessToken;
}
```

## 后端保护路由

```typescript
import { Controller, Get } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';

@Controller('protected')
export class ProtectedController {
  @Get('data')
  async getData(@CurrentUser() user: CurrentUserPayload) {
    // user.userId, user.email 可用
    return { message: `Hello ${user.userId}` };
  }
}
```

**注意：** 默认所有路由都受保护。要公开路由，使用 `@Public()` 装饰器：

```typescript
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Get('public')
async getPublic() {
  return { message: 'This is public' };
}
```

## 环境变量

见 `.env.example`：

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/callback
JWT_SECRET=your-jwt-secret
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS=30
FRONTEND_URL=http://localhost:3001
NODE_ENV=development
```

## 安全清单

- ✅ HTTPS（生产环境必需）
- ✅ CORS 配置（只放行前端域名）
- ✅ Cookie：httpOnly + Secure（生产环境）+ SameSite=Lax
- ✅ JWT 签名验证
- ✅ Refresh token 哈希存储
- ✅ Token 旋转
- ✅ ID token 完整验证（签名、aud、iss、exp）

## Google Cloud Console 配置

1. **创建 OAuth 2.0 Client ID**
   - 应用类型：Web 应用
   - Authorized JavaScript origins: `http://localhost:3001`（开发）/ `https://yourdomain.com`（生产）
   - Authorized redirect URIs: `http://localhost:3001/auth/callback`（如果使用 redirect 流程）

2. **OAuth consent screen**
   - 用户类型：External（或 Internal 如果是 Google Workspace）
   - Scopes: `openid`, `email`, `profile`

## 数据库迁移

```bash
# 生成迁移
npx prisma migrate dev --name add_user_auth

# 或应用现有迁移
npx prisma migrate deploy
```

## 测试

```bash
# 启动服务
npm run dev

# 测试端点（使用 Swagger）
http://localhost:3000/api
```

## 后续扩展

- [x] Email OTP / Magic Link（作为 Google 不可用时的兜底）
- [ ] 增量授权（Google Calendar / Gmail / Drive 导入）
- [ ] 首次登录后的 onboarding 流程（旅行偏好、风险偏好等）
- [ ] CSRF 保护（如果使用 cookie 会话，POST /auth/refresh 需要 CSRF token）

