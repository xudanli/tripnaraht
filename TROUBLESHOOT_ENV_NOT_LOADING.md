# 环境变量未加载问题排查

## 当前状态

✅ 已确认：容器中没有 SMTP 环境变量
```bash
docker exec tripnara-app env | grep SMTP
# 无输出
```

## 排查步骤

### 步骤 1: 确认是否已重新触发 Jenkins 构建

**关键问题**：配置更新后，**必须重新触发 Jenkins 构建**才能生效。

1. 登录 Jenkins 控制台
2. 查看最近的构建时间
3. 如果最近一次构建是在配置更新之前，需要重新触发

**如何触发构建**：
- 点击 **Build Now** 按钮
- 或等待自动触发（如果配置了）

### 步骤 2: 检查 Jenkins 构建日志

如果已经重新触发构建，检查构建日志：

1. 打开最近的一次构建
2. 查看 **Write .env from Jenkins Credentials** 阶段
3. 确认是否有错误信息
4. 查看 **Up** 阶段的日志，确认容器是否重新创建

**关键日志**：
- 应该看到：`✅ .env 文件存在，继续启动容器...`
- 应该看到：`✅ SMTP 环境变量已加载`（如果配置正确）

### 步骤 3: 检查 Jenkins Credentials 配置

确认 Jenkins Credentials 中的配置格式正确：

1. 进入 **Credentials** → **tripnara-dotenv-prod**
2. 检查配置格式：

**✅ 正确格式**：
```bash
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="re_xxxxxxxxxxxxx"
SMTP_FROM="noreply@yourdomain.com"
```

**❌ 错误格式**：
```bash
# 缺少引号
SMTP_PASSWORD=re_xxxxx

# 值被分割到多行
SMTP_PASSWORD="re_xxxxx
xxxxx"

# 变量之间没有换行
SMTP_USER="resend" SMTP_PASSWORD="re_xxxxx"
```

### 步骤 4: 手动验证（如果 Jenkins 构建正在进行）

如果 Jenkins 构建正在进行，可以尝试在 Jenkins 工作目录中检查：

```bash
# 查找 Jenkins 工作目录
find /var/jenkins_home/workspace -name ".env" -type f 2>/dev/null
find /srv/jenkins/workspace -name ".env" -type f 2>/dev/null

# 如果找到，检查内容（隐藏密码）
if [ -f /path/to/.env ]; then
    grep "^SMTP_" /path/to/.env | sed 's/PASSWORD=.*/PASSWORD=***/'
fi
```

**注意**：Jenkins 构建完成后会删除 `.env` 文件，所以只有在构建过程中才能找到。

## 解决方案

### 方案 1: 重新触发 Jenkins 构建（推荐）

1. **确认 Jenkins Credentials 配置正确**
   - 检查格式
   - 确认所有必需变量都已添加

2. **触发新的构建**
   - 在 Jenkins 中点击 **Build Now**
   - 等待构建完成

3. **验证结果**
   ```bash
   docker exec tripnara-app env | grep SMTP
   ```

### 方案 2: 检查 Jenkins 构建日志

如果已经重新触发构建，但环境变量还是没有：

1. **查看构建日志**
   - 打开最近的构建
   - 检查每个阶段的日志

2. **重点关注**：
   - **Write .env from Jenkins Credentials** 阶段
     - 是否有错误？
     - `.env` 文件是否成功写入？
   
   - **Up** 阶段
     - 是否显示 `✅ .env 文件存在`？
     - 是否显示 `✅ SMTP 环境变量已加载`？
     - 容器是否重新创建？

3. **如果看到错误**：
   - 记录错误信息
   - 根据错误信息修复配置

### 方案 3: 临时测试（仅用于调试）

如果需要快速测试，可以在 Jenkins 工作目录手动创建 `.env` 文件：

```bash
# 1. 找到 Jenkins 工作目录（根据实际情况调整）
cd /var/jenkins_home/workspace/tripnara-backend
# 或
cd /srv/jenkins/workspace/tripnara-backend

# 2. 创建 .env 文件（临时测试）
cat > .env << 'EOF'
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="re_xxxxxxxxxxxxx"
SMTP_FROM="noreply@yourdomain.com"
EOF

# 3. 重新创建容器
docker compose down
docker compose up -d --force-recreate

# 4. 验证
docker exec tripnara-app env | grep SMTP
```

**注意**：这只是临时测试，正式部署必须通过 Jenkins。

## 常见问题

### Q: 配置已添加，但构建后还是没有环境变量

**A**: 可能的原因：
1. 配置格式错误（检查引号、换行符）
2. Jenkins Credentials 未保存
3. 构建时 `.env` 文件未正确写入
4. 容器未重新创建（已修复，使用 `--force-recreate`）

**解决**：
1. 检查 Jenkins 构建日志
2. 确认配置格式正确
3. 重新触发构建

### Q: 如何确认 Jenkins Credentials 配置已保存？

**A**: 
1. 编辑 Credentials
2. 检查配置内容
3. 点击 **Save** 保存
4. 再次打开确认配置已保存

### Q: 构建日志显示什么说明配置正确？

**A**: 在 **Up** 阶段应该看到：
```
✅ .env 文件存在，继续启动容器...
验证环境变量...
✅ SMTP 环境变量已加载
```

### Q: 构建日志显示什么说明配置有问题？

**A**: 
- `❌ 错误: .env 文件不存在` → `.env` 文件未写入
- `⚠️  警告: SMTP 环境变量可能未加载` → 环境变量未正确加载
- 没有 `✅ SMTP 环境变量已加载` → 配置可能有问题

## 下一步操作

1. **立即检查**：是否已重新触发 Jenkins 构建？
2. **如果已触发**：查看构建日志，确认是否有错误
3. **如果未触发**：重新触发构建，等待完成
4. **构建完成后**：再次检查环境变量

## 相关文档

- `PRODUCTION_SMTP_SETUP.md` - 生产环境 SMTP 配置指南
- `JENKINS_CREDENTIALS_QUICK_REF.md` - Jenkins Credentials 快速配置参考
- `JENKINS_DEPLOY_AFTER_CONFIG.md` - 配置更新后重新部署指南
- `CHECK_ENV_VARS.md` - 环境变量检查指南
