#!/bin/bash
# 快速清理端口占用的脚本

PORT=${1:-3000}

echo "🔍 查找占用端口 $PORT 的进程..."

# 尝试多种方法查找进程
PID=$(netstat -tlnp 2>/dev/null | grep ":$PORT " | awk '{print $7}' | cut -d'/' -f1 | head -1)

if [ -z "$PID" ]; then
  PID=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K\d+' | head -1)
fi

if [ -z "$PID" ]; then
  PID=$(fuser $PORT/tcp 2>/dev/null | awk '{print $NF}' | head -1)
fi

if [ -z "$PID" ]; then
  echo "❌ 未找到占用端口 $PORT 的进程"
  exit 1
fi

echo "📌 找到进程 PID: $PID"
echo "🛑 正在终止进程..."

kill -9 $PID 2>/dev/null

if [ $? -eq 0 ]; then
  echo "✅ 进程已终止"
  sleep 1
  
  # 验证端口是否已释放
  if netstat -tlnp 2>/dev/null | grep -q ":$PORT " || ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
    echo "⚠️  端口 $PORT 仍被占用，可能需要等待几秒"
  else
    echo "✅ 端口 $PORT 已释放"
  fi
else
  echo "❌ 无法终止进程，可能需要 root 权限"
  exit 1
fi

