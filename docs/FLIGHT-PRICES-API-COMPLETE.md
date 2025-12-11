# 航班价格 API 完整文档

## 📋 概述

航班价格 API 提供两种数据源的价格查询：
1. **国际航线**：基于手动维护的估算数据库（FlightPriceReference）
2. **国内航线**：基于2023-2024年历史数据的统计模型（FlightPriceDetail）

## 🌐 基础路径

所有接口的基础路径：`/flight-prices`

---

## 🛫 国内航线价格接口

### 1. 估算国内航线价格 ⭐

**接口：** `GET /flight-prices/domestic/estimate`

**描述：** 根据2023-2024年历史数据估算国内航线价格。使用公式：`预算价格 = 月度基准价 (P_month) × 周内因子 (F_day)`

**查询参数：**

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| originCity | string | ✅ | 出发城市 | `成都` |
| destinationCity | string | ✅ | 到达城市 | `深圳` |
| month | number | ✅ | 月份（1-12） | `10` |
| dayOfWeek | number | ❌ | 星期几（0=周一, 6=周日） | `0` |

**dayOfWeek 说明：**
- `0` = 周一
- `1` = 周二
- `2` = 周三
- `3` = 周四
- `4` = 周五
- `5` = 周六
- `6` = 周日

**请求示例：**

```bash
# 查询成都到深圳，10月，周一的价格
curl "http://localhost:3000/flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=10&dayOfWeek=0"

# 查询成都到深圳，3月，周五的价格
curl "http://localhost:3000/flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=3&dayOfWeek=4"

# 不指定星期几，返回月度平均值
curl "http://localhost:3000/flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=3"
```

**响应示例：**

```json
{
  "estimatedPrice": 2375,
  "lowerBound": 2138,
  "upperBound": 2613,
  "monthlyBasePrice": 2200,
  "dayOfWeekFactor": 1.08,
  "sampleCount": 45,
  "distanceKm": 1234.5,
  "monthFactor": 1.05,
  "airlineCount": 8,
  "isWeekend": false,
  "departureTime": "08:30",
  "arrivalTime": "10:45",
  "timeOfDayFactor": 1.02
}
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| estimatedPrice | number | 估算价格（元），主要返回值 |
| lowerBound | number | 价格下限（估算价格 × 0.9） |
| upperBound | number | 价格上限（估算价格 × 1.1） |
| monthlyBasePrice | number | 月度基准价（该航线在该月的平均价格） |
| dayOfWeekFactor | number? | 周内因子（该星期几相对于总平均价的倍数） |
| sampleCount | number | 样本数量（用于该估算的数据条数） |
| distanceKm | number? | 航线距离（公里） |
| monthFactor | number? | 月度因子（该月相对于全年平均价的倍数） |
| airlineCount | number? | 航空公司数量 |
| isWeekend | boolean? | 是否周末 |
| departureTime | string? | 最常见的起飞时间 |
| arrivalTime | string? | 最常见的降落时间 |
| timeOfDayFactor | number? | 时段因子 |

**错误响应：**

```json
{
  "statusCode": 400,
  "message": "月份必须在 1-12 之间",
  "error": "Bad Request"
}
```

```json
{
  "statusCode": 400,
  "message": "星期几必须在 0-6 之间（0=周一, 6=周日）",
  "error": "Bad Request"
}
```

**注意事项：**
- 如果指定的 `dayOfWeek` 不存在数据，系统会自动降级到月度平均值
- 如果该月份完全没有数据，返回默认值 2000 元

---

### 2. 获取航线月度价格趋势

**接口：** `GET /flight-prices/domestic/monthly-trend`

**描述：** 返回指定航线在全年12个月的价格趋势数据，用于展示价格走势图。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| originCity | string | ✅ | 出发城市 | `成都` |
| destinationCity | string | ✅ | 到达城市 | `深圳` |

**请求示例：**

```bash
curl "http://localhost:3000/flight-prices/domestic/monthly-trend?originCity=成都&destinationCity=深圳"
```

**响应示例：**

```json
[
  {
    "month": 1,
    "basePrice": 2500,
    "sampleCount": 120
  },
  {
    "month": 2,
    "basePrice": 3200,
    "sampleCount": 95
  },
  {
    "month": 3,
    "basePrice": 1800,
    "sampleCount": 110
  },
  {
    "month": 4,
    "basePrice": 2000,
    "sampleCount": 105
  }
]
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| month | number | 月份（1-12） |
| basePrice | number | 该月的基准价格（加权平均） |
| sampleCount | number | 该月的样本数量 |

