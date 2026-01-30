#!/bin/bash
# 简单的测试脚本，用于测试更新路线模板的 requiredNodes

TEMPLATE_ID=${1:-36}
API_BASE_URL=${2:-http://localhost:3000/api}

echo "============================================================"
echo "🧪 测试更新路线模板的 requiredNodes 字段"
echo "============================================================"
echo ""
echo "模板ID: $TEMPLATE_ID"
echo "API地址: $API_BASE_URL"
echo ""

# 检查服务是否运行
echo "🔍 检查服务状态..."
if ! curl -s -f "$API_BASE_URL/route-directions/templates/$TEMPLATE_ID" > /dev/null 2>&1; then
    echo "❌ 服务未运行或无法连接"
    echo "   请先启动服务: npm run start:dev"
    exit 1
fi
echo "✅ 服务运行正常"
echo ""

# 更新模板
echo "📤 发送更新请求..."
UPDATE_RESPONSE=$(curl -s -X PUT "$API_BASE_URL/route-directions/templates/$TEMPLATE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "dayPlans": [
      {
        "day": 1,
        "theme": "测试主题 - 第1天",
        "requiredNodes": ["381117", "381108"]
      },
      {
        "day": 2,
        "theme": "测试主题 - 第2天",
        "requiredNodes": ["381037"]
      },
      {
        "day": 3,
        "theme": "",
        "requiredNodes": []
      },
      {
        "day": 4,
        "theme": "",
        "requiredNodes": []
      },
      {
        "day": 5,
        "theme": "",
        "requiredNodes": []
      }
    ]
  }')

# 检查更新是否成功
if echo "$UPDATE_RESPONSE" | grep -q '"success":true'; then
    echo "✅ 更新成功"
else
    echo "❌ 更新失败"
    echo "$UPDATE_RESPONSE"
    exit 1
fi
echo ""

# 验证保存结果
echo "🔍 验证保存结果..."
GET_RESPONSE=$(curl -s "$API_BASE_URL/route-directions/templates/$TEMPLATE_ID")

# 提取 dayPlans
DAY_PLANS=$(echo "$GET_RESPONSE" | grep -o '"dayPlans":\[.*\]' | head -1)

if echo "$DAY_PLANS" | grep -q '"requiredNodes"'; then
    echo "✅ requiredNodes 字段已保存"
    
    # 检查第1天的 requiredNodes
    if echo "$DAY_PLANS" | grep -q '"381117".*"381108"'; then
        echo "✅ 第1天的 requiredNodes 值正确: [\"381117\", \"381108\"]"
    else
        echo "⚠️  第1天的 requiredNodes 值可能不正确"
    fi
else
    echo "❌ requiredNodes 字段未找到"
    echo "$GET_RESPONSE"
    exit 1
fi

echo ""
echo "============================================================"
echo "✅ 测试完成"
echo "============================================================"
