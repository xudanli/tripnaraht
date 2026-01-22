#!/bin/bash
# 检查代理服务器状态

echo "=========================================="
echo "代理服务器状态检查"
echo "=========================================="

# 检查端口 9090 是否监听
echo ""
echo "1. 检查端口 9090 是否监听："
if netstat -tlnp 2>/dev/null | grep -q ":9090 " || lsof -i :9090 2>/dev/null | grep -q LISTEN; then
    echo "   ✅ 端口 9090 正在监听"
    netstat -tlnp 2>/dev/null | grep ":9090 " || lsof -i :9090 2>/dev/null
else
    echo "   ❌ 端口 9090 未监听（代理服务器未运行）"
fi

# 检查环境变量
echo ""
echo "2. 检查环境变量："
if [ -n "$HTTPS_PROXY" ]; then
    echo "   ✅ HTTPS_PROXY=$HTTPS_PROXY"
else
    echo "   ⚠️  HTTPS_PROXY 未设置"
fi

if [ -n "$https_proxy" ]; then
    echo "   ✅ https_proxy=$https_proxy"
fi

if [ -n "$ALL_PROXY" ]; then
    echo "   ✅ ALL_PROXY=$ALL_PROXY"
fi

# 测试代理连接
echo ""
echo "3. 测试代理连接："
if curl -s --connect-timeout 2 --proxy http://127.0.0.1:9090 https://www.google.com > /dev/null 2>&1; then
    echo "   ✅ 代理服务器可以连接"
else
    echo "   ❌ 代理服务器无法连接"
    echo "   错误: Connection refused (代理服务器未运行)"
fi

# 检查 .env 文件
echo ""
echo "4. 检查 .env 文件配置："
if [ -f .env ]; then
    if grep -q "HTTPS_PROXY" .env; then
        echo "   ✅ .env 文件中配置了 HTTPS_PROXY:"
        grep "HTTPS_PROXY" .env | head -1
    else
        echo "   ⚠️  .env 文件中未找到 HTTPS_PROXY"
    fi
else
    echo "   ⚠️  .env 文件不存在"
fi

echo ""
echo "=========================================="
echo "解决方案："
echo "=========================================="
echo ""
echo "如果代理服务器未运行，请："
echo "1. 启动你的代理服务器（Clash、V2Ray、Shadowsocks 等）"
echo "2. 确保代理服务器监听在 127.0.0.1:9090"
echo ""
echo "或者："
echo "1. 切换到 HuggingFace E5（无需代理）："
echo "   EMBEDDING_PROVIDER=e5"
echo "   HUGGINGFACE_API_KEY=your_token"
echo ""
echo "2. 或者移除 HTTPS_PROXY，直接连接（如果可以访问 OpenAI）"
