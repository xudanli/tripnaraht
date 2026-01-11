# 生产环境 SMTP 配置指南

## 问题说明

如果本地测试成功，但生产环境提示"邮件服务未配置，请联系管理员"，说明 **Jenkins Credentials 中的配置缺少 SMTP 相关环境变量**。

## 快速解决方案

### 步骤 1: 检查生产环境配置

在服务器上运行诊断脚本：

```bash
# 给脚本添加执行权限
chmod +x scripts/check-smtp-config.sh

# 运行诊断
./scripts/check-smtp-config.sh
```

或者手动检查：

```bash
# 检查容器中的环境变量
docker exec tripnara-app env | grep SMTP

# 应该看到：
# SMTP_HOST=smtp.resend.com
# SMTP_PORT=587
# SMTP_USER=resend
# SMTP_PASSWORD=re_xxxxx
# SMTP_FROM=noreply@tripnara.com
```

如果看不到这些变量，说明配置未正确加载。

### 步骤 2: 更新 Jenkins Credentials

1. **登录 Jenkins**
   - 进入 Jenkins 控制台

2. **打开 Credentials**
   - 点击左侧菜单 `Credentials`
   - 找到 `tripnara-dotenv-prod`（或你的 Credentials ID）

3. **编辑 Credentials**
   - 点击 `tripnara-dotenv-prod` 右侧的 `...` 菜单
   - 选择 `Update`（或 `Configure`）

4. **添加 SMTP 配置**
   
   在 Secret 内容中添加以下配置（如果还没有的话）：

   ```bash
   # SMTP 邮件服务配置（Resend）
   SMTP_HOST="smtp.resend.com"
   SMTP_PORT="587"
   SMTP_SECURE="false"
   SMTP_USER="resend"
   SMTP_PASSWORD="re_xxxxxxxxxxxxx"
   SMTP_FROM="noreply@yourdomain.com"
   
   # 联系模块配置（可选）
   CONTACT_NOTIFICATION_EMAIL="contact@yourdomain.com"
   CONTACT_UPLOAD_DIR="uploads/contact"
   FILE_STORAGE_BASE_URL=""
   ```

   **重要提示**：
   - 替换 `re_xxxxxxxxxxxxx` 为你的实际 Resend API Key
   - 替换 `yourdomain.com` 为你的实际域名
   - 确保 `SMTP_FROM` 使用的是已验证的域名邮箱

5. **保存 Credentials**
   - 点击 `Save` 保存更改

### 步骤 3: 重新部署

配置更新后，需要重新部署应用：

1. **触发 Jenkins 构建**
   - 在 Jenkins 中触发新的构建
   - 或者等待自动构建（如果配置了自动触发）

2. **等待构建完成**
   - 等待 Jenkins 构建完成所有阶段

3. **验证配置**
   - 构建完成后，运行诊断脚本验证配置是否生效

## 完整的 Jenkins Credentials 配置示例

以下是一个完整的 `.env` 配置示例（适用于 Resend）：

```bash
# 数据库
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=disable"

# API Keys
APIFY_API_TOKEN="apify_api_xxx"
VITE_MAPBOX_ACCESS_TOKEN="pk.xxx"

# SMTP 邮件服务配置（Resend）
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="re_AbCdEfGhIjKlMnOpQrStUvWxYz123456"
SMTP_FROM="noreply@tripnara.com"

# 联系模块配置
CONTACT_NOTIFICATION_EMAIL="contact@tripnara.com"
CONTACT_UPLOAD_DIR="uploads/contact"
FILE_STORAGE_BASE_URL=""

# CORS 配置
FRONTEND_URL="https://tripnara.com"

# 其他配置
NODE_ENV="production"
PORT="3000"
```

## 验证配置是否生效

### 方法 1: 使用诊断脚本

```bash
./scripts/check-smtp-config.sh
```

脚本会检查：
- 环境变量是否设置
- 应用日志中的 SMTP 配置信息
- 接口测试结果

### 方法 2: 手动验证

```bash
# 1. 检查环境变量
docker exec tripnara-app env | grep SMTP

# 2. 检查应用日志
docker logs tripnara-app | grep -i smtp

# 应该看到：
# SMTP 配置: smtp.resend.com:587, secure: false

# 3. 测试接口
curl -X POST http://localhost:3000/api/auth/email/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# 应该返回：
# {"message":"验证码已发送，请查收邮件"}
```

## 常见问题

### 问题 1: 配置已添加但仍然失败

**可能原因**：
- 配置格式错误（缺少引号、换行符等）
- 容器未重新启动
- 环境变量名称拼写错误

**解决方案**：
1. 检查配置格式（参考 `JENKINS_ENV_FORMAT.md`）
2. 重新部署（触发新的 Jenkins 构建）
3. 检查环境变量名称是否正确（区分大小写）

### 问题 2: 配置格式错误

**错误示例**：
```bash
# ❌ 错误：缺少引号
SMTP_PASSWORD=re_xxxxx

# ❌ 错误：值被分割到多行
SMTP_PASSWORD="re_xxxxx
xxxxx"

# ❌ 错误：变量之间没有换行
SMTP_USER="resend" SMTP_PASSWORD="re_xxxxx"
```

**正确格式**：
```bash
# ✅ 正确：每个变量独立一行，值用引号包裹
SMTP_USER="resend"
SMTP_PASSWORD="re_xxxxx"
```

### 问题 3: 容器中的环境变量为空

**可能原因**：
- `.env` 文件未正确写入
- Docker Compose 未正确加载 `.env` 文件
- 容器启动时 `.env` 文件不存在

**解决方案**：
1. 检查 Jenkins 构建日志中的 "Write .env from Jenkins Credentials" 阶段
2. 确认 `.env` 文件已正确写入
3. 重新构建和部署容器

### 问题 4: Resend 域名未验证

**错误信息**：
```
Error: Domain not verified
```

**解决方案**：
1. 在 Resend 控制台验证域名
2. 配置 DNS 记录（SPF、DKIM）
3. 等待验证通过（通常几分钟）
4. 使用已验证域名的邮箱作为 `SMTP_FROM`

## 配置检查清单

在更新 Jenkins Credentials 前，请确认：

- [ ] Resend API Key 已获取
- [ ] 域名已在 Resend 中验证
- [ ] DNS 记录（SPF、DKIM）已配置
- [ ] 配置格式正确（引号、换行符）
- [ ] 环境变量名称正确（区分大小写）
- [ ] 所有必需变量都已添加（SMTP_USER、SMTP_PASSWORD）
- [ ] 构建完成后已重新部署

## 相关文档

- `SMTP_CONFIG_GUIDE.md` - SMTP 邮件服务配置指南
- `CONTACT_CONFIG_GUIDE.md` - 联系模块配置指南
- `JENKINS_ENV_FORMAT.md` - Jenkins 环境变量格式说明
- `scripts/check-smtp-config.sh` - SMTP 配置诊断脚本
