#!/bin/bash

# 简单的API测试脚本（用于快速验证路由）

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_PREFIX="${API_PREFIX:-/api}"

echo "=========================================="
echo "快速API测试"
echo "=========================================="
echo ""

# 测试1: 管理侧 - 获取格陵兰配置
echo "测试1: GET $API_PREFIX/admin/destination-clarification/GL"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL$API_PREFIX/admin/destination-clarification/GL")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo "✅ 成功 (HTTP $http_code)"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
    echo "❌ 失败 (HTTP $http_code)"
    echo "$body"
    echo ""
    echo "⚠️  如果返回404，请完全重启服务："
    echo "   1. 停止服务 (Ctrl+C)"
    echo "   2. 运行: npm run start:dev"
    echo "   3. 等待服务完全启动"
    echo "   4. 重新运行此脚本"
fi

echo ""

# 测试2: 管理侧 - 测试配置
echo "测试2: POST $API_PREFIX/admin/destination-clarification/GL/test"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{
      "currentParams": {
        "destination": "GL",
        "startDate": "2025-07-01",
        "endDate": "2025-07-10",
        "totalBudget": 50000
      },
      "userInput": "我想去格陵兰"
    }' \
    "$BASE_URL$API_PREFIX/admin/destination-clarification/GL/test")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo "✅ 成功 (HTTP $http_code)"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
    echo "❌ 失败 (HTTP $http_code)"
    echo "$body"
fi

echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="
