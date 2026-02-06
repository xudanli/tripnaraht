# Weather MCP 服务集成指南

## 📋 概述

本文档说明如何集成天气查询功能到项目中。项目提供了两种方式：

1. **Weather Direct API**（推荐）⭐ - 直接使用 Open-Meteo API，**无需安装 Python**
2. Weather MCP Server（可选）- 使用 Python MCP 服务器

### 服务信息

- **服务名称**: Weather Direct Service
- **API**: Open-Meteo API（免费，无需 API Key）
- **服务类型**: 直接 HTTP API 调用
- **功能**: 获取实时天气信息和天气预报

---

## ✅ 推荐方式：Weather Direct API（无需 Python）

项目已实现直接调用 Open-Meteo API 的服务，**无需安装 Python**。

### 优势

- ✅ **无需 Python**: 纯 TypeScript/Node.js 实现
- ✅ **无需 API Key**: Open-Meteo API 免费使用
- ✅ **更稳定**: 不依赖外部 Python 进程
- ✅ **更快速**: 直接 HTTP 调用，无进程启动开销

## 🔧 使用方式

### 方式 1: 在 Cursor 中使用（推荐）⭐

Weather 工具已经集成到 MCP Skills Server 中，重启 Cursor 后即可使用（**无需安装 Python**）：

1. **获取当前天气**:
   ```
   获取纽约的当前天气
   ```

2. **获取天气预报**:
   ```
   获取东京从 2026-02-07 到 2026-02-10 的天气预报
   ```

3. **获取当前时间**:
   ```
   获取上海时区的当前时间
   ```

---

## 🛠️ 可用工具列表

Weather MCP 服务器提供以下工具：

### weather.getCurrentWeather

获取指定城市的当前天气信息。

**参数**:
- `city` (必需): 城市名称，例如 "New York", "Beijing", "Tokyo"

**返回**:
- 当前天气信息，包括温度、天气描述等

### weather.getWeatherByDatetimeRange

获取指定城市在日期范围内的天气数据。

**参数**:
- `city` (必需): 城市名称
- `start_date` (必需): 开始日期，格式 YYYY-MM-DD
- `end_date` (必需): 结束日期，格式 YYYY-MM-DD

**返回**:
- 日期范围内的天气数据

### weather.getCurrentDateTime

获取指定时区的当前日期时间。

**参数**:
- `timezone` (可选): 时区，例如 "America/New_York", "Asia/Shanghai", "Europe/London"

**返回**:
- 当前日期时间

---

## 💡 使用场景

### 场景 1: 行程规划中的天气检查

在生成行程时，检查目的地的天气：

```typescript
async function checkDestinationWeather(city: string) {
  const client = getWeatherClient();
  await client.connect();
  
  const weather = await client.getCurrentWeather({ city });
  
  await client.disconnect();
  return weather;
}
```

### 场景 2: 多日天气预报

获取行程期间的天气预报：

```typescript
async function getTripWeatherForecast(city: string, startDate: string, endDate: string) {
  const client = getWeatherClient();
  await client.connect();
  
  const forecast = await client.getWeatherByDatetimeRange({
    city,
    start_date: startDate,
    end_date: endDate,
  });
  
  await client.disconnect();
  return forecast;
}
```

### 场景 3: 时区查询

获取目的地的当前时间：

```typescript
async function getDestinationTime(timezone: string) {
  const client = getWeatherClient();
  await client.connect();
  
  const dateTime = await client.getCurrentDateTime({ timezone });
  
  await client.disconnect();
  return dateTime;
}
```

---

## 🧪 测试连接

### 测试方法 1: 使用测试脚本

运行测试脚本验证集成（**无需 Python**）：

```bash
npm run mcp:test:weather
```

### 测试方法 2: HTTP API 测试

```bash
# 健康检查
curl http://localhost:3000/api/weather-direct/health

# 获取当前天气
curl "http://localhost:3000/api/weather-direct/current?city=New%20York"

# 获取天气预报
curl "http://localhost:3000/api/weather-direct/forecast?city=Tokyo&start_date=2026-02-07&end_date=2026-02-10"
```

### 测试方法 3: 在 Cursor 中测试

1. 重启 Cursor
2. 在对话中询问："获取纽约的当前天气"
3. 如果成功返回天气信息，说明连接正常

---

## ⚠️ 注意事项

1. **无需认证**: Weather Direct Service 使用 Open-Meteo API，无需 API Key
2. **无需 Python**: 直接使用 HTTP API，不需要安装 Python 或任何 Python 包
3. **网络连接**: 需要稳定的网络连接访问 Open-Meteo API
4. **城市名称**: 使用英文城市名称效果最好
5. **数据源**: 使用 Open-Meteo API，免费且无需注册

---

## 🔄 备选方案：Python MCP Server（不推荐）

如果您想使用 Python MCP Server（需要安装 Python），可以参考以下文件：

- `src/mcp/weather-client.ts` - Python MCP 客户端（已创建但未使用）
- `scripts/test-weather-mcp.ts` - Python MCP 测试脚本

**注意**: 项目默认使用 Weather Direct API，无需 Python。

---

## 📊 与现有 Weather Skill 对比

项目已有 `tripnara.weather.search` Skill，Weather MCP 工具提供补充：

| 特性 | Weather MCP | Weather Skill |
|------|-------------|---------------|
| **数据源** | Open-Meteo API | 多个适配器（WeatherAPI, OpenWeatherMap 等） |
| **认证** | 无需 API Key | 需要 API Key（某些适配器） |
| **功能** | 城市天气查询 | 坐标天气查询 + 更多功能 |
| **使用场景** | 简单城市天气查询 | 复杂天气查询（包括风速、极光等） |

**建议**: 
- Weather MCP 用于简单的城市天气查询（无需配置）
- Weather Skill 用于复杂的天气查询（需要坐标、特殊需求）

---

## 📚 相关资源

- [Weather Direct API 接口文档](./WEATHER_DIRECT_API.md) - 完整的 API 接口文档
- [Open-Meteo API 文档](https://open-meteo.com/en/docs)
- [Open-Meteo 地理编码 API](https://open-meteo.com/en/docs/geocoding-api)

---

## 🔄 更新日志

- **2026-02-06**: 初始版本，添加 Weather Direct API 集成（无需 Python）
- **2026-02-06**: 添加 Python MCP Server 备选方案说明
