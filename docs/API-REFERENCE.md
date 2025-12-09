# TripNara API 接口文档

## 基础信息

- **Base URL**: `http://localhost:3000`
- **Swagger UI**: `http://localhost:3000/api`
- **API 版本**: 1.0

## 接口分类

### 1. 行程管理 (Trips)

#### POST /trips
创建新行程，自动计算节奏策略和预算切分

#### GET /trips
获取所有行程列表

#### GET /trips/:id
获取单个行程详情（全景视图）

---

### 2. 地点查询 (Places)

#### GET /places/nearby
查找附近的地点（支持 PostGIS 地理查询）

#### GET /places/nearby/restaurants
查找附近的餐厅（支持支付方式筛选）

#### POST /places
创建新地点

#### POST /places/hotels/recommend
推荐酒店（三种策略：重心法、交通枢纽法、度假模式）

---

### 3. 行程项管理 (Itinerary Items)

#### POST /itinerary-items
创建行程项（智能营业时间校验）

#### GET /itinerary-items
获取所有行程项

#### GET /itinerary-items/:id
获取单个行程项详情

#### PATCH /itinerary-items/:id
更新行程项

#### DELETE /itinerary-items/:id
删除行程项

---

### 4. 路线优化 (Itinerary Optimization)

#### POST /itinerary-optimization/optimize
优化路线（节奏感算法）

**请求示例：**
```json
{
  "placeIds": [1, 2, 3, 4, 5],
  "config": {
    "date": "2024-05-01",
    "startTime": "2024-05-01T09:00:00.000Z",
    "endTime": "2024-05-01T18:00:00.000Z",
    "pacingFactor": 1.0,
    "lunchWindow": {
      "start": "12:00",
      "end": "13:30"
    }
  }
}
```

**响应示例：**
```json
{
  "nodes": [...],
  "schedule": [...],
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
  "zones": [...]
}
```

---

### 5. 交通规划 (Transport)

#### POST /transport/plan
规划交通路线（智能推荐）

**请求示例：**
```json
{
  "fromLat": 35.6762,
  "fromLng": 139.6503,
  "toLat": 35.6812,
  "toLng": 139.7671,
  "hasLuggage": false,
  "hasElderly": false,
  "isRaining": false,
  "budgetSensitivity": "MEDIUM"
}
```

**响应示例：**
```json
{
  "options": [
    {
      "mode": "TAXI",
      "durationMinutes": 15,
      "cost": 1200,
      "score": 150,
      "recommendationReason": "适合携带行李、避免淋雨",
      "warnings": []
    }
  ],
  "recommendationReason": "您带着行李，且外面正在下雨，建议打车出行",
  "specialAdvice": ["💡 建议使用宅急便（Yamato）将行李直接寄到下一家酒店"]
}
```

---

### 6. 机票价格参考 (Flight Prices)

#### GET /flight-prices/estimate
估算国际航线价格（机票+签证）

**查询参数：**
- `countryCode` (必填): 目的地国家代码
- `originCity` (可选): 出发城市代码
- `useConservative` (可选): 是否使用保守估算

**示例：**
```bash
GET /flight-prices/estimate?countryCode=JP&originCity=PEK&useConservative=true
```

#### GET /flight-prices/details
获取详细价格信息

#### GET /flight-prices
获取所有价格参考数据

#### GET /flight-prices/:id
根据 ID 查询价格参考数据

#### POST /flight-prices
创建价格参考数据

#### PUT /flight-prices/:id
更新价格参考数据

#### DELETE /flight-prices/:id
删除价格参考数据

#### GET /flight-prices/domestic/estimate
估算国内航线价格（基于历史数据）

**查询参数：**
- `originCity` (必填): 出发城市
- `destinationCity` (必填): 到达城市
- `month` (必填): 月份（1-12）
- `dayOfWeek` (可选): 星期几（0=周一, 6=周日）

**示例：**
```bash
GET /flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=3&dayOfWeek=4
```

**响应：**
```json
{
  "estimatedPrice": 2375,
  "lowerBound": 2138,
  "upperBound": 2613,
  "monthlyBasePrice": 2200,
  "dayOfWeekFactor": 1.08,
  "sampleCount": 45
}
```

#### GET /flight-prices/domestic/monthly-trend
获取航线月度价格趋势

**示例：**
```bash
GET /flight-prices/domestic/monthly-trend?originCity=成都&destinationCity=深圳
```

#### GET /flight-prices/day-of-week-factors
获取所有周内因子

---

### 7. 国家档案 (Countries)

#### GET /countries
获取所有国家列表

#### GET /countries/:countryCode/currency-strategy
获取国家的货币策略

**示例：**
```bash
GET /countries/JP/currency-strategy
```

**响应：**
```json
{
  "countryCode": "JP",
  "currencyCode": "JPY",
  "paymentType": "CASH_HEAVY",
  "exchangeRateToCNY": 0.0483,
  "quickRule": "直接除以 20",
  "quickTip": "看到价格 直接除以 20 即为人民币\n例：日元1,000 ≈ 48 元",
  "quickTable": [
    { "local": 1000, "home": 48 },
    { "local": 5000, "home": 240 }
  ],
  "paymentAdvice": {
    "tipping": "绝对不要给小费",
    "atm_network": "7-11 ATM支持银联取现",
    "wallet_apps": ["Suica", "PayPay"]
  }
}
```

---

## 数据导入脚本

### 导入航班历史数据

```bash
npm run import:flight-data [CSV文件路径]
```

**功能：**
- 加载 65MB CSV 文件
- 计算周内因子（F_day）
- 计算月度基准价（P_month）
- 批量写入数据库

**详细文档：** `docs/FLIGHT-DATA-IMPORT-GUIDE.md`

---

## 错误响应格式

所有接口在出错时都会返回标准错误响应：

```json
{
  "statusCode": 400,
  "message": "错误描述",
  "error": "Bad Request"
}
```

**常见错误码：**
- `400 Bad Request`: 请求参数错误
- `404 Not Found`: 资源不存在
- `500 Internal Server Error`: 服务器内部错误

---

## 认证

当前版本无需认证，所有接口公开访问。

---

## 限流

当前版本无限流，生产环境建议添加限流中间件。

---

## 完整 Swagger 文档

启动服务后，访问 Swagger UI 查看完整的交互式文档：

```
http://localhost:3000/api
```

所有接口都包含：
- 请求参数说明
- 响应示例
- 错误码说明
- 在线测试功能

