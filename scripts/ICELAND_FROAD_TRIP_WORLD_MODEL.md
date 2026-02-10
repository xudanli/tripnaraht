# 冰岛 F 路行程世界模型展示指南

## 概述

本文档说明如何创建冰岛 F 路测试行程，并展示其世界模型（World Model）。

## 步骤 1: 创建行程

运行以下脚本创建冰岛 F 路测试行程：

```bash
npx tsx scripts/create-iceland-froad-trip-direct.ts
```

脚本会：
1. 创建 Trip 记录（8天行程）
2. 创建 8 个 TripDay 记录
3. 查找或创建 6 个关键 Place（Selfoss, Landmannalaugar, Askja 火山, Þingvellir, Vík, Akureyri）
4. 创建多个 ItineraryItem（行程项）

**输出示例**：
```
✅ Trip 创建成功: <trip-id>
  名称: 冰岛高地 F 路穿越
  目的地: IS
  开始日期: 2026-03-12
  结束日期: 2026-03-19
```

**保存 Trip ID**：脚本会输出 Trip ID，请保存用于后续步骤。

## 步骤 2: 展示世界模型

### 方法 A: 使用 API（推荐）

如果应用正在运行，可以通过 API 调用构建世界模型：

```bash
# 替换 <trip-id> 为实际的 Trip ID
curl -X POST http://localhost:3000/api/skills/world/buildContext \
  -H "Content-Type: application/json" \
  -d '{"tripId": "<trip-id>"}'
```

### 方法 B: 使用 NestJS 脚本（需要解决模块初始化问题）

```bash
# 替换 <trip-id> 为实际的 Trip ID
npx tsx scripts/show-world-model-for-trip.ts <trip-id>
```

**注意**：当前脚本可能遇到 `ReferenceError: Cannot access 'PlacesModule' before initialization` 错误。这是 NestJS 模块初始化顺序问题，需要修复模块依赖关系。

### 方法 C: 直接查询数据库

如果无法使用 API 或脚本，可以直接查询数据库查看行程信息：

```sql
-- 查询行程基本信息
SELECT 
  id,
  name,
  destination,
  "startDate",
  "endDate",
  "pacingConfig",
  metadata
FROM "Trip"
WHERE id = '<trip-id>';

-- 查询行程天数
SELECT 
  td.id,
  td.date,
  COUNT(ii.id) as items_count
FROM "TripDay" td
LEFT JOIN "ItineraryItem" ii ON ii."tripDayId" = td.id
WHERE td."tripId" = '<trip-id>'
GROUP BY td.id, td.date
ORDER BY td.date;

-- 查询行程项
SELECT 
  ii.id,
  ii.type,
  ii."startTime",
  ii."endTime",
  ii.note,
  p."nameCN",
  p."nameEN"
FROM "ItineraryItem" ii
LEFT JOIN "Place" p ON p.id = ii."placeId"
WHERE ii."tripDayId" IN (
  SELECT id FROM "TripDay" WHERE "tripId" = '<trip-id>'
)
ORDER BY ii."startTime";
```

## 世界模型组成部分

世界模型（World Model）由三个核心部分组成：

### 1. PhysicalRealityModel（物理现实模型）

包含：
- **DEM 证据**：地形高程数据，用于计算爬升、坡度、疲劳指数
- **道路状态**：F 路开放状态、季节性、4x4 要求
- **危险区域**：河流穿越、雪崩风险等
- **渡轮状态**：渡轮运营情况
- **气候季节性**：月份相关的可达性评分

**数据来源**：
- `data/physical-reality/road-status/iceland-road-status.json`
- `road.is` API（如果可用）
- PostGIS DEM 数据库

### 2. HumanCapabilityModel（人体能力模型）

