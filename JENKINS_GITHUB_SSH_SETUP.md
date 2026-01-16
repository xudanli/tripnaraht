# Jenkins GitHub SSH 配置指南

## 问题说明

Jenkins 构建失败，错误信息：`fatal: not in a git directory`

这是因为 Jenkins 容器无法通过 SSH 访问 GitHub 仓库。

## 解决方案

### 步骤 1: 在服务器上配置 Jenkins 容器的 SSH 访问

在服务器上执行以下命令（**在服务器上，不是在 Jenkins 容器内**）：

```bash
# 1. 确保 Jenkins 容器正在运行
docker ps | grep jenkins

# 2. 在 Jenkins 容器内安装 openssh-client 并配置 GitHub SSH
docker exec -u root jenkins bash -c '
set -e
apt-get update >/dev/null 2>&1
apt-get install -y openssh-client >/dev/null 2>&1

# 创建 .ssh 目录
install -d -m 700 -o jenkins -g jenkins /var/jenkins_home/.ssh

# 添加 GitHub 到 known_hosts
ssh-keyscan -t ed25519 github.com >> /var/jenkins_home/.ssh/known_hosts 2>/dev/null
ssh-keyscan -t rsa github.com >> /var/jenkins_home/.ssh/known_hosts 2>/dev/null

# 设置正确的权限
chown -R jenkins:jenkins /var/jenkins_home/.ssh
chmod 644 /var/jenkins_home/.ssh/known_hosts

echo "✅ SSH 配置完成"
'
```

### 步骤 2: 配置 SSH 密钥（两种方式）

#### 方式 A: 使用现有的 SSH 密钥（推荐）

如果您已经有可以访问 GitHub 的 SSH 密钥：

```bash
# 在服务器上，将 SSH 私钥复制到 Jenkins 容器
# 假设您的 SSH 私钥在 /home/deploy/.ssh/id_ed25519
docker cp /home/deploy/.ssh/id_ed25519 jenkins:/var/jenkins_home/.ssh/id_ed25519

# 设置正确的权限
docker exec -u root jenkins bash -c '
chown jenkins:jenkins /var/jenkins_home/.ssh/id_ed25519
chmod 600 /var/jenkins_home/.ssh/id_ed25519
'
```

#### 方式 B: 在 Jenkins Web UI 中配置 SSH 凭证（更安全）

1. 访问 Jenkins Web UI: `http://your-server-ip:8080`
2. 进入 **Manage Jenkins** → **Credentials** → **System** → **Global credentials**
3. 点击 **Add Credentials**
4. 选择类型：**SSH Username with private key**
5. 配置：
   - **ID**: `github-ssh-key`（或您喜欢的名称）
   - **Username**: `git`
   - **Private Key**: 选择 **Enter directly**，粘贴您的 SSH 私钥内容
6. 点击 **Save**

### 步骤 3: 在 Jenkins 项目中配置 Git 仓库

1. 进入 Jenkins 项目配置页面
2. 找到 **Source Code Management** 部分
3. 选择 **Git**
4. 配置：
   - **Repository URL**: `git@github.com:xudanli/tripnaraht.git`
   - **Credentials**: 选择步骤 2 中配置的 SSH 凭证（如果使用方式 B）
   - **Branch**: `*/master`（或您的主分支）

### 步骤 4: 测试 SSH 连接

在 Jenkins 容器内测试 SSH 连接：

```bash
# 测试 GitHub SSH 连接
docker exec -u jenkins jenkins ssh -T git@github.com
```

如果看到类似 `Hi xudanli! You've successfully authenticated...` 的消息，说明配置成功。

### 步骤 5: 清理并重新构建

1. 在 Jenkins Web UI 中，进入项目页面
2. 点击 **Delete Workspace**（如果有）
3. 点击 **Build Now** 重新构建

## 验证配置

执行以下命令验证配置：

```bash
# 检查 known_hosts
docker exec -u jenkins jenkins cat /var/jenkins_home/.ssh/known_hosts | grep github.com

# 检查 SSH 密钥（如果使用方式 A）
docker exec -u jenkins jenkins ls -la /var/jenkins_home/.ssh/

# 测试 SSH 连接
docker exec -u jenkins jenkins ssh -o StrictHostKeyChecking=no -T git@github.com 2>&1 | head -5
```

