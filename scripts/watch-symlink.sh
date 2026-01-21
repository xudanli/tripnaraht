#!/bin/bash
# Watch 模式下的符号链接创建脚本
# 在 NestJS watch 模式运行时，监听 dist 目录变化并自动创建符号链接

cd "$(dirname "$0")/.."

# 创建符号链接函数
create_symlink() {
  if [ -f "dist/src/main.js" ] && [ ! -f "dist/main.js" ]; then
    echo "🔗 [Watch] 创建符号链接: dist/main.js -> src/main.js"
    ln -sf src/main.js dist/main.js
  fi
}

# 初始创建
create_symlink

# 使用 inotifywait 监听 dist/src/main.js 的变化（如果可用）
if command -v inotifywait &> /dev/null; then
  echo "👀 [Watch] 开始监听 dist/src/main.js 变化..."
  while inotifywait -e create,modify,close_write dist/src/main.js 2>/dev/null; do
    create_symlink
  done
else
  # 如果没有 inotifywait，使用轮询方式
  echo "⚠️  [Watch] inotifywait 不可用，使用轮询模式（每2秒检查一次）"
  while true; do
    create_symlink
    sleep 2
  fi
fi
