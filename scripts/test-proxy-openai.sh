#!/bin/bash
# 测试代理是否能访问 OpenAI API

PROXY_URL="${1:-http://127.0.0.1:9090}"
OPENAI_API_KEY="${OPENAI_API_KEY:-${2:-}}"

echo "=========================================="
echo "测试代理访问 OpenAI API"
echo "=========================================="
echo ""
echo "代理地址: $PROXY_URL"
echo ""

# 1. 检查代理端口是否监听
echo "1. 检查代理端口是否监听..."
if netstat -tlnp 2>/dev/null | grep -q ":9090 " || lsof -i :9090 2>/dev/null | grep -q LISTEN; then
    echo "   ✅ 端口 9090 正在监听"
else
    echo "   ⚠️  端口 9090 未监听（代理服务器可能未运行）"
    echo "   继续测试..."
fi
echo ""

# 2. 测试代理基本连接
echo "2. 测试代理基本连接..."
if curl -s --connect-timeout 5 --proxy "$PROXY_URL" https://www.google.com > /dev/null 2>&1; then
    echo "   ✅ 代理可以连接（测试 Google）"
else
    echo "   ❌ 代理连接失败"
    echo "   错误: 无法通过代理连接到外部网站"
    exit 1
fi
echo ""

# 3. 测试 OpenAI API（不需要 API Key）
echo "3. 测试 OpenAI API 连接（models 端点，不需要 API Key）..."
RESPONSE=$(curl -s --connect-timeout 10 --proxy "$PROXY_URL" \
    -H "Content-Type: application/json" \
    https://api.openai.com/v1/models 2>&1)

if echo "$RESPONSE" | grep -q "object"; then
    echo "   ✅ OpenAI API 连接成功"
    echo "   响应预览:"
    echo "$RESPONSE" | head -5 | sed 's/^/      /'
else
    echo "   ❌ OpenAI API 连接失败"
    echo "   响应:"
    echo "$RESPONSE" | head -10 | sed 's/^/      /'
fi
echo ""

# 4. 测试 OpenAI Embeddings API（需要 API Key）
if [ -n "$OPENAI_API_KEY" ]; then
    echo "4. 测试 OpenAI Embeddings API（需要 API Key）..."
    RESPONSE=$(curl -s --connect-timeout 10 --proxy "$PROXY_URL" \
        -X POST https://api.openai.com/v1/embeddings \
        -H "Authorization: Bearer $OPENAI_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
            "model": "text-embedding-3-small",
            "input": "test"
        }' 2>&1)
    
    if echo "$RESPONSE" | grep -q "embedding"; then
        echo "   ✅ Embeddings API 调用成功"
        echo "   响应预览:"
        echo "$RESPONSE" | jq -r '.data[0].embedding[0:5]' 2>/dev/null || echo "$RESPONSE" | head -3 | sed 's/^/      /'
    else
        echo "   ❌ Embeddings API 调用失败"
        echo "   响应:"
        echo "$RESPONSE" | head -10 | sed 's/^/      /'
    fi
else
    echo "4. 跳过 Embeddings API 测试（未提供 OPENAI_API_KEY）"
    echo "   提示: 设置环境变量 OPENAI_API_KEY 或作为第二个参数传入"
fi
echo ""

# 5. 测试延迟
echo "5. 测试代理延迟..."
START_TIME=$(date +%s%N)
curl -s --connect-timeout 10 --proxy "$PROXY_URL" https://api.openai.com/v1/models > /dev/null 2>&1
END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))
echo "   延迟: ${DURATION}ms"
echo ""

echo "=========================================="
echo "测试完成"
echo "=========================================="
