#!/bin/bash

# LLM 功能集成测试脚本
# 使用方法: ./scripts/test-llm-integration.sh

BASE_URL="http://localhost:3000"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== LLM 功能集成测试 ===${NC}\n"

# 检查服务器是否运行
echo -e "${YELLOW}1. 检查服务器状态...${NC}"
if ! curl -s "$BASE_URL/system/status" > /dev/null; then
    echo -e "${RED}❌ 服务器未运行，请先启动服务器: npm run dev${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 服务器运行正常${NC}\n"

# 测试 1: 自然语言转参数
echo -e "${YELLOW}2. 测试自然语言转参数...${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/llm/natural-language-to-params" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "帮我规划带娃去东京5天的行程，预算2万"
  }')

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✅ 自然语言转参数成功${NC}"
    echo "$RESPONSE" | jq '.data.params'
else
    echo -e "${RED}❌ 自然语言转参数失败${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi
echo ""

# 测试 2: 自然语言创建行程
echo -e "${YELLOW}3. 测试自然语言创建行程...${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/trips/from-natural-language" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "帮我规划带娃去东京5天的行程，预算2万"
  }')

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✅ 自然语言创建行程成功${NC}"
    TRIP_ID=$(echo "$RESPONSE" | jq -r '.data.trip.id')
    echo "行程ID: $TRIP_ID"
    echo "$RESPONSE" | jq '.data.trip | {id, destination, startDate, endDate, budgetConfig}'
else
    echo -e "${RED}❌ 自然语言创建行程失败${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi
echo ""

# 测试 3: 信息不足场景（需要澄清）
echo -e "${YELLOW}4. 测试信息不足场景...${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/trips/from-natural-language" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "我想去日本玩"
  }')

if echo "$RESPONSE" | jq -e '.data.needsClarification == true' > /dev/null; then
    echo -e "${GREEN}✅ 正确识别需要澄清的场景${NC}"
    echo "澄清问题:"
    echo "$RESPONSE" | jq -r '.data.clarificationQuestions[]'
else
    echo -e "${YELLOW}⚠️  未返回澄清问题（可能 LLM 自动推断出了参数）${NC}"
fi
echo ""

# 测试 4: 结果人性化转化
echo -e "${YELLOW}5. 测试结果人性化转化...${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/llm/humanize-result" \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "itinerary_optimization",
    "data": {
      "nodes": [
        {"id": 1, "name": "东京塔", "startMin": 540, "endMin": 660},
        {"id": 2, "name": "浅草寺", "startMin": 720, "endMin": 840}
      ],
      "schedule": {
        "stops": [
          {"kind": "POI", "id": "poi-1", "name": "东京塔", "startMin": 540, "endMin": 660},
          {"kind": "POI", "id": "poi-2", "name": "浅草寺", "startMin": 720, "endMin": 840}
        ]
      },
      "happinessScore": 85,
      "scoreBreakdown": {
        "interestMatch": 0.9,
        "distancePenalty": 0.1,
        "fatiguePenalty": 0.05
      }
    }
  }')

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✅ 结果人性化转化成功${NC}"
    echo "转化结果:"
    echo "$RESPONSE" | jq -r '.data.description'
else
    echo -e "${RED}❌ 结果人性化转化失败${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi
echo ""

# 测试 5: 决策支持
echo -e "${YELLOW}6. 测试决策支持...${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/llm/decision-support" \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "评估当前行程的稳健度，并提供优化建议",
    "contextData": {
      "schedule": {
        "stops": [
          {"kind": "POI", "id": "poi-1", "name": "景点A", "startMin": 540, "endMin": 660}
        ],
        "metrics": {
          "totalTravelMin": 120,
          "totalWalkMin": 60
        }
      },
      "riskMetrics": {
        "windowMissRate": 0.15,
        "completionRate": 0.85
      }
    }
  }')

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✅ 决策支持成功${NC}"
    echo "推荐建议:"
    echo "$RESPONSE" | jq '.data.recommendations[] | {title, description, confidence}'
    echo ""
    echo "总结:"
    echo "$RESPONSE" | jq -r '.data.summary'
else
    echo -e "${RED}❌ 决策支持失败${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi
echo ""

echo -e "${GREEN}=== 所有测试通过 ===${NC}"
