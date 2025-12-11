# 酒店价格表设计说明

## 📋 概述

酒店价格估算系统使用两张查找表来捕捉不同维度的价格变化：

1. **HotelPriceDetail** - 城市维度（城市基础价格）
2. **StarCityPriceDetail** - 质量维度（城市溢价、酒店星级）

## 📊 表一：HotelPriceDetail（城市维度）

### 用途
捕捉城市维度的价格变化，提供每个城市的基础价格水平。

**注意**：由于没有月份和周末数据，此表仅按城市维度聚合。

### 表结构

```prisma
model HotelPriceDetail {
  id            Int      @id @default(autoincrement())
  city          String   @unique  // 城市名称（唯一）
  avgPrice      Float    // 该城市下的平均价格
  medianPrice   Float    // 该城市下的价格中位数（更稳健的估算基准）
  cityFactor    Float    // avgPrice / overall_avg_price（相对于全国平均价格的调整程度）
  sampleCount   Int      @default(0)
  minPrice      Float?
  maxPrice      Float?
  stdDev        Float?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([city])
}
```

### 字段说明

| 字段 | 类型 | 说明 | 计算公式/作用 |
|------|------|------|---------------|
| **聚合维度** |
| city | String | 城市名称 | 确定在哪个城市（唯一） |
| **价格统计** |
| avgPrice | Float | 平均价格 | 该城市下的平均价格，提供价格基准 |
| medianPrice | Float | 价格中位数 | `PERCENTILE_CONT(0.5)`，更稳健的估算基准，受极端值影响小 |
| cityFactor | Float | 城市因子 | `avgPrice / overall_avg_price`，衡量该城市的价格相对于全国平均价格的调整程度 |
| **统计信息** |
| sampleCount | Int | 样本数量 | 用于验证数据可靠性 |
| minPrice | Float? | 最低价格 | 价格范围下限 |
| maxPrice | Float? | 最高价格 | 价格范围上限 |
| stdDev | Float? | 标准差 | 价格波动程度 |

### 估算角色

- **提供基础价格**：在最终估算公式中，`medianPrice` 作为该城市的基础价格
- **城市调整因子**：`cityFactor` 用于衡量该城市相对于全国平均价格的调整程度

### 数据聚合逻辑

```sql
-- 示例：聚合逻辑（仅按城市）
SELECT 
  city,
  AVG(price) as avgPrice,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) as medianPrice,
  AVG(price) / (SELECT AVG(price) FROM all_hotels) as cityFactor,
  COUNT(*) as sampleCount,
  MIN(price) as minPrice,
  MAX(price) as maxPrice,
  STDDEV(price) as stdDev
FROM hotel_data
GROUP BY city
```

---

## 📊 表二：StarCityPriceDetail（质量维度）

### 用途
捕捉质量维度上的价格变化，即价格如何受到：
- **城市溢价**：不同城市的价格水平差异
- **酒店质量（星级）**：1-5 星级的价格差异

### 表结构

```prisma
model StarCityPriceDetail {
  id              Int      @id @default(autoincrement())
  city            String   // 城市名称
  starRating      Int      // 星级（1-5）
  avgPrice        Float    // 该城市-星级组合的平均价格
  cityStarFactor  Float    // (城市-星级平均价) / (该城市所有酒店的整体平均价)
  sampleCount     Int      @default(0)
  minPrice        Float?
  maxPrice        Float?
  stdDev          Float?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([city, starRating])
  @@index([city])
  @@index([starRating])
  @@index([city, starRating])
}
```

### 字段说明

