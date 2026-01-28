#!/bin/bash

# 规划工作台准备度入口测试脚本
# 使用方法: ./scripts/test-planning-workbench-readiness.sh [tripId]

set -e

BASE_URL="${API_BASE_URL:-http://localhost:3000/api}"

echo "=========================================="
echo "规划工作台准备度入口测试"
echo "=========================================="
echo ""
echo "Base URL: $BASE_URL"
echo ""

# 检查服务是否运行
echo "【检查】服务状态"
echo "----------------------------------------"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/planning-workbench/trips/test/readiness" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "400" ]; then
  echo "✅ 服务运行正常 (HTTP $HTTP_CODE)"
else
  echo "❌ 服务未运行或不可访问 (HTTP $HTTP_CODE)"
  echo "请确保服务已启动: npm run start:dev"
  exit 1
fi
echo ""

# 获取 tripId（从参数或自动获取）
TRIP_ID="${1:-}"
if [ -z "$TRIP_ID" ]; then
  echo "【获取】查找测试行程 ID"
  echo "----------------------------------------"
  TRIP_ID=$(curl -s "${BASE_URL}/trips?limit=1" | jq -r '.data[0].id // empty' 2>/dev/null)
  if [ -z "$TRIP_ID" ] || [ "$TRIP_ID" = "null" ] || [ "$TRIP_ID" = "" ]; then
    echo "⚠️  未找到测试行程，请手动提供 tripId:"
    echo "  ./scripts/test-planning-workbench-readiness.sh <tripId>"
    exit 1
  fi
  echo "找到行程 ID: $TRIP_ID"
else
  echo "使用提供的行程 ID: $TRIP_ID"
fi
echo ""

# 测试结果统计
PASSED=0
FAILED=0
SKIPPED=0

# 测试 1: 获取行程准备度检查结果（中文）
echo "【测试 1】获取行程准备度检查结果（中文）"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/planning-workbench/trips/${TRIP_ID}/readiness?lang=zh")
if [ -n "$RESPONSE" ]; then
  if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    SUMMARY=$(echo "$RESPONSE" | jq -r '.data.summary // {}')
    FINDINGS_COUNT=$(echo "$RESPONSE" | jq -r '.data.findings | length // 0')
    READINESS_URL=$(echo "$RESPONSE" | jq -r '.data.readinessUrl // "N/A"')
    
    echo "✅ 准备度检查接口测试通过"
    echo "  检查结果数量: $FINDINGS_COUNT"
    echo "  阻塞项: $(echo "$SUMMARY" | jq -r '.totalBlockers // 0')"
    echo "  必须项: $(echo "$SUMMARY" | jq -r '.totalMust // 0')"
    echo "  建议项: $(echo "$SUMMARY" | jq -r '.totalShould // 0')"
    echo "  可选项: $(echo "$SUMMARY" | jq -r '.totalOptional // 0')"
    echo "  准备度 URL: $READINESS_URL"
    
    # 检查 quickLinks
    QUICK_LINKS=$(echo "$RESPONSE" | jq -r '.data.quickLinks // {}')
    if [ "$QUICK_LINKS" != "{}" ]; then
      echo "  ✅ 快速链接已提供"
      echo "$QUICK_LINKS" | jq -r 'to_entries[] | "    - \(.key): \(.value)"'
    else
      echo "  ⚠️  快速链接未提供"
    fi
    
    PASSED=$((PASSED + 1))
  else
    ERROR=$(echo "$RESPONSE" | jq -r '.error.message // "Unknown error"')
    echo "❌ 准备度检查接口测试失败: $ERROR"
    echo "  响应: $RESPONSE"
    FAILED=$((FAILED + 1))
  fi
else
  echo "❌ 无响应"
  FAILED=$((FAILED + 1))
fi
echo ""

