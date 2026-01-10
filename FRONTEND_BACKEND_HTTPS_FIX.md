# 前端无法访问后端 - HTTPS/HTTP 混合内容问题

## 问题分析

### 错误现象

从浏览器控制台可以看到：
1. **Mixed Content 错误**: 
   ```
   Mixed Content: The page at 'https://tripnara.com/login' was loaded over HTTPS, 
   but requested an insecure XMLHttpRequest endpoint 'http://47.253.148.159/auth/email/send-code'. 
   This request has been blocked.
   ```

2. **网络连接错误**:
   ```
   [API Client] 网络连接错误: 无法连接到后端服务, 请确认后端服务是否运行
   ```

### 根本原因

- ✅ 前端使用 HTTPS: `https://tripnara.com`
- ❌ 后端使用 HTTP: `http://47.253.148.159`
- 🚫 现代浏览器阻止 HTTPS 页面访问 HTTP API（混合内容安全策略）

## 解决方案

### 方案 1: 配置后端 HTTPS（推荐）

#### 步骤 1: 获取 SSL 证书

可以使用 Let's Encrypt 免费证书：

```bash
# 在服务器上安装 certbot
sudo apt-get update
sudo apt-get install certbot

# 获取证书（需要域名指向服务器 IP）
sudo certbot certonly --standalone -d api.tripnara.com
```

或使用已有的 SSL 证书。

#### 步骤 2: 修改后端代码支持 HTTPS

修改 `src/main.ts`:

```typescript
import * as fs from 'fs';
import * as https from 'https';

async function bootstrap() {
  // ... 现有代码 ...

  const port = Number(process.env.PORT ?? 3000);
  
  // 检查是否配置了 SSL 证书
  const sslKeyPath = process.env.SSL_KEY_PATH;
  const sslCertPath = process.env.SSL_CERT_PATH;
  
  if (sslKeyPath && sslCertPath && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
    // 使用 HTTPS
    const httpsOptions = {
      key: fs.readFileSync(sslKeyPath),
      cert: fs.readFileSync(sslCertPath),
    };
    
    const httpsServer = https.createServer(httpsOptions, app);
    await httpsServer.listen(port, '0.0.0.0');
    console.log(`✅ [Bootstrap] HTTPS API listening on https://0.0.0.0:${port}`);
  } else {
    // 使用 HTTP（开发环境）
    await app.listen(port, '0.0.0.0');
    console.log(`✅ [Bootstrap] HTTP API listening on http://0.0.0.0:${port}`);
  }
}
```

#### 步骤 3: 配置环境变量

在服务器上的 `.env` 文件或环境变量中添加：

```bash
SSL_KEY_PATH=/etc/letsencrypt/live/api.tripnara.com/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/api.tripnara.com/fullchain.pem
PORT=443  # HTTPS 默认端口
```

---

### 方案 2: 使用 Nginx 反向代理（更推荐）

这是更常见的生产环境配置方式：

#### 步骤 1: 安装和配置 Nginx

```bash
# 安装 Nginx
sudo apt-get install nginx

# 创建 Nginx 配置
sudo nano /etc/nginx/sites-available/tripnara-api
```

#### 步骤 2: Nginx 配置文件

```nginx
server {
    listen 80;
    server_name api.tripnara.com;
    
    # 重定向 HTTP 到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.tripnara.com;
    
    # SSL 证书路径
    ssl_certificate /etc/letsencrypt/live/api.tripnara.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.tripnara.com/privkey.pem;
    
    # SSL 配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # 代理到后端应用（运行在 HTTP）
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # CORS 头部（如果需要）
        add_header Access-Control-Allow-Origin https://tripnara.com;
        add_header Access-Control-Allow-Credentials true;
    }
}
```

#### 步骤 3: 启用配置

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/tripnara-api /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

#### 步骤 4: 更新前端 API 配置

前端需要配置后端 API 为 `https://api.tripnara.com`（或你选择的域名）。

---

### 方案 3: 修改前端配置（临时方案）

如果暂时无法配置 HTTPS，可以：

1. **开发环境**: 使用 HTTP 访问前端（不推荐生产环境）
2. **配置代理**: 在开发服务器配置代理，避免混合内容问题

#### Vite 配置示例

```javascript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://47.253.148.159:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
```

---

## 推荐的完整配置

### 后端（保持 HTTP，内部监听）

```typescript
// src/main.ts
const port = Number(process.env.PORT ?? 3000);
await app.listen(port, '127.0.0.1'); // 只监听本地，通过 Nginx 暴露
```

### Nginx（提供 HTTPS）

```
https://api.tripnara.com → Nginx (HTTPS) → http://127.0.0.1:3000 (HTTP)
```

### 前端配置

```bash
# .env.production
VITE_API_BASE_URL=https://api.tripnara.com
```

或

```bash
VITE_API_BASE_URL=https://tripnara.com/api
```

---

## 验证步骤

1. **检查后端是否运行**:
   ```bash
   curl http://47.253.148.159:3000/api/system/status
   ```

2. **检查 HTTPS 端点**:
   ```bash
   curl https://api.tripnara.com/api/system/status
   ```

3. **检查 SSL 证书**:
   ```bash
   openssl s_client -connect api.tripnara.com:443 -showcerts
   ```

---

## 注意事项

1. **域名配置**: 确保 `api.tripnara.com` 的 DNS A 记录指向服务器 IP `47.253.148.159`
2. **防火墙**: 确保防火墙开放 443 端口（HTTPS）
3. **证书更新**: Let's Encrypt 证书每 90 天需要更新，设置自动续期
4. **CORS 配置**: 确保后端 CORS 配置允许 `https://tripnara.com`

---

## 快速修复（如果使用 Nginx）

如果已经配置了 Nginx，只需：

1. **获取 SSL 证书**:
   ```bash
   sudo certbot --nginx -d api.tripnara.com
   ```

2. **更新前端配置**: 
   ```bash
   VITE_API_BASE_URL=https://api.tripnara.com
   ```

3. **验证连接**:
   访问 `https://api.tripnara.com/api/system/status` 应该返回状态信息
