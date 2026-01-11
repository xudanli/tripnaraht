#!/bin/bash
# 检查 SMTP 配置脚本
# 用于诊断生产环境 SMTP 配置问题

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 检查 SMTP 配置..."
echo ""

# 检查容器是否存在
if ! docker ps | grep -q tripnara-app; then
    echo -e "${RED}❌ 容器 tripnara-app 未运行${NC}"
    exit 1
fi

echo "1️⃣ 检查环境变量..."
echo ""

# 检查 SMTP 相关环境变量
SMTP_HOST=$(docker exec tripnara-app sh -c 'echo $SMTP_HOST' 2>/dev/null || echo "")
SMTP_PORT=$(docker exec tripnara-app sh -c 'echo $SMTP_PORT' 2>/dev/null || echo "")
SMTP_USER=$(docker exec tripnara-app sh -c 'echo $SMTP_USER' 2>/dev/null || echo "")
SMTP_PASSWORD=$(docker exec tripnara-app sh -c 'echo $SMTP_PASSWORD' 2>/dev/null || echo "")
SMTP_FROM=$(docker exec tripnara-app sh -c 'echo $SMTP_FROM' 2>/dev/null || echo "")

echo "SMTP_HOST: ${SMTP_HOST:-<未设置>}"
echo "SMTP_PORT: ${SMTP_PORT:-<未设置>}"
echo "SMTP_USER: ${SMTP_USER:-<未设置>}"
echo "SMTP_PASSWORD: ${SMTP_PASSWORD:+<已设置>}${SMTP_PASSWORD:-<未设置>}"
echo "SMTP_FROM: ${SMTP_FROM:-<未设置>}"
echo ""

# 检查配置完整性
if [ -z "$SMTP_USER" ] || [ -z "$SMTP_PASSWORD" ]; then
    echo -e "${RED}❌ SMTP 配置不完整${NC}"
    echo ""
    echo "缺失的配置项："
    [ -z "$SMTP_USER" ] && echo "  - SMTP_USER"
    [ -z "$SMTP_PASSWORD" ] && echo "  - SMTP_PASSWORD"
    echo ""
    echo "请检查："
    echo "  1. Jenkins Credentials 中是否包含 SMTP 配置"
    echo "  2. .env 文件是否正确写入"
    echo "  3. 容器是否重新启动以加载新配置"
    exit 1
else
    echo -e "${GREEN}✅ SMTP 配置已设置${NC}"
fi

echo ""
echo "2️⃣ 检查应用日志..."
echo ""

# 检查应用启动日志中的 SMTP 配置信息
SMTP_LOG=$(docker logs tripnara-app 2>&1 | grep -i "SMTP" | tail -5 || echo "")

if [ -z "$SMTP_LOG" ]; then
    echo -e "${YELLOW}⚠️  未找到 SMTP 相关日志${NC}"
else
    echo "$SMTP_LOG"
fi

echo ""
echo "3️⃣ 测试发送验证码接口..."
echo ""

# 测试接口
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/auth/email/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}' 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP 状态码: $HTTP_CODE"
echo "响应内容: $BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ 接口测试成功${NC}"
elif [ "$HTTP_CODE" = "400" ]; then
    echo -e "${YELLOW}⚠️  接口返回 400${NC}"
    echo "响应内容可能包含错误信息"
else
    echo -e "${RED}❌ 接口测试失败${NC}"
fi

echo ""
echo "📋 诊断完成！"
