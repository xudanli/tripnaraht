# lastVerifiedAt 时间戳 Schema 改造方案

> **更新时间**: 2026-02-13
> **优先级**: P0（数据新鲜度管理基础）
> **影响范围**: Place, 物理现实数据表, 世界模型表

---

## 🎯 目标

为所有外部数据添加 `lastVerifiedAt` 时间戳字段，用于：
1. **数据新鲜度管理** - 识别过期数据
2. **数据质量监控** - 追踪数据更新频率
3. **降级策略** - 过期数据降级或标记 UNVERIFIED
4. **用户透明** - 告知用户数据最后验证时间

---

## 📋 需要改造的表

### 1. Place 表（POI 数据）

**现有字段**:
```prisma
model Place {
  id                Int                       @id @default(autoincrement())
  nameEN            String?
  nameCN            String
  category          PlaceCategory
  location          Unsupported("geography")?
  metadata          Json?
  googlePlaceId     String?                   @unique
  rating            Float?                    @default(0)
  createdAt         DateTime                  @default(now())
  updatedAt         DateTime
  // ...
}
```

**改造方案**:
```prisma
model Place {
  // ... 现有字段

  // 新增字段
  lastVerifiedAt       DateTime?  @map("last_verified_at") // 最后验证时间
  dataSource           String?    @map("data_source")      // official/google/osm/manual
  sourceUrl            String?    @map("source_url")       // 来源 URL
  dataFreshness        String?    @map("data_freshness")   // FRESH/STALE/EXPIRED
  verificationMethod   String?    @map("verification_method") // api/manual/scraper

  @@index([lastVerifiedAt])
  @@index([dataSource])
  @@index([dataFreshness])
}
```

### 2. 物理现实数据表（新建）

**创建新表存储道路状态**:
```prisma
model RoadStatusRealtime {
  id                String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  roadId            String      @map("road_id")           // F208, F26, etc.
  currentStatus     String      @map("current_status")    // open/closed/limited
  statusMessage     String?     @map("status_message")
  lastVerifiedAt    DateTime    @map("last_verified_at")  @db.Timestamptz
  dataSource        String      @default("road.is")
  apiResponse       Json?       @map("api_response")      // 完整 API 响应
  hazards           Json?       @default("[]")            // 危险列表
  createdAt         DateTime    @default(now()) @db.Timestamptz
  updatedAt         DateTime    @updatedAt @db.Timestamptz

  @@unique([roadId, lastVerifiedAt])
  @@index([roadId])
  @@index([currentStatus])
  @@index([lastVerifiedAt])
}
```

**创建天气预报表**:
```prisma
model WeatherForecastRealtime {
  id                String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  stationId         String      @map("station_id")        // 5701 (Landmannalaugar)
  stationName       String?     @map("station_name")
  location          Unsupported("geography")?
  forecastTime      DateTime    @map("forecast_time") @db.Timestamptz
  temperature       Float?                                // °C
  windSpeed         Float?      @map("wind_speed")        // m/s
  windDirection     String?     @map("wind_direction")    // SW, NE, etc.
  visibility        Float?                                // meters
  precipitation     Float?                                // mm
  weatherCondition  String?     @map("weather_condition") // Snow, Rain, Clear
  alerts            Json?       @default("[]")            // 告警列表
  lastVerifiedAt    DateTime    @map("last_verified_at") @db.Timestamptz
  dataSource        String      @default("vedur.is")
  apiResponse       Json?       @map("api_response")
  createdAt         DateTime    @default(now()) @db.Timestamptz

  @@unique([stationId, forecastTime])
  @@index([stationId])
  @@index([forecastTime])
  @@index([lastVerifiedAt])
}
```

