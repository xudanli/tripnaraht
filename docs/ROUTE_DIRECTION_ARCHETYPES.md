# 路线方向分类母版（6大母型）

## 概述

P1.3: 国家路线方向分类母版

为了简化新国家的集成，我们定义了 6 大母型（Archetype），每个母型包含：
- 默认标签
- 典型约束
- 风险画像
- 典型节奏
- 季节性特征
- 签名POI类型
- 典型行程骨架

## 6大母型

### 1. 高海拔文化徒步（HIGH_ALTITUDE_CULTURAL_TREKKING）

**典型例子**：西藏、尼泊尔、秘鲁

**特征**：
- 海拔范围：3000-6000米
- 地形类型：山地、高原、高地
- 气候带：高山、亚高山

**默认标签**：`['徒步', '文化', '高海拔', '挑战', '自然']`

**典型约束**：
- 硬约束：
  - `rapidAscentForbidden: true` - 禁止快速上升
- 软约束：
  - `maxDailyAscentM: 800` - 每日最大爬升800米（高海拔地区更保守）
  - `maxElevationM: 5500` - 最大海拔5500米（根据具体地区调整）
  - `maxSlopePct: 25` - 最大坡度25%
  - `bufferTimeMin: 20` - 缓冲时间20分钟

**风险画像**：
- `altitudeSickness: true` - 有高反风险
- `roadClosure: true` - 可能因天气封路
- `weatherWindow: true` - 有天气窗口
- `weatherWindowMonths: [5, 6, 7, 8, 9, 10]` - 夏季窗口

**典型节奏**：`moderate`

**季节性**：
- 最佳月份：5-10月（夏季）
- 避免月份：11-3月（冬季）

**签名POI类型**：
- `MOUNTAIN_PASS` - 山口
- `MONASTERY` - 寺庙
- `VIEWPOINT` - 观景点
- `TRAILHEAD` - 徒步起点
- `CULTURAL_SITE` - 文化遗址
- `ACCLIMATIZATION_POINT` - 适应点

**典型行程骨架**：
- 每日主题：`['适应', '探索', '挑战', '文化', '休息', '登高', '返程']`
- 建议休息日：第2、4、6天

---

### 2. 峡湾/海岸线自驾（FJORD_COASTLINE_DRIVING）

**典型例子**：冰岛、挪威、新西兰南岛

**特征**：
- 海拔范围：0-1500米
- 地形类型：海岸线、峡湾、岛屿
- 气候带：温带、亚寒带

**默认标签**：`['自驾', '海岸', '峡湾', '自然', '摄影', '轻松']`

**典型约束**：
- 软约束：
  - `maxDailyAscentM: 500` - 海岸线通常较平缓
  - `maxElevationM: 2000` - 最大海拔2000米
  - `maxSlopePct: 15` - 最大坡度15%
  - `bufferTimeMin: 15` - 缓冲时间15分钟

**风险画像**：
- `roadClosure: true` - 可能因天气封路
- `ferryDependent: true` - 可能依赖渡轮
- `weatherWindow: true` - 有天气窗口
- `weatherWindowMonths: [6, 7, 8]` - 夏季窗口

**典型节奏**：`relaxed`

**季节性**：
- 最佳月份：6-9月（夏季）
- 避免月份：11-2月（冬季）

**签名POI类型**：
- `VIEWPOINT` - 观景点
- `BEACH` - 海滩
- `LIGHTHOUSE` - 灯塔
- `FERRY_TERMINAL` - 渡轮码头
- `COASTAL_TOWN` - 海岸小镇
- `NATURAL_WONDER` - 自然奇观

**典型行程骨架**：
- 每日主题：`['出发', '海岸', '峡湾', '小镇', '摄影', '返程']`

---

### 3. 城市文化探索（URBAN_CULTURAL_EXPLORATION）

**典型例子**：欧洲城市、日本、中国城市

**特征**：
- 海拔范围：0-2000米
- 地形类型：城市
- 气候带：温带、亚热带、热带

