# 酒店价格估算 API 文档

## 📋 概述

酒店价格估算 API 基于两张查找表进行价格估算：
1. **HotelPriceDetail** - 城市基础价格（从季度数据聚合）
2. **StarCityPriceDetail** - 城市-星级质量调整因子（从季度数据聚合）

**数据来源：**
- `RawHotelData_Slim` - 酒店基本信息
- `HotelWideData_Quarterly` - 2018-2024年季度价格数据（按城市、星级）

## 🌐 基础路径

所有接口的基础路径：`/hotels`

---

## 🏨 酒店价格接口

### 1. 估算酒店价格 ⭐

**接口：** `GET /hotels/price/estimate`

**描述：** 根据城市、星级、年份和季度估算酒店价格。

**估算公式：**
```
价格 = 基础价格 × 城市-星级因子

如果提供了年份和季度，优先使用该季度的实际价格数据
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| city | string | ✅ | 城市名称 | `洛阳市` |
| starRating | number | ✅ | 星级（1-5） | `4` |
| year | number | ❌ | 年份（用于季度估算） | `2024` |
| quarter | number | ❌ | 季度（1-4，需要配合year使用） | `1` |

**请求示例：**

```bash
# 估算洛阳市4星级酒店价格
curl "http://localhost:3000/hotels/price/estimate?city=洛阳市&starRating=4"

# 估算2024年第一季度的价格
curl "http://localhost:3000/hotels/price/estimate?city=洛阳市&starRating=4&year=2024&quarter=1"
```

**响应示例：**

```json
{
  "estimatedPrice": 450,
  "lowerBound": 360,
  "upperBound": 540,
  "basePrice": 400,
  "cityStarFactor": 1.125,
  "quarterPrice": 420,
  "sampleCount": 150
}
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| estimatedPrice | number | 估算价格（元），主要返回值 |
| lowerBound | number | 价格下限（估算价格 × 0.8） |
| upperBound | number | 价格上限（估算价格 × 1.2） |
| basePrice | number | 基础价格（城市中位数或季度价格） |
| cityStarFactor | number | 城市-星级因子（质量调整因子） |
| quarterPrice | number? | 季度价格（如果提供了年份和季度） |
| sampleCount | number | 样本数量 |

**错误响应：**

```json
{
  "statusCode": 400,
  "message": "星级必须在 1-5 之间",
  "error": "Bad Request"
}
```

---

### 2. 获取城市的所有星级价格选项

**接口：** `GET /hotels/price/city-options`

**描述：** 返回指定城市所有星级的价格选项，用于展示不同星级的价格对比。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| city | string | ✅ | 城市名称 | `洛阳市` |

**请求示例：**

```bash
curl "http://localhost:3000/hotels/price/city-options?city=洛阳市"
```

**响应示例：**

```json
[
  {
    "starRating": 1,
    "avgPrice": 150,
    "cityStarFactor": 0.75,
    "sampleCount": 50,
    "minPrice": 100,
    "maxPrice": 200
  },
  {
    "starRating": 2,
    "avgPrice": 250,
    "cityStarFactor": 1.25,
    "sampleCount": 80,
    "minPrice": 180,
    "maxPrice": 350
  },
  {
    "starRating": 3,
    "avgPrice": 350,
    "cityStarFactor": 1.75,
    "sampleCount": 120,
    "minPrice": 250,
    "maxPrice": 500
  },
  {
    "starRating": 4,
    "avgPrice": 500,
    "cityStarFactor": 2.5,
    "sampleCount": 150,
    "minPrice": 350,
    "maxPrice": 800
  },
  {
    "starRating": 5,
    "avgPrice": 800,
    "cityStarFactor": 4.0,
    "sampleCount": 60,
    "minPrice": 600,
    "maxPrice": 1200
  }
]
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| starRating | number | 星级（1-5） |
| avgPrice | number | 该星级的平均价格（元） |
| cityStarFactor | number | 城市-星级因子（相对于该城市平均价的倍数） |
| sampleCount | number | 样本数量 |
| minPrice | number? | 最低价格（元） |
| maxPrice | number? | 最高价格（元） |

---

### 3. 获取季度价格趋势

**接口：** `GET /hotels/price/quarterly-trend`

**描述：** 返回指定城市（和星级）的季度价格趋势数据，用于展示价格走势图。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| city | string | ✅ | 城市名称 | `洛阳市` |
| starRating | number | ❌ | 星级（可选，不指定则返回该城市所有星级的数据） | `4` |

**请求示例：**

```bash
# 获取洛阳市所有星级的季度趋势
curl "http://localhost:3000/hotels/price/quarterly-trend?city=洛阳市"

