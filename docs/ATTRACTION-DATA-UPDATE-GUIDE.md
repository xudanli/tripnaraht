# 景点详细信息更新指南

## 概述

由于马蜂窝网站使用了反爬虫机制，自动爬取详细信息可能会被拦截。本指南提供了两种方式来更新景点的详细信息：

1. **手动数据更新**：通过JSON文件批量更新景点详细信息
2. **SQL查询**：查询已保存的景点详细信息

## 方法一：手动数据更新

### 1. 生成示例文件

```bash
npm run update:attractions -- --example
```

这会生成 `scripts/attractions-data-example.json` 文件。

### 2. 编辑JSON文件

编辑生成的示例文件，添加或修改景点数据。格式如下：

```json
[
  {
    "name": "故宫",
    "phone": "4009501925",
    "openingHours": "08:30-17:00；停止入场时间:16:00...",
    "ticketPrice": "淡季:大门票40人民币...",
    "visitDuration": "3小时以上",
    "transportation": "公交：乘坐1路、2路...",
    "detailedDescription": "北京故宫，旧称紫禁城...",
    "nearbyAttractions": ["景山公园", "北海公园"],
    "nearbyTransport": ["天安门东(地铁站)", "天安门西(地铁站)"]
  }
]
```

### 3. 运行更新脚本

```bash
npm run update:attractions -- scripts/attractions-data-beijing.json
```

### 字段说明

- `name`: 景点名称（必须，用于匹配数据库中的记录）
- `phone`: 联系电话
- `openingHours`: 开放时间
- `ticketPrice`: 门票价格
- `visitDuration`: 用时参考
- `transportation`: 交通信息
- `detailedDescription`: 详细描述（完整版）
- `nearbyAttractions`: 附近景点列表
- `nearbyTransport`: 附近交通站点列表

## 方法二：SQL查询

使用 `query-mafengwo-attractions.sql` 文件中的查询语句来查看景点详细信息。

### 常用查询

#### 查询特定景点的完整信息

```sql
SELECT 
  id,
  name,
  address,
  rating,
  metadata->>'phone' as phone,
  metadata->>'openingHours' as opening_hours,
  metadata->>'ticketPrice' as ticket_price,
  metadata->>'visitDuration' as visit_duration,
  metadata->>'transportation' as transportation,
  metadata->>'detailedDescription' as detailed_description,
  metadata->>'nearbyAttractions' as nearby_attractions,
  metadata->>'nearbyTransport' as nearby_transport
FROM "Place"
WHERE category = 'ATTRACTION'
  AND name = '故宫'
  AND metadata->>'source' = 'mafengwo';
```

#### 查询有完整详细信息的景点

```sql
SELECT 
  id,
  name,
  CASE 
    WHEN metadata->>'phone' IS NOT NULL THEN '✅'
    ELSE '❌'
  END as has_phone,
  CASE 
    WHEN metadata->>'openingHours' IS NOT NULL THEN '✅'
    ELSE '❌'
  END as has_opening_hours,
  CASE 
    WHEN metadata->>'ticketPrice' IS NOT NULL THEN '✅'
    ELSE '❌'
  END as has_ticket_price,
  CASE 
    WHEN metadata->>'transportation' IS NOT NULL THEN '✅'
    ELSE '❌'
  END as has_transportation
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo'
ORDER BY name;
```

#### 统计各字段的完整性

```sql
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN metadata->>'phone' IS NOT NULL THEN 1 END) as with_phone,
  COUNT(CASE WHEN metadata->>'openingHours' IS NOT NULL THEN 1 END) as with_opening_hours,
  COUNT(CASE WHEN metadata->>'ticketPrice' IS NOT NULL THEN 1 END) as with_ticket_price,
  COUNT(CASE WHEN metadata->>'transportation' IS NOT NULL THEN 1 END) as with_transportation,
  COUNT(CASE WHEN metadata->>'detailedDescription' IS NOT NULL THEN 1 END) as with_detailed_description
FROM "Place"
WHERE category = 'ATTRACTION'
  AND metadata->>'source' = 'mafengwo';
```

## 数据来源

由于自动爬取受到反爬虫机制限制，建议从以下来源获取详细信息：

1. **马蜂窝网站**：手动访问景点页面，复制详细信息
2. **高德地图API**：使用 `AmapPOIService` 获取POI详细信息
3. **其他数据源**：携程、去哪儿等旅游网站

## 批量更新示例

可以创建一个包含多个景点数据的JSON文件：

```json
[
  {
    "name": "故宫",
    "phone": "4009501925",
    "openingHours": "...",
    "ticketPrice": "...",
    "visitDuration": "3小时以上",
    "transportation": "...",
    "detailedDescription": "...",
    "nearbyAttractions": ["景山公园", "北海公园"],
    "nearbyTransport": ["天安门东(地铁站)"]
  },
  {
    "name": "天安门",
    "phone": "...",
    "openingHours": "...",
    ...
  }
]
```

然后运行：

```bash
npm run update:attractions -- scripts/all-attractions-data.json
```

## 注意事项

1. 景点名称必须与数据库中的记录完全匹配
2. JSON文件必须是有效的JSON格式
3. 更新会保留原有的metadata字段，只更新提供的字段
4. 如果景点不存在，会跳过并记录

## 相关文件

- `scripts/manual-update-attractions.ts`: 手动更新脚本
- `scripts/attractions-data-example.json`: 示例数据文件
- `query-mafengwo-attractions.sql`: SQL查询语句文件
