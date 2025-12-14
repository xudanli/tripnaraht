#!/bin/bash
# 安全地合并并清理 adcode 数据
# 1. 先查看数据情况
# 2. 将 adcode 值更新到对应的城市记录
# 3. 删除所有有 adcode 的重复记录

set -e

echo "🔄 合并并清理 City 表的 adcode 数据..."
echo ""

# 从 .env 文件读取 DATABASE_URL
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep DATABASE_URL | xargs)
    echo "✅ 已读取数据库配置"
else
    echo "❌ 未找到 .env 文件"
    exit 1
fi

# 解析 DATABASE_URL
if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/([^?]+) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASSWORD="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
    
    echo "📊 数据库信息:"
    echo "  Host: $DB_HOST"
    echo "  Port: $DB_PORT"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    echo ""
    
    # 使用 PGPASSWORD 环境变量传递密码
    export PGPASSWORD="$DB_PASSWORD"
    
    # 先查看数据情况
    echo "📋 查看当前数据情况..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT 
            COUNT(*) as total_cities,
            COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) as cities_with_adcode,
            COUNT(CASE WHEN adcode IS NULL THEN 1 END) as cities_without_adcode
        FROM \"City\";
    "
    echo ""
    
    # 查看需要合并的重复组
    echo "🔍 查找需要合并的重复城市（有 adcode 和无 adcode 的重复）..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT 
            name,
            \"countryCode\",
            COUNT(*) as count,
            COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) as with_adcode,
            COUNT(CASE WHEN adcode IS NULL THEN 1 END) as without_adcode
        FROM \"City\"
        GROUP BY name, \"countryCode\"
        HAVING COUNT(*) > 1
          AND COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) > 0
          AND COUNT(CASE WHEN adcode IS NULL THEN 1 END) > 0
        ORDER BY name, \"countryCode\"
        LIMIT 20;
    "
    echo ""
    
    # 询问用户确认（如果提供了 --yes 参数则跳过）
    if [ "$1" != "--yes" ]; then
        read -p "⚠️  确认要继续执行合并和删除操作吗？(yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "❌ 操作已取消"
            exit 0
        fi
    else
        echo "⚠️  使用 --yes 参数，跳过确认，直接执行..."
    fi
    
    # 执行迁移 SQL
    echo "🚀 执行合并和清理操作..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f scripts/merge-and-cleanup-adcode.sql
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ 操作成功完成！"
        echo ""
        echo "📊 最终数据统计:"
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
            SELECT 
                COUNT(*) as total_cities,
                COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) as cities_with_adcode,
                COUNT(CASE WHEN adcode IS NULL THEN 1 END) as cities_without_adcode
            FROM \"City\";
        "
    else
        echo ""
        echo "❌ 操作失败"
        exit 1
    fi
else
    echo "❌ 无法解析 DATABASE_URL"
    exit 1
fi

