# TripNARA 认证接口文档 - 前端对接指南

## 📋 目录

1. [概述](#概述)
2. [接口列表](#接口列表)
3. [详细接口说明](#详细接口说明)
4. [前端集成示例](#前端集成示例)
5. [错误处理](#错误处理)
6. [常见问题](#常见问题)

---

## 概述

### 基础信息

- **Base URL**: `http://47.253.148.159` (生产环境)
- **认证方式**: JWT Bearer Token + Refresh Token Cookie
- **Content-Type**: `application/json`
- **Cookie**: 需要支持 `credentials: 'include'`

### 认证流程

```
1. 用户点击"使用 Google 登录"
2. 前端调用 Google Identity Services 获取 code 或 idToken
3. 前端调用后端接口进行认证
4. 后端返回 accessToken 和用户信息，并设置 refresh_token cookie
5. 前端存储 accessToken，后续请求携带 Authorization header
6. accessToken 过期时，使用 refresh_token cookie 刷新
```

---

## 接口列表

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| Google Code 登录 | POST | `/auth/google/code` | 主登录方案（推荐） |
| Google ID Token 登录 | POST | `/auth/google/id-token` | 快速登录方案（One Tap） |
| 刷新 Token | POST | `/auth/refresh` | 刷新 access token |
| 登出 | POST | `/auth/logout` | 登出并清除会话 |

---

## 详细接口说明

### 1. POST /auth/google/code

**说明**: 使用 Google OAuth authorization code 进行登录（主方案，推荐）

**请求头**:
```
Content-Type: application/json
```

**请求体**:
```json
{
  "code": "4/0AX4XfWi..."
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | Google OAuth authorization code |

**成功响应** (200 OK):
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "displayName": "张三",
    "avatarUrl": "https://lh3.googleusercontent.com/...",
    "emailVerified": true
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**响应字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| user.id | string (UUID) | 用户唯一标识 |
| user.email | string \| null | 用户邮箱 |
| user.displayName | string \| null | 显示名称 |
| user.avatarUrl | string \| null | 头像 URL |
| user.emailVerified | boolean \| null | 邮箱是否已验证 |
| accessToken | string | JWT access token（15分钟有效期） |

**Cookie 响应**:
- `refresh_token`: httpOnly cookie，30天有效期（自动设置，前端无需处理）

**错误响应**:
```json
// 400 Bad Request - 无效的 authorization code
{
  "statusCode": 400,
  "message": "Failed to exchange authorization code: ...",
  "error": "Bad Request"
}
```

**前端示例**:
```javascript
async function loginWithGoogleCode(code) {
  try {
    const response = await fetch('http://47.253.148.159/auth/google/code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // 重要：包含 cookies
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '登录失败');
    }

    const data = await response.json();
    
    // 存储 accessToken（建议使用内存或 sessionStorage）
    sessionStorage.setItem('accessToken', data.accessToken);
    
    // 保存用户信息
    localStorage.setItem('user', JSON.stringify(data.user));
    
    return data;
  } catch (error) {
    console.error('登录失败:', error);
    throw error;
  }
}
```

---

### 2. POST /auth/google/id-token

**说明**: 使用 Google ID Token 进行登录（One Tap / Button 快速登录）

**请求头**:
```
Content-Type: application/json
```

**请求体**:
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjE2..."
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| idToken | string | 是 | Google ID Token (JWT) |

**成功响应** (200 OK):
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "displayName": "张三",
    "avatarUrl": "https://lh3.googleusercontent.com/...",
    "emailVerified": true
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**响应格式**: 与 `/auth/google/code` 完全相同

**错误响应**:
```json
// 400 Bad Request - 无效的 ID token
{
  "statusCode": 400,
  "message": "Failed to verify ID token: ...",
  "error": "Bad Request"
}
```

**前端示例**:
```javascript
async function loginWithGoogleIdToken(idToken) {
  try {
    const response = await fetch('http://47.253.148.159/auth/google/id-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '登录失败');
    }

    const data = await response.json();
    sessionStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    return data;
  } catch (error) {
    console.error('登录失败:', error);
    throw error;
  }
}
```

---

### 3. POST /auth/refresh

**说明**: 刷新 access token（当 access token 过期时调用）

**请求头**:
```
Cookie: refresh_token=...
```

**请求体**: 无

**成功响应** (200 OK):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**响应字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| accessToken | string | 新的 JWT access token（15分钟有效期） |

**Cookie 响应**:
- 新的 `refresh_token` cookie（自动更新，前端无需处理）

**错误响应**:
```json
// 401 Unauthorized - 无效或过期的 refresh token
{
  "statusCode": 401,
  "message": "Invalid or expired refresh token",
  "error": "Unauthorized"
}
```

**前端示例**:
```javascript
async function refreshAccessToken() {
  try {
    const response = await fetch('http://47.253.148.159/auth/refresh', {
      method: 'POST',
      credentials: 'include', // 重要：包含 refresh_token cookie
    });

    if (!response.ok) {
      // refresh token 也过期了，需要重新登录
      sessionStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      throw new Error('会话已过期，请重新登录');
    }

    const data = await response.json();
    sessionStorage.setItem('accessToken', data.accessToken);
    
    return data.accessToken;
  } catch (error) {
    console.error('刷新 token 失败:', error);
    throw error;
  }
}
```

---

### 4. POST /auth/logout

**说明**: 登出并清除会话

**请求头**:
```
Cookie: refresh_token=...
```

**请求体**: 无

**成功响应** (200 OK):
```json
{
  "message": "Logged out successfully"
}
```

**Cookie 响应**:
- 清除 `refresh_token` cookie（自动清除，前端无需处理）

**前端示例**:
```javascript
async function logout() {
  try {
    await fetch('http://47.253.148.159/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });

    // 清除前端存储
    sessionStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    
    // 跳转到登录页
    window.location.href = '/login';
  } catch (error) {
    console.error('登出失败:', error);
    // 即使失败也清除前端存储
    sessionStorage.removeItem('accessToken');
    localStorage.removeItem('user');
  }
}
```

---

## 前端集成示例

### 完整的认证工具类

```javascript
// auth.js - 认证工具类

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://47.253.148.159';

class AuthService {
  // 获取 access token
  getAccessToken() {
    return sessionStorage.getItem('accessToken');
  }

  // 获取用户信息
  getUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  // 检查是否已登录
  isAuthenticated() {
    return !!this.getAccessToken();
  }

  // Google Code 登录
  async loginWithCode(code) {
    const response = await fetch(`${API_BASE_URL}/auth/google/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '登录失败');
    }

    const data = await response.json();
    this.setSession(data);
    return data;
  }

  // Google ID Token 登录
  async loginWithIdToken(idToken) {
    const response = await fetch(`${API_BASE_URL}/auth/google/id-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '登录失败');
    }

    const data = await response.json();
    this.setSession(data);
    return data;
  }

  // 刷新 token
  async refreshToken() {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      this.clearSession();
      throw new Error('会话已过期，请重新登录');
    }

    const data = await response.json();
    sessionStorage.setItem('accessToken', data.accessToken);
    return data.accessToken;
  }

  // 登出
  async logout() {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('登出请求失败:', error);
    } finally {
      this.clearSession();
    }
  }

  // 设置会话
  setSession(data) {
    sessionStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
  }

  // 清除会话
  clearSession() {
    sessionStorage.removeItem('accessToken');
    localStorage.removeItem('user');
  }

  // 带认证的请求
  async authenticatedFetch(url, options = {}) {
    let token = this.getAccessToken();

    // 如果没有 token，尝试刷新
    if (!token) {
      try {
        token = await this.refreshToken();
      } catch (error) {
        // 刷新失败，跳转到登录页
        window.location.href = '/login';
        throw error;
      }
    }

    // 发起请求
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': options.headers?.['Content-Type'] || 'application/json',
      },
      credentials: 'include',
    });

    // 如果 token 过期，尝试刷新后重试
    if (response.status === 401) {
      try {
        const newToken = await this.refreshToken();
        return fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${newToken}`,
            'Content-Type': options.headers?.['Content-Type'] || 'application/json',
          },
          credentials: 'include',
        });
      } catch (error) {
        window.location.href = '/login';
        throw error;
      }
    }

    return response;
  }
}

export default new AuthService();
```

### Google Identity Services 集成

#### 方案 1: Code Model（推荐）

```html
<!-- index.html -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

```javascript
// Google Code 登录
function initGoogleCodeLogin() {
  const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

  // 初始化 Code Client
  window.google.accounts.oauth2.initCodeClient({
    client_id: clientId,
    scope: 'openid email profile',
    ux_mode: 'popup', // 或 'redirect'
    callback: async (response) => {
      try {
        const { code } = response;
        await authService.loginWithCode(code);
        
        // 登录成功，跳转到主页
        window.location.href = '/';
      } catch (error) {
        console.error('登录失败:', error);
        alert('登录失败，请重试');
      }
    },
  });
}

// 触发登录
function handleGoogleLogin() {
  window.google.accounts.oauth2.requestCode();
}
```

#### 方案 2: One Tap / Button

```javascript
// Google One Tap 登录
function initGoogleOneTap() {
  const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: async (response) => {
      try {
        const { credential } = response; // ID token
        await authService.loginWithIdToken(credential);
        
        // 登录成功
        window.location.href = '/';
      } catch (error) {
        console.error('登录失败:', error);
      }
    },
  });

  // 自动显示 One Tap
  window.google.accounts.id.prompt();
}

// 或使用按钮
function renderGoogleButton() {
  window.google.accounts.id.renderButton(
    document.getElementById('google-signin-button'),
    {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      width: 300,
    }
  );
}
```

### React 示例

```jsx
// LoginPage.jsx
import { useEffect } from 'react';
import authService from './services/auth';

function LoginPage() {
  useEffect(() => {
    // 初始化 Google One Tap
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    
    window.google?.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
    });

    // 显示 One Tap
    window.google?.accounts.id.prompt();
  }, []);

  const handleCredentialResponse = async (response) => {
    try {
      await authService.loginWithIdToken(response.credential);
      window.location.href = '/';
    } catch (error) {
      alert('登录失败: ' + error.message);
    }
  };

  const handleGoogleLogin = () => {
    // Code Model 登录
    window.google?.accounts.oauth2.requestCode();
  };

  return (
    <div>
      <h1>登录 TripNARA</h1>
      
      {/* One Tap 按钮容器 */}
      <div id="google-signin-button"></div>
      
      {/* 或使用 Code Model */}
      <button onClick={handleGoogleLogin}>
        使用 Google 登录
      </button>
    </div>
  );
}
```

### Axios 拦截器示例

```javascript
// axios.js
import axios from 'axios';
import authService from './auth';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://47.253.148.159',
  withCredentials: true, // 重要：包含 cookies
});

