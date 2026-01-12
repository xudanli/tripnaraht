# 生产环境错误修复指南

## 错误现象

从浏览器控制台可以看到以下错误：

1. **SSL 证书错误**:
   ```
   ERR_CERT_COMMON_NAME_INVALID
   Failed to load resource: 47.253.148.159/auth/email/send-code:1 net::ERR_CERT_COMMON_NAME_INVALID
   POST https://47.253.148.159/auth/google/code net::ERR_CERT_COMMON_NAME_INVALID
   ```

2. **网络连接错误**:
   ```
   [API Client] X 网络连接错误: 无法连接到后端服务,请确认后端服务是否运行
   Google login failed: Error: 无法连接到后端服务器。请确保后端服务正在运行在 localhost:3000。
   ```

3. **404 错误**:
   ```
   Failed to load resource: the server responded with a status of 404 (Not Found)
   ```

## 根本原因

### 问题 1: SSL 证书不匹配

- ❌ **错误配置**: 前端使用 IP 地址 `https://47.253.148.159` 访问后端
- ✅ **正确配置**: 应该使用域名 `https://api.tripnara.com`
- **原因**: SSL 证书是为域名签发的，不能用于 IP 地址访问

### 问题 2: 前端 API 配置错误

- 前端可能配置了错误的 API 地址（IP 地址或 localhost）
- 需要检查前端环境变量 `VITE_API_BASE_URL`

### 问题 3: 资源加载失败

- 可能是前端构建配置问题
- 或静态资源路径配置错误

## 解决方案

### 步骤 1: 检查并修复前端 API 配置

#### 1.1 检查前端环境变量

前端需要配置正确的 API 地址（使用域名，不是 IP）：

```bash
# .env.production 或生产环境配置
VITE_API_BASE_URL=https://api.tripnara.com
```

**不要使用**:
- ❌ `http://47.253.148.159:3000`
- ❌ `https://47.253.148.159`
- ❌ `http://localhost:3000`

**应该使用**:
- ✅ `https://api.tripnara.com`
- ✅ `https://tripnara.com/api` (如果使用同一域名)

#### 1.2 检查前端代码中的硬编码地址

搜索前端代码中是否有硬编码的 localhost 或 IP 地址：

```bash
# 在前端代码目录中搜索
grep -r "localhost:3000" src/
grep -r "47.253.148.159" src/
```

如果找到硬编码地址，需要：
1. 移除硬编码
2. 使用环境变量 `VITE_API_BASE_URL`
3. 重新构建前端

### 步骤 2: 确保 SSL 证书正确配置

#### 2.1 检查 DNS 配置

确保 `api.tripnara.com` 的 DNS A 记录指向服务器 IP：

```bash
# 检查 DNS 记录
dig api.tripnara.com
# 或
nslookup api.tripnara.com

# 应该返回: 47.253.148.159
```

#### 2.2 检查 SSL 证书

```bash
# 检查证书是否存在
sudo ls -la /etc/letsencrypt/live/api.tripnara.com/

# 应该看到:
# fullchain.pem
# privkey.pem

# 检查证书信息
sudo openssl x509 -in /etc/letsencrypt/live/api.tripnara.com/fullchain.pem -text -noout | grep "Subject:"

# 应该看到证书是为 api.tripnara.com 签发的
```

#### 2.3 如果没有证书，获取证书

```bash
# 安装 certbot（如果未安装）
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# 获取证书（使用 nginx 插件，自动配置）
sudo certbot --nginx -d api.tripnara.com

# 如果 nginx 未运行，使用 standalone 模式
sudo certbot certonly --standalone -d api.tripnara.com
```

### 步骤 3: 检查 Nginx 配置

#### 3.1 检查 Nginx 配置文件

```bash
# 检查配置文件
sudo cat /etc/nginx/sites-available/tripnara-api

# 或
sudo cat /etc/nginx/sites-enabled/tripnara-api
```

确保配置包含：

```nginx
server {
    listen 443 ssl http2;
    server_name api.tripnara.com;

    # SSL 证书路径
    ssl_certificate /etc/letsencrypt/live/api.tripnara.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.tripnara.com/privkey.pem;

    # 代理到后端
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 3.2 测试并重启 Nginx

```bash
# 测试配置
sudo nginx -t