---

### 3. 获取所有周内因子

**接口：** `GET /flight-prices/day-of-week-factors`

**描述：** 返回周一至周日的周内因子（相对于总平均价的倍数），用于了解一周内哪天最便宜/最贵。

**请求示例：**

```bash
curl "http://localhost:3000/flight-prices/day-of-week-factors"
```

**响应示例：**

```json
[
  {
    "id": 1,
    "dayOfWeek": 0,
    "factor": 0.98,
    "avgPrice": 2156,
    "totalAvgPrice": 2200,
    "sampleCount": 15000,
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  {
    "id": 2,
    "dayOfWeek": 1,
    "factor": 0.95,
    "avgPrice": 2090,
    "totalAvgPrice": 2200,
    "sampleCount": 14500,
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  {
    "id": 3,
    "dayOfWeek": 4,
    "factor": 1.15,
    "avgPrice": 2530,
    "totalAvgPrice": 2200,
    "sampleCount": 18000,
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
]
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 记录ID |
| dayOfWeek | number | 星期几（0=周一, 6=周日） |
| factor | number | 周内因子，1.0 表示等于总平均价，>1.0 表示高于平均价 |
| avgPrice | number? | 该星期几的平均价格 |
| totalAvgPrice | number? | 总平均价格 |
| sampleCount | number | 样本数量 |

**说明：**
- 通常周五、周六、周日的因子较高（1.1-1.2），周一到周四较低（0.95-1.0）
- 因子 < 1.0 表示该天价格低于平均价（更便宜）
- 因子 > 1.0 表示该天价格高于平均价（更贵）

---

## 🌍 国际航线价格接口

### 4. 估算国际航线价格+签证成本

**接口：** `GET /flight-prices/estimate`

**描述：** 根据目的地国家代码和出发城市（可选）估算机票和签证的总成本。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| countryCode | string | ✅ | 目的地国家代码（ISO 3166-1 alpha-2） | `JP` |
| originCity | string | ❌ | 出发城市代码，如 "PEK"（北京）、"PVG"（上海） | `PEK` |
| useConservative | boolean | ❌ | 是否使用保守估算（旺季价格），默认 `true` | `true` |

**请求示例：**

```bash
# 估算日本机票+签证成本（保守估算）
curl "http://localhost:3000/flight-prices/estimate?countryCode=JP&useConservative=true"

# 从北京出发到日本
curl "http://localhost:3000/flight-prices/estimate?countryCode=JP&originCity=PEK&useConservative=true"

# 使用平均价格（非保守估算）
curl "http://localhost:3000/flight-prices/estimate?countryCode=JP&useConservative=false"
```

**响应示例：**

```json
{
  "totalCost": 6000,
  "flightPrice": 6000,
  "visaCost": 0,
  "useConservative": true,
  "countryCode": "JP",
  "originCity": "PEK"
}
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| totalCost | number | 总成本（机票+签证，人民币元） |
| flightPrice | number | 机票价格（人民币元） |
| visaCost | number | 签证费用（人民币元），0 表示免签或落地签 |
| useConservative | boolean | 是否使用了保守估算 |
| countryCode | string | 目的地国家代码 |
| originCity | string? | 出发城市代码 |

---

### 5. 获取详细价格信息

**接口：** `GET /flight-prices/details`

**描述：** 返回指定目的地和出发城市的详细价格信息，包括淡季、旺季、平均价格和签证费用。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| countryCode | string | ✅ | 目的地国家代码 | `JP` |
| originCity | string | ❌ | 出发城市代码 | `PEK` |