包含：
- **单日最大爬升**：`maxDailyAscentM`（例如：1000m）
- **滚动爬升阈值**：`rollingAscent3DaysM`（例如：2500m）
- **最大坡度**：`maxSlopePct`（例如：15%）
- **节奏偏好**：`preferredPace`（'SLOW' | 'MEDIUM' | 'FAST'）
- **风险承受度**：`riskTolerance`（'low' | 'medium' | 'high'）
- **高海拔经验**：`highAltitudeExperience`（boolean）

**数据来源**：
- Trip 的 `pacingConfig` 字段
- 默认值（如果未指定）

### 3. RouteDirection（路线方向）

包含：
- **路线名称**：例如 "冰岛高地 F 路穿越"
- **标签**：例如 ['ADVENTURE', 'OFF_ROAD', 'NATURE']
- **季节性**：最佳月份、避免月份
- **路线哲学**：核心原则和灵活性

**数据来源**：
- `src/route-directions/fixtures/is_highlands_froad.fixture.ts`
- RouteDirection 数据库表

## 验证世界模型

世界模型构建后，会进行以下验证：

1. **PhysicalRealityModel 验证**：
   - 检查必需字段是否存在
   - 验证 DEM 证据数量是否匹配行程天数
   - 检查是否有 'HARD' 违规

2. **缺失数据检查**：
   - DEM 缺口
   - 人体能力模型不完整
   - 路线方向缺失
   - 物理现实模型不完整

## 示例输出

```
========================================
世界模型详情
========================================

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PhysicalRealityModel（物理现实模型）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
国家代码: IS
月份: 3 (可能关闭)
DEM 证据数量: 0
道路状态数量: 15
危险区域数量: 8
渡轮状态数量: 0

F 路状态 (15 条):
  [1] F208 - Landmannalaugar
      状态: seasonal
      季节性开放: 6-9月 ❌
      需要4x4: 是
      危险: river_crossing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HumanCapabilityModel（人体能力模型）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
用户画像 ID: iceland-froad-tester
单日最大爬升: 1000m
连续3天滚动爬升阈值: 2500m
最大可接受坡度: 15%
节奏偏好: MEDIUM
风险承受度: high
高海拔经验: true

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RouteDirection（路线方向）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
路线名称: 冰岛高地 F 路穿越
国家代码: IS
标签: ADVENTURE, OFF_ROAD, NATURE
最佳月份: 6, 7, 8
避免月份: 11, 12, 1, 2, 3, 4
路线哲学: 路线的核心是体验从文明世界进入高地荒原，再回到人间
```

## 下一步

1. **生成 DEM 证据**：
   ```bash
   POST /api/itinerary-items/trip/<trip-id>/days/<day-id>/calculate-travel
   ```

2. **查询行程详情**：
   ```bash
   GET /api/trips/<trip-id>
   ```

3. **查看行程项**：
   ```bash
   GET /api/itinerary-items?tripId=<trip-id>
   ```

## 故障排除

### 问题：模块初始化错误

**错误**：`ReferenceError: Cannot access 'PlacesModule' before initialization`

**解决方案**：
1. 使用 API 调用而不是 NestJS 脚本
2. 修复模块依赖关系（需要开发团队处理）
3. 使用直接数据库查询

### 问题：DEM 证据为空

**原因**：DEM 证据需要从路线段计算，不是自动生成的。

**解决方案**：
1. 调用 `calculate-travel` API 端点生成 DEM 证据
2. 或使用占位符数据（仅用于测试）

### 问题：RouteDirection 未找到

**原因**：Trip 没有关联的 RouteDirection。

**解决方案**：
1. 创建或关联 RouteDirection
2. 或使用默认的冰岛 F 路 RouteDirection

## 相关文件

- `scripts/create-iceland-froad-trip-direct.ts` - 创建行程脚本
- `scripts/show-world-model-for-trip.ts` - 展示世界模型脚本（需要修复）
- `src/skills/world/world-build-context.skill.ts` - 世界模型构建技能
- `src/trips/decision/models/physical-reality.model.ts` - 物理现实模型
- `data/physical-reality/road-status/iceland-road-status.json` - 冰岛道路状态数据
