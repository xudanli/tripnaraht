#!/bin/bash
# 简单的城市 API 测试脚本

BASE_URL="${1:-http://localhost:3000}"
API_BASE="${BASE_URL}/api"

echo "🧪 测试城市 API 接口"
echo ""
echo "📍 基础 URL: ${BASE_URL}"
echo ""

# 测试场景 1: 获取某个国家的所有城市
echo "📋 测试场景 1: 获取某个国家的所有城市"
echo "   GET ${API_BASE}/cities?countryCode=JP"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" "${API_BASE}/cities?countryCode=JP&limit=5")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    CITY_COUNT=$(echo "$BODY" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data.get('data', {}).get('cities', [])))" 2>/dev/null || echo "0")
    echo "   ✅ 成功: HTTP ${HTTP_CODE}"
    echo "   📍 返回城市数量: ${CITY_COUNT}"
    if [ "$CITY_COUNT" -gt 0 ]; then
        FIRST_CITY=$(echo "$BODY" | python3 -c "import sys, json; data=json.load(sys.stdin); city=data.get('data', {}).get('cities', [{}])[0]; print(f\"{city.get('name', 'N/A')} (${city.get('nameCN', 'N/A')})\")" 2>/dev/null || echo "N/A")
        echo "   📍 示例城市: ${FIRST_CITY}"
    fi
else
    echo "   ❌ 失败: HTTP ${HTTP_CODE}"
    echo "   响应: ${BODY:0:200}"
fi
echo ""

# 测试场景 2: 搜索城市
echo "📋 测试场景 2: 搜索城市"
echo "   GET ${API_BASE}/cities?q=Tokyo&countryCode=JP"
echo ""

SEARCH_TERM="Tokyo"
ENCODED_TERM=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$SEARCH_TERM'))" 2>/dev/null || echo "$SEARCH_TERM")
RESPONSE=$(curl -s -w "\n%{http_code}" "${API_BASE}/cities?q=${ENCODED_TERM}&countryCode=JP&limit=3")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    CITY_COUNT=$(echo "$BODY" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data.get('data', {}).get('cities', [])))" 2>/dev/null || echo "0")
    echo "   ✅ 成功: HTTP ${HTTP_CODE}"
    echo "   📍 找到 ${CITY_COUNT} 个匹配的城市"
    if [ "$CITY_COUNT" -gt 0 ]; then
        echo "   📍 匹配的城市:"
        echo "$BODY" | python3 -c "import sys, json; data=json.load(sys.stdin); [print(f\"      - {city.get('name', 'N/A')} (${city.get('nameCN', 'N/A')}) - ${city.get('countryCode', 'N/A')}\") for city in data.get('data', {}).get('cities', [])]" 2>/dev/null || echo "      (无法解析)"
    fi
else
    echo "   ❌ 失败: HTTP ${HTTP_CODE}"
fi
echo ""

# 测试场景 3: 获取城市详情
echo "📋 测试场景 3: 获取城市详情"
echo "   先获取一个城市 ID..."
echo ""

# 先获取一个城市 ID
LIST_RESPONSE=$(curl -s "${API_BASE}/cities?countryCode=JP&limit=1")
CITY_ID=$(echo "$LIST_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); cities=data.get('data', {}).get('cities', []); print(cities[0].get('id', '') if cities else '')" 2>/dev/null)

if [ -n "$CITY_ID" ]; then
    echo "   GET ${API_BASE}/cities/${CITY_ID}"
    echo ""
    
    RESPONSE=$(curl -s -w "\n%{http_code}" "${API_BASE}/cities/${CITY_ID}")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo "   ✅ 成功: HTTP ${HTTP_CODE}"
        echo "   📍 城市详情:"
        echo "$BODY" | python3 -c "import sys, json; data=json.load(sys.stdin); city=data.get('data', {}); print(f\"      ID: {city.get('id', 'N/A')}\"); print(f\"      名称: {city.get('name', 'N/A')}\"); print(f\"      中文名: {city.get('nameCN', 'N/A')}\"); print(f\"      英文名: {city.get('nameEN', 'N/A')}\"); print(f\"      国家代码: {city.get('countryCode', 'N/A')}\"); lat=city.get('lat'); lng=city.get('lng'); print(f\"      坐标: ({lat}, {lng})\" if lat and lng else \"      坐标: N/A\"); tz=city.get('timezone'); print(f\"      时区: {tz}\" if tz else \"      时区: N/A\")" 2>/dev/null || echo "      (无法解析)"
    else
        echo "   ❌ 失败: HTTP ${HTTP_CODE}"
        echo "   响应: ${BODY:0:200}"
    fi
else
    echo "   ⚠️  未找到城市，跳过详情测试"
fi
echo ""

echo "✅ 测试完成"
