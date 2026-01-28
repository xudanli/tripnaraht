# WeatherAPI.com 适配器使用说明

## 概述

`WeatherApiAdapter` 是一个天气数据适配器，使用 [WeatherAPI.com](https://www.weatherapi.com/) 作为天气数据源。

## 特性

- ✅ 支持全球所有国家
- ✅ 实时天气数据
- ✅ 空气质量数据（AQI）
- ✅ 自动生成天气警告（高温、低温、强风、低能见度）
- ✅ 优先级：50（高于默认适配器，低于特定国家适配器）

## 配置

### 1. 获取 API Key

1. 访问 [WeatherAPI.com](https://www.weatherapi.com/)
2. 注册账号并获取 API Key
3. 免费计划提供：
   - 100万次调用/月
   - 实时天气
   - 3天预报
   - 历史天气数据

### 2. 设置环境变量

在 `.env` 文件中添加：

```bash
WEATHERAPI_API_KEY=your_api_key_here
```

### 3. 重启应用

配置完成后，重启 NestJS 应用以使配置生效。

## 适配器优先级

天气适配器按以下优先级选择：

1. **特定国家适配器**（优先级 10）
   - 例如：`IcelandWeatherAdapter`（冰岛）

2. **WeatherAPI 适配器**（优先级 50）
   - 如果配置了 `WEATHERAPI_API_KEY`，将优先于默认适配器使用

3. **默认适配器**（优先级 100）
   - `DefaultWeatherAdapter`（OpenWeather）

## API 响应格式

适配器将 WeatherAPI 的响应转换为标准格式：

```typescript
{
  temperature: number;        // 温度（摄氏度）
  condition: string;           // 天气状况（sunny, cloudy, rainy, etc.）
  windSpeed?: number;          // 风速（米/秒）
  windDirection?: number;      // 风向（度，0-360）
  humidity?: number;           // 湿度（百分比）
  visibility?: number;         // 能见度（米）
  alerts?: WeatherAlert[];     // 天气警告
  lastUpdated: Date;           // 最后更新时间
  source: 'weatherapi';        // 数据源标识
  metadata: {
    weatherapiLocation: {...}; // 位置信息
    uv?: number;               // UV 指数
    pressure?: number;          // 气压（mb）
    feelsLike?: number;         // 体感温度（摄氏度）
    airQuality?: {...};         // 空气质量数据
    conditionCode?: number;     // 天气条件代码
    conditionIcon?: string;    // 天气图标 URL
  }
}
```

## 天气条件映射

WeatherAPI 返回的描述性文本会自动映射到标准格式：

| WeatherAPI 文本 | 标准格式 |
|----------------|---------|
| Sunny, Clear | sunny |
| Partly cloudy, Cloudy, Overcast | cloudy |
| Rain, Drizzle | rainy |
| Snow, Blizzard | snowy |
| Thunderstorm | stormy |
| Mist, Fog | foggy |
| Haze | hazy |
| Windy | windy |

## 自动警告生成

适配器会根据天气条件自动生成警告：

- **高温警告**：温度 > 35°C
- **低温警告**：温度 < -10°C
- **强风警告**：风速 > 15 m/s（警告）或 > 25 m/s（严重）
- **低能见度警告**：能见度 < 1 km

## 使用示例

适配器会自动通过 `DataSourceRouterService` 使用，无需手动调用：

```typescript
// 在服务中注入 DataSourceRouterService
constructor(private readonly dataSourceRouter: DataSourceRouterService) {}

// 获取天气数据
const weatherData = await this.dataSourceRouter.getWeather({
  lat: 64.1466,
  lng: -21.9426,
  timezone: 'Atlantic/Reykjavik'
});
```

## 故障排除

### 问题：返回默认适配器的数据

**原因**：`WEATHERAPI_API_KEY` 未配置或无效

**解决**：
1. 检查 `.env` 文件中是否设置了 `WEATHERAPI_API_KEY`
2. 验证 API Key 是否有效
3. 重启应用

### 问题：API 调用失败

**原因**：API Key 配额用尽或网络问题

**解决**：
1. 检查 WeatherAPI 账户的调用配额
2. 查看应用日志中的错误信息
3. 系统会自动降级到默认适配器

## 相关文件

- 适配器实现：`src/data-contracts/adapters/weatherapi.adapter.ts`
- 适配器接口：`src/data-contracts/adapters/weather.adapter.interface.ts`
- 天气接口：`src/data-contracts/interfaces/weather.interface.ts`
- 模块注册：`src/data-contracts/data-contracts.module.ts`

## 参考文档

- [WeatherAPI.com 官方文档](https://www.weatherapi.com/docs/)
- [WeatherAPI.com API 参考](https://www.weatherapi.com/api.aspx)
