# Jenkins + GitHub + Docker 通信架构和 SSH 密钥配置

## 📊 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     服务器 (Server)                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Jenkins 容器 (Docker Container)                     │   │
│  │                                                       │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  Jenkins 进程                                  │   │   │
│  │  │  - 执行 Pipeline                               │   │   │
│  │  │  - Git Checkout (需要 SSH 密钥)                │   │   │
│  │  │  - 执行 Docker 命令                           │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                                                       │   │
│  │  /var/jenkins_home/.ssh/id_ed25519  ← SSH 密钥      │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          │ Docker Socket                     │
│                          │ /var/run/docker.sock              │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Docker Daemon (服务器上的 Docker)                    │ │
│  │  - 构建镜像                                            │ │
│  │  - 运行容器                                            │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                              │
│  ~/.ssh/id_ed25519  ← 服务器 SSH 密钥（可选）              │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         │ SSH                                │ SSH
         ▼                                    ▼
┌─────────────────┐                  ┌─────────────────┐
│   GitHub        │                  │   其他服务       │
│  git@github.com │                  │   (如果需要)     │
└─────────────────┘                  └─────────────────┘
```

## 🔑 SSH 密钥配置说明

### 1. **Jenkins 容器 → GitHub**（必需）

**用途**: Jenkins 从 GitHub 拉取代码（`checkout scm`）

**配置位置**: 
- Jenkins 容器内: `/var/jenkins_home/.ssh/id_ed25519`
- 或者通过 Jenkins Web UI 配置凭证

**配置方式**:

#### 方式 A: 直接复制密钥到容器（简单但不推荐用于生产）

```bash
# 在服务器上执行
docker cp ~/.ssh/id_ed25519 jenkins:/var/jenkins_home/.ssh/id_ed25519
docker exec -u root jenkins bash -c '
chown jenkins:jenkins /var/jenkins_home/.ssh/id_ed25519
chmod 600 /var/jenkins_home/.ssh/id_ed25519
'
```

#### 方式 B: 通过 Jenkins Web UI 配置（推荐，更安全）

1. 在服务器上查看私钥：
   ```bash
   cat ~/.ssh/id_ed25519
   ```

2. 在 Jenkins Web UI 中：
   - **Manage Jenkins** → **Credentials** → **System** → **Global credentials**
   - **Add Credentials**
   - **Kind**: `SSH Username with private key`
   - **ID**: `github-ssh-key`
   - **Username**: `git`
   - **Private Key**: 选择 **Enter directly**，粘贴私钥内容

3. 在项目配置中使用：
   - **Repository URL**: `git@github.com:xudanli/tripnaraht.git`
   - **Credentials**: 选择 `github-ssh-key`

### 2. **服务器 → GitHub**（可选）

**用途**: 如果您直接在服务器上操作 Git（非必需）

**配置位置**: `~/.ssh/id_ed25519`（服务器上）

**配置方式**: 
- 如果已经配置，可以直接使用
- 如果没有，可以生成新的：
  ```bash
  ssh-keygen -t ed25519 -C "server@tripnara"
  cat ~/.ssh/id_ed25519.pub
  # 将公钥添加到 GitHub
  ```

### 3. **Jenkins 容器 → Docker**（不需要 SSH）

**通信方式**: Docker Socket 挂载

**配置**: 在创建 Jenkins 容器时已经配置：
```bash
-v /var/run/docker.sock:/var/run/docker.sock
```

**说明**: 
- Jenkins 容器内的 `docker` 命令通过 Docker Socket 与服务器上的 Docker Daemon 通信
- 这是本地通信，不需要 SSH
- 需要确保 Jenkins 容器内的用户有权限访问 Docker Socket

## 🔄 完整通信流程

### 场景 1: Jenkins 构建 Pipeline

```
1. 用户触发 Jenkins 构建
   ↓
2. Jenkins Pipeline 执行 `checkout scm`
   ↓
3. Jenkins 使用 SSH 密钥连接 GitHub
   ├─ 如果使用容器内密钥: /var/jenkins_home/.ssh/id_ed25519
   └─ 如果使用 Jenkins 凭证: 从凭证库读取
   ↓
4. 从 GitHub 拉取代码到 Jenkins 工作空间
   ↓
5. Jenkins 执行 `docker compose build`
   ↓
6. Docker 命令通过 Docker Socket 发送到服务器上的 Docker Daemon
   ↓
7. Docker Daemon 构建镜像
   ↓
8. Jenkins 执行 `docker compose up`
   ↓
9. Docker Daemon 启动容器
```

### 场景 2: 直接在服务器上操作 Git

```
1. 在服务器上执行 `git pull`
   ↓
