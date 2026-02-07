# 行程项坐标字段功能测试指南

## 📋 概述

本文档说明如何测试行程项接口的坐标字段功能。所有返回行程项的接口现在都会在 `Place` 对象中包含坐标字段。

## ✅ 已实现的坐标字段

每个 `Place` 对象现在包含以下坐标字段：

```typescript
{
  lat: number | null,           // 纬度（兼容字段）
  lng: number | null,           // 经度（兼容字段）
  latitude: number | null,      // 纬度（标准字段）
  longitude: number | null,     // 经度（标准字段）
  coordinates?: {               // 坐标对象（可选）
    lat: number,
    lng: number
  }
}
```

## 🧪 测试方法

### 方法 1: 使用自动化测试脚本（推荐）

```bash
# 1. 确保服务正在运行
npm run start:dev

# 2. 在另一个终端运行测试脚本
npx ts-node scripts/test-itinerary-items-coordinates.ts

# 或者指定自定义 API 地址
API_BASE_URL=http://localhost:3000/api npx ts-node scripts/test-itinerary-items-coordinates.ts
```

测试脚本会验证：
- ✅ 获取行程项列表接口返回坐标字段
- ✅ 获取单个行程项接口返回坐标字段
- ✅ 按 TripDay 获取行程项接口返回坐标字段

### 方法 2: 使用 curl 命令手动测试

#### 1. 获取行程项列表

```bash
curl -X GET "http://localhost:3000/api/itinerary-items" \
  -H "Content-Type: application/json" | jq '.data[0].Place | {lat, lng, latitude, longitude, coordinates}'
```

**预期结果**：
```json
{
  "lat": 64.2556,
  "lng": -21.1294,
  "latitude": 64.2556,
  "longitude": -21.1294,
  "coordinates": {
    "lat": 64.2556,
    "lng": -21.1294
  }
}
```

#### 2. 获取单个行程项

```bash
# 替换 <itemId> 为实际的行程项 ID
curl -X GET "http://localhost:3000/api/itinerary-items/<itemId>" \
  -H "Content-Type: application/json" | jq '.data.Place | {lat, lng, latitude, longitude, coordinates}'
```

#### 3. 按 TripDay 获取行程项

```bash
# 替换 <tripDayId> 为实际的 TripDay ID
curl -X GET "http://localhost:3000/api/itinerary-items?tripDayId=<tripDayId>" \
  -H "Content-Type: application/json" | jq '.data[] | {id, Place: .Place | {lat, lng, latitude, longitude}}'
```

#### 4. 创建行程项（验证返回数据）

```bash
curl -X POST "http://localhost:3000/api/itinerary-items" \
  -H "Content-Type: application/json" \
  -d '{
    "tripDayId": "<tripDayId>",
    "placeId": <placeId>,
    "type": "ACTIVITY",
    "startTime": "2024-05-01T10:00:00.000Z",
    "endTime": "2024-05-01T12:00:00.000Z"
  }' | jq '.data.Place | {lat, lng, latitude, longitude, coordinates}'
```

#### 5. 更新行程项（验证返回数据）

```bash
curl -X PATCH "http://localhost:3000/api/itinerary-items/<itemId>" \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "2024-05-01T11:00:00.000Z"
  }' | jq '.data.Place | {lat, lng, latitude, longitude, coordinates}'
```

### 方法 3: 使用 Swagger UI

1. 访问 `http://localhost:3000/api-docs`
2. 找到 `itinerary-items` 相关的接口
3. 测试以下接口：
   - `GET /api/itinerary-items` - 获取列表
   - `GET /api/itinerary-items/{id}` - 获取单个
   - `POST /api/itinerary-items` - 创建
   - `PATCH /api/itinerary-items/{id}` - 更新
4. 检查响应中的 `Place` 对象是否包含坐标字段

## 📊 坐标提取优先级

系统按以下优先级提取坐标：

1. **PostGIS `location` 字段**（最高优先级）
   - 使用 SQL 查询：`ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng`

