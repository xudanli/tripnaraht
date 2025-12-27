# 决策日志数据库迁移指南

## 概述

本文档说明如何创建和迁移 `decision_logs` 表。

## 迁移步骤

### 1. 生成迁移文件

```bash
npx prisma migrate dev --name add_decision_logs
```

这将：
- 创建迁移文件（在 `prisma/migrations/` 目录）
- 应用到开发数据库
- 重新生成 Prisma Client

### 2. 或直接推送到数据库（开发环境）

```bash
npx prisma db push
```

**注意**：`db push` 不会创建迁移文件，只适合开发环境。

### 3. 生产环境迁移

```bash
# 生成迁移文件（不应用）
npx prisma migrate dev --create-only --name add_decision_logs

# 检查迁移文件
cat prisma/migrations/XXXXX_add_decision_logs/migration.sql

# 应用到生产数据库
npx prisma migrate deploy
```

## 验证

### 1. 检查表结构

```sql
-- 连接到数据库
psql $DATABASE_URL

-- 检查表是否存在
\dt decision_logs

-- 检查表结构
\d decision_logs

-- 检查索引
\di decision_logs*
```

### 2. 测试插入

```typescript
// 在代码中测试
const logStorage = app.get(DecisionLogStorageService);
await logStorage.saveLogEntry({
  persona: 'ABU',
  action: 'ALLOW',
  explanation: '测试日志',
  reasonCodes: [],
  timestamp: new Date().toISOString(),
  decisionSource: 'PHYSICAL',
}, {
  countryCode: 'IS',
  routeDirectionId: 'test_rd',
});
```

### 3. 测试查询

```typescript
// 测试统计查询
const stats = await decisionStats.getStatsByCountry('IS');
console.log('统计结果:', stats);
```

## 表结构

```sql
CREATE TABLE "decision_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trip_id" UUID,
  "country_code" VARCHAR(2),
  "route_direction_id" VARCHAR(255),
  "persona" VARCHAR(20) NOT NULL,
  "action" VARCHAR(20) NOT NULL,
  "decision_source" VARCHAR(20) NOT NULL,
  "explanation" TEXT NOT NULL,
  "reason_codes" TEXT[] NOT NULL,
  "evidence_refs" TEXT[] NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,

  CONSTRAINT "decision_logs_pkey" PRIMARY KEY ("id")
);

-- 索引
CREATE INDEX "decision_logs_trip_id_idx" ON "decision_logs"("trip_id");
CREATE INDEX "decision_logs_country_code_idx" ON "decision_logs"("country_code");
CREATE INDEX "decision_logs_route_direction_id_idx" ON "decision_logs"("route_direction_id");
CREATE INDEX "decision_logs_decision_source_idx" ON "decision_logs"("decision_source");
CREATE INDEX "decision_logs_persona_idx" ON "decision_logs"("persona");
CREATE INDEX "decision_logs_timestamp_idx" ON "decision_logs"("timestamp");
CREATE INDEX "decision_logs_country_code_route_direction_id_decision_source_idx" 
  ON "decision_logs"("country_code", "route_direction_id", "decision_source");
```

## 回滚（如果需要）

```bash
# 回滚到上一个迁移
npx prisma migrate resolve --rolled-back XXXXX_add_decision_logs

# 或手动删除表
psql $DATABASE_URL -c "DROP TABLE IF EXISTS decision_logs;"
```

## 性能优化建议

### 1. 分区表（如果数据量很大）

如果预期 `decision_logs` 表会非常大（百万级记录），可以考虑按时间分区：

```sql
-- 按月分区
CREATE TABLE decision_logs_2024_01 PARTITION OF decision_logs
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

### 2. 定期归档

```sql
-- 归档 6 个月前的数据
CREATE TABLE decision_logs_archive AS
SELECT * FROM decision_logs
WHERE timestamp < NOW() - INTERVAL '6 months';

DELETE FROM decision_logs
WHERE timestamp < NOW() - INTERVAL '6 months';
```

### 3. 监控查询性能

```sql
-- 查看慢查询
SELECT * FROM pg_stat_statements
WHERE query LIKE '%decision_logs%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

## 常见问题

### Q: 迁移失败怎么办？

A: 检查：
1. 数据库连接是否正常
2. 是否有足够的权限
3. 表是否已存在（如果存在，需要先删除或使用 `--skip-seed`）

### Q: 如何查看迁移历史？

A:
```bash
npx prisma migrate status
```

### Q: 生产环境如何迁移？

A: 使用 `prisma migrate deploy`，它只应用未应用的迁移，不会生成新的迁移文件。

## 下一步

迁移完成后：
1. 运行测试确保功能正常
2. 监控数据库性能
3. 设置定期备份
4. 考虑数据归档策略

