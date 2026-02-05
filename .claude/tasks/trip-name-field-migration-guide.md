# 行程名称字段 - 数据库迁移指南

## 📋 概述

本文档指导如何执行数据库迁移，为 Trip 表添加 `name` 字段，并为已有行程生成默认名称。

**迁移脚本位置**：`prisma/migrations/20260204100007_add_trip_name_field/migration.sql`

---

## ⚠️ 重要提示

1. **备份数据库**：执行迁移前必须备份生产数据库
2. **测试环境验证**：先在开发/测试环境执行并验证
3. **低峰期执行**：生产环境迁移建议在低峰期执行
4. **回滚方案**：准备好回滚方案（见下方）

---

## 🚀 执行步骤

### 步骤 1：备份数据库

```bash
# PostgreSQL 备份示例
pg_dump -h localhost -U your_user -d your_database > backup_before_trip_name_migration_$(date +%Y%m%d_%H%M%S).sql

# 或使用 Prisma Migrate 的备份功能
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script > backup.sql
```

### 步骤 2：检查当前数据状态

```sql
-- 检查 Trip 表结构
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'Trip'
ORDER BY ordinal_position;

-- 检查 Trip 表数据量
SELECT COUNT(*) as total_trips FROM "Trip";

-- 检查是否有 name 字段（如果已存在）
SELECT COUNT(*) as trips_with_name 
FROM "Trip" 
WHERE "name" IS NOT NULL;
```

### 步骤 3：在开发环境执行迁移

#### 方法 1：使用 Prisma Migrate（推荐）

```bash
# 进入项目目录
cd /home/devbox/project

# 执行迁移（开发环境）
npx prisma migrate dev --name add_trip_name_field

# 验证迁移结果
npx prisma studio
# 打开浏览器查看 Trip 表，确认 name 字段已添加
```

#### 方法 2：直接执行 SQL

```bash
# 连接到数据库
psql -h localhost -U your_user -d your_database

# 执行迁移脚本
\i prisma/migrations/20260204100007_add_trip_name_field/migration.sql

# 或使用 psql 命令行
psql -h localhost -U your_user -d your_database -f prisma/migrations/20260204100007_add_trip_name_field/migration.sql
```

### 步骤 4：验证迁移结果

```sql
-- 1. 检查字段是否添加成功
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'Trip' AND column_name = 'name';
-- 应该返回：name | character varying | 200 | YES

-- 2. 检查已有行程是否生成了默认名称
SELECT 
  COUNT(*) as total_trips,
  COUNT("name") as trips_with_name,
  COUNT(*) - COUNT("name") as trips_without_name
FROM "Trip";
-- trips_without_name 应该为 0（所有行程都有名称）

-- 3. 检查默认名称格式是否正确
SELECT 
  "id",
  "name",
  "destination",
  "startDate",
  CASE 
    WHEN "name" LIKE CONCAT(
      CASE 
        WHEN "destination" = 'IS' THEN '冰岛'
        WHEN "destination" = 'JP' THEN '日本'
        ELSE UPPER("destination")
      END,
      ' %'
    ) THEN '格式正确'
    ELSE '格式异常'
  END as name_format_check
FROM "Trip"
WHERE "name" IS NOT NULL
LIMIT 10;
-- 所有行的 name_format_check 应该都是"格式正确"

-- 4. 检查名称长度（应该都在 200 字符以内）
SELECT 
  COUNT(*) as trips_with_long_name
FROM "Trip"
WHERE LENGTH("name") > 200;
-- 应该返回 0
```

### 步骤 5：测试应用功能

```bash
# 1. 启动应用
npm run start:dev

# 2. 测试创建行程（不提供名称）
curl -X POST http://localhost:3000/api/trips \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "IS",
    "startDate": "2025-07-01",
    "endDate": "2025-07-10",
    "totalBudget": 50000,
    "travelers": [{"type": "ADULT", "mobilityTag": "CITY_POTATO"}]
  }'

# 3. 检查返回的行程数据，确认包含 name 字段
# 响应示例：
# {
#   "success": true,
#   "data": {
#     "id": "...",
#     "name": "冰岛 2025-07-01",  // 自动生成的默认名称
#     "destination": "IS",
#     ...
#   }
# }

# 4. 测试创建行程（提供名称）
curl -X POST http://localhost:3000/api/trips \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "IS",
    "startDate": "2025-07-01",
    "endDate": "2025-07-10",
    "totalBudget": 50000,
    "travelers": [{"type": "ADULT", "mobilityTag": "CITY_POTATO"}],
    "name": "冰岛环岛游"
  }'

# 5. 检查返回的行程数据，确认 name 为用户填写的值
```

### 步骤 6：在测试环境执行迁移

重复步骤 2-5，在测试环境执行迁移并验证。

### 步骤 7：在生产环境执行迁移

**⚠️ 生产环境迁移注意事项**：

1. **选择低峰期**：建议在凌晨或业务低峰期执行
2. **通知团队**：提前通知相关团队成员
3. **监控系统**：执行过程中监控系统状态
4. **准备回滚**：准备好回滚方案（见下方）

