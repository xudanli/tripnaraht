#!/bin/bash
# 应用行程名称字段迁移脚本
# 用于解决 Prisma shadow database 问题

set -e

echo "🚀 应用行程名称字段迁移..."
echo ""

# 检查迁移文件是否存在
MIGRATION_FILE="prisma/migrations/20260204100007_add_trip_name_field/migration.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ 错误: 迁移文件不存在: $MIGRATION_FILE"
  exit 1
fi

# 检查 DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "❌ 错误: DATABASE_URL 环境变量未设置"
  echo "   请设置: export DATABASE_URL='postgresql://user:password@host:port/database'"
  exit 1
fi

echo "📋 迁移文件: $MIGRATION_FILE"
echo "📊 数据库: $(echo $DATABASE_URL | sed 's/:[^:]*@/:***@/')"
echo ""

# 检查 name 字段是否已存在
echo "🔍 检查当前状态..."
EXISTS=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'Trip' AND column_name = 'name';" 2>/dev/null || echo "0")

if [ "$EXISTS" = "1" ]; then
  echo "⚠️  警告: name 字段已存在"
  echo "   是否继续执行迁移（会更新已有数据）？(y/N)"
  read -r response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "迁移已取消"
    exit 0
  fi
fi

# 执行迁移
echo ""
echo "🔧 执行迁移..."
if psql "$DATABASE_URL" -f "$MIGRATION_FILE"; then
  echo ""
  echo "✅ SQL 迁移执行成功"
else
  echo ""
  echo "❌ SQL 迁移失败"
  exit 1
fi

# 验证迁移结果
echo ""
echo "🔍 验证迁移结果..."

TRIPS_WITHOUT_NAME=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM \"Trip\" WHERE \"name\" IS NULL;" 2>/dev/null || echo "-1")

if [ "$TRIPS_WITHOUT_NAME" = "-1" ]; then
  echo "⚠️  无法验证迁移结果（可能是权限问题）"
elif [ "$TRIPS_WITHOUT_NAME" = "0" ]; then
  echo "✅ 所有行程都有名称"
else
  echo "⚠️  警告: 仍有 $TRIPS_WITHOUT_NAME 个行程没有名称"
fi

# 标记迁移为已应用（可选）
echo ""
echo "📝 标记迁移为已应用..."
echo "   是否标记迁移为已应用？(Y/n)"
read -r response
if [[ ! "$response" =~ ^[Nn]$ ]]; then
  # 插入迁移记录到 _prisma_migrations 表
  psql "$DATABASE_URL" -c "
    INSERT INTO \"_prisma_migrations\" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES (
      gen_random_uuid(),
      '',
      NOW(),
      '20260204100007_add_trip_name_field',
      NULL,
      NULL,
      NOW(),
      1
    )
    ON CONFLICT (migration_name) DO NOTHING;
  " 2>/dev/null && echo "✅ 迁移已标记为已应用" || echo "⚠️  无法标记迁移（可能需要手动标记）"
fi

echo ""
echo "🎉 迁移完成！"
echo ""
echo "📊 验证命令:"
echo "   psql \"\$DATABASE_URL\" -c \"SELECT COUNT(*) FROM \\\"Trip\\\" WHERE \\\"name\\\" IS NULL;\""
echo "   psql \"\$DATABASE_URL\" -c \"SELECT \\\"id\\\", \\\"name\\\", \\\"destination\\\", \\\"startDate\\\" FROM \\\"Trip\\\" LIMIT 5;\""