**创建雪崩风险表**:
```prisma
model AvalancheRiskForecast {
  id                String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  region            String                                // Austurland, Vestfirðir, etc.
  validFrom         DateTime    @map("valid_from") @db.Timestamptz
  validTo           DateTime    @map("valid_to") @db.Timestamptz
  dangerLevel       Int         @map("danger_level")      // 1-5
  dangerLevelName   String      @map("danger_level_name") // Low, Considerable, High
  description       String?
  lastVerifiedAt    DateTime    @map("last_verified_at") @db.Timestamptz
  dataSource        String      @default("avalanche.is")
  apiResponse       Json?       @map("api_response")
  createdAt         DateTime    @default(now()) @db.Timestamptz

  @@unique([region, validFrom])
  @@index([region])
  @@index([dangerLevel])
  @@index([validFrom, validTo])
  @@index([lastVerifiedAt])
}
```

### 3. 世界模型版本表（扩展）

**现有表**:
```prisma
model WorldModelVersion {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  versionId     String   @unique @map("version_id")
  worldModel    Json     @map("world_model")
  isActive      Boolean  @default(false) @map("is_active")
  metadata      Json?
  createdAt     DateTime @default(now()) @db.Timestamptz

  @@index([versionId])
  @@index([isActive])
}
```

**改造方案**:
```prisma
model WorldModelVersion {
  // ... 现有字段

  // 新增字段
  lastVerifiedAt    DateTime?   @map("last_verified_at") @db.Timestamptz
  dataFreshness     Json?       @map("data_freshness")   // 各组件新鲜度
  verificationLog   Json?       @map("verification_log") // 验证日志

  @@index([lastVerifiedAt])
}
```

---

## 🔧 迁移脚本

### Step 1: 创建 Prisma Migration

```bash
# 生成迁移文件
npx prisma migrate dev --name add_last_verified_at_timestamps
```

### Step 2: 迁移 SQL（自动生成）

```sql
-- 1. Place 表添加字段
ALTER TABLE "Place"
  ADD COLUMN "last_verified_at" TIMESTAMPTZ,
  ADD COLUMN "data_source" TEXT,
  ADD COLUMN "source_url" TEXT,
  ADD COLUMN "data_freshness" TEXT,
  ADD COLUMN "verification_method" TEXT;

-- 创建索引
CREATE INDEX "Place_last_verified_at_idx" ON "Place"("last_verified_at");
CREATE INDEX "Place_data_source_idx" ON "Place"("data_source");
CREATE INDEX "Place_data_freshness_idx" ON "Place"("data_freshness");

-- 2. 创建新表 RoadStatusRealtime
CREATE TABLE "RoadStatusRealtime" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "road_id" TEXT NOT NULL,
  "current_status" TEXT NOT NULL,
  "status_message" TEXT,
  "last_verified_at" TIMESTAMPTZ NOT NULL,
  "data_source" TEXT NOT NULL DEFAULT 'road.is',
  "api_response" JSONB,
  "hazards" JSONB DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "RoadStatusRealtime_roadId_lastVerifiedAt_key"
  ON "RoadStatusRealtime"("road_id", "last_verified_at");
CREATE INDEX "RoadStatusRealtime_road_id_idx" ON "RoadStatusRealtime"("road_id");
CREATE INDEX "RoadStatusRealtime_current_status_idx" ON "RoadStatusRealtime"("current_status");
CREATE INDEX "RoadStatusRealtime_last_verified_at_idx" ON "RoadStatusRealtime"("last_verified_at");

-- 3. 创建 WeatherForecastRealtime 表
CREATE TABLE "WeatherForecastRealtime" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "station_id" TEXT NOT NULL,
  "station_name" TEXT,
  "location" GEOGRAPHY(Point, 4326),
  "forecast_time" TIMESTAMPTZ NOT NULL,
  "temperature" DOUBLE PRECISION,
  "wind_speed" DOUBLE PRECISION,
  "wind_direction" TEXT,
  "visibility" DOUBLE PRECISION,
  "precipitation" DOUBLE PRECISION,
  "weather_condition" TEXT,
  "alerts" JSONB DEFAULT '[]',
  "last_verified_at" TIMESTAMPTZ NOT NULL,
  "data_source" TEXT NOT NULL DEFAULT 'vedur.is',
  "api_response" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "WeatherForecastRealtime_stationId_forecastTime_key"
  ON "WeatherForecastRealtime"("station_id", "forecast_time");
CREATE INDEX "WeatherForecastRealtime_station_id_idx" ON "WeatherForecastRealtime"("station_id");
CREATE INDEX "WeatherForecastRealtime_forecast_time_idx" ON "WeatherForecastRealtime"("forecast_time");
CREATE INDEX "WeatherForecastRealtime_last_verified_at_idx" ON "WeatherForecastRealtime"("last_verified_at");

-- 4. 创建 AvalancheRiskForecast 表
CREATE TABLE "AvalancheRiskForecast" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "region" TEXT NOT NULL,
  "valid_from" TIMESTAMPTZ NOT NULL,
  "valid_to" TIMESTAMPTZ NOT NULL,
  "danger_level" INTEGER NOT NULL,
  "danger_level_name" TEXT NOT NULL,
  "description" TEXT,
  "last_verified_at" TIMESTAMPTZ NOT NULL,
  "data_source" TEXT NOT NULL DEFAULT 'avalanche.is',
  "api_response" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "AvalancheRiskForecast_region_validFrom_key"
  ON "AvalancheRiskForecast"("region", "valid_from");
CREATE INDEX "AvalancheRiskForecast_region_idx" ON "AvalancheRiskForecast"("region");
CREATE INDEX "AvalancheRiskForecast_danger_level_idx" ON "AvalancheRiskForecast"("danger_level");
CREATE INDEX "AvalancheRiskForecast_validFrom_validTo_idx"
  ON "AvalancheRiskForecast"("valid_from", "valid_to");
CREATE INDEX "AvalancheRiskForecast_last_verified_at_idx" ON "AvalancheRiskForecast"("last_verified_at");

-- 5. WorldModelVersion 表添加字段
ALTER TABLE "WorldModelVersion"
  ADD COLUMN "last_verified_at" TIMESTAMPTZ,
  ADD COLUMN "data_freshness" JSONB,
  ADD COLUMN "verification_log" JSONB;

CREATE INDEX "WorldModelVersion_last_verified_at_idx" ON "WorldModelVersion"("last_verified_at");
```

