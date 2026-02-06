# Booking.com API 测试指南

本文档介绍如何测试 Booking.com 租车搜索 API。

---

## 📋 目录

1. [前置要求](#前置要求)
2. [启动服务器](#启动服务器)
3. [运行测试](#运行测试)
4. [手动测试](#手动测试)
5. [Swagger UI](#swagger-ui)
6. [常见问题](#常见问题)

---

## ✅ 前置要求

### 1. 环境变量配置

确保 `.env` 文件中包含以下配置：

```env
# RapidAPI Booking.com API
RAPIDAPI_BOOKING_COM_API_KEY=your_api_key_here
RAPIDAPI_BOOKING_COM_HOST=booking-com15.p.rapidapi.com
```

**获取 API Key**:
1. 访问 https://rapidapi.com/apidojo/api/booking-com15
2. 注册/登录 RapidAPI 账号
3. 订阅 Booking.com API
4. 复制 API Key 到 `.env` 文件

### 2. 安装依赖

```bash
npm install
```

---

## 🚀 启动服务器

### 开发模式

```bash
npm run start:dev
```

服务器将在 `http://localhost:3000` 启动。

### 生产模式

```bash
npm run build
npm run start:prod
```

---

## 🧪 运行测试

### 自动化测试脚本

运行完整的测试套件：

```bash
npx ts-node scripts/test-booking-com-api.ts
```

或者使用 npm 脚本（如果已配置）：

```bash
npm run test:booking-com:api
```

### 测试内容

测试脚本会测试以下端点：

1. ✅ **健康检查** (`GET /api/booking-com/health`)
   - 检查服务是否可用
   - 验证 API Key 配置

2. ✅ **搜索租车** (`POST /api/booking-com/search`)
   - 基本参数搜索
   - 指定日期搜索

3. ✅ **监控统计** (`GET /api/booking-com/monitoring/stats`)
   - 获取最近 7 天的统计
   - 性能指标和成本估算

4. ✅ **成本检查** (`GET /api/booking-com/monitoring/cost-check`)
   - 检查是否超过成本限制

5. ✅ **错误处理** (`POST /api/booking-com/search`)
   - 无效参数处理

### 预期输出

```
🚀 开始测试 Booking.com API...
📡 API Base URL: http://localhost:3000/api/booking-com

ℹ️  检查服务器连接...
✅ 服务器连接正常

📋 测试 1: 检查服务状态
✅ 服务可用

📋 测试 2: 搜索租车（基本参数）
✅ 搜索成功，找到 5 个租车选项
  示例: Hertz - Standard
  价格: USD 150

...

📊 测试结果总结
==================================================
总测试数: 6
通过: 6
失败: 0
成功率: 100.00%
==================================================

✅ 🎉 所有测试通过！
```

---

## 🔧 手动测试

### 1. 检查服务状态

```bash
curl http://localhost:3000/api/booking-com/health
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "available": true,
    "service": "booking-com"
  }
}
```

### 2. 搜索租车

```bash
curl -X POST http://localhost:3000/api/booking-com/search \
  -H "Content-Type: application/json" \
  -d '{
    "pick_up_latitude": 40.7128,
    "pick_up_longitude": -74.0060,
    "drop_off_latitude": 40.7589,
    "drop_off_longitude": -73.9851,
    "pick_up_date": "2026-02-15",
    "drop_off_date": "2026-02-20",
    "pick_up_time": "10:00",
    "drop_off_time": "10:00",
    "driver_age": 25,
    "currency_code": "USD",
    "location": "US"
  }'
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "rental-123",
        "company": "Hertz",
        "vehicle_type": "Standard",
        "price": {
          "amount": 150,
          "currency": "USD"
        },
        "pickup_location": {
          "lat": 40.7128,
          "lng": -74.0060,
          "address": "New York, NY"
        },
        "dropoff_location": {
          "lat": 40.7589,
          "lng": -73.9851,
          "address": "New York, NY"
        }
      }
    ],
    "meta": {}
  }
}
```

### 3. 获取监控统计

```bash
curl "http://localhost:3000/api/booking-com/monitoring/stats?days=7"
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "dailyStats": [
      {
        "date": "2026-02-06",
        "totalCalls": 10,
        "successfulCalls": 9,
        "failedCalls": 1,
        "avgResponseTime": 1200,
        "callsByTool": {
          "searchCarRentals": 10
        },
        "estimatedCost": 0.1
      }
    ],
    "performance": {
      "avgResponseTime": 1200,
      "successRate": 0.9,
      "totalCalls": 10,
      "callsByTool": {
        "searchCarRentals": 10
      }
    },
    "totalCostEstimate": 0.1
  }
}
```

### 4. 检查成本限制

```bash
curl "http://localhost:3000/api/booking-com/monitoring/cost-check?limit=100&days=7"
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "exceeded": false,
    "currentCost": 0.1,
    "limit": 100
  }
}
```

---

## 📚 Swagger UI

访问 Swagger UI 查看完整的 API 文档和交互式测试：

```
http://localhost:3000/api-docs
```

在 Swagger UI 中：
1. 找到 `booking-com` 标签
2. 展开相应的端点
3. 点击 "Try it out"
4. 填写参数
5. 点击 "Execute" 执行请求

---

## ❓ 常见问题

### 1. 服务不可用

**错误**: `Booking.com service is not available`

**解决方案**:
1. 检查 `.env` 文件中是否设置了 `RAPIDAPI_BOOKING_COM_API_KEY`
2. 确保 API Key 有效
3. 重启服务器以加载新的环境变量

```bash
# 检查环境变量
grep RAPIDAPI_BOOKING_COM_API_KEY .env

# 重启服务器
npm run start:dev
```

### 2. 连接被拒绝

**错误**: `ECONNREFUSED` 或 `无法连接到服务器`

**解决方案**:
1. 确保服务器正在运行
2. 检查端口是否正确（默认 3000）
3. 检查防火墙设置

```bash
# 检查服务器是否运行
curl http://localhost:3000/api/booking-com/health

# 如果失败，启动服务器
npm run start:dev
```

### 3. API 调用失败

**错误**: `Failed to search car rentals`

**可能原因**:
1. API Key 无效或过期
2. RapidAPI 配额用尽
3. 网络连接问题
4. API 参数错误

**解决方案**:
1. 检查 RapidAPI 控制台中的 API Key 状态
2. 检查配额使用情况
3. 验证请求参数格式
4. 查看服务器日志获取详细错误信息

### 4. 监控统计为空

**现象**: 监控统计返回空数据

**原因**: 
- 还没有进行任何 API 调用
- Redis 未配置或连接失败

**解决方案**:
1. 先执行一些搜索请求
2. 检查 Redis 配置和连接
3. 等待几分钟后再次查询（统计数据会实时更新）

### 5. 成本估算不准确

**现象**: 成本估算与实际不符

**原因**: 
- 成本定价基于假设值，需要根据实际 RapidAPI 定价调整

**解决方案**:
1. 查看 RapidAPI 定价页面
2. 更新 `BookingComMonitoringService` 中的 `pricing` 配置
3. 重新编译并重启服务器

---

## 📊 测试覆盖率

当前测试覆盖：

- ✅ 健康检查端点
- ✅ 搜索租车端点（基本参数）
- ✅ 搜索租车端点（指定日期）
- ✅ 监控统计端点
- ✅ 成本检查端点
- ✅ 错误处理（无效参数）

---

## 🔗 相关文档

- **前端 API 文档**: `src/mcp/BOOKING_COM_FRONTEND_API.md`
- **产品策略**: `src/mcp/BOOKING_COM_PRODUCT_STRATEGY.md`
- **集成评估**: `src/mcp/BOOKING_COM_INTEGRATION_ASSESSMENT.md`
- **实施总结**: `src/mcp/BOOKING_COM_IMPLEMENTATION_SUMMARY.md`

---

**最后更新**: 2026-02-06
