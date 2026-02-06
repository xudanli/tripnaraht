# Weather Direct API 接口文档

## 📋 概述

Weather Direct API 提供天气查询功能，直接使用 Open-Meteo API（免费，无需 API Key）。

**基础 URL**: `/api/weather-direct`

**特点**:
- ✅ 无需 API Key
- ✅ 免费使用
- ✅ 全球覆盖
- ✅ 实时天气和预报数据

---

## 🔗 API 端点

### 1. 健康检查

检查服务是否可用。

**端点**: `GET /api/weather-direct/health`

**请求参数**: 无

**响应示例**:
```json
{
  "status": "ok",
  "service": "Weather Direct Service",
  "available": true,
  "api": "Open-Meteo API"
}
```

**状态码**:
- `200 OK` - 服务正常

---

### 2. 获取当前天气

获取指定城市的当前天气信息。

**端点**: `GET /api/weather-direct/current`

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `city` | string | 是 | 城市名称（英文） | `New York`, `Tokyo`, `Beijing` |

**请求示例**:
```bash
curl "http://localhost:3000/api/weather-direct/current?city=New%20York"
```

**响应示例**:
```json
{
  "city": "New York",
  "country": "United States",
  "latitude": 40.71427,
  "longitude": -74.00597,
  "timezone": "America/New_York",
  "current": {
    "time": "2026-02-06T12:00",
    "temperature": -2.1,
    "apparent_temperature": -6,
    "humidity": 66,
    "weather_code": 3,
    "weather_description": "Overcast",
    "wind_speed": 5.8,
    "wind_direction": 360
  },
  "units": {
    "temperature": "°C",
    "wind_speed": "km/h"
  }
}
```

**响应字段说明**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `city` | string | 城市名称 |
| `country` | string | 国家名称 |
| `latitude` | number | 纬度 |
| `longitude` | number | 经度 |
| `timezone` | string | 时区 |
| `current.time` | string | 当前时间（ISO 8601 格式） |
| `current.temperature` | number | 当前温度（摄氏度） |
| `current.apparent_temperature` | number | 体感温度（摄氏度） |
| `current.humidity` | number | 相对湿度（百分比） |
| `current.weather_code` | number | 天气代码（WMO 标准） |
| `current.weather_description` | string | 天气描述 |
| `current.wind_speed` | number | 风速（公里/小时） |
| `current.wind_direction` | number | 风向（度，0-360） |
| `units.temperature` | string | 温度单位 |
| `units.wind_speed` | string | 风速单位 |

**天气代码说明** (WMO Weather interpretation codes):

| 代码 | 描述 | 图标 |
|------|------|------|
| 0 | Clear sky | ☀️ |
| 1 | Mainly clear | 🌤️ |
| 2 | Partly cloudy | ⛅ |
| 3 | Overcast | ☁️ |
| 45 | Foggy | 🌫️ |
| 48 | Depositing rime fog | 🌫️ |
| 51-55 | Drizzle (various intensities) | 🌦️ |
| 56-57 | Freezing drizzle | 🌨️ |
| 61-65 | Rain (various intensities) | 🌧️ |
| 66-67 | Freezing rain | 🌨️ |
| 71-75 | Snow fall (various intensities) | ❄️ |
| 77 | Snow grains | ❄️ |
| 80-82 | Rain showers (various intensities) | 🌦️ |
| 85-86 | Snow showers | 🌨️ |
| 95 | Thunderstorm | ⛈️ |
| 96-99 | Thunderstorm with hail | ⛈️ |

**状态码**:
- `200 OK` - 成功
- `400 Bad Request` - 缺少必需参数
- `404 Not Found` - 城市未找到
- `500 Internal Server Error` - 服务器错误

**错误响应示例**:
```json
{
  "error": "City parameter is required"
}
```

```json
{
  "error": "Failed to geocode city \"InvalidCity\": City \"InvalidCity\" not found"
}
```

---

### 3. 获取天气预报

获取指定城市在日期范围内的天气预报数据。

