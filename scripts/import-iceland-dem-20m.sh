#!/bin/bash
#
# 导入冰岛 20m DEM 数据到 PostGIS
#
# 使用方法:
#   ./scripts/import-iceland-dem-20m.sh
#

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}导入冰岛 20m DEM 数据到 PostGIS${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查文件是否存在
DEM_FILE="data/iceland/IslandsDEMv1.0_20x20m_isn2016_zmasl.tif"
if [ ! -f "$DEM_FILE" ]; then
    echo -e "${RED}❌ 错误: DEM 文件不存在: $DEM_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 找到 DEM 文件: $DEM_FILE${NC}"
FILE_SIZE=$(ls -lh "$DEM_FILE" | awk '{print $5}')
echo -e "   文件大小: $FILE_SIZE"
echo ""

# 检查 raster2pgsql 是否可用
if ! command -v raster2pgsql &> /dev/null; then
    echo -e "${RED}❌ 错误: raster2pgsql 命令未找到${NC}"
    echo -e "${YELLOW}请安装 PostGIS 工具:${NC}"
    echo -e "  Ubuntu/Debian: sudo apt-get install postgis"
    echo -e "  macOS: brew install postgis"
    exit 1
fi

echo -e "${GREEN}✅ raster2pgsql 可用${NC}"
echo ""

# 检查数据库连接
if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}⚠️  警告: DATABASE_URL 环境变量未设置${NC}"
    echo -e "请设置数据库连接信息，例如:"
    echo -e "  export DATABASE_URL='postgresql://user:password@localhost:5432/database'"
    exit 1
fi

# 从 DATABASE_URL 提取连接信息
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

if [ -z "$DB_NAME" ]; then
    echo -e "${RED}❌ 错误: 无法从 DATABASE_URL 解析数据库信息${NC}"
    exit 1
fi

echo -e "${BLUE}数据库信息:${NC}"
echo -e "  主机: ${DB_HOST:-localhost}"
echo -e "  端口: ${DB_PORT:-5432}"
echo -e "  数据库: $DB_NAME"
echo -e "  用户: ${DB_USER:-postgres}"
echo ""

# 表名
TABLE_NAME="geo_dem_iceland_20m"

# ISN2016 坐标系 SRID
# 注意：ISN2016 的 SRID 可能是 5327，但需要确认
# 如果文件使用 WGS84 (EPSG:4326)，则使用 4326
# 先尝试从文件获取 SRID，如果失败则使用默认值
SRID=${DEM_SRID:-5327}

# 尝试从 gdalinfo 获取 SRID
if command -v gdalinfo &> /dev/null; then
    FILE_SRID=$(gdalinfo "$DEM_FILE" 2>/dev/null | grep -i "EPSG\|AUTHORITY" | grep -oE "[0-9]+" | head -1 || echo "")
    if [ -n "$FILE_SRID" ]; then
        SRID=$FILE_SRID
        echo -e "${GREEN}✅ 从文件检测到 SRID: $SRID${NC}"
    else
        echo -e "${YELLOW}⚠️  无法从文件检测 SRID，使用默认值: $SRID${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  gdalinfo 未安装，使用默认 SRID: $SRID${NC}"
fi

echo -e "${BLUE}导入参数:${NC}"
echo -e "  表名: $TABLE_NAME"
echo -e "  SRID: $SRID (ISN2016)"
echo -e "  瓦片大小: 100x100 像素"
echo ""

# 确认导入
read -p "是否继续导入? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}取消导入${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}开始导入...${NC}"
echo ""

# 构建 psql 连接字符串
if [ -n "$DB_PASS" ]; then
    export PGPASSWORD="$DB_PASS"
fi

PSQL_CMD="psql"
if [ -n "$DB_HOST" ] && [ "$DB_HOST" != "localhost" ]; then
    PSQL_CMD="$PSQL_CMD -h $DB_HOST"
fi
if [ -n "$DB_PORT" ]; then
    PSQL_CMD="$PSQL_CMD -p $DB_PORT"
fi
if [ -n "$DB_USER" ]; then
    PSQL_CMD="$PSQL_CMD -U $DB_USER"
fi
PSQL_CMD="$PSQL_CMD -d $DB_NAME"

# 检查表是否已存在
TABLE_EXISTS=$(echo "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$TABLE_NAME');" | $PSQL_CMD -t -A 2>/dev/null || echo "f")

if [ "$TABLE_EXISTS" = "t" ]; then
    echo -e "${YELLOW}⚠️  警告: 表 $TABLE_NAME 已存在${NC}"
    read -p "是否删除现有表并重新导入? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}删除现有表...${NC}"
        echo "DROP TABLE IF EXISTS $TABLE_NAME CASCADE;" | $PSQL_CMD
        echo -e "${GREEN}✅ 表已删除${NC}"
        echo ""
    else
        echo -e "${YELLOW}取消导入${NC}"
        exit 0
    fi
fi

# 使用 raster2pgsql 导入
# 参数说明:
# -s SRID: 坐标系 SRID
# -I: 创建空间索引 (GIST)
# -C: 应用约束
# -M: 更新统计信息
# -F: 添加文件名列
# -t 100x100: 瓦片大小（100x100 像素）
# -R: 注册栅格（在 raster_columns 表中注册）

echo -e "${BLUE}执行 raster2pgsql...${NC}"
START_TIME=$(date +%s)

raster2pgsql \
    -s $SRID \
    -I \
    -C \
    -M \
    -F \
    -t 100x100 \
    -R \
    "$DEM_FILE" \
    "$TABLE_NAME" | $PSQL_CMD

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}✅ 导入完成！${NC}"
echo -e "   耗时: ${DURATION} 秒"
echo ""

# 验证导入
echo -e "${BLUE}验证导入结果...${NC}"
ROW_COUNT=$(echo "SELECT COUNT(*) FROM $TABLE_NAME;" | $PSQL_CMD -t -A 2>/dev/null || echo "0")
echo -e "   行数: $ROW_COUNT"

if [ "$ROW_COUNT" -gt 0 ]; then
    # 获取栅格信息
    RASTER_INFO=$(echo "SELECT 
        ST_Width(rast) as width,
        ST_Height(rast) as height,
        ST_ScaleX(rast) as scale_x,
        ST_ScaleY(rast) as scale_y,
        ST_UpperLeftX(rast) as upper_left_x,
        ST_UpperLeftY(rast) as upper_left_y,
        ST_SRID(rast) as srid
    FROM $TABLE_NAME LIMIT 1;" | $PSQL_CMD -t -A 2>/dev/null || echo "")
    
    if [ -n "$RASTER_INFO" ]; then
        echo -e "${GREEN}✅ 栅格数据验证成功${NC}"
        echo -e "   栅格信息: $RASTER_INFO"
    fi
else
    echo -e "${RED}❌ 警告: 表为空${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ 导入完成${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${BLUE}下一步:${NC}"
echo -e "  1. 更新 DEMElevationService 查询优先级，添加 $TABLE_NAME"
echo -e "  2. 运行测试脚本验证: npx tsx scripts/test-iceland-dem-direct.ts"
echo ""
