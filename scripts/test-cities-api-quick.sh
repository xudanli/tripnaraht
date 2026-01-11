#!/bin/bash
# 快速测试不同国家的城市API

BASE_URL="${1:-http://localhost:3000}"
API_URL="${BASE_URL}/api/cities"

echo "=== 测试城市API（不同国家）==="
echo "API 地址: $API_URL"
echo ""

test_country() {
  local country_code=$1
  local country_name=$2
  
  echo "--- 测试: $country_name ($country_code) ---"
  response=$(curl -s "${API_URL}?countryCode=${country_code}&limit=5")
  
  # 检查响应
  if echo "$response" | jq -e '.success == true' > /dev/null 2>&1; then
    city_count=$(echo "$response" | jq '.data.cities | length')
    echo "✅ 成功: 返回 $city_count 个城市"
    
    # 显示前3个城市
    echo "前3个城市:"
    echo "$response" | jq -r '.data.cities[0:3] | .[] | "  - \(.nameCN // .nameEN // .name) [\(.countryCode)]"'
    
    # 验证国家代码
    wrong_country=$(echo "$response" | jq -r ".data.cities[] | select(.countryCode != \"${country_code}\") | .countryCode" | sort -u)
    if [ -n "$wrong_country" ]; then
      echo "❌ 错误！返回了其他国家的城市: $wrong_country"
    else
      echo "✅ 所有城市的国家代码都正确"
    fi
  else
    echo "❌ 失败: API 返回错误"
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
  fi
  echo ""
}

# 测试不同国家
test_country "CN" "中国"
test_country "JP" "日本"
test_country "IS" "冰岛"
test_country "US" "美国"
test_country "AE" "阿联酋"
test_country "AD" "安道尔"

echo "=== 测试完成 ==="
