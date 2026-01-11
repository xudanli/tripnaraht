# 联系模块配置指南

## 概述

联系模块用于处理用户提交的联系表单（文本消息和图片上传），并自动发送通知邮件到客服邮箱。

## 环境变量配置

### 必需配置（与邮件服务共享）

联系模块使用与邮件验证服务相同的 SMTP 配置，请参考 `SMTP_CONFIG_GUIDE.md` 配置以下变量：

```bash
# SMTP 邮件服务配置（必需，与邮件验证服务共享）
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="re_xxxxxxxxxxxxx"  # 你的 Resend API Key
SMTP_FROM="noreply@yourdomain.com"  # 必须是已验证的域名
```

### 联系模块专用配置

```bash
# 联系模块配置
CONTACT_NOTIFICATION_EMAIL="contact@yourdomain.com"  # 接收通知的客服邮箱
CONTACT_UPLOAD_DIR="uploads/contact"  # 文件上传目录（可选，默认值）
FILE_STORAGE_BASE_URL="https://your-domain.com/uploads"  # 文件访问URL（可选）
```

## 使用 Resend 的完整配置示例

### 配置说明

使用 Resend 邮件服务时，配置如下：

```bash
# ============================================
# SMTP 邮件服务配置（Resend）
# ============================================
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="re_xxxxxxxxxxxxx"  # 从 Resend 控制台获取的 API Key
SMTP_FROM="noreply@yourdomain.com"  # 必须是已验证的域名（如 noreply@tripnara.com）

# ============================================
# 联系模块配置
# ============================================
# 接收联系表单通知的客服邮箱
CONTACT_NOTIFICATION_EMAIL="contact@yourdomain.com"

# 文件上传目录（可选，默认: uploads/contact）
CONTACT_UPLOAD_DIR="uploads/contact"

# 文件访问基础URL（可选，如果使用对象存储或CDN）
# 如果留空，将使用相对路径
FILE_STORAGE_BASE_URL="https://your-domain.com/uploads"
```

### Resend 配置步骤

