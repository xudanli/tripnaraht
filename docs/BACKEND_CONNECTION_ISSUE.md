# 后端连接问题排查指南

## 错误信息

```
POST http://47.253.148.159/auth/google/code net::ERR_CONNECTION_CLOSED
无法连接到服务器。请确保后端服务正在运行。
```

## 问题分析

这个错误表示前端无法连接到后端 API 服务器。可能的原因：

1. **后端服务未运行**
2. **API 地址配置错误**
3. **防火墙/网络问题**
4. **端口未开放**

## 排查步骤

### 1. 检查后端服务是否运行

```bash
# 检查进程
ps aux | grep -E "nest|node.*dist/src/main"

# 检查端口
netstat -tlnp | grep :3000
# 或
ss -tlnp | grep :3000

# 检查服务是否响应
curl http://localhost:3000/api
# 生产环境
curl http://47.253.148.159/api
```

### 2. 检查 API 地址配置

前端需要配置正确的 API 地址：

**开发环境** (`.env.development` 或 `.env.local`):
```env
REACT_APP_API_URL=http://localhost:3000
```

**生产环境** (`.env.production`):
```env
REACT_APP_API_URL=http://47.253.148.159
```

⚠️ **注意**：
- 开发环境使用 `http://localhost:3000`
- 生产环境使用 IP 地址 `http://47.253.148.159`（使用 HTTP，不是 HTTPS）
- 使用 IP 地址时，确保后端服务正在运行并监听端口 3000（或配置的端口）

### 3. 验证后端连接

```bash
# 测试后端 API 连接
curl -v http://47.253.148.159/api
# 或使用 wget
wget --spider http://47.253.148.159/api

# 检查端口是否开放
telnet 47.253.148.159 3000
# 或
nc -zv 47.253.148.159 3000
```

### 4. 检查后端 CORS 配置

确保后端 `src/main.ts` 中的 CORS 配置允许前端域名：

```typescript
// src/main.ts
app.enableCors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://tripnara.com',
      'https://www.tripnara.com',
      'http://localhost:5173', // 开发环境
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
});
```

### 5. 检查后端日志

查看后端服务的日志输出，确认：
- 服务是否成功启动
- 是否有错误信息
- 是否有请求到达后端

```bash
# 如果使用 PM2
pm2 logs

# 如果使用 systemd
journalctl -u your-service-name -f

# 如果是直接运行
# 查看终端输出或日志文件
```

## 解决方案

### 方案 1: 启动后端服务

如果后端服务未运行：

```bash
# 开发环境
npm run dev

# 生产环境（需要构建）
npm run build
npm run start:prod

# 或使用 PM2
pm2 start dist/src/main.js --name tripnara-api
```

### 方案 2: 配置正确的 API 地址（使用 IP 地址）

**前端配置**：

1. 使用 IP 地址配置 API 地址
   ```env
   # .env.production
   REACT_APP_API_URL=http://47.253.148.159
   ```
   ⚠️ **注意**：使用 HTTP（不是 HTTPS），因为 IP 地址通常不配置 SSL 证书

2. 重新构建前端
   ```bash
   npm run build
   ```

3. 验证后端服务可访问
   ```bash
   # 测试后端 API 是否可以访问
   curl http://47.253.148.159/api
   ```

### 方案 3: 配置反向代理（可选，如果使用域名）

如果需要使用域名而不是 IP 地址，可以配置 Nginx 反向代理：

```nginx
# /etc/nginx/sites-available/tripnara.com
server {
    listen 443 ssl;
    server_name tripnara.com www.tripnara.com;

    # SSL 配置
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # 前端静态文件
    location / {
        root /var/www/tripnara/frontend;
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Auth 接口
    location /auth {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
    }
}
```

然后前端 API 地址配置为：
```env
REACT_APP_API_URL=https://tripnara.com
```

## 快速检查清单

- [ ] 后端服务正在运行（检查进程和端口）
- [ ] API 地址配置正确（环境变量）：`http://47.253.148.159`
- [ ] 可以访问 API 端点（curl 测试）
- [ ] CORS 配置正确（允许前端域名）
- [ ] 防火墙规则允许连接（端口 3000）
- [ ] 后端日志没有错误

## 调试技巧

### 前端调试

在浏览器控制台检查：

```javascript
// 检查 API 地址
console.log('API URL:', process.env.REACT_APP_API_URL);

// 测试连接
fetch('http://47.253.148.159/api')
  .then(res => console.log('✅ 连接成功', res))
  .catch(err => console.error('❌ 连接失败', err));
```

### 后端调试

检查后端启动日志：

```typescript
// src/main.ts
const port = process.env.PORT || 3000;
await app.listen(port);
console.log(`🚀 Application is running on: http://localhost:${port}`);
console.log(`📚 Swagger 文档: http://localhost:${port}/api`);
```

## 常见问题

### Q: 为什么开发环境可以，生产环境不行？

A: 检查：
1. 生产环境的 API 地址是否正确：`http://47.253.148.159`
2. 后端服务是否在生产服务器上运行
3. 防火墙是否阻止了连接

### Q: 出现 ERR_CONNECTION_CLOSED 是什么意思？

A: 通常表示：
- 连接被服务器关闭
- 服务器未运行
- 网络问题
- 端口未开放

### Q: 应该使用 IP 地址还是域名？

A: 当前配置使用 IP 地址：
- 生产环境：使用 `http://47.253.148.159`（HTTP，不是 HTTPS）
- 使用 IP 地址的优缺点：
  - ✅ 优点：简单直接，不需要配置 DNS 和 SSL 证书
  - ⚠️ 缺点：IP 地址可能变化，不够灵活；浏览器可能对混合内容有安全限制（如果前端是 HTTPS）
