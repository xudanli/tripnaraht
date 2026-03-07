#!/bin/bash
# 团队邀请表迁移脚本（绕过 prisma migrate dev 的 shadow DB 问题）
# 用法: ./scripts/run-team-invite-migration.sh

set -e

if [ -z "$DATABASE_URL" ]; then
  echo "❌ 请设置 DATABASE_URL 环境变量"
  echo "   export DATABASE_URL='postgresql://user:pass@host:5432/db'"
  exit 1
fi

MIGRATION_FILE="prisma/migrations/20260302000000_add_collaboration_team_invite/migration.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ 迁移文件不存在: $MIGRATION_FILE"
  exit 1
fi

echo "📦 执行团队邀请表迁移..."
psql "$DATABASE_URL" -f "$MIGRATION_FILE"

echo "📝 注册迁移记录..."
psql "$DATABASE_URL" -c "
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, '', NOW(), '20260302000000_add_collaboration_team_invite', NULL, NULL, NOW(), 1
WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260302000000_add_collaboration_team_invite');
"

echo "✅ 迁移完成"
