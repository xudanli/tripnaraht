# 规划工作台证据数据获取 API

## 概述

规划工作台提供了批量获取证据数据的接口，用于为行程中缺少证据的地点补充各类信息。支持获取的证据类型包括：

1. **天气数据** (weather) - 当前天气、温度、风速等
2. **道路封闭信息** (road_closure) - 路况状态、封路信息、F-Road 信息（冰岛）
3. **开放时间** (opening_hours) - 营业时间、开放状态

所有证据数据会自动更新到 `Place` 的 `metadata` 中，供准备度检查和覆盖地图使用。

## API 端点

### POST `/api/planning-workbench/trips/:tripId/fetch-evidence` ⭐ 推荐

为指定行程的地点批量获取所有类型的证据数据（天气、道路封闭、开放时间）。

#### 路径参数

- `tripId` (string, 必需): 行程 ID

#### 查询参数

- `placeIds` (string, 可选): 指定要获取证据的地点 ID 列表，多个 ID 用逗号分隔。如果不提供，则处理所有缺少证据的地点。
- `evidenceTypes` (string, 可选): 要获取的证据类型，多个类型用逗号分隔。可选值：`weather`, `road_closure`, `opening_hours`。不提供则获取所有类型。
- `forceRefresh` (boolean, 可选): 是否强制刷新已有证据数据。默认为 `false`，已有证据的地点会被跳过。

#### 请求示例

```bash
# 获取所有类型的证据数据
curl -X POST "http://localhost:3000/api/planning-workbench/trips/trip123/fetch-evidence"

# 只获取天气和道路封闭信息
curl -X POST "http://localhost:3000/api/planning-workbench/trips/trip123/fetch-evidence?evidenceTypes=weather,road_closure"

# 为指定地点获取所有证据
curl -X POST "http://localhost:3000/api/planning-workbench/trips/trip123/fetch-evidence?placeIds=1,2,3"

# 强制刷新所有证据
curl -X POST "http://localhost:3000/api/planning-workbench/trips/trip123/fetch-evidence?forceRefresh=true"
```

#### 响应格式

```json
{
  "success": true,
  "data": {
    "totalPlaces": 10,
    "processedPlaces": 8,
    "successCount": 5,
    "partialCount": 2,
    "failedCount": 1,
    "requestedEvidenceTypes": ["weather", "road_closure", "opening_hours"],
    "results": [
      {
        "placeId": 1,
        "placeName": "黄金瀑布",
        "evidenceTypes": ["weather", "road_closure"],
        "status": "success",
        "fetched": {
          "weather": {
            "temperature": 5.6,
            "condition": "cloudy",
            "source": "apis.is"
          },
          "road_closure": {
            "isOpen": true,
            "riskLevel": 0,
            "source": "road.is"
          }
        }
      },
      {
        "placeId": 2,
        "placeName": "蓝湖温泉",
        "evidenceTypes": ["weather"],
        "status": "partial",
        "errors": {
          "opening_hours": "地点类别不是 ATTRACTION"
        },
        "fetched": {
          "weather": {
            "temperature": 4.2,
            "condition": "partly_cloudy",
            "source": "apis.is"
          }
        }
      },
      {
        "placeId": 3,
        "placeName": "某地点",
        "evidenceTypes": [],
        "status": "failed",
        "errors": {
          "weather": "无法获取地点坐标",
          "road_closure": "无法获取地点坐标"
        }
      }
    ]
  }
}
```

---

### POST `/api/planning-workbench/trips/:tripId/fetch-weather`

为指定行程的地点批量获取天气数据（仅天气）。

#### 路径参数

- `tripId` (string, 必需): 行程 ID

#### 查询参数

- `placeIds` (string, 可选): 指定要获取天气数据的地点 ID 列表，多个 ID 用逗号分隔。如果不提供，则处理所有缺少天气数据的地点。
- `forceRefresh` (boolean, 可选): 是否强制刷新已有天气数据。默认为 `false`，已有天气数据的地点会被跳过。

#### 请求示例

```bash
# 为所有缺少天气数据的地点获取天气
curl -X POST "http://localhost:3000/api/planning-workbench/trips/trip123/fetch-weather"

# 为指定地点获取天气数据
curl -X POST "http://localhost:3000/api/planning-workbench/trips/trip123/fetch-weather?placeIds=1,2,3"

# 强制刷新所有地点的天气数据
curl -X POST "http://localhost:3000/api/planning-workbench/trips/trip123/fetch-weather?forceRefresh=true"
```

