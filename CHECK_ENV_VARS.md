# 检查环境变量

## 当前问题

从日志可以看到：
```
ERROR [EmailVerificationService] SMTP 配置不完整，无法发送验证码邮件
```

说明 SMTP 环境变量仍未加载到容器中。

## 立即检查

在服务器上运行以下命令：

```bash
# 检查容器中的 SMTP 环境变量
docker exec tripnara-app env | grep SMTP

# 如果没有输出，说明环境变量未加载
```

## 如果环境变量未加载

### 步骤 1: 确认 Jenkins Credentials 配置

1. 登录 Jenkins 控制台
2. 进入 **Credentials** → **tripnara-dotenv-prod**
3. 确认配置中包含 SMTP 变量：

```bash
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="re_xxxxxxxxxxxxx"
SMTP_FROM="noreply@yourdomain.com"
```

### 步骤 2: 重新触发 Jenkins 构建

1. 在 Jenkins 中找到项目
2. 点击 **Build Now** 触发新的构建
3. **重要**：等待构建完成所有阶段，特别是：
   - Write .env from Jenkins Credentials
   - Build
   - Migrate
   - Up

### 步骤 3: 验证配置

构建完成后，运行：

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

## 如果构建完成后仍然没有

### 检查 Jenkins 构建日志

1. 在 Jenkins 中打开最近的一次构建
2. 查看 **Write .env from Jenkins Credentials** 阶段的日志
3. 确认是否有错误信息
4. 可以添加临时验证步骤查看 `.env` 文件内容（不包含敏感信息）：

```groovy
// 在 Jenkinsfile 的 Write .env 阶段后添加
stage('Verify .env') {
  steps {
    sh '''
      if [ -f .env ]; then
        echo "检查 .env 文件中的 SMTP 配置..."
        grep "^SMTP_" .env | sed 's/PASSWORD=.*/PASSWORD=***/' || echo "未找到 SMTP 配置"
      fi
    '''
  }
}
```

### 检查容器启动时的环境变量

```bash
# 检查容器启动参数
docker inspect tripnara-app | grep -A 20 "Env"

# 查找 EnvFile 配置
docker inspect tripnara-app | grep -A 10 "EnvFile"
```

## 快速验证脚本

如果环境变量已加载，但应用仍然报错，可能是配置格式问题。运行：

```bash
docker exec tripnara-app sh -c 'echo "SMTP_HOST=$SMTP_HOST"; echo "SMTP_USER=$SMTP_USER"; echo "SMTP_PASSWORD=${SMTP_PASSWORD:+已设置}${SMTP_PASSWORD:-未设置}"'
```

## 常见问题

### Q: 环境变量未加载

**A**: 
1. 确认 Jenkins Credentials 配置正确
2. 重新触发 Jenkins 构建
3. 检查构建日志

### Q: 配置已添加但容器中还是没有

**A**: 
1. 确认是否重新触发了 Jenkins 构建
2. 确认容器是否已重新创建（使用 `--force-recreate`）
3. 检查 Jenkins 构建日志

### Q: 如何查看 Jenkins 工作目录中的 .env 文件

**A**: 
- Jenkins 构建完成后会删除 `.env` 文件（正常行为）
- 只有在构建过程中 `.env` 文件才存在
- 需要查看构建日志或添加验证步骤

## 下一步操作

1. **立即运行**：`docker exec tripnara-app env | grep SMTP`
2. **如果没有输出**：重新触发 Jenkins 构建
3. **构建完成后**：再次检查环境变量
4. **如果仍然没有**：检查 Jenkins 构建日志
