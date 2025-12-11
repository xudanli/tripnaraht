# API 快速开始指南

## 🚀 快速启动

### 1. 启动服务

```bash
# 开发模式
npm run backend:dev

# 或生产模式
npm run backend:build
npm run backend:start
```

### 2. 访问 Swagger UI

启动后访问: `http://localhost:3000/api`

Swagger UI 提供：
- ✅ 完整的 API 文档
- ✅ 交互式测试界面
- ✅ 请求/响应示例
- ✅ 参数说明

---

## 📋 主要 API 接口

### 1. 交通规划 API

**接口**: `POST /transport/plan`

**功能**: 智能推荐交通方式（自动选择高德/Google）

**快速测试**:

```bash
curl -X POST http://localhost:3000/transport/plan \
  -H "Content-Type: application/json" \
  -d '{
    "fromLat": 35.6762,
    "fromLng": 139.6503,
    "toLat": 35.6812,
    "toLng": 139.7671
  }'
```

**完整文档**: [交通规划 API 完整文档](./TRANSPORT-API-COMPLETE.md)

---

### 2. 路线优化 API

**接口**: `POST /itinerary-optimization/optimize`

**功能**: 优化景点游览顺序（TSP 算法）

**快速测试**:

```bash
curl -X POST http://localhost:3000/itinerary-optimization/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "placeIds": [1, 2, 3, 4, 5],
    "config": {
      "date": "2024-05-01",
      "startTime": "2024-05-01T09:00:00.000Z",
      "endTime": "2024-05-01T18:00:00.000Z",
      "pacingFactor": 1.0
    }
  }'
```

**完整文档**: [API 参考文档](./API-REFERENCE.md)

---

### 3. 地点查询 API

**接口**: `GET /places/nearby`

**功能**: 查找附近的地点

**快速测试**:

```bash
curl "http://localhost:3000/places/nearby?lat=35.6762&lng=139.6503&radius=1000&category=ATTRACTION"
```

---

### 4. 酒店推荐 API

**接口**: `POST /places/hotels/recommend`

**功能**: 推荐酒店（三种策略）

**快速测试**:

```bash
curl -X POST http://localhost:3000/places/hotels/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "placeIds": [1, 2, 3],
    "strategy": "CENTER_OF_GRAVITY"
  }'
```

---

### 5. 航班价格估算 API

**接口**: `POST /flight-prices/estimate`

**功能**: 估算航班价格

**快速测试**:

```bash
curl -X POST http://localhost:3000/flight-prices/estimate \
  -H "Content-Type: application/json" \
  -d '{
    "originCity": "北京",
    "destinationCity": "东京",
    "month": 5,
    "dayOfWeek": 1
  }'
```

---

## 🔑 必需配置

### 环境变量

创建 `.env` 文件：

```env
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# 高德地图 API（国内路线）
AMAP_API_KEY=your_amap_api_key

# Google Routes API（海外路线）
GOOGLE_ROUTES_API_KEY=your_google_api_key

# Redis（缓存）
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

---

## 📚 完整文档列表

1. **[交通规划 API 完整文档](./TRANSPORT-API-COMPLETE.md)** - 交通规划接口详细说明
2. **[API 参考文档](./API-REFERENCE.md)** - 所有 API 接口概览
3. **[智能路线规划 API 策略](./ROUTE-API-STRATEGY.md)** - API 选择策略
4. **[Redis 缓存设置](./REDIS-SETUP.md)** - Redis 配置和使用
5. **[交通规划系统设计](./TRANSPORT-PLANNING-SYSTEM.md)** - 系统架构说明

---

## 🧪 测试工具

### 1. Swagger UI（推荐）

访问 `http://localhost:3000/api`，直接在浏览器中测试所有接口。

### 2. curl

使用命令行工具测试：

```bash
# 测试交通规划
curl -X POST http://localhost:3000/transport/plan \
  -H "Content-Type: application/json" \
  -d @test-request.json
```

### 3. Postman

导入 Swagger 文档到 Postman 进行测试。

---

## 💡 提示

1. **首次使用**: 建议先访问 Swagger UI 查看所有可用接口
2. **API Key**: 确保配置了高德和 Google 的 API Key
3. **Redis**: 建议启动 Redis 以启用缓存功能
4. **日志**: 查看控制台日志了解 API 调用详情
