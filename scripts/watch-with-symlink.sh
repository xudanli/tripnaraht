#!/bin/bash
# NestJS watch 模式 wrapper，自动创建符号链接

cd "$(dirname "$0")/.."

# 创建符号链接函数
create_symlink() {
  if [ -f "dist/src/main.js" ] && [ ! -f "dist/main.js" ]; then
    ln -sf src/main.js dist/main.js
    echo "🔗 已创建符号链接: dist/main.js -> src/main.js"
  fi
}

# 初始创建符号链接
create_symlink

# 启动 NestJS watch 模式，并在后台监控 dist/src/main.js 的变化
NODE_OPTIONS='--max-old-space-size=4096' nest start --watch &
NEST_PID=$!

# 监控 dist/src/main.js 的变化，如果文件被重新创建，自动创建符号链接
while kill -0 $NEST_PID 2>/dev/null; do
  sleep 1
  if [ -f "dist/src/main.js" ] && [ ! -f "dist/main.js" ]; then
    create_symlink
  fi
done

wait $NEST_PID