```bash
# 1. 备份生产数据库（必须！）
pg_dump -h production_host -U production_user -d production_db > production_backup_$(date +%Y%m%d_%H%M%S).sql

# 2. 执行迁移
psql -h production_host -U production_user -d production_db -f prisma/migrations/20260204100007_add_trip_name_field/migration.sql

# 3. 验证迁移结果（使用步骤 4 的 SQL）
# 4. 监控应用日志，确认无错误
```

---

## 🔄 回滚方案

如果迁移出现问题，可以执行以下回滚操作：

### 回滚 SQL

```sql
-- 1. 删除 name 字段（会丢失所有名称数据）
ALTER TABLE "Trip" DROP COLUMN IF EXISTS "name";

-- 2. 如果需要保留数据，可以先导出
-- 导出名称数据（可选）
COPY (
  SELECT "id", "name" 
  FROM "Trip" 
  WHERE "name" IS NOT NULL
) TO '/tmp/trip_names_backup.csv' WITH CSV HEADER;

-- 然后删除字段
ALTER TABLE "Trip" DROP COLUMN IF EXISTS "name";
```

### 使用 Prisma Migrate 回滚

```bash
# 查看迁移历史
npx prisma migrate status

# 回滚到上一个迁移
npx prisma migrate resolve --rolled-back 20260204100007_add_trip_name_field

# 或手动删除迁移记录
# 注意：这不会回滚数据库变更，需要手动执行 DROP COLUMN
```

---

## 📊 迁移性能评估

### 预估时间

- **小规模**（< 1,000 条记录）：< 1 秒
- **中等规模**（1,000 - 10,000 条记录）：1-5 秒
- **大规模**（10,000 - 100,000 条记录）：5-30 秒
- **超大规模**（> 100,000 条记录）：30 秒 - 2 分钟

### 性能优化（如需要）

如果数据量很大，可以考虑分批更新：

```sql
-- 分批更新（每次 1000 条）
DO $$
DECLARE
  batch_size INTEGER := 1000;
  updated_count INTEGER;
BEGIN
  LOOP
    UPDATE "Trip"
    SET "name" = CONCAT(
      CASE 
        WHEN "destination" = 'IS' THEN '冰岛'
        -- ... 其他映射
        ELSE UPPER("destination")
      END,
      ' ',
      TO_CHAR("startDate", 'YYYY-MM-DD')
    )
    WHERE "name" IS NULL
    AND "id" IN (
      SELECT "id" FROM "Trip" 
      WHERE "name" IS NULL 
      LIMIT batch_size
    );
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    EXIT WHEN updated_count = 0;
    
    -- 可选：添加延迟避免锁表
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;
```

---

## ✅ 迁移后检查清单

- [ ] 字段添加成功（`name` 字段存在）
- [ ] 所有已有行程都有名称（`name IS NULL` 的记录数为 0）
- [ ] 默认名称格式正确（`{目的地} {日期}`）
- [ ] 名称长度符合要求（所有名称 <= 200 字符）
- [ ] 创建新行程时自动生成默认名称
- [ ] 创建新行程时可以填写自定义名称
- [ ] 更新行程时可以修改名称
- [ ] API 返回数据包含 `name` 字段
- [ ] 应用功能正常（无错误日志）

---

## 🐛 常见问题

### Q1: 迁移执行失败，提示字段已存在

**A**: 检查是否已经执行过迁移：
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'Trip' AND column_name = 'name';
```

如果字段已存在，可以跳过添加字段的步骤，只执行更新默认名称的 SQL。

### Q2: 部分行程的名称格式不正确

**A**: 检查这些行程的 `destination` 和 `startDate` 是否正确：
```sql
SELECT "id", "name", "destination", "startDate"
FROM "Trip"
WHERE "name" NOT LIKE CONCAT(
  CASE 
    WHEN "destination" = 'IS' THEN '冰岛'
    -- ... 其他映射
    ELSE UPPER("destination")
  END,
  ' %'
);
```

如果发现问题，可以手动修复或重新执行更新 SQL。

### Q3: 迁移后应用报错

**A**: 
1. 检查 Prisma 客户端是否已重新生成：`npx prisma generate`
2. 检查应用代码是否正确处理 `name` 字段
3. 查看应用日志，定位具体错误

### Q4: 如何验证迁移是否成功？

**A**: 执行以下验证 SQL：
```sql
-- 综合验证
SELECT 
  '字段存在' as check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Trip' AND column_name = 'name'
  ) THEN '✓' ELSE '✗' END as status
UNION ALL
SELECT 
  '所有行程都有名称',
  CASE WHEN (SELECT COUNT(*) FROM "Trip" WHERE "name" IS NULL) = 0 
    THEN '✓' ELSE '✗' END
UNION ALL
SELECT 
  '名称长度符合要求',
  CASE WHEN (SELECT COUNT(*) FROM "Trip" WHERE LENGTH("name") > 200) = 0 
    THEN '✓' ELSE '✗' END;
```

---

## 📚 相关文档

- **迁移脚本**：`prisma/migrations/20260204100007_add_trip_name_field/migration.sql`
- **PRD 文档**：`.claude/tasks/trip-name-field-prd.md`
- **实施总结**：`.claude/tasks/trip-name-field-implementation-summary.md`

---

**文档版本**：v1.0  
**创建日期**：2025-02-04  
**最后更新**：2025-02-04
