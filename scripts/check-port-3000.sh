#!/bin/bash
# 检查3000端口占用情况

echo "🔍 检查3000端口占用情况..."
echo ""

# 方法1: 使用 netstat
echo "📊 方法1: netstat"
netstat -tlnp | grep :3000 2>&1 || echo "  未找到占用3000端口的进程"

echo ""
echo "📊 方法2: ss"
ss -tlnp | grep :3000 2>&1 || echo "  未找到占用3000端口的进程"

echo ""
echo "📊 方法3: fuser"
fuser 3000/tcp 2>&1 || echo "  未找到占用3000端口的进程"

echo ""
echo "📊 相关进程信息:"
ps aux | grep -E "nest|node.*main" | grep -v grep | head -5
