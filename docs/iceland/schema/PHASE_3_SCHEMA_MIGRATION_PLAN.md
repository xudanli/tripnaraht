# Phase 3: Prisma Schema 迁移方案

> **目标**: 为冰岛世界模型添加实时数据存储表
> **时间**: Week 3 (2026-02-13 - 2026-02-20)
> **预计工期**: 3-4 天

---

## 📋 迁移概览

### 新增表

1. **RoadStatusRealtime** - F-road 实时状态存储
2. **WeatherForecastRealtime** - 冰岛天气预报
3. **AvalancheRiskForecast** - 雪崩风险预警 (Phase 4)

### 修改表

1. **Place** - 添加 lastVerifiedAt, dataSource, dataFreshness

---

## 🗂️ 表结构设计

### 1. RoadStatusRealtime

存储 F-road 的实时状态，支持历史查询和趋势分析。

```prisma
model RoadStatusRealtime {
  id                String    @id @default(uuid()) @db.Uuid
  roadId            String    @map("road_id") @db.VarChar(10)
  roadName          String?   @map("road_name") @db.VarChar(255)
  currentStatus     String    @map("current_status") @db.VarChar(20)
  statusMessage     String?   @map("status_message")
  lastVerifiedAt    DateTime  @map("last_verified_at") @db.Timestamptz(6)
  dataSource        String    @map("data_source") @db.VarChar(50)
  apiResponse       Json?     @map("api_response")
  hazards           Json      @default("[]")
  confidence        Float     @default(0.9)
  seasonalFallback  Boolean   @default(false) @map("seasonal_fallback")
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([roadId])
  @@index([currentStatus])
  @@index([lastVerifiedAt(sort: Desc)])
  @@index([roadId, lastVerifiedAt(sort: Desc)])
  @@index([dataSource])
  @@map("road_status_realtime")
}
```

**字段说明**:
- `roadId`: F-road 编号 (例如 "F208", "F26")
- `currentStatus`: 当前状态 ("open" | "closed" | "limited" | "unknown")
- `statusMessage`: 状态描述 (冰岛语 + 英语)
- `lastVerifiedAt`: 最后验证时间 (API 返回或降级方案生成时间)
- `dataSource`: 数据来源 ("road.is_api" | "static_seasonal_data")
- `apiResponse`: 原始 API 响应 (用于调试)
- `hazards`: 告警列表 (例如 UNVERIFIED_STATUS, MANUAL_VERIFICATION_REQUIRED)
- `confidence`: 置信度 (0.9 = 实时API, 0.6 = 静态数据)
- `seasonalFallback`: 是否使用降级方案

---

### 2. WeatherForecastRealtime

存储冰岛天气预报，支持区域查询和时间范围查询。

```prisma
model WeatherForecastRealtime {
  id                String                    @id @default(uuid()) @db.Uuid
  regionKey         String                    @map("region_key") @db.VarChar(50)
  regionName        String                    @map("region_name") @db.VarChar(255)
  location          Unsupported("geography")?
  forecastTime      DateTime                  @map("forecast_time") @db.Timestamptz(6)
  validFrom         DateTime                  @map("valid_from") @db.Timestamptz(6)
  validUntil        DateTime                  @map("valid_until") @db.Timestamptz(6)
  temperature       Float?
  windSpeed         Float?                    @map("wind_speed")
  windDirection     Int?                      @map("wind_direction")
  precipitation     Float?
  visibility        Float?
  conditions        String?                   @db.VarChar(100)
  weatherCode       String?                   @map("weather_code") @db.VarChar(20)
  warnings          Json                      @default("[]")
  hazards           Json                      @default("[]")
  dataSource        String                    @map("data_source") @db.VarChar(50)
  apiResponse       Json?                     @map("api_response")
  confidence        Float                     @default(0.9)
  createdAt         DateTime                  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime                  @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([regionKey])
  @@index([forecastTime])
  @@index([validFrom, validUntil])
  @@index([regionKey, forecastTime])
  @@index([location], type: Gist)
  @@map("weather_forecast_realtime")
}
```

**字段说明**:
- `regionKey`: 区域标识 (例如 "highlands", "reykjavik", "akureyri")
- `location`: 地理位置 (PostGIS geography)
- `forecastTime`: 预报发布时间
- `validFrom` / `validUntil`: 预报有效时间范围
- `temperature`: 温度 (摄氏度)
- `windSpeed`: 风速 (m/s)
- `precipitation`: 降水量 (mm)
- `visibility`: 能见度 (m)
- `weatherCode`: 天气代码 (Veðurstofa Íslands 标准)
- `warnings`: 天气告警列表
- `hazards`: 风险列表 (例如 HIGH_WIND, SNOW, FOG)

---

### 3. Place 表修改

为 Place 表添加数据新鲜度跟踪字段。

