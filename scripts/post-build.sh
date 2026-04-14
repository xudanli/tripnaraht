#!/bin/bash
# 构建后脚本：验证构建输出

cd "$(dirname "$0")/.."

# 兼容 Nest 输出路径差异：
# - 旧路径：dist/src/main.js
# - 新路径：dist/main.js
if [ -f "dist/src/main.js" ]; then
  echo "✅ 构建成功，输出文件: dist/src/main.js"
  exit 0
fi

if [ -f "dist/main.js" ]; then
  mkdir -p dist/src
  cp -f dist/main.js dist/src/main.js
  echo "✅ 构建成功，输出文件: dist/main.js（已同步到 dist/src/main.js）"
  exit 0
fi

echo "❌ 构建失败: 未找到 dist/src/main.js 或 dist/main.js"
exit 1
