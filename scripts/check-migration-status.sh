#!/bin/bash
# 检查 Prisma 迁移状态的脚本
# 使用方法：在 Jenkins 容器中运行，或本地运行（需要 DATABASE_URL 环境变量）

set -e

if [ -z "$DATABASE_URL" ]; then
  echo "❌ 错误: DATABASE_URL 环境变量未设置"
  exit 1
fi

echo "🔍 检查迁移状态..."
echo ""

# 提取数据库连接信息
DB_URL="$DATABASE_URL"

# 使用 psql 查询失败的迁移（如果可用）
if command -v psql >/dev/null 2>&1; then
  echo "使用 psql 查询..."
  psql "$DB_URL" -c "
    SELECT 
        migration_name,
        started_at,
        finished_at,
        rolled_back_at
    FROM \"_prisma_migrations\" 
    WHERE finished_at IS NULL
    ORDER BY started_at DESC;
  " || echo "⚠️  psql 查询失败，可能需要安装 postgresql-client"
else
  echo "⚠️  psql 不可用，无法直接查询数据库"
  echo "请使用数据库管理工具执行以下 SQL:"
  echo ""
  echo "SELECT migration_name, started_at, finished_at, rolled_back_at"
  echo "FROM \"_prisma_migrations\""
  echo "WHERE finished_at IS NULL;"
fi

echo ""
echo "如果看到失败的迁移记录，请执行修复 SQL（见 JENKINS_DATABASE_SETUP.md）"
