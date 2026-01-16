#!/bin/bash
set -e

echo "🔧 配置 Jenkins GitHub SSH 访问..."

# 检查 Jenkins 容器是否运行
if ! docker ps | grep -q jenkins; then
    echo "❌ Jenkins 容器未运行，请先启动 Jenkins"
    exit 1
fi

JENKINS_CONTAINER=$(docker ps --format '{{.Names}}' | grep jenkins | head -1)

if [ -z "$JENKINS_CONTAINER" ]; then
    echo "❌ 未找到 Jenkins 容器"
    exit 1
fi

echo "📦 使用容器: $JENKINS_CONTAINER"

# 安装 openssh-client（如果还没有）
echo "📦 检查并安装 openssh-client..."
docker exec -u root $JENKINS_CONTAINER bash -c '
if ! command -v ssh >/dev/null 2>&1; then
    apt-get update >/dev/null 2>&1
    apt-get install -y openssh-client >/dev/null 2>&1
fi
'

# 配置 SSH 目录和 known_hosts
echo "🔑 配置 SSH 目录和 known_hosts..."
docker exec -u root $JENKINS_CONTAINER bash -c '
install -d -m 700 -o jenkins -g jenkins /var/jenkins_home/.ssh
ssh-keyscan -t ed25519 github.com >> /var/jenkins_home/.ssh/known_hosts 2>/dev/null || true
ssh-keyscan -t rsa github.com >> /var/jenkins_home/.ssh/known_hosts 2>/dev/null || true
chown -R jenkins:jenkins /var/jenkins_home/.ssh
chmod 644 /var/jenkins_home/.ssh/known_hosts
'

# 检查服务器上是否有 SSH 密钥
echo "🔍 检查服务器上的 SSH 密钥..."
if [ -f ~/.ssh/id_ed25519 ]; then
    echo "✅ 找到 SSH 密钥: ~/.ssh/id_ed25519"
    echo "📋 复制 SSH 密钥到 Jenkins..."
    docker cp ~/.ssh/id_ed25519 $JENKINS_CONTAINER:/var/jenkins_home/.ssh/id_ed25519
    docker exec -u root $JENKINS_CONTAINER bash -c '
    chown jenkins:jenkins /var/jenkins_home/.ssh/id_ed25519
    chmod 600 /var/jenkins_home/.ssh/id_ed25519
    '
    echo "✅ SSH 密钥已复制"
elif [ -f ~/.ssh/id_rsa ]; then
    echo "✅ 找到 SSH 密钥: ~/.ssh/id_rsa"
    echo "📋 复制 SSH 密钥到 Jenkins..."
    docker cp ~/.ssh/id_rsa $JENKINS_CONTAINER:/var/jenkins_home/.ssh/id_rsa
    docker exec -u root $JENKINS_CONTAINER bash -c '
    chown jenkins:jenkins /var/jenkins_home/.ssh/id_rsa
    chmod 600 /var/jenkins_home/.ssh/id_rsa
    '
    echo "✅ SSH 密钥已复制"
else
    echo "⚠️  未找到 SSH 密钥 (~/.ssh/id_ed25519 或 ~/.ssh/id_rsa)"
    echo "📝 请选择以下方式之一："
    echo "   1. 在服务器上生成新的 SSH 密钥对"
    echo "   2. 在 Jenkins Web UI 中配置 SSH 凭证（推荐）"
    echo ""
    echo "   方式 1 - 生成新密钥："
    echo "   ssh-keygen -t ed25519 -C 'jenkins@tripnara' -f ~/.ssh/jenkins_ed25519"
    echo "   # 然后将公钥添加到 GitHub: cat ~/.ssh/jenkins_ed25519.pub"
    echo ""
    echo "   方式 2 - 使用 Jenkins Web UI："
    echo "   访问 Jenkins → Manage Jenkins → Credentials → Add Credentials"
    echo "   选择 'SSH Username with private key'"
fi

# 验证配置
echo ""
echo "🧪 验证配置..."
echo "--- known_hosts ---"
docker exec -u jenkins $JENKINS_CONTAINER cat /var/jenkins_home/.ssh/known_hosts 2>/dev/null | grep github.com | head -2 || echo "⚠️  known_hosts 未配置"

echo ""
echo "--- SSH 密钥 ---"
docker exec -u jenkins $JENKINS_CONTAINER ls -la /var/jenkins_home/.ssh/ 2>/dev/null | grep -E "id_|^-" || echo "⚠️  未找到 SSH 密钥"

echo ""
echo "--- 测试 GitHub SSH 连接 ---"
docker exec -u jenkins $JENKINS_CONTAINER ssh -o StrictHostKeyChecking=no -T git@github.com 2>&1 | head -3 || echo "⚠️  SSH 连接测试失败"

echo ""
echo "✅ 配置脚本执行完成！"
echo ""
echo "📝 下一步："
echo "1. 如果 SSH 密钥已配置，在 Jenkins Web UI 中："
echo "   - 进入项目配置"
echo "   - 确保 Repository URL 使用: git@github.com:xudanli/tripnaraht.git"
echo "   - 如果使用 Jenkins 凭证，选择对应的 SSH 凭证"
echo ""
echo "2. 重新触发构建"
