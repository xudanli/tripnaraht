# Phase 3 迁移后续任务清单

> **前置条件**: 数据库迁移已执行并验证通过
> **预计工作量**: 4-6 小时
> **优先级**: P0 (迁移完成后立即执行)

---

## ✅ 前置检查清单

在开始后续任务前,请确认:

- [ ] 数据库迁移已成功执行
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_name IN ('road_status_realtime', 'weather_forecast_realtime');
  ```
  预期结果: 2 rows

- [ ] Prisma Client 已重新生成
  ```bash
  npx prisma generate
  ```

- [ ] 测试脚本验证通过
  ```bash
  npx tsx scripts/test-phase3-migration.ts
  ```
  预期输出: ✅ Phase 3 迁移验证完成

- [ ] 新表可以正常插入数据
  ```typescript
  const test = await prisma.roadStatusRealtime.create({
    data: { roadId: 'F208', ... }
  });
  ```

---

## 📋 任务列表

### Task 1: 更新 RoadStatusRealtimeService (2-3 小时)

**目标**: 从内存缓存改为数据库持久化

**文件**: [`src/skills/world/services/road-status-realtime.service.ts`](../../src/skills/world/services/road-status-realtime.service.ts)

**修改内容**:

#### 1.1 添加 Prisma 依赖

```typescript
import { PrismaClient } from '@prisma/client';

@Injectable()
export class RoadStatusRealtimeService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.logger.log('✅ RoadStatusRealtimeService 已初始化 (使用数据库)');
  }
}
```

#### 1.2 修改 getRoadStatus() 方法

**当前逻辑**: 内存缓存 → API 查询 → 降级方案

**新逻辑**: 数据库缓存 (15分钟) → API 查询 → 写入数据库 → 降级方案

```typescript
async getRoadStatus(roadId: string): Promise<RoadStatus | null> {
  // 1. 查询数据库最新记录 (15 分钟内)
  const cached = await this.prisma.roadStatusRealtime.findFirst({
    where: {
      roadId,
      lastVerifiedAt: {
        gte: new Date(Date.now() - this.CACHE_TTL_MS),
      },
    },
    orderBy: { lastVerifiedAt: 'desc' },
  });

  if (cached) {
    this.logger.debug(`[Cache Hit] ${roadId}: ${cached.currentStatus}`);
    return this.dbRecordToRoadStatus(cached);
  }

  // 2. 缓存未命中,查询 API
  const apiStatus = await this.queryRoadIsAPI(roadId);

  if (apiStatus) {
    // 3. 写入数据库
    await this.saveToDatabase(apiStatus);
    return apiStatus;
  }

  // 4. API 失败,使用降级方案
  const fallbackStatus = this.getFallbackStatus(roadId);
  if (fallbackStatus) {
    await this.saveToDatabase(fallbackStatus);
  }

  return fallbackStatus;
}
```

#### 1.3 添加数据库写入方法

```typescript
private async saveToDatabase(status: RoadStatus): Promise<void> {
  try {
    await this.prisma.roadStatusRealtime.create({
      data: {
        roadId: status.roadId,
        roadName: status.roadName,
        currentStatus: status.currentStatus,
        statusMessage: status.statusMessage,
        lastVerifiedAt: status.lastVerifiedAt,
        dataSource: status.dataSource || 'road.is_api',
        apiResponse: status.apiResponse,
        hazards: status.hazards,
        confidence: status.confidence || 0.9,
        seasonalFallback: status.seasonalFallback || false,
      },
    });
    this.logger.debug(`[DB Write] ${status.roadId} saved`);
  } catch (error) {
    this.logger.error(`[DB Write Error] ${status.roadId}:`, error);
    // 写入失败不影响返回结果
  }
}

private dbRecordToRoadStatus(record: any): RoadStatus {
  return {
    roadId: record.roadId,
    roadName: record.roadName,
    currentStatus: record.currentStatus,
    statusMessage: record.statusMessage,
    lastVerifiedAt: record.lastVerifiedAt,
    hazards: record.hazards || [],
    dataSource: record.dataSource,
    confidence: record.confidence,
    seasonalFallback: record.seasonalFallback,
  };
}
```

#### 1.4 删除内存缓存相关代码

```typescript
// 删除这些:
- private readonly cache = new Map<string, CacheEntry>();
- clearCache() { this.cache.clear(); }
- getCacheStats() { ... }
```

#### 1.5 测试验证

```bash
# 单元测试
npm test -- road-status-realtime.service.spec.ts