### Step 3: 数据回填脚本

```typescript
// scripts/backfill-last-verified-at.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillLastVerifiedAt() {
  console.log('开始回填 lastVerifiedAt 字段...\n');

  // 1. 回填 Place 表
  console.log('1️⃣ 回填 Place 表...');

  // 对于有 googlePlaceId 的 POI，标记为来自 Google
  const googlePlaces = await prisma.place.updateMany({
    where: {
      googlePlaceId: { not: null },
      lastVerifiedAt: null,
    },
    data: {
      lastVerifiedAt: new Date(), // 或使用 createdAt
      dataSource: 'google',
      dataFreshness: 'STALE', // 默认标记为过期，需重新验证
      verificationMethod: 'api',
    },
  });
  console.log(`   - 更新 ${googlePlaces.count} 个 Google Places`);

  // 对于其他 POI，标记为手动录入
  const manualPlaces = await prisma.place.updateMany({
    where: {
      googlePlaceId: null,
      lastVerifiedAt: null,
    },
    data: {
      lastVerifiedAt: new Date(),
      dataSource: 'manual',
      dataFreshness: 'STALE',
      verificationMethod: 'manual',
    },
  });
  console.log(`   - 更新 ${manualPlaces.count} 个手动录入 POI\n`);

  // 2. 回填冰岛道路状态（从静态文件）
  console.log('2️⃣ 回填冰岛道路状态...');

  const roadStatusData = await import('../data/physical-reality/road-status/iceland-road-status.json');
  const roads = roadStatusData.roads || [];

  for (const road of roads) {
    await prisma.roadStatusRealtime.create({
      data: {
        roadId: road.roadId,
        currentStatus: road.status,
        statusMessage: `${road.roadNameEN} - ${road.season.openPeriod}`,
        lastVerifiedAt: new Date('2026-01-28'), // 从 JSON metadata
        dataSource: 'manual',
        apiResponse: road,
        hazards: road.hazards || [],
      },
    });
  }
  console.log(`   - 导入 ${roads.length} 条道路状态\n`);

  console.log('✅ 数据回填完成！');
}

async function main() {
  try {
    await backfillLastVerifiedAt();
  } catch (error) {
    console.error('❌ 回填失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
```

