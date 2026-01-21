#!/bin/bash
# Iterative Deployment 快速验证脚本
# 用途：快速验证 Iterative Deployment 功能是否正常工作

set -e

echo "🔍 Iterative Deployment 功能验证"
echo "=================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查数据库连接
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ 错误: DATABASE_URL 环境变量未设置${NC}"
    exit 1
fi

echo "1️⃣  检查数据库表..."
if psql "$DATABASE_URL" -c "\d validated_trajectories" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ validated_trajectories 表存在${NC}"
else
    echo -e "${RED}❌ validated_trajectories 表不存在，请先运行数据库迁移${NC}"
    echo "   运行: npx prisma migrate dev --name add_validated_trajectory"
    exit 1
fi

echo ""
echo "2️⃣  检查表结构..."
TABLE_COLS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'validated_trajectories';" | tr -d ' ')
if [ "$TABLE_COLS" -ge 20 ]; then
    echo -e "${GREEN}✅ 表结构正确（${TABLE_COLS} 个字段）${NC}"
else
    echo -e "${YELLOW}⚠️  表字段数量异常（${TABLE_COLS} 个字段）${NC}"
fi

echo ""
echo "3️⃣  检查索引..."
INDEX_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'validated_trajectories';" | tr -d ' ')
if [ "$INDEX_COUNT" -ge 8 ]; then
    echo -e "${GREEN}✅ 索引创建正确（${INDEX_COUNT} 个索引）${NC}"
else
    echo -e "${YELLOW}⚠️  索引数量异常（${INDEX_COUNT} 个索引）${NC}"
fi

echo ""
echo "4️⃣  检查 Prisma Client..."
if [ -d "node_modules/@prisma/client" ]; then
    echo -e "${GREEN}✅ Prisma Client 已生成${NC}"
else
    echo -e "${YELLOW}⚠️  Prisma Client 未生成，运行: npx prisma generate${NC}"
fi

echo ""
echo "5️⃣  运行测试..."
if npm test -- src/agent/training --testPathIgnorePatterns=e2e --silent > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 所有测试通过${NC}"
else
    echo -e "${RED}❌ 测试失败，请检查${NC}"
    npm test -- src/agent/training --testPathIgnorePatterns=e2e
    exit 1
fi

echo ""
echo "6️⃣  检查服务文件..."
FILES=(
    "src/agent/training/services/trajectory-validator.service.ts"
    "src/agent/training/services/trajectory-collection.service.ts"
    "src/agent/training/training.controller.ts"
    "src/agent/training/training.module.ts"
)

ALL_EXIST=true
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${RED}❌ $file 不存在${NC}"
        ALL_EXIST=false
    fi
done

if [ "$ALL_EXIST" = false ]; then
    exit 1
fi

echo ""
echo "=================================="
echo -e "${GREEN}✅ 所有检查通过！${NC}"
echo ""
echo "下一步："
echo "1. 启动服务: npm run start:dev"
echo "2. 测试 API: 参考 docs/ITERATIVE_DEPLOYMENT_VERIFICATION_GUIDE.md"
echo "3. 验证自动收集: 发送规划请求，检查轨迹是否自动收集"
