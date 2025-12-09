# 机票价格参考 API 文档

## 概述

机票价格参考 API 提供了查询、创建、更新和删除机票价格参考数据的功能。这些数据用于在创建行程时自动估算机票和签证成本。

## 基础路径

所有接口的基础路径：`/flight-prices`

## 接口列表

### 1. 估算机票+签证成本

**接口：** `GET /flight-prices/estimate`

**描述：** 根据目的地国家代码和出发城市（可选）估算机票和签证的总成本。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| countryCode | string | 是 | 目的地国家代码（ISO 3166-1 alpha-2） | `JP` |
| originCity | string | 否 | 出发城市代码，如 "PEK"（北京）、"PVG"（上海） | `PEK` |
| useConservative | boolean | 否 | 是否使用保守估算（旺季价格），默认 `true` | `true` |

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

**使用示例：**

```bash
# 估算日本机票+签证成本（保守估算）
curl "http://localhost:3000/flight-prices/estimate?countryCode=JP&useConservative=true"

# 从北京出发到日本
curl "http://localhost:3000/flight-prices/estimate?countryCode=JP&originCity=PEK&useConservative=true"
```

---

### 2. 获取详细价格信息

**接口：** `GET /flight-prices/details`

**描述：** 返回指定目的地和出发城市的详细价格信息，包括淡季、旺季、平均价格和签证费用。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| countryCode | string | 是 | 目的地国家代码 | `JP` |
| originCity | string | 否 | 出发城市代码 | `PEK` |

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

**使用示例：**

```bash
curl "http://localhost:3000/flight-prices/details?countryCode=JP"
```

---

### 3. 获取所有价格参考数据

**接口：** `GET /flight-prices`

**描述：** 返回所有已配置的机票价格参考数据列表。

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

**使用示例：**

```bash
curl "http://localhost:3000/flight-prices"
```

---

### 4. 根据 ID 查询价格参考数据

**接口：** `GET /flight-prices/:id`

**描述：** 返回指定 ID 的价格参考数据详情。

**路径参数：**

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| id | number | 价格参考数据 ID | `1` |

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

**使用示例：**

```bash
curl "http://localhost:3000/flight-prices/1"
```

---

### 5. 创建价格参考数据

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
| countryCode | string | 是 | 目的地国家代码（ISO 3166-1 alpha-2） |
| originCity | string | 否 | 出发城市代码，如 "PEK"（北京）、"PVG"（上海）。如果为空则表示任意出发城市 |
| lowSeasonPrice | number | 是 | 淡季价格（人民币，元） |
| highSeasonPrice | number | 是 | 旺季价格（人民币，元） |
| visaCost | number | 否 | 签证费用（人民币，元），0 表示免签或落地签，默认 0 |
| source | string | 否 | 数据来源说明 |
| notes | string | 否 | 备注信息 |

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

**使用示例：**

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

---

### 6. 更新价格参考数据

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

**使用示例：**

```bash
curl -X PUT "http://localhost:3000/flight-prices/1" \
  -H "Content-Type: application/json" \
  -d '{
    "lowSeasonPrice": 2600,
    "highSeasonPrice": 6100,
    "notes": "已更新价格"
  }'
```

---

### 7. 删除价格参考数据

**接口：** `DELETE /flight-prices/:id`

**描述：** 删除指定 ID 的价格参考数据。

**路径参数：**

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| id | number | 价格参考数据 ID | `1` |

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

**使用示例：**

```bash
curl -X DELETE "http://localhost:3000/flight-prices/1"
```

---

## 错误响应

所有接口在出错时都会返回标准的错误响应：

```json
{
  "statusCode": 404,
  "message": "价格参考数据 ID 1 不存在",
  "error": "Not Found"
}
```

常见错误码：

- `400 Bad Request`: 请求参数错误
- `404 Not Found`: 资源不存在
- `500 Internal Server Error`: 服务器内部错误

---

## 数据填充

可以使用以下命令填充初始数据：

```bash
# 创建表（如果不存在）
npm run create:flight-table

# 填充数据
npm run seed:flight-prices
```

---

## 集成到行程创建

在创建行程时，系统会自动使用这些价格参考数据来估算机票和签证成本。估算结果会包含在 `budgetConfig.estimated_flight_visa` 字段中。

示例：

```json
{
  "budgetConfig": {
    "total": 20000,
    "currency": "CNY",
    "estimated_flight_visa": 6000,
    "remaining_for_ground": 14000,
    "daily_budget": 2000,
    "hotel_tier_recommendation": "4-Star"
  }
}
```

---

## Swagger 文档

启动服务后，可以访问 Swagger 文档查看完整的 API 文档：

```
http://localhost:3000/api
```

在 Swagger UI 中，所有接口都在 `flight-prices` 标签下。

