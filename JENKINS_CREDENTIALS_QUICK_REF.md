# Jenkins Credentials 快速配置参考

## 当前问题

生产环境容器中缺少 SMTP 配置，导致邮件服务无法使用。

**验证命令**：
```bash
docker exec tripnara-app env | grep SMTP
# 无输出 = 配置缺失
```

## 快速修复步骤

### 1. 登录 Jenkins

访问 Jenkins 控制台（通常是 `http://your-jenkins-server:8080`）

### 2. 编辑 Credentials

1. 点击左侧菜单 **Credentials**
2. 找到 **tripnara-dotenv-prod**（或你的 Credentials ID）
3. 点击右侧的 **...** 菜单
4. 选择 **Update** 或 **Configure**

### 3. 添加 SMTP 配置

在 **Secret** 文本框中，找到现有配置的末尾，添加以下内容：

```bash
# SMTP 邮件服务配置（Resend）
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="re_xxxxxxxxxxxxx"
SMTP_FROM="noreply@yourdomain.com"

# 联系模块配置
CONTACT_NOTIFICATION_EMAIL="contact@yourdomain.com"
CONTACT_UPLOAD_DIR="uploads/contact"
FILE_STORAGE_BASE_URL=""
```

**重要**：
- 替换 `re_xxxxxxxxxxxxx` 为你的实际 Resend API Key
- 替换 `yourdomain.com` 为你的实际域名（如 `tripnara.com`）
- 确保 `SMTP_FROM` 使用的是在 Resend 中已验证的域名邮箱

### 4. 保存并重新部署

1. 点击 **Save** 保存配置
2. 在 Jenkins 中触发新的构建
3. 等待构建完成

### 5. 验证配置

构建完成后，在服务器上运行：

```bash
# 检查环境变量
docker exec tripnara-app env | grep SMTP

# 应该看到：
# SMTP_HOST=smtp.resend.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=resend
# SMTP_PASSWORD=re_xxxxx
# SMTP_FROM=noreply@tripnara.com
```

## 完整配置示例

如果你的配置文件中已经有其他变量，确保格式正确：

```bash
# 数据库（已有）
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=disable"

# API Keys（已有）
APIFY_API_TOKEN="apify_api_xxx"
VITE_MAPBOX_ACCESS_TOKEN="pk.xxx"

# SMTP 邮件服务配置（需要添加）
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="re_AbCdEfGhIjKlMnOpQrStUvWxYz123456"
SMTP_FROM="noreply@tripnara.com"

# 联系模块配置（需要添加）
CONTACT_NOTIFICATION_EMAIL="contact@tripnara.com"
CONTACT_UPLOAD_DIR="uploads/contact"
FILE_STORAGE_BASE_URL=""

# CORS 配置（建议添加）
FRONTEND_URL="https://tripnara.com"

# 其他配置（已有）
NODE_ENV="production"
PORT="3000"
```

## 配置格式要求

⚠️ **重要**：确保配置格式正确

### ✅ 正确格式

```bash
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_USER="resend"
SMTP_PASSWORD="re_xxxxx"
```

### ❌ 错误格式

```bash
# 错误1: 缺少引号
SMTP_PASSWORD=re_xxxxx

# 错误2: 值被分割到多行
SMTP_PASSWORD="re_xxxxx
xxxxx"

# 错误3: 变量之间没有换行
SMTP_USER="resend" SMTP_PASSWORD="re_xxxxx"

# 错误4: 多余的空格
SMTP_HOST = "smtp.resend.com"
```

## 获取 Resend API Key

1. 登录 [Resend 控制台](https://resend.com)
2. 进入 **API Keys** 页面
3. 点击 **Create API Key**
4. 复制生成的 API Key（格式：`re_xxxxxxxxxxxxx`）

## 验证域名

在使用 Resend 前，需要验证域名：

1. 在 Resend 控制台添加域名（如 `tripnara.com`）
2. 配置 DNS 记录（SPF、DKIM）
3. 等待验证通过（通常几分钟）
4. 使用已验证域名的邮箱作为 `SMTP_FROM`（如 `noreply@tripnara.com`）

## 验证配置是否生效

### 方法 1: 检查环境变量

```bash
docker exec tripnara-app env | grep SMTP
```

### 方法 2: 检查应用日志

```bash
docker logs tripnara-app | grep -i smtp

# 应该看到：
# SMTP 配置: smtp.resend.com:587, secure: false
```

### 方法 3: 测试接口

```bash
curl -X POST http://localhost:3000/api/auth/email/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# 应该返回：
# {"message":"验证码已发送，请查收邮件"}
```

## 常见问题

### Q: 配置已添加但仍然失败？

**A**: 检查以下几点：
1. 配置格式是否正确（引号、换行符）
2. 是否重新触发了 Jenkins 构建
3. 容器是否已重新启动
4. Resend API Key 是否正确
5. 域名是否已验证

### Q: 如何确认配置已加载？

**A**: 运行以下命令：
```bash
docker exec tripnara-app env | grep SMTP
```

如果有输出，说明配置已加载。

### Q: 配置更新后需要做什么？

**A**: 
1. 保存 Jenkins Credentials
2. 触发新的 Jenkins 构建
3. 等待构建完成
4. 验证配置是否生效

## 相关文档

- `PRODUCTION_SMTP_SETUP.md` - 详细的生产环境配置指南
- `SMTP_CONFIG_GUIDE.md` - SMTP 配置完整指南
- `CONTACT_CONFIG_GUIDE.md` - 联系模块配置指南
- `JENKINS_ENV_FORMAT.md` - Jenkins 环境变量格式说明
