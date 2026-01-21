#!/bin/bash

# 重启服务器并运行测试脚本

BASE_DIR="/home/devbox/project"
cd "$BASE_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "重启服务器并测试规划工作台 Claude API"
echo "=========================================="
echo ""

# 1. 检查并停止现有服务器进程
echo -e "${BLUE}步骤 1: 检查现有服务器进程...${NC}"
PORT_PID=$(lsof -ti:3000 2>/dev/null | head -1)
if [ -n "$PORT_PID" ]; then
  echo -e "${YELLOW}发现运行在端口 3000 的进程 (PID: $PORT_PID)，正在停止...${NC}"
  kill $PORT_PID 2>/dev/null
  sleep 2
  # 如果还在运行，强制杀死
  if lsof -ti:3000 >/dev/null 2>&1; then
    kill -9 $PORT_PID 2>/dev/null
    sleep 1
  fi
  echo -e "${GREEN}✅ 服务器进程已停止${NC}"
else
  echo -e "${GREEN}✅ 没有发现运行中的服务器${NC}"
fi
echo ""

# 2. 等待端口释放
echo -e "${BLUE}步骤 2: 等待端口释放...${NC}"
for i in {1..10}; do
  if ! lsof -ti:3000 >/dev/null 2>&1; then
    echo -e "${GREEN}✅ 端口 3000 已释放${NC}"
    break
  fi
  sleep 1
done
echo ""

# 3. 启动服务器（后台运行）
echo -e "${BLUE}步骤 3: 启动服务器...${NC}"
echo -e "${YELLOW}注意: 服务器将在后台运行${NC}"
echo ""

# 使用 nohup 在后台启动服务器
nohup npm run dev > /tmp/nest-server.log 2>&1 &
SERVER_PID=$!

echo -e "${GREEN}服务器已启动 (PID: $SERVER_PID)${NC}"
echo -e "${YELLOW}日志文件: /tmp/nest-server.log${NC}"
echo ""

# 4. 等待服务器启动
echo -e "${BLUE}步骤 4: 等待服务器启动...${NC}"
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if curl -s http://localhost:3000/health >/dev/null 2>&1; then
    echo -e "${GREEN}✅ 服务器已就绪 (等待了 ${WAITED} 秒)${NC}"
    break
  fi
  echo -n "."
  sleep 2
  WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo ""
  echo -e "${RED}❌ 服务器启动超时${NC}"
  echo -e "${YELLOW}查看日志: tail -f /tmp/nest-server.log${NC}"
  exit 1
fi
echo ""

# 5. 显示服务器日志（最近几行）
echo -e "${BLUE}步骤 5: 服务器日志（最近 20 行）...${NC}"
tail -20 /tmp/nest-server.log 2>/dev/null | grep -E "(Nest|ERROR|WARN|Anthropic|Claude)" || echo "暂无相关日志"
echo ""

# 6. 运行测试
echo -e "${BLUE}步骤 6: 运行测试...${NC}"
echo ""
npm run test:planning-workbench-claude

TEST_EXIT_CODE=$?

echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="
echo ""
echo -e "${BLUE}服务器信息:${NC}"
echo "  PID: $SERVER_PID"
echo "  日志: /tmp/nest-server.log"
echo "  查看日志: tail -f /tmp/nest-server.log"
echo "  停止服务器: kill $SERVER_PID"
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✅ 测试通过！${NC}"
else
  echo -e "${RED}❌ 测试失败${NC}"
fi

exit $TEST_EXIT_CODE
