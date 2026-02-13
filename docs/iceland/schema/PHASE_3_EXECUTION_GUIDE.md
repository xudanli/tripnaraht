# Phase 3 执行指南

> **当前状态**: ✅ 迁移文件已创建,待执行
> **迁移文件**: `prisma/migrations/20260213103119_add_iceland_realtime_tables/migration.sql`
> **创建时间**: 2026-02-13

---

## ⚠️ 重要提示

**本迁移将修改数据库 schema,包括:**
- 创建 2 个新表 (`road_status_realtime`, `weather_forecast_realtime`)
- 修改 1 个现有表 (`Place`,添加 3 个字段)
- 创建 13 个新索引

**请在执行前:**
1. 确认当前环境 (开发/生产)
2. 备份数据库
3. 在开发环境测试后再应用到生产环境

---

## 📋 执行前检查清单

- [ ] 确认 `DATABASE_URL` 环境变量指向正确的数据库
- [ ] 备份当前数据库
- [ ] 检查磁盘空间是否充足
- [ ] 确认 PostGIS 扩展已启用 (天气表需要 geography 类型)
- [ ] 确认有数据库DDL权限

---

## 🔧 执行步骤

### Step 1: 备份数据库

```bash
# 开发环境
pg_dump -h localhost -U tripnara -d tripnara_dev > backup_phase3_$(date +%Y%m%d_%H%M%S).sql

# 生产环境 (谨慎!)
pg_dump -h <host> -U <user> -d tripnara_prod > backup_prod_phase3_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: 检查数据库连接

```bash
# 查看当前 DATABASE_URL
echo $DATABASE_URL

# 或者检查 .env 文件
cat .env | grep DATABASE_URL
```

### Step 3: 执行迁移

#### 方案 A: 使用 Prisma Migrate (推荐)

```bash
# 标记迁移为已应用 (不执行SQL)
npx prisma migrate resolve --applied 20260213103119_add_iceland_realtime_tables

# 然后手动执行SQL
psql $DATABASE_URL < prisma/migrations/20260213103119_add_iceland_realtime_tables/migration.sql
```

#### 方案 B: 直接执行 SQL

```bash
psql $DATABASE_URL -f prisma/migrations/20260213103119_add_iceland_realtime_tables/migration.sql
```

#### 方案 C: 使用 Prisma Studio (可视化)

```bash
# 仅查看,不执行
npx prisma studio
```

### Step 4: 验证迁移成功

```sql
-- 检查新表是否创建
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('road_status_realtime', 'weather_forecast_realtime');

-- 检查 Place 表新字段
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Place'
  AND column_name IN ('last_verified_at', 'data_source', 'data_freshness');

-- 检查索引是否创建
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('road_status_realtime', 'weather_forecast_realtime', 'Place')
ORDER BY tablename, indexname;
```

预期结果:
```
table_name
---------------------------
road_status_realtime
weather_forecast_realtime
(2 rows)

column_name      | data_type
-----------------|--------------------------
last_verified_at | timestamp with time zone
data_source      | character varying
data_freshness   | character varying
(3 rows)

indexname
-----------------------------------------------------
idx_road_status_road_verified
road_status_realtime_current_status_idx
road_status_realtime_data_source_idx
road_status_realtime_last_verified_at_idx
road_status_realtime_pkey
road_status_realtime_road_id_idx
... (13 total indexes)
```

### Step 5: 重新生成 Prisma Client

```bash
npx prisma generate
```

### Step 6: 运行测试脚本

```bash
npx tsx scripts/test-phase3-migration.ts
```

(测试脚本稍后创建)

---

## 🔄 回滚方案

如果迁移失败或需要回滚:

### 方案 1: 恢复备份 (推荐)

```bash
# 恢复备份
psql $DATABASE_URL < backup_phase3_YYYYMMDD_HHMMSS.sql
```

### 方案 2: 手动回滚

```sql
-- 删除新表
DROP TABLE IF EXISTS weather_forecast_realtime CASCADE;
DROP TABLE IF EXISTS road_status_realtime CASCADE;

-- 删除 Place 表新字段
ALTER TABLE "Place" DROP COLUMN IF EXISTS last_verified_at;
ALTER TABLE "Place" DROP COLUMN IF EXISTS data_source;
ALTER TABLE "Place" DROP COLUMN IF EXISTS data_freshness;
```

---

## 📊 预期影响

### 磁盘空间

假设每天同步 22 条 F-road,保留 90 天历史:

```
road_status_realtime:
- 每条记录约 1KB
- 22 roads × 90 days = 1,980 records ≈ 2MB

weather_forecast_realtime:
- 每条记录约 0.5KB
- 10 regions × 7 days × 4 forecasts/day × 90 days retention = 25,200 records ≈ 13MB

Place 表新字段:
- 3 个字段,每个约 10 bytes
- 假设 100,000 POI = 100,000 × 30 bytes ≈ 3MB

总计: 约 18MB
```

### 性能影响

- Place 表新增 2 个索引,写入性能影响: < 5%
- 新表索引查询性能: 优秀 (< 10ms)
- 无锁表操作,不影响现有查询

---

## ✅ 验收标准

迁移成功后,必须满足:

- ✅ `road_status_realtime` 表已创建,包含所有字段和索引
- ✅ `weather_forecast_realtime` 表已创建,包含所有字段和索引
- ✅ `Place` 表添加 3 个新字段,包含 2 个索引
- ✅ 现有 Place 数据完整 (行数不变)
- ✅ Prisma Client 重新生成成功
- ✅ 所有现有功能正常运行
- ✅ 可以向新表插入测试数据
- ✅ 索引查询性能符合预期 (< 100ms)

---

## 🎯 下一步

迁移成功后:

1. **Backfill Place lastVerifiedAt** (可选)
   ```sql
   UPDATE "Place"
   SET
     "last_verified_at" = CURRENT_TIMESTAMP - INTERVAL '60 days',
     "data_source" = CASE
       WHEN "googlePlaceId" IS NOT NULL THEN 'google_places'
       ELSE 'osm'
     END,
     "data_freshness" = 'STALE'
   WHERE "last_verified_at" IS NULL;
   ```

2. **初始化 Road Status 数据**
   ```bash
   npx tsx scripts/cron/sync-road-status-daily.ts
   ```

3. **更新 RoadStatusRealtimeService**
   - 从内存缓存改为数据库查询

4. **更新 Cron Job**
   - 实际写入数据库 (移除 TODO 注释)

5. **天气 API 集成** (Phase 4)
   - 实现 `IcelandWeatherRealtimeService`

---

**最后更新**: 2026-02-13
**状态**: ✅ 迁移文件已创建,待执行
**责任人**: TripNARA 后端团队

⚠️  **请在开发环境充分测试后再应用到生产环境!**
