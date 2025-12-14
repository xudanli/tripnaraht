# 路线优化 API 测试指南

## 📋 API 端点

**POST** `/itinerary-optimization/optimize`

**功能**: 使用 4 维平衡算法优化路线（节奏感算法）

## 🚀 快速测试

### 方法 1: 使用测试脚本（推荐）

```bash
# 运行完整测试套件
npm run test:optimize
```

测试脚本会自动：
- 从数据库获取真实的地点 ID
- 运行多个测试场景（标准、带老人/小孩、快节奏、错误处理）
- 显示详细的测试结果

### 方法 2: 使用 curl

```bash
# 使用示例 JSON 文件
curl -X POST http://localhost:3000/itinerary-optimization/optimize \
  -H "Content-Type: application/json" \
  -d @scripts/test-optimize-request.json
```

### 方法 3: 使用 Swagger UI

1. 启动后端服务：`npm run backend:dev`
2. 访问 Swagger UI：`http://localhost:3000/api`
3. 找到 `itinerary-optimization` 标签
4. 点击 `POST /itinerary-optimization/optimize`
5. 点击 "Try it out"
6. 使用示例数据或自定义数据
7. 点击 "Execute"

## 📝 请求格式

### 必需参数

```json
{
  "placeIds": [1, 2, 3, 4, 5],
  "config": {
    "date": "2024-05-01",
    "startTime": "2024-05-01T09:00:00.000Z",
    "endTime": "2024-05-01T18:00:00.000Z"
  }
}
```

### 完整参数示例

```json
{
  "placeIds": [1, 2, 3, 4, 5],
  "config": {
    "date": "2024-05-01",
    "startTime": "2024-05-01T09:00:00.000Z",
    "endTime": "2024-05-01T18:00:00.000Z",
    "pacingFactor": 1.0,
    "hasChildren": false,
    "hasElderly": false,
    "lunchWindow": {
      "start": "12:00",
      "end": "13:30"
    },
    "dinnerWindow": {
      "start": "18:00",
      "end": "20:00"
    }
  }
}
```

### 参数说明

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `placeIds` | `number[]` | ✅ | 地点 ID 数组 |
| `config.date` | `string` | ✅ | 行程日期（ISO 8601 date） |
| `config.startTime` | `string` | ✅ | 开始时间（ISO 8601 datetime） |
| `config.endTime` | `string` | ✅ | 结束时间（ISO 8601 datetime） |
| `config.pacingFactor` | `number` | ❌ | 节奏因子（1.0=标准, 1.5=慢, 0.7=快） |
| `config.hasChildren` | `boolean` | ❌ | 是否带小孩 |
| `config.hasElderly` | `boolean` | ❌ | 是否带老人 |
| `config.lunchWindow` | `object` | ❌ | 午餐时间窗 `{start: "12:00", end: "13:30"}` |
| `config.dinnerWindow` | `object` | ❌ | 晚餐时间窗 `{start: "18:00", end: "20:00"}` |

## 📊 响应格式

### 成功响应

```json
{
  "nodes": [
    {
      "id": 1,
      "name": "浅草寺",
      "category": "ATTRACTION",
      "location": { "lat": 35.7148, "lng": 139.7967 },
      "intensity": "MEDIUM",
      "estimatedDuration": 90
    }
  ],
  "schedule": [
    {
      "nodeIndex": 0,
      "startTime": "2024-05-01T09:00:00.000Z",
      "endTime": "2024-05-01T10:30:00.000Z",
      "transportTime": 20
    }
  ],
  "happinessScore": 850,
  "scoreBreakdown": {
    "interestScore": 500,
    "distancePenalty": 50,
    "tiredPenalty": 0,
    "boredPenalty": 0,
    "starvePenalty": 0,
    "clusteringBonus": 100,
    "bufferBonus": 30
  },
  "zones": [
    {
      "id": 0,
      "centroid": { "lat": 35.7148, "lng": 139.7967 },
      "places": [],
      "radius": 1500
    }
  ]
}
```

### 错误响应

```json
{
  "statusCode": 404,
  "message": "未找到指定的地点",
  "error": "Not Found"
}
```

## 🎯 测试场景

### 1. 标准行程
- 5 个地点
- 标准节奏（pacingFactor: 1.0）
- 包含午餐时间窗

### 2. 带老人/小孩
- 4 个地点
- 慢节奏（pacingFactor: 1.5）
- 包含午餐和晚餐时间窗

### 3. 特种兵模式
- 8 个地点
- 快节奏（pacingFactor: 0.7）
- 长时间段（08:00-22:00）

### 4. 错误处理
- 无效的地点 ID
- 应该返回 404 错误

## ⚙️ 配置

### 环境变量

```bash
# API 地址（可选，默认 http://localhost:3000）
API_BASE_URL=http://localhost:3000
```

### 数据库要求

- 需要有效的 Place 数据
- Place 需要有 location（PostGIS Point）
- 建议至少有 5-10 个地点用于测试

## 🔍 调试技巧

### 查看详细日志

测试脚本会输出：
- 请求数据
- 响应数据
- 快乐值分数
- 分数详情
- 聚类结果

### 检查地点数据

```bash
# 使用 Prisma Studio 查看地点数据
npm run prisma:studio
```

### 验证地点 ID

确保使用的地点 ID 在数据库中存在：
```sql
SELECT id, "nameCN", category, location 
FROM "Place" 
WHERE id IN (1, 2, 3, 4, 5);
```

## 📚 相关文档

- [路线优化算法说明](./ROUTE-OPTIMIZATION-ALGORITHM.md)（如果存在）
- [Swagger API 文档](http://localhost:3000/api)（启动服务后访问）
