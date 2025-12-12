#!/bin/bash

# 快速测试脚本 - 测试 Google Places API 端点
# 用法: ./test-places-quick.sh [国家代码]

set -euo pipefail

BASE_URL="http://127.0.0.1:3000"
COUNTRY="${1:-IS}"  # 默认测试冰岛
TIMEOUT="${2:-35}"  # 默认超时 35 秒

echo "🧪 测试 Google Places API"
echo "国家: $COUNTRY"
echo "超时: ${TIMEOUT}秒"
echo "=========================================="
echo ""

# 测试函数
test_endpoint() {
  local name="$1"
  local url="$2"
  
  echo "----------------------------------------"
  echo "🧪 $name"
  echo "URL: $url"
  
  local body_file err_file code_file code raw start_time elapsed
  
  body_file="$(mktemp)"
  err_file="$(mktemp)"
  code_file="$(mktemp)"
  start_time=$(date +%s.%N)
  
  if curl -4 -sS \
    --connect-timeout 3 \
    --max-time "$TIMEOUT" \
    --retry 0 \
    -o "$body_file" \
    -w '%{http_code}' \
    "$url" 2>"$err_file" >"$code_file"; then
    raw="$(cat "$code_file" 2>/dev/null || echo "")"
  else
    raw="000"
  fi
  
  end_time=$(date +%s.%N)
  elapsed=$(echo "$end_time - $start_time" | bc 2>/dev/null || echo "N/A")
  
  rm -f "$code_file"
  
  # 提取状态码
  code="${raw//[^0-9]/}"
  if [ -z "$code" ]; then code="000"; fi
  if [ ${#code} -gt 3 ]; then code="${code: -3}"; fi
  
  echo "状态码: $code"
  echo "耗时: ${elapsed}秒"
  
  if [[ ! "$code" =~ ^[0-9]{3}$ ]]; then
    echo "❌ 失败（无效状态码：$code）"
    echo "curl 错误:"
    sed -n '1,10p' "$err_file"
    rm -f "$body_file" "$err_file"
    return
  fi
  
  if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
    echo "✅ 成功"
    
    # 检查响应体
    if [ -s "$body_file" ]; then
      if jq -e . >/dev/null 2>&1 < "$body_file"; then
        count=$(jq 'length' "$body_file" 2>/dev/null || echo "0")
        echo "结果数量: $count"
        
        if [ "$count" != "0" ] && [ "$count" != "null" ]; then
          echo "前 3 个结果："
          jq '.[0:3] | .[] | {name, nameEn, lat, lng, category, type}' "$body_file" 2>/dev/null | head -20
        else
          echo "⚠️  返回空数组（可能是该国家/类型没有数据）"
        fi
      else
        echo "响应内容（非 JSON）："
        head -10 "$body_file"
      fi
    else
      echo "⚠️  响应体为空"
    fi
  else
    echo "❌ 失败 (HTTP $code)"
    if [ -s "$err_file" ]; then
      echo "curl 错误:"
      sed -n '1,10p' "$err_file"
    fi
    if [ -s "$body_file" ]; then
      echo "响应预览:"
      head -20 "$body_file"
    fi
  fi
  
  rm -f "$body_file" "$err_file"
  echo ""
}

# 测试不同端点
test_endpoint "测试 1: 获取景点 (attraction)" \
  "$BASE_URL/places/overpass/$COUNTRY?tourismTypes=attraction"

test_endpoint "测试 2: 获取博物馆 (museum)" \
  "$BASE_URL/places/overpass/$COUNTRY?tourismTypes=museum"

test_endpoint "测试 3: 获取所有类型" \
  "$BASE_URL/places/overpass/$COUNTRY?tourismTypes=attraction,museum,viewpoint"

echo "=========================================="
echo "✅ 测试完成！"
echo ""
echo "💡 提示："
echo "  - 测试其他国家: ./test-places-quick.sh US"
echo "  - 调整超时时间: ./test-places-quick.sh IS 60"

