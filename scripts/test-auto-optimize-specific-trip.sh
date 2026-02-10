#!/bin/bash
# Auto综合 API 测试脚本（指定行程 ID）

set -e

TRIP_ID="${1:-9a4dbd2e-e76a-4fd3-bab0-09332fb2581b}"
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo "======================================================================"
echo "Auto综合 API 测试 - 指定行程"
echo "======================================================================"
echo ""
echo "Trip ID: $TRIP_ID"
echo "API 基础 URL: $API_BASE_URL"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 步骤 1: 检查行程是否存在
echo -e "${CYAN}步骤 1: 检查行程是否存在...${NC}"
TRIP_CHECK=$(curl -s "$API_BASE_URL/api/trips/$TRIP_ID" | python3 -c "import sys, json; d=json.load(sys.stdin); print('exists' if d.get('success') else 'not_found')" 2>/dev/null || echo "error")

if [ "$TRIP_CHECK" != "exists" ]; then
  echo -e "${RED}❌ 行程不存在或无法访问${NC}"
  exit 1
fi
echo -e "${GREEN}✅ 行程存在${NC}"
echo ""

# 步骤 2: 查看建议列表
echo -e "${CYAN}步骤 2: 查看高优先级建议列表...${NC}"
SUGGESTIONS=$(curl -s "$API_BASE_URL/api/trips/$TRIP_ID/suggestions?severity=blocker&limit=10")

BLOCKER_COUNT=$(echo "$SUGGESTIONS" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['data']['total'] if d.get('success') else 0)" 2>/dev/null || echo "0")

echo "高优先级（BLOCKER）建议数量: $BLOCKER_COUNT"
echo ""

if [ "$BLOCKER_COUNT" = "0" ]; then
  echo -e "${YELLOW}⚠️  该行程没有高优先级建议${NC}"
  echo ""
fi

# 步骤 3: 预览模式测试
echo -e "${CYAN}步骤 3: 预览模式测试（preview=true）${NC}"
echo "请求: POST $API_BASE_URL/api/planning-workbench/auto-optimize"
echo "Body: {\"tripId\": \"$TRIP_ID\", \"preview\": true, \"limit\": 10}"
echo ""

PREVIEW_RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/planning-workbench/auto-optimize" \
  -H "Content-Type: application/json" \
  -d "{
    \"tripId\": \"$TRIP_ID\",
    \"preview\": true,
    \"limit\": 10
  }")

echo "响应:"
echo "$PREVIEW_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$PREVIEW_RESPONSE"
echo ""

# 解析响应
PREVIEW_SUCCESS=$(echo "$PREVIEW_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if d.get('success') else 'false')" 2>/dev/null || echo "false")
PREVIEW_COUNT=$(echo "$PREVIEW_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['data']['appliedCount'] if d.get('success') else 0)" 2>/dev/null || echo "0")

if [ "$PREVIEW_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ 预览模式测试通过${NC}"
  echo "  找到的建议数: $PREVIEW_COUNT"
  
  if [ "$PREVIEW_COUNT" -gt 0 ]; then
    echo ""
    echo "建议详情:"
    echo "$PREVIEW_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('success') and 'suggestions' in d['data']:
    for i, s in enumerate(d['data']['suggestions'], 1):
        print(f\"  {i}. {s['title']} (severity: {s['severity']}, applied: {s.get('applied', False)})\")
" 2>/dev/null || echo "  无法解析建议详情"
    
    if echo "$PREVIEW_RESPONSE" | grep -q '"impact"'; then
      echo ""
      echo "影响分析:"
      echo "$PREVIEW_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('success') and 'impact' in d['data']:
    impact = d['data']['impact']
    if 'metrics' in impact:
        metrics = impact['metrics']
        print(f\"  疲劳指数变化: {metrics.get('fatigue', 0)}\")
        print(f\"  缓冲时间变化: {metrics.get('buffer', 0)} 分钟\")
        print(f\"  费用变化: {metrics.get('cost', 0)}\")
" 2>/dev/null || echo "  无法解析影响分析"
    fi
  fi
else
  echo -e "${RED}❌ 预览模式测试失败${NC}"
fi

echo ""
echo "----------------------------------------------------------------------"
echo ""

# 步骤 4: 实际应用模式测试（可选）
read -p "是否执行实际应用模式测试？(y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${CYAN}步骤 4: 实际应用模式测试（preview=false）${NC}"
  echo "⚠️  警告: 这将实际修改行程数据！"
  echo ""
  
  APPLY_RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/planning-workbench/auto-optimize" \
    -H "Content-Type: application/json" \
    -d "{
      \"tripId\": \"$TRIP_ID\",
      \"preview\": false,
      \"limit\": 10
    }")
  
  echo "响应:"
  echo "$APPLY_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$APPLY_RESPONSE"
  echo ""
  
  APPLY_SUCCESS=$(echo "$APPLY_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if d.get('success') else 'false')" 2>/dev/null || echo "false")
  APPLY_COUNT=$(echo "$APPLY_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['data']['appliedCount'] if d.get('success') else 0)" 2>/dev/null || echo "0")
  
  if [ "$APPLY_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✅ 实际应用模式测试通过${NC}"
    echo "  成功应用的建议数: $APPLY_COUNT"
  else
    echo -e "${RED}❌ 实际应用模式测试失败${NC}"
  fi
else
  echo -e "${YELLOW}跳过实际应用模式测试${NC}"
fi

echo ""
echo "======================================================================"
echo "测试完成"
echo "======================================================================"
