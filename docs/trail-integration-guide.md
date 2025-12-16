# 徒步功能与行程规划集成指南

## 概述

本文档说明如何将徒步（Trail）功能融合进行程规划软件，实现"景点+轨迹"双向规划、地图展示优化、配套服务推荐和行程分享复盘等功能。

## 核心设计思路

1. **景点为徒步轨迹锚定节点**：景点作为徒步路线的起点、终点或途经点
2. **徒步轨迹为景点串联路径**：通过Trail连接多个景点，形成完整的徒步行程
3. **功能联动**：行程规划、体力消耗计算、配套服务推荐等功能无缝衔接
4. **数据互通**：Trail数据与Place数据相互关联，支持双向查询

## 功能模块

### 1. 行程项创建（支持Trail）

#### 1.1 创建关联Trail的行程项

```typescript
POST /itinerary-items
{
  "tripDayId": "xxx",
  "trailId": 1,  // 新增：徒步路线ID
  "type": "ACTIVITY",
  "startTime": "2024-05-01T08:00:00.000Z",
  "endTime": "2024-05-01T16:00:00.000Z",
  "note": "记得带登山杖"
}
```

**特性：**
- 支持同时关联`placeId`和`trailId`（如起点Place）
- 自动验证Trail的预计耗时是否合理
- 返回完整的Trail信息（包括waypoints）

#### 1.2 查询行程项（包含Trail数据）

```typescript
GET /itinerary-items/:id
// 返回数据包含：
{
  "id": "xxx",
  "trail": {
    "id": 1,
    "nameCN": "武功山徒步路线",
    "distanceKm": 15.2,
    "elevationGainM": 1200,
    "startPlace": {...},
    "endPlace": {...},
    "waypoints": [...]
  }
}
```

### 2. 景点到轨迹的匹配算法

#### 2.1 根据多个景点推荐徒步路线

```typescript
POST /trails/recommend-for-places
{
  "placeIds": [1, 2, 3],  // 目标景点ID列表
  "maxDistance": 20,       // 最大距离（公里）
  "preferOffRoad": true,   // 优先推荐非公路步道
  "maxDifficulty": "MODERATE"  // 最大难度
}
```

**返回示例：**
```json
[
  {
    "trail": {
      "id": 1,
      "nameCN": "武功山环线",
      "distanceKm": 18.5,
      ...
    },
    "matchScore": 0.8,
    "avgDistance": 2.3,
    "matchedPlaceIds": [1, 2],
    "recommendation": "高度匹配：该路线串联了多个目标景点"
  }
]
```

**算法说明：**
- 匹配度 = 匹配的景点数量 / 总景点数量
- 距离分数 = 1 - (平均距离 / 10km)
- 总分数 = 匹配度 × 0.7 + 距离分数 × 0.3
- 优先推荐小众步道（非公路）

### 3. 轨迹到景点的识别算法

#### 3.1 识别Trail沿途的景点

```typescript
GET /trails/:id/places-along?radiusKm=3
```

**返回示例：**
```json
[
  {
    "place": {
      "id": 10,
      "nameCN": "观景台",
      "category": "VIEWPOINT",
      ...
    },
    "distanceKm": 1.2,
    "recommendation": "强烈推荐：距离路线很近，可作为打卡点"
  }
]
```

**算法说明：**
- 从Trail的GPX数据或waypoints提取轨迹点
- 查找轨迹点周围指定半径内的景点（ATTRACTION, VIEWPOINT, NATURE等）
- 按距离排序，提供推荐理由

### 4. 拆分长徒步路线

#### 4.1 将长路线拆分为多个分段

```typescript
GET /trails/:id/split-segments?maxSegmentLengthKm=10
```

**返回示例：**
```json
[
  {
    "segmentIndex": 1,
    "startPoint": {"lat": 27.5, "lng": 114.2},
    "endPoint": {"lat": 27.6, "lng": 114.3},
    "distanceKm": 9.8,
    "elevationGainM": 450,
    "estimatedDurationHours": 3.5,
    "waypointCount": 120
  },
  {
    "segmentIndex": 2,
    ...
  }
]
```

**使用场景：**
- 将多日徒步路线拆分为单日行程
- 每个分段包含独立的距离、爬升、预计耗时

