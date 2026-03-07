#!/bin/bash
# 自然语言创建行程 E2E 场景测试
# 用法: ./scripts/test-nl-trip-e2e-scenarios.sh [BASE_URL]
# 默认 BASE_URL=http://localhost:3000

set -e
BASE="${1:-http://localhost:3000}"
export API_BASE_URL="$BASE"
echo "=== 自然语言创建行程 E2E 场景测试 ==="
echo "BASE_URL=$BASE"
echo ""
npx tsx scripts/test-nl-trip-e2e-scenarios.ts