运行回填脚本：
```bash
npx tsx scripts/backfill-last-verified-at.ts
```

---

## 📏 数据新鲜度规则

### 数据新鲜度分类

| 状态 | 定义 | 阈值 | 处理方式 |
|------|------|------|---------|
| **FRESH** | 数据新鲜 | < 24 小时 | 正常使用 |
| **STALE** | 数据过期 | 24 小时 - 7 天 | 标记 UNVERIFIED |
| **EXPIRED** | 数据失效 | > 7 天 | 不使用，触发更新 |

### 不同数据类型的新鲜度要求

| 数据类型 | FRESH 阈值 | STALE 阈值 | EXPIRED 阈值 |
|---------|-----------|-----------|-------------|
| F-road 状态 | < 6 小时 | 6 小时 - 1 天 | > 1 天 |
| 天气预报 | < 3 小时 | 3 小时 - 12 小时 | > 12 小时 |
| 雪崩风险 | < 6 小时 | 6 小时 - 1 天 | > 1 天 |
| POI 开放时间 | < 7 天 | 7 天 - 30 天 | > 30 天 |
| POI 基本信息 | < 30 天 | 30 天 - 90 天 | > 90 天 |
| DEM 数据 | < 1 年 | 1 年 - 5 年 | > 5 年 |

### 自动计算新鲜度

```typescript
// src/shared/utils/data-freshness.util.ts

export enum DataFreshness {
  FRESH = 'FRESH',
  STALE = 'STALE',
  EXPIRED = 'EXPIRED',
}

export interface FreshnessRule {
  freshThresholdMs: number;
  staleThresholdMs: number;
}

export const FRESHNESS_RULES: Record<string, FreshnessRule> = {
  road_status: {
    freshThresholdMs: 6 * 60 * 60 * 1000,    // 6 小时
    staleThresholdMs: 24 * 60 * 60 * 1000,   // 1 天
  },
  weather_forecast: {
    freshThresholdMs: 3 * 60 * 60 * 1000,    // 3 小时
    staleThresholdMs: 12 * 60 * 60 * 1000,   // 12 小时
  },
  poi_opening_hours: {
    freshThresholdMs: 7 * 24 * 60 * 60 * 1000,   // 7 天
    staleThresholdMs: 30 * 24 * 60 * 60 * 1000,  // 30 天
  },
  poi_basic_info: {
    freshThresholdMs: 30 * 24 * 60 * 60 * 1000,  // 30 天
    staleThresholdMs: 90 * 24 * 60 * 60 * 1000,  // 90 天
  },
};

export function calculateDataFreshness(
  lastVerifiedAt: Date | null,
  dataType: string
): DataFreshness {
  if (!lastVerifiedAt) {
    return DataFreshness.EXPIRED;
  }

  const rule = FRESHNESS_RULES[dataType];
  if (!rule) {
    // 默认规则
    const ageMs = Date.now() - lastVerifiedAt.getTime();
    if (ageMs < 24 * 60 * 60 * 1000) return DataFreshness.FRESH;
    if (ageMs < 7 * 24 * 60 * 60 * 1000) return DataFreshness.STALE;
    return DataFreshness.EXPIRED;
  }

  const ageMs = Date.now() - lastVerifiedAt.getTime();

  if (ageMs < rule.freshThresholdMs) {
    return DataFreshness.FRESH;
  } else if (ageMs < rule.staleThresholdMs) {
    return DataFreshness.STALE;
  } else {
    return DataFreshness.EXPIRED;
  }
}
```

---

## 🔄 自动更新机制

### Cron Jobs 设置