### 5. 行程配套服务推荐

#### 5.1 推荐装备、保险、补给点、应急服务

```typescript
GET /trails/:id/support-services
```

**返回示例：**
```json
[
  {
    "type": "EQUIPMENT",
    "name": "基础徒步装备",
    "description": "徒步鞋、背包、水壶、头灯、地图/导航设备",
    "recommendation": "所有徒步路线必备"
  },
  {
    "type": "INSURANCE",
    "name": "高原反应保险",
    "description": "覆盖高海拔徒步、高原反应、紧急救援的专项保险",
    "recommendation": "高海拔路线强烈推荐购买",
    "metadata": {
      "coverage": ["高原反应", "紧急救援", "医疗转运"],
      "recommendedProviders": ["平安保险", "中国人保"]
    }
  },
  {
    "type": "SUPPLY",
    "name": "补给点",
    "description": "补给点：可在此用餐、休息",
    "location": {"lat": 27.5, "lng": 114.2},
    "distanceKm": 1.5,
    "recommendation": "距离起点较近的补给点"
  },
  {
    "type": "EMERGENCY",
    "name": "医疗点",
    "description": "应急医疗点",
    "location": {"lat": 27.6, "lng": 114.3},
    "distanceKm": 5.2,
    "recommendation": "紧急情况可前往"
  }
]
```

**推荐规则：**
- **装备**：根据难度、海拔、爬升推荐不同装备
- **保险**：高海拔（>3000m）推荐高原反应保险，高难度推荐户外运动保险
- **补给点**：查找起点、终点、途经点附近的餐饮、住宿
- **应急服务**：查找轨迹中心点附近的医疗点、避难所

### 6. 行程分享和复盘

#### 6.1 生成行程复盘报告

```typescript
GET /trips/:id/recap
```

**返回示例：**
```json
{
  "tripId": "xxx",
  "destination": "武功山",
  "startDate": "2024-05-01",
  "endDate": "2024-05-03",
  "totalDays": 3,
  "places": [
    {
      "id": 1,
      "nameCN": "金顶",
      "visitDate": "2024-05-01",
      "visitTime": "14:30"
    }
  ],
  "trails": [
    {
      "id": 1,
      "nameCN": "武功山徒步路线",
      "distanceKm": 15.2,
      "elevationGainM": 1200,
      "durationHours": 6,
      "visitDate": "2024-05-01",
      "gpxData": {...},
      "waypoints": [...]
    }
  ],
  "statistics": {
    "totalPlaces": 5,
    "totalTrails": 2,
    "totalTrailDistanceKm": 28.5,
    "totalElevationGainM": 2100,
    "totalTrailDurationHours": 12,
    "placesByCategory": {
      "ATTRACTION": 3,
      "VIEWPOINT": 2
    }
  },
  "timeline": [
    {
      "date": "2024-05-01",
      "items": [
        {
          "type": "TRAIL",
          "name": "武功山徒步路线",
          "time": "08:00",
          "duration": 6
        },
        {
          "type": "PLACE",
          "name": "金顶",
          "time": "14:30",
          "duration": 1
        }
      ]
    }
  ]
}
```

#### 6.2 导出行程复盘报告（用于分享）

```typescript
GET /trips/:id/recap/export
```

返回包含分享链接的完整报告，其他用户可导入该行程。

#### 6.3 生成3D轨迹视频数据

```typescript
GET /trips/:id/trail-video-data
```

返回GPX数据和关键点信息，前端可据此生成3D轨迹视频。

## 用户场景示例

### 场景1：以景点为核心生成徒步轨迹

1. 用户选择多个目标景点（如：观景台A、古村落B、瀑布C）
2. 调用 `POST /trails/recommend-for-places`，传入景点ID列表
3. 系统返回能够串联这些景点的Trail推荐
4. 用户选择推荐的Trail，创建行程项：`POST /itinerary-items`（包含`trailId`）
5. 系统自动验证时间是否合理，并关联起点、终点Place

### 场景2：导入GPX轨迹，识别沿途景点

