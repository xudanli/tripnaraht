# 冰岛信息源 API 文档

本模块提供冰岛官方信息源的API接口，包括：
- **vedur.is** - 冰岛气象局天气预报
- **safetravel.is** - 冰岛旅行安全信息
- **road.is** - 冰岛道路管理局F路路况

## 基础路径

所有接口都在 `/iceland-info` 路径下。

## 接口列表

### 1. 获取高地天气预报

**接口**: `GET /iceland-info/weather`

**描述**: 从vedur.is获取冰岛高地区域的天气预报数据。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| region | string | 否 | 高地区域 | `centralhighlands`, `southhighlands`, `northhighlands` |
| lat | number | 否 | 纬度 | `64.5` |
| lng | number | 否 | 经度 | `-18.5` |
| includeWindDetails | boolean | 否 | 是否包含详细风速信息 | `true` |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "station": {
      "id": "highland-centralhighlands",
      "name": "Central Highlands",
      "lat": 64.5,
      "lng": -18.5,
      "elevation": 800
    },
    "current": {
      "datetime": "2026-01-29T12:00:00Z",
      "temperature": 5.2,
      "windSpeed": 8.5,
      "windDirection": 180,
      "windSpeedKmh": 30.6,
      "precipitation": 15,
      "condition": "cloudy",
      "visibility": 10000
    },
    "forecast": [
      {
        "datetime": "2026-01-30T00:00:00Z",
        "temperature": 4.8,
        "windSpeed": 9.2,
        "windDirection": 185,
        "windSpeedKmh": 33.12,
        "precipitation": 20,
        "condition": "rainy",
        "visibility": 8000
      }
      // ... 更多预报数据（6天）
    ],
    "lastUpdated": "2026-01-29T12:00:00Z",
    "source": "vedur.is"
  }
}
```

**使用示例**:

```bash
# 获取中央高地天气预报
curl "http://localhost:3000/iceland-info/weather?region=centralhighlands"

# 获取指定坐标的天气预报
curl "http://localhost:3000/iceland-info/weather?lat=64.5&lng=-18.5&includeWindDetails=true"
```

---

### 2. 获取安全信息和旅行条件

**接口**: `GET /iceland-info/safety`

**描述**: 从safetravel.is获取安全警报和旅行条件信息。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| region | string | 否 | 区域过滤 | `highlands`, `central-highlands` |
| alertType | string | 否 | 警报类型过滤 | `weather`, `road`, `travel`, `general` |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "alert-1",
        "title": "高地强风警告",
        "description": "中央高地区域预计有强风，风速可能超过15m/s，建议推迟出行。",
        "type": "weather",
        "severity": "high",
        "effectiveTime": "2026-01-29T10:00:00Z",
        "expiryTime": "2026-01-30T10:00:00Z",
        "regions": ["highlands", "central-highlands"],
        "fRoads": ["F26", "F208"]
      }
    ],
    "travelConditions": [
      {
        "region": "highlands",
        "roadStatus": "caution",
        "weatherStatus": "fair",
        "overallStatus": "yellow",
        "description": "高地路况一般，部分F路需要谨慎驾驶",
        "lastUpdated": "2026-01-29T12:00:00Z"
      }
    ],
    "lastUpdated": "2026-01-29T12:00:00Z"
  }
}
```

**使用示例**:

```bash
# 获取所有安全信息
curl "http://localhost:3000/iceland-info/safety"

# 获取高地区域的安全信息
curl "http://localhost:3000/iceland-info/safety?region=highlands"

# 获取天气相关警报
curl "http://localhost:3000/iceland-info/safety?alertType=weather"
```

---

### 3. 获取F路路况信息

**接口**: `GET /iceland-info/road-conditions`

