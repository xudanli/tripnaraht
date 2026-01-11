# SMTP 邮件服务配置指南

## 问题说明

如果看到以下错误：
```
ERROR [EmailVerificationService] SMTP 配置不完整，无法发送验证码邮件
BadRequestException: 邮件服务未配置，请联系管理员
```

这表示应用缺少 SMTP 邮件服务配置，无法发送验证码邮件。

## 必需的环境变量

### 最小配置（必需）

```bash
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"
```

### 完整配置（推荐）

```bash
# SMTP 服务器配置
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"

# SMTP 认证信息
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"

# 发件人邮箱（可选，默认使用 SMTP_USER）
SMTP_FROM="noreply@tripnara.com"

# 应用名称（可选，用于邮件标题）
APP_NAME="TripNARA"
```

## 常见邮件服务商配置

### Gmail

```bash
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"  # 需要使用应用专用密码
SMTP_FROM="your-email@gmail.com"
```

**重要提示**：
- Gmail 需要使用**应用专用密码**（App Password），不能使用普通密码
- 启用两步验证后，在 Google 账户设置中生成应用专用密码
- 路径：Google 账户 → 安全性 → 两步验证 → 应用专用密码

### 阿里云企业邮箱

```bash
SMTP_HOST="smtp.mxhichina.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="your-email@yourdomain.com"
SMTP_PASSWORD="your-password"
SMTP_FROM="noreply@yourdomain.com"
```

### 腾讯企业邮箱

```bash
SMTP_HOST="smtp.exmail.qq.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="your-email@yourdomain.com"
SMTP_PASSWORD="your-password"
SMTP_FROM="noreply@yourdomain.com"
```

### SendGrid

```bash
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="apikey"
SMTP_PASSWORD="your-sendgrid-api-key"
SMTP_FROM="noreply@tripnara.com"
```

### Resend

```bash
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="your-resend-api-key"
SMTP_FROM="noreply@yourdomain.com"  # 必须是已验证的域名
```

### AWS SES

```bash
SMTP_HOST="email-smtp.us-east-1.amazonaws.com"  # 根据区域调整
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-ses-smtp-username"
SMTP_PASSWORD="your-ses-smtp-password"
SMTP_FROM="noreply@yourdomain.com"  # 必须是已验证的域名
```

## 配置方法

### 方法 1: 在 .env 文件中配置（本地开发）

```bash
# 编辑 .env 文件
nano .env

# 添加 SMTP 配置
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"
SMTP_FROM="your-email@gmail.com"
```

### 方法 2: 在 Jenkins Credentials 中配置（生产环境）

1. 进入 Jenkins → Credentials → tripnara-dotenv-prod
2. 在 Secret 内容中添加：
   ```bash
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT="587"
   SMTP_USER="your-email@gmail.com"
   SMTP_PASSWORD="your-app-password"
   SMTP_FROM="noreply@tripnara.com"
   ```

### 方法 3: 在 Docker Compose 中配置

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
      - SMTP_HOST=smtp.gmail.com
      - SMTP_PORT=587
      - SMTP_USER=your-email@gmail.com
      - SMTP_PASSWORD=your-app-password
      - SMTP_FROM=noreply@tripnara.com
    ports:
      - "3000:3000"
```

## 验证配置

### 1. 检查环境变量

```bash
# 在容器内检查
docker exec tripnara-app env | grep SMTP

# 应该看到:
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASSWORD=*** (已设置)
```

### 2. 查看应用启动日志

```bash
docker logs tripnara-app | grep SMTP

# 应该看到:
# SMTP 配置: smtp.gmail.com:587, secure: false
```

如果看到警告：
```
SMTP 配置未完整，邮件发送功能可能不可用
```
说明配置不完整，需要检查 `SMTP_USER` 和 `SMTP_PASSWORD`。

### 3. 测试发送邮件

```bash
# 测试发送验证码接口
curl -X POST http://localhost:3000/api/auth/email/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# 如果配置正确，应该返回:
# {"message": "验证码已发送，请查收邮件"}
```

## 常见问题

### 问题 1: Gmail 认证失败

**错误信息**:
```
Error: Invalid login: 535-5.7.8 Username and Password not accepted
```

**解决方案**:
1. 确保启用了两步验证
2. 生成应用专用密码（不是普通密码）
3. 使用应用专用密码作为 `SMTP_PASSWORD`

### 问题 2: 端口被阻止

**错误信息**:
```
Error: connect ETIMEDOUT
```

**解决方案**:
1. 检查防火墙是否开放 SMTP 端口（587 或 465）
2. 尝试使用不同的端口：
   - 587 (TLS)
   - 465 (SSL)
   - 25 (不推荐，可能被阻止)

### 问题 3: 邮件进入垃圾箱

**解决方案**:
1. 配置 SPF 记录（DNS）
2. 配置 DKIM 签名
3. 使用已验证的域名作为发件人
4. 避免使用免费邮箱（如 Gmail）作为生产环境发件人

### 问题 4: Resend 域名验证

**错误信息**:
```
Error: Domain not verified
```

**解决方案**:
1. 在 Resend 控制台验证域名
2. 配置 DNS 记录（SPF、DKIM）
3. 使用已验证域名的邮箱作为 `SMTP_FROM`

## 安全建议

1. **使用应用专用密码**: 不要使用账户主密码
2. **环境变量加密**: 在生产环境中使用密钥管理服务
3. **限制发件人域名**: 只使用已验证的域名
4. **监控邮件发送**: 设置告警监控邮件发送失败
5. **定期轮换密码**: 定期更新 SMTP 密码

## 测试配置脚本

创建一个测试脚本 `scripts/test-smtp.sh`:

```bash
#!/bin/bash
# 测试 SMTP 配置

echo "测试 SMTP 配置..."
docker exec tripnara-app env | grep SMTP

echo ""
echo "测试发送验证码..."
curl -X POST http://localhost:3000/api/auth/email/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## 相关文档

- `API_TESTING_GUIDE.md` - API 测试指南
- `CORS_CONFIG_GUIDE.md` - CORS 配置指南
- `JENKINS_ENV_FORMAT.md` - Jenkins 环境变量格式说明
