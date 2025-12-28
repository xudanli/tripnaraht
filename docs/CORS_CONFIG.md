# CORS 配置说明

## 概述

后端已配置 CORS 支持，允许指定前端域名访问 API，并支持 credentials（cookies）传递。

## 配置方式

### 方式 1: 单个前端域名（推荐）

在 `.env` 文件中配置：

```env
FRONTEND_URL=http://localhost:5173
```

或者生产环境：

```env
FRONTEND_URL=https://yourdomain.com
```

### 方式 2: 多个前端域名

如果需要支持多个前端域名（如开发、测试、生产环境），使用逗号分隔：

```env
FRONTEND_URLS=http://localhost:5173,https://dev.yourdomain.com,https://yourdomain.com
```

## 配置示例

### 开发环境

```env
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

### 生产环境

```env
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
```

或者多个域名：

```env
NODE_ENV=production
FRONTEND_URLS=https://www.yourdomain.com,https://yourdomain.com
```

## 默认行为

- **开发环境（NODE_ENV !== 'production'）**:
  - 如果未配置 `FRONTEND_URL`，允许所有来源（方便开发调试）
  - 如果已配置，只允许配置的域名
  - 额外允许所有 `localhost` 和 `127.0.0.1` 的请求

- **生产环境（NODE_ENV === 'production'）**:
  - **必须**配置 `FRONTEND_URL` 或 `FRONTEND_URLS`
  - 只允许配置的域名访问
  - 未配置时会拒绝所有请求

## CORS 设置详情

- ✅ **credentials**: `true` - 允许发送 cookies（必需，用于 refresh_token）
- ✅ **methods**: `GET, POST, PUT, DELETE, PATCH, OPTIONS`
- ✅ **allowedHeaders**: `Content-Type, Authorization, X-Requested-With`
- ✅ **exposedHeaders**: `Authorization`
- ✅ **maxAge**: `86400` (24小时预检缓存)

## 验证配置

启动服务后，查看控制台输出：

```
✅ CORS 配置: 允许的前端域名: http://localhost:5173
```

如果有 CORS 错误，会显示：

```
⚠️  CORS: 拒绝来自 http://example.com 的请求
   允许的域名: http://localhost:5173
```

## 前端配置

前端需要确保：

1. **请求包含 credentials**:
```javascript
fetch('http://47.253.148.159/auth/google/code', {
  credentials: 'include', // 重要！
  // ...
});
```

2. **Axios 配置**:
```javascript
const api = axios.create({
  baseURL: 'http://47.253.148.159',
  withCredentials: true, // 重要！
});
```

## 常见问题

### Q: 前端收到 CORS 错误怎么办？

1. 检查后端 `.env` 文件中的 `FRONTEND_URL` 配置
2. 确认前端域名完全匹配（包括协议、域名、端口）
3. 查看后端日志中的 CORS 警告信息
4. 确认前端请求包含 `credentials: 'include'`

### Q: 如何支持多个前端域名？

使用 `FRONTEND_URLS` 环境变量，逗号分隔：
```env
FRONTEND_URLS=http://localhost:5173,https://dev.example.com,https://example.com
```

### Q: 生产环境需要配置吗？

**必须配置**。生产环境未配置 `FRONTEND_URL` 时，会拒绝所有跨域请求。

### Q: 本地开发时如何配置？

开发环境可以不配置，系统会自动允许所有来源。但建议配置以避免生产环境问题：

```env
FRONTEND_URL=http://localhost:5173
```

## 安全建议

1. ✅ 生产环境必须配置 `FRONTEND_URL`
2. ✅ 只添加信任的前端域名
3. ✅ 使用 HTTPS（生产环境）
4. ✅ 定期检查允许的域名列表