#### 响应格式

```json
{
  "success": true,
  "data": {
    "totalPlaces": 10,
    "processedPlaces": 8,
    "successCount": 7,
    "failedCount": 1,
    "results": [
      {
        "placeId": 1,
        "placeName": "黄金瀑布",
        "status": "success",
        "weatherData": {
          "temperature": 5.6,
          "condition": "cloudy",
          "source": "apis.is"
        }
      },
      {
        "placeId": 2,
        "placeName": "黑沙滩",
        "status": "skipped"
      },
      {
        "placeId": 3,
        "placeName": "蓝湖温泉",
        "status": "failed",
        "error": "无法获取地点坐标"
      }
    ]
  }
}
```

#### 响应字段说明

- `totalPlaces`: 行程中的总地点数
- `processedPlaces`: 实际处理的地点数（排除被过滤的地点）
- `successCount`: 成功获取天气数据的地点数
- `failedCount`: 失败的地点数
- `results`: 处理结果详情数组
  - `placeId`: 地点 ID
  - `placeName`: 地点名称
  - `status`: 处理状态 (`success` | `failed` | `skipped`)
  - `error`: 错误信息（仅当 `status` 为 `failed` 时）
  - `weatherData`: 天气数据摘要（仅当 `status` 为 `success` 时）

## 功能说明

### 1. 证据类型说明

#### 天气数据 (weather)
- **数据源**: 根据坐标自动选择适配器
  - **冰岛**: 使用 `apis.is` (Iceland Weather Adapter)
  - **其他国家**: 使用 `WeatherAPI.com` 或 `OpenWeather` (按优先级降级)
- **存储位置**: `Place.metadata.weatherInfo` 和 `Place.metadata.weather`
- **包含信息**: 温度、体感温度、天气条件、风速、湿度、能见度、警报等

#### 道路封闭信息 (road_closure)
- **数据源**: 根据坐标自动选择适配器
  - **冰岛**: 使用 `road.is` API (Iceland Road Status Adapter)
  - **其他国家**: 使用默认适配器
- **存储位置**: `Place.metadata.roadStatus` 和 `Place.metadata.roadClosure`
- **包含信息**: 道路开放状态、风险等级、F-Road 信息（冰岛）、河流渡口信息（冰岛）

#### 开放时间 (opening_hours)
- **数据源**: 高德地图 POI 服务（仅限 ATTRACTION 类别）
- **存储位置**: `Place.metadata.openingHours` 或 `Place.metadata.opening_hours`
- **包含信息**: 营业时间、当前开放状态

### 2. 坐标获取策略

接口会按以下顺序尝试获取地点坐标：
1. 从 `Place.metadata.lat` 和 `Place.metadata.lng` 获取
2. 从 `Place.metadata.coordinates` 数组获取
3. 使用原始 SQL 查询 PostGIS `location` 字段

### 3. 证据数据存储

获取的证据数据会存储到 `Place.metadata` 中：

**天气数据**:
- `metadata.weatherInfo`: 结构化的天气信息
- `metadata.weather`: 完整的天气数据对象
- `metadata.weatherFetchedAt`: 获取时间戳

**道路封闭信息**:
- `metadata.roadStatus`: 结构化的路况信息
- `metadata.roadClosure`: 布尔值，表示是否封路
- `metadata.roadStatusFetchedAt`: 获取时间戳

**开放时间**:
- `metadata.openingHours`: 营业时间信息（结构化）
- `metadata.opening_hours`: 营业时间信息（兼容格式）

### 4. 跳过已有数据

默认情况下，如果地点已有对应类型的证据数据，会被跳过。使用 `forceRefresh=true` 可以强制刷新所有证据。

### 5. 部分成功处理

接口支持部分成功的情况。例如，如果某个地点成功获取了天气数据但道路封闭信息获取失败，会返回 `status: "partial"`，并在 `errors` 中记录失败的类型。

## 使用场景

### 场景 1: 准备度检查后补充所有证据 ⭐ 推荐

