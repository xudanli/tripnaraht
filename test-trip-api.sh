#!/bin/bash
# 测试 Trip API 的脚本

echo "🧪 测试 Trip API - 创建行程"
echo ""

# 测试数据：2 个"脆皮年轻人" + 1 个"硬朗老人"去日本玩 5 天，预算 2 万
curl -X POST http://localhost:3000/trips \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "JP",
    "startDate": "2024-05-01",
    "endDate": "2024-05-05",
    "totalBudget": 20000,
    "travelers": [
      { "type": "ADULT", "mobilityTag": "CITY_POTATO" }, 
      { "type": "ADULT", "mobilityTag": "CITY_POTATO" },
      { "type": "ELDERLY", "mobilityTag": "ACTIVE_SENIOR" }
    ]
  }' | jq '.'

echo ""
echo "✅ 测试完成"

