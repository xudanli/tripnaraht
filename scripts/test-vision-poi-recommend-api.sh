#!/bin/bash
# 测试 POST /api/vision/poi-recommend
# 用法: ./scripts/test-vision-poi-recommend-api.sh [图片路径]
# 示例: ./scripts/test-vision-poi-recommend-api.sh ./test-image.png

BASE="${API_BASE_URL:-http://localhost:3000}"
IMAGE="${1:-}"

# 若无图片，创建最小 1x1 PNG 到临时文件
if [ -z "$IMAGE" ] || [ ! -f "$IMAGE" ]; then
  TMP_IMG=$(mktemp --suffix=.png)
  echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > "$TMP_IMG"
  IMAGE="$TMP_IMG"
  trap "rm -f $TMP_IMG" EXIT
  echo "使用内建 1x1 PNG 测试图"
else
  echo "使用图片: $IMAGE"
fi

echo ""
echo "POST $BASE/api/vision/poi-recommend"
echo "参数: image, lat=35.6762, lng=139.6503, locale=zh-CN"
echo ""

curl -s -X POST "$BASE/api/vision/poi-recommend" \
  -F "image=@$IMAGE;type=image/png" \
  -F "lat=35.6762" \
  -F "lng=139.6503" \
  -F "locale=zh-CN" \
  | jq .
