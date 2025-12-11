# 酒店数据结构说明

## 📋 数据源

### 1. 原始酒店基本信息表：RawHotelData_Slim

**数据来源：** `hotel_basic_info.csv`

**字段说明：**

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| id | String | 酒店ID（主键） | `B0K1PZBE68` |
| name | String? | 酒店名称 | `桔子酒店(洛阳龙门站店)` |
| brand | String? | 品牌 | `桔子` |
| address | String? | 地址 | `通衢路与厚载门街交叉口西南角新唐街3号楼` |
| city | String? | 城市 | `洛阳市` |
| district | String? | 区县 | `洛龙区` |
| lat | Float? | 纬度 | `34.596104` |
| lng | Float? | 经度 | `112.46321` |
| phone | String? | 电话 | `0379-63168888;18603798508` |
| type | String? | 类型 | `住宿服务;宾馆酒店;宾馆酒店` |
| adcode | String? | 行政区划代码 | `410300` |

**导入命令：**
```sql
\copy "RawHotelData_Slim"(id, name, brand, address, city, district, lat, lng, phone, type, adcode)
FROM 'downloads/hotel_basic_info.csv'
WITH (FORMAT csv, DELIMITER ',', HEADER TRUE, ENCODING 'UTF8');
```

---

### 2. 酒店季度价格数据表：HotelWideData_Quarterly

**数据来源：** `hotel_star_quarterly_prices.csv`

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int | 自增ID（主键） |
| city | String? | 城市名称 |
| starRating | Int? | 星级（1-5） |
| 2018_Q1 ~ 2024_Q1 | Float? | 各季度价格（共27个季度字段） |

**季度字段列表：**
- 2018: Q1, Q2, Q3, Q4
- 2019: Q1, Q2, Q3, Q4
- 2020: Q1, Q2, Q3, Q4
- 2021: Q1, Q2, Q3, Q4
- 2022: Q1, Q2, Q3, Q4
- 2023: Q1, Q2, Q3, Q4
- 2024: Q1

**导入命令：**
```sql
\copy "HotelWideData_Quarterly" (city,"starRating","2018_Q1","2018_Q2","2018_Q3","2018_Q4","2019_Q1","2019_Q2","2019_Q3","2019_Q4","2020_Q1","2020_Q2","2020_Q3","2020_Q4","2021_Q1","2021_Q2","2021_Q3","2021_Q4","2022_Q1","2022_Q2","2022_Q3","2022_Q4","2023_Q1","2023_Q2","2023_Q3","2023_Q4","2024_Q1") 
FROM PROGRAM 'sed -e "s/\bN\/A\b//g" -e "s/－//g" downloads/hotel_star_quarterly_prices.csv | cut -d, -f1-27' 
WITH (FORMAT csv, HEADER TRUE, ENCODING 'UTF8', NULL '', FORCE_NULL ("starRating","2018_Q1","2018_Q2","2018_Q3","2018_Q4","2019_Q1","2019_Q2","2019_Q3","2019_Q4","2020_Q1","2020_Q2","2020_Q3","2020_Q4","2021_Q1","2021_Q2","2021_Q3","2021_Q4","2022_Q1","2022_Q2","2022_Q3","2022_Q4","2023_Q1","2023_Q2","2023_Q3","2023_Q4","2024_Q1"));
```

---

## 🔄 数据聚合思路

基于这两张原始表，可以聚合生成查找表：

### 查找表一：HotelPriceDetail（时间维度）

**聚合维度：** `city`（仅城市，无月份和周末维度）

**聚合逻辑：**
```sql
-- 从 HotelWideData_Quarterly 聚合
-- 计算每个城市所有季度、所有星级的平均价格和中位数
SELECT 
  city,
  AVG(all_quarterly_prices) as avgPrice,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY all_quarterly_prices) as medianPrice,
  AVG(all_quarterly_prices) / (SELECT AVG(all_quarterly_prices) FROM all_cities) as cityFactor,
  COUNT(*) as sampleCount
FROM (
  SELECT city, 
    UNNEST(ARRAY["2018_Q1","2018_Q2",...,"2024_Q1"]) as all_quarterly_prices
  FROM "HotelWideData_Quarterly"
  WHERE all_quarterly_prices IS NOT NULL
) subquery
GROUP BY city
```

### 查找表二：StarCityPriceDetail（质量维度）

**聚合维度：** `city`, `starRating`

**聚合逻辑：**
```sql
-- 从 HotelWideData_Quarterly 聚合
-- 计算每个城市-星级组合的平均价格
WITH city_avg AS (
  SELECT city, AVG(all_prices) as city_avg_price
  FROM (
    SELECT city, 
      UNNEST(ARRAY["2018_Q1","2018_Q2",...,"2024_Q1"]) as all_prices
    FROM "HotelWideData_Quarterly"
    WHERE all_prices IS NOT NULL
  ) subquery
  GROUP BY city
)
SELECT 
  h.city,
  h."starRating",
  AVG(all_prices) as avgPrice,
  AVG(all_prices) / ca.city_avg_price as cityStarFactor,
  COUNT(*) as sampleCount
FROM (
  SELECT city, "starRating",
    UNNEST(ARRAY["2018_Q1","2018_Q2",...,"2024_Q1"]) as all_prices
  FROM "HotelWideData_Quarterly"
  WHERE all_prices IS NOT NULL
) h
JOIN city_avg ca ON h.city = ca.city
GROUP BY h.city, h."starRating", ca.city_avg_price
```

---

## 📊 表关系

```
RawHotelData_Slim (酒店基本信息)
  ├─ id (酒店ID)
  ├─ city (城市)
  └─ brand (品牌)

HotelWideData_Quarterly (季度价格数据)
  ├─ city (城市)
  ├─ starRating (星级)
  └─ 2018_Q1 ~ 2024_Q1 (季度价格)

↓ 聚合生成 ↓

HotelPriceDetail (城市基础价格)
  └─ city → medianPrice, cityFactor

StarCityPriceDetail (城市-星级价格)
  └─ city + starRating → avgPrice, cityStarFactor
```

---

## 🎯 价格估算流程

1. **根据城市获取基础价格**：
   - 从 `HotelPriceDetail` 获取 `medianPrice`（基于 city）

2. **根据城市和星级获取质量调整因子**：
   - 从 `StarCityPriceDetail` 获取 `cityStarFactor`（基于 city + starRating）

3. **根据季度获取时间调整**：
   - 从 `HotelWideData_Quarterly` 获取对应季度的价格
   - 或使用季度因子进行调整

4. **最终价格**：
   ```
   estimatedPrice = basePrice × cityStarFactor × quarterFactor
   ```

---

## 📝 下一步

1. ✅ **表结构已定义** - RawHotelData_Slim 和 HotelWideData_Quarterly
2. ⏳ **导入数据** - 使用提供的 SQL 命令导入 CSV 数据
3. ⏳ **创建聚合脚本** - 从原始数据聚合生成查找表
4. ⏳ **实现价格估算服务** - 基于查找表进行价格估算
5. ⏳ **创建 API 接口** - 提供酒店价格估算接口

---

**最后更新：** 2025-12-10
