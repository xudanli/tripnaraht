# 酒店价格表最终设计

## ✅ 最终表结构

### 表一：HotelPriceDetail（城市维度）

**聚合维度：** `city`（仅城市，无月份和周末维度）

**表结构：**
```prisma
model HotelPriceDetail {
  id            Int      @id @default(autoincrement())
  city          String   @unique  // 城市名称（唯一）
  avgPrice      Float    // 该城市下的平均价格
  medianPrice   Float    // 该城市下的价格中位数（更稳健的估算基准）
  cityFactor    Float    // avgPrice / overall_avg_price
  sampleCount   Int      @default(0)
  minPrice      Float?
  maxPrice      Float?
  stdDev        Float?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([city])
}
```

**字段说明：**
- `city` - 城市名称（唯一约束，每个城市一条记录）
- `medianPrice` - 价格中位数，作为基础价格
- `cityFactor` - 城市因子，相对于全国平均价格的调整程度

### 表二：StarCityPriceDetail（质量维度）

**聚合维度：** `city`, `starRating`

**表结构：**
```prisma
model StarCityPriceDetail {
  id              Int      @id @default(autoincrement())
  city            String
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

**字段说明：**
- `city` + `starRating` - 城市和星级的组合（唯一约束）
- `avgPrice` - 该城市-星级组合的平均价格
- `cityStarFactor` - 质量调整因子，衡量该星级相对于该城市平均价的溢价/折价

---

## 🔄 估算公式

```
最终估算价格 = medianPrice (HotelPriceDetail, 基于 city) 
              × cityStarFactor (StarCityPriceDetail, 基于 city + starRating)
```

### 估算流程

1. **城市基础价格**：
   - 根据 `city` 从 `HotelPriceDetail` 获取 `medianPrice`
   - 如果找不到该城市，使用默认价格

2. **质量调整**：
   - 根据 `city`, `starRating` 从 `StarCityPriceDetail` 获取 `cityStarFactor`
   - 应用质量调整因子

3. **最终价格**：
   ```
   estimatedPrice = medianPrice × cityStarFactor
   ```

---

## 📊 数据聚合示例

### HotelPriceDetail 聚合（仅按城市）

```sql
-- 聚合逻辑
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

### StarCityPriceDetail 聚合（按城市和星级）

```sql
-- 聚合逻辑
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

## ✅ 验证结果

### HotelPriceDetail 表
- ✅ 字段：`id`, `city`, `avgPrice`, `medianPrice`, `cityFactor`, `sampleCount`, `minPrice`, `maxPrice`, `stdDev`, `createdAt`, `updatedAt`
- ✅ `city` 字段设置为 `@unique`
- ✅ 索引已创建

### StarCityPriceDetail 表
- ✅ 字段：`id`, `city`, `starRating`, `avgPrice`, `cityStarFactor`, `sampleCount`, `minPrice`, `maxPrice`, `stdDev`, `createdAt`, `updatedAt`
- ✅ 唯一约束：`[city, starRating]`
- ✅ 索引已创建

---

## 📝 下一步

1. ✅ **表结构已创建** - 数据库表已同步
2. ✅ **Prisma Client 已生成** - 可以开始使用
3. ⏳ **创建数据导入脚本** - 从原始酒店数据聚合到这两张表
4. ⏳ **实现价格估算服务** - 使用这两张表进行价格估算
5. ⏳ **创建 API 接口** - 提供酒店价格估算接口

---

**最后更新：** 2025-12-10
