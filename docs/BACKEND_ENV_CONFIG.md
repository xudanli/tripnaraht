# 后端环境变量配置说明

## 重要概念区分

需要区分两个不同的概念：

1. **前端域名**（Frontend Domain）：用户访问前端应用的域名
   - 例如：`https://tripnara.com`
   - 用于：CORS 配置、Google OAuth redirect_uri 验证

2. **后端 API 地址**（Backend API URL）：前端调用后端 API 的地址
   - 例如：`http://47.253.148.159`
   - 用于：前端配置 `REACT_APP_API_URL`

## 后端环境变量配置

### 生产环境 `.env`

```env
# Google OAuth 配置
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5173  # Popup 模式使用前端域名

# JWT 配置
JWT_SECRET=your-jwt-secret
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS=30

# CORS 配置（前端域名，不是 API 地址）
# 如果前端部署在 https://tripnara.com
FRONTEND_URL=https://tripnara.com

# 或者多个前端域名
FRONTEND_URLS=https://tripnara.com,https://www.tripnara.com

# 环境
NODE_ENV=production
PORT=3000
```

## 配置说明

### 1. CORS 配置 (`FRONTEND_URL` / `FRONTEND_URLS`)

这是**前端访问的域名**，用于 CORS 验证。

**配置示例**：
```env
# 如果前端部署在 https://tripnara.com
FRONTEND_URL=https://tripnara.com

# 或者支持多个域名
FRONTEND_URLS=https://tripnara.com,https://www.tripnara.com
```

⚠️ **注意**：
- 这是前端访问的域名（用户浏览器访问的地址）
- 不是后端 API 的地址
- 如果前端使用 HTTPS，这里也应该使用 HTTPS

### 2. Google OAuth redirect_uri 验证

在 `src/auth/auth.controller.ts` 中，`allowedOrigins` 用于验证 Google OAuth 的 redirect_uri。

```typescript
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:3001',
  'https://tripnara.com',        // 前端域名
  'https://www.tripnara.com',    // 前端域名（如果使用）
  // ...
]);
```

这也是前端域名，因为 Popup 模式下，redirect_uri 是前端页面的 origin。

### 3. Swagger 配置

在 `src/main.ts` 中，Swagger 服务器地址是后端 API 地址：

```typescript
.addServer('http://47.253.148.159', '生产环境')
```

这个已经配置正确，无需修改。

## 总结

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `FRONTEND_URL` | `https://tripnara.com` | 前端访问的域名（CORS） |
| `REACT_APP_API_URL` (前端) | `http://47.253.148.159` | 后端 API 地址 |
| Swagger `.addServer()` | `http://47.253.148.159` | 后端 API 地址（已配置） |

## 检查清单

- [ ] `FRONTEND_URL` 配置为前端域名（`https://tripnara.com`）
- [ ] `REACT_APP_API_URL`（前端）配置为后端 IP（`http://47.253.148.159`）
- [ ] `auth.controller.ts` 中的 `allowedOrigins` 包含前端域名
- [ ] Swagger 配置使用后端 IP 地址（已配置）

