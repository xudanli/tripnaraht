#!/bin/bash

# ROLL 集群启动脚本

set -e

echo "🚀 启动 ROLL Ray 集群..."

# 检查 Ray 是否已安装
if ! command -v ray &> /dev/null; then
    echo "❌ Ray 未安装，请先安装: pip install ray[default]"
    exit 1
fi

# 检查 Ray 是否已在运行
if ray status &> /dev/null; then
    echo "⚠️  Ray 集群已在运行"
    ray status
else
    echo "📦 启动 Ray Head 节点..."
    ray start --head \
        --port=10001 \
        --dashboard-host=0.0.0.0 \
        --dashboard-port=8265 \
        --num-cpus=4 \
        --num-gpus=0 \
        --object-store-memory=2000000000
    
    echo "✅ Ray 集群启动成功"
    echo "📊 Dashboard: http://localhost:8265"
fi

# 设置环境变量
export RAY_ADDRESS="ray://localhost:10001"
export RAY_NAMESPACE="tripnara-rl"

echo ""
echo "📋 环境变量:"
echo "  RAY_ADDRESS=$RAY_ADDRESS"
echo "  RAY_NAMESPACE=$RAY_NAMESPACE"
echo ""
echo "✅ 准备就绪！可以启动 Workers 了"
