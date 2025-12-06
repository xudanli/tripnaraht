#!/bin/bash

# 测试脚本：验证货币策略 API
# 使用方法：./test-currency-strategy.sh [COUNTRY_CODE]

BASE_URL="http://localhost:3000"
COUNTRY_CODE="${1:-IS}"

echo "🧪 测试货币策略 API"
echo ""

echo "📋 请求信息："
echo "  URL: GET $BASE_URL/countries/$COUNTRY_CODE/currency-strategy"
echo "  国家代码: $COUNTRY_CODE"
echo ""

echo "📡 发送请求..."
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/countries/$COUNTRY_CODE/currency-strategy")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "📊 响应状态: $HTTP_STATUS"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ 请求成功！"
  echo ""
  echo "📦 返回数据："
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  
  echo ""
  echo "💱 货币信息："
  echo "$BODY" | jq '{
    country: .countryName,
    currency: "\(.currencyCode) (\(.currencyName))",
    rate: .exchangeRateToCNY,
    quickRule: .quickRule
  }' 2>/dev/null || echo "无法解析"
  
  echo ""
  echo "💳 支付策略："
  echo "$BODY" | jq '{
    paymentType: .paymentType,
    advice: .paymentAdvice
  }' 2>/dev/null || echo "无法解析"
  
  echo ""
  echo "📊 快速对照表："
  echo "$BODY" | jq '.quickTable[] | "\(.local) \(.currencyCode) ≈ \(.home) 元"' 2>/dev/null || echo "无法解析"
  
else
  echo "❌ 请求失败"
  echo ""
  echo "错误信息："
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
fi

echo ""
echo "---"
echo "💡 提示："
echo "  测试其他国家：./test-currency-strategy.sh JP"
echo "  查看所有国家：curl -X GET $BASE_URL/countries | jq '.'"