**描述**: 从road.is获取F路的路况和开放状态信息。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| fRoads | string | 否 | F路编号过滤（多个用逗号分隔） | `F208,F26,F910` |
| status | string | 否 | 状态过滤 | `open`, `closed`, `caution`, `impassable` |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "fRoads": [
      {
        "id": "f208",
        "name": "F208 Landmannalaugar",
        "fRoadNumber": "F208",
        "startPoint": {
          "lat": 63.9330,
          "lng": -21.0023
        },
        "endPoint": {
          "lat": 63.9930,
          "lng": -19.0618
        },
        "status": "open",
        "condition": "dry",
        "isOpen": true,
        "description": "F208开放，路况良好",
        "lastUpdated": "2026-01-29T12:00:00Z"
      },
      {
        "id": "f225",
        "name": "F225 Landmannalaugar - Þórsmörk",
        "fRoadNumber": "F225",
        "startPoint": {
          "lat": 63.9930,
          "lng": -19.0618
        },
        "endPoint": {
          "lat": 63.6800,
          "lng": -19.4800
        },
        "status": "caution",
        "condition": "wet",
        "isOpen": true,
        "description": "F225开放，但需要谨慎驾驶，部分路段湿滑",
        "lastUpdated": "2026-01-29T12:00:00Z"
      }
    ],
    "lastUpdated": "2026-01-29T12:00:00Z",
    "source": "road.is"
  }
}
```

**使用示例**:

```bash
# 获取所有F路路况
curl "http://localhost:3000/iceland-info/road-conditions"

# 获取指定F路的路况
curl "http://localhost:3000/iceland-info/road-conditions?fRoads=F208,F26,F910"

# 获取需要谨慎驾驶的F路
curl "http://localhost:3000/iceland-info/road-conditions?status=caution"
```

---

## 缓存策略

所有接口都支持缓存，缓存时间如下：

- **天气预报**: 1小时（3600秒）
- **安全信息**: 30分钟（1800秒）
- **路况信息**: 15分钟（900秒）

缓存键格式：
- 天气预报: `iceland-weather:{region}:{lat}:{lng}`
- 安全信息: `iceland-safety:{region}:{alertType}`
- 路况信息: `iceland-roads:{fRoads}:{status}`

## 错误处理

所有接口都遵循统一的错误响应格式：

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "获取天气数据失败: ..."
  }
}
```

## 注意事项

1. **API可用性**: 由于这些是冰岛官方服务，可能没有公开的REST API端点。当前实现会：
   - 首先尝试调用可能的API端点
   - 如果API不可用，返回模拟数据（标记为 `mock`）
   - 日志中会记录API调用失败的情况

2. **数据更新**: 
   - 模拟数据会定期更新，但实际数据需要依赖官方API
   - 建议在生产环境中配置实际的API端点或使用web scraping

3. **高地区域**: 
   - `centralhighlands` - 中央高地（Sprengisandur等）
   - `southhighlands` - 南部高地（Landmannalaugar等）
   - `northhighlands` - 北部高地（Askja等）

## 集成示例

### 在路线规划中使用

```typescript
// 检查F路是否开放
const roadConditions = await roadService.getRoadConditions({
  fRoads: 'F208,F26',
});

const isAllOpen = roadConditions.fRoads.every(road => road.isOpen);
if (!isAllOpen) {
  // 提示用户部分F路未开放
}

// 检查天气条件
const weather = await vedurService.getHighlandWeather({
  region: HighlandRegion.CENTRAL_HIGHLANDS,
});

if (weather.current.windSpeed > 15) {
  // 风速过高，建议推迟出行
}

// 检查安全警报
const safety = await safetravelService.getSafetyInfo({
  region: 'highlands',
  alertType: AlertType.WEATHER,
});

if (safety.alerts.some(alert => alert.severity === 'critical')) {
  // 有严重警报，建议取消行程
}
```

## 相关POI

这些接口与之前导入的高地F路POI数据配合使用：

- 查询信息源POI: `GET /places?metadata.subCategory=INFO_SOURCE`
- 查询F路节点POI: `GET /places?metadata.subCategory=F_ROAD_NODE`
- 查询河流穿越POI: `GET /places?metadata.subCategory=RIVER_CROSSING`

## 未来改进

1. **实际API集成**: 联系官方获取API访问权限或实现web scraping
2. **数据同步**: 定期同步官方数据到本地数据库
3. **推送通知**: 当路况或天气变化时推送通知
4. **历史数据**: 保存历史数据用于分析和预测
