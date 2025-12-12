#!/bin/bash

# scripts/test-us-mapbox.sh
# 说明：修复 HTTP_CODE 取值与比较；失败时给出可读错误与原文/JSON回退。
# 仅在关键处注释"为什么"。

set -euo pipefail

BASE_URL="http://127.0.0.1:3000"
URL1="$BASE_URL/places/overpass/US?tourismTypes=attraction,museum,viewpoint"
URL2="$BASE_URL/places/overpass/US?tourismTypes=attraction"
URL3="$BASE_URL/places/overpass/US?tourismTypes=museum"

# 复用函数：发起请求，返回三件事：HTTP_CODE、BODY_FILE、ERR_FILE
request() {
  local url="$1"
  local body_file err_file code_file code raw
  
  body_file="$(mktemp)"
  err_file="$(mktemp)"
  code_file="$(mktemp)"

  # why: 失败时 echo 000，保证始终有输出；-4 避免 ::1 绑定问题
  # curl -w 输出到 stdout，响应体输出到 -o 文件，stderr 输出到 err_file
  # 所以需要把 -w 的输出重定向到 code_file
  if curl -4 -sS \
    --connect-timeout 3 \
    --max-time 30 \
    --retry 0 \
    -o "$body_file" \
    -w '%{http_code}' \
    "$url" 2>"$err_file" >"$code_file"; then
    raw="$(cat "$code_file" 2>/dev/null || echo "")"
  else
    raw="000"
  fi
  
  rm -f "$code_file"

  # 只留数字；防止 '%{http_code}' 后误拼了文字/换行
  code="${raw//[^0-9]/}"

  # 兜底：为空时也视为 000
  if [ -z "$code" ]; then code="000"; fi
  
  # 如果 code 长度超过 3，取最后 3 位（处理可能的异常情况）
  if [ ${#code} -gt 3 ]; then
    code="${code: -3}"
  fi

  echo "$code|$body_file|$err_file"
}

pretty_or_raw_head() {
  local file="$1" lines="${2:-80}"
  if jq -e . >/dev/null 2>&1 < "$file"; then
    jq '.' "$file" | head -"$lines"
  else
    sed -n "1,${lines}p" "$file"
  fi
}

run_test() {
  local name="$1" desc="$2" url="$3"
  echo "----------------------------------------"
  echo "🧪 $name"
  echo "描述: $desc"
  
  local out code body err
  out="$(request "$url")"
  IFS='|' read -r code body err <<<"$out"

  echo "状态码: $code"
  
  if [[ ! "$code" =~ ^[0-9]{3}$ ]]; then
    echo "❌ 失败（无效状态码：$code）"
    echo "curl 错误:"
    sed -n '1,20p' "$err"
    echo
    echo "响应预览:"
    sed -n '1,80p' "$body"
    rm -f "$body" "$err"
    return
  fi

  if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
    echo "✅ 成功"
    # 尝试显示结果数量
    if jq -e 'type == "array"' >/dev/null 2>&1 < "$body"; then
      count=$(jq 'length' "$body" 2>/dev/null || echo "N/A")
      echo "结果数量: $count"
      if [ "$count" != "0" ] && [ "$count" != "null" ] && [ "$count" != "N/A" ]; then
        echo "前几个结果："
        jq '.[0:3] | .[] | {name, nameEn, lat, lng, category, type}' "$body" 2>/dev/null | head -30
      else
        echo "⚠️  返回空数组"
      fi
    else
      pretty_or_raw_head "$body" 80
    fi
  else
    echo "❌ 失败 (HTTP $code)"
    echo "curl 错误:"
    sed -n '1,20p' "$err"
    echo
    echo "响应预览:"
    pretty_or_raw_head "$body" 80
  fi
  
  rm -f "$body" "$err"
  echo ""
}

echo "🇺🇸 测试美国 (US) 的 Google Places 接口..."
echo "=========================================="
echo ""

# === 测试用例 ===
run_test "测试 1: GET /places/overpass/US?tourismTypes=attraction" \
         "获取美国景点数据（attraction）" \
         "$URL2"

run_test "测试 2: GET /places/overpass/US?tourismTypes=museum" \
         "获取美国博物馆数据" \
         "$URL3"

run_test "测试 3: GET /places/overpass/US?tourismTypes=attraction,museum,viewpoint" \
         "获取美国所有类型景点" \
         "$URL1"

echo "=========================================="
echo "✅ 测试完成！"
