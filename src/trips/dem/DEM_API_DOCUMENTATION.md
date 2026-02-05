# DEM 地形数据 API 文档

## 概述

DEM (Digital Elevation Model) API 提供地形数据查询服务，包括单个坐标点的海拔查询和路线海拔剖面生成。

## 基础路径

所有 DEM API 端点的基础路径为：`/api/dem`

## API 端点

### 1. 获取单个坐标点的海拔

**端点**: `GET /api/dem/elevation`

**描述**: 根据经纬度获取指定点的海拔高度（米）

**查询参数**:
- `lat` (必需): 纬度，例如 `64.1466`
- `lng` (必需): 经度，例如 `-21.9426`

**示例请求**:
```bash
GET /api/dem/elevation?lat=64.1466&lng=-21.9426
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "lat": 64.1466,
    "lng": -21.9426,
    "elevation": 123.5,
    "unit": "meters"
  }
}
```

**错误响应**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "经纬度必须是有效数字"
  }
}
```

---

### 2. 获取路线海拔剖面

**端点**: `POST /api/dem/profile`

**描述**: 根据路线点数组（polyline）生成详细的海拔剖面，包括累计爬升、坡度、体力消耗等信息

**请求体**:
```json
{
  "polyline": [
    { "lat": 64.1466, "lng": -21.9426 },
    { "lat": 64.1500, "lng": -21.9500 },
    { "lat": 64.1600, "lng": -21.9600 }
  ],
  "samples": 100,
  "activityType": "walking"
}
```

**参数说明**:
- `polyline` (必需): 路线点数组，至少需要 2 个点
- `samples` (可选): 采样间隔（米），默认 `100`
- `activityType` (可选): 活动类型，可选值：`walking`、`driving`、`cycling`，默认 `walking`

**示例请求**:
```bash
POST /api/dem/profile
Content-Type: application/json

{
  "polyline": [
    { "lat": 64.1466, "lng": -21.9426 },
    { "lat": 64.1500, "lng": -21.9500 }
  ],
  "samples": 100,
  "activityType": "walking"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "elevationProfile": [
      {
        "distance": 0,
        "lat": 64.1466,
        "lng": -21.9426,
        "elevation": 123.5,
        "slope": 0,
        "cumulativeAscent": 0
      },
      {
        "distance": 1000,
        "lat": 64.1500,
        "lng": -21.9500,
        "elevation": 145.2,
        "slope": 2.17,
        "cumulativeAscent": 21.7
      }
    ],
    "cumulativeAscent": 21.7,
    "totalDescent": 0,
    "maxSlope": 2.17,
    "minSlope": 0,
    "maxElevation": 145.2,
    "minElevation": 123.5,
    "totalDistance": 1000,
    "fatigueIndex": 2.2,
    "difficulty": "easy",
    "effortScore": 15.5
  }
}
```

**响应字段说明**:
- `elevationProfile`: 海拔剖面点数组，每个点包含：
  - `distance`: 距离起点的距离（米）
  - `lat`: 纬度
  - `lng`: 经度
  - `elevation`: 海拔（米）
  - `slope`: 坡度（百分比）
  - `cumulativeAscent`: 累计爬升（米）
- `cumulativeAscent`: 总累计爬升（米）
- `totalDescent`: 总累计下降（米）
- `maxSlope`: 最大坡度（百分比）
- `minSlope`: 最小坡度（百分比）
- `maxElevation`: 最高海拔（米）
- `minElevation`: 最低海拔（米）
- `totalDistance`: 总距离（米）
- `fatigueIndex`: 疲劳指数（0-100）
- `difficulty`: 难度等级（`easy`、`moderate`、`hard`、`extreme`）
- `effortScore`: 体力消耗评分（0-100）

**错误响应**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "polyline 至少需要 2 个点"
  }
}
```

---

### 3. 获取行程的地形数据

**端点**: `GET /api/dem/trip/:tripId/terrain`

**描述**: 根据行程 ID 获取行程的地形数据（海拔剖面、累计爬升等）

**路径参数**:
- `tripId` (必需): 行程 ID

**查询参数**:
- `samples` (可选): 采样间隔（米）

**示例请求**:
```bash
GET /api/dem/trip/288cdbf7-8ff6-417d-88be-766435335eea/terrain?samples=100
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "message": "请使用 POST /api/dem/profile 接口，提供 polyline 数据",
    "tripId": "288cdbf7-8ff6-417d-88be-766435335eea"
  }
}
```

**注意**: 此端点目前为占位符。要获取行程的地形数据，请：
1. 从行程数据中提取路线点（polyline）
2. 调用 `POST /api/dem/profile` 接口

---

## 前端集成示例

### React/TypeScript 示例

```typescript
// 获取路线海拔剖面
async function getElevationProfile(polyline: Array<{ lat: number; lng: number }>) {
  const response = await fetch('/api/dem/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      polyline,
      samples: 100,
      activityType: 'walking',
    }),
  });

  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error.message);
  }
}

// 使用示例
const polyline = [
  { lat: 64.1466, lng: -21.9426 },
  { lat: 64.1500, lng: -21.9500 },
];

try {
  const terrainData = await getElevationProfile(polyline);
  console.log('海拔剖面:', terrainData.elevationProfile);
  console.log('累计爬升:', terrainData.cumulativeAscent);
  console.log('难度:', terrainData.difficulty);
} catch (error) {
  console.error('获取地形数据失败:', error);
}
```

### 从规划工作台获取路线点

如果您的应用使用规划工作台（Planning Workbench），可以从 `planState.itinerary.segments` 中提取路线点：

```typescript
// 从 PlanState 提取 polyline
function extractPolylineFromPlanState(planState: PlanState): Array<{ lat: number; lng: number }> {
  const polyline: Array<{ lat: number; lng: number }> = [];
  
  // 遍历 segments，提取坐标点
  for (const segment of planState.itinerary.segments || []) {
    if (segment.metadata?.fromPoiId && segment.metadata?.toPoiId) {
      // 如果有 POI 信息，可以从 POI 服务获取坐标
      // 这里需要根据您的数据结构调整
    }
  }
  
  return polyline;
}
```

---

## 错误处理

所有 API 端点都遵循标准的错误响应格式：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  }
}
```

常见错误码：
- `VALIDATION_ERROR`: 参数验证失败
- `INTERNAL_ERROR`: 服务器内部错误

---

## 注意事项

1. **数据可用性**: DEM 数据依赖于数据库中的 DEM 表（`geo_dem_cities_merged`、`geo_dem_xizang`、`geo_dem_global`）。如果数据库中没有相应的 DEM 数据，查询可能返回 `null`。

2. **性能考虑**: 
   - 单个坐标点查询通常很快（< 100ms）
   - 路线海拔剖面查询可能需要较长时间，取决于路线长度和采样间隔
   - 建议对长路线使用较大的采样间隔（如 200-500 米）以提高性能

3. **坐标系统**: 所有坐标使用 WGS84 (EPSG:4326) 坐标系。

4. **活动类型**: `activityType` 参数影响速度计算和体力消耗估算：
   - `walking`: 基础速度 4 km/h
   - `cycling`: 基础速度 15 km/h
   - `driving`: 基础速度 60 km/h

---

## 相关资源

- DEM 服务实现: `src/trips/dem/services/`
- DEM Controller: `src/trips/dem/dem.controller.ts`
- DEM Module: `src/trips/dem/dem.module.ts`
