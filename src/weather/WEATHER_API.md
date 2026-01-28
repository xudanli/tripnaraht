# 天气 API 文档

## 概述

天气 API 提供全球天气数据查询服务。系统会根据查询位置自动选择最合适的数据源适配器：

- **冰岛 (IS)**: 使用 `apis.is`（冰岛官方开放数据平台）
- **其他国家**: 使用 `WeatherAPI.com`（如果配置了 API Key）或 `OpenWeather`（默认）

## 端点

### GET /api/weather/current

获取指定位置的当前天气数据。

#### 请求参数

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `lat` | number | 是 | 纬度（-90 到 90） | `64.1466` |
| `lng` | number | 是 | 经度（-180 到 180） | `-21.9426` |
| `includeWindDetails` | boolean | 否 | 是否包含详细风速信息（冰岛特定） | `true` |
| `includeAuroraInfo` | boolean | 否 | 是否包含极光信息（冰岛特定） | `false` |

#### 响应格式

```json
{
  "success": true,
  "data": {
    "temperature": 5.6,
    "condition": "cloudy",
    "windSpeed": 8,
    "windDirection": 22.5,
    "humidity": 58,
    "visibility": 10000,
    "alerts": [
      {
        "type": "wind",
        "severity": "warning",
        "title": "强风警告",
        "description": "阵风速度 18 m/s，请注意安全",
        "effectiveTime": "2026-01-28T12:00:00Z"
      }
    ],
    "lastUpdated": "2026-01-28T12:00:00Z",
    "source": "apis.is",
    "metadata": {
      "stationName": "Reykjavík",
      "stationId": "1",
      "windGust": 18,
      "maxWindSpeed": 9,
      "pressure": 1003,
      "cloudCover": 80,
      "dewPoint": -2.0,
      "precipitation": 0.1
    }
  }
}
```

#### 响应字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `temperature` | number | 温度（摄氏度） |
| `condition` | string | 天气状况（sunny, cloudy, rainy, snowy, stormy, foggy, hazy, windy） |
| `windSpeed` | number | 风速（米/秒） |
| `windDirection` | number | 风向（度，0-360，0=北，90=东，180=南，270=西） |
| `humidity` | number | 湿度（百分比，0-100） |
| `visibility` | number | 能见度（米） |
| `alerts` | array | 天气警告列表 |
| `alerts[].type` | string | 警告类型（wind, visibility, cold, heat） |
| `alerts[].severity` | string | 严重程度（info, warning, critical） |
| `alerts[].title` | string | 警告标题 |
| `alerts[].description` | string | 警告描述 |
| `alerts[].effectiveTime` | string | 生效时间（ISO 8601） |
| `lastUpdated` | string | 数据最后更新时间（ISO 8601） |
| `source` | string | 数据源标识（apis.is, weatherapi, openweather） |
| `metadata` | object | 额外元数据（数据源特定） |

#### 冰岛特定字段（`includeWindDetails=true`）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `windGust` | number | 最大阵风速度（米/秒）- 冰岛车门被吹掉的主因 |
| `cloudCover` | number | 云层覆盖（百分比） |

#### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "经纬度必须是有效数字"
  }
}
```

#### 错误码

| 错误码 | 说明 |
|--------|------|
| `VALIDATION_ERROR` | 参数验证失败 |
| `INTERNAL_ERROR` | 服务器内部错误 |

## 使用示例

### 示例 1: 查询冰岛雷克雅未克天气

```bash
curl "http://localhost:3000/api/weather/current?lat=64.1466&lng=-21.9426&includeWindDetails=true"
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "temperature": 5.6,
    "condition": "cloudy",
    "windSpeed": 8,
    "windGust": 18,
    "windDirection": 22.5,
    "humidity": 58,
    "visibility": 10000,
    "source": "apis.is",
    "metadata": {
      "stationName": "Reykjavík",
      "stationId": "1"
    }
  }
}
```

### 示例 2: 查询北京天气

```bash
curl "http://localhost:3000/api/weather/current?lat=39.9042&lng=116.4074"
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "temperature": 15,
    "condition": "sunny",
    "windSpeed": 3.5,
    "windDirection": 180,
    "humidity": 45,
    "visibility": 15000,
    "source": "weatherapi",
    "metadata": {
      "weatherapiLocation": {
        "name": "Beijing",
        "region": "Beijing",
        "country": "China"
      }
    }
  }
}
```

## 数据源适配器

### 1. apis.is（冰岛）

**优先级**: 10（最高）

**支持国家**: 仅冰岛 (IS)

**数据来源**: Icelandic Meteorological Office (Vedur.is)

**特性**:
- ✅ 实时天气观测数据（每小时更新）
- ✅ 详细风速和阵风数据
- ✅ 自动选择最近的观测站
- ✅ 自动生成天气警告

**观测站**:
- Reykjavík (1) - 雷克雅未克
- Akureyri (422) - 阿克雷里
- Egilsstaðir (30) - 埃伊尔斯塔济
- Vestmannaeyjar (1480) - 韦斯特曼纳群岛
- Höfn (1479) - 赫本

**API 文档**: https://docs.apis.is/#endpoint-weather

### 2. WeatherAPI.com

**优先级**: 50（中等）

**支持国家**: 全球所有国家

**配置要求**: 需要在 `.env` 中设置 `WEATHERAPI_API_KEY`

**特性**:
- ✅ 实时天气数据
- ✅ 空气质量数据（AQI）
- ✅ 自动生成天气警告（高温、低温、强风、低能见度）
- ✅ UV 指数、气压、体感温度

**API 文档**: https://www.weatherapi.com/docs/

**免费计划**:
- 100万次调用/月
- 实时天气
- 3天预报
- 历史天气数据

### 3. OpenWeather（默认）

**优先级**: 100（最低）

**支持国家**: 全球所有国家

**配置要求**: 需要在 `.env` 中设置 `OPENWEATHER_API_KEY`

**特性**:
- ✅ 实时天气数据
- ✅ 基础天气信息

**API 文档**: https://openweathermap.org/api

## 适配器选择逻辑

系统按以下优先级自动选择适配器：

1. **特定国家适配器**（优先级 10）
   - 冰岛 → `apis.is`

2. **WeatherAPI 适配器**（优先级 50）
   - 如果配置了 `WEATHERAPI_API_KEY`，优先使用

3. **默认适配器**（优先级 100）
   - `OpenWeather`（如果配置了 `OPENWEATHER_API_KEY`）

## 天气条件映射

| 标准格式 | apis.is | WeatherAPI.com | OpenWeather |
|---------|---------|----------------|-------------|
| `sunny` | Clear sky | Sunny, Clear | Clear |
| `cloudy` | Cloudy, Partly cloudy | Partly cloudy, Cloudy | Clouds |
| `rainy` | Rain, Light rain | Rain, Drizzle | Rain |
| `snowy` | Snow, Light snow | Snow, Blizzard | Snow |
| `stormy` | Thunderstorm | Thunderstorm | Thunderstorm |
| `foggy` | Mist, Fog | Mist, Fog | Mist, Fog |
| `hazy` | Haze | Haze | Haze |
| `windy` | Windy | Windy | Windy |

## 天气警告规则

### 冰岛（apis.is）

- **极端强风警告**: 阵风 > 25 m/s（严重）
- **强风警告**: 阵风 > 18 m/s（警告）
- **低能见度警告**: 能见度 < 1 km
- **低温警告**: 温度 < -10°C

### WeatherAPI.com

- **高温警告**: 温度 > 35°C
- **低温警告**: 温度 < -10°C
- **强风警告**: 风速 > 15 m/s（警告）或 > 25 m/s（严重）
- **低能见度警告**: 能见度 < 1 km

## 配置说明

### 环境变量

在 `.env` 文件中配置：

```bash
# WeatherAPI.com（推荐，支持全球）
WEATHERAPI_API_KEY=your_api_key_here

# OpenWeather（备用）
OPENWEATHER_API_KEY=your_api_key_here
```

### 获取 API Key

**WeatherAPI.com**:
1. 访问 https://www.weatherapi.com/
2. 注册账号并获取 API Key
3. 免费计划：100万次调用/月

**OpenWeather**:
1. 访问 https://openweathermap.org/api
2. 注册账号并获取 API Key
3. 免费计划：60次调用/分钟

## Swagger 文档

访问 Swagger UI 查看完整的 API 文档：

```
http://localhost:3000/api-docs
```

在 Swagger UI 中找到 `Weather` 标签页，可以：
- 查看完整的 API 文档
- 在线测试接口
- 查看请求/响应示例

## 故障排除

### 问题：返回默认值（温度 0°C，天气 unknown）

**原因**:
1. API Key 未配置或无效
2. API 调用失败（网络问题、配额用尽等）

**解决**:
1. 检查 `.env` 文件中是否设置了正确的 API Key
2. 查看应用日志中的错误信息
3. 验证 API Key 是否有效
4. 检查 API 调用配额

### 问题：冰岛天气数据不完整

**原因**: apis.is API 可能暂时不可用或观测站数据缺失

**解决**:
1. 检查 apis.is 服务状态
2. 查看应用日志中的错误信息
3. 系统会自动降级到其他适配器（如果可用）

### 问题：接口返回 404

**原因**: 路径错误或模块未正确注册

**解决**:
1. 确认路径为 `/api/weather/current`
2. 检查 `WeatherModule` 是否在 `app.module.ts` 中注册
3. 重启应用

## 相关文件

- 控制器: `src/weather/weather.controller.ts`
- 模块: `src/weather/weather.module.ts`
- 适配器接口: `src/data-contracts/adapters/weather.adapter.interface.ts`
- 天气接口: `src/data-contracts/interfaces/weather.interface.ts`
- apis.is 适配器: `src/data-contracts/adapters/iceland-weather.adapter.ts`
- WeatherAPI.com 适配器: `src/data-contracts/adapters/weatherapi.adapter.ts`
- 数据源路由器: `src/data-contracts/services/data-source-router.service.ts`

## 参考文档

- apis.is 文档: https://docs.apis.is/#endpoint-weather
- WeatherAPI.com 文档: https://www.weatherapi.com/docs/
- OpenWeather 文档: https://openweathermap.org/api
