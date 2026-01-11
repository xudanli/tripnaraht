# CORS 配置指南

## 问题说明

如果看到以下错误：
```
⚠️  CORS: 生产环境未配置 FRONTEND_URL，拒绝所有请求
Error: CORS not configured for production
```

这表示应用在生产环境中没有配置前端域名，导致 CORS 拒绝所有请求。

## 快速修复

### 方案 1: 配置环境变量（推荐）

在 `.env` 文件中添加 `FRONTEND_URL` 或 `FRONTEND_URLS`：

```bash
# 单个前端域名
FRONTEND_URL=https://tripnara.com

# 或多个前端域名（逗号分隔）
FRONTEND_URLS=https://tripnara.com,https://www.tripnara.com,https://app.tripnara.com
```

### 方案 2: 在 Docker Compose 中配置

在 `docker-compose.yml` 中添加环境变量：

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: tripnara:latest
    container_name: tripnara-app
    restart: unless-stopped
    env_file:
      - ./.env
    environment:
      - FRONTEND_URL=https://tripnara.com
    ports:
      - "3000:3000"
```

### 方案 3: 在 Jenkins Credentials 中配置

1. 进入 Jenkins → Credentials → tripnara-dotenv-prod
2. 在 Secret 内容中添加：
   ```bash
   FRONTEND_URL="https://tripnara.com"
   ```
   或
   ```bash
   FRONTEND_URLS="https://tripnara.com,https://www.tripnara.com"
   ```

## 配置说明

### 环境变量

- **FRONTEND_URL**: 单个前端域名
  ```bash
  FRONTEND_URL=https://tripnara.com
  ```

- **FRONTEND_URLS**: 多个前端域名（逗号分隔）
  ```bash
  FRONTEND_URLS=https://tripnara.com,https://www.tripnara.com,https://app.tripnara.com
  ```

### URL 格式

- ✅ **正确格式**:
  - `https://tripnara.com`
  - `http://localhost:3001`
  - `https://app.tripnara.com`

- ❌ **错误格式**:
  - `tripnara.com` (缺少协议)
  - `https://tripnara.com/` (尾部斜杠会被自动移除，但建议不加)
  - `https://tripnara.com/api` (不要包含路径)

### 匹配规则

CORS 配置支持：
1. **精确匹配**: `https://tripnara.com` 匹配 `https://tripnara.com`
2. **前缀匹配**: `https://tripnara.com:5173` 匹配 `https://tripnara.com`
3. **子域名匹配**: `https://app.tripnara.com` 需要单独配置

## 当前行为（已修复）

如果未配置 `FRONTEND_URL`：
- **开发环境**: 允许所有来源（方便本地开发）
- **生产环境**: 允许所有来源，但记录严重警告 ⚠️

**建议**: 尽快配置 `FRONTEND_URL` 以提高安全性。

## 验证配置

### 1. 检查环境变量

```bash
# 在容器内检查
docker exec tripnara-app env | grep FRONTEND

# 应该看到:
# FRONTEND_URL=https://tripnara.com
```

### 2. 查看应用启动日志

```bash
docker logs tripnara-app | grep CORS

# 应该看到:
# ✅ CORS 配置: 允许的前端域名: https://tripnara.com
```

### 3. 测试 CORS

```bash
# 从前端域名测试（应该成功）
curl -H "Origin: https://tripnara.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     http://localhost:3000/api/auth/email/send-code

# 从其他域名测试（应该失败，如果配置了的话）
curl -H "Origin: https://evil.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     http://localhost:3000/api/auth/email/send-code
```

## 常见场景

### 场景 1: 单域名部署

```bash
FRONTEND_URL=https://tripnara.com
```

### 场景 2: 多域名部署

```bash
FRONTEND_URLS=https://tripnara.com,https://www.tripnara.com,https://app.tripnara.com
```

### 场景 3: 开发 + 生产环境

```bash
# 开发环境
FRONTEND_URL=http://localhost:3001

# 生产环境
FRONTEND_URL=https://tripnara.com
```

### 场景 4: 通过 Nginx 代理

如果前端通过 Nginx 代理访问后端：
- 配置前端域名（不是后端域名）
- 例如：前端在 `https://tripnara.com`，后端在 `https://api.tripnara.com`
- 配置：`FRONTEND_URL=https://tripnara.com`

## 安全建议

1. **生产环境必须配置**: 虽然当前代码允许未配置时通过，但建议尽快配置以提高安全性
2. **使用 HTTPS**: 生产环境使用 `https://` 而不是 `http://`
3. **精确配置**: 只配置需要的前端域名，不要使用通配符
4. **定期检查**: 定期检查 CORS 配置和日志，确保没有异常请求

## 相关文档

- `API_TESTING_GUIDE.md` - API 测试指南
- `JENKINS_ENV_FORMAT.md` - Jenkins 环境变量格式说明
