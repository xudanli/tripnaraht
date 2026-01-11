# Jenkins 配置更新后重新部署指南

## 问题说明

如果在 Jenkins Credentials 中更新了配置（如添加 SMTP 配置），但容器中的环境变量仍未更新，这是因为：

1. **Jenkins Credentials 的配置是在构建时写入 `.env` 文件**
2. **容器需要在构建时加载 `.env` 文件**
3. **如果容器已经在运行，需要重新部署才能加载新配置**

## 解决方案

### 方法 1: 通过 Jenkins 重新部署（推荐）

这是正确的方式，因为 `.env` 文件是从 Jenkins Credentials 生成的。

#### 步骤 1: 确认 Jenkins Credentials 配置

1. 登录 Jenkins 控制台
2. 进入 **Credentials** → **tripnara-dotenv-prod**
3. 确认配置中包含 SMTP 相关变量：

```bash
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="re_xxxxxxxxxxxxx"
SMTP_FROM="noreply@yourdomain.com"
```

#### 步骤 2: 触发新的 Jenkins 构建

1. 在 Jenkins 中找到项目
2. 点击 **Build Now** 或等待自动触发
3. 等待构建完成所有阶段：
   - Write .env from Jenkins Credentials
   - Build
   - Migrate
   - Up

#### 步骤 3: 验证配置

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

### 方法 2: 手动重新部署（如果 Jenkins 不可用）

如果无法通过 Jenkins 部署，可以手动操作：

⚠️ **注意**：此方法需要确保 `.env` 文件存在且格式正确。

```bash
# 1. 检查 .env 文件是否存在
ls -la .env

# 2. 检查 .env 文件中的 SMTP 配置
grep SMTP .env

# 3. 停止容器
docker compose down

# 4. 重新创建并启动容器
docker compose up -d --remove-orphans

# 5. 验证环境变量
docker exec tripnara-app env | grep SMTP
```

## 常见问题

### Q: 为什么配置已添加但容器中还是没有？

**A**: 可能的原因：

1. **未重新部署**：配置更新后必须重新触发 Jenkins 构建
2. **容器未重启**：即使 `.env` 文件更新，运行中的容器也不会自动加载新配置
3. **配置格式错误**：`.env` 文件格式不正确导致变量未被解析

### Q: 如何确认 Jenkins Credentials 配置正确？

**A**: 检查 Jenkins 构建日志：

1. 在 Jenkins 中打开最近的一次构建
2. 查看 **Write .env from Jenkins Credentials** 阶段的日志
3. 确认 `.env` 文件已正确写入
4. 可以添加验证步骤检查 `.env` 文件内容（不包含敏感信息）

### Q: 配置格式错误怎么办？

**A**: 参考 `JENKINS_ENV_FORMAT.md` 检查格式：

✅ **正确格式**：
```bash
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_USER="resend"
SMTP_PASSWORD="re_xxxxx"
```

❌ **错误格式**：
```bash
# 缺少引号
SMTP_PASSWORD=re_xxxxx

# 值被分割到多行
SMTP_PASSWORD="re_xxxxx
xxxxx"

# 变量之间没有换行
SMTP_USER="resend" SMTP_PASSWORD="re_xxxxx"
```

### Q: 重新部署后仍然没有环境变量？

**A**: 检查以下几点：

1. **Jenkins 构建日志**：查看 `.env` 文件是否正确写入
2. **容器日志**：`docker logs tripnara-app` 查看容器启动情况
3. **.env 文件内容**：在 Jenkins 工作目录中检查 `.env` 文件
4. **docker-compose.yml**：确认 `env_file` 配置正确

```yaml
services:
  app:
    env_file:
      - ./.env
```

### Q: 如何在 Jenkins 构建中添加验证步骤？

**A**: 在 `Jenkinsfile` 的 **Write .env from Jenkins Credentials** 阶段后添加：

```groovy
stage('Verify .env') {
  steps {
    sh '''
      if [ -f .env ]; then
        echo "检查 .env 文件..."
        echo "SMTP 配置（隐藏密码）："
        grep "^SMTP_" .env | sed 's/PASSWORD=.*/PASSWORD=***/' || echo "未找到 SMTP 配置"
      else
        echo "❌ .env 文件不存在"
        exit 1
      fi
    '''
  }
}
```

## 验证步骤总结

完成配置和部署后，使用以下命令验证：

```bash
# 1. 检查环境变量
docker exec tripnara-app env | grep SMTP

# 2. 检查应用日志
docker logs tripnara-app | grep -i smtp

# 3. 测试接口
curl -X POST http://localhost:3000/api/auth/email/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## 相关文档

- `JENKINS_CREDENTIALS_QUICK_REF.md` - Jenkins Credentials 快速配置参考
- `PRODUCTION_SMTP_SETUP.md` - 生产环境 SMTP 配置指南
- `JENKINS_ENV_FORMAT.md` - Jenkins 环境变量格式说明
- `SMTP_CONFIG_GUIDE.md` - SMTP 配置完整指南