2. **`metadata.lat` / `metadata.lng`**
   - 直接从 metadata JSON 中读取

3. **`metadata.coordinates` 数组**
   - 自动识别格式：`[lat, lng]` 或 `[lng, lat]`（GeoJSON 格式）
   - 根据数值范围智能判断（纬度：-90 到 90，经度：-180 到 180）

4. **`metadata.location.lat` / `metadata.location.lng`**
   - 从嵌套的 location 对象中读取

5. **`metadata.location.coordinates` 数组**
   - 支持嵌套的 coordinates 数组

## 🔍 验证检查清单

- [ ] `lat` 字段存在（可能为 `null`）
- [ ] `lng` 字段存在（可能为 `null`）
- [ ] `latitude` 字段存在（可能为 `null`）
- [ ] `longitude` 字段存在（可能为 `null`）
- [ ] `coordinates` 对象存在（如果坐标可用）
- [ ] 坐标值在有效范围内（纬度：-90 到 90，经度：-180 到 180）
- [ ] 所有字段的值一致（`lat === latitude`, `lng === longitude`）

## 🐛 故障排除

### 问题 1: 坐标字段为 `null`

**可能原因**：
- Place 没有位置信息（`location` 字段为空，且 `metadata` 中没有坐标）

**解决方法**：
- 检查数据库中的 Place 数据
- 确认 `location` 字段或 `metadata` 中包含坐标信息

### 问题 2: 坐标值不正确

**可能原因**：
- `metadata.coordinates` 数组的顺序错误（GeoJSON 格式是 `[lng, lat]`）

**解决方法**：
- 系统会自动识别坐标顺序，但如果仍有问题，检查原始数据格式

### 问题 3: 某些 Place 没有坐标字段

**可能原因**：
- Place 对象不存在或未关联

**解决方法**：
- 这是正常的，只有关联了 Place 的行程项才会包含坐标字段

## 📝 示例响应

### 成功响应（包含坐标）

```json
{
  "success": true,
  "data": {
    "id": "item-uuid-123",
    "placeId": 123,
    "Place": {
      "id": 123,
      "nameCN": "蓝湖",
      "nameEN": "Blue Lagoon",
      "lat": 63.8804,
      "lng": -22.4495,
      "latitude": 63.8804,
      "longitude": -22.4495,
      "coordinates": {
        "lat": 63.8804,
        "lng": -22.4495
      },
      "address": "240 Grindavík, Iceland",
      "category": "SPA",
      "rating": 4.5
    },
    "startTime": "2024-05-01T10:00:00.000Z",
    "endTime": "2024-05-01T12:00:00.000Z"
  }
}
```

### 成功响应（坐标为 null）

```json
{
  "success": true,
  "data": {
    "id": "item-uuid-456",
    "placeId": 456,
    "Place": {
      "id": 456,
      "nameCN": "某个地点",
      "nameEN": "Some Place",
      "lat": null,
      "lng": null,
      "latitude": null,
      "longitude": null,
      "address": "地址信息"
    }
  }
}
```

## 🎯 支持的接口

以下接口现在都返回坐标字段：

- ✅ `GET /api/itinerary-items` - 获取所有行程项
- ✅ `GET /api/itinerary-items/:id` - 获取单个行程项
- ✅ `GET /api/itinerary-items?tripDayId=xxx` - 按 TripDay 获取行程项
- ✅ `POST /api/itinerary-items` - 创建行程项
- ✅ `PATCH /api/itinerary-items/:id` - 更新行程项
- ✅ `PATCH /api/itinerary-items/:id/booking-status` - 更新预订状态
- ✅ `PATCH /api/itinerary-items/:id/travel-info` - 更新交通信息

## 📚 相关文档

- [行程项 API 文档](./ITINERARY_ITEMS_API.md)
- [坐标实现状态](../../trips/COORDINATES_IMPLEMENTATION_STATUS.md)
- [下一站坐标改进](../../trips/NEXT_STOP_COORDINATES_IMPROVEMENT.md)
