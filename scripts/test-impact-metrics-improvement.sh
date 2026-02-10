#!/bin/bash
# 测试影响分析数值准确性改进

set -e

TRIP_ID="${1:-9a4dbd2e-e76a-4fd3-bab0-09332fb2581b}"
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo "======================================================================"
echo "影响分析数值准确性改进 - 测试脚本"
echo "======================================================================"
echo ""
echo "Trip ID: $TRIP_ID"
echo "API 基础 URL: $API_BASE_URL"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 步骤 1: 获取当前指标
echo -e "${CYAN}步骤 1: 获取当前行程指标...${NC}"
CURRENT_METRICS=$(curl -s "$API_BASE_URL/api/trips/$TRIP_ID/metrics" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('success'):
    summary = d['data']['summary']
    print(f\"疲劳指数: {summary.get('totalFatigue', 0)}\")
    print(f\"缓冲时间: {summary.get('totalBuffer', 0)} 分钟\")
    print(f\"费用: {summary.get('totalCost', 0)}\")
else:
    print('获取指标失败')
" 2>/dev/null || echo "获取指标失败")

echo "$CURRENT_METRICS"
echo ""

# 步骤 2: 检查是否有新建议
echo -e "${CYAN}步骤 2: 检查高优先级建议...${NC}"
SUGGESTIONS=$(curl -s "$API_BASE_URL/api/trips/$TRIP_ID/suggestions?severity=blocker&status=new&limit=10")

BLOCKER_COUNT=$(echo "$SUGGESTIONS" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['data']['total'] if d.get('success') else 0)" 2>/dev/null || echo "0")

echo "高优先级（BLOCKER）新建议数量: $BLOCKER_COUNT"
echo ""

if [ "$BLOCKER_COUNT" = "0" ]; then
  echo -e "${YELLOW}⚠️  该行程没有新的高优先级建议${NC}"
  echo -e "${YELLOW}提示: 可以使用其他有建议的行程 ID，或创建新的时间冲突${NC}"
  echo ""
  exit 0
fi

# 步骤 3: 预览模式测试
echo -e "${CYAN}步骤 3: 预览模式测试（估算影响）...${NC}"
PREVIEW_RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/planning-workbench/auto-optimize" \
  -H "Content-Type: application/json" \
  -d "{
    \"tripId\": \"$TRIP_ID\",
    \"preview\": true,
    \"limit\": 10
  }")

echo "响应:"
echo "$PREVIEW_RESPONSE" | python3 -m json.tool 2>/dev/null | head -30 || echo "$PREVIEW_RESPONSE"
echo ""

PREVIEW_SUCCESS=$(echo "$PREVIEW_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if d.get('success') else 'false')" 2>/dev/null || echo "false")

if [ "$PREVIEW_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ 预览模式测试通过${NC}"
  
  # 提取影响分析
  echo ""
  echo "估算影响分析:"
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
else
  echo -e "${RED}❌ 预览模式测试失败${NC}"
fi

echo ""
echo "----------------------------------------------------------------------"
echo ""

# 步骤 4: 实际应用模式测试（可选）
read -p "是否执行实际应用模式测试？这将实际修改行程数据！(y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${CYAN}步骤 4: 实际应用模式测试（计算实际影响）...${NC}"
  echo "⚠️  警告: 这将实际修改行程数据！"
  echo ""
  
  # 应用前获取指标
  echo "应用前指标:"
  BEFORE_METRICS=$(curl -s "$API_BASE_URL/api/trips/$TRIP_ID/metrics" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('success'):
    summary = d['data']['summary']
    print(f\"疲劳指数: {summary.get('totalFatigue', 0)}\")
    print(f\"缓冲时间: {summary.get('totalBuffer', 0)} 分钟\")
    print(f\"费用: {summary.get('totalCost', 0)}\")
" 2>/dev/null || echo "获取指标失败")
  echo "$BEFORE_METRICS"
  echo ""
  
  # 应用建议
  APPLY_RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/planning-workbench/auto-optimize" \
    -H "Content-Type: application/json" \
    -d "{
      \"tripId\": \"$TRIP_ID\",
      \"preview\": false,
      \"limit\": 10
    }")
  
  echo "响应:"
  echo "$APPLY_RESPONSE" | python3 -m json.tool 2>/dev/null | head -40 || echo "$APPLY_RESPONSE"
  echo ""
  
  APPLY_SUCCESS=$(echo "$APPLY_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if d.get('success') else 'false')" 2>/dev/null || echo "false")
  
  if [ "$APPLY_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✅ 实际应用模式测试通过${NC}"
    
    # 应用后获取指标
    echo ""
    echo "应用后指标:"
    AFTER_METRICS=$(curl -s "$API_BASE_URL/api/trips/$TRIP_ID/metrics" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('success'):
    summary = d['data']['summary']
    print(f\"疲劳指数: {summary.get('totalFatigue', 0)}\")
    print(f\"缓冲时间: {summary.get('totalBuffer', 0)} 分钟\")
    print(f\"费用: {summary.get('totalCost', 0)}\")
" 2>/dev/null || echo "获取指标失败")
    echo "$AFTER_METRICS"
    echo ""
    
    # 提取实际影响分析
    echo "实际影响分析（从 API 返回）:"
    echo "$APPLY_RESPONSE" | python3 -c "
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
    
    echo ""
    echo -e "${CYAN}💡 说明:${NC}"
    echo "  实际影响分析基于应用前后的指标差异计算"
    echo "  这比之前的硬编码固定值更准确"
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
