#!/bin/bash

# 测试决策草案 API 验证脚本
# 用于验证后端 API 是否正常工作

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
DRAFT_ID="${DRAFT_ID:-}"

echo "🔍 开始验证决策草案 API..."
echo "API Base URL: $API_BASE_URL"
echo ""

# 1. 检查服务是否运行
echo "1. 检查服务状态..."
if curl -s "$API_BASE_URL" > /dev/null 2>&1; then
  echo "✅ 服务正在运行"
else
  echo "❌ 服务未运行，请先启动服务"
  exit 1
fi

# 2. 如果没有提供 DRAFT_ID，从数据库获取一个
if [ -z "$DRAFT_ID" ]; then
  echo "2. 从数据库获取测试用的 draft_id..."
  if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL 未设置，跳过数据库查询"
  else
    DRAFT_ID=$(psql "$DATABASE_URL" -tAc "SELECT draft_id FROM decision_drafts LIMIT 1;" 2>/dev/null || echo "")
    if [ -z "$DRAFT_ID" ]; then
      echo "⚠️  数据库中没有决策草案，跳过 API 测试"
      exit 0
    fi
    echo "✅ 找到 draft_id: $DRAFT_ID"
  fi
fi

if [ -z "$DRAFT_ID" ]; then
  echo "⚠️  没有可用的 draft_id，跳过 API 测试"
  exit 0
fi

echo ""
echo "3. 测试 API 端点..."

# 3. 测试获取决策草案（ToC 模式）
echo ""
echo "3.1 测试 GET /api/decision-draft/:draftId (ToC 模式)"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_BASE_URL/api/decision-draft/$DRAFT_ID" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ 请求成功 (HTTP $HTTP_CODE)"
  echo "$BODY" | jq -r '.draft_id, .user_mode' 2>/dev/null || echo "$BODY" | head -5
else
  echo "❌ 请求失败 (HTTP $HTTP_CODE)"
  echo "$BODY" | head -10
fi

# 4. 测试获取决策解释（ToC 模式）
echo ""
echo "3.2 测试 GET /api/decision-draft/:draftId/explanation?mode=toc"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_BASE_URL/api/decision-draft/$DRAFT_ID/explanation?mode=toc" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ 请求成功 (HTTP $HTTP_CODE)"
  echo "$BODY" | jq -r '.summary, .decision_count' 2>/dev/null || echo "$BODY" | head -5
else
  echo "❌ 请求失败 (HTTP $HTTP_CODE)"
  echo "$BODY" | head -10
fi

# 5. 测试获取版本列表
echo ""
echo "3.3 测试 GET /api/decision-draft/:draftId/versions"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_BASE_URL/api/decision-draft/$DRAFT_ID/versions" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ 请求成功 (HTTP $HTTP_CODE)"
  echo "$BODY" | jq -r '.versions | length' 2>/dev/null || echo "$BODY" | head -5
else
  echo "❌ 请求失败 (HTTP $HTTP_CODE)"
  echo "$BODY" | head -10
fi

echo ""
echo "✅ API 验证完成！"
