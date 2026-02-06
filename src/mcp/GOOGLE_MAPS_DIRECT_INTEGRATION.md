# Google Maps Direct API 集成指南

## 📋 概述

本文档说明如何直接集成 Google Maps API（不依赖 Smithery MCP 服务）。

### 为什么使用直接集成

- ✅ **无需 OAuth**: 使用 API Key，无需复杂的 OAuth 流程
- ✅ **更稳定**: 不依赖第三方服务（Smithery）
- ✅ **更灵活**: 完全控制 API 调用和错误处理
- ✅ **更快速**: 直接调用 Google Maps API，减少中间层

---

## 🔧 配置

### 1. 获取 Google Maps API Key

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建项目或选择现有项目
3. 启用以下 API：
   - Directions API
   - Distance Matrix API
   - Geocoding API
   - Places API
4. 创建 API Key
5. 限制 API Key（推荐）：
   - 限制为特定 API
   - 限制 IP 地址或 HTTP referrer

### 2. 配置环境变量

在 `.env` 文件中添加：

```bash
GOOGLE_MAPS_API_KEY=your_api_key_here
```

**注意**: 项目已包含 `GOOGLE_MAPS_API_KEY`，请确保值正确。

---

## 🚀 使用方法

### 在 Cursor 中使用

Google Maps 工具已经集成到 MCP Skills Server 中，重启 Cursor 后即可使用：

1. **获取路线**:
   ```
   从纽约到波士顿的驾车路线
   ```

2. **计算距离矩阵**:
   ```
   计算从纽约到波士顿和费城的距离和时间
   ```

3. **地理编码**:
   ```
   获取纽约的坐标
   ```

4. **搜索地点**:
   ```
   搜索纽约的餐厅
   ```

### 在代码中使用

```typescript
import { GoogleMapsDirectService } from './mcp/google-maps-direct.service';

// 在服务中注入
constructor(private readonly googleMapsService: GoogleMapsDirectService) {}

// 获取路线
const route = await this.googleMapsService.getRoute({
  origin: 'New York, NY',
  destination: 'Boston, MA',
  mode: 'driving',
  units: 'metric',
});

// 计算距离矩阵
const matrix = await this.googleMapsService.computeDistanceMatrix({
  origins: ['New York, NY'],
  destinations: ['Boston, MA', 'Philadelphia, PA'],
  mode: 'driving',
  units: 'metric',
});

// 地理编码
const geocode = await this.googleMapsService.geocode({
  address: 'New York, NY',
});

// 搜索地点
const places = await this.googleMapsService.searchPlaces({
  query: 'restaurants in New York',
});
```

---

## 🛠️ 可用工具列表

### google_maps.getRoute

计算两个地点之间的路线。

**参数**:
- `origin` (必需): 起点地址
- `destination` (必需): 终点地址
- `mode` (可选): 交通方式 - `driving`, `walking`, `bicycling`, `transit`
- `waypoints` (可选): 途经点列表
- `avoid` (可选): 避开选项 - `tolls`, `highways`, `ferries`
- `alternatives` (可选): 是否计算替代路线
- `language` (可选): 语言代码
- `units` (可选): 单位系统 - `metric` 或 `imperial`

### google_maps.computeDistanceMatrix

计算多个起点和终点之间的距离矩阵。

**参数**:
- `origins` (必需): 起点列表
- `destinations` (必需): 终点列表
- `mode` (可选): 交通方式
- `units` (可选): 单位系统
- `language` (可选): 语言代码
- `avoid` (可选): 避开选项

### google_maps.geocode

地理编码（地址转坐标）或反向地理编码（坐标转地址）。

**参数**:
- `address` (可选): 要编码的地址
- `latlng` (可选): 要反向编码的坐标 `{lat, lng}`
- `language` (可选): 语言代码
- `region` (可选): 区域代码

### google_maps.searchPlaces

搜索地点。

**参数**:
- `query` (必需): 搜索查询文本
- `location` (可选): 位置偏好 `{lat, lng}`
- `radius` (可选): 搜索半径（米）
- `language` (可选): 语言代码
- `type` (可选): 地点类型

---

## 🧪 测试

### 测试服务

运行测试脚本验证集成：

```bash
npm run mcp:test:google-maps-direct
```

### API 端点测试

服务还提供了 HTTP API 端点：

```bash
# 健康检查
curl http://localhost:3000/api/google-maps-direct/health

# 获取路线
curl -X POST http://localhost:3000/api/google-maps-direct/route \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "New York, NY",
    "destination": "Boston, MA",
    "mode": "driving"
  }'
```

---

## 💡 使用场景

### 场景 1: 路线规划

```typescript
async function planRoute(origin: string, destination: string) {
  const route = await this.googleMapsService.getRoute({
    origin,
    destination,
    mode: 'driving',
    alternatives: true,
  });
  
  return route.data.routes.map(route => ({
    distance: route.legs[0].distance.text,
    duration: route.legs[0].duration.text,
    summary: route.summary,
  }));
}
```

### 场景 2: 批量计算距离

```typescript
async function calculateDistances(origins: string[], destinations: string[]) {
  const matrix = await this.googleMapsService.computeDistanceMatrix({
    origins,
    destinations,
    mode: 'driving',
  });
  
  return matrix.data.rows.map((row, i) => ({
    origin: matrix.data.origin_addresses[i],
    destinations: row.elements.map((el, j) => ({
      destination: matrix.data.destination_addresses[j],
      distance: el.distance.text,
      duration: el.duration.text,
    })),
  }));
}
```

### 场景 3: 地址解析

```typescript
async function resolveAddress(address: string) {
  const result = await this.googleMapsService.geocode({
    address,
  });
  
  if (result.data.results.length > 0) {
    const location = result.data.results[0].geometry.location;
    return {
      lat: location.lat,
      lng: location.lng,
      formattedAddress: result.data.results[0].formatted_address,
    };
  }
  return null;
}
```

---

## ⚠️ 注意事项

1. **API 配额**: Google Maps API 有配额限制，请注意使用频率
2. **成本**: 使用 Google Maps API 可能产生费用，请查看 [定价页面](https://developers.google.com/maps/billing-and-pricing/pricing)
3. **API Key 安全**: 
   - 不要将 API Key 提交到版本控制
   - 在生产环境中限制 API Key 的使用
   - 定期轮换 API Key
4. **错误处理**: API 调用可能失败，建议添加重试机制
5. **缓存**: 考虑缓存常用查询结果以减少 API 调用

---

## 📊 与 Smithery MCP 对比

| 特性 | 直接 API 集成 | Smithery MCP |
|------|--------------|--------------|
| **认证** | API Key（简单） | OAuth 2.0（复杂） |
| **稳定性** | ✅ 高（直接调用） | ⚠️ 依赖第三方 |
| **控制** | ✅ 完全控制 | ⚠️ 受限于 MCP |
| **成本** | 直接计费 | 可能额外费用 |
| **功能** | ✅ 完整 API | ⚠️ 受限于 MCP 工具 |

---

## 📚 相关资源

- [Google Maps Platform 文档](https://developers.google.com/maps)
- [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript)
- [Google Maps Platform 定价](https://developers.google.com/maps/billing-and-pricing/pricing)

---

## 🔄 更新日志

- **2026-02-06**: 初始版本，添加 Google Maps Direct API 集成
