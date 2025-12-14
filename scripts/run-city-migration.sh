#!/bin/bash
# 运行 City 表迁移脚本

set -e

echo "🔄 运行 City 表数据库迁移..."
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
# 格式: postgresql://user:password@host:port/database?schema=public
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
    
    # 执行迁移 SQL
    echo "🚀 执行迁移 SQL..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f prisma/migrations/add_city_fields.sql
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ 迁移成功完成！"
    else
        echo ""
        echo "❌ 迁移失败"
        exit 1
    fi
else
    echo "❌ 无法解析 DATABASE_URL"
    exit 1
fi

