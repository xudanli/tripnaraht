#!/bin/bash
# 新功能 API 接口测试脚本（Shell 版本）
#
# 使用方法：
#   ./scripts/test-new-features-api.sh
#   ./scripts/test-new-features-api.sh --skip-workflow
#   ./scripts/test-new-features-api.sh --base-url=http://localhost:3000

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_BASE="${BASE_URL}/api"
SKIP_WORKFLOW=false

# 解析参数
for arg in "$@"; do
  case $arg in
    --skip-workflow)
      SKIP_WORKFLOW=true
      shift
      ;;
    --base-url=*)
      BASE_URL="${arg#*=}"
      API_BASE="${BASE_URL}/api"
      shift
      ;;
    *)
      echo "未知参数: $arg"
      exit 1
      ;;
  esac
done

echo "=================================================================================="
echo "新功能 API 接口测试"
echo "=================================================================================="
echo "基础 URL: $API_BASE"
echo "跳过工作流测试: $([ "$SKIP_WORKFLOW" = true ] && echo '是' || echo '否')"
echo ""

# 检查服务器连接
echo "🔍 检查服务器连接..."
if ! curl -s -f "${API_BASE}/rag/stats" > /dev/null 2>&1; then
  echo "❌ 无法连接到服务器: $API_BASE"
  echo "   请确保服务器正在运行: npm run start:dev"
  exit 1
fi
echo "✅ 服务器连接正常"
echo ""

# 测试计数器
PASSED=0
FAILED=0

# 测试函数
test_api() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local data="$4"
  
  echo "🧪 测试: $name"
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" "${API_BASE}${endpoint}")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "${API_BASE}${endpoint}")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo "✅ 通过 (HTTP $http_code)"
    ((PASSED++))
    return 0
  else
    echo "❌ 失败 (HTTP $http_code)"
    echo "   响应: $(echo "$body" | head -c 200)"
    ((FAILED++))
    return 1
  fi
}

# ==================== 后端管理系统接口测试 ====================

if [ "$SKIP_WORKFLOW" != "true" ]; then
  # 1. 迭代部署工作流
  test_api \
    "执行迭代部署工作流" \
    "POST" \
    "/training/workflows/execute" \
    '{"minScore":0.8,"minReward":0,"batchSize":10,"autoDeploy":false}'
else
  echo "⏭️  跳过工作流测试"
fi

# 2. 模型版本 A/B 测试
EXPERIMENT_ID=$(test_api \
  "创建模型版本对比实验" \
  "POST" \
  "/training/models/ab-test/create" \
  '{"name":"测试实验","description":"测试","controlVersion":"v1.0.0","treatmentVersion":"v1.1.0","trafficSplit":{"control":50,"treatment":50},"successMetrics":["accuracy"]}' \
  | grep -o '"experimentId":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ -n "$EXPERIMENT_ID" ]; then
  test_api \
    "分析模型版本对比结果" \
    "POST" \
    "/training/models/ab-test/analyze" \
    "{\"experimentId\":\"$EXPERIMENT_ID\",\"controlVersion\":\"v1.0.0\",\"treatmentVersion\":\"v1.1.0\"}"
fi

# 3. RAG 检索质量评估
test_api \
  "评估单次检索质量" \
  "POST" \
  "/rag/evaluation/evaluate" \
  '{"query":"测试查询","params":{"query":"测试查询","collection":"compliance","limit":10},"groundTruthDocumentIds":["doc-test-1"]}'

test_api \
  "批量评估检索质量" \
  "POST" \
  "/rag/evaluation/evaluate-batch" \
  '{"testCases":[{"query":"测试查询","params":{"query":"测试查询","collection":"compliance","limit":10},"groundTruthDocumentIds":["doc-test-1"]}]}'

# 4. query-document 对收集
test_api \
  "手动收集 query-document 对" \
  "POST" \
  "/rag/query-pairs/collect" \
  '{"query":"测试查询","correctDocumentIds":["doc-test-1"],"metadata":{"source":"MANUAL_ANNOTATION}}'

test_api \
  "从用户查询自动收集" \
  "POST" \
  "/rag/query-pairs/collect-from-query" \
  '{"query":"测试查询","retrievedResults":[{"id":"doc-test-1","score":0.85}],"userFeedback":{"clickedDocumentIds":["doc-test-1"]}}'

test_api \
  "批量收集 query-document 对" \
  "POST" \
  "/rag/query-pairs/collect-batch" \
  '{"pairs":[{"query":"测试查询","correctDocumentIds":["doc-test-1"]}]}'

test_api \
  "获取收集的 query-document 对" \
  "GET" \
  "/rag/query-pairs?limit=10" \
  ""

test_api \
  "导出为评估数据集格式" \
  "POST" \
  "/rag/query-pairs/export-for-evaluation" \
  '{"pairs":[{"query":"测试查询","correctDocumentIds":["doc-test-1"]}]}'

# ==================== 前端用户系统接口测试 ====================

test_api \
  "前端：收集用户查询反馈" \
  "POST" \
  "/rag/query-pairs/collect-from-query" \
  '{"query":"测试查询","retrievedResults":[{"id":"doc-test-1","score":0.85}],"userFeedback":{"clickedDocumentIds":["doc-test-1"]}}'

# ==================== 打印测试结果 ====================

echo ""
echo "=================================================================================="
echo "测试结果汇总"
echo "=================================================================================="
echo "总计: $((PASSED + FAILED)) 个测试"
echo "✅ 通过: $PASSED"
echo "❌ 失败: $FAILED"
echo "=================================================================================="

if [ $FAILED -gt 0 ]; then
  exit 1
fi
