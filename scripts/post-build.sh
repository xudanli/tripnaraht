#!/bin/bash
# 构建后脚本：创建符号链接以支持 NestJS watch 模式

cd "$(dirname "$0")/.."

# 如果 dist/src/main.js 存在但 dist/main.js 不存在，创建符号链接
if [ -f "dist/src/main.js" ] && [ ! -f "dist/main.js" ]; then
  echo "🔗 创建符号链接: dist/main.js -> src/main.js"
  ln -sf src/main.js dist/main.js
fi