# 获取洛阳市4星级的季度趋势
curl "http://localhost:3000/hotels/price/quarterly-trend?city=洛阳市&starRating=4"
```

**响应示例：**

```json
[
  {
    "year": 2018,
    "quarter": 1,
    "price": 380
  },
  {
    "year": 2018,
    "quarter": 2,
    "price": 420
  },
  {
    "year": 2018,
    "quarter": 3,
    "price": 450
  },
  {
    "year": 2018,
    "quarter": 4,
    "price": 400
  },
  {
    "year": 2019,
    "quarter": 1,
    "price": 390
  }
]
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| year | number | 年份（2018-2024） |
| quarter | number | 季度（1-4） |
| price | number | 该季度的价格（元） |

---

## 🔄 数据聚合

### 运行聚合脚本

在导入原始数据后，需要运行聚合脚本生成查找表：

```bash
npx ts-node --project tsconfig.backend.json scripts/aggregate-hotel-price-tables.ts
```

**脚本功能：**
1. 从 `HotelWideData_Quarterly` 聚合生成 `HotelPriceDetail`（按城市）
2. 从 `HotelWideData_Quarterly` 聚合生成 `StarCityPriceDetail`（按城市和星级）

---

## 💡 使用场景

### 场景 1: 快速价格估算

```bash
# 估算洛阳市4星级酒店价格
curl "http://localhost:3000/hotels/price/estimate?city=洛阳市&starRating=4"
```

### 场景 2: 季度价格估算

```bash
# 估算2024年第一季度（春节旺季）的价格
curl "http://localhost:3000/hotels/price/estimate?city=洛阳市&starRating=4&year=2024&quarter=1"
```

### 场景 3: 星级价格对比

```bash
# 查看洛阳市所有星级的价格选项
curl "http://localhost:3000/hotels/price/city-options?city=洛阳市"
```

### 场景 4: 价格趋势分析

```bash
# 查看洛阳市4星级酒店的价格趋势
curl "http://localhost:3000/hotels/price/quarterly-trend?city=洛阳市&starRating=4"
```

---

## 📊 数据导入

### 1. 导入酒店基本信息

```sql
\copy "RawHotelData_Slim"(id, name, brand, address, city, district, lat, lng, phone, type, adcode)
FROM 'downloads/hotel_basic_info.csv'
WITH (FORMAT csv, DELIMITER ',', HEADER TRUE, ENCODING 'UTF8');
```

### 2. 导入季度价格数据

```sql
\copy "HotelWideData_Quarterly" (city,"starRating","2018_Q1","2018_Q2","2018_Q3","2018_Q4","2019_Q1","2019_Q2","2019_Q3","2019_Q4","2020_Q1","2020_Q2","2020_Q3","2020_Q4","2021_Q1","2021_Q2","2021_Q3","2021_Q4","2022_Q1","2022_Q2","2022_Q3","2022_Q4","2023_Q1","2023_Q2","2023_Q3","2023_Q4","2024_Q1") 
FROM PROGRAM 'sed -e "s/\bN\/A\b//g" -e "s/－//g" downloads/hotel_star_quarterly_prices.csv | cut -d, -f1-27' 
WITH (FORMAT csv, HEADER TRUE, ENCODING 'UTF8', NULL '', FORCE_NULL ("starRating","2018_Q1","2018_Q2","2018_Q3","2018_Q4","2019_Q1","2019_Q2","2019_Q3","2019_Q4","2020_Q1","2020_Q2","2020_Q3","2020_Q4","2021_Q1","2021_Q2","2021_Q3","2021_Q4","2022_Q1","2022_Q2","2022_Q3","2022_Q4","2023_Q1","2023_Q2","2023_Q3","2023_Q4","2024_Q1"));
```

### 3. 运行聚合脚本

```bash
npx ts-node --project tsconfig.backend.json scripts/aggregate-hotel-price-tables.ts
```

---

## 📚 相关文档

- **数据结构说明：** `docs/HOTEL-DATA-STRUCTURE.md`
- **表设计说明：** `docs/HOTEL-PRICE-TABLES.md`
- **聚合脚本：** `scripts/aggregate-hotel-price-tables.ts`

---

## 🔧 Swagger 文档

启动服务后，访问 Swagger UI 查看完整的 API 文档：

```
http://localhost:3000/api
```

所有接口都在 `hotels` 标签下。

---

**最后更新：** 2025-12-10