# 如果测试通过，重启 Nginx
sudo systemctl restart nginx

# 检查状态
sudo systemctl status nginx
```

### 步骤 4: 检查后端 CORS 配置

确保后端允许前端域名：

```bash
# 在 Jenkins Credentials 或 .env 文件中配置
FRONTEND_URL=https://tripnara.com
# 或
FRONTEND_URLS=https://tripnara.com,https://www.tripnara.com
```

参考: `CORS_CONFIG_GUIDE.md`

### 步骤 5: 验证修复

#### 5.1 测试 HTTPS 连接

```bash
# 测试 API 端点
curl https://api.tripnara.com/api/system/status

# 应该返回 JSON 响应，没有 SSL 错误
```

#### 5.2 测试 SSL 证书

```bash
# 检查 SSL 证书
openssl s_client -connect api.tripnara.com:443 -showcerts

# 应该看到有效的证书，没有 "verify error" 或 "Common Name" 错误
```

#### 5.3 从前端测试

1. 清除浏览器缓存
2. 硬刷新页面 (Ctrl+Shift+R 或 Cmd+Shift+R)
3. 打开浏览器开发者工具
4. 检查 Network 标签页，确认：
   - API 请求使用 `https://api.tripnara.com`
   - 没有 SSL 证书错误
   - 没有 CORS 错误

## 快速修复检查清单

- [ ] 前端环境变量 `VITE_API_BASE_URL=https://api.tripnara.com`（不是 IP 地址）
- [ ] DNS 记录 `api.tripnara.com` 指向 `47.253.148.159`
- [ ] SSL 证书已获取并配置（`/etc/letsencrypt/live/api.tripnara.com/`）
- [ ] Nginx 配置正确，使用 SSL 证书
- [ ] Nginx 已重启并运行
- [ ] 防火墙开放 443 端口
- [ ] 后端 CORS 配置允许前端域名
- [ ] 前端代码中没有硬编码的 localhost 或 IP 地址
- [ ] 前端已重新构建并部署

## 常见问题

### Q1: 证书仍然报错

**可能原因**:
- DNS 未正确配置
- 证书过期
- 证书路径错误

**解决方案**:
```bash
# 检查 DNS
dig api.tripnara.com

# 检查证书有效期
sudo openssl x509 -in /etc/letsencrypt/live/api.tripnara.com/fullchain.pem -noout -dates

# 如果过期，续期证书
sudo certbot renew
```

### Q2: 前端仍然显示 localhost 错误

**可能原因**:
- 前端代码中有硬编码的 localhost
- 环境变量未正确加载
- 前端未重新构建

**解决方案**:
1. 搜索并移除硬编码地址
2. 检查环境变量是否正确设置
3. 重新构建前端: `npm run build` 或 `pnpm build`
4. 清除浏览器缓存

### Q3: 404 错误

**可能原因**:
- 静态资源路径配置错误
- Nginx 配置错误
- 前端构建输出路径错误

**解决方案**:
1. 检查 Nginx 配置中的 `root` 或 `proxy_pass` 路径
2. 检查前端构建输出目录
3. 检查静态资源路径是否正确

## 相关文档

- `NGINX_HTTPS_CONFIG.md` - Nginx HTTPS 配置指南
- `FRONTEND_BACKEND_HTTPS_FIX.md` - 前后端 HTTPS 配置
- `CORS_CONFIG_GUIDE.md` - CORS 配置指南
- `CERTBOT_PORT_80_FIX.md` - Certbot 证书获取指南

## 紧急修复步骤（如果无法立即修复）

如果无法立即修复，可以临时：

1. **使用 HTTP（不推荐，仅用于紧急情况）**:
   - 前端使用 `http://` 而不是 `https://`
   - 注意：现代浏览器可能仍然阻止混合内容

2. **配置浏览器忽略证书错误（仅用于测试）**:
   - Chrome: 访问 `chrome://flags/#allow-insecure-localhost`
   - 注意：**不要在生产环境使用此方法**

**强烈建议**: 尽快修复 SSL 证书和域名配置，这是生产环境的标准做法。