## 常见问题

### 问题 1: Permission denied (publickey)

**原因**: SSH 密钥未正确配置或权限不正确

**解决**:
```bash
# 检查密钥权限
docker exec -u jenkins jenkins ls -la /var/jenkins_home/.ssh/

# 确保私钥权限为 600
docker exec -u root jenkins chmod 600 /var/jenkins_home/.ssh/id_ed25519
docker exec -u root jenkins chown jenkins:jenkins /var/jenkins_home/.ssh/id_ed25519
```

### 问题 2: Host key verification failed

**原因**: GitHub 的 host key 未添加到 known_hosts

**解决**:
```bash
docker exec -u root jenkins bash -c '
ssh-keyscan -t ed25519 github.com >> /var/jenkins_home/.ssh/known_hosts
ssh-keyscan -t rsa github.com >> /var/jenkins_home/.ssh/known_hosts
chown jenkins:jenkins /var/jenkins_home/.ssh/known_hosts
chmod 644 /var/jenkins_home/.ssh/known_hosts
'
```

### 问题 3: Jenkins 容器重启后配置丢失

**原因**: 如果使用 `docker run` 而不是 `docker-compose`，需要确保卷挂载正确

**解决**: 确保 Jenkins 数据卷正确挂载：
```bash
docker run -d \
  --name jenkins \
  -v jenkins_home:/var/jenkins_home \
  # ... 其他参数
```

## 快速配置脚本

将以下脚本保存为 `setup-jenkins-github.sh` 并在服务器上执行：

```bash
#!/bin/bash
set -e

echo "🔧 配置 Jenkins GitHub SSH 访问..."

# 检查 Jenkins 容器是否运行
if ! docker ps | grep -q jenkins; then
    echo "❌ Jenkins 容器未运行，请先启动 Jenkins"
    exit 1
fi

JENKINS_CONTAINER=$(docker ps | grep jenkins | awk '{print $1}')

# 安装 openssh-client
echo "📦 安装 openssh-client..."
docker exec -u root $JENKINS_CONTAINER bash -c '
apt-get update >/dev/null 2>&1
apt-get install -y openssh-client >/dev/null 2>&1
'

# 配置 SSH
echo "🔑 配置 SSH..."
docker exec -u root $JENKINS_CONTAINER bash -c '
install -d -m 700 -o jenkins -g jenkins /var/jenkins_home/.ssh
ssh-keyscan -t ed25519 github.com >> /var/jenkins_home/.ssh/known_hosts 2>/dev/null
ssh-keyscan -t rsa github.com >> /var/jenkins_home/.ssh/known_hosts 2>/dev/null
chown -R jenkins:jenkins /var/jenkins_home/.ssh
chmod 644 /var/jenkins_home/.ssh/known_hosts
'

# 如果服务器上有 SSH 密钥，复制到 Jenkins
if [ -f ~/.ssh/id_ed25519 ]; then
    echo "📋 复制 SSH 密钥到 Jenkins..."
    docker cp ~/.ssh/id_ed25519 $JENKINS_CONTAINER:/var/jenkins_home/.ssh/id_ed25519
    docker exec -u root $JENKINS_CONTAINER bash -c '
    chown jenkins:jenkins /var/jenkins_home/.ssh/id_ed25519
    chmod 600 /var/jenkins_home/.ssh/id_ed25519
    '
fi

# 测试连接
echo "🧪 测试 GitHub SSH 连接..."
docker exec -u jenkins $JENKINS_CONTAINER ssh -o StrictHostKeyChecking=no -T git@github.com 2>&1 | head -3

echo "✅ 配置完成！"
echo ""
echo "📝 下一步："
echo "1. 如果使用 Jenkins Web UI 配置凭证，请访问 Jenkins → Manage Jenkins → Credentials"
echo "2. 在项目配置中，确保 Repository URL 使用 SSH 格式: git@github.com:xudanli/tripnaraht.git"
echo "3. 重新触发构建"
```

使用方法：
```bash
chmod +x setup-jenkins-github.sh
./setup-jenkins-github.sh
```