| 字段 | 类型 | 说明 | 计算公式/作用 |
|------|------|------|---------------|
| **聚合维度** |
| city | String | 城市名称 | 确定在哪个城市 |
| starRating | Int | 星级（1-5） | 确定酒店质量等级 |
| **价格统计** |
| avgPrice | Float | 平均价格 | 该城市特定星级的平均价格 |
| cityStarFactor | Float | 城市-星级因子 | `(城市-星级平均价) / (该城市所有酒店的整体平均价)`，衡量在特定城市中，该星级酒店相对于该城市所有酒店的价格溢价或折价程度 |
| **统计信息** |
| sampleCount | Int | 样本数量 | 用于验证数据可靠性 |
| minPrice | Float? | 最低价格 | 价格范围下限 |
| maxPrice | Float? | 最高价格 | 价格范围上限 |
| stdDev | Float? | 标准差 | 价格波动程度 |

### 估算角色

- **提供质量调整因子**：在最终估算公式中，`cityStarFactor` 充当质量调整因子
- **示例**：某城市 5 星酒店比该城市平均价贵 1.5 倍（cityStarFactor = 1.5）

### 数据聚合逻辑

```sql
-- 示例：聚合逻辑
WITH city_avg AS (
  SELECT city, AVG(price) as city_avg_price
  FROM hotel_data
  GROUP BY city
)
SELECT 
  h.city,
  h.starRating,
  AVG(h.price) as avgPrice,
  AVG(h.price) / ca.city_avg_price as cityStarFactor,
  COUNT(*) as sampleCount,
  MIN(h.price) as minPrice,
  MAX(h.price) as maxPrice,
  STDDEV(h.price) as stdDev
FROM hotel_data h
JOIN city_avg ca ON h.city = ca.city
GROUP BY h.city, h.starRating, ca.city_avg_price
```

---

## 🔄 估算公式

结合两张表的价格估算公式：

```
最终估算价格 = medianPrice (HotelPriceDetail) × cityStarFactor (StarCityPriceDetail)
```

### 估算流程

1. **城市维度调整**：
   - 根据 `city` 从 `HotelPriceDetail` 获取 `medianPrice`
   - 如果找不到该城市，使用默认价格或 `cityFactor` 进行调整

2. **质量维度调整**：
   - 根据 `city`, `starRating` 从 `StarCityPriceDetail` 获取 `cityStarFactor`
   - 应用质量调整因子

3. **最终价格**：
   ```
   estimatedPrice = medianPrice × cityStarFactor
   ```

---

## 📝 索引设计

### HotelPriceDetail 索引
- `city` 字段设置为 `@unique` - 确保每个城市只有一条记录
- `@@index([city])` - 支持按城市查询

### StarCityPriceDetail 索引
- `@@unique([city, starRating])` - 唯一约束，确保每个组合只有一条记录
- `@@index([city])` - 支持按城市查询
- `@@index([starRating])` - 支持按星级查询
- `@@index([city, starRating])` - 支持复合查询

---

## ✅ 验证检查清单

### HotelPriceDetail 表
- [x] 包含 `city` 聚合维度（无月份和周末维度）
- [x] 包含 `avgPrice` 和 `medianPrice` 价格字段
- [x] 包含 `cityFactor` 调整因子
- [x] 包含统计信息字段（sampleCount, minPrice, maxPrice, stdDev）
- [x] `city` 字段设置为 `@unique`，确保每个城市只有一条记录
- [x] 有适当的索引

### StarCityPriceDetail 表
- [x] 包含 `city`, `starRating` 聚合维度
- [x] 包含 `avgPrice` 价格字段
- [x] 包含 `cityStarFactor` 调整因子
- [x] 包含统计信息字段（sampleCount, minPrice, maxPrice, stdDev）
- [x] 有唯一约束 `[city, starRating]`
- [x] 有适当的索引

---

## 🚀 下一步

1. **运行 Migration**：
   ```bash
   npx prisma migrate dev --name add_hotel_price_tables
   ```

2. **生成 Prisma Client**：
   ```bash
   npx prisma generate
   ```

3. **创建数据导入脚本**：
   - 从原始酒店数据聚合到 `HotelPriceDetail`
   - 从原始酒店数据聚合到 `StarCityPriceDetail`

4. **创建价格估算服务**：
   - 实现基于两张表的估算逻辑
   - 创建 API 接口

---

**最后更新：** 2025-12-10
