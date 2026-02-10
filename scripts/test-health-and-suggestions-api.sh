#!/bin/bash
# 健康度和优化建议接口测试脚本

set -e

TRIP_ID="${1:-9a4dbd2e-e76a-4fd3-bab0-09332fb2581b}"
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo "======================================================================"
echo "健康度和优化建议接口测试"
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
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 步骤 0: 检查服务器是否运行
echo -e "${CYAN}步骤 0: 检查服务器是否运行...${NC}"
SERVER_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE_URL/api/trip-detail/$TRIP_ID/health" 2>/dev/null || echo "000")

if [ "$SERVER_CHECK" = "000" ] || [ "$SERVER_CHECK" = "" ]; then
  echo -e "${RED}❌ 服务器未运行或无法连接${NC}"
  echo "请确保服务器正在运行: npm run start:dev"
  exit 1
fi
echo -e "${GREEN}✅ 服务器运行正常${NC}"
echo ""

# 步骤 1: 检查行程是否存在（可选检查）
echo -e "${CYAN}步骤 1: 检查行程是否存在...${NC}"
TRIP_CHECK=$(curl -s "$API_BASE_URL/api/trips/$TRIP_ID" 2>/dev/null | python3 -c "import sys, json; d=json.load(sys.stdin); print('exists' if d.get('success') else 'not_found')" 2>/dev/null || echo "error")

if [ "$TRIP_CHECK" = "exists" ]; then
  echo -e "${GREEN}✅ 行程存在${NC}"
else
  echo -e "${YELLOW}⚠️  无法确认行程是否存在，继续测试...${NC}"
fi
echo ""

# 步骤 2: 测试健康度接口
echo -e "${CYAN}步骤 2: 测试健康度接口 (GET /api/trip-detail/:tripId/health)${NC}"
HEALTH_RESPONSE=$(curl -s "$API_BASE_URL/api/trip-detail/$TRIP_ID/health")

echo "响应:"
echo "$HEALTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_RESPONSE"
echo ""

HEALTH_SUCCESS=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if d.get('success') else 'false')" 2>/dev/null || echo "false")

