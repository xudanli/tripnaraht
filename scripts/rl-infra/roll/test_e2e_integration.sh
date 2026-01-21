#!/bin/bash

# ROLL 端到端集成测试脚本
# 测试 TypeScript → Bridge Service → Ray Workers 完整流程

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

# 检查服务是否运行
check_service() {
    local url=$1
    local name=$2
    
    if curl -s "$url" > /dev/null 2>&1; then
        log_info "$name is running"
        return 0
    else
        log_error "$name is not running (URL: $url)"
        return 1
    fi
}

# 测试健康检查
test_health() {
    log_test "Testing health check..."
    
    response=$(curl -s http://localhost:8001/health)
    if echo "$response" | grep -q "healthy"; then
        log_info "Health check passed"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 0
    else
        log_error "Health check failed"
        return 1
    fi
}

# 测试 Actor-Worker
test_actor_worker() {
    log_test "Testing Actor-Worker..."
    
    request='{
        "request_id": "e2e-test-001",
        "user_request": "Plan a 7-day trip to Iceland",
        "state": {
            "origin": "Reykjavik",
            "destination": "Akureyri"
        },
        "action": "generate_itinerary",
        "params": {
            "duration": 7,
            "budget": 5000
        }
    }'
    
    response=$(curl -s -X POST http://localhost:8001/api/actor/generate-trajectory \
        -H "Content-Type: application/json" \
        -d "$request")
    
    if echo "$response" | grep -q "success"; then
        log_info "Actor-Worker test passed"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        echo "$response" > /tmp/actor_result.json
        return 0
    else
        log_error "Actor-Worker test failed"
        echo "$response"
        return 1
    fi
}

# 测试 Reward-Worker
test_reward_worker() {
    log_test "Testing Reward-Worker..."
    
    # 从之前的 Actor-Worker 结果获取轨迹
    if [ ! -f /tmp/actor_result.json ]; then
        log_error "No trajectory data found. Run Actor-Worker test first."
        return 1
    fi
    
    trajectory=$(cat /tmp/actor_result.json | jq -r '.trajectory')
    
    request=$(cat <<EOF
{
    "trajectory": $trajectory,
    "reward_config": {}
}
EOF
)
    
    response=$(curl -s -X POST http://localhost:8001/api/reward/compute \
        -H "Content-Type: application/json" \
        -d "$request")
    
    if echo "$response" | grep -q "success"; then
        log_info "Reward-Worker test passed"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 0
    else
        log_error "Reward-Worker test failed"
        echo "$response"
        return 1
    fi
}

# 测试 Policy-Worker
test_policy_worker() {
    log_test "Testing Policy-Worker..."
    
    request='{
        "user_request": "Plan a trip to Iceland",
        "origin": "Reykjavik",
        "destination": "Akureyri",
        "constraints": {
            "budget": 5000,
            "duration": 7
        },
        "preferences": {
            "pace": "moderate"
        }
    }'
    
    response=$(curl -s -X POST http://localhost:8001/api/policy/predict \
        -H "Content-Type: application/json" \
        -d "$request")
    
    if echo "$response" | grep -q "success"; then
        log_info "Policy-Worker test passed"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 0
    else
        log_error "Policy-Worker test failed"
        echo "$response"
        return 1
    fi
}

# 测试 Workers 状态
test_workers_status() {
    log_test "Testing Workers status..."
    
    response=$(curl -s http://localhost:8001/api/workers/status)
    if echo "$response" | grep -q "actor_workers"; then
        log_info "Workers status check passed"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 0
    else
        log_error "Workers status check failed"
        return 1
    fi
}

# 性能测试
test_performance() {
    log_test "Running performance test (10 iterations)..."
    
    total_time=0
    success_count=0
    
    for i in {1..10}; do
        start=$(date +%s%N)
        
        request=$(cat <<EOF
{
    "request_id": "perf-test-$i",
    "user_request": "Test request $i",
    "state": {},
    "action": "test_action",
    "params": {}
}
EOF
)
        
        response=$(curl -s -X POST http://localhost:8001/api/actor/generate-trajectory \
            -H "Content-Type: application/json" \
            -d "$request")
        
        end=$(date +%s%N)
        latency=$(( (end - start) / 1000000 )) # 转换为毫秒
        
        if echo "$response" | grep -q "success"; then
            success_count=$((success_count + 1))
            total_time=$((total_time + latency))
            echo "  Iteration $i: ${latency}ms"
        else
            echo "  Iteration $i: FAILED"
        fi
    done
    
    if [ $success_count -gt 0 ]; then
        avg_latency=$((total_time / success_count))
        log_info "Performance test completed:"
        log_info "  Success rate: $success_count/10"
        log_info "  Average latency: ${avg_latency}ms"
        
        if [ $avg_latency -lt 500 ]; then
            log_info "  ✅ Performance target met (< 500ms)"
        else
            log_warn "  ⚠️  Performance target not met (target: < 500ms)"
        fi
    else
        log_error "Performance test failed: no successful requests"
        return 1
    fi
}

# 主测试流程
main() {
    log_info "Starting ROLL E2E Integration Tests..."
    echo ""
    
    # 检查服务
    log_info "Checking services..."
    if ! check_service "http://localhost:8001/health" "Bridge Service"; then
        log_error "Please start Bridge Service first: ./start_roll_services.sh all"
        exit 1
    fi
    
    if ! check_service "http://localhost:8265" "Ray Dashboard"; then
        log_warn "Ray Dashboard not accessible (may still be starting)"
    fi
    
    echo ""
    
    # 运行测试
    tests_passed=0
    tests_failed=0
    
    # 1. 健康检查
    if test_health; then
        tests_passed=$((tests_passed + 1))
    else
        tests_failed=$((tests_failed + 1))
    fi
    echo ""
    
    # 2. Workers 状态
    if test_workers_status; then
        tests_passed=$((tests_passed + 1))
    else
        tests_failed=$((tests_failed + 1))
    fi
    echo ""
    
    # 3. Actor-Worker
    if test_actor_worker; then
        tests_passed=$((tests_passed + 1))
    else
        tests_failed=$((tests_failed + 1))
    fi
    echo ""
    
    # 4. Reward-Worker
    if test_reward_worker; then
        tests_passed=$((tests_passed + 1))
    else
        tests_failed=$((tests_failed + 1))
    fi
    echo ""
    
    # 5. Policy-Worker
    if test_policy_worker; then
        tests_passed=$((tests_passed + 1))
    else
        tests_failed=$((tests_failed + 1))
    fi
    echo ""
    
    # 6. 性能测试
    if test_performance; then
        tests_passed=$((tests_passed + 1))
    else
        tests_failed=$((tests_failed + 1))
    fi
    echo ""
    
    # 总结
    log_info "Test Summary:"
    log_info "  Passed: $tests_passed"
    log_info "  Failed: $tests_failed"
    echo ""
    
    if [ $tests_failed -eq 0 ]; then
        log_info "✅ All tests passed!"
        exit 0
    else
        log_error "❌ Some tests failed"
        exit 1
    fi
}

# 运行主函数
main
