#!/bin/bash

# 重启服务并测试API的脚本

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "重启服务并测试API"
echo "=========================================="
echo ""

# 检查服务是否在运行
if pgrep -f "nest start" > /dev/null; then
    echo -e "${YELLOW}检测到服务正在运行，请手动停止服务（Ctrl+C）${NC}"
    echo -e "${YELLOW}然后重新运行此脚本${NC}"
    exit 1
fi

echo -e "${BLUE}步骤1: 清理缓存...${NC}"
rm -rf .nest 2>/dev/null || true
echo -e "${GREEN}✅ 缓存已清理${NC}"
echo ""

echo -e "${BLUE}步骤2: 生成 Prisma Client...${NC}"
npx prisma generate > /dev/null 2>&1
echo -e "${GREEN}✅ Prisma Client 已生成${NC}"
echo ""

echo -e "${BLUE}步骤3: 启动服务...${NC}"
echo -e "${YELLOW}请在另一个终端运行: npm run start:dev${NC}"
echo -e "${YELLOW}等待服务完全启动后，按 Enter 继续测试...${NC}"
read -p ""

echo ""
echo -e "${BLUE}步骤4: 测试API...${NC}"
bash scripts/test-api-simple.sh

echo ""
echo -e "${GREEN}✅ 完成${NC}"
