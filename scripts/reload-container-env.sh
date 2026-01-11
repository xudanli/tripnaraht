#!/bin/bash
# 重新加载容器环境变量脚本
# 用于在 Jenkins Credentials 更新后重新部署容器

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔄 重新加载容器环境变量..."
echo ""

# 检查 Docker Compose 命令
if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker-compose"
elif [ -f /usr/local/bin/docker-compose ]; then
    DOCKER_COMPOSE_CMD="/usr/local/bin/docker-compose"
else
    echo -e "${RED}❌ 错误: 未找到 docker compose 或 docker-compose 命令${NC}"
    exit 1
fi

echo "使用命令: ${DOCKER_COMPOSE_CMD}"
echo ""

# 检查 .env 文件
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  警告: .env 文件不存在${NC}"
    echo "这意味着环境变量配置需要从 Jenkins Credentials 加载"
    echo "请通过 Jenkins 重新部署，而不是直接运行此脚本"
    echo ""
    echo "正确步骤："
    echo "  1. 在 Jenkins 中触发新的构建"
    echo "  2. 等待构建完成"
    echo "  3. 然后验证配置"
    exit 1
fi

echo "1️⃣ 检查 .env 文件中的 SMTP 配置..."
echo ""

if grep -q "^SMTP_" .env; then
    echo -e "${GREEN}✅ .env 文件中包含 SMTP 配置${NC}"
    echo ""
    echo "SMTP 相关配置："
    grep "^SMTP_" .env | sed 's/PASSWORD=.*/PASSWORD=***/'  # 隐藏密码
    echo ""
else
    echo -e "${RED}❌ .env 文件中未找到 SMTP 配置${NC}"
    echo ""
    echo "请检查 Jenkins Credentials 中的配置是否正确"
    exit 1
fi

echo "2️⃣ 重新创建容器（使用新的环境变量）..."
echo ""

# 停止并删除容器
echo "停止容器..."
${DOCKER_COMPOSE_CMD} down 2>/dev/null || true

# 重新创建并启动容器
echo "重新创建容器..."
${DOCKER_COMPOSE_CMD} up -d --remove-orphans

echo ""
echo "3️⃣ 等待容器启动..."
sleep 3

echo ""
echo "4️⃣ 验证环境变量..."
echo ""

# 检查环境变量
SMTP_HOST=$(docker exec tripnara-app sh -c 'echo $SMTP_HOST' 2>/dev/null || echo "")
SMTP_USER=$(docker exec tripnara-app sh -c 'echo $SMTP_USER' 2>/dev/null || echo "")
SMTP_PASSWORD=$(docker exec tripnara-app sh -c 'echo $SMTP_PASSWORD' 2>/dev/null || echo "")

if [ -z "$SMTP_HOST" ] || [ -z "$SMTP_USER" ] || [ -z "$SMTP_PASSWORD" ]; then
    echo -e "${RED}❌ 环境变量仍未加载${NC}"
    echo ""
    echo "可能的原因："
    echo "  1. .env 文件格式不正确"
    echo "  2. docker-compose.yml 未正确配置 env_file"
    echo "  3. 容器启动失败"
    echo ""
    echo "请检查："
    echo "  - .env 文件格式（参考 JENKINS_ENV_FORMAT.md）"
    echo "  - 容器日志: docker logs tripnara-app"
    exit 1
else
    echo -e "${GREEN}✅ 环境变量已成功加载${NC}"
    echo ""
    echo "SMTP 配置："
    echo "  SMTP_HOST: $SMTP_HOST"
    echo "  SMTP_USER: $SMTP_USER"
    echo "  SMTP_PASSWORD: <已设置>"
    echo ""
fi

echo "5️⃣ 检查应用日志..."
echo ""

# 检查应用启动日志
SMTP_LOG=$(docker logs tripnara-app 2>&1 | grep -i "SMTP" | tail -3 || echo "")

if [ -z "$SMTP_LOG" ]; then
    echo -e "${YELLOW}⚠️  未找到 SMTP 相关日志${NC}"
else
    echo "$SMTP_LOG"
fi

echo ""
echo "📋 重新加载完成！"