**请求示例：**

```bash
curl "http://localhost:3000/flight-prices/details?countryCode=JP"
```

**响应示例：**

```json
{
  "flightPrice": {
    "lowSeason": 2500,
    "highSeason": 6000,
    "average": 4250
  },
  "visaCost": 0,
  "total": {
    "conservative": 6000,
    "average": 4250
  },
  "source": "手动估算",
  "lastUpdated": "2024-01-15T10:30:00.000Z"
}
```

**错误响应：**

```json
{
  "statusCode": 404,
  "message": "未找到 JP (PEK) 的价格参考数据",
  "error": "Not Found"
}
```

---

## 📊 价格参考数据管理接口

### 6. 获取所有价格参考数据

**接口：** `GET /flight-prices`

**描述：** 返回所有已配置的机票价格参考数据列表。

**请求示例：**

```bash
curl "http://localhost:3000/flight-prices"
```

**响应示例：**

```json
[
  {
    "id": 1,
    "countryCode": "JP",
    "originCity": null,
    "lowSeasonPrice": 2500,
    "highSeasonPrice": 6000,
    "averagePrice": 4250,
    "visaCost": 0,
    "source": "手动估算",
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "notes": "价格包含税费，不含行李费",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
]
```

---

### 7. 根据 ID 查询价格参考数据

**接口：** `GET /flight-prices/:id`

**描述：** 返回指定 ID 的价格参考数据详情。

**路径参数：**

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| id | number | 价格参考数据 ID | `1` |

**请求示例：**

```bash
curl "http://localhost:3000/flight-prices/1"
```

**响应示例：**

```json
{
  "id": 1,
  "countryCode": "JP",
  "originCity": null,
  "lowSeasonPrice": 2500,
  "highSeasonPrice": 6000,
  "averagePrice": 4250,
  "visaCost": 0,
  "source": "手动估算",
  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "notes": "价格包含税费，不含行李费",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

### 8. 创建价格参考数据

**接口：** `POST /flight-prices`

**描述：** 创建新的机票价格参考数据。系统会自动计算平均价格。

**请求体：**

```json
{
  "countryCode": "JP",
  "originCity": "PEK",
  "lowSeasonPrice": 2500,
  "highSeasonPrice": 6000,
  "visaCost": 0,
  "source": "手动估算",
  "notes": "价格包含税费，不含行李费"
}
```

**字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| countryCode | string | ✅ | 目的地国家代码（ISO 3166-1 alpha-2） |
| originCity | string | ❌ | 出发城市代码，如 "PEK"（北京）、"PVG"（上海）。如果为空则表示任意出发城市 |
| lowSeasonPrice | number | ✅ | 淡季价格（人民币，元） |
| highSeasonPrice | number | ✅ | 旺季价格（人民币，元） |
| visaCost | number | ❌ | 签证费用（人民币，元），0 表示免签或落地签，默认 0 |
| source | string | ❌ | 数据来源说明 |
| notes | string | ❌ | 备注信息 |

**请求示例：**

```bash
curl -X POST "http://localhost:3000/flight-prices" \
  -H "Content-Type: application/json" \
  -d '{
    "countryCode": "JP",
    "originCity": "PEK",
    "lowSeasonPrice": 2500,
    "highSeasonPrice": 6000,
    "visaCost": 0,
    "source": "手动估算",
    "notes": "价格包含税费，不含行李费"
  }'
