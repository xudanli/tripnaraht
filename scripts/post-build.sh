#!/bin/bash
# 构建后脚本：验证构建输出，并清理会破坏 `nest start` 的不完整 dist/src 入口

cd "$(dirname "$0")/.."

# Nest CLI（start.action.js）会优先执行 outDir + sourceRoot + entryFile，即 dist/src/main.js；
# 若该文件存在但同目录下没有 app.module.js 等依赖，则不会回退到 dist/main.js，导致 Cannot find module './app.module'。
# 历史脚本曾把 dist/main.js 单独复制到 dist/src/main.js —— 这是不完整 shim，必须清理。

if [ -f "dist/main.js" ]; then
  if [ -f "dist/src/main.js" ] && [ ! -f "dist/src/app.module.js" ]; then
    rm -f dist/src/main.js
    rmdir dist/src 2>/dev/null || true
  fi
  echo "✅ 构建成功，输出文件: dist/main.js"
  exit 0
fi

if [ -f "dist/src/main.js" ] && [ -f "dist/src/app.module.js" ]; then
  echo "✅ 构建成功，输出文件: dist/src/main.js（完整树）"
  exit 0
fi

echo "❌ 构建失败: 未找到 dist/main.js（也未找到完整的 dist/src/ 入口树）"
exit 1
