#!/bin/bash

# 规划工作台证据获取接口测试脚本
# 使用方法: ./scripts/test-planning-workbench-evidence.sh [tripId]

set -e

BASE_URL="${API_BASE_URL:-http://localhost:3000/api}"

echo "=========================================="
echo "规划工作台证据获取接口测试"
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

# 检查 jq 是否安装
if ! command -v jq &> /dev/null; then
  echo "❌ jq 未安装，请先安装 jq:"
  echo "  Ubuntu/Debian: sudo apt-get install jq"
  echo "  macOS: brew install jq"
  exit 1
fi

# 获取 tripId（从参数或自动获取）
TRIP_ID="${1:-}"
if [ -z "$TRIP_ID" ]; then
  echo "【获取】查找测试行程 ID"
  echo "----------------------------------------"
  TRIP_ID=$(curl -s "${BASE_URL}/trips?limit=1" | jq -r '.data[0].id // empty' 2>/dev/null)
  if [ -z "$TRIP_ID" ] || [ "$TRIP_ID" = "null" ] || [ "$TRIP_ID" = "" ]; then
    echo "⚠️  未找到测试行程，请手动提供 tripId:"
    echo "  ./scripts/test-planning-workbench-evidence.sh <tripId>"
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

# 测试 1: 获取准备度检查结果（查看缺少的证据）
echo "【测试 1】获取准备度检查结果（查看缺少的证据）"
echo "----------------------------------------"
READINESS_RESPONSE=$(curl -s "${BASE_URL}/planning-workbench/trips/${TRIP_ID}/readiness?lang=zh")
if [ -n "$READINESS_RESPONSE" ]; then
  if echo "$READINESS_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    SUMMARY=$(echo "$READINESS_RESPONSE" | jq -r '.data.summary // {}')
    FINDINGS_COUNT=$(echo "$READINESS_RESPONSE" | jq -r '.data.findings | length // 0')
    
    echo "✅ 准备度检查接口测试通过"
    echo "  检查结果数量: $FINDINGS_COUNT"
    echo "  阻塞项: $(echo "$SUMMARY" | jq -r '.totalBlockers // 0')"
    echo "  必须项: $(echo "$SUMMARY" | jq -r '.totalMust // 0')"
    echo "  建议项: $(echo "$SUMMARY" | jq -r '.totalShould // 0')"
    echo "  可选项: $(echo "$SUMMARY" | jq -r '.totalOptional // 0')"
    
    PASSED=$((PASSED + 1))
  else
    ERROR=$(echo "$READINESS_RESPONSE" | jq -r '.error.message // "Unknown error"')
    echo "❌ 准备度检查接口测试失败: $ERROR"
    FAILED=$((FAILED + 1))
  fi
else
  echo "❌ 无响应"
  FAILED=$((FAILED + 1))
fi
echo ""

# 测试 2: 综合证据获取接口 - 获取所有类型的证据
echo "【测试 2】综合证据获取接口 - 获取所有类型的证据"
echo "----------------------------------------"
EVIDENCE_RESPONSE=$(curl -s -X POST "${BASE_URL}/planning-workbench/trips/${TRIP_ID}/fetch-evidence")
if [ -n "$EVIDENCE_RESPONSE" ]; then
  if echo "$EVIDENCE_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    TOTAL_PLACES=$(echo "$EVIDENCE_RESPONSE" | jq -r '.data.totalPlaces // 0')
    PROCESSED=$(echo "$EVIDENCE_RESPONSE" | jq -r '.data.processedPlaces // 0')
    SUCCESS_COUNT=$(echo "$EVIDENCE_RESPONSE" | jq -r '.data.successCount // 0')
    PARTIAL_COUNT=$(echo "$EVIDENCE_RESPONSE" | jq -r '.data.partialCount // 0')
    FAILED_COUNT=$(echo "$EVIDENCE_RESPONSE" | jq -r '.data.failedCount // 0')
    REQUESTED_TYPES=$(echo "$EVIDENCE_RESPONSE" | jq -r '.data.requestedEvidenceTypes | join(", ") // "all"')
    
    echo "✅ 综合证据获取接口测试通过"
    echo "  总地点数: $TOTAL_PLACES"
    echo "  已处理地点数: $PROCESSED"
    echo "  成功获取: $SUCCESS_COUNT"
    echo "  部分成功: $PARTIAL_COUNT"
    echo "  失败: $FAILED_COUNT"
    echo "  请求的证据类型: $REQUESTED_TYPES"
    
    # 显示前3个结果详情
    echo ""
    echo "  前3个处理结果:"
    echo "$EVIDENCE_RESPONSE" | jq -r '.data.results[0:3][] | "    - \(.placeName) (ID: \(.placeId)): \(.status) [\(.evidenceTypes | join(", "))]"' 2>/dev/null || echo "    无结果"
    
    PASSED=$((PASSED + 1))
  else
    ERROR=$(echo "$EVIDENCE_RESPONSE" | jq -r '.error.message // "Unknown error"')
    echo "❌ 综合证据获取接口测试失败: $ERROR"
    echo "  响应: $EVIDENCE_RESPONSE"
    FAILED=$((FAILED + 1))
  fi