// 请求拦截器：添加 access token
api.interceptors.request.use(
  (config) => {
    const token = authService.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器：处理 token 过期
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // 如果是 401 且未重试过
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // 尝试刷新 token
        const newToken = await authService.refreshToken();
        
        // 使用新 token 重试请求
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // 刷新失败，清除会话并跳转登录
        authService.clearSession();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

---

## 错误处理

### 常见错误码

| 状态码 | 说明 | 处理方式 |
|--------|------|----------|
| 400 | 请求参数错误 | 检查请求体格式和参数 |
| 401 | 未授权或 token 过期 | 尝试刷新 token，失败则跳转登录 |
| 500 | 服务器错误 | 显示错误信息，建议重试 |

### 错误处理示例

```javascript
async function handleApiError(error) {
  if (error.response) {
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        return `请求错误: ${data.message || '参数不正确'}`;
      case 401:
        // Token 过期，尝试刷新
        try {
          await authService.refreshToken();
          // 刷新成功，可以重试原请求
          return null; // 表示可以重试
        } catch {
          // 刷新失败，需要重新登录
          authService.clearSession();
          window.location.href = '/login';
          return '会话已过期，请重新登录';
        }
      case 500:
        return '服务器错误，请稍后重试';
      default:
        return `请求失败: ${data.message || '未知错误'}`;
    }
  } else if (error.request) {
    return '网络错误，请检查网络连接';
  } else {
    return `请求错误: ${error.message}`;
  }
}
```

---

## 常见问题

### Q1: refresh_token cookie 没有设置？

**A**: 确保：
1. 请求时设置了 `credentials: 'include'`
2. 前端和后端在同一域名下（或配置了正确的 CORS）
3. 生产环境使用 HTTPS

### Q2: access token 过期后如何处理？

**A**: 使用响应拦截器自动刷新：
```javascript
// 见上面的 Axios 拦截器示例
// 或使用 fetch 包装函数自动处理
```

### Q3: 如何判断用户是否已登录？

**A**: 
```javascript
const isLoggedIn = authService.isAuthenticated();
// 或检查 accessToken 是否存在
```

### Q4: 首次登录后需要做什么？

**A**: 
1. 保存 accessToken 和用户信息
2. 可以显示 onboarding 流程（旅行偏好设置等）
3. 跳转到主页

### Q5: 如何实现"记住我"功能？

**A**: 
- accessToken 存储在 sessionStorage（关闭浏览器后清除）
- refresh_token 存储在 httpOnly cookie（30天有效期）
- 用户关闭浏览器后，refresh_token 仍然有效，下次访问时自动刷新 accessToken

---

## 环境变量配置

前端需要配置以下环境变量：

```env
REACT_APP_API_URL=http://47.253.148.159
REACT_APP_GOOGLE_CLIENT_ID=your-google-client-id
```

---

## 测试清单

- [ ] Google Code 登录流程
- [ ] Google ID Token 登录流程
- [ ] Token 自动刷新
- [ ] 登出功能
- [ ] 401 错误自动处理
- [ ] Cookie 正确传递
- [ ] 跨域请求配置

---

## 技术支持

如有问题，请查看：
- 完整文档：`src/auth/README.md`
- Swagger 文档：`http://47.253.148.159/api`（启动服务后）

