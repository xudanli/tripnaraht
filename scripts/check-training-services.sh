#!/bin/bash
#
# TripNARA 训练服务状态检查脚本
#
# 检查所有训练相关服务的状态

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "TripNARA 训练服务状态检查"
echo "========================================"
echo ""

# 服务配置
TRAIN_URL=${TRAIN_SERVICE_URL:-http://localhost:8000}
VLLM_URL=${VLLM_URL:-http://localhost:8080}
JUDGE_URL=${LLM_JUDGE_URL:-http://localhost:8003}
MLFLOW_URL=${MLFLOW_URL:-http://localhost:5000}
NESTJS_URL=${NESTJS_URL:-http://localhost:3000}

check_service() {
    local name=$1
    local url=$2
    local health_path=${3:-/health}
    
    printf "%-20s " "$name"
    
    if curl -sf "$url$health_path" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 运行中${NC} ($url)"
        return 0
    else
        echo -e "${RED}❌ 不可用${NC} ($url)"
        return 1
    fi
}

echo "📦 服务状态："
echo ""

# 检查各服务
check_service "LoRA 训练服务" "$TRAIN_URL" "/health" || true
check_service "vLLM 推理服务" "$VLLM_URL" "/health" || true
check_service "LLM Judge 服务" "$JUDGE_URL" "/health" || true
check_service "MLflow" "$MLFLOW_URL" "/" || true
check_service "NestJS 后端" "$NESTJS_URL" "/api/training/health" || true

echo ""
echo "========================================"

# Docker 容器状态
if command -v docker &> /dev/null; then
    echo ""
    echo "🐳 Docker 容器状态："
    echo ""
    
    # 检查训练服务容器
    containers=("tripnara-train" "tripnara-vllm" "tripnara-llm-judge" "tripnara-mlflow" "tripnara-train-redis")
    
    for container in "${containers[@]}"; do
        printf "%-25s " "$container"
        if docker ps --format '{{.Names}}' | grep -q "^$container$"; then
            echo -e "${GREEN}✅ 运行中${NC}"
        elif docker ps -a --format '{{.Names}}' | grep -q "^$container$"; then
            echo -e "${YELLOW}⚠️ 已停止${NC}"
        else
            echo -e "${RED}❌ 不存在${NC}"
        fi
    done
    
    echo ""
    echo "========================================"
fi

# 端口使用情况
echo ""
echo "🔌 端口使用情况："
echo ""

ports=("8000:LoRA 训练" "8080:vLLM 推理" "8003:LLM Judge" "5000:MLflow" "6380:Redis" "3000:NestJS")

for port_info in "${ports[@]}"; do
    port="${port_info%%:*}"
    name="${port_info#*:}"
    
    printf "%-20s " "$name ($port)"
    if lsof -i :$port > /dev/null 2>&1 || netstat -tuln 2>/dev/null | grep -q ":$port "; then
        echo -e "${GREEN}✅ 已占用${NC}"
    else
        echo -e "${YELLOW}⚪ 空闲${NC}"
    fi
done

echo ""
echo "========================================"
echo ""
echo "💡 启动服务："
echo "   cd docker && docker-compose -f docker-compose.train.yml up -d"
echo ""
echo "📚 详细文档：docs/LORA_FINETUNE_GUIDE.md"
echo ""
