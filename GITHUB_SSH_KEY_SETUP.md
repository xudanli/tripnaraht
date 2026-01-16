# GitHub SSH 密钥配置指南

## 📋 概述

Jenkins Web UI 中配置的是 **SSH 私钥**，GitHub 端需要配置对应的 **SSH 公钥**。

**通常只需要配置 1 把密钥**（一个 SSH 密钥对包含一个私钥和一个公钥）

## 🔍 步骤 1: 确认 Jenkins 中使用的密钥

### 方式 A: 如果使用的是服务器上现有的密钥

```bash
# 在服务器上查看公钥
cat ~/.ssh/id_ed25519.pub

# 或者如果是 RSA 密钥
cat ~/.ssh/id_rsa.pub
```

### 方式 B: 如果 Jenkins 中配置的是新生成的密钥

需要找到对应的公钥文件（通常是 `.pub` 后缀）

## 🔑 步骤 2: 检查 GitHub 上是否已有该公钥

1. 访问 GitHub: https://github.com/settings/keys
2. 查看 **SSH keys** 列表
3. 检查是否有对应的公钥（可以通过公钥的注释部分识别，通常是邮箱或描述）

## ➕ 步骤 3: 添加公钥到 GitHub（如果没有）

### 方法 1: 通过 GitHub Web UI（推荐）

1. 访问: https://github.com/settings/ssh/new
2. **Title**: 输入描述，如 `Jenkins Server` 或 `TripNara Jenkins`
3. **Key**: 粘贴公钥内容（从 `cat ~/.ssh/id_ed25519.pub` 的输出）
4. 点击 **Add SSH key**

### 方法 2: 通过 GitHub CLI（如果已安装）

```bash
gh ssh-key add ~/.ssh/id_ed25519.pub --title "Jenkins Server"
```

## ✅ 步骤 4: 验证配置

### 在服务器上测试

```bash
# 测试 SSH 连接
ssh -T git@github.com
```

应该看到类似输出：
```
Hi xudanli! You've successfully authenticated, but GitHub does not provide shell access.
```

### 在 Jenkins 容器内测试

```bash
# 测试 Jenkins 容器的 SSH 连接
docker exec -u jenkins jenkins ssh -T git@github.com
```

## 📊 密钥配置总结

### 需要配置的密钥数量

**通常只需要 1 把密钥**，但根据使用场景可能有不同：

| 场景 | 密钥数量 | 说明 |
|------|---------|------|
| **单一服务器 + 单一 GitHub 账户** | 1 把 | 服务器和 Jenkins 共用同一把密钥 |
| **多服务器 + 单一 GitHub 账户** | 每台服务器 1 把 | 每台服务器有自己的密钥 |
| **单一服务器 + 多 GitHub 账户** | 每个账户 1 把 | 需要配置 SSH config 区分 |

### 您的场景（推荐配置）

**推荐：1 把密钥**

```
服务器上的密钥 (~/.ssh/id_ed25519)
    ├─ 私钥: ~/.ssh/id_ed25519 (用于 Jenkins Web UI 配置)
    └─ 公钥: ~/.ssh/id_ed25519.pub (添加到 GitHub)
```

## 🔐 安全建议

### 1. 使用专用密钥（推荐）

为 Jenkins 生成专用的 SSH 密钥，不要复用个人密钥：

```bash
# 生成专用密钥
ssh-keygen -t ed25519 -C "jenkins@tripnara-server" -f ~/.ssh/jenkins_github_ed25519 -N ""

# 查看公钥
cat ~/.ssh/jenkins_github_ed25519.pub

# 添加到 GitHub，然后在 Jenkins Web UI 中使用私钥
cat ~/.ssh/jenkins_github_ed25519
```

### 2. 限制密钥权限（如果使用 GitHub Deploy Keys）

如果只需要访问特定仓库，可以使用 **Deploy Keys**（只读或读写权限）：

1. 进入仓库: https://github.com/xudanli/tripnaraht/settings/keys
2. 点击 **Add deploy key**
3. **Title**: `Jenkins Deploy Key`
4. **Key**: 粘贴公钥
5. **Allow write access**: 根据需要勾选（如果只需要拉取代码，不勾选）

### 3. 使用 GitHub App（高级，可选）

对于更复杂的场景，可以使用 GitHub App，但通常 SSH 密钥就足够了。

## 🛠️ 快速检查清单

```bash
# 1. 检查服务器上的密钥
ls -la ~/.ssh/id_*

# 2. 查看公钥内容
cat ~/.ssh/id_ed25519.pub

# 3. 测试服务器到 GitHub 的连接
ssh -T git@github.com

# 4. 测试 Jenkins 容器到 GitHub 的连接
docker exec -u jenkins jenkins ssh -T git@github.com

# 5. 检查 GitHub 上的密钥列表
# 访问: https://github.com/settings/keys
```

## ❓ 常见问题

### Q: 需要配置几把密钥？

**A: 通常只需要 1 把密钥**（一个密钥对：私钥 + 公钥）

- 私钥：配置在 Jenkins Web UI 中
- 公钥：添加到 GitHub

### Q: 如果服务器上有多个密钥怎么办？

**A: 确认 Jenkins 中配置的是哪一把，然后确保对应的公钥在 GitHub 上**

```bash
# 查看所有公钥
for key in ~/.ssh/*.pub; do
    echo "=== $key ==="
    cat "$key"
    echo ""
done
```

### Q: 可以使用同一个密钥访问多个 GitHub 仓库吗？

**A: 可以**，如果密钥添加到 GitHub 账户的 SSH keys，可以访问所有有权限的仓库。

### Q: Deploy Key 和 SSH Key 的区别？

- **SSH Key**（账户级别）：添加到 GitHub 账户，可以访问所有有权限的仓库
- **Deploy Key**（仓库级别）：只针对特定仓库，更安全但需要为每个仓库单独配置

## 📝 完整配置流程

```bash
# 1. 在服务器上生成密钥（如果还没有）
ssh-keygen -t ed25519 -C "jenkins@tripnara" -f ~/.ssh/jenkins_github

# 2. 查看公钥
cat ~/.ssh/jenkins_github.pub

# 3. 复制公钥内容，添加到 GitHub:
#    https://github.com/settings/ssh/new

# 4. 在 Jenkins Web UI 中配置私钥:
#    Manage Jenkins → Credentials → Add Credentials
#    Kind: SSH Username with private key
#    Private Key: 粘贴 ~/.ssh/jenkins_github 的内容

# 5. 在项目配置中使用该凭证

# 6. 测试
docker exec -u jenkins jenkins ssh -T git@github.com
```

## 🎯 您的下一步操作

1. **确认 Jenkins 中配置的密钥**：
   - 如果使用的是 `~/.ssh/id_ed25519`，查看公钥：`cat ~/.ssh/id_ed25519.pub`
   - 如果使用的是其他密钥，找到对应的公钥文件

2. **检查 GitHub 上是否已有该公钥**：
   - 访问：https://github.com/settings/keys
   - 查看列表中的公钥

3. **如果没有，添加公钥**：
   - 访问：https://github.com/settings/ssh/new
   - 粘贴公钥内容

4. **验证**：
   ```bash
   ssh -T git@github.com
   ```

**总结：通常只需要在 GitHub 上配置 1 把公钥**（对应 Jenkins 中配置的私钥）