1. **获取 Resend API Key**:
   - 登录 [Resend 控制台](https://resend.com)
   - 进入 API Keys 页面
   - 创建新的 API Key
   - 复制 API Key（格式：`re_xxxxxxxxxxxxx`）

2. **验证域名**（重要）:
   - 在 Resend 控制台中添加你的域名（如 `yourdomain.com`）
   - 配置 DNS 记录（SPF、DKIM）
   - 等待域名验证通过

3. **配置环境变量**:
   - 将 API Key 设置为 `SMTP_PASSWORD`
   - 设置 `SMTP_FROM` 为已验证域名的邮箱（如 `noreply@yourdomain.com`）
   - 设置 `CONTACT_NOTIFICATION_EMAIL` 为接收通知的邮箱

### 配置示例

#### 示例 1: 基本配置

```bash
# SMTP 配置（Resend）
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="re_AbCdEfGhIjKlMnOpQrStUvWxYz123456"
SMTP_FROM="noreply@tripnara.com"

# 联系模块配置
CONTACT_NOTIFICATION_EMAIL="contact@tripnara.com"
CONTACT_UPLOAD_DIR="uploads/contact"
```

#### 示例 2: 使用对象存储（如 AWS S3、阿里云 OSS）

```bash
# SMTP 配置（Resend）
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="re_AbCdEfGhIjKlMnOpQrStUvWxYz123456"
SMTP_FROM="noreply@tripnara.com"

# 联系模块配置
CONTACT_NOTIFICATION_EMAIL="contact@tripnara.com"
CONTACT_UPLOAD_DIR="uploads/contact"
FILE_STORAGE_BASE_URL="https://cdn.tripnara.com/uploads"  # CDN 或对象存储 URL
```

## 配置项说明

### CONTACT_NOTIFICATION_EMAIL

- **说明**: 接收联系表单通知的客服邮箱地址
- **必需**: 否（默认: `contact@tripnara.com`）
- **格式**: 有效的邮箱地址
- **示例**: `contact@tripnara.com`, `support@tripnara.com`

### CONTACT_UPLOAD_DIR

- **说明**: 上传文件保存的目录路径
- **必需**: 否（默认: `uploads/contact`）
- **格式**: 相对路径或绝对路径
- **示例**: `uploads/contact`, `/var/www/uploads/contact`
- **注意**: 目录会被自动创建（如果不存在）

### FILE_STORAGE_BASE_URL

- **说明**: 文件访问的基础 URL（用于生成文件访问链接）
- **必需**: 否（如果留空，将使用相对路径）
- **格式**: 完整的 URL（包含协议）
- **示例**: 
  - `https://cdn.tripnara.com/uploads` (使用 CDN)
  - `https://your-domain.com/uploads` (使用应用服务器)
  - `https://your-bucket.s3.amazonaws.com/uploads` (使用 AWS S3)
- **使用场景**: 
  - 使用对象存储（S3、OSS、COS）时
  - 使用 CDN 时
  - 文件服务器与应用服务器分离时

## 工作原理

1. **用户提交联系表单** → POST `/api/contact/message`
2. **保存消息和图片** → 数据库 + 文件系统/对象存储
3. **发送通知邮件** → 使用 SMTP 配置发送到 `CONTACT_NOTIFICATION_EMAIL`
4. **邮件内容** → 包含消息内容、用户信息、图片链接

## 验证配置

### 1. 检查环境变量

```bash
# 在容器内检查
docker exec tripnara-app env | grep -E "SMTP_|CONTACT_|FILE_STORAGE"

# 应该看到:
# SMTP_HOST=smtp.resend.com
# SMTP_PORT=587
# SMTP_USER=resend
# SMTP_PASSWORD=re_xxxxx (已设置)
# SMTP_FROM=noreply@tripnara.com
# CONTACT_NOTIFICATION_EMAIL=contact@tripnara.com
# CONTACT_UPLOAD_DIR=uploads/contact
```

### 2. 查看应用启动日志

```bash
docker logs tripnara-app | grep -i contact

# 应该看到:
# 联系通知服务已初始化，通知邮箱: contact@tripnara.com
```

### 3. 测试联系表单

```bash
# 测试提交联系表单（带文本）
curl -X POST http://localhost:3000/api/contact/message \
  -F "message=测试消息" \
  -H "Content-Type: multipart/form-data"

# 测试提交联系表单（带图片）
curl -X POST http://localhost:3000/api/contact/message \
  -F "message=测试消息" \
  -F "images=@/path/to/image.jpg" \
  -H "Content-Type: multipart/form-data"
```

## 常见问题

### 问题 1: Resend 域名未验证

**错误信息**:
```
Error: Domain not verified
```

**解决方案**:
1. 在 Resend 控制台验证域名
2. 配置 DNS 记录（SPF、DKIM）
3. 等待验证通过（通常几分钟）
4. 使用已验证域名的邮箱作为 `SMTP_FROM`

### 问题 2: 邮件发送失败

**解决方案**:
1. 检查 Resend API Key 是否正确
2. 检查 `SMTP_FROM` 是否为已验证域名的邮箱
3. 查看应用日志: `docker logs tripnara-app | grep -i smtp`

### 问题 3: 图片无法访问

**解决方案**:
1. 如果使用本地存储，确保 `CONTACT_UPLOAD_DIR` 目录可写
2. 如果使用对象存储，配置 `FILE_STORAGE_BASE_URL`
3. 检查文件权限和 Nginx 配置（如果使用本地存储）

### 问题 4: 通知邮件未收到

**检查步骤**:
1. 检查 `CONTACT_NOTIFICATION_EMAIL` 配置是否正确
2. 检查垃圾邮件箱
3. 查看应用日志确认邮件是否发送
4. 检查 Resend 控制台的发送日志

## 相关文档

- `SMTP_CONFIG_GUIDE.md` - SMTP 邮件服务配置指南
- `API_TESTING_GUIDE.md` - API 测试指南
- `src/contact/README.md` - 联系模块详细文档
