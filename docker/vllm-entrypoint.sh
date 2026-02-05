#!/bin/bash
# TripNARA vLLM 服务启动脚本
# 支持动态配置和 LoRA 热加载

set -e

# 默认配置
MODEL_NAME=${MODEL_NAME:-"Qwen/Qwen2.5-7B-Instruct"}
TENSOR_PARALLEL_SIZE=${TENSOR_PARALLEL_SIZE:-1}
GPU_MEMORY_UTILIZATION=${GPU_MEMORY_UTILIZATION:-0.9}
MAX_MODEL_LEN=${MAX_MODEL_LEN:-8192}
ENABLE_LORA=${ENABLE_LORA:-true}
MAX_LORAS=${MAX_LORAS:-4}
LORA_MODULES_PATH=${LORA_MODULES_PATH:-"/app/models/lora"}

echo "========================================"
echo "TripNARA vLLM Service Starting..."
echo "========================================"
echo "Model: ${MODEL_NAME}"
echo "Tensor Parallel Size: ${TENSOR_PARALLEL_SIZE}"
echo "GPU Memory Utilization: ${GPU_MEMORY_UTILIZATION}"
echo "Max Model Length: ${MAX_MODEL_LEN}"
echo "LoRA Enabled: ${ENABLE_LORA}"
echo "========================================"

# 构建启动命令
CMD="python -m vllm.entrypoints.openai.api_server"
CMD="${CMD} --model ${MODEL_NAME}"
CMD="${CMD} --tensor-parallel-size ${TENSOR_PARALLEL_SIZE}"
CMD="${CMD} --gpu-memory-utilization ${GPU_MEMORY_UTILIZATION}"
CMD="${CMD} --max-model-len ${MAX_MODEL_LEN}"
CMD="${CMD} --host 0.0.0.0"
CMD="${CMD} --port 8000"
CMD="${CMD} --trust-remote-code"

# 启用 LoRA 支持
if [ "${ENABLE_LORA}" = "true" ]; then
    CMD="${CMD} --enable-lora"
    CMD="${CMD} --max-loras ${MAX_LORAS}"
    CMD="${CMD} --max-lora-rank 64"
    
    # 如果有预加载的 LoRA 模块
    if [ -f "${LORA_MODULES_PATH}/lora_modules.json" ]; then
        CMD="${CMD} --lora-modules $(cat ${LORA_MODULES_PATH}/lora_modules.json)"
    fi
fi

# 启用 API 密钥（如果设置）
if [ -n "${VLLM_API_KEY}" ]; then
    CMD="${CMD} --api-key ${VLLM_API_KEY}"
fi

echo "Starting vLLM with command:"
echo "${CMD}"
echo "========================================"

# 执行启动命令
exec ${CMD}