```prisma
model Place {
  id                              Int                       @id @default(autoincrement())
  uuid                            String                    @unique
  nameEN                          String?
  category                        PlaceCategory
  location                        Unsupported("geography")?
  address                         String?
  cityId                          Int?
  metadata                        Json?
  physicalMetadata                Json?
  googlePlaceId                   String?                   @unique
  rating                          Float?                    @default(0)
  createdAt                       DateTime                  @default(now())
  updatedAt                       DateTime
  nameCN                          String
  description                     String?
  embedding                       Unsupported("vector")?

  // 新增字段
  lastVerifiedAt                  DateTime?                 @map("last_verified_at") @db.Timestamptz(6)
  dataSource                      String?                   @map("data_source") @db.VarChar(50)
  dataFreshness                   String?                   @map("data_freshness") @db.VarChar(20)

  ItineraryItem                   ItineraryItem[]
  City                            City?                     @relation(fields: [cityId], references: [id])
  Trail_Trail_endPlaceIdToPlace   Trail[]                   @relation("Trail_endPlaceIdToPlace")
  Trail_Trail_startPlaceIdToPlace Trail[]                   @relation("Trail_startPlaceIdToPlace")
  TrailWaypoint                   TrailWaypoint[]

  @@index([metadata(ops: JsonbPathOps)], type: Gin)
  @@index([lastVerifiedAt])
  @@index([dataFreshness])
}
```

**新字段说明**:
- `lastVerifiedAt`: 数据最后验证时间 (例如开放时间、票价等)
- `dataSource`: 数据来源 ("google_places" | "osm" | "manual" | "user_contribution")
- `dataFreshness`: 数据新鲜度 ("FRESH" | "STALE" | "EXPIRED" | "UNVERIFIED")

**数据新鲜度规则**:
- `FRESH`: lastVerifiedAt < 30 天
- `STALE`: 30 天 <= lastVerifiedAt < 90 天
- `EXPIRED`: lastVerifiedAt >= 90 天
- `UNVERIFIED`: lastVerifiedAt = NULL

---

## 🔧 迁移步骤

### Step 1: 备份数据库

```bash
pg_dump -h localhost -U tripnara -d tripnara_dev > backup_before_phase3_$(date +%Y%m%d).sql
```

### Step 2: 更新 Prisma Schema

修改 `prisma/schema.prisma`:

1. 在文件末尾添加 `RoadStatusRealtime` 模型
2. 在文件末尾添加 `WeatherForecastRealtime` 模型
3. 修改 `Place` 模型,添加 3 个新字段

### Step 3: 创建迁移文件

```bash
npx prisma migrate dev --name add_iceland_realtime_tables
```

这将生成迁移 SQL 文件到 `prisma/migrations/` 目录。

### Step 4: 检查迁移 SQL

确保生成的 SQL 包含:
- `CREATE TABLE road_status_realtime`
- `CREATE TABLE weather_forecast_realtime`
- `ALTER TABLE "Place" ADD COLUMN "last_verified_at"`
- 所有索引创建语句

### Step 5: 执行迁移

```bash
npx prisma migrate deploy
```

### Step 6: 生成 Prisma Client

```bash
npx prisma generate
```

### Step 7: 验证迁移成功

```typescript
// test-migration.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testMigration() {
  // 测试 RoadStatusRealtime
  const roadStatus = await prisma.roadStatusRealtime.create({
    data: {
      roadId: 'F208',
      roadName: 'Fjallabaksleið nyrðri',
      currentStatus: 'closed',
      statusMessage: 'Typically closed in winter (UNVERIFIED)',
      lastVerifiedAt: new Date(),
      dataSource: 'static_seasonal_data',
      hazards: [
        { type: 'UNVERIFIED_STATUS', severity: 'high' },
        { type: 'MANUAL_VERIFICATION_REQUIRED', severity: 'high' }
      ],
      confidence: 0.6,
      seasonalFallback: true,
    },
  });

  console.log('✅ RoadStatusRealtime table created:', roadStatus.id);

  // 测试 Place 新字段
  const place = await prisma.place.findFirst();
  if (place) {
    const updated = await prisma.place.update({
      where: { id: place.id },
      data: {
        lastVerifiedAt: new Date(),
        dataSource: 'google_places',
        dataFreshness: 'FRESH',
      },
    });
    console.log('✅ Place lastVerifiedAt added:', updated.lastVerifiedAt);
  }

  await prisma.$disconnect();
}

testMigration().catch(console.error);
```

运行:
```bash
npx tsx test-migration.ts
```

---

## 🔄 数据迁移 (Backfill)

