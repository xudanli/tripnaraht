#!/bin/bash

# 接口综合测试脚本
# 使用方法: ./scripts/test-interfaces.sh

set -e

BASE_URL="${API_BASE_URL:-http://localhost:3000/api}"

echo "=========================================="
echo "接口综合测试"
echo "=========================================="
echo ""
echo "Base URL: $BASE_URL"
echo ""

# 检查服务是否运行
echo "【检查】服务状态"
echo "----------------------------------------"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/weather/current?lat=64.1466&lng=-21.9426" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ 服务运行正常 (HTTP $HTTP_CODE)"
else
  echo "❌ 服务未运行或不可访问 (HTTP $HTTP_CODE)"
  echo ""
  echo "请先启动服务:"
  echo "  npm run start:dev"
  echo ""
  echo "或设置 API_BASE_URL 环境变量:"
  echo "  API_BASE_URL=http://your-server:3000/api ./scripts/test-interfaces.sh"
  exit 1
fi
echo ""

# 测试结果统计
PASSED=0
FAILED=0
SKIPPED=0

# 测试 1: 天气接口 - 冰岛
echo "【测试 1】天气接口 - 获取当前天气（冰岛）"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/weather/current?lat=64.1466&lng=-21.9426")
if [ -n "$RESPONSE" ]; then
  if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    SOURCE=$(echo "$RESPONSE" | jq -r '.data.source // "unknown"')
    TEMP=$(echo "$RESPONSE" | jq -r 'if .data.temperature then (.data.temperature | tostring) + "°C" else "N/A" end')
    FEELS_LIKE=$(echo "$RESPONSE" | jq -r 'if .data.feelsLikeTemperature then (.data.feelsLikeTemperature | tostring) + "°C" else "未提供" end')
    CONDITION=$(echo "$RESPONSE" | jq -r '.data.condition // "unknown"')
    CACHED=$(echo "$RESPONSE" | jq -r 'if .data.metadata.cached then "✅ 来自缓存" else "❌ 未缓存" end')
    
    echo "✅ 天气接口测试通过"
    echo "  数据源: $SOURCE"
    echo "  温度: $TEMP"
    echo "  体感温度: $FEELS_LIKE"
    echo "  条件: $CONDITION"
    echo "  缓存: $CACHED"
    PASSED=$((PASSED + 1))
  else
    ERROR=$(echo "$RESPONSE" | jq -r '.error.message // "Unknown error"')
    echo "❌ 天气接口测试失败: $ERROR"
    FAILED=$((FAILED + 1))
  fi
else
  echo "❌ 无响应"
  FAILED=$((FAILED + 1))
fi
echo ""

# 测试 2: 天气接口 - 北京
echo "【测试 2】天气接口 - 获取当前天气（北京）"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/weather/current?lat=39.9042&lng=116.4074")
if [ -n "$RESPONSE" ]; then
  if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    SOURCE=$(echo "$RESPONSE" | jq -r '.data.source // "unknown"')
    TEMP=$(echo "$RESPONSE" | jq -r 'if .data.temperature then (.data.temperature | tostring) + "°C" else "N/A" end')
    FEELS_LIKE=$(echo "$RESPONSE" | jq -r 'if .data.feelsLikeTemperature then (.data.feelsLikeTemperature | tostring) + "°C" else "未提供" end')
    CONDITION=$(echo "$RESPONSE" | jq -r '.data.condition // "unknown"')
    
    echo "✅ 天气接口测试通过"
    echo "  数据源: $SOURCE"
    echo "  温度: $TEMP"
    echo "  体感温度: $FEELS_LIKE"
    echo "  条件: $CONDITION"
    PASSED=$((PASSED + 1))
  else
    ERROR=$(echo "$RESPONSE" | jq -r '.error.message // "Unknown error"')
    echo "❌ 天气接口测试失败: $ERROR"
    FAILED=$((FAILED + 1))
  fi
else
  echo "❌ 无响应"
  FAILED=$((FAILED + 1))
fi
echo ""

# 测试 3: 行程项列表接口
echo "【测试 3】行程项接口 - 获取列表"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/itinerary-items?limit=1")
if [ -n "$RESPONSE" ]; then
  if echo "$RESPONSE" | jq -e '.success == true and (.data | type) == "array" and (.data | length) > 0' >/dev/null 2>&1; then
    ITEM_ID=$(echo "$RESPONSE" | jq -r '.data[0].id')
    TRIP_DAY_ID=$(echo "$RESPONSE" | jq -r '.data[0].tripDayId // "N/A"')
    START_TIME=$(echo "$RESPONSE" | jq -r '.data[0].startTime // "N/A"')
    TRIP_DAY_DATE=$(echo "$RESPONSE" | jq -r '.data[0].TripDay.date // "N/A"')
    
    echo "✅ 行程项列表接口测试通过"
    echo "  找到行程项: $ITEM_ID"
    echo "  tripDayId: $TRIP_DAY_ID"
    echo "  startTime: $START_TIME"
    echo "  TripDay 日期: $TRIP_DAY_DATE"
    PASSED=$((PASSED + 1))
  else
    echo "⚠️  未找到行程项（可能需要先创建测试数据）"
    SKIPPED=$((SKIPPED + 1))
  fi
else
  echo "❌ 无响应"
  FAILED=$((FAILED + 1))
fi
echo ""

# 测试 4: 行程项更新接口（跨日期调整）
echo "【测试 4】行程项更新接口 - 跨日期调整"
echo "----------------------------------------"
ITEM_ID=$(curl -s "${BASE_URL}/itinerary-items?limit=1" | jq -r '.data[0].id // empty' 2>/dev/null)

