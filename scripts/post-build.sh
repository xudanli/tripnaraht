#!/bin/bash
# 构建后脚本：验证构建输出

cd "$(dirname "$0")/.."

# 验证 dist/src/main.js 存在
if [ ! -f "dist/src/main.js" ]; then
  echo "⚠️  警告: dist/src/main.js 不存在，构建可能失败"
  exit 1
fi

echo "✅ 构建成功，输出文件: dist/src/main.js"
