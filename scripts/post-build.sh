#!/bin/bash
# 构建后脚本：创建符号链接以支持 NestJS watch 模式

cd "$(dirname "$0")/.."

# 确保 dist/src/main.js 存在
if [ ! -f "dist/src/main.js" ]; then
  echo "⚠️  警告: dist/src/main.js 不存在，跳过符号链接创建"
  exit 0
fi

# 创建或更新符号链接（使用 -sf 强制覆盖）
echo "🔗 创建/更新符号链接: dist/main.js -> src/main.js"
ln -sf src/main.js dist/main.js

# 验证符号链接
if [ -L "dist/main.js" ] && [ -f "dist/src/main.js" ]; then
  echo "✅ 符号链接创建成功"
else
  echo "❌ 符号链接创建失败"
  exit 1
fi