当准备度检查发现缺少证据覆盖时，可以调用综合接口批量补充所有类型的证据：

```bash
# 1. 获取准备度检查结果
GET /api/planning-workbench/trips/trip123/readiness

# 2. 根据检查结果，为缺少证据的地点批量获取所有证据
POST /api/planning-workbench/trips/trip123/fetch-evidence
```

### 场景 2: 前端"修复"按钮

前端可以在"修复预览"中提供"获取证据"按钮，点击后调用综合接口：

```javascript
async function fetchEvidenceForPlace(tripId, placeId, evidenceTypes = ['weather', 'road_closure', 'opening_hours']) {
  const response = await fetch(
    `/api/planning-workbench/trips/${tripId}/fetch-evidence?placeIds=${placeId}&evidenceTypes=${evidenceTypes.join(',')}`,
    { method: 'POST' }
  );
  const result = await response.json();
  return result;
}

// 示例：只获取天气数据
fetchEvidenceForPlace(tripId, placeId, ['weather']);

// 示例：获取所有证据
fetchEvidenceForPlace(tripId, placeId);
```

### 场景 3: 按类型分别获取

如果需要分别获取不同类型的证据，可以使用 `evidenceTypes` 参数：

```bash
# 只获取天气数据
POST /api/planning-workbench/trips/trip123/fetch-evidence?evidenceTypes=weather

# 只获取道路封闭信息
POST /api/planning-workbench/trips/trip123/fetch-evidence?evidenceTypes=road_closure

# 只获取开放时间
POST /api/planning-workbench/trips/trip123/fetch-evidence?evidenceTypes=opening_hours
```

### 场景 4: 定期刷新证据数据

可以设置定时任务，定期刷新行程的证据数据：

```bash
# 每天凌晨刷新所有行程的证据数据
POST /api/planning-workbench/trips/{tripId}/fetch-evidence?forceRefresh=true
```

## 错误处理

### 常见错误

1. **无法获取地点坐标**
   - 原因: Place 没有坐标信息（metadata 和 location 字段都为空）
   - 处理: 需要先补充地点的坐标信息
   - 影响: 天气和道路封闭信息无法获取，但开放时间可能仍可通过地点名称获取

2. **天气 API 调用失败**
   - 原因: 天气数据源 API 不可用或配额用尽
   - 处理: 系统会自动降级到下一个可用的数据源
   - 影响: 仅影响天气数据，其他证据类型不受影响

3. **道路封闭信息获取失败**
   - 原因: 路况 API 不可用或该地区不支持路况查询
   - 处理: 会记录错误但继续处理其他证据类型
   - 影响: 仅影响道路封闭信息，其他证据类型不受影响

4. **开放时间获取失败**
   - 原因: 地点类别不是 `ATTRACTION`，或高德地图 API 不可用
   - 处理: 会记录错误但继续处理其他证据类型
   - 影响: 仅影响开放时间，其他证据类型不受影响

5. **行程不存在**
   - 原因: `tripId` 无效
   - 处理: 检查 `tripId` 是否正确

## 注意事项

1. **API 调用频率**: 批量获取证据数据会调用多个外部 API，请注意 API 配额限制
2. **数据缓存**: 
   - 天气数据会缓存 30 分钟
   - 道路封闭信息建议每小时刷新一次
   - 开放时间数据相对稳定，建议每天刷新一次
3. **坐标精度**: 确保地点的坐标信息准确，否则可能获取到错误的天气或路况数据
4. **异步处理**: 对于大量地点，建议使用异步处理或分批处理
5. **开放时间限制**: 开放时间获取仅支持 `ATTRACTION` 类别的地点，其他类别会跳过
6. **部分成功**: 接口支持部分成功，即使某些证据类型获取失败，其他类型仍会正常处理

## 相关接口

- `GET /api/planning-workbench/trips/:tripId/readiness`: 获取准备度检查结果
- `GET /api/readiness/trip/:tripId/coverage-map`: 获取覆盖地图数据
- `GET /api/weather/current`: 获取单个地点的当前天气（不更新数据库）
- `POST /api/planning-workbench/trips/:tripId/fetch-evidence`: ⭐ 综合证据获取接口（推荐）
- `POST /api/planning-workbench/trips/:tripId/fetch-weather`: 仅获取天气数据