if [ -n "$ITEM_ID" ] && [ "$ITEM_ID" != "null" ] && [ "$ITEM_ID" != "" ]; then
  echo "找到行程项 ID: $ITEM_ID"
  
  # 获取当前信息
  CURRENT=$(curl -s "${BASE_URL}/itinerary-items/${ITEM_ID}")
  OLD_TRIP_DAY_ID=$(echo "$CURRENT" | jq -r '.data.item.tripDayId // .data.tripDayId // empty' 2>/dev/null)
  
  if [ -n "$OLD_TRIP_DAY_ID" ] && [ "$OLD_TRIP_DAY_ID" != "null" ] && [ "$OLD_TRIP_DAY_ID" != "" ]; then
    echo "当前 tripDayId: $OLD_TRIP_DAY_ID"
    
    # 计算新的时间（+2天）
    NEW_START_TIME=$(node -e "const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(10,0,0,0); console.log(d.toISOString());" 2>/dev/null)
    NEW_END_TIME=$(node -e "const d = new Date(\"$NEW_START_TIME\"); d.setHours(d.getHours() + 2); console.log(d.toISOString());" 2>/dev/null)
    
    if [ -n "$NEW_START_TIME" ]; then
      echo "更新 startTime 到: $NEW_START_TIME"
      echo "更新 endTime 到: $NEW_END_TIME"
      echo "cascadeMode: none"
      
      UPDATE_RESPONSE=$(curl -s -X PATCH "${BASE_URL}/itinerary-items/${ITEM_ID}" \
        -H "Content-Type: application/json" \
        -d "{\"startTime\": \"$NEW_START_TIME\", \"endTime\": \"$NEW_END_TIME\", \"cascadeMode\": \"none\"}")
      
      if echo "$UPDATE_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        NEW_TRIP_DAY_ID=$(echo "$UPDATE_RESPONSE" | jq -r '.data.item.tripDayId // .data.tripDayId // "N/A"')
        NEW_START=$(echo "$UPDATE_RESPONSE" | jq -r '.data.item.startTime // .data.startTime // "N/A"')
        TRIP_DAY_DATE=$(echo "$UPDATE_RESPONSE" | jq -r '.data.item.TripDay.date // .data.TripDay.date // "N/A"')
        TRIP_DAY_ID=$(echo "$UPDATE_RESPONSE" | jq -r '.data.item.TripDay.id // .data.TripDay.id // "N/A"')
        
        echo "✅ 行程项更新接口测试通过"
        echo "  更新后的 tripDayId: $NEW_TRIP_DAY_ID"
        echo "  更新后的 startTime: $NEW_START"
        echo "  TripDay 日期: $TRIP_DAY_DATE"
        echo "  TripDay ID: $TRIP_DAY_ID"
        
        # 验证 tripDayId 是否正确更新
        if [ "$NEW_TRIP_DAY_ID" != "N/A" ] && [ "$TRIP_DAY_ID" != "N/A" ] && [ "$NEW_TRIP_DAY_ID" = "$TRIP_DAY_ID" ]; then
          echo "  ✅ tripDayId 和 TripDay.id 匹配"
        else
          echo "  ⚠️  tripDayId ($NEW_TRIP_DAY_ID) 和 TripDay.id ($TRIP_DAY_ID) 不匹配"
        fi
        
        # 验证日期是否匹配
        if [ "$TRIP_DAY_DATE" != "N/A" ] && [ "$NEW_START" != "N/A" ]; then
          START_DATE=$(echo "$NEW_START" | cut -d'T' -f1)
          TRIP_DATE=$(echo "$TRIP_DAY_DATE" | cut -d'T' -f1)
          if [ "$START_DATE" = "$TRIP_DATE" ]; then
            echo "  ✅ startTime 日期 ($START_DATE) 与 TripDay 日期 ($TRIP_DATE) 匹配"
          else
            echo "  ⚠️  startTime 日期 ($START_DATE) 与 TripDay 日期 ($TRIP_DATE) 不匹配"
          fi
        fi
        
        PASSED=$((PASSED + 1))
      else
        ERROR=$(echo "$UPDATE_RESPONSE" | jq -r '.error.message // "Unknown error"')
        echo "❌ 行程项更新接口测试失败: $ERROR"
        FAILED=$((FAILED + 1))
      fi
    else
      echo "⚠️  无法计算新时间"
      SKIPPED=$((SKIPPED + 1))
    fi
  else
    echo "⚠️  无法获取当前 tripDayId"
    SKIPPED=$((SKIPPED + 1))
  fi
else
  echo "⚠️  未找到行程项 ID，跳过更新测试"
  SKIPPED=$((SKIPPED + 1))
fi
echo ""

# 测试总结
echo "=========================================="
echo "测试总结"
echo "=========================================="
echo ""
echo "测试结果:"
echo "  ✅ 通过: $PASSED"
echo "  ❌ 失败: $FAILED"
echo "  ⚠️  跳过: $SKIPPED"
echo ""
echo "已测试接口:"
echo "  1. GET /api/weather/current - 天气接口（冰岛、北京）"
echo "  2. GET /api/itinerary-items - 行程项列表"
echo "  3. PATCH /api/itinerary-items/:id - 行程项更新（跨日期 + cascadeMode）"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ 所有测试通过！"
  exit 0
else
  echo "❌ 部分测试失败"
  exit 1
fi