1. 用户导入GPX文件：`npm run import:gpx -- trail.gpx --create-trail`
2. 系统创建Trail记录，包含GPX数据
3. 调用 `GET /trails/:id/places-along?radiusKm=3`
4. 系统返回轨迹沿途3km内的景点推荐
5. 用户选择感兴趣的景点，添加到行程中

### 场景3：拆分长路线为单日行程

1. 用户导入一条50km的多日徒步路线
2. 调用 `GET /trails/:id/split-segments?maxSegmentLengthKm=15`
3. 系统将路线拆分为多个15km左右的分段
4. 用户为每个分段创建独立的行程项，分配到不同日期

### 场景4：获取配套服务推荐

1. 用户在行程中添加了高海拔徒步路线
2. 调用 `GET /trails/:id/support-services`
3. 系统返回：
   - 装备推荐（高海拔装备、保暖衣物等）
   - 保险推荐（高原反应保险）
   - 补给点（沿途餐饮、住宿）
   - 应急服务（医疗点、避难所）
4. 用户根据推荐准备装备、购买保险、预约补给点

### 场景5：行程完成后生成复盘报告

1. 用户完成行程后，调用 `GET /trips/:id/recap`
2. 系统生成包含以下内容的报告：
   - 景点打卡顺序和时间
   - 徒步总里程、爬升、耗时
   - 时间轴展示（景点+轨迹）
   - 统计数据（按类别统计景点等）
3. 用户可导出报告：`GET /trips/:id/recap/export`
4. 生成分享链接，其他用户可导入该行程

## 数据库关系

```
Place (景点)
  ├── trailsAsStart (作为起点的Trail)
  ├── trailsAsEnd (作为终点的Trail)
  └── trailWaypoints (作为途经点的TrailWaypoint)

Trail (徒步路线)
  ├── startPlace (起点Place)
  ├── endPlace (终点Place)
  ├── waypoints (途经点TrailWaypoint[])
  └── itineraryItems (关联的行程项)

ItineraryItem (行程项)
  ├── placeId (可选：关联的Place)
  └── trailId (可选：关联的Trail)

TrailWaypoint (途经点)
  ├── trailId (所属Trail)
  └── placeId (可选：关联的Place)
```

## 前端集成建议

### 1. 地图展示

- **基础层**：显示景点分布、周边餐饮住宿
- **徒步层**：叠加等高线、地形热力图、Trail轨迹
- **双图层切换**：支持切换显示模式
- **离线支持**：缓存GPX数据，无信号时离线查看

### 2. 行程列表

- **时间轴+轨迹点**：既显示景点的游览时段，也显示对应路段的徒步数据
- **爬升提示**：标注某景点到下一站的爬升高度、路况提示
- **体力消耗**：显示每个Trail的体力消耗预估

### 3. 配套服务展示

- **装备清单**：根据推荐生成装备清单，支持勾选
- **保险链接**：直接跳转到推荐保险提供商的购买页面
- **补给点地图**：在地图上标注补给点位置
- **应急服务**：标注医疗点、避难所，支持一键导航

### 4. 分享和复盘

- **报告展示**：以时间轴形式展示完整行程
- **3D轨迹视频**：使用返回的关键点数据生成3D轨迹动画
- **照片集成**：支持上传景点照片，自动关联到对应Place
- **一键分享**：生成分享链接，支持社交媒体分享

## 注意事项

1. **时间验证**：创建关联Trail的行程项时，系统会验证时间是否足够（至少需要estimatedDurationHours的80%）
2. **数据完整性**：Trail的GPX数据优先，如果没有则使用waypoints，最后使用起点和终点
3. **空间查询优化**：`findPlacesAlongTrail`中的空间查询需要根据实际数据库（PostGIS）调整
4. **配套服务数据**：`findNearbyPlaces`需要根据实际Place数据源实现

## 性能优化

### 1. 缓存机制

已实现 `TrailCacheService`，缓存以下数据：
- **Trail基本信息**：TTL 5分钟
- **Trail沿途景点**：TTL 10分钟
- **Trail推荐结果**：TTL 15分钟

**使用方式：**
```typescript
// 自动缓存，无需手动调用
const trail = await trailsService.findOne(trailId); // 自动缓存
const places = await trailsService.findPlacesAlongTrail(trailId, 3); // 自动缓存
```

