#!/bin/bash

# 检查执行页面路由是否注册
# 使用方法: ./scripts/check-execution-routes.sh

BASE_URL="${1:-http://localhost:3000}"

echo "检查执行页面路由..."
echo ""

# 检查各个路由
routes=(
  "GET /api/execution/health"
  "POST /api/execution/execute"
  "POST /api/execution/reorder"
  "GET /api/execution/fallback/test/preview"
  "POST /api/execution/apply-fallback"
  "GET /api/trips/test/state"
  "GET /api/places/1/evidence"
)

for route in "${routes[@]}"; do
  method=$(echo $route | cut -d' ' -f1)
  path=$(echo $route | cut -d' ' -f2)
  
  echo -n "测试 $method $path ... "
  
  if [ "$method" = "GET" ]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" -X GET "${BASE_URL}${path}")
  else
    status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}${path}" \
      -H "Content-Type: application/json" \
      -d '{}')
  fi
  
  if [ "$status" = "404" ]; then
    echo "❌ 404 (路由未注册)"
  elif [ "$status" = "400" ] || [ "$status" = "500" ]; then
    echo "✅ $status (路由已注册，但请求参数错误)"
  elif [ "$status" = "200" ]; then
    echo "✅ $status (路由已注册)"
  else
    echo "⚠️  $status (未知状态)"
  fi
done

echo ""
echo "如果所有路由都返回404，请检查："
echo "1. 服务是否已重启"
echo "2. AgentModule是否正确加载"
echo "3. ExecutionController是否正确注册"
