#!/bin/bash
# 修复 planning_plans 迁移失败的脚本

set -e

echo "🔧 修复 planning_plans 迁移..."

# 1. 标记失败的迁移为已回滚
echo "1. 标记失败的迁移为已回滚..."
npx prisma migrate resolve --rolled-back 20260121102400_add_planning_plans_table || {
  echo "⚠️  如果标记失败，可能需要手动在数据库中执行："
  echo "   UPDATE \"_prisma_migrations\" SET rolled_back_at = NOW() WHERE migration_name = '20260121102400_add_planning_plans_table' AND finished_at IS NULL;"
}

# 2. 重新运行迁移
echo ""
echo "2. 重新运行迁移..."
npx prisma migrate deploy || {
  echo "⚠️  迁移仍然失败，尝试手动执行 SQL..."
  echo "   执行: psql \$DATABASE_URL -f prisma/migrations/20260121102400_add_planning_plans_table/migration.sql"
  exit 1
}

echo ""
echo "✅ 迁移完成！"