### 2. PostGIS空间查询优化

- `findPlacesAlongTrail`：使用PostGIS `ST_DWithin` 进行高效空间查询
- `findNearbyPlaces`：使用PostGIS计算距离，避免全表扫描
- 轨迹点采样：每100米采样一个点，减少查询次数

### 3. 体力消耗计算

已实现 `TrailFatigueCalculator`，提供：
- **基础消耗**：距离(km) × 2 + 爬升(m) / 100
- **难度惩罚**：根据difficultyLevel调整（EASY: 0.9x, HARD: 1.2x, EXTREME: 1.5x）
- **海拔惩罚**：分段线性插值（1500m-7000m）
- **适合性检查**：根据用户体力配置判断Trail是否适合

**使用方式：**
```typescript
POST /trails/:id/check-suitability
{
  "max_daily_hp": 100,
  "walk_speed_factor": 1.0,
  "terrain_filter": "ALL"
}
```

## 高级功能（已实现）

### 1. 智能路线规划 ✅

根据用户体力和偏好，自动规划最优的景点+轨迹组合。

**接口：**
```typescript
POST /trails/smart-plan
{
  "placeIds": [1, 2, 3],
  "pacingConfig": {
    "max_daily_hp": 100,
    "walk_speed_factor": 1.0,
    "terrain_filter": "ALL"
  },
  "preferences": {
    "maxTotalDistanceKm": 30,
    "maxSegmentDistanceKm": 15,
    "preferredDifficulty": "MODERATE",
    "preferOffRoad": true,
    "allowSplit": true
  }
}
```

**返回：**
- 推荐的Trail组合（包含适合性评估）
- 总体评估（总距离、爬升、耗时、HP消耗）
- 建议的行程安排（自动分配到多天）

**特性：**
- 自动评估每个Trail的适合性
- 根据体力限制自动拆分到多天
- 优先推荐匹配度高且适合用户体力的路线

### 2. 实时轨迹追踪 ✅

支持实时记录用户位置，与计划轨迹对比。

**接口：**
```typescript
// 开始追踪
POST /trails/tracking/start
{ "trailId": 1, "itineraryItemId": "xxx" }

// 添加追踪点
POST /trails/tracking/:sessionId/point
{
  "latitude": 27.5,
  "longitude": 114.2,
  "elevation": 1200,
  "accuracy": 10
}

// 结束追踪
POST /trails/tracking/:sessionId/stop

// 获取追踪状态
GET /trails/tracking/:sessionId
```

**返回：**
- 实时统计（总距离、爬升、平均速度、最大速度）
- 与计划轨迹的偏差（米）
- 完整轨迹点列表

### 3. 社区分享扩展 ✅

支持将带轨迹的行程攻略分享至社区，其他用户可直接导入。

**接口：**
```typescript
// 获取分享的行程（包含Trail数据）
GET /trips/shared/:shareToken

// 导入分享的行程
POST /trips/shared/:shareToken/import
{
  "destination": "武功山",
  "startDate": "2024-05-01",
  "endDate": "2024-05-03"
}
```

**特性：**
- 完整复制行程项（包括Trail关联）
- 保留所有Trail数据（GPX、waypoints等）
- 记录导入来源，便于追溯

### 4. 行程优化算法集成 ✅

将Trail体力消耗纳入RouteOptimizerService的优化算法。

**实现：**
- 扩展了`PlaceNode`接口，支持`trailId`和`trailData`
- 在`HappinessScorerService`中集成Trail疲劳惩罚计算
- 在`RouteOptimizerService`中考虑Trail的预计耗时

**效果：**
- Trail的体力消耗会影响路线优化分数
- 高难度、高海拔的Trail会增加疲劳惩罚
- 优化算法会自动避免过度消耗体力的路线组合

## 后续优化方向

1. **离线地图**：支持下载离线地图包，包含等高线、地形数据
2. **天气集成**：根据天气预报调整路线推荐和装备建议
3. **轨迹分析**：分析实际轨迹与计划轨迹的差异，提供改进建议
4. **社交功能**：支持在社区中分享和评论Trail行程
5. **AI推荐**：使用机器学习优化Trail推荐算法

