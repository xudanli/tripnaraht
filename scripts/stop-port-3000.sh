#!/bin/bash
# 停止占用3000端口的进程

echo "🛑 停止占用3000端口的进程..."
echo ""

# 查找占用3000端口的进程
PID=$(fuser 3000/tcp 2>&1 | awk '{print $NF}' | head -1)

if [ -z "$PID" ]; then
    echo "❌ 未找到占用3000端口的进程"
    exit 1
fi

echo "📋 找到进程 PID: $PID"
ps aux | grep $PID | grep -v grep

echo ""
read -p "是否停止进程 $PID? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🛑 正在停止进程 $PID..."
    kill -15 $PID 2>&1
    
    sleep 2
    
    # 检查是否还在运行
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  进程仍在运行，强制停止..."
        kill -9 $PID 2>&1
    fi
    
    echo "✅ 进程已停止"
    
    # 验证端口是否释放
    sleep 1
    if fuser 3000/tcp > /dev/null 2>&1; then
        echo "⚠️  端口3000仍被占用"
    else
        echo "✅ 端口3000已释放"
    fi
else
    echo "❌ 已取消"
    exit 0
fi