**端点**: `GET /api/weather-direct/forecast`

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `city` | string | 是 | 城市名称（英文） | `Tokyo`, `Paris`, `London` |
| `start_date` | string | 是 | 开始日期（YYYY-MM-DD） | `2026-02-07` |
| `end_date` | string | 是 | 结束日期（YYYY-MM-DD） | `2026-02-10` |

**请求示例**:
```bash
curl "http://localhost:3000/api/weather-direct/forecast?city=Tokyo&start_date=2026-02-07&end_date=2026-02-10"
```

**响应示例**:
```json
{
  "city": "Tokyo",
  "country": "Japan",
  "latitude": 35.6895,
  "longitude": 139.69171,
  "timezone": "Asia/Tokyo",
  "start_date": "2026-02-07",
  "end_date": "2026-02-10",
  "hourly": [
    {
      "time": "2026-02-07T00:00",
      "temperature": 4.1,
      "weather_code": 1,
      "weather_description": "Mainly clear",
      "precipitation": 0,
      "wind_speed": 7.9
    },
    {
      "time": "2026-02-07T01:00",
      "temperature": 3.7,
      "weather_code": 1,
      "weather_description": "Mainly clear",
      "precipitation": 0,
      "wind_speed": 7.9
    }
    // ... 更多小时数据
  ],
  "summary": {
    "min_temperature": -3.2,
    "max_temperature": 11.5,
    "avg_temperature": 2.73,
    "total_precipitation": 2.9
  }
}
```

**响应字段说明**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `city` | string | 城市名称 |
| `country` | string | 国家名称 |
| `latitude` | number | 纬度 |
| `longitude` | number | 经度 |
| `timezone` | string | 时区 |
| `start_date` | string | 开始日期 |
| `end_date` | string | 结束日期 |
| `hourly` | array | 每小时天气数据数组 |
| `hourly[].time` | string | 时间（ISO 8601 格式） |
| `hourly[].temperature` | number | 温度（摄氏度） |
| `hourly[].weather_code` | number | 天气代码 |
| `hourly[].weather_description` | string | 天气描述 |
| `hourly[].precipitation` | number | 降水量（毫米） |
| `hourly[].wind_speed` | number | 风速（公里/小时） |
| `summary.min_temperature` | number | 最低温度 |
| `summary.max_temperature` | number | 最高温度 |
| `summary.avg_temperature` | number | 平均温度 |
| `summary.total_precipitation` | number | 总降水量 |

**状态码**:
- `200 OK` - 成功
- `400 Bad Request` - 缺少必需参数或日期格式错误
- `404 Not Found` - 城市未找到
- `500 Internal Server Error` - 服务器错误

**错误响应示例**:
```json
{
  "error": "City, start_date, and end_date parameters are required"
}
```

```json
{
  "error": "Failed to geocode city \"InvalidCity\": City \"InvalidCity\" not found"
}
```

---

### 4. 获取当前日期时间

获取指定时区的当前日期时间。

**端点**: `GET /api/weather-direct/datetime`

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `timezone` | string | 否 | IANA 时区名称 | `Asia/Shanghai`, `America/New_York`, `Europe/London` |

**注意**: 如果不提供 `timezone` 参数，默认使用 UTC。

**请求示例**:
```bash
# 获取上海时区的当前时间
curl "http://localhost:3000/api/weather-direct/datetime?timezone=Asia/Shanghai"

# 获取 UTC 时间（不提供 timezone 参数）
curl "http://localhost:3000/api/weather-direct/datetime"
```

**响应示例**:
```json
{
  "timezone": "Asia/Shanghai",
  "current_time": "2026-02-07T01:09:59",
  "utc_time": "2026-02-06T17:09:59.524Z",
  "timestamp": 1770397799524
}
```

**响应字段说明**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `timezone` | string | 时区名称 |
| `current_time` | string | 当前时间（ISO 8601 格式，本地时区） |
| `utc_time` | string | UTC 时间（ISO 8601 格式） |
| `timestamp` | number | Unix 时间戳（毫秒） |

**常用时区示例**:

