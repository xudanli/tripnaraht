#!/bin/bash

# RL Infrastructure Python Services Startup Script
# Usage: ./start_services.sh [training|policy|judge|all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_python() {
    if ! command -v python3 &> /dev/null; then
        log_error "Python3 not found"
        exit 1
    fi
    log_info "Python3: $(python3 --version)"
}

start_training() {
    log_info "Starting Training Service on port ${TRAINING_SERVICE_PORT:-8001}..."
    python3 training_service.py &
    echo $! > .training.pid
}

start_policy() {
    log_info "Starting Policy Service on port ${POLICY_SERVICE_PORT:-8002}..."
    python3 policy_service.py &
    echo $! > .policy.pid
}

start_judge() {
    log_info "Starting LLM Judge Service on port ${LLM_JUDGE_SERVICE_PORT:-8003}..."
    python3 llm_judge_service.py &
    echo $! > .judge.pid
}

stop_all() {
    log_info "Stopping all services..."
    [ -f .training.pid ] && kill $(cat .training.pid) 2>/dev/null && rm -f .training.pid
    [ -f .policy.pid ] && kill $(cat .policy.pid) 2>/dev/null && rm -f .policy.pid
    [ -f .judge.pid ] && kill $(cat .judge.pid) 2>/dev/null && rm -f .judge.pid
    log_info "Done."
}

health_check() {
    log_info "Health check..."
    curl -s http://localhost:${TRAINING_SERVICE_PORT:-8001}/health && log_info "Training: OK" || log_warn "Training: DOWN"
    curl -s http://localhost:${POLICY_SERVICE_PORT:-8002}/health && log_info "Policy: OK" || log_warn "Policy: DOWN"
    curl -s http://localhost:${LLM_JUDGE_SERVICE_PORT:-8003}/health && log_info "Judge: OK" || log_warn "Judge: DOWN"
}

case "${1:-all}" in
    training) check_python; start_training ;;
    policy) check_python; start_policy ;;
    judge) check_python; start_judge ;;
    all) check_python; start_training; start_policy; start_judge ;;
    stop) stop_all ;;
    health) health_check ;;
    *) echo "Usage: $0 [training|policy|judge|all|stop|health]"; exit 1 ;;
esac