# 集成测试
npx tsx scripts/test-road-status-service.ts
```

**预期结果**:
- ✅ 首次查询触发 API 调用并写入数据库
- ✅ 15分钟内重复查询从数据库读取
- ✅ 数据库写入失败时仍返回正确结果

---

### Task 2: 更新 Cron Job 写入数据库 (1-2 小时)

**目标**: 移除 TODO 注释,实际写入数据库

**文件**: [`scripts/cron/sync-road-status-daily.ts`](../../scripts/cron/sync-road-status-daily.ts)

**修改内容**:

#### 2.1 移除 TODO 注释 (行 116-135)

**当前代码**:
```typescript
// 注: 这里需要创建 RoadStatusRealtime 表
// 当前只能创建表但无法实际执行数据库操作
// TODO: 创建数据库记录
```

**修改为**:
```typescript
for (const status of results.statuses) {
  try {
    await prisma.roadStatusRealtime.create({
      data: {
        roadId: status.roadId,
        roadName: status.roadName,
        currentStatus: status.currentStatus,
        statusMessage: status.statusMessage,
        lastVerifiedAt: status.lastVerifiedAt,
        dataSource: status.dataSource,
        apiResponse: status.apiResponse,
        hazards: status.hazards,
        confidence: status.dataSource === 'road.is_api' ? 0.9 : 0.6,
        seasonalFallback: status.dataSource === 'static_seasonal_data',
      },
    });
    console.log(`   ✅ ${status.roadId}: ${status.currentStatus} 已写入数据库`);
  } catch (error) {
    console.error(`   ❌ ${status.roadId} 写入失败:`, error);
  }
}
```

#### 2.2 添加重复记录处理

由于可能每天多次运行,需要处理重复记录:

```typescript
// 方案 1: 使用 upsert (如果有唯一索引)
await prisma.roadStatusRealtime.upsert({
  where: {
    roadId_lastVerifiedAt: {
      roadId: status.roadId,
      lastVerifiedAt: status.lastVerifiedAt
    }
  },
  update: { /* 更新字段 */ },
  create: { /* 创建字段 */ },
});

// 方案 2: 简单创建 (允许重复,便于历史分析)
await prisma.roadStatusRealtime.create({ data: status });
```

**推荐**: 使用方案 2,允许重复记录,便于历史趋势分析

#### 2.3 添加数据清理逻辑

保留最近 90 天数据:

```typescript
// 在同步完成后清理旧数据
const deleted = await prisma.roadStatusRealtime.deleteMany({
  where: {
    lastVerifiedAt: {
      lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 天前
    },
  },
});
console.log(`\n🗑️  清理 ${deleted.count} 条过期记录 (> 90 天)`);
```

#### 2.4 测试执行

```bash
# 手动运行一次
npx tsx scripts/cron/sync-road-status-daily.ts

# 验证数据已写入
psql $DATABASE_URL -c "SELECT road_id, current_status, last_verified_at FROM road_status_realtime ORDER BY last_verified_at DESC LIMIT 22;"
```

**预期输出**:
```
📊 同步统计:
   - 成功: 0 条
   - 失败: 22 条
   - 已存储: 22 条 (降级数据)
   - 已写入数据库: 22 条 ✅

📈 状态分布:
   - closed: 22 条
```

---

### Task 3: Backfill Place lastVerifiedAt (30 分钟)

**目标**: 为现有 POI 设置初始数据新鲜度

**SQL 脚本**:

```sql
-- 为所有现有 Place 记录设置默认值
UPDATE "Place"
SET
  "last_verified_at" = CURRENT_TIMESTAMP - INTERVAL '60 days',
  "data_source" =
    CASE
      WHEN "googlePlaceId" IS NOT NULL THEN 'google_places'
      ELSE 'osm'
    END,
  "data_freshness" = 'STALE'
WHERE "last_verified_at" IS NULL;

-- 验证更新
SELECT
  data_freshness,
  COUNT(*) as count
