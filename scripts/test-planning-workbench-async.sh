#!/bin/bash
# 规划工作台异步 API 测试脚本（不依赖 embedding）
# 
# 测试 P0 异步功能：
# - POST /execute-async: 异步执行，立即返回 taskId
# - GET /tasks/:taskId/status: 轮询任务状态
# - POST /tasks/:taskId/cancel-planning: 取消任务
#
# 注意：此测试不依赖 embedding 服务，系统会自动降级到关键词搜索

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo "🚀 开始测试规划工作台异步 API（不依赖 embedding）..."
echo "📍 API地址: $API_BASE_URL"
echo ""

# 测试1: 异步执行（generate）
echo "📋 测试1: 异步执行规划工作台（generate）"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE_URL/api/planning-workbench/execute-async" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "destination": {
        "country": "冰岛"
      },
      "days": 3,
      "travelMode": "self_drive",
      "constraints": {
        "budget": {
          "total": 30000,
          "currency": "CNY"
        },
        "fitness": {
          "level": "medium"
        }
      }
    },
    "userAction": "generate"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "202" ]; then
  TASK_ID=$(echo "$BODY" | grep -o '"taskId":"[^"]*"' | cut -d'"' -f4)
  if [ -n "$TASK_ID" ]; then
    echo "  ✅ 异步任务已创建: taskId=$TASK_ID"
  else
    echo "  ❌ 响应中缺少 taskId"
    exit 1
  fi
else
  echo "  ❌ HTTP $HTTP_CODE: $BODY"
  exit 1
fi

# 测试2: 轮询任务状态
echo ""
echo "📊 测试2: 轮询任务状态"
MAX_ATTEMPTS=60
ATTEMPT=1
STATUS=""

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  STATUS_RESPONSE=$(curl -s "$API_BASE_URL/api/planning-workbench/tasks/$TASK_ID/status")
  STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  PROGRESS=$(echo "$STATUS_RESPONSE" | grep -o '"progress":[0-9]*' | cut -d':' -f2)
  STAGE=$(echo "$STATUS_RESPONSE" | grep -o '"currentStage":"[^"]*"' | cut -d'"' -f4 || echo "未知")
  
  echo "  [$ATTEMPT/$MAX_ATTEMPTS] 状态: $STATUS, 进度: ${PROGRESS}%, 阶段: $STAGE"
  
  if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "CANCELLED" ]; then
    break
  fi
  
  sleep 2
  ATTEMPT=$((ATTEMPT + 1))
done

if [ "$STATUS" = "COMPLETED" ]; then
  echo "  ✅ 任务完成"
elif [ "$STATUS" = "FAILED" ]; then
  ERROR=$(echo "$STATUS_RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4 || echo "未知错误")
  echo "  ❌ 任务失败: $ERROR"
  exit 1
else
  echo "  ⚠️  轮询超时"
  exit 1
fi

# 测试3: 直接查询任务状态
echo ""
echo "🔍 测试3: 直接查询任务状态"
STATUS_RESPONSE=$(curl -s "$API_BASE_URL/api/planning-workbench/tasks/$TASK_ID/status")
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE_URL/api/planning-workbench/tasks/$TASK_ID/status")

if [ "$HTTP_CODE" = "200" ]; then
  STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  PROGRESS=$(echo "$STATUS_RESPONSE" | grep -o '"progress":[0-9]*' | cut -d':' -f2)
  echo "  ✅ 查询成功: 状态=$STATUS, 进度=${PROGRESS}%"
else
  echo "  ❌ HTTP $HTTP_CODE"
  exit 1
fi

echo ""
echo "🎉 所有测试通过！"
