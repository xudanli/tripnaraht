#!/bin/bash
# 路线难度评估 - API测试脚本

set -e

echo "=========================================="
echo "路线难度评估 - API测试"
echo "=========================================="
echo ""

# 加载.env文件中的环境变量
if [ -f .env ]; then
    echo "✓ 加载.env文件..."
    export $(grep -v '^#' .env | xargs)
fi

# 检查API密钥
if [ -n "$MAPBOX_ACCESS_TOKEN" ]; then
    echo "✓ MAPBOX_ACCESS_TOKEN已配置"
    PROVIDER="mapbox"
    ORIGIN="7.9904,46.5763"
    DEST="7.985,46.577"
elif [ -n "$GOOGLE_ROUTES_API_KEY" ] || [ -n "$GOOGLE_MAPS_API_KEY" ]; then
    echo "✓ GOOGLE API KEY已配置"
    PROVIDER="google"
    ORIGIN="39.9042,116.4074"
    DEST="39.914,116.403"
    # 使用可用的Google API密钥
    if [ -n "$GOOGLE_ROUTES_API_KEY" ]; then
        export GOOGLE_MAPS_API_KEY="$GOOGLE_ROUTES_API_KEY"
    fi
else
    echo "✗ 未找到API密钥配置"
    exit 1
fi

echo ""
echo "使用提供商: $PROVIDER"
echo "测试路线: $ORIGIN -> $DEST"
echo ""

# 检查Python依赖
if ! python3 -c "import requests" 2>/dev/null; then
    echo "⚠️  Python依赖未安装"
    echo "请运行: pip install requests pillow"
    echo ""
    echo "或者使用模拟测试:"
    echo "  python3 tools/test-difficulty-mock.py"
    exit 1
fi

# 运行测试
echo "运行端到端测试..."
echo ""

python3 tools/end2end_difficulty_with_geojson.py \
    --provider "$PROVIDER" \
    --origin "$ORIGIN" \
    --destination "$DEST" \
    --profile walking \
    --sample-m 30 \
    --category ATTRACTION \
    --accessType HIKING \
    2>&1 | tee /tmp/test-difficulty-output.log

echo ""
echo "=========================================="
echo "测试完成！"
echo "=========================================="

