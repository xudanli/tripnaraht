# 全景行程视图 API

## 📋 功能概述

实现了 `GET /trips/:id` 接口的"全景行程视图"功能，返回完整的行程树形结构，包括：

- **Trip**（行程基本信息）
  - **Days**（按日期排序的所有行程日）
    - **Items**（按时间排序的所有活动项）
      - **Place**（关联地点的完整信息）

同时包含数据增强功能，自动计算统计信息和行程状态。

## 🎯 核心特性

### 1. 多级连表查询

使用 Prisma 的 `include` 语法进行三层关联查询：

```typescript
trip -> days -> items -> place
```

- **Days** 按日期升序排列
- **Items** 按开始时间升序排列
- **Place** 包含完整的地点信息（中英文名称、位置、营业时间等）

### 2. 数据增强（Data Enrichment）

自动计算以下统计信息：

- **总天数**：行程包含的总天数
- **有活动的天数**：至少包含一个活动的天数
- **总活动数**：所有类型的活动项总数
- **分类统计**：
  - `totalActivities`：游玩活动数
  - `totalMeals`：用餐次数
  - `totalRest`：休息次数
  - `totalTransit`：交通移动次数
- **行程状态**：
  - `PLANNING`：规划中（未开始）
  - `ONGOING`：进行中（当前日期在行程范围内）
  - `COMPLETED`：已完成（已过结束日期）
- **预算统计**：预算配置和使用情况

### 3. 地点信息完整性

返回的地点信息包括：

- `id`：地点 ID
- `name`：中文名称
- `nameEN`：英文名称
- `category`：分类（ATTRACTION, RESTAURANT, SHOPPING, TRANSIT_HUB）
- `address`：地址
- `location`：地理位置（PostGIS Point，用于地图展示）
- `metadata`：元数据（营业时间、时区、图片等）
- `physicalMetadata`：体力消耗元数据（地形、疲劳度等）
- `rating`：评分

## 📡 API 端点

### GET /trips/:id

获取单个行程的完整详情（全景视图）。

**请求示例：**

```bash
curl -X GET http://localhost:3000/trips/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1
```

**响应示例：**

```json
{
  "id": "trip-123",
  "destination": "IS",
  "startDate": "2024-07-01T00:00:00.000Z",
  "endDate": "2024-07-05T00:00:00.000Z",
  "budgetConfig": {
    "total": 20000,
    "currency": "CNY",
    "daily_budget": 3000,
    "hotel_tier_recommendation": "4-Star"
  },
  "pacingConfig": {
    "mobility_profile": "STAMINA_60_TERRAIN_NO_STAIRS",
    "desc": "检测到体力短板，建议每 90 分钟休息一次",
    "forced_rest_interval": 90,
    "terrain_filter": "NO_STAIRS"
  },
  "stats": {
    "totalDays": 5,
    "daysWithActivities": 3,
    "totalItems": 8,
    "totalActivities": 5,
    "totalMeals": 2,
    "totalRest": 1,
    "totalTransit": 0,
    "progress": "PLANNING",
    "budgetStats": {
      "total": 20000,
      "currency": "CNY",
      "daily_budget": 3000,
      "hotel_tier_recommendation": "4-Star"
    }
  },
  "days": [
    {
      "id": "day-1",
      "date": "2024-07-01T00:00:00.000Z",
      "items": [
        {
          "id": "item-abc",
          "type": "ACTIVITY",
          "startTime": "2024-07-01T10:00:00.000Z",
          "endTime": "2024-07-01T12:00:00.000Z",
          "note": "记得穿雨衣",
          "place": {
            "id": 1,
            "name": "古佛斯瀑布",
            "nameEN": "Gullfoss Waterfall",
            "category": "ATTRACTION",
            "address": "Iceland",
            "rating": 4.8,
            "metadata": {
              "openingHours": {
                "mon": "09:00-18:00"
              },
              "timezone": "Atlantic/Reykjavik"
            },
            "physicalMetadata": {
              "terrain": "STAIRS",
              "fatigue_score": "MEDIUM"
            }
          }
        }
      ]
    },
    {
      "id": "day-2",
      "date": "2024-07-02T00:00:00.000Z",
      "items": []
    }
  ]
}
```

