#!/bin/bash

# RL Infrastructure Python Services Startup Script
# Usage: ./start-services.sh [training|policy|judge|all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Check Python
check_python() {
    if ! command -v python3 &> /dev/null; then
        log_error "Python3 not found. Please install Python3."
        exit 1
    fi
    log_info "Python3 found: $(python3 --version)"
}

# Install dependencies
install_deps() {
    log_info "Installing Python dependencies..."
    pip3 install -r requirements.txt --quiet
    log_info "Dependencies installed."
}

# Start Training Service
start_training() {
    log_info "Starting Training Service on port ${TRAINING_SERVICE_PORT:-8001}..."
    python3 training_service.py &
    echo $! > .training.pid
    log_info "Training Service started (PID: $(cat .training.pid))"
}

# Start Policy Service
start_policy() {
    log_info "Starting Policy Service (TypeScript) on port ${POLICY_SERVICE_PORT:-8002}..."
    
    # Check if ts-node is available
    if command -v ts-node &> /dev/null; then
        ts-node policy-service.ts &
    elif command -v npx &> /dev/null; then
        npx ts-node policy-service.ts &
    else
        log_error "ts-node not found. Please install: npm install -g ts-node"
        exit 1
    fi
    
    echo $! > .policy.pid
    log_info "Policy Service started (PID: $(cat .policy.pid))"
}

# Start LLM Judge Service (已集成到 TypeScript，无需独立启动)
start_judge() {
    log_warn "LLM Judge Service 已集成到 TypeScript QualityScorerService，无需独立启动"
    log_info "如需使用外部服务，请设置 USE_EXTERNAL_LLM_JUDGE=true 和 LLM_JUDGE_URL"
}

# Stop all services
stop_all() {
    log_info "Stopping all services..."
    
    if [ -f .training.pid ]; then
        kill $(cat .training.pid) 2>/dev/null || true
        rm -f .training.pid
    fi
    
    if [ -f .policy.pid ]; then
        kill $(cat .policy.pid) 2>/dev/null || true
        rm -f .policy.pid
    fi
    
    # LLM Judge Service 已集成，无需停止
    
    log_info "All services stopped."
}

# Health check
health_check() {
    log_info "Checking service health..."
    
    # Training Service
    if curl -s http://localhost:${TRAINING_SERVICE_PORT:-8001}/health > /dev/null 2>&1; then
        log_info "Training Service: OK"
    else
        log_warn "Training Service: NOT RUNNING"
    fi
    
    # Policy Service
    if curl -s http://localhost:${POLICY_SERVICE_PORT:-8002}/health > /dev/null 2>&1; then
        log_info "Policy Service: OK"
    else
        log_warn "Policy Service: NOT RUNNING"
    fi
    
    # LLM Judge Service (已集成到 TypeScript)
    log_info "LLM Judge Service: Integrated into TypeScript QualityScorerService"
}

# Main
case "${1:-all}" in
    training)
        check_python
        start_training
        ;;
    policy)
        start_policy
        ;;
    judge)
        start_judge
        ;;
    all)
        check_python
        install_deps
        start_training
        start_policy
        start_judge
        log_info "All services started. Use './start-services.sh health' to check status."
        log_info "Note: LLM Judge Service is integrated into TypeScript backend."
        ;;
    stop)
        stop_all
        ;;
    health)
        health_check
        ;;
    *)
        echo "Usage: $0 [training|policy|judge|all|stop|health]"
        exit 1
        ;;
esac