2. 使用服务器上的 SSH 密钥: ~/.ssh/id_ed25519
   ↓
3. 连接 GitHub 拉取代码
```

## 📝 密钥配置检查清单

### ✅ Jenkins 容器 → GitHub

```bash
# 1. 检查容器内是否有 SSH 密钥
docker exec -u jenkins jenkins ls -la /var/jenkins_home/.ssh/

# 2. 检查 known_hosts
docker exec -u jenkins jenkins cat /var/jenkins_home/.ssh/known_hosts | grep github

# 3. 测试 SSH 连接
docker exec -u jenkins jenkins ssh -T git@github.com
```

### ✅ Jenkins 容器 → Docker

```bash
# 1. 检查 Docker Socket 挂载
docker inspect jenkins | grep -A 5 "docker.sock"

# 2. 测试 Docker 命令
docker exec -u root jenkins docker version

# 3. 检查权限
docker exec -u root jenkins ls -la /var/run/docker.sock
```

### ✅ 服务器 → GitHub（可选）

```bash
# 1. 检查服务器上的 SSH 密钥
ls -la ~/.ssh/

# 2. 测试连接
ssh -T git@github.com
```

## 🛠️ 完整配置命令

### 一次性配置所有必需项

```bash
#!/bin/bash
# 配置 Jenkins 容器访问 GitHub 和 Docker

# 1. 确保 Jenkins 容器运行
if ! docker ps | grep -q jenkins; then
    echo "❌ Jenkins 容器未运行"
    exit 1
fi

# 2. 配置 SSH（GitHub 访问）
echo "🔑 配置 SSH 访问 GitHub..."
docker exec -u root jenkins bash -c '
apt-get update >/dev/null 2>&1
apt-get install -y openssh-client >/dev/null 2>&1
install -d -m 700 -o jenkins -g jenkins /var/jenkins_home/.ssh
ssh-keyscan -t ed25519 github.com >> /var/jenkins_home/.ssh/known_hosts 2>/dev/null
ssh-keyscan -t rsa github.com >> /var/jenkins_home/.ssh/known_hosts 2>/dev/null
chown -R jenkins:jenkins /var/jenkins_home/.ssh
chmod 644 /var/jenkins_home/.ssh/known_hosts
'

# 3. 复制 SSH 密钥（如果服务器上有）
if [ -f ~/.ssh/id_ed25519 ]; then
    echo "📋 复制 SSH 密钥到 Jenkins..."
    docker cp ~/.ssh/id_ed25519 jenkins:/var/jenkins_home/.ssh/id_ed25519
    docker exec -u root jenkins bash -c '
    chown jenkins:jenkins /var/jenkins_home/.ssh/id_ed25519
    chmod 600 /var/jenkins_home/.ssh/id_ed25519
    '
fi

# 4. 配置 Docker 访问（确保 Docker Socket 已挂载）
echo "🐳 检查 Docker 访问..."
if docker exec -u root jenkins docker version >/dev/null 2>&1; then
    echo "✅ Docker 访问正常"
else
    echo "⚠️  Docker 访问可能有问题，检查 Docker Socket 挂载"
fi

# 5. 验证配置
echo ""
echo "🧪 验证配置..."
echo "--- GitHub SSH 连接 ---"
docker exec -u jenkins jenkins ssh -T git@github.com 2>&1 | head -3

echo ""
echo "--- Docker 访问 ---"
docker exec -u root jenkins docker version 2>&1 | head -5
```

## 🔐 安全建议

1. **使用 Jenkins 凭证管理 SSH 密钥**（而不是直接复制到容器）
2. **为 Jenkins 生成专用的 SSH 密钥**（不要复用个人密钥）
3. **定期轮换 SSH 密钥**
4. **限制 SSH 密钥权限**（只给必要的仓库访问权限）
5. **使用 Docker Socket 而不是 SSH 访问 Docker**（已配置）

## ❓ 常见问题

### Q: 为什么 Jenkins 容器内需要 SSH 密钥？

A: Jenkins 需要从 GitHub 拉取代码，GitHub 使用 SSH 协议时需要密钥认证。

### Q: 为什么不需要 SSH 访问 Docker？

A: Docker 通过本地 Socket 通信，不需要网络连接，所以不需要 SSH。

### Q: 服务器上的 SSH 密钥和 Jenkins 容器内的密钥可以不同吗？

A: 可以，它们是独立的。Jenkins 容器内的密钥只需要能访问 GitHub 仓库即可。

### Q: 如果使用 HTTPS 而不是 SSH 访问 GitHub 呢？

A: 可以使用 HTTPS + Personal Access Token，但 SSH 更安全且方便。
