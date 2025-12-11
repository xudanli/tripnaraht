#!/bin/bash
# Redis 启动脚本

echo "🔍 检查 Redis 状态..."

# 检查 Redis 是否已安装
if ! command -v redis-server &> /dev/null; then
    echo "❌ Redis 未安装"
    echo ""
    echo "请选择安装方式："
    echo ""
    echo "方式 1: 使用 apt 安装（需要 sudo 权限）"
    echo "  sudo apt-get update"
    echo "  sudo apt-get install -y redis-server"
    echo "  sudo systemctl start redis"
    echo ""
    echo "方式 2: 使用 Docker（推荐）"
    echo "  docker run -d --name redis -p 6379:6379 redis:latest"
    echo ""
    echo "方式 3: 从源码编译"
    echo "  wget https://download.redis.io/redis-stable.tar.gz"
    echo "  tar xzf redis-stable.tar.gz"
    echo "  cd redis-stable"
    echo "  make"
    echo "  src/redis-server"
    exit 1
fi

# 检查 Redis 是否已在运行
if pgrep -f redis-server > /dev/null; then
    echo "✅ Redis 已在运行"
    redis-cli ping 2>/dev/null && echo "✅ Redis 连接正常" || echo "⚠️  Redis 进程存在但无法连接"
    exit 0
fi

# 尝试启动 Redis
echo "🚀 启动 Redis..."

# 检查是否有 systemd
if systemctl is-active --quiet redis 2>/dev/null || systemctl is-active --quiet redis-server 2>/dev/null; then
    echo "使用 systemctl 启动..."
    sudo systemctl start redis 2>/dev/null || sudo systemctl start redis-server 2>/dev/null
    sleep 2
    if redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis 启动成功"
        exit 0
    fi
fi

# 尝试直接启动 redis-server
echo "直接启动 redis-server..."
redis-server --daemonize yes 2>/dev/null || {
    echo "⚠️  无法以后台模式启动，尝试前台模式..."
    echo "请手动运行: redis-server"
    exit 1
}

sleep 2

# 验证启动
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis 启动成功"
    echo "📊 Redis 信息:"
    redis-cli info server 2>/dev/null | grep -E "redis_version|uptime_in_seconds" || true
else
    echo "❌ Redis 启动失败"
    echo "请检查："
    echo "1. Redis 是否正确安装"
    echo "2. 端口 6379 是否被占用"
    echo "3. 查看日志: tail -f /var/log/redis/redis-server.log"
    exit 1
fi
