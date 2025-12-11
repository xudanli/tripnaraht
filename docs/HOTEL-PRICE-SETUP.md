# 酒店价格功能设置指南

## ✅ 已完成的工作

### 1. 数据库表结构
- ✅ `RawHotelData_Slim` - 酒店基本信息表（已定义）
- ✅ `HotelWideData_Quarterly` - 季度价格数据表（已定义）
- ✅ `HotelPriceDetail` - 城市基础价格查找表（已定义）
- ✅ `StarCityPriceDetail` - 城市-星级质量因子查找表（已定义）

### 2. 代码实现
- ✅ `src/hotels/services/hotel-price.service.ts` - 价格估算服务
- ✅ `src/hotels/hotels.controller.ts` - API 控制器
- ✅ `src/hotels/hotels.module.ts` - 模块定义
- ✅ `src/app.module.ts` - 已注册 HotelsModule

### 3. 数据聚合脚本
- ✅ `scripts/aggregate-hotel-price-tables.ts` - 从原始数据聚合生成查找表

### 4. 文档
- ✅ `docs/HOTEL-PRICE-API.md` - API 接口文档
- ✅ `docs/HOTEL-DATA-STRUCTURE.md` - 数据结构说明

---

## 🚀 使用步骤

### 步骤 1: 导入原始数据

#### 1.1 导入酒店基本信息

```sql
\copy "RawHotelData_Slim"(id, name, brand, address, city, district, lat, lng, phone, type, adcode)
FROM 'downloads/hotel_basic_info.csv'
WITH (FORMAT csv, DELIMITER ',', HEADER TRUE, ENCODING 'UTF8');
```

#### 1.2 导入季度价格数据

```sql
\copy "HotelWideData_Quarterly" (city,"starRating","2018_Q1","2018_Q2","2018_Q3","2018_Q4","2019_Q1","2019_Q2","2019_Q3","2019_Q4","2020_Q1","2020_Q2","2020_Q3","2020_Q4","2021_Q1","2021_Q2","2021_Q3","2021_Q4","2022_Q1","2022_Q2","2022_Q3","2022_Q4","2023_Q1","2023_Q2","2023_Q3","2023_Q4","2024_Q1") 
FROM PROGRAM 'sed -e "s/\bN\/A\b//g" -e "s/－//g" downloads/hotel_star_quarterly_prices.csv | cut -d, -f1-27' 
WITH (FORMAT csv, HEADER TRUE, ENCODING 'UTF8', NULL '', FORCE_NULL ("starRating","2018_Q1","2018_Q2","2018_Q3","2018_Q4","2019_Q1","2019_Q2","2019_Q3","2019_Q4","2020_Q1","2020_Q2","2020_Q3","2020_Q4","2021_Q1","2021_Q2","2021_Q3","2021_Q4","2022_Q1","2022_Q2","2022_Q3","2022_Q4","2023_Q1","2023_Q2","2023_Q3","2023_Q4","2024_Q1"));
```

### 步骤 2: 运行数据聚合脚本

```bash
npx ts-node --project tsconfig.backend.json scripts/aggregate-hotel-price-tables.ts
```

**脚本功能：**
- 从 `HotelWideData_Quarterly` 聚合生成 `HotelPriceDetail`（按城市）
- 从 `HotelWideData_Quarterly` 聚合生成 `StarCityPriceDetail`（按城市和星级）

### 步骤 3: 验证数据

```bash
# 检查查找表数据
npx ts-node --project tsconfig.backend.json scripts/check-hotel-tables-exist.ts
```

### 步骤 4: 测试 API

```bash
# 估算酒店价格
curl "http://localhost:3000/hotels/price/estimate?city=洛阳市&starRating=4"

# 获取城市所有星级选项
curl "http://localhost:3000/hotels/price/city-options?city=洛阳市"

# 获取季度价格趋势
curl "http://localhost:3000/hotels/price/quarterly-trend?city=洛阳市&starRating=4"
```

---

## 📊 API 接口列表

### 1. 估算酒店价格
- **接口：** `GET /hotels/price/estimate`
- **参数：** `city`, `starRating`, `year?`, `quarter?`
- **返回：** 估算价格、价格范围、基础价格、调整因子等

### 2. 获取城市星级选项
- **接口：** `GET /hotels/price/city-options`
- **参数：** `city`
- **返回：** 该城市所有星级的价格选项

### 3. 获取季度价格趋势
- **接口：** `GET /hotels/price/quarterly-trend`
- **参数：** `city`, `starRating?`
- **返回：** 季度价格趋势数据

---

## 🔄 数据流程

```
原始数据导入
  ↓
RawHotelData_Slim (酒店基本信息)
HotelWideData_Quarterly (季度价格数据)
  ↓
运行聚合脚本
  ↓
HotelPriceDetail (城市基础价格)
StarCityPriceDetail (城市-星级质量因子)
  ↓
API 接口查询
  ↓
价格估算结果
```

---

## 📝 估算公式

### 基础公式
```
估算价格 = 基础价格 × 城市-星级因子
```

### 详细流程

1. **获取城市基础价格**：
   - 从 `HotelPriceDetail` 获取 `medianPrice`（基于 city）

2. **获取质量调整因子**：
   - 从 `StarCityPriceDetail` 获取 `cityStarFactor`（基于 city + starRating）

3. **可选：获取季度价格**：
   - 如果提供了 year 和 quarter，从 `HotelWideData_Quarterly` 获取该季度的实际价格
   - 优先使用季度价格作为基础价格

4. **计算最终价格**：
   ```
   if (季度价格存在) {
     基础价格 = 季度价格
   } else {
     基础价格 = medianPrice (城市基础价格)
   }
   
   最终价格 = 基础价格 × cityStarFactor
   ```

---

## ⚠️ 注意事项

1. **数据导入顺序**：
   - 先导入原始数据（RawHotelData_Slim, HotelWideData_Quarterly）
   - 再运行聚合脚本生成查找表

2. **季度字段名**：
   - 季度字段名是数字开头的（如 "2018_Q1"），需要使用 Prisma.raw 或 $queryRawUnsafe 查询

3. **数据更新**：
   - 如果更新了原始数据，需要重新运行聚合脚本

4. **城市名称匹配**：
   - 确保 API 查询时使用的城市名称与数据库中的名称一致

---

## 🔍 故障排查

### 问题 1: 找不到城市数据

**原因：** 城市名称不匹配

**解决：** 检查数据库中的实际城市名称
```sql
SELECT DISTINCT city FROM "HotelPriceDetail" ORDER BY city;
```

### 问题 2: 聚合脚本失败

**原因：** 原始数据表为空或字段不匹配

**解决：** 
1. 检查原始数据是否已导入
2. 检查字段名是否正确

### 问题 3: API 返回默认值

**原因：** 查找表数据未生成

**解决：** 运行聚合脚本生成查找表

---

## 📚 相关文件

- **API 文档：** `docs/HOTEL-PRICE-API.md`
- **数据结构：** `docs/HOTEL-DATA-STRUCTURE.md`
- **聚合脚本：** `scripts/aggregate-hotel-price-tables.ts`
- **服务代码：** `src/hotels/services/hotel-price.service.ts`
- **控制器代码：** `src/hotels/hotels.controller.ts`

---

**最后更新：** 2025-12-10
