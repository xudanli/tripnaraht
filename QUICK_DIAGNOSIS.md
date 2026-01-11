# 快速诊断环境变量问题

## 如果诊断脚本不存在

如果看到 `No such file or directory` 错误，可能是因为：

1. **不在项目目录中**
2. **代码未更新**（需要 `git pull`）

## 快速检查步骤

### 1. 检查当前目录和项目位置

```bash
# 检查当前目录
pwd

# 查找项目目录（可能的路径）
ls -la ~/project
ls -la /home/deploy/project
ls -la /var/jenkins_home/workspace/*/scripts 2>/dev/null
ls -la /srv/jenkins/workspace/*/scripts 2>/dev/null
```

### 2. 手动检查环境变量（无需脚本）

```bash
# 检查容器中的环境变量
docker exec tripnara-app env | grep SMTP

# 如果没有输出，说明配置未加载
```

### 3. 检查容器状态

```bash
# 检查容器是否运行
docker ps | grep tripnara-app

# 检查容器日志
docker logs tripnara-app --tail 50 | grep -i smtp
```

### 4. 如果脚本不存在，直接检查

```bash
# 1. 检查容器中的环境变量
echo "=== 检查容器环境变量 ==="
docker exec tripnara-app env | grep SMTP

# 2. 检查容器启动参数
echo "=== 检查容器配置 ==="
docker inspect tripnara-app | grep -A 10 "EnvFile"

# 3. 检查应用日志
echo "=== 检查应用日志 ==="
docker logs tripnara-app 2>&1 | grep -i "SMTP" | tail -5

# 4. 检查 docker-compose.yml（如果在项目目录）
if [ -f docker-compose.yml ]; then
    echo "=== 检查 docker-compose.yml ==="
    grep -A 2 "env_file:" docker-compose.yml
fi
```

## 如果需要脚本，先更新代码

```bash
# 进入项目目录（根据实际情况调整路径）
cd ~/project
# 或
cd /var/jenkins_home/workspace/tripnara-backend
# 或
cd /srv/jenkins/workspace/tripnara-backend

# 拉取最新代码
git pull origin master

# 检查脚本是否存在
ls -la scripts/diagnose-env-issue.sh

# 运行脚本
chmod +x scripts/diagnose-env-issue.sh
./scripts/diagnose-env-issue.sh
```

## 直接检查配置（推荐，无需脚本）

如果不想更新代码，可以直接运行以下命令：

```bash
echo "========== 环境变量诊断 =========="
echo ""
echo "1. 容器状态："
docker ps | grep tripnara-app || echo "❌ 容器未运行"
echo ""
echo "2. SMTP 环境变量："
docker exec tripnara-app env 2>/dev/null | grep SMTP || echo "❌ 未找到 SMTP 环境变量"
echo ""
echo "3. 应用日志（SMTP 相关）："
docker logs tripnara-app 2>&1 | grep -i smtp | tail -5 || echo "未找到相关日志"
echo ""
echo "========== 诊断完成 =========="
```

## 问题排查

### 如果容器中没有 SMTP 环境变量

**原因**：
1. Jenkins Credentials 中未配置 SMTP
2. Jenkins 构建时未正确加载配置
3. 容器未重新创建（使用旧配置）

**解决**：
1. 检查 Jenkins Credentials 配置
2. 重新触发 Jenkins 构建
3. 等待构建完成
4. 再次检查环境变量

### 如果 Jenkins 构建日志显示错误

**检查 Jenkins 构建日志**：
1. 登录 Jenkins
2. 查看最近的构建
3. 检查 "Write .env from Jenkins Credentials" 阶段
4. 检查是否有错误信息

## 相关文档

- `PRODUCTION_SMTP_SETUP.md` - 生产环境 SMTP 配置指南
- `JENKINS_CREDENTIALS_QUICK_REF.md` - Jenkins Credentials 快速配置参考
- `JENKINS_DEPLOY_AFTER_CONFIG.md` - 配置更新后重新部署指南
