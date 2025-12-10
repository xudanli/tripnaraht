#!/bin/bash

# 测试国内航班价格估算 API

BASE_URL="http://localhost:3000"

# URL 编码函数
urlencode() {
  python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$1"
}

echo "🧪 测试国内航班价格估算 API"
echo "================================"
echo ""

# 1. 测试获取周内因子
echo "1️⃣ 获取周内因子（周一至周日）"
echo "--------------------------------"
curl -s "${BASE_URL}/flight-prices/day-of-week-factors" | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False))" 2>/dev/null || curl -s "${BASE_URL}/flight-prices/day-of-week-factors"
echo ""
echo ""

# 2. 测试估算价格（成都->深圳，1月，周一）
echo "2️⃣ 估算价格：成都 -> 深圳，1月，周一（dayOfWeek=0）"
echo "--------------------------------"
ORIGIN=$(urlencode "成都")
DEST=$(urlencode "深圳")
curl -s "${BASE_URL}/flight-prices/domestic/estimate?originCity=${ORIGIN}&destinationCity=${DEST}&month=1&dayOfWeek=0" | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False))" 2>/dev/null || curl -s "${BASE_URL}/flight-prices/domestic/estimate?originCity=${ORIGIN}&destinationCity=${DEST}&month=1&dayOfWeek=0"
echo ""
echo ""

# 3. 测试估算价格（成都->深圳，3月，周五）
echo "3️⃣ 估算价格：成都 -> 深圳，3月，周五（dayOfWeek=4）"
echo "--------------------------------"
curl -s "${BASE_URL}/flight-prices/domestic/estimate?originCity=${ORIGIN}&destinationCity=${DEST}&month=3&dayOfWeek=4" | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False))" 2>/dev/null || curl -s "${BASE_URL}/flight-prices/domestic/estimate?originCity=${ORIGIN}&destinationCity=${DEST}&month=3&dayOfWeek=4"
echo ""
echo ""

# 4. 测试估算价格（上海->乌鲁木齐，1月，周二）
echo "4️⃣ 估算价格：上海 -> 乌鲁木齐，1月，周二（dayOfWeek=1）"
echo "--------------------------------"
ORIGIN2=$(urlencode "上海")
DEST2=$(urlencode "乌鲁木齐")
curl -s "${BASE_URL}/flight-prices/domestic/estimate?originCity=${ORIGIN2}&destinationCity=${DEST2}&month=1&dayOfWeek=1" | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False))" 2>/dev/null || curl -s "${BASE_URL}/flight-prices/domestic/estimate?originCity=${ORIGIN2}&destinationCity=${DEST2}&month=1&dayOfWeek=1"
echo ""
echo ""

# 5. 测试估算价格（不指定星期几）
echo "5️⃣ 估算价格：成都 -> 深圳，3月（不指定星期几）"
echo "--------------------------------"
curl -s "${BASE_URL}/flight-prices/domestic/estimate?originCity=${ORIGIN}&destinationCity=${DEST}&month=3" | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False))" 2>/dev/null || curl -s "${BASE_URL}/flight-prices/domestic/estimate?originCity=${ORIGIN}&destinationCity=${DEST}&month=3"
echo ""
echo ""

# 6. 测试月度趋势
echo "6️⃣ 获取月度趋势：成都 -> 深圳"
echo "--------------------------------"
curl -s "${BASE_URL}/flight-prices/domestic/monthly-trend?originCity=${ORIGIN}&destinationCity=${DEST}" | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False))" 2>/dev/null || curl -s "${BASE_URL}/flight-prices/domestic/monthly-trend?originCity=${ORIGIN}&destinationCity=${DEST}"
echo ""
echo ""

echo "✅ 测试完成！"

