#!/bin/bash
# 验证生产环境配置脚本
# 用于检查容器中的环境变量配置

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 检查生产环境配置..."
echo ""

# 检查容器是否存在
if ! docker ps | grep -q tripnara-app; then
    echo -e "${RED}❌ 容器 tripnara-app 未运行${NC}"
    exit 1
fi

echo "1️⃣ 检查所有环境变量..."
echo ""

# 检查所有环境变量（不包含敏感信息）
ALL_ENV=$(docker exec tripnara-app env 2>/dev/null | sort)

echo "环境变量列表（前20个）："
echo "$ALL_ENV" | head -20
echo ""

echo "2️⃣ 检查关键配置项..."
echo ""

# 检查关键配置
DATABASE_URL=$(docker exec tripnara-app sh -c 'echo $DATABASE_URL' 2>/dev/null || echo "")
SMTP_HOST=$(docker exec tripnara-app sh -c 'echo $SMTP_HOST' 2>/dev/null || echo "")
SMTP_USER=$(docker exec tripnara-app sh -c 'echo $SMTP_USER' 2>/dev/null || echo "")
SMTP_PASSWORD=$(docker exec tripnara-app sh -c 'echo $SMTP_PASSWORD' 2>/dev/null || echo "")
FRONTEND_URL=$(docker exec tripnara-app sh -c 'echo $FRONTEND_URL' 2>/dev/null || echo "")
NODE_ENV=$(docker exec tripnara-app sh -c 'echo $NODE_ENV' 2>/dev/null || echo "")

echo "DATABASE_URL: ${DATABASE_URL:+<已设置>}${DATABASE_URL:-<未设置>}"
echo "SMTP_HOST: ${SMTP_HOST:-<未设置>}"
echo "SMTP_USER: ${SMTP_USER:-<未设置>}"
echo "SMTP_PASSWORD: ${SMTP_PASSWORD:+<已设置>}${SMTP_PASSWORD:-<未设置>}"
echo "FRONTEND_URL: ${FRONTEND_URL:-<未设置>}"
echo "NODE_ENV: ${NODE_ENV:-<未设置>}"
echo ""

# 检查配置完整性
MISSING_CONFIGS=()

if [ -z "$SMTP_HOST" ]; then
    MISSING_CONFIGS+=("SMTP_HOST")
fi
if [ -z "$SMTP_USER" ]; then
    MISSING_CONFIGS+=("SMTP_USER")
fi
if [ -z "$SMTP_PASSWORD" ]; then
    MISSING_CONFIGS+=("SMTP_PASSWORD")
fi

if [ ${#MISSING_CONFIGS[@]} -gt 0 ]; then
    echo -e "${RED}❌ 缺少以下 SMTP 配置：${NC}"
    for config in "${MISSING_CONFIGS[@]}"; do
        echo "  - $config"
    done
    echo ""
    echo "解决方案："
    echo "  1. 登录 Jenkins 控制台"
    echo "  2. 进入 Credentials → tripnara-dotenv-prod"
    echo "  3. 编辑 Secret 内容，添加 SMTP 配置"
    echo "  4. 参考 PRODUCTION_SMTP_SETUP.md 获取详细步骤"
    echo ""
    exit 1
else
    echo -e "${GREEN}✅ SMTP 配置完整${NC}"
fi

echo ""
echo "3️⃣ 检查应用日志..."
echo ""

# 检查应用启动日志中的配置信息
SMTP_LOG=$(docker logs tripnara-app 2>&1 | grep -i "SMTP" | tail -3 || echo "")

if [ -z "$SMTP_LOG" ]; then
    echo -e "${YELLOW}⚠️  未找到 SMTP 相关日志${NC}"
else
    echo "$SMTP_LOG"
fi

echo ""
echo "📋 检查完成！"
