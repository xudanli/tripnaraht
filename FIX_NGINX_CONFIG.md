# 修复 Nginx 配置文件的步骤

## 当前错误

```
nginx: [emerg] unexpected "}" in /etc/nginx/sites-enabled/tripnara-api:72
```

## 快速修复步骤

### 步骤 1: 备份并清空配置文件

```bash
# 备份当前配置（如果有需要）
sudo cp /etc/nginx/sites-available/tripnara-api /etc/nginx/sites-available/tripnara-api.backup

# 清空配置文件
sudo truncate -s 0 /etc/nginx/sites-available/tripnara-api
```

### 步骤 2: 写入正确的配置

```bash
sudo nano /etc/nginx/sites-available/tripnara-api
```

**复制以下内容（只复制 server 块，不要包含任何 Markdown 标记）**:

```
server {
    listen 80;
    server_name api.tripnara.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**重要**: 
- 文件应该只包含上面的内容
- 不要有任何 Markdown 标记（```nginx 或 ```）
- 不要有多余的空行或字符
- 确保每个 `{` 都有对应的 `}`

### 步骤 3: 验证配置

```bash
# 测试配置语法
sudo nginx -t

# 如果显示 "syntax is ok" 和 "test is successful"，说明配置正确
```

### 步骤 4: 重启 Nginx

```bash
sudo systemctl restart nginx
sudo systemctl status nginx
```

### 步骤 5: 验证 HTTP 代理

```bash
# 测试 HTTP 连接（应该能访问后端）
curl -H "Host: api.tripnara.com" http://localhost/api/system/status

# 或从外部测试（如果 DNS 已配置）
curl http://api.tripnara.com/api/system/status
```

### 步骤 6: 获取 SSL 证书

```bash
# 安装 certbot nginx 插件（如果还没有）
sudo apt-get install python3-certbot-nginx

# 获取证书并自动配置 HTTPS
sudo certbot --nginx -d api.tripnara.com
```

certbot 会自动更新配置文件，添加 SSL 配置。

---

## 一键修复脚本

如果手动修复有困难，可以使用以下命令：

```bash
# 创建正确的配置文件
sudo tee /etc/nginx/sites-available/tripnara-api > /dev/null << 'EOF'
server {
    listen 80;
    server_name api.tripnara.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 测试配置
sudo nginx -t

# 如果测试通过，重启 Nginx
sudo systemctl restart nginx
```

---

## 验证配置内容

修复后，检查配置文件内容：

```bash
# 查看配置文件内容
cat /etc/nginx/sites-available/tripnara-api

# 应该只看到 server { ... } 块，没有其他内容
```

---

## 常见错误

1. **包含 Markdown 标记**: 确保没有 ```nginx 或 ```
2. **多余的大括号**: 确保每个 `{` 都有对应的 `}`
3. **缺少分号**: 确保每个指令行末尾有 `;`
4. **注释格式错误**: Nginx 注释使用 `#`，不是 `//`

---

## 下一步

配置修复后：
1. 确保后端在 `127.0.0.1:3000` 运行
2. 使用 `sudo certbot --nginx -d api.tripnara.com` 获取证书
3. 更新前端配置为 `https://api.tripnara.com`