```

**响应示例：**

```json
{
  "id": 1,
  "countryCode": "JP",
  "originCity": "PEK",
  "lowSeasonPrice": 2500,
  "highSeasonPrice": 6000,
  "averagePrice": 4250,
  "visaCost": 0,
  "source": "手动估算",
  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "notes": "价格包含税费，不含行李费",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

### 9. 更新价格参考数据

**接口：** `PUT /flight-prices/:id`

**描述：** 更新指定 ID 的价格参考数据。如果更新了价格，系统会自动重新计算平均价格。

**路径参数：**

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| id | number | 价格参考数据 ID | `1` |

**请求体：** （所有字段都是可选的）

```json
{
  "lowSeasonPrice": 2600,
  "highSeasonPrice": 6100,
  "notes": "已更新价格"
}
```

**请求示例：**

```bash
curl -X PUT "http://localhost:3000/flight-prices/1" \
  -H "Content-Type: application/json" \
  -d '{
    "lowSeasonPrice": 2600,
    "highSeasonPrice": 6100,
    "notes": "已更新价格"
  }'
```

**响应示例：**

```json
{
  "id": 1,
  "countryCode": "JP",
  "originCity": "PEK",
  "lowSeasonPrice": 2600,
  "highSeasonPrice": 6100,
  "averagePrice": 4350,
  "visaCost": 0,
  "source": "手动估算",
  "lastUpdated": "2024-01-15T11:00:00.000Z",
  "notes": "已更新价格",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T11:00:00.000Z"
}
```

---

### 10. 删除价格参考数据

**接口：** `DELETE /flight-prices/:id`

**描述：** 删除指定 ID 的价格参考数据。

**路径参数：**

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| id | number | 价格参考数据 ID | `1` |

**请求示例：**

```bash
curl -X DELETE "http://localhost:3000/flight-prices/1"
```

**响应示例：**

```json
{
  "id": 1,
  "countryCode": "JP",
  "originCity": "PEK",
  "lowSeasonPrice": 2500,
  "highSeasonPrice": 6000,
  "averagePrice": 4250,
  "visaCost": 0,
  "source": "手动估算",
  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "notes": "价格包含税费，不含行李费",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

## ❌ 错误响应

所有接口在出错时都会返回标准的错误响应：

```json
{
  "statusCode": 400,
  "message": "月份必须在 1-12 之间",
  "error": "Bad Request"
}
```

```json
{
  "statusCode": 404,
  "message": "价格参考数据 ID 1 不存在",
  "error": "Not Found"
}
```

**常见错误码：**

| 状态码 | 说明 |
|--------|------|
| 400 | Bad Request - 请求参数错误 |
| 404 | Not Found - 资源不存在 |
| 500 | Internal Server Error - 服务器内部错误 |

---

## 📚 使用场景示例

### 场景 1：查询国内航线价格（最常用）

```bash
# 查询成都到深圳，10月，周一的价格
curl "http://localhost:3000/flight-prices/domestic/estimate?originCity=成都&destinationCity=深圳&month=10&dayOfWeek=0"
```

### 场景 2：查询价格趋势（用于图表展示）

```bash
# 查看成都到深圳全年价格趋势
curl "http://localhost:3000/flight-prices/domestic/monthly-trend?originCity=成都&destinationCity=深圳"
```

### 场景 3：查询周内因子（了解哪天最便宜）

```bash
# 查看一周内哪天最便宜
curl "http://localhost:3000/flight-prices/day-of-week-factors"
```

### 场景 4：估算国际航线价格

```bash
# 估算日本机票+签证成本
curl "http://localhost:3000/flight-prices/estimate?countryCode=JP&useConservative=true"
```

---

## 🔧 Swagger 文档

启动服务后，访问 Swagger UI 查看完整的 API 文档和在线测试：

```
http://localhost:3000/api
```

所有接口都在 `flight-prices` 标签下。

---

## 📝 数据说明

### 国内航线数据来源

- **数据来源**：2023-2024年中国航空航班历史数据
- **计算公式**：`预算价格 = 月度基准价 (P_month) × 周内因子 (F_day)`
- **数据更新**：建议每月更新一次历史数据

### 国际航线数据来源

- **数据来源**：手动维护的估算数据库
- **价格类型**：淡季价格、旺季价格、平均价格
- **签证费用**：包含在总成本中，0 表示免签或落地签

---

## 🔍 SQL 查询参考

如果需要直接查询数据库，可以参考 `query-flight-price.sql` 文件中的 SQL 查询语句。

---

**最后更新：** 2024-12-10