**默认标签**：`['城市', '文化', '历史', '博物馆', '轻松']`

**典型约束**：
- 软约束：
  - `maxDailyAscentM: 200` - 城市通常较平缓
  - `maxElevationM: 1000` - 最大海拔1000米
  - `maxSlopePct: 10` - 最大坡度10%
  - `bufferTimeMin: 10` - 缓冲时间10分钟

**风险画像**：
- 无特殊风险

**典型节奏**：`relaxed`

**季节性**：
- 最佳月份：4-10月（春季到秋季）
- 避免月份：无（城市全年可游）

**签名POI类型**：
- `MUSEUM` - 博物馆
- `HISTORIC_SITE` - 历史遗址
- `CITY_CENTER` - 市中心
- `MARKET` - 市场
- `RESTAURANT` - 餐厅
- `SHOPPING` - 购物

**典型行程骨架**：
- 每日主题：`['到达', '探索', '文化', '美食', '购物', '返程']`

---

### 4. 自然风光环线（NATURE_SCENIC_LOOP）

**典型例子**：新西兰、加拿大、美国国家公园

**特征**：
- 海拔范围：0-4000米
- 地形类型：山地、森林、湖泊、山谷
- 气候带：温带、高山

**默认标签**：`['自然', '环线', '摄影', '户外', '轻松']`

**典型约束**：
- 软约束：
  - `maxDailyAscentM: 600` - 每日最大爬升600米
  - `maxElevationM: 3000` - 最大海拔3000米
  - `maxSlopePct: 20` - 最大坡度20%
  - `bufferTimeMin: 15` - 缓冲时间15分钟

**风险画像**：
- `roadClosure: true` - 可能因天气封路
- `weatherWindow: true` - 有天气窗口
- `weatherWindowMonths: [5, 6, 7, 8, 9, 10]` - 春季到秋季窗口

**典型节奏**：`moderate`

**季节性**：
- 最佳月份：5-10月（春季到秋季）
- 避免月份：11-3月（冬季）

**签名POI类型**：
- `NATIONAL_PARK` - 国家公园
- `VIEWPOINT` - 观景点
- `WATERFALL` - 瀑布
- `LAKE` - 湖泊
- `TRAIL` - 步道
- `WILDLIFE_VIEWING` - 野生动物观赏

**典型行程骨架**：
- 每日主题：`['出发', '探索', '摄影', '自然', '环线', '返程']`

---

### 5. 冒险挑战路线（ADVENTURE_CHALLENGE_ROUTE）

**典型例子**：极限徒步、攀岩、越野

**特征**：
- 海拔范围：2000-8000米
- 地形类型：山地、高山、极端地形
- 气候带：高山、极地

**默认标签**：`['挑战', '冒险', '徒步', '极限', '户外']`

**典型约束**：
- 硬约束：
  - `requiresPermit: true` - 通常需要许可
  - `requiresGuide: true` - 通常需要向导
  - `rapidAscentForbidden: false` - 允许快速上升（但需注意）
- 软约束：
  - `maxDailyAscentM: 1500` - 允许更高的爬升
  - `maxElevationM: 6000` - 最大海拔6000米
  - `maxSlopePct: 35` - 允许更陡的坡度
  - `bufferTimeMin: 30` - 需要更多缓冲时间

**风险画像**：
- `altitudeSickness: true` - 有高反风险
- `roadClosure: true` - 可能因天气封路
- `weatherWindow: true` - 有天气窗口
- `weatherWindowMonths: [6, 7, 8, 9]` - 夏季窗口
- `consecutiveHighAltitudeDays: { min: 5, max: 15 }` - 连续高海拔天数
- `consecutiveAscentThreshold: 2000` - 连续上升阈值2000米

**典型节奏**：`intense`

**季节性**：
- 最佳月份：6-9月（夏季）
- 避免月份：11-4月（冬季和早春）

