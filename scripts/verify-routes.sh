#!/bin/bash

# 验证路由是否已注册

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_PREFIX="${API_PREFIX:-/api}"

echo "=========================================="
echo "路由验证"
echo "=========================================="
echo ""

# 检查服务是否运行
if ! curl -s "$BASE_URL" > /dev/null 2>&1; then
    echo "❌ 服务未运行"
    exit 1
fi

echo "✅ 服务运行中"
echo ""

# 检查管理侧路由
echo "检查管理侧路由..."
routes=(
    "/admin/destination-clarification/GL"
    "/admin/destination-clarification/GL/test"
)

all_ok=true
for route in "${routes[@]}"; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$API_PREFIX$route" 2>/dev/null)
    if [ "$status" = "200" ] || [ "$status" = "404" ]; then
        if [ "$status" = "200" ]; then
            echo "✅ $route - 已注册 (200)"
        else
            echo "❌ $route - 未注册 (404)"
            all_ok=false
        fi
    else
        echo "⚠️  $route - 状态码: $status"
    fi
done

echo ""

# 检查用户侧路由（需要认证，只检查路由是否存在）
echo "检查用户侧路由..."
user_routes=(
    "/trips/from-natural-language"
)

for route in "${user_routes[@]}"; do
    status=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"text":"test"}' \
        "$BASE_URL$API_PREFIX$route" 2>/dev/null)
    
    # 401 或 200 都说明路由存在
    if [ "$status" = "401" ] || [ "$status" = "200" ]; then
        echo "✅ $route - 已注册 ($status)"
    elif [ "$status" = "404" ]; then
        echo "❌ $route - 未注册 (404)"
        all_ok=false
    else
        echo "⚠️  $route - 状态码: $status"
    fi
done

echo ""

if [ "$all_ok" = true ]; then
    echo "✅ 所有路由已注册"
else
    echo "❌ 部分路由未注册，请重启服务"
    echo ""
    echo "重启步骤:"
    echo "1. 停止服务 (Ctrl+C)"
    echo "2. 运行: npm run start:dev"
    echo "3. 等待服务完全启动"
    echo "4. 重新运行此脚本验证"
fi