# 测试 2: 获取行程准备度检查结果（英文）
echo "【测试 2】获取行程准备度检查结果（英文）"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/planning-workbench/trips/${TRIP_ID}/readiness?lang=en")
if [ -n "$RESPONSE" ]; then
  if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    SUMMARY=$(echo "$RESPONSE" | jq -r '.data.summary // {}')
    echo "✅ 准备度检查接口测试通过（英文）"
    echo "  阻塞项: $(echo "$SUMMARY" | jq -r '.totalBlockers // 0')"
    echo "  必须项: $(echo "$SUMMARY" | jq -r '.totalMust // 0')"
    PASSED=$((PASSED + 1))
  else
    ERROR=$(echo "$RESPONSE" | jq -r '.error.message // "Unknown error"')
    echo "❌ 准备度检查接口测试失败: $ERROR"
    FAILED=$((FAILED + 1))
  fi
else
  echo "❌ 无响应"
  FAILED=$((FAILED + 1))
fi
echo ""

# 测试 3: 获取准备度分数链接
echo "【测试 3】获取准备度分数链接"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/planning-workbench/trips/${TRIP_ID}/readiness/score")
if [ -n "$RESPONSE" ]; then
  if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    SCORE_URL=$(echo "$RESPONSE" | jq -r '.data.readinessScoreUrl // "N/A"')
    CHECKLIST_URL=$(echo "$RESPONSE" | jq -r '.data.readinessChecklistUrl // "N/A"')
    RISK_URL=$(echo "$RESPONSE" | jq -r '.data.readinessRiskWarningsUrl // "N/A"')
    COVERAGE_URL=$(echo "$RESPONSE" | jq -r '.data.readinessCoverageMapUrl // "N/A"')
    
    echo "✅ 准备度分数链接接口测试通过"
    echo "  准备度分数 URL: $SCORE_URL"
    echo "  准备清单 URL: $CHECKLIST_URL"
    echo "  风险预警 URL: $RISK_URL"
    echo "  覆盖地图 URL: $COVERAGE_URL"
    
    PASSED=$((PASSED + 1))
  else
    ERROR=$(echo "$RESPONSE" | jq -r '.error.message // "Unknown error"')
    echo "❌ 准备度分数链接接口测试失败: $ERROR"
    FAILED=$((FAILED + 1))
  fi
else
  echo "❌ 无响应"
  FAILED=$((FAILED + 1))
fi
echo ""

# 测试 4: 验证快速链接是否可访问（可选）
echo "【测试 4】验证快速链接可访问性（可选）"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/planning-workbench/trips/${TRIP_ID}/readiness")
if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
  CHECKLIST_URL=$(echo "$RESPONSE" | jq -r '.data.quickLinks.personalizedChecklist // ""')
  if [ -n "$CHECKLIST_URL" ] && [ "$CHECKLIST_URL" != "null" ]; then
    # 测试准备清单链接
    CHECKLIST_RESPONSE=$(curl -s "${BASE_URL}${CHECKLIST_URL#/api}")
    if echo "$CHECKLIST_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
      echo "✅ 准备清单链接可访问"
      PASSED=$((PASSED + 1))
    else
      echo "⚠️  准备清单链接返回错误（可能正常，如果行程未完全设置）"
      SKIPPED=$((SKIPPED + 1))
    fi
  else
    echo "⚠️  快速链接未提供，跳过验证"
    SKIPPED=$((SKIPPED + 1))
  fi
else
  echo "⚠️  无法获取快速链接，跳过验证"
  SKIPPED=$((SKIPPED + 1))
fi
echo ""

# 测试总结
echo "=========================================="
echo "测试总结"
echo "=========================================="
echo ""
echo "测试结果:"
echo "  ✅ 通过: $PASSED"
echo "  ❌ 失败: $FAILED"
echo "  ⚠️  跳过: $SKIPPED"
echo ""
echo "已测试接口:"
echo "  1. GET /api/planning-workbench/trips/:tripId/readiness (中文)"
echo "  2. GET /api/planning-workbench/trips/:tripId/readiness (英文)"
echo "  3. GET /api/planning-workbench/trips/:tripId/readiness/score"
echo "  4. 验证快速链接可访问性"
echo ""
echo "测试行程 ID: $TRIP_ID"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ 所有测试通过！"
  exit 0
else
  echo "❌ 部分测试失败"
  exit 1
fi
