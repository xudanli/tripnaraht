#!/bin/bash
# 规划工作台 API 测试脚本（使用指定 tripId）

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
TRIP_ID="${TRIP_ID:-6a227a13-b90a-4afb-85fd-d975c38779b7}"

echo "🚀 开始测试规划工作台 API（使用指定 tripId）..."
echo "📍 API地址: $API_BASE_URL"
echo "🆔 Trip ID: $TRIP_ID"
echo ""

# 测试1: 获取 Trip 信息
echo "📋 测试1: 获取 Trip 信息"
TRIP_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE_URL/api/trips/$TRIP_ID")
HTTP_CODE=$(echo "$TRIP_RESPONSE" | tail -n1)
TRIP_BODY=$(echo "$TRIP_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✅ Trip 信息获取成功"
  echo "$TRIP_BODY" | jq -r '.data | "     - 目的地: \(.destination.country // .destination.city // "未知")"'
  echo "$TRIP_BODY" | jq -r '.data | "     - 天数: \(.days // "未知")"'
  echo "$TRIP_BODY" | jq -r '.data | "     - 开始日期: \(.startDate // "未知")"'
  echo "$TRIP_BODY" | jq -r '.data | "     - 结束日期: \(.endDate // "未知")"'
else
  echo "  ❌ 测试失败: HTTP $HTTP_CODE"
  echo "  $TRIP_BODY" | jq -r '.message // .' 2>/dev/null || echo "  $TRIP_BODY"
  echo ""
  echo "⚠️  Trip ID 无效或服务器未运行，无法继续测试"
  exit 1
fi

# 测试2: 异步执行（generate）
echo ""
echo "📋 测试2: 异步执行规划工作台（generate）"

# 构建请求体
REQUEST_BODY=$(cat <<EOF
{
  "context": {
    "destination": {
      "country": "IS",
      "city": null
    },
    "days": 5,
    "travelMode": "self_drive",
    "constraints": {
      "time": {
        "startDate": "2025-02-15",
        "endDate": "2025-02-20"
      }
    }
  },
  "userAction": "generate",
  "tripId": "$TRIP_ID"
}
EOF
)

ASYNC_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY" \
  "$API_BASE_URL/api/planning-workbench/execute-async")

HTTP_CODE=$(echo "$ASYNC_RESPONSE" | tail -n1)
ASYNC_BODY=$(echo "$ASYNC_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "202" ]; then
  TASK_ID=$(echo "$ASYNC_BODY" | jq -r '.data.taskId // empty')
  if [ -n "$TASK_ID" ] && [ "$TASK_ID" != "null" ]; then
    echo "  ✅ 异步任务已创建: taskId=$TASK_ID"
  else
    echo "  ❌ 响应中缺少 taskId"
    echo "  $ASYNC_BODY" | jq '.' 2>/dev/null || echo "  $ASYNC_BODY"
    exit 1
  fi
else
  echo "  ❌ 测试失败: HTTP $HTTP_CODE"
  echo "  $ASYNC_BODY" | jq '.' 2>/dev/null || echo "  $ASYNC_BODY"
  exit 1
fi

# 测试3: 轮询任务状态
echo ""
echo "📊 测试3: 轮询任务状态"
MAX_ATTEMPTS=60
ATTEMPT=0
STATUS=""

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  
  STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE_URL/api/planning-workbench/tasks/$TASK_ID/status")
  STATUS_HTTP_CODE=$(echo "$STATUS_RESPONSE" | tail -n1)
  STATUS_BODY=$(echo "$STATUS_RESPONSE" | sed '$d')
  
  if [ "$STATUS_HTTP_CODE" = "200" ]; then
    STATUS=$(echo "$STATUS_BODY" | jq -r '.data.status // empty')
    PROGRESS=$(echo "$STATUS_BODY" | jq -r '.data.progress // 0')
    CURRENT_STAGE=$(echo "$STATUS_BODY" | jq -r '.data.currentStage // "未知"')
    
    echo "  [$ATTEMPT/$MAX_ATTEMPTS] 状态: $STATUS, 进度: $PROGRESS%, 阶段: $CURRENT_STAGE"
    
    if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "CANCELLED" ]; then
      break
    fi
  else
    echo "  ⚠️  查询失败: HTTP $STATUS_HTTP_CODE"
  fi
  
  sleep 2
done

if [ "$STATUS" = "COMPLETED" ]; then
  echo ""
  echo "  ✅ 任务完成"
  
  # 显示结果摘要
  RESULT=$(echo "$STATUS_BODY" | jq -r '.data.result // empty')
  if [ -n "$RESULT" ] && [ "$RESULT" != "null" ]; then
    OPTION_COUNT=$(echo "$STATUS_BODY" | jq -r '.data.result.planState.skeletonOptions.options | length // 0' 2>/dev/null || echo "0")
    SEGMENT_COUNT=$(echo "$STATUS_BODY" | jq -r '.data.result.segments | length // 0' 2>/dev/null || echo "0")
    
    if [ "$OPTION_COUNT" != "0" ]; then
      echo "  📋 生成了 $OPTION_COUNT 个骨架方案"
    fi
    if [ "$SEGMENT_COUNT" != "0" ]; then
      echo "  🗺️  生成了 $SEGMENT_COUNT 个路线段"
    fi
  fi
elif [ "$STATUS" = "FAILED" ]; then
  echo ""
  echo "  ❌ 任务失败"
  ERROR=$(echo "$STATUS_BODY" | jq -r '.data.error // .data.progress.error // "未知错误"' 2>/dev/null || echo "未知错误")
  echo "  错误: $ERROR"
elif [ "$STATUS" = "CANCELLED" ]; then
  echo ""
  echo "  ⚠️  任务已取消"
else
  echo ""
  echo "  ⚠️  轮询超时：$MAX_ATTEMPTS 次尝试后仍未完成"
fi

# 测试4: 直接查询任务状态
echo ""
echo "🔍 测试4: 直接查询任务状态"
FINAL_STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE_URL/api/planning-workbench/tasks/$TASK_ID/status")
FINAL_HTTP_CODE=$(echo "$FINAL_STATUS_RESPONSE" | tail -n1)
FINAL_BODY=$(echo "$FINAL_STATUS_RESPONSE" | sed '$d')

if [ "$FINAL_HTTP_CODE" = "200" ]; then
  FINAL_STATUS=$(echo "$FINAL_BODY" | jq -r '.data.status // empty')
  FINAL_PROGRESS=$(echo "$FINAL_BODY" | jq -r '.data.progress // 0')
  echo "  ✅ 查询成功: 状态=$FINAL_STATUS, 进度=$FINAL_PROGRESS%"
else
  echo "  ❌ 查询失败: HTTP $FINAL_HTTP_CODE"
fi

echo ""
echo "============================================================"
echo "📊 测试完成"
echo "============================================================"
