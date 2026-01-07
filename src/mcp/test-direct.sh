#!/bin/bash

# 直接运行 MCP Server 并查看输出
# 用于诊断服务器启动问题

echo "🔍 直接运行 MCP Skills Server..."
echo ""

cd /srv/tripnaraht

# 运行服务器，设置超时
timeout 5 npx tsx src/mcp/mcp-skills-server.ts 2>&1 || {
    echo ""
    echo "❌ 服务器在 5 秒内退出或超时"
    echo "   这通常意味着服务器在启动过程中遇到了错误"
}

