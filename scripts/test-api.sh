#!/bin/bash
# API 接口测试脚本
# 用于测试后端 API 是否正常工作

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 开始测试 API 接口..."
echo ""

# 1. 检查容器是否运行
echo "1️⃣ 检查应用容器状态..."
if docker ps | grep -q tripnara-app; then
    echo -e "${GREEN}✅ 应用容器正在运行${NC}"
    docker ps | grep tripnara-app
else
    echo -e "${RED}❌ 应用容器未运行${NC}"
    echo "请检查容器状态: docker ps -a | grep tripnara"
    exit 1
fi
echo ""

# 2. 检查容器日志
echo "2️⃣ 检查应用容器日志（最近 20 行）..."
docker logs --tail 20 tripnara-app 2>&1 | tail -20
echo ""

# 3. 测试本地端口（容器内）
echo "3️⃣ 测试容器内端口 3000..."
if docker exec tripnara-app wget -q --spider http://localhost:3000/api/system/status 2>/dev/null || \
   docker exec tripnara-app curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/system/status | grep -q "200\|404"; then
    echo -e "${GREEN}✅ 容器内端口 3000 可访问${NC}"
else
    echo -e "${YELLOW}⚠️  无法在容器内访问端口 3000（可能应用未启动）${NC}"
fi
echo ""

# 4. 测试本地端口（宿主机）
echo "4️⃣ 测试宿主机端口 3000..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/system/status | grep -q "200\|404"; then
    echo -e "${GREEN}✅ 宿主机端口 3000 可访问${NC}"
    echo "响应:"
    curl -s http://localhost:3000/api/system/status | head -5
else
    echo -e "${RED}❌ 宿主机端口 3000 不可访问${NC}"
    echo "可能原因："
    echo "  - 应用未启动"
    echo "  - 端口映射问题"
    echo "  - 防火墙阻止"
fi
echo ""

# 5. 测试认证接口
echo "5️⃣ 测试认证接口 /api/auth/email/send-code..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/auth/email/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}' 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ 接口返回 200${NC}"
    echo "响应体: $BODY"
elif [ "$HTTP_CODE" = "400" ]; then
    echo -e "${YELLOW}⚠️  接口返回 400（可能是业务逻辑错误，但接口可访问）${NC}"
    echo "响应体: $BODY"
elif [ "$HTTP_CODE" = "500" ]; then
    echo -e "${RED}❌ 接口返回 500（服务器内部错误）${NC}"
    echo "响应体: $BODY"
    echo ""
    echo "请检查："
    echo "  - 应用日志: docker logs tripnara-app"
    echo "  - 数据库连接是否正常"
    echo "  - 环境变量配置是否正确"
else
    echo -e "${RED}❌ 接口返回 $HTTP_CODE${NC}"
    echo "响应体: $BODY"
fi
echo ""

# 6. 检查 nginx 配置（如果存在）
echo "6️⃣ 检查 nginx 配置..."
if command -v nginx >/dev/null 2>&1; then
    if nginx -t 2>/dev/null; then
        echo -e "${GREEN}✅ Nginx 配置有效${NC}"
    else
        echo -e "${YELLOW}⚠️  Nginx 配置可能有误${NC}"
        nginx -t
    fi
else
    echo "ℹ️  Nginx 未安装或不在 PATH 中"
fi
echo ""

# 7. 测试通过 nginx（如果配置了）
if [ -f /etc/nginx/sites-enabled/tripnara-api.conf ] || [ -f /etc/nginx/conf.d/tripnara-api.conf ]; then
    echo "7️⃣ 测试通过 Nginx 代理..."
    if curl -s -o /dev/null -w "%{http_code}" http://localhost/api/system/status | grep -q "200\|404"; then
        echo -e "${GREEN}✅ 通过 Nginx 代理可访问${NC}"
    else
        echo -e "${YELLOW}⚠️  通过 Nginx 代理不可访问${NC}"
    fi
fi

echo ""
echo "📋 测试完成！"
