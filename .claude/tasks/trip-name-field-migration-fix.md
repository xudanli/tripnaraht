# 行程名称字段迁移 - 问题修复指南

## 🔴 问题描述

执行 `npx prisma migrate dev --name add_trip_name_field` 时遇到错误：

```
Error: P3006
Migration `20250115000000_add_decision_logging_fields` failed to apply cleanly to the shadow database. 
Error code: P1014
Error: The underlying table for model `decision_logs` does not exist.
```

## 🔍 问题原因

这是 Prisma shadow database 的问题。Prisma 在开发模式下会创建一个临时的 shadow database 来验证迁移，但：
1. Shadow database 可能没有正确初始化
2. 之前的迁移在 shadow database 中失败
3. 生产数据库状态与迁移历史不一致

## ✅ 解决方案

### 方案 1：直接执行 SQL 迁移（推荐，适用于生产环境）

**步骤**：

1. **使用提供的脚本**（推荐）：
```bash
cd /home/devbox/project
./scripts/apply-trip-name-migration.sh
```

2. **或手动执行 SQL**：
```bash
# 直接执行迁移 SQL
psql "$DATABASE_URL" -f prisma/migrations/20260204100007_add_trip_name_field/migration.sql

# 验证结果
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Trip\" WHERE \"name\" IS NULL;"
# 应该返回 0
```

3. **标记迁移为已应用**（可选）：
```sql
-- 连接到数据库
psql "$DATABASE_URL"

-- 插入迁移记录
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
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
```

### 方案 2：使用 migrate deploy（适用于生产环境）

```bash
# 跳过 shadow database 检查
npx prisma migrate deploy
```

### 方案 3：修复 shadow database（仅适用于开发环境）

```bash
# 重置 shadow database
npx prisma migrate reset

# 然后重新执行迁移
npx prisma migrate dev --name add_trip_name_field
```

**⚠️ 注意**：`migrate reset` 会删除所有数据，仅适用于开发环境！

---

## 🔧 详细步骤（方案 1 - 推荐）

### 步骤 1：检查当前状态

```bash
cd /home/devbox/project

# 检查 name 字段是否已存在
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'Trip' AND column_name = 'name';"

# 检查有多少行程没有名称
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Trip\" WHERE \"name\" IS NULL;"
```

### 步骤 2：备份数据库（重要！）

```bash
# 备份数据库
pg_dump "$DATABASE_URL" > backup_before_trip_name_$(date +%Y%m%d_%H%M%S).sql

# 或使用 Prisma 备份
npx prisma db pull --force
```

### 步骤 3：执行迁移

```bash
# 方法 A：使用脚本（推荐）
./scripts/apply-trip-name-migration.sh

# 方法 B：直接执行 SQL
psql "$DATABASE_URL" -f prisma/migrations/20260204100007_add_trip_name_field/migration.sql
```

### 步骤 4：验证结果

```sql
-- 1. 检查字段是否存在
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'Trip' AND column_name = 'name';
-- 应该返回：name | character varying | 200 | YES

-- 2. 检查所有行程是否都有名称
SELECT 
  COUNT(*) as total_trips,
  COUNT("name") as trips_with_name,
  COUNT(*) - COUNT("name") as trips_without_name
FROM "Trip";
-- trips_without_name 应该为 0

-- 3. 检查名称格式示例
SELECT "id", "name", "destination", "startDate"
FROM "Trip"
WHERE "name" IS NOT NULL
LIMIT 5;
```

### 步骤 5：标记迁移为已应用

```sql
-- 插入迁移记录
INSERT INTO "_prisma_migrations" (
  id, 
  checksum, 
  finished_at, 
  migration_name, 
  logs, 
  rolled_back_at, 
  started_at, 
  applied_steps_count
)
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

-- 验证迁移记录
SELECT migration_name, finished_at 
FROM "_prisma_migrations" 
WHERE migration_name = '20260204100007_add_trip_name_field';
```

---

## 🐛 常见问题

### Q1: 执行 SQL 时提示权限不足

**A**: 确保数据库用户有足够的权限：
```sql
-- 检查权限
SELECT has_table_privilege('your_user', 'Trip', 'ALTER');
SELECT has_table_privilege('your_user', 'Trip', 'UPDATE');
```

### Q2: 迁移后部分行程没有名称

**A**: 检查这些行程的 `destination` 和 `startDate` 是否正确：
```sql
SELECT "id", "destination", "startDate", "name"
FROM "Trip"
WHERE "name" IS NULL;
```

如果发现问题，可以手动修复或重新执行更新 SQL。

### Q3: 如何回滚迁移？

**A**: 如果需要回滚：
```sql
-- 1. 导出名称数据（可选）
COPY (
  SELECT "id", "name" 
  FROM "Trip" 
  WHERE "name" IS NOT NULL
) TO '/tmp/trip_names_backup.csv' WITH CSV HEADER;

-- 2. 删除字段
ALTER TABLE "Trip" DROP COLUMN IF EXISTS "name";

-- 3. 删除迁移记录
DELETE FROM "_prisma_migrations" 
WHERE migration_name = '20260204100007_add_trip_name_field';
```

---

## ✅ 验证清单

迁移完成后，确认以下内容：

- [ ] `name` 字段已添加到 `Trip` 表
- [ ] 所有已有行程都有名称（`name IS NULL` 的记录数为 0）
- [ ] 默认名称格式正确（`{目的地} {日期}`）
- [ ] 名称长度符合要求（所有名称 <= 200 字符）
- [ ] 迁移记录已添加到 `_prisma_migrations` 表
- [ ] 应用可以正常创建和更新行程

---

## 📚 相关文档

- **迁移脚本**：`prisma/migrations/20260204100007_add_trip_name_field/migration.sql`
- **迁移指南**：`.claude/tasks/trip-name-field-migration-guide.md`
- **应用脚本**：`scripts/apply-trip-name-migration.sh`

---

**文档版本**：v1.0  
**创建日期**：2025-02-04