if [ "$HEALTH_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ 健康度接口测试通过${NC}"
  
  # 解析健康度数据
  echo ""
  echo "健康度数据:"
  echo "$HEALTH_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('success') and 'data' in d:
    health = d['data']
    print(f\"  整体状态: {health.get('overall', 'unknown')}\")
    if 'dimensions' in health:
        dims = health['dimensions']
        print(f\"  时间安排 (schedule): {dims.get('schedule', {}).get('score', 'N/A')} - {dims.get('schedule', {}).get('status', 'unknown')}\")
        print(f\"  预算 (budget): {dims.get('budget', {}).get('score', 'N/A')} - {dims.get('budget', {}).get('status', 'unknown')}\")
        print(f\"  节奏 (pace): {dims.get('pace', {}).get('score', 'N/A')} - {dims.get('pace', {}).get('status', 'unknown')}\")
        print(f\"  可达性 (feasibility): {dims.get('feasibility', {}).get('score', 'N/A')} - {dims.get('feasibility', {}).get('status', 'unknown')}\")
        
        # 计算加权平均
        schedule_score = dims.get('schedule', {}).get('score', 0)
        budget_score = dims.get('budget', {}).get('score', 0)
        pace_score = dims.get('pace', {}).get('score', 0)
        feasibility_score = dims.get('feasibility', {}).get('score', 0)
        
        weighted_score = (
            schedule_score * 0.30 +
            budget_score * 0.25 +
            pace_score * 0.25 +
            feasibility_score * 0.20
        )
        print(f\"  加权平均分数: {weighted_score:.2f}\")
        
        # 显示权重
        print(f\"  权重: schedule(0.30), budget(0.25), pace(0.25), feasibility(0.20)\")
" 2>/dev/null || echo "  无法解析健康度数据"
else
  echo -e "${RED}❌ 健康度接口测试失败${NC}"
fi

echo ""
echo "----------------------------------------------------------------------"
echo ""

# 步骤 3: 测试指标详细说明接口
echo -e "${CYAN}步骤 3: 测试指标详细说明接口 (GET /api/trip-detail/:tripId/metrics/:dimension/explanation)${NC}"

DIMENSIONS=("schedule" "budget" "pace" "feasibility")
for dimension in "${DIMENSIONS[@]}"; do
  echo ""
  echo -e "${BLUE}测试维度: $dimension${NC}"
  EXPLANATION_RESPONSE=$(curl -s "$API_BASE_URL/api/trip-detail/$TRIP_ID/metrics/$dimension/explanation")
  
  EXPLANATION_SUCCESS=$(echo "$EXPLANATION_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if d.get('success') else 'false')" 2>/dev/null || echo "false")
  
  if [ "$EXPLANATION_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✅ $dimension 维度说明获取成功${NC}"
    
    # 解析权重和贡献度
    echo "$EXPLANATION_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('success') and 'data' in d:
    data = d['data']
    print(f\"  指标名称: {data.get('metricName', 'N/A')}\")
    print(f\"  显示名称: {data.get('displayName', 'N/A')}\")
    print(f\"  当前分数: {data.get('currentScore', 'N/A')}\")
    print(f\"  权重: {data.get('weight', 'N/A')}\")
    print(f\"  贡献度: {data.get('contribution', 'N/A')}\")
    print(f\"  状态: {data.get('currentStatus', 'N/A')}\")
" 2>/dev/null || echo "  无法解析说明数据"
  else
    echo -e "${RED}❌ $dimension 维度说明获取失败${NC}"
    echo "$EXPLANATION_RESPONSE" | python3 -m json.tool 2>/dev/null | head -10 || echo "$EXPLANATION_RESPONSE"
  fi
done

echo ""
echo "----------------------------------------------------------------------"
echo ""

# 步骤 4: 测试建议列表接口
echo -e "${CYAN}步骤 4: 测试建议列表接口 (GET /api/trips/:tripId/suggestions)${NC}"
SUGGESTIONS_RESPONSE=$(curl -s "$API_BASE_URL/api/trips/$TRIP_ID/suggestions?limit=10")

echo "响应（前30行）:"
echo "$SUGGESTIONS_RESPONSE" | python3 -m json.tool 2>/dev/null | head -30 || echo "$SUGGESTIONS_RESPONSE" | head -30
echo ""

SUGGESTIONS_SUCCESS=$(echo "$SUGGESTIONS_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if d.get('success') else 'false')" 2>/dev/null || echo "false")

if [ "$SUGGESTIONS_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ 建议列表接口测试通过${NC}"
  
  # 解析建议统计
  echo ""
  echo "建议统计:"
  echo "$SUGGESTIONS_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('success') and 'data' in d:
    data = d['data']
    print(f\"  总数: {data.get('total', 0)}\")
    items = data.get('items', [])
    blocker = [s for s in items if s.get('severity') == 'blocker']
    warn = [s for s in items if s.get('severity') == 'warn']
    info = [s for s in items if s.get('severity') == 'info']
    print(f\"  BLOCKER: {len(blocker)}\")
    print(f\"  WARN: {len(warn)}\")
    print(f\"  INFO: {len(info)}\")
    
    if items:
        print(f\"  前3个建议:\")
        for i, s in enumerate(items[:3], 1):
            print(f\"    {i}. [{s.get('severity', 'unknown').upper()}] {s.get('title', 'N/A')} - {s.get('status', 'unknown')}\")
" 2>/dev/null || echo "  无法解析建议数据"
else
  echo -e "${RED}❌ 建议列表接口测试失败${NC}"
fi

echo ""
echo "----------------------------------------------------------------------"
echo ""

# 步骤 5: 测试 Auto综合接口（预览模式）
echo -e "${CYAN}步骤 5: 测试 Auto综合接口 - 预览模式 (POST /api/planning-workbench/auto-optimize)${NC}"
AUTO_OPTIMIZE_RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/planning-workbench/auto-optimize" \
  -H "Content-Type: application/json" \
  -d "{
    \"tripId\": \"$TRIP_ID\",
    \"preview\": true,
    \"limit\": 10
  }")

echo "响应:"
echo "$AUTO_OPTIMIZE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$AUTO_OPTIMIZE_RESPONSE"
echo ""

AUTO_OPTIMIZE_SUCCESS=$(echo "$AUTO_OPTIMIZE_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if d.get('success') else 'false')" 2>/dev/null || echo "false")

if [ "$AUTO_OPTIMIZE_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Auto综合接口（预览模式）测试通过${NC}"
  
  # 解析影响分析
  echo ""
  echo "影响分析:"
  echo "$AUTO_OPTIMIZE_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('success') and 'data' in d:
    data = d['data']
    print(f\"  找到的建议数: {data.get('appliedCount', 0)}\")
    if 'impact' in data and 'metrics' in data['impact']:
        metrics = data['impact']['metrics']
        print(f\"  疲劳指数变化: {metrics.get('fatigue', 0)}\")
        print(f\"  缓冲时间变化: {metrics.get('buffer', 0)} 分钟\")
        print(f\"  费用变化: {metrics.get('cost', 0)}\")
" 2>/dev/null || echo "  无法解析影响分析"
else
  echo -e "${RED}❌ Auto综合接口测试失败${NC}"
fi

echo ""
echo "======================================================================"
echo "测试完成"
echo "======================================================================"
echo ""
echo "📊 测试总结:"
echo "  - 健康度接口: $([ \"$HEALTH_SUCCESS\" = \"true\" ] && echo -e \"${GREEN}✅${NC}\" || echo -e \"${RED}❌${NC}\")"
echo "  - 指标详细说明接口: $([ \"$EXPLANATION_SUCCESS\" = \"true\" ] && echo -e \"${GREEN}✅${NC}\" || echo -e \"${RED}❌${NC}\")"
echo "  - 建议列表接口: $([ \"$SUGGESTIONS_SUCCESS\" = \"true\" ] && echo -e \"${GREEN}✅${NC}\" || echo -e \"${RED}❌${NC}\")"
echo "  - Auto综合接口: $([ \"$AUTO_OPTIMIZE_SUCCESS\" = \"true\" ] && echo -e \"${GREEN}✅${NC}\" || echo -e \"${RED}❌${NC}\")"
echo ""
