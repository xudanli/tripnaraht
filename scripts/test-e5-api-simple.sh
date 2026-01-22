#!/bin/bash
# 简单测试 HuggingFace E5 API

API_KEY=$(grep "HUGGINGFACE_API_KEY" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'")

if [ -z "$API_KEY" ]; then
    echo "❌ 错误: 未找到 HUGGINGFACE_API_KEY"
    exit 1
fi

echo "测试 HuggingFace E5 API..."
echo "API Key: ${API_KEY:0:10}...${API_KEY: -4}"
echo ""

echo "发送测试请求（可能需要等待模型加载，首次调用可能需要 30-60 秒）..."
echo ""

# 使用更长的超时时间
RESPONSE=$(curl -s --max-time 120 \
  -X POST \
  https://api-inference.huggingface.co/pipeline/feature-extraction/intfloat/multilingual-e5-large \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"inputs": "query: test"}' 2>&1)

if echo "$RESPONSE" | grep -q "^\["; then
    echo "✅ 成功！返回向量数组"
    echo ""
    echo "响应预览（前100字符）:"
    echo "$RESPONSE" | head -c 100
    echo "..."
    echo ""
    # 尝试解析向量长度
    if command -v jq > /dev/null 2>&1; then
        LENGTH=$(echo "$RESPONSE" | jq -r 'length' 2>/dev/null)
        if [ "$LENGTH" != "null" ] && [ -n "$LENGTH" ]; then
            echo "向量维度: $LENGTH"
        fi
    fi
elif echo "$RESPONSE" | grep -q "503\|loading\|model is currently loading"; then
    echo "⚠️  模型正在加载中（503）"
    echo ""
    echo "这是正常的！HuggingFace Inference API 在首次使用或长时间未使用后需要加载模型。"
    echo "请等待 30-60 秒后重试。"
    echo ""
    echo "响应:"
    echo "$RESPONSE" | head -10
elif echo "$RESPONSE" | grep -q "401\|Unauthorized"; then
    echo "❌ API Key 无效（401）"
    echo ""
    echo "请检查 HUGGINGFACE_API_KEY 是否正确"
    echo ""
    echo "响应:"
    echo "$RESPONSE" | head -10
else
    echo "❌ 请求失败"
    echo ""
    echo "响应:"
    echo "$RESPONSE" | head -20
fi