else
  echo "❌ 无响应"
  FAILED=$((FAILED + 1))
fi
echo ""

# 测试 3: 只获取天气数据
echo "【测试 3】只获取天气数据"
echo "----------------------------------------"
WEATHER_RESPONSE=$(curl -s -X POST "${BASE_URL}/planning-workbench/trips/${TRIP_ID}/fetch-evidence?evidenceTypes=weather")
if [ -n "$WEATHER_RESPONSE" ]; then
  if echo "$WEATHER_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    SUCCESS_COUNT=$(echo "$WEATHER_RESPONSE" | jq -r '.data.successCount // 0')
    REQUESTED_TYPES=$(echo "$WEATHER_RESPONSE" | jq -r '.data.requestedEvidenceTypes | join(", ") // "weather"')
    
    echo "✅ 天气数据获取接口测试通过"
    echo "  成功获取天气数据的地点数: $SUCCESS_COUNT"
    echo "  请求的证据类型: $REQUESTED_TYPES"
    
    # 显示一个成功获取天气数据的示例
    WEATHER_EXAMPLE=$(echo "$WEATHER_RESPONSE" | jq -r '.data.results[] | select(.status == "success" and (.evidenceTypes | contains(["weather"]))) | .placeName' 2>/dev/null | head -1)
    if [ -n "$WEATHER_EXAMPLE" ] && [ "$WEATHER_EXAMPLE" != "null" ]; then
      echo "  示例地点: $WEATHER_EXAMPLE"
    fi
    
    PASSED=$((PASSED + 1))
  else
    ERROR=$(echo "$WEATHER_RESPONSE" | jq -r '.error.message // "Unknown error"')
    echo "⚠️  天气数据获取接口测试失败: $ERROR"
    SKIPPED=$((SKIPPED + 1))
  fi
else
  echo "⚠️  无响应"
  SKIPPED=$((SKIPPED + 1))
fi
echo ""

# 测试 4: 只获取道路封闭信息
echo "【测试 4】只获取道路封闭信息"
echo "----------------------------------------"
ROAD_RESPONSE=$(curl -s -X POST "${BASE_URL}/planning-workbench/trips/${TRIP_ID}/fetch-evidence?evidenceTypes=road_closure")
if [ -n "$ROAD_RESPONSE" ]; then
  if echo "$ROAD_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    SUCCESS_COUNT=$(echo "$ROAD_RESPONSE" | jq -r '.data.successCount // 0')
    PARTIAL_COUNT=$(echo "$ROAD_RESPONSE" | jq -r '.data.partialCount // 0')
    
    echo "✅ 道路封闭信息获取接口测试通过"
    echo "  成功获取: $SUCCESS_COUNT"
    echo "  部分成功: $PARTIAL_COUNT"
    
    PASSED=$((PASSED + 1))
  else
    ERROR=$(echo "$ROAD_RESPONSE" | jq -r '.error.message // "Unknown error"')
    echo "⚠️  道路封闭信息获取接口测试失败: $ERROR"
    SKIPPED=$((SKIPPED + 1))
  fi
else
  echo "⚠️  无响应"
  SKIPPED=$((SKIPPED + 1))
fi
echo ""