FROM "Place"
GROUP BY data_freshness;
```

**预期结果**:
```
data_freshness | count
---------------|-------
STALE          | 100000
(1 row)
```

---

### Task 4: 配置生产环境 Cron Job (30 分钟)

**选项 1: NestJS @Cron 装饰器**

创建 `src/cron/sync-road-status.cron.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { syncRoadStatusDaily } from '../../scripts/cron/sync-road-status-daily';

@Injectable()
export class SyncRoadStatusCron {
  private readonly logger = new Logger('SyncRoadStatusCron');

  @Cron('0 6 * * *', { name: 'sync-road-status', timeZone: 'UTC' })
  async handleDailySync() {
    this.logger.log('[Cron] 开始每日 F-road 状态同步');
    try {
      await syncRoadStatusDaily();
      this.logger.log('[Cron] 同步成功');
    } catch (error) {
      this.logger.error('[Cron] 同步失败', error);
    }
  }
}
```

在 `app.module.ts` 中注册:
```typescript
import { ScheduleModule } from '@nestjs/schedule';
import { SyncRoadStatusCron } from './cron/sync-road-status.cron';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // ...
  ],
  providers: [
    SyncRoadStatusCron,
    // ...
  ],
})
```

**选项 2: 系统 Cron (Linux)**

```bash
# 编辑 crontab
crontab -e

# 添加每天 6:00 UTC 执行
0 6 * * * cd /path/to/tripnara && npx tsx scripts/cron/sync-road-status-daily.ts >> /var/log/road-status-sync.log 2>&1
```

**选项 3: GitHub Actions (如果使用)**

创建 `.github/workflows/sync-road-status.yml`:
```yaml
name: Sync Iceland Road Status

on:
  schedule:
    - cron: '0 6 * * *'  # 每天 6:00 UTC
  workflow_dispatch:      # 允许手动触发

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx tsx scripts/cron/sync-road-status-daily.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

**推荐**: 选项 1 (NestJS Cron),便于监控和日志管理

---

## 📊 验收标准

所有任务完成后,必须满足:

- ✅ RoadStatusRealtimeService 从数据库读取数据
- ✅ 15 分钟内重复查询无需调用 API
- ✅ Cron Job 成功写入数据库
- ✅ 数据库中存在 F-road 历史记录
- ✅ Place 表所有记录都有 lastVerifiedAt
- ✅ Cron Job 已配置并自动执行
- ✅ 所有测试通过
- ✅ 日志输出正常

---

## 🧪 测试计划

### 单元测试

```bash
# RoadStatusRealtimeService
npm test -- road-status-realtime.service.spec.ts

# FRoadCheckSkill
npm test -- f-road-check.skill.spec.ts
```

### 集成测试

```bash
# 1. 测试数据库读写
npx tsx scripts/test-phase3-migration.ts

# 2. 测试完整流程
npx tsx scripts/test-road-status-flow.ts
```

创建 `scripts/test-road-status-flow.ts`:
```typescript
/**
 * 完整流程测试:
 * 1. Cron Job 同步数据
 * 2. RoadStatusRealtimeService 查询缓存
 * 3. FRoadCheckSkill 执行检查
 * 4. GatekeeperAgent 返回结果
 */
```

### 性能测试

```bash
# 查询性能 (应 < 10ms)
npx tsx scripts/benchmark-road-status-query.ts
```

---

## 📝 变更记录

执行完成后,更新以下文档:

1. **Phase 3 完成报告** - 标记为 100% 完成
2. **服务文档** - 更新 RoadStatusRealtimeService 使用说明
3. **Cron Job 文档** - 添加监控和告警配置
4. **API 文档** - 更新缓存策略说明

---

## 🚨 注意事项

1. **数据库性能**
   - 定期检查索引使用情况
   - 监控查询慢日志
   - 90 天数据清理是否足够

2. **API 限流**
   - road.is API 是否有频率限制?
   - 是否需要 API Key?
   - 失败重试策略

3. **监控告警**
   - API 连续失败 > 3 次 → 发送告警
   - 数据库写入失败 → 记录日志
   - 数据新鲜度 > 24 小时 → 提醒

4. **备份恢复**
   - 定期备份 road_status_realtime 表
   - 测试数据恢复流程

---

**最后更新**: 2026-02-13
**责任人**: 后端团队
**预计完成时间**: 迁移后 1-2 天内

✅ **前置条件满足后,立即开始执行本清单任务！**
