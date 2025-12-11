# 酒店推荐功能文档

## 📋 概述

酒店价格估算 API 现在支持在返回价格估算的同时，推荐符合条件的星级酒店。推荐功能基于 `RawHotelData_Slim` 表中的酒店基本信息，并根据品牌推断星级。

## 🌐 API 接口

### 1. 价格估算 + 推荐酒店（组合接口）

**接口：** `GET /hotels/price/estimate`

**新增参数：**

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| includeRecommendations | boolean | ❌ | 是否包含推荐酒店（默认 false） | `true` |
| recommendationLimit | number | ❌ | 推荐酒店数量（默认 5） | `10` |

**请求示例：**

```bash
# 估算价格并获取推荐酒店
curl "http://localhost:3000/hotels/price/estimate?city=洛阳&starRating=4&includeRecommendations=true&recommendationLimit=5"
```

**响应示例：**

```json
{
  "estimatedPrice": 291,
  "lowerBound": 217,
  "upperBound": 378,
  "basePrice": 291.848,
  "cityStarFactor": 0.8127,
  "sampleCount": 25,
  "recommendations": [
    {
      "id": "B0K1PZBE68",
      "name": "桔子酒店(洛阳龙门站店)",
      "brand": "桔子",
      "address": "通衢路与厚载门街交叉口西南角新唐街3号楼",
      "district": "洛龙区",
      "lat": 34.596104,
      "lng": 112.46321,
      "phone": "0379-63168888;18603798508"
    }
  ]
}
```

---

### 2. 独立推荐接口

**接口：** `GET /hotels/recommendations`

**描述：** 根据城市、星级和价格范围推荐酒店，不返回价格估算。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| city | string | ✅ | 城市名称 | `洛阳` |
| starRating | number | ✅ | 星级（1-5） | `4` |
| minPrice | number | ❌ | 最低价格（元） | `200` |
| maxPrice | number | ❌ | 最高价格（元） | `500` |
| limit | number | ❌ | 返回数量限制（默认 10） | `10` |

**请求示例：**

```bash
# 推荐洛阳4星级酒店
curl "http://localhost:3000/hotels/recommendations?city=洛阳&starRating=4&limit=10"
```

**响应示例：**

```json
[
  {
    "id": "B0K1PZBE68",
    "name": "桔子酒店(洛阳龙门站店)",
    "brand": "桔子",
    "address": "通衢路与厚载门街交叉口西南角新唐街3号楼",
    "district": "洛龙区",
    "lat": 34.596104,
    "lng": 112.46321,
    "phone": "0379-63168888;18603798508"
  },
  {
    "id": "B0K2ABC123",
    "name": "全季酒店(洛阳中心店)",
    "brand": "全季",
    "address": "中州路123号",
    "district": "西工区",
    "lat": 34.612345,
    "lng": 112.456789,
    "phone": "0379-12345678"
  }
]
```

---

## 🔍 推荐逻辑

### 星级推断

由于 `RawHotelData_Slim` 表中没有直接的星级字段，系统通过品牌名称推断星级：

**5星品牌：**
- 希尔顿、万豪、喜来登、洲际、丽思卡尔顿、四季、凯悦、香格里拉、瑞吉、W酒店

**4星品牌：**
- 皇冠假日、假日、智选假日、万怡、福朋、雅高、诺富特、美居、桔子、全季、亚朵

**3星品牌：**
- 如家、汉庭、锦江

**2星品牌：**
- 7天

### 筛选规则

1. **城市匹配：** 根据城市名称（支持"洛阳市"或"洛阳"）查询酒店
2. **星级匹配：** 根据品牌推断的星级与目标星级匹配
3. **价格范围：** 如果提供了价格范围，会基于估算价格的范围进行筛选（目前仅用于排序，实际价格需要从其他数据源获取）

---

## 💡 使用场景

### 场景 1: 价格估算 + 推荐

```bash
# 估算洛阳4星级酒店价格，并获取5家推荐酒店
curl "http://localhost:3000/hotels/price/estimate?city=洛阳&starRating=4&includeRecommendations=true&recommendationLimit=5"
```

**适用场景：**
- 用户想了解价格，同时查看可选的酒店
- 一站式获取价格和酒店信息

### 场景 2: 仅获取推荐

```bash
# 只获取推荐酒店，不关心价格估算
curl "http://localhost:3000/hotels/recommendations?city=洛阳&starRating=4&limit=10"
```

**适用场景：**
- 用户已经知道价格，只需要酒店列表
- 快速浏览可选酒店

### 场景 3: 指定价格范围

```bash
# 在指定价格范围内推荐酒店
curl "http://localhost:3000/hotels/recommendations?city=洛阳&starRating=4&minPrice=200&maxPrice=400&limit=10"
```

**适用场景：**
- 用户有明确的预算范围
- 筛选符合预算的酒店

---

## 📊 数据来源

- **酒店基本信息：** `RawHotelData_Slim` 表
- **价格估算：** `HotelPriceDetail` 和 `StarCityPriceDetail` 表
- **季度价格：** `HotelWideData_Quarterly` 表（可选）

---

## ⚠️ 注意事项

1. **星级推断限制：**
   - 如果酒店品牌不在映射表中，无法推断星级
   - 无法推断星级的酒店也会返回（让用户自行判断）

2. **城市名称匹配：**
   - 支持"洛阳市"或"洛阳"两种格式
   - 系统会自动处理"市"后缀

3. **价格范围：**
   - 目前价格范围主要用于排序和筛选逻辑
   - 实际价格需要从其他数据源获取（如第三方API）

4. **数据完整性：**
   - 推荐结果取决于 `RawHotelData_Slim` 表中的数据
   - 如果某个城市没有对应星级的酒店数据，可能返回空列表

---

## 🔄 未来改进

1. **价格数据集成：**
   - 从第三方API获取实时价格
   - 结合历史价格数据进行价格预测

2. **更精确的星级匹配：**
   - 扩展品牌映射表
   - 支持从酒店名称中提取星级信息

3. **地理位置筛选：**
   - 根据用户位置推荐附近的酒店
   - 支持按区域（district）筛选

4. **评分和评价：**
   - 集成用户评分数据
   - 按评分排序推荐

---

## 📚 相关文档

- **价格估算 API：** `docs/HOTEL-PRICE-API.md`
- **数据结构说明：** `docs/HOTEL-DATA-STRUCTURE.md`
- **设置指南：** `docs/HOTEL-PRICE-SETUP.md`

---

**最后更新：** 2025-12-10
