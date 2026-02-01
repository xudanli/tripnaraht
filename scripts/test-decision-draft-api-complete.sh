#!/bin/bash

# 完整的决策草案 API 测试脚本
# 用于验证所有 API 端点是否正常工作

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
DRAFT_ID="${DRAFT_ID:-}"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 开始验证决策草案 API..."
echo "API Base URL: $API_BASE_URL"
echo ""

# 1. 检查服务是否运行
echo "1. 检查服务状态..."
if curl -s -f "$API_BASE_URL/api" > /dev/null 2>&1 || curl -s -f "$API_BASE_URL/api-docs" > /dev/null 2>&1 || curl -s "$API_BASE_URL/api/decision-draft" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ 服务正在运行${NC}"
else
  # 检查端口是否监听
  if ss -tlnp 2>/dev/null | grep -q ":3000" || netstat -tlnp 2>/dev/null | grep -q ":3000"; then
    echo -e "${GREEN}✅ 服务正在运行（端口3000已监听）${NC}"
  else
    echo -e "${RED}❌ 服务未运行，请先启动服务${NC}"
    echo "启动命令: npm run dev"
    exit 1
  fi
fi

# 2. 从数据库获取测试用的 draft_id
if [ -z "$DRAFT_ID" ]; then
  echo "2. 从数据库获取测试用的 draft_id..."
  if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}⚠️  DATABASE_URL 未设置，跳过数据库查询${NC}"
    echo "请手动设置 DRAFT_ID 环境变量"
    exit 1
  else
    DRAFT_ID=$(psql "$DATABASE_URL" -tAc "SELECT draft_id FROM decision_drafts LIMIT 1;" 2>/dev/null || echo "")
    if [ -z "$DRAFT_ID" ]; then
      echo -e "${YELLOW}⚠️  数据库中没有决策草案${NC}"
      exit 1
    fi
    echo -e "${GREEN}✅ 找到 draft_id: $DRAFT_ID${NC}"
  fi
fi

echo ""
echo "3. 测试 API 端点..."
echo ""

# 3. 测试获取决策草案（ToC 模式）
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3.1 GET /api/decision-draft/:draftId"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_BASE_URL/api/decision-draft/$DRAFT_ID" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ 请求成功 (HTTP $HTTP_CODE)${NC}"
  DRAFT_ID_RESULT=$(echo "$BODY" | grep -o '"draft_id":"[^"]*"' | cut -d'"' -f4 || echo "")
  USER_MODE=$(echo "$BODY" | grep -o '"user_mode":"[^"]*"' | cut -d'"' -f4 || echo "")
  echo "  draft_id: $DRAFT_ID_RESULT"
  echo "  user_mode: $USER_MODE"
else
  echo -e "${RED}❌ 请求失败 (HTTP $HTTP_CODE)${NC}"
  echo "$BODY" | head -10
fi

# 4. 测试获取决策解释（ToC 模式）
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3.2 GET /api/decision-draft/:draftId/explanation?mode=toc"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_BASE_URL/api/decision-draft/$DRAFT_ID/explanation?mode=toc" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ 请求成功 (HTTP $HTTP_CODE)${NC}"
  SUMMARY=$(echo "$BODY" | grep -o '"summary":"[^"]*"' | cut -d'"' -f4 || echo "")
  DECISION_COUNT=$(echo "$BODY" | grep -o '"decision_count":[0-9]*' | cut -d: -f2 || echo "")
  echo "  summary: $SUMMARY"
  echo "  decision_count: $DECISION_COUNT"
else
  echo -e "${RED}❌ 请求失败 (HTTP $HTTP_CODE)${NC}"
  echo "$BODY" | head -10
fi

# 5. 测试获取决策解释（Expert 模式）
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3.3 GET /api/decision-draft/:draftId/explanation?mode=expert"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_BASE_URL/api/decision-draft/$DRAFT_ID/explanation?mode=expert" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ 请求成功 (HTTP $HTTP_CODE)${NC}"
  HAS_STEP_DRAFTS=$(echo "$BODY" | grep -c '"step_drafts"' || echo "0")
  HAS_EVIDENCE_CHAIN=$(echo "$BODY" | grep -c '"evidence_chain"' || echo "0")
  echo "  包含 step_drafts: $([ "$HAS_STEP_DRAFTS" -gt 0 ] && echo "是" || echo "否")"
  echo "  包含 evidence_chain: $([ "$HAS_EVIDENCE_CHAIN" -gt 0 ] && echo "是" || echo "否")"
else
  echo -e "${RED}❌ 请求失败 (HTTP $HTTP_CODE)${NC}"
  echo "$BODY" | head -10
fi

# 6. 测试获取版本列表
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3.4 GET /api/decision-draft/:draftId/versions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_BASE_URL/api/decision-draft/$DRAFT_ID/versions" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ 请求成功 (HTTP $HTTP_CODE)${NC}"
  VERSION_COUNT=$(echo "$BODY" | grep -o '"versions":\[' | wc -l || echo "0")
  echo "  版本列表获取成功"
else
  echo -e "${RED}❌ 请求失败 (HTTP $HTTP_CODE)${NC}"
  echo "$BODY" | head -10
fi

# 7. 测试Studio模式API（需要权限，可能返回 403）
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3.5 GET /api/decision-draft/:draftId/debug-info (Studio 模式)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_BASE_URL/api/decision-draft/$DRAFT_ID/debug-info" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ 请求成功 (HTTP $HTTP_CODE)${NC}"
  HAS_DEBUG_INFO=$(echo "$BODY" | grep -c '"debug_info"' || echo "0")
  echo "  包含 debug_info: $([ "$HAS_DEBUG_INFO" -gt 0 ] && echo "是" || echo "否")"
elif [ "$HTTP_CODE" = "403" ]; then
  echo -e "${YELLOW}⚠️  权限不足 (HTTP $HTTP_CODE) - 这是预期的，需要 Studio 权限${NC}"
else
  echo -e "${RED}❌ 请求失败 (HTTP $HTTP_CODE)${NC}"
  echo "$BODY" | head -10
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ API 验证完成！${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