```typescript
// src/cron/data-freshness-monitor.cron.ts

import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class DataFreshnessMonitorCron {
  // 每小时检查一次数据新鲜度
  @Cron(CronExpression.EVERY_HOUR)
  async checkDataFreshness() {
    console.log('🔍 检查数据新鲜度...');

    // 1. 检查道路状态
    await this.updateStaleRoadStatus();

    // 2. 检查天气预报
    await this.updateStaleWeatherForecasts();

    // 3. 检查 POI 数据
    await this.updateStalePOIs();
  }

  // 每天早上 6:00 UTC 批量更新
  @Cron('0 6 * * *')
  async dailyBatchUpdate() {
    console.log('📦 每日批量更新...');

    // 批量更新所有 F-road 状态
    await this.batchUpdateRoadStatus();

    // 批量更新天气预报
    await this.batchUpdateWeatherForecasts();
  }

  private async updateStaleRoadStatus() {
    const staleThreshold = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 小时前

    const staleRoads = await prisma.roadStatusRealtime.findMany({
      where: {
        lastVerifiedAt: { lt: staleThreshold },
      },
      distinct: ['roadId'],
    });

    for (const road of staleRoads) {
      // 调用 road.is API 更新
      await this.roadStatusService.refreshRoadStatus(road.roadId);
    }

    console.log(`   - 更新 ${staleRoads.length} 条道路状态`);
  }

  // ... 其他更新方法
}
```

---

## 📊 监控 Dashboard

### 需要监控的指标

```typescript
// src/monitoring/data-freshness-metrics.service.ts

@Injectable()
export class DataFreshnessMetricsService {
  async getMetrics() {
    // 1. 总体新鲜度分布
    const freshness = await this.getFreshnessDistribution();

    // 2. 各类型数据新鲜度
    const byType = await this.getFreshnessByType();

    // 3. 过期数据清单
    const expired = await this.getExpiredData();

    return {
      overview: {
        total: freshness.total,
        fresh: freshness.fresh,
        stale: freshness.stale,
        expired: freshness.expired,
        freshnessRate: (freshness.fresh / freshness.total) * 100,
      },
      byType,
      expired,
      lastUpdated: new Date(),
    };
  }

  private async getFreshnessDistribution() {
    const places = await prisma.place.findMany({
      select: { lastVerifiedAt: true },
    });

    const distribution = {
      total: places.length,
      fresh: 0,
      stale: 0,
      expired: 0,
    };

    places.forEach(p => {
      const freshness = calculateDataFreshness(p.lastVerifiedAt, 'poi_basic_info');
      if (freshness === DataFreshness.FRESH) distribution.fresh++;
      else if (freshness === DataFreshness.STALE) distribution.stale++;
      else distribution.expired++;
    });

    return distribution;
  }
}
```

---

## ✅ 完成标准

改造完成后，需满足：

- ✅ Place 表所有记录有 `lastVerifiedAt`
- ✅ RoadStatusRealtime 表创建完成
- ✅ WeatherForecastRealtime 表创建完成
- ✅ AvalancheRiskForecast 表创建完成
- ✅ Cron jobs 正常运行
- ✅ 数据新鲜度监控 dashboard 可访问
- ✅ 所有测试通过

---

## 🎯 实施计划

| 任务 | 负责人 | 时间 | 状态 |
|------|--------|------|------|
| 1. Prisma Schema 改造 | 后端工程师 | Day 1 | ⏳ 待开始 |
| 2. 生成并运行迁移 | 后端工程师 | Day 1 | ⏳ 待开始 |
| 3. 数据回填脚本 | 后端工程师 | Day 2 | ⏳ 待开始 |
| 4. 新鲜度计算工具 | 后端工程师 | Day 2 | ⏳ 待开始 |
| 5. Cron jobs 实现 | 后端工程师 | Day 3 | ⏳ 待开始 |
| 6. 监控 dashboard | 后端工程师 | Day 4 | ⏳ 待开始 |
| 7. 测试和验证 | QA 工程师 | Day 5 | ⏳ 待开始 |

---

**生成时间**: 2026-02-13
**预计完成时间**: 1 周
**负责人**: TripNARA 后端团队
