# 行程指标数据为空问题分析

## 问题描述

行程 `9a4dbd2e-e76a-4fd3-bab0-09332fb2581b` 的指标数据都是空的：
- `totalFatigue: 0`
- `totalWalk: 0`
- `totalDrive: 0`
- `maxDailyFatigue: 0`
- `avgBuffer: 78` (这个有值，因为是从时间差计算的)

## 根本原因

### 1. 交通信息字段缺失

**问题**: 所有 `ItineraryItem` 的交通信息字段都是 `null`：
- `travelFromPreviousDistance: null`
- `travelFromPreviousDuration: null`
- `travelMode: null`

**影响**: 
- `totalWalk` 和 `totalDrive` 为 0，因为计算逻辑依赖这些字段
- 代码位置: `src/trips/services/trip-metrics.service.ts:150-152`

```typescript
const distance = current.travelFromPreviousDistance || 0; // 米
const duration = current.travelFromPreviousDuration || 0; // 分钟
const travelMode = (current.travelMode || 'DRIVING').toUpperCase();
```

### 2. Place physicalMetadata 缺失

**问题**: 所有 `Place` 都没有 `physicalMetadata` 字段

**影响**:
- `totalFatigue` 为 0，因为计算逻辑依赖 `Place.physicalMetadata.fatigueScore`
- 代码位置: `src/trips/services/trip-metrics.service.ts:217-222`

```typescript
if (item.Place?.physicalMetadata) {
  const physical = item.Place.physicalMetadata as any;
  totalFatigue += physical.fatigueScore || 0;
  totalAscent += physical.elevationGain || physical.elevation || 0;
}
```

### 3. 为什么 avgBuffer 有值？

`avgBuffer` 有值（78分钟）是因为缓冲时间的计算不依赖交通信息字段，而是直接从时间差计算：

```typescript
// 代码位置: src/trips/services/trip-metrics.service.ts:203-213
if (prev.endTime && current.startTime) {
  const prevEnd = DateTime.fromJSDate(prev.endTime);
  const currentStart = DateTime.fromJSDate(current.startTime);
  const bufferMinutes = currentStart.diff(prevEnd, 'minutes').minutes;
  
  // 减去交通时间，得到实际缓冲时间
  const actualBuffer = bufferMinutes - duration;
  if (actualBuffer > 0) {
    totalBuffer += actualBuffer;
  }
}
```

由于 `duration` 是 0（因为 `travelFromPreviousDuration` 是 null），所以 `actualBuffer` 就等于 `bufferMinutes`。

## 解决方案

### 方案1: 计算并保存交通信息（推荐）

使用现有的接口计算交通信息：

```bash
# 为每个日期计算交通信息
POST /api/itinerary-items/trip/:tripId/days/:dayId/calculate-travel
```

**请求体**:
```json
{
  "defaultTravelMode": "DRIVING"
}
```

**说明**:
- 这个接口会自动计算相邻行程项之间的交通时间和距离
- 会根据距离自动选择交通方式（<1km步行，1-50km驾车，>50km需手动指定）
- 计算结果会保存到数据库的 `travelFromPreviousDistance`、`travelFromPreviousDuration`、`travelMode` 字段

**使用脚本**:
```bash
./scripts/fix-trip-metrics.sh 9a4dbd2e-e76a-4fd3-bab0-09332fb2581b
```

### 方案2: 修复计算逻辑（长期方案）

可以考虑在计算指标时，如果交通信息字段缺失，自动计算：

```typescript
// 在 calculateDayMetrics 中
if (!current.travelFromPreviousDistance || !current.travelFromPreviousDuration) {
  // 自动计算交通信息
  const travelInfo = await this.calculateTravelInfo(prev, current);
  distance = travelInfo.distance;
  duration = travelInfo.duration;
  travelMode = travelInfo.mode;
}
```

但这会增加接口响应时间，不推荐在生产环境使用。

### 方案3: 确保创建行程时自动计算交通信息

在创建行程或添加行程项时，自动计算交通信息。这需要修改：
- `src/route-directions/route-directions.service.ts` - 创建行程时
- `src/itinerary-items/itinerary-items.service.ts` - 添加行程项时

## 验证修复

修复后，重新获取指标数据：

```bash
curl "http://localhost:3000/api/trips/9a4dbd2e-e76a-4fd3-bab0-09332fb2581b/metrics"
```

应该能看到：
- `totalWalk > 0` (如果有步行)
- `totalDrive > 0` (如果有车程)
- `totalFatigue` 可能还是 0（需要 Place 有 physicalMetadata）

## 关于 fatigueScore

`fatigueScore` 需要从 Place 的 `physicalMetadata` 获取。如果 Place 没有这个数据，需要：

1. 检查 Place 数据是否完整
2. 可能需要从外部数据源补充 physicalMetadata
3. 或者使用默认值/估算值

## 相关文件

- `src/trips/services/trip-metrics.service.ts` - 指标计算逻辑
- `src/itinerary-items/itinerary-items.service.ts` - 交通信息计算逻辑
- `src/itinerary-items/itinerary-items.controller.ts` - 计算交通信息接口
- `prisma/schema.prisma` - 数据模型定义
