# Certbot 端口 80 占用问题解决方案

## 问题

运行 `certbot certonly --standalone` 时出现错误：
```
Could not bind TCP port 80 because it is already in use by another process
```

## 原因

端口 80 已被 Nginx 或其他 Web 服务器占用。`--standalone` 模式需要临时占用端口 80 进行验证。

## 解决方案

### 方案 1: 使用 Nginx 插件（推荐）

如果已经安装了 Nginx，使用 `--nginx` 插件，certbot 会自动配置：

```bash
# 安装 certbot nginx 插件（如果还没有）
sudo apt-get install python3-certbot-nginx

# 使用 nginx 插件获取证书（会自动配置 Nginx）
sudo certbot --nginx -d api.tripnara.com
```

**优点**:
- 不需要停止 Nginx
- 自动配置 SSL
- 自动配置 HTTP 到 HTTPS 重定向

### 方案 2: 临时停止 Nginx

如果必须使用 `--standalone` 模式：

```bash
# 1. 停止 Nginx
sudo systemctl stop nginx

# 2. 获取证书
sudo certbot certonly --standalone -d api.tripnara.com

# 3. 启动 Nginx
sudo systemctl start nginx
```

### 方案 3: 使用 DNS 验证（不需要端口）

如果无法使用 HTTP 验证，可以使用 DNS 验证：

```bash
sudo certbot certonly --manual --preferred-challenges dns -d api.tripnara.com
```

certbot 会提示你在 DNS 中添加 TXT 记录进行验证。

---

## 推荐步骤（使用 Nginx 插件）

### 步骤 1: 安装 Nginx 插件

```bash
sudo apt-get install python3-certbot-nginx
```

### 步骤 2: 确保 Nginx 已安装并运行

```bash
# 检查 Nginx 状态
sudo systemctl status nginx

# 如果未安装，安装 Nginx
sudo apt-get install nginx
sudo systemctl start nginx
```

### 步骤 3: 创建基础 Nginx 配置（如果还没有）

```bash
sudo nano /etc/nginx/sites-available/tripnara-api
```

基础配置（用于 certbot 验证）：

```nginx
server {
    listen 80;
    server_name api.tripnara.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/tripnara-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 步骤 4: 使用 certbot 获取证书并自动配置

```bash
sudo certbot --nginx -d api.tripnara.com
```

certbot 会：
1. 获取 SSL 证书
2. 自动修改 Nginx 配置添加 SSL
3. 自动配置 HTTP 到 HTTPS 重定向

### 步骤 5: 验证配置

```bash
# 测试 HTTPS
curl https://api.tripnara.com/api/system/status

# 查看 Nginx 配置（certbot 已自动更新）
cat /etc/nginx/sites-available/tripnara-api
```

---

## 如果 Nginx 配置已存在

如果 Nginx 已经有配置，certbot 会自动更新它。你可以：

1. **让 certbot 自动配置**（推荐）:
   ```bash
   sudo certbot --nginx -d api.tripnara.com
   ```
   certbot 会自动添加 SSL 配置。

2. **手动配置**（如果 certbot 无法自动配置）:
   - 先获取证书: `sudo certbot certonly --nginx -d api.tripnara.com`
   - 然后手动编辑 Nginx 配置添加 SSL

---

## 检查端口占用

如果想知道是什么占用了端口 80：

```bash
# 查看端口 80 占用
sudo lsof -i :80
# 或
sudo netstat -tlnp | grep :80
# 或
sudo ss -tlnp | grep :80

# 查看 Nginx 进程
ps aux | grep nginx
```

---

## 完整配置示例（certbot 自动生成后）

certbot 会自动将配置更新为类似这样：

```nginx
server {
    listen 80;
    server_name api.tripnara.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.tripnara.com;

    ssl_certificate /etc/letsencrypt/live/api.tripnara.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.tripnara.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
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

## 故障排查

### 问题 1: certbot 无法找到 Nginx 配置

确保 Nginx 配置文件中包含 `server_name api.tripnara.com;`

### 问题 2: DNS 未配置

确保 `api.tripnara.com` 的 DNS A 记录指向服务器 IP。

```bash
# 检查 DNS
dig api.tripnara.com
# 或
nslookup api.tripnara.com
```

### 问题 3: 防火墙阻止

确保防火墙开放 80 和 443 端口：

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

---

## 下一步

证书获取成功后：

1. **验证 HTTPS 连接**:
   ```bash
   curl https://api.tripnara.com/api/system/status
   ```

2. **更新前端配置**:
   ```bash
   # 前端 .env.production
   VITE_API_BASE_URL=https://api.tripnara.com
   ```

3. **设置自动续期**（certbot 通常已自动配置）:
   ```bash
   # 测试自动续期
   sudo certbot renew --dry-run
   ```
