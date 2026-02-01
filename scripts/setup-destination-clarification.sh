#!/bin/bash

# 目的地特化澄清系统 - 一键设置脚本
# 功能：执行数据库迁移和初始化格陵兰配置

set -e  # 遇到错误立即退出

echo "=========================================="
echo "目的地特化澄清系统 - 一键设置"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查 Node.js 和 npm
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安装${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm 未安装${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js 和 npm 已安装${NC}"
echo ""

# 步骤1: 检查 Prisma 是否安装
echo "步骤 1/3: 检查 Prisma..."
if ! command -v npx &> /dev/null; then
    echo -e "${RED}❌ npx 未安装${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prisma 可用${NC}"
echo ""

# 步骤2: 生成 Prisma Client
echo "步骤 2/4: 生成 Prisma Client..."
if npx prisma generate; then
    echo -e "${GREEN}✅ Prisma Client 已生成${NC}"
else
    echo -e "${RED}❌ Prisma Client 生成失败${NC}"
    exit 1
fi

echo ""

# 步骤3: 创建数据库表
echo "步骤 3/4: 创建数据库表..."
echo -e "${YELLOW}正在创建表...${NC}"

if npx ts-node scripts/create-table-via-prisma.ts; then
    echo -e "${GREEN}✅ 数据库表已创建${NC}"
else
    echo -e "${RED}❌ 数据库表创建失败${NC}"
    exit 1
fi

echo ""

# 步骤4: 初始化格陵兰配置
echo "步骤 4/4: 初始化格陵兰配置..."
echo -e "${YELLOW}正在运行初始化脚本...${NC}"

if npx ts-node scripts/init-greenland-clarification-config.ts; then
    echo -e "${GREEN}✅ 格陵兰配置已初始化${NC}"
else
    echo -e "${RED}❌ 配置初始化失败${NC}"
    exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ 所有设置完成！${NC}"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 启动服务: npm run start:dev"
echo "2. 测试 API: curl http://localhost:3000/admin/destination-clarification/GL"
echo "3. 查看文档: .claude/roles/实施检查清单.md"
echo ""