### Backfill Place.lastVerifiedAt

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
```

### 初始化 RoadStatusRealtime

使用 Phase 2 创建的 Cron Job 脚本:

```bash
npx tsx scripts/cron/sync-road-status-daily.ts
```

这将:
1. 尝试从 road.is API 同步所有 22 条 F-road
2. 如果 API 不可用,使用季节性降级方案
3. 存储到 `road_status_realtime` 表

---

## 📊 性能优化

### 索引策略

```sql
-- RoadStatusRealtime 索引 (已在 schema 中定义)
CREATE INDEX idx_road_status_road_id ON road_status_realtime(road_id);
CREATE INDEX idx_road_status_last_verified ON road_status_realtime(last_verified_at DESC);
CREATE INDEX idx_road_status_road_verified ON road_status_realtime(road_id, last_verified_at DESC);

-- WeatherForecastRealtime 索引
CREATE INDEX idx_weather_region_key ON weather_forecast_realtime(region_key);
CREATE INDEX idx_weather_forecast_time ON weather_forecast_realtime(forecast_time);
CREATE INDEX idx_weather_valid_range ON weather_forecast_realtime(valid_from, valid_until);
CREATE INDEX idx_weather_location ON weather_forecast_realtime USING GIST(location);

-- Place 新字段索引
CREATE INDEX idx_place_last_verified ON "Place"(last_verified_at);
CREATE INDEX idx_place_freshness ON "Place"(data_freshness);
```

### 查询优化示例

```typescript
// 查询最新的 F-road 状态 (使用索引)
const latestStatus = await prisma.roadStatusRealtime.findFirst({
  where: { roadId: 'F208' },
  orderBy: { lastVerifiedAt: 'desc' },
});

// 查询特定区域的天气预报 (使用索引)
const weatherForecast = await prisma.weatherForecastRealtime.findMany({
  where: {
    regionKey: 'highlands',
    validFrom: { lte: new Date() },
    validUntil: { gte: new Date() },
  },
  orderBy: { forecastTime: 'desc' },
  take: 1,
});

// 查询数据新鲜度为 EXPIRED 的 Place (使用索引)
const expiredPlaces = await prisma.place.findMany({
  where: { dataFreshness: 'EXPIRED' },
  select: { id: true, nameEN: true, lastVerifiedAt: true },
});
```

---

## 🚨 回滚方案

如果迁移失败,执行回滚:

### 方案 1: Prisma Migrate Reset (开发环境)

```bash
npx prisma migrate reset
```

**警告**: 这会删除所有数据！仅用于开发环境。

### 方案 2: 手动回滚 (生产环境)

```sql
-- 删除新表
DROP TABLE IF EXISTS weather_forecast_realtime;
DROP TABLE IF EXISTS road_status_realtime;

-- 删除 Place 新字段
ALTER TABLE "Place" DROP COLUMN IF EXISTS last_verified_at;
ALTER TABLE "Place" DROP COLUMN IF EXISTS data_source;
ALTER TABLE "Place" DROP COLUMN IF EXISTS data_freshness;
```

然后恢复备份:

```bash
psql -h localhost -U tripnara -d tripnara_dev < backup_before_phase3_20260213.sql
```

---

## ✅ 验收标准

迁移成功后,必须满足:

- ✅ `RoadStatusRealtime` 表已创建,包含所有字段和索引
- ✅ `WeatherForecastRealtime` 表已创建,包含所有字段和索引
- ✅ `Place` 表添加 3 个新字段,包含索引
- ✅ 现有 POI 数据完整 (行数不变)
- ✅ Prisma Client 重新生成成功
- ✅ 测试脚本执行成功
- ✅ Cron Job 可以向 `RoadStatusRealtime` 插入数据
- ✅ 所有索引已创建
- ✅ 查询性能符合预期 (< 100ms)

---

## 📝 相关文件

迁移后需要更新的文件:

1. **RoadStatusRealtimeService** (`src/skills/world/services/road-status-realtime.service.ts`)
   - 从内存缓存改为查询数据库
   - 保留 15 分钟缓存,避免频繁查询

2. **Cron Job** (`scripts/cron/sync-road-status-daily.ts`)
   - 修改为实际写入数据库 (移除 TODO 注释)
   - 添加错误处理和重试逻辑

3. **FRoadCheckSkill** (`src/skills/world/f-road-check.skill.ts`)
   - 无需修改 (已通过 RoadStatusRealtimeService 间接使用数据库)

---

## 🎯 下一步 (Phase 4)

Schema 迁移完成后:

1. **天气 API 集成** (Week 3)
   - 实现 `IcelandWeatherRealtimeService`
   - 集成 Veðurstofa Íslands API
   - 写入 `WeatherForecastRealtime` 表

2. **雪崩风险 API** (Week 4)
   - 添加 `AvalancheRiskForecast` 表
   - 集成 Avalanche.is API

3. **监控 Dashboard** (Week 4-5)
   - 数据新鲜度监控
   - API 健康检查
   - 告警机制

---

**最后更新**: 2026-02-13
**状态**: ✅ 设计完成，待执行
**预计完成时间**: 2026-02-16

🎉 **Phase 3 Schema 迁移方案已完成！** 准备执行迁移。
