#!/bin/bash

# ROLL 服务启动脚本
# Usage: ./start_roll_services.sh [ray|bridge|workers|all]

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

# Check Ray
check_ray() {
    if ! command -v ray &> /dev/null; then
        log_warn "Ray not found. Installing Ray..."
        pip3 install ray[default] --quiet
    fi
    log_info "Ray found: $(ray --version 2>/dev/null || echo 'installed')"
}

# Start Ray Cluster
start_ray() {
    log_info "Starting Ray cluster..."
    
    if ray status &> /dev/null; then
        log_warn "Ray cluster already running"
        ray status
    else
        ./start_roll_cluster.sh
        log_info "Ray cluster started"
    fi
}

# Start Bridge Service
start_bridge() {
    log_info "Starting ROLL Bridge Service..."
    
    # Check if already running
    if [ -f .bridge.pid ] && ps -p $(cat .bridge.pid) > /dev/null 2>&1; then
        log_warn "Bridge Service already running (PID: $(cat .bridge.pid))"
        return
    fi
    
    # Install dependencies
    if [ ! -d "venv" ]; then
        log_info "Creating virtual environment..."
        python3 -m venv venv
    fi
    
    source venv/bin/activate
    pip install -q -r requirements.txt
    
    # Start service
    export RAY_ADDRESS="${RAY_ADDRESS:-ray://localhost:10001}"
    export RAY_NAMESPACE="${RAY_NAMESPACE:-tripnara-rl}"
    export ROLL_BRIDGE_PORT="${ROLL_BRIDGE_PORT:-8001}"
    export ROLL_BRIDGE_HOST="${ROLL_BRIDGE_HOST:-0.0.0.0}"
    
    python3 bridge_service.py &
    echo $! > .bridge.pid
    log_info "Bridge Service started (PID: $(cat .bridge.pid))"
    log_info "Bridge Service URL: http://${ROLL_BRIDGE_HOST}:${ROLL_BRIDGE_PORT}"
    log_info "API Docs: http://${ROLL_BRIDGE_HOST}:${ROLL_BRIDGE_PORT}/docs"
}

# Start Workers (separate processes)
start_workers() {
    log_info "Starting ROLL Workers..."
    
    # Workers are started automatically by Bridge Service
    # This is just for reference
    log_info "Workers are managed by Bridge Service"
    log_info "Check status: curl http://localhost:8001/api/workers/status"
}

# Start all services
start_all() {
    log_info "Starting all ROLL services..."
    check_python
    check_ray
    start_ray
    sleep 2
    start_bridge
    log_info "All ROLL services started!"
    log_info ""
    log_info "Services:"
    log_info "  - Ray Dashboard: http://localhost:8265"
    log_info "  - Bridge Service: http://localhost:8001"
    log_info "  - API Docs: http://localhost:8001/docs"
}

# Stop services
stop_all() {
    log_info "Stopping ROLL services..."
    
    # Stop Bridge Service
    if [ -f .bridge.pid ]; then
        PID=$(cat .bridge.pid)
        if ps -p $PID > /dev/null 2>&1; then
            kill $PID
            log_info "Bridge Service stopped (PID: $PID)"
        fi
        rm .bridge.pid
    fi
    
    # Stop Ray (optional)
    if ray status &> /dev/null; then
        log_info "Stopping Ray cluster..."
        ray stop
    fi
    
    log_info "All services stopped"
}

# Main
case "${1:-all}" in
    ray)
        check_python
        check_ray
        start_ray
        ;;
    bridge)
        check_python
        start_bridge
        ;;
    workers)
        start_workers
        ;;
    all)
        start_all
        ;;
    stop)
        stop_all
        ;;
    *)
        echo "Usage: $0 [ray|bridge|workers|all|stop]"
        exit 1
        ;;
esac