**签名POI类型**：
- `MOUNTAIN_PEAK` - 山峰
- `TRAILHEAD` - 徒步起点
- `BASE_CAMP` - 大本营
- `VIEWPOINT` - 观景点
- `CHALLENGE_POINT` - 挑战点

**典型行程骨架**：
- 每日主题：`['准备', '适应', '挑战', '登顶', '下降', '恢复']`
- 建议休息日：第2、4天

---

### 6. 轻松休闲度假（RELAXED_LEISURE_VACATION）

**典型例子**：海滩度假、温泉、SPA

**特征**：
- 海拔范围：0-1000米
- 地形类型：海岸线、海滩、度假村
- 气候带：热带、亚热带、温带

**默认标签**：`['轻松', '休闲', '度假', '海滩', '温泉']`

**典型约束**：
- 软约束：
  - `maxDailyAscentM: 100` - 非常平缓
  - `maxElevationM: 500` - 最大海拔500米
  - `maxSlopePct: 5` - 最大坡度5%
  - `bufferTimeMin: 20` - 更多缓冲时间用于休息

**风险画像**：
- 无特殊风险

**典型节奏**：`relaxed`

**季节性**：
- 最佳月份：5-10月（春季到秋季）
- 避免月份：无（全年可游）

**签名POI类型**：
- `BEACH` - 海滩
- `SPA` - SPA
- `RESORT` - 度假村
- `RESTAURANT` - 餐厅
- `SHOPPING` - 购物
- `ENTERTAINMENT` - 娱乐

**典型行程骨架**：
- 每日主题：`['到达', '放松', '休闲', '享受', '返程']`

---

## 使用方法

### 1. 在代码中使用

```typescript
import {
  generateRouteDirectionFromArchetype,
  RouteDirectionArchetype,
} from './src/route-directions/templates/route-direction-archetypes';

// 生成基于母型的RouteDirection骨架
const skeleton = generateRouteDirectionFromArchetype(
  'HIGH_ALTITUDE_CULTURAL_TREKKING',
  'CN_XZ',
  {
    name: 'CN_XZ_TIBET_CULTURAL_TREK',
    nameCN: '西藏文化徒步',
    regions: ['CN_XZ_LHASA', 'CN_XZ_SHIGATSE'],
    entryHubs: ['拉萨机场'],
    // 可以覆盖默认值
    constraints: {
      soft: {
        maxElevationM: 5500, // 覆盖默认值
      },
    },
  }
);
```

### 2. 在脚本中使用

```bash
# 生成新国家的Pack（自动使用推荐的母型）
npx ts-node --project tsconfig.backend.json scripts/new-country-pack.ts IS Iceland
```

### 3. 根据地区特征推荐母型

```typescript
import { recommendArchetypesByRegion } from './src/route-directions/templates/route-direction-archetypes';

const recommendations = recommendArchetypesByRegion({
  elevation: 3500,
  terrainType: 'mountain',
  climateZone: 'alpine',
  hasCoastline: false,
});

// 返回按匹配度排序的母型列表
console.log(recommendations);
// [
//   { archetype: 'HIGH_ALTITUDE_CULTURAL_TREKKING', score: 75, reason: '...' },
//   { archetype: 'ADVENTURE_CHALLENGE_ROUTE', score: 50, reason: '...' },
//   ...
// ]
```

## 扩展母型

如果需要添加新的母型：

1. 在 `src/route-directions/templates/route-direction-archetypes.ts` 中添加新的母型定义
2. 更新 `RouteDirectionArchetype` 类型
3. 更新本文档

## 注意事项

1. **母型是模板，不是最终配置**：使用母型生成骨架后，需要根据具体国家/地区调整参数
2. **约束值需要验证**：生成的约束值需要根据实际DEM数据和路线特征验证
3. **季节性需要调整**：不同国家的季节性可能不同，需要根据实际情况调整
4. **风险画像需要完善**：根据具体路线的风险特征完善风险画像

## 相关文档

- [国家 Pack 生成指南](./COUNTRY_PACK_GUIDE.md)
- [RouteDirection 模块 README](../src/route-directions/README.md)

