#!/bin/bash
# 测试所有 Agent 接口

echo "=== 测试 Agent 接口 ==="
echo ""

# 测试 1: 规划工作台 - 生成方案
echo "1. 测试规划工作台接口..."
curl -X POST http://localhost:3000/api/planning-workbench/execute \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "destination": {"country": "JP", "city": "Tokyo"},
      "days": 5,
      "constraints": {"budget": {"total": 10000, "currency": "CNY"}}
    },
    "userAction": "generate"
  }' \
  --max-time 60 \
  -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  2>&1 | head -50

echo ""
echo "---"
echo ""

# 测试 2: 执行阶段 - 提醒
echo "2. 测试执行阶段接口..."
curl -X POST http://localhost:3000/api/execution/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "b7bebb8a-119f-4e3d-a68c-d4f9e44f813c",
    "action": "remind"
  }' \
  --max-time 30 \
  -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  2>&1 | head -50

echo ""
echo "---"
echo ""

# 测试 3: 行程详情页 - 获取状态
echo "3. 测试行程详情页接口..."
curl -X POST http://localhost:3000/api/trip-detail/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "b7bebb8a-119f-4e3d-a68c-d4f9e44f813c",
    "action": "get_status"
  }' \
  --max-time 30 \
  -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  2>&1 | head -50

echo ""
echo "测试完成"