## 🧪 测试

### 使用测试脚本

```bash
# 1. 先获取一个行程 ID
curl -X GET http://localhost:3000/trips | jq '.[0].id'

# 2. 使用测试脚本查看全景视图
./test-trip-view.sh <TRIP_ID>
```

### 手动测试

```bash
# 获取行程详情
curl -X GET http://localhost:3000/trips/<TRIP_ID> | jq '.'

# 查看统计信息
curl -X GET http://localhost:3000/trips/<TRIP_ID> | jq '.stats'

# 查看所有活动
curl -X GET http://localhost:3000/trips/<TRIP_ID> | jq '.days[].items[]'
```

## 🔧 实现细节

### Service 层（`trips.service.ts`）

#### `findOne(id: string)`

- 使用 Prisma 的 `include` 进行多级关联查询
- 自动排序（Days 按日期，Items 按时间）
- 调用 `enrichTripData` 进行数据增强

#### `enrichTripData(trip: any)`

- 遍历所有 Days 和 Items，计算统计信息
- 根据当前日期判断行程状态
- 计算预算使用情况
- 返回增强后的行程数据

### Controller 层（`trips.controller.ts`）

- 已添加 Swagger 文档装饰器
- 包含详细的响应示例
- 支持 API 文档自动生成

## 📊 数据流

```
用户请求 GET /trips/:id
    ↓
Controller.findOne()
    ↓
Service.findOne()
    ↓
Prisma 多级查询 (trip -> days -> items -> place)
    ↓
Service.enrichTripData() (数据增强)
    ↓
返回完整的行程树形结构
```

## 🎨 前端使用建议

### 1. 时间轴视图

使用 `days` 数组和每个 `day.items` 数组，按时间顺序渲染时间轴：

```typescript
trip.days.forEach(day => {
  day.items.forEach(item => {
    // 渲染时间轴节点
    // item.startTime, item.endTime
    // item.place.name, item.place.nameEN
  });
});
```

### 2. 地图视图

使用 `place.location` 字段在地图上标记所有地点：

```typescript
const locations = trip.days
  .flatMap(day => day.items)
  .filter(item => item.place?.location)
  .map(item => item.place.location);
```

### 3. 统计面板

使用 `stats` 对象显示行程概览：

```typescript
// 显示总天数、总活动数、行程状态等
trip.stats.totalDays
trip.stats.totalActivities
trip.stats.progress
```

### 4. 双语支持

根据用户语言设置选择显示 `name` 或 `nameEN`：

```typescript
const displayName = userLang === 'en' 
  ? place.nameEN || place.name 
  : place.name;
```

## 🚀 性能优化建议

1. **分页加载**：如果行程很长，可以考虑按天分页加载
2. **字段选择**：如果不需要所有字段，可以在 Service 层添加字段过滤
3. **缓存**：对于频繁访问的行程，可以添加 Redis 缓存
4. **索引优化**：确保数据库索引覆盖常用查询字段

## 📝 相关文档

- [Itinerary Items API](./ITINERARY-ITEMS-API.md) - 行程项管理 API
- [Trips API](./README.md) - 行程管理 API
- [Swagger 文档](./SWAGGER-SETUP.md) - API 文档访问指南

## ✅ 完成状态

- ✅ 多级连表查询（Trip -> Days -> Items -> Place）
- ✅ 自动排序（Days 按日期，Items 按时间）
- ✅ 数据增强（统计信息、行程状态）
- ✅ Swagger 文档
- ✅ 测试脚本
- ✅ 错误处理（404 Not Found）