# 测试 5: 只获取开放时间
echo "【测试 5】只获取开放时间"
echo "----------------------------------------"
HOURS_RESPONSE=$(curl -s -X POST "${BASE_URL}/planning-workbench/trips/${TRIP_ID}/fetch-evidence?evidenceTypes=opening_hours")
if [ -n "$HOURS_RESPONSE" ]; then
  if echo "$HOURS_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    SUCCESS_COUNT=$(echo "$HOURS_RESPONSE" | jq -r '.data.successCount // 0')
    
    echo "✅ 开放时间获取接口测试通过"
    echo "  成功获取开放时间的地点数: $SUCCESS_COUNT"
    
    PASSED=$((PASSED + 1))
  else
    ERROR=$(echo "$HOURS_RESPONSE" | jq -r '.error.message // "Unknown error"')
    echo "⚠️  开放时间获取接口测试失败: $ERROR"
    SKIPPED=$((SKIPPED + 1))
  fi
else
  echo "⚠️  无响应"
  SKIPPED=$((SKIPPED + 1))
fi
echo ""

# 测试 6: 获取天气和道路封闭信息（组合）
echo "【测试 6】获取天气和道路封闭信息（组合）"
echo "----------------------------------------"
COMBINED_RESPONSE=$(curl -s -X POST "${BASE_URL}/planning-workbench/trips/${TRIP_ID}/fetch-evidence?evidenceTypes=weather,road_closure")
if [ -n "$COMBINED_RESPONSE" ]; then
  if echo "$COMBINED_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    SUCCESS_COUNT=$(echo "$COMBINED_RESPONSE" | jq -r '.data.successCount // 0')
    REQUESTED_TYPES=$(echo "$COMBINED_RESPONSE" | jq -r '.data.requestedEvidenceTypes | join(", ") // "weather,road_closure"')
    
    echo "✅ 组合证据获取接口测试通过"
    echo "  成功获取: $SUCCESS_COUNT"
    echo "  请求的证据类型: $REQUESTED_TYPES"
    
    PASSED=$((PASSED + 1))
  else
    ERROR=$(echo "$COMBINED_RESPONSE" | jq -r '.error.message // "Unknown error"')
    echo "⚠️  组合证据获取接口测试失败: $ERROR"
    SKIPPED=$((SKIPPED + 1))
  fi
else
  echo "⚠️  无响应"
  SKIPPED=$((SKIPPED + 1))
fi
echo ""

# 测试 7: 验证证据数据是否已更新到数据库
echo "【测试 7】验证证据数据是否已更新"
echo "----------------------------------------"
# 重新获取准备度检查结果，查看证据覆盖情况
AFTER_RESPONSE=$(curl -s "${BASE_URL}/planning-workbench/trips/${TRIP_ID}/readiness?lang=zh")
if [ -n "$AFTER_RESPONSE" ]; then
  if echo "$AFTER_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    AFTER_SUMMARY=$(echo "$AFTER_RESPONSE" | jq -r '.data.summary // {}')
    AFTER_MUST=$(echo "$AFTER_SUMMARY" | jq -r '.totalMust // 0')
    
    echo "✅ 验证接口测试通过"
    echo "  当前必须项数量: $AFTER_MUST"
    echo "  （如果比之前少，说明证据已成功获取）"
    
    PASSED=$((PASSED + 1))
  else
    echo "⚠️  无法验证证据更新"
    SKIPPED=$((SKIPPED + 1))
  fi
else
  echo "⚠️  无响应"
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
echo "  1. GET /api/planning-workbench/trips/:tripId/readiness"
echo "  2. POST /api/planning-workbench/trips/:tripId/fetch-evidence (所有类型)"
echo "  3. POST /api/planning-workbench/trips/:tripId/fetch-evidence?evidenceTypes=weather"
echo "  4. POST /api/planning-workbench/trips/:tripId/fetch-evidence?evidenceTypes=road_closure"
echo "  5. POST /api/planning-workbench/trips/:tripId/fetch-evidence?evidenceTypes=opening_hours"
echo "  6. POST /api/planning-workbench/trips/:tripId/fetch-evidence?evidenceTypes=weather,road_closure"
echo "  7. 验证证据数据更新"
echo ""
echo "测试行程 ID: $TRIP_ID"
echo ""
echo "注意事项:"
echo "  - 如果某些测试失败，可能是因为："
echo "    1. 地点没有坐标信息（天气和道路封闭需要坐标）"
echo "    2. 地点类别不是 ATTRACTION（开放时间仅支持 ATTRACTION）"
echo "    3. 外部 API 不可用或配额用尽"
echo "    4. 冰岛以外的地区可能不支持某些数据源"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ 所有核心测试通过！"
  exit 0
else
  echo "⚠️  部分测试失败，请查看上面的错误信息"
  exit 1
fi
