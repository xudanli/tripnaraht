#!/bin/bash
# 测试规划工作台接口

echo "测试规划工作台接口..."
echo ""

# 测试 1: 生成方案
echo "=== 测试 1: 生成方案 ==="
curl -X POST http://localhost:3000/api/planning-workbench/execute \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "destination": {
        "country": "JP",
        "city": "Tokyo"
      },
      "days": 5,
      "constraints": {
        "budget": {
          "total": 10000,
          "currency": "CNY"
        }
      }
    },
    "userAction": "generate"
  }' \
  --max-time 30 \
  -w "\nHTTP Status: %{http_code}\n" \
  2>&1 | head -100

echo ""
echo "测试完成"
