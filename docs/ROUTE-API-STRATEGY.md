# 智能路线规划 API 策略

## 📋 概述

系统实现了智能路线规划 API 选择策略：
- **国内路线**：使用高德地图 API（数据更准确，实时路况更及时）
- **海外路线**：使用 Google Routes API（全球覆盖，数据完整）

系统会根据起点和终点的地理位置自动选择合适的地图 API。

## 🗺️ 地理位置判断

### LocationDetectorService

使用简化的边界框算法判断坐标是否在中国境内：

- **中国边界框**：
  - 纬度：18°N - 54°N
  - 经度：73°E - 135°E

- **排除区域**：
  - 蒙古（通过距离中心点判断）
  - 日本、韩国（明确排除）
  - 俄罗斯远东（明确排除）

### 判断逻辑

```typescript
// 判断是否都在中国境内
const bothInChina = locationDetector.areBothInChina(fromLat, fromLng, toLat, toLng);

// 判断是否都在海外
const bothOverseas = locationDetector.areBothOverseas(fromLat, fromLng, toLat, toLng);

// 跨区域路线（一个在中国，一个在海外）
if (!bothInChina && !bothOverseas) {
  // 使用 Google Routes API
}
```

## 🔧 API 服务

### 1. AmapRoutesService（高德地图）

**API 端点**：
- 公交路线：`/transit/integrated`
- 步行路线：`/walking`
- 驾车路线：`/driving`

**特点**：
- ✅ 国内数据准确
- ✅ 实时路况及时
- ✅ 公共交通数据完整（包含换乘信息）
- ✅ 支持少步行模式（适合老人）

**配置**：
```env
AMAP_API_KEY=your_amap_api_key
```

### 2. GoogleRoutesService（Google 地图）

**API 端点**：
- `https://routes.googleapis.com/directions/v2:computeRoutes`

**特点**：
- ✅ 全球覆盖
- ✅ 支持多种交通模式
- ✅ 包含换乘信息和时刻表
- ✅ 考虑实时路况

**配置**：
```env
GOOGLE_ROUTES_API_KEY=your_google_api_key
```

### 3. SmartRoutesService（智能路由服务）

**功能**：
- 根据地理位置自动选择 API
- 处理跨区域路线
- 提供降级策略

**使用方式**：
```typescript
const options = await smartRoutesService.getRoutes(
  fromLat, fromLng,
  toLat, toLng,
  'TRANSIT', // 或 'WALKING', 'DRIVING'
  {
    lessWalking: true, // 少步行模式
    avoidHighways: false,
    avoidTolls: false,
  }
);
```

## 📊 选择策略

### 场景 1: 国内路线（都在中国境内）

```
起点：北京（39.9°N, 116.4°E）
终点：上海（31.2°N, 121.5°E）
→ 使用高德地图 API
```

### 场景 2: 海外路线（都在海外）

```
起点：东京（35.7°N, 139.8°E）
终点：大阪（34.7°N, 135.5°E）
→ 使用 Google Routes API
```

### 场景 3: 跨区域路线（一个在中国，一个在海外）

```
起点：北京（39.9°N, 116.4°E）
终点：首尔（37.6°N, 127.0°E）
→ 使用 Google Routes API（降级策略）
```

### 场景 4: API 失败降级

如果高德地图 API 失败（无结果或错误），自动降级使用 Google Routes API：

```typescript
// 国内路线，高德 API 失败
const amapOptions = await amapRoutesService.getRoutes(...);
if (amapOptions.length === 0) {
  // 降级使用 Google Routes API
  return googleRoutesService.getRoutes(...);
}
```

## 🔄 集成点

### 1. TransportRoutingService

`planIntraCityRoute()` 方法已更新为使用 `SmartRoutesService`：

```typescript
// 公共交通选项
const routeOptions = await this.smartRoutesService.getRoutes(
  fromLat, fromLng, toLat, toLng,
  'TRANSIT',
  { lessWalking: context.hasElderly }
);

// 打车选项
const routeOptions = await this.smartRoutesService.getRoutes(
  fromLat, fromLng, toLat, toLng,
  'DRIVING'
);
```

### 2. RouteOptimizerService

`precomputeTimeMatrix()` 方法已更新为使用 `SmartRoutesService`：

```typescript
const options = await this.smartRoutesService.getRoutes(
  from.lat, from.lng,
  to.lat, to.lng,
  travelMode
);
```

## 📝 配置要求

### 环境变量

```env
# 高德地图 API（国内必需）
AMAP_API_KEY=your_amap_api_key

# Google Routes API（海外必需，国内降级使用）
GOOGLE_ROUTES_API_KEY=your_google_api_key
```

### 获取 API Key

**高德地图**：
1. 访问 https://console.amap.com/
2. 注册/登录账号
3. 创建应用，获取 Web 服务 API Key

**Google Maps**：
1. 访问 https://console.cloud.google.com/
2. 创建项目
3. 启用 Routes API
4. 创建 API Key

## ⚠️ 注意事项

1. **API 配额**：注意各 API 的调用配额限制
2. **费用**：Google Routes API 按调用次数收费
3. **缓存**：使用 Redis 缓存减少 API 调用
4. **降级策略**：API 失败时使用距离估算，保证系统可用性

## 🚀 性能优化

1. **批量预计算**：TSP 优化前批量计算所有点对时间
2. **缓存优先**：优先使用 Redis 缓存
3. **并发控制**：限制并发请求数，避免 API 限流
4. **短距离优化**：< 1km 使用 PostGIS 计算，不调 API

## 📊 监控建议

1. **API 调用统计**：记录各 API 的调用次数和成功率
2. **缓存命中率**：监控 Redis 缓存命中率
3. **响应时间**：监控 API 响应时间
4. **错误日志**：记录 API 失败原因，便于排查
