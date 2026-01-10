# Nginx HTTPS 反向代理配置指南

## 问题

前端 `https://tripnara.com` 无法访问后端 `http://47.253.148.159:3000`，因为浏览器阻止混合内容（HTTPS 页面访问 HTTP API）。

## 解决方案：使用 Nginx 提供 HTTPS

### 步骤 1: 安装 Nginx

```bash
sudo apt-get update
sudo apt-get install nginx
```

### 步骤 2: 获取 SSL 证书（Let's Encrypt）

```bash
# 安装 certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书（确保 DNS 已配置 api.tripnara.com 指向 47.253.148.159）
sudo certbot --nginx -d api.tripnara.com

# 或手动获取（不使用 nginx 插件）
sudo certbot certonly --standalone -d api.tripnara.com
```

### 步骤 3: 创建 Nginx 配置文件

```bash
sudo nano /etc/nginx/sites-available/tripnara-api
```

配置文件内容：

```nginx
# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name api.tripnara.com;

    # 重定向所有 HTTP 请求到 HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS 服务器
server {
    listen 443 ssl http2;
    server_name api.tripnara.com;

    # SSL 证书路径（Let's Encrypt）
    ssl_certificate /etc/letsencrypt/live/api.tripnara.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.tripnara.com/privkey.pem;

    # SSL 配置（推荐的安全配置）
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 安全头
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # 日志
    access_log /var/log/nginx/tripnara-api-access.log;
    error_log /var/log/nginx/tripnara-api-error.log;

    # 代理到后端应用（本地 HTTP）
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        
        # WebSocket 支持（如果需要）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # 标准代理头
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # 禁用缓存（API 响应）
        proxy_cache_bypass $http_upgrade;
        
        # CORS 头（如果需要，通常后端已处理）
        # add_header Access-Control-Allow-Origin https://tripnara.com always;
        # add_header Access-Control-Allow-Credentials true always;
    }

    # 健康检查端点（可选）
    location /health {
        proxy_pass http://127.0.0.1:3000/api/system/status;
        access_log off;
    }
}
```

### 步骤 4: 启用配置

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/tripnara-api /etc/nginx/sites-enabled/

# 删除默认配置（可选）
sudo rm /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx

# 检查状态
sudo systemctl status nginx
```

### 步骤 5: 配置防火墙

```bash
# 确保防火墙开放 80 和 443 端口
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

### 步骤 6: 验证配置

```bash
# 测试 HTTP 重定向
curl -I http://api.tripnara.com

# 应该返回 301 重定向到 HTTPS

# 测试 HTTPS 连接
curl https://api.tripnara.com/api/system/status

# 应该返回 API 响应
```

### 步骤 7: 更新前端配置

前端需要配置 API 地址为 `https://api.tripnara.com`：

```bash
# .env.production
VITE_API_BASE_URL=https://api.tripnara.com
```

或使用同一个域名的子路径：

```bash
VITE_API_BASE_URL=https://tripnara.com/api
```

（如果前端和后端在同一个域名下）

---

## 替代方案：使用同一域名

如果不想使用子域名，可以配置：

### 前端: `https://tripnara.com`
### 后端: `https://tripnara.com/api`

Nginx 配置：

```nginx
server {
    listen 443 ssl http2;
    server_name tripnara.com www.tripnara.com;

    ssl_certificate /etc/letsencrypt/live/tripnara.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tripnara.com/privkey.pem;

    # 前端静态文件
    location / {
        root /var/www/tripnara-frontend;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 自动续期 SSL 证书

Let's Encrypt 证书每 90 天需要续期，certbot 通常会自动配置：

```bash
# 测试自动续期
sudo certbot renew --dry-run

# 查看续期任务
systemctl list-timers | grep certbot
```

---

## 故障排查

### 问题 1: Nginx 配置测试失败

```bash
# 检查语法
sudo nginx -t

# 查看错误日志
sudo tail -f /var/log/nginx/error.log
```

### 问题 2: 502 Bad Gateway

- 检查后端是否运行: `curl http://127.0.0.1:3000/api/system/status`
- 检查防火墙是否阻止: `sudo ufw status`
- 检查后端日志

### 问题 3: SSL 证书错误

- 确保 DNS 记录正确指向服务器 IP
- 确保防火墙开放 80 端口（certbot 验证需要）
- 检查证书路径是否正确

---

## 相关文档

- [Nginx 官方文档](https://nginx.org/en/docs/)
- [Let's Encrypt 文档](https://letsencrypt.org/docs/)
- [Certbot 文档](https://certbot.eff.org/)
