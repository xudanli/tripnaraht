#!/bin/bash
# 测试 HuggingFace E5 API

# 从 .env 文件读取 API Key
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep HUGGINGFACE_API_KEY | xargs)
fi

API_KEY="${HUGGINGFACE_API_KEY:-${1:-}}"

if [ -z "$API_KEY" ]; then
    echo "❌ 错误: 未提供 HUGGINGFACE_API_KEY"
    echo ""
    echo "使用方法:"
    echo "  bash scripts/test-huggingface-e5.sh"
    echo "  或"
    echo "  bash scripts/test-huggingface-e5.sh your_api_key"
    echo ""
    echo "或确保 .env 文件中有:"
    echo "  HUGGINGFACE_API_KEY=your_api_key"
    exit 1
fi

echo "=========================================="
echo "测试 HuggingFace E5 API"
echo "=========================================="
echo ""
echo "API Key: ${API_KEY:0:10}...${API_KEY: -4}"
echo ""

# 测试 1: 基本连接测试
echo "1. 测试基本连接..."
START_TIME=$(date +%s)
RESPONSE=$(curl -s --max-time 30 \
  -X POST \
  https://api-inference.huggingface.co/pipeline/feature-extraction/intfloat/multilingual-e5-large \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"inputs": "query: test"}' 2>&1)
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if echo "$RESPONSE" | grep -q "\["; then
    echo "   ✅ 连接成功 (耗时: ${DURATION}秒)"
    echo "   响应预览: $(echo "$RESPONSE" | head -c 100)..."
    
    # 检查是否是数组
    if echo "$RESPONSE" | grep -q "^\["; then
        echo "   ✅ 返回格式正确（向量数组）"
        # 尝试解析数组长度
        VECTOR_LENGTH=$(echo "$RESPONSE" | jq -r 'length' 2>/dev/null || echo "无法解析")
        if [ "$VECTOR_LENGTH" != "无法解析" ] && [ "$VECTOR_LENGTH" != "null" ]; then
            echo "   ✅ 向量维度: $VECTOR_LENGTH"
        fi
    fi
else
    echo "   ❌ 连接失败或超时"
    echo "   响应:"
    echo "$RESPONSE" | head -20 | sed 's/^/      /'
    
    # 检查是否是 503（模型加载中）
    if echo "$RESPONSE" | grep -q "503\|loading\|model is currently loading"; then
        echo ""
        echo "   ⚠️  模型正在加载中（首次使用需要等待）"
        echo "   建议: 等待 30-60 秒后重试"
    fi
    
    # 检查是否是 401（认证失败）
    if echo "$RESPONSE" | grep -q "401\|Unauthorized\|authentication"; then
        echo ""
        echo "   ❌ API Key 无效或未授权"
        echo "   请检查 HUGGINGFACE_API_KEY 是否正确"
    fi
fi

echo ""

# 测试 2: 测试中文文本
echo "2. 测试中文文本 embedding..."
START_TIME=$(date +%s)
RESPONSE=$(curl -s --max-time 30 \
  -X POST \
  https://api-inference.huggingface.co/pipeline/feature-extraction/intfloat/multilingual-e5-large \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"inputs": "query: 冰岛旅行指南"}' 2>&1)
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if echo "$RESPONSE" | grep -q "\["; then
    echo "   ✅ 中文文本处理成功 (耗时: ${DURATION}秒)"
else
    echo "   ❌ 中文文本处理失败"
    echo "   响应: $(echo "$RESPONSE" | head -c 200)"
fi

echo ""

# 测试 3: 测试英文文本
echo "3. 测试英文文本 embedding..."
START_TIME=$(date +%s)
RESPONSE=$(curl -s --max-time 30 \
  -X POST \
  https://api-inference.huggingface.co/pipeline/feature-extraction/intfloat/multilingual-e5-large \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"inputs": "query: Iceland travel guide"}' 2>&1)
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if echo "$RESPONSE" | grep -q "\["; then
    echo "   ✅ 英文文本处理成功 (耗时: ${DURATION}秒)"
else
    echo "   ❌ 英文文本处理失败"
    echo "   响应: $(echo "$RESPONSE" | head -c 200)"
fi

echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="