| 时区 | 说明 |
|------|------|
| `Asia/Shanghai` | 中国标准时间（UTC+8） |
| `Asia/Tokyo` | 日本标准时间（UTC+9） |
| `America/New_York` | 美国东部时间 |
| `America/Los_Angeles` | 美国西部时间 |
| `Europe/London` | 英国时间 |
| `Europe/Paris` | 法国时间 |
| `UTC` | 协调世界时 |

**状态码**:
- `200 OK` - 成功
- `400 Bad Request` - 时区格式错误
- `500 Internal Server Error` - 服务器错误

**错误响应示例**:
```json
{
  "error": "Invalid timezone: Invalid/Timezone"
}
```

---

## 📝 使用示例

### JavaScript/TypeScript

```typescript
// 获取当前天气
async function getCurrentWeather(city: string) {
  const response = await fetch(
    `http://localhost:3000/api/weather-direct/current?city=${encodeURIComponent(city)}`
  );
  return await response.json();
}

// 获取天气预报
async function getForecast(city: string, startDate: string, endDate: string) {
  const response = await fetch(
    `http://localhost:3000/api/weather-direct/forecast?city=${encodeURIComponent(city)}&start_date=${startDate}&end_date=${endDate}`
  );
  return await response.json();
}

// 获取当前时间
async function getCurrentDateTime(timezone?: string) {
  const url = timezone
    ? `http://localhost:3000/api/weather-direct/datetime?timezone=${encodeURIComponent(timezone)}`
    : 'http://localhost:3000/api/weather-direct/datetime';
  const response = await fetch(url);
  return await response.json();
}

// 使用示例
const weather = await getCurrentWeather('New York');
console.log(`当前温度: ${weather.current.temperature}°C`);
console.log(`天气: ${weather.current.weather_description}`);
```

### Python

```python
import requests

# 获取当前天气
def get_current_weather(city: str):
    url = f"http://localhost:3000/api/weather-direct/current"
    params = {"city": city}
    response = requests.get(url, params=params)
    return response.json()

# 获取天气预报
def get_forecast(city: str, start_date: str, end_date: str):
    url = f"http://localhost:3000/api/weather-direct/forecast"
    params = {
        "city": city,
        "start_date": start_date,
        "end_date": end_date
    }
    response = requests.get(url, params=params)
    return response.json()

# 使用示例
weather = get_current_weather("Tokyo")
print(f"当前温度: {weather['current']['temperature']}°C")
print(f"天气: {weather['current']['weather_description']}")
```

### cURL

```bash
# 获取纽约的当前天气
curl "http://localhost:3000/api/weather-direct/current?city=New%20York"

# 获取东京的天气预报（2026-02-07 到 2026-02-10）
curl "http://localhost:3000/api/weather-direct/forecast?city=Tokyo&start_date=2026-02-07&end_date=2026-02-10"

# 获取上海时区的当前时间
curl "http://localhost:3000/api/weather-direct/datetime?timezone=Asia/Shanghai"
```

---

## ⚠️ 注意事项

1. **城市名称**: 使用英文城市名称效果最好，例如 `New York`, `Tokyo`, `Beijing`
2. **日期格式**: 日期必须使用 `YYYY-MM-DD` 格式（ISO 8601）
3. **时区格式**: 时区必须使用 IANA 时区名称（例如 `Asia/Shanghai`）
4. **网络连接**: 需要稳定的网络连接访问 Open-Meteo API
5. **速率限制**: Open-Meteo API 有速率限制，请合理使用
6. **数据更新**: 天气数据每小时更新一次

---

## 🔗 相关资源

- [Open-Meteo API 文档](https://open-meteo.com/en/docs)
- [Open-Meteo 地理编码 API](https://open-meteo.com/en/docs/geocoding-api)
- [IANA 时区数据库](https://www.iana.org/time-zones)
- [Weather Direct Service 源码](../src/mcp/weather-direct.service.ts)
- [Weather Direct Controller 源码](../src/mcp/weather-direct.controller.ts)

---

## 📊 响应时间

典型响应时间：
- 健康检查: < 10ms
- 获取当前天气: 200-500ms
- 获取天气预报: 300-800ms
- 获取当前时间: < 10ms

---

## 🔄 更新日志

- **2026-02-06**: 初始版本，添加 Weather Direct API 文档
