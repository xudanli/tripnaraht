# Planning Plans 表迁移指南

## 问题描述

`planning_plans` 表在数据库中不存在，导致 Planning Workbench Admin API 无法正常工作。

## 解决方案

### 1. 如果迁移失败（表不存在错误）

如果遇到 `relation "trips" does not exist` 错误，使用修复脚本：

```bash
# 使用修复脚本（推荐）
./scripts/fix-planning-plans-migration.sh

# 或手动修复：
# 1. 标记失败的迁移为已回滚
npx prisma migrate resolve --rolled-back 20260121102400_add_planning_plans_table

# 2. 重新运行迁移
npx prisma migrate deploy
```

### 2. 运行迁移

已创建迁移文件：`prisma/migrations/20260121102400_add_planning_plans_table/migration.sql`

执行以下命令来运行迁移：

```bash
# 方法 1: 使用 Prisma Migrate（推荐）
npx prisma migrate deploy

# 方法 2: 手动执行 SQL（如果 migrate deploy 失败）
psql $DATABASE_URL -f prisma/migrations/20260121102400_add_planning_plans_table/migration.sql
```

**注意**: 迁移文件已经更新，会自动检测 Trip 表是否存在。如果 Trip 表不存在，会跳过外键约束，表仍然可以正常工作。

### 2. 验证表已创建

执行以下 SQL 验证表是否存在：

```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'planning_plans'
);
```

### 3. 临时解决方案

如果暂时无法运行迁移，代码已经添加了错误处理，API 会在表不存在时返回空结果而不是崩溃。

## 迁移文件内容

迁移文件创建了以下内容：

- **表**: `planning_plans`
- **索引**:
  - `planning_plans_trip_id_idx`
  - `planning_plans_trip_id_status_idx`
  - `planning_plans_status_idx`
  - `planning_plans_created_at_idx`
- **外键**: `planning_plans_trip_id_fkey` (关联到 `Trip` 或 `trips` 表，如果表不存在则跳过)

## 注意事项

- 迁移需要在生产环境数据库上执行
- 确保有数据库备份
- 迁移是幂等的（使用 `IF NOT EXISTS`），可以安全地重复执行
- 如果 Trip 表不存在，外键约束会被跳过，但表仍然可以正常工作
- 外键约束可以在 Trip 表创建后手动添加

## 故障排除

### 问题：迁移失败，提示 "relation trips does not exist"

**原因**: 数据库中 Trip 表可能不存在或表名不同

**解决**:
1. 迁移文件已更新，会自动检测并跳过外键约束
2. 使用修复脚本：`./scripts/fix-planning-plans-migration.sh`
3. 或手动标记迁移为已回滚后重新运行

### 问题：迁移部分成功，但外键未创建

**原因**: Trip 表不存在，外键被跳过

**解决**: 
- 这是正常的，表仍然可以正常工作
- 如果后续创建了 Trip 表，可以手动添加外键：
  ```sql
  ALTER TABLE "planning_plans" 
  ADD CONSTRAINT "planning_plans_trip_id_fkey" 
  FOREIGN KEY ("trip_id") 
  REFERENCES "Trip"("id") 
  ON DELETE CASCADE 
  ON UPDATE CASCADE;
  ```
