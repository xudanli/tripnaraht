#!/bin/bash

# 简化的 LLM 测试脚本（不依赖 jq）

BASE_URL="http://localhost:3000"

echo "=== LLM 功能测试 ==="
echo ""

# 测试 1: 自然语言转参数
echo "1. 测试自然语言转参数..."
echo "请求: POST /llm/natural-language-to-params"
echo "输入: '帮我规划带娃去东京5天的行程，预算2万'"
echo ""

RESPONSE=$(curl -s -X POST "$BASE_URL/llm/natural-language-to-params" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "帮我规划带娃去东京5天的行程，预算2万"
  }')

echo "响应:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# 检查是否成功
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✅ 测试通过"
else
    echo "❌ 测试失败"
    echo "错误信息:"
    echo "$RESPONSE" | grep -o '"message":"[^"]*"' || echo "$RESPONSE"
fi
echo ""
echo "---"
echo ""

# 测试 2: 自然语言创建行程
echo "2. 测试自然语言创建行程..."
echo "请求: POST /trips/from-natural-language"
echo "输入: '去日本玩5天，预算2万'"
echo ""

RESPONSE=$(curl -s -X POST "$BASE_URL/trips/from-natural-language" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "去日本玩5天，预算2万"
  }')

echo "响应:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✅ 测试通过"
    TRIP_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$TRIP_ID" ]; then
        echo "创建的行程ID: $TRIP_ID"
    fi
else
    echo "❌ 测试失败"
    echo "错误信息:"
    echo "$RESPONSE" | grep -o '"message":"[^"]*"' || echo "$RESPONSE"
fi
echo ""
echo "---"
echo ""

# 测试 3: 结果人性化转化
echo "3. 测试结果人性化转化..."
echo "请求: POST /llm/humanize-result"
echo ""

RESPONSE=$(curl -s -X POST "$BASE_URL/llm/humanize-result" \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "itinerary_optimization",
    "data": {
      "happinessScore": 85,
      "schedule": {
        "stops": [
          {"kind": "POI", "name": "东京塔", "startMin": 540, "endMin": 660}
        ]
      }
    }
  }')

echo "响应:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✅ 测试通过"
    DESCRIPTION=$(echo "$RESPONSE" | grep -o '"description":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$DESCRIPTION" ]; then
        echo "转化结果: $DESCRIPTION"
    fi
else
    echo "❌ 测试失败"
    echo "错误信息:"
    echo "$RESPONSE" | grep -o '"message":"[^"]*"' || echo "$RESPONSE"
fi
echo ""

echo "=== 测试完成 ==="
