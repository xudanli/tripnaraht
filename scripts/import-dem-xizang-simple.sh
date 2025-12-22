#!/bin/bash
#
# 使用 Docker 或系统 raster2pgsql 导入 DEM 数据
#
# 使用方法:
#   bash scripts/import-dem-xizang-simple.sh "data/geographic/dem/xizang/dem地形.tif"
#

set -e

TIF_PATH="${1:-data/geographic/dem/xizang/dem地形.tif}"
TABLE_NAME="${2:-geo_dem_xizang}"
DROP_EXISTING="${3:-false}"

if [ ! -f "$TIF_PATH" ]; then
    echo "❌ 错误: TIF 文件不存在: $TIF_PATH"
    exit 1
fi

echo "🔄 开始导入西藏 DEM 数据"
echo "📁 TIF 文件: $TIF_PATH"
echo "📋 表名: $TABLE_NAME"
echo ""

# 检查 raster2pgsql 是否可用
if command -v raster2pgsql &> /dev/null; then
    echo "✅ 找到 raster2pgsql"
    RASTER2PGSQL_CMD="raster2pgsql"
elif command -v docker &> /dev/null; then
    echo "✅ 使用 Docker 运行 raster2pgsql"
    RASTER2PGSQL_CMD="docker run --rm -v $(pwd):/data -w /data postgis/postgis:15-3.4 raster2pgsql"
else
    echo "❌ 错误: 未找到 raster2pgsql 或 Docker"
    echo ""
    echo "安装方法:"
    echo "  1. 安装 PostGIS: sudo apt-get install postgis"
    echo "  2. 或使用 Docker: docker pull postgis/postgis:15-3.4"
    exit 1
fi

# 获取数据库连接信息
if [ -z "$DATABASE_URL" ]; then
    echo "❌ 错误: DATABASE_URL 环境变量未设置"
    exit 1
fi

# 解析 DATABASE_URL
# postgresql://user:password@host:port/database
DB_URL_REGEX="postgresql://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+)"
if [[ ! $DATABASE_URL =~ $DB_URL_REGEX ]]; then
    echo "❌ 错误: 无法解析 DATABASE_URL"
    exit 1
fi

DB_USER="${BASH_REMATCH[1]}"
DB_PASSWORD="${BASH_REMATCH[2]}"
DB_HOST="${BASH_REMATCH[3]}"
DB_PORT="${BASH_REMATCH[4]}"
DB_NAME="${BASH_REMATCH[5]}"

echo "🔌 数据库: $DB_HOST:$DB_PORT/$DB_NAME"
echo ""

# 如果 dropExisting，先删除表
if [ "$DROP_EXISTING" = "true" ]; then
    echo "🗑️  删除现有表..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "DROP TABLE IF EXISTS $TABLE_NAME CASCADE;" || true
    echo "✅ 表已删除"
    echo ""
fi

# 导入 DEM 数据
echo "📥 使用 raster2pgsql 导入 DEM 数据..."
echo "   （这可能需要几分钟，取决于文件大小）"
echo ""

# 构建 raster2pgsql 命令
RASTER2PGSQL_ARGS=(
    -s 4326          # SRID
    -I               # 创建空间索引
    -C               # 应用栅格约束
    -t 256x256       # 瓦片大小
    -F               # 添加文件名列
    "$TIF_PATH"
    "$TABLE_NAME"
)

# 执行导入
$RASTER2PGSQL_CMD "${RASTER2PGSQL_ARGS[@]}" | \
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"

echo ""
echo "✅ DEM 数据导入完成！"
echo ""
echo "💡 验证导入:"
echo "   PGPASSWORD=\"$DB_PASSWORD\" psql -h \"$DB_HOST\" -p \"$DB_PORT\" -U \"$DB_USER\" -d \"$DB_NAME\" -c \"SELECT COUNT(*) FROM $TABLE_NAME;\""

