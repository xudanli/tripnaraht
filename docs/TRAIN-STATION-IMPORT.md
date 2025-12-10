# 火车站数据导入指南

本文档介绍如何导入全国火车站数据到系统中。

## 📋 数据格式要求

CSV 文件格式要求：
- **编码**: UTF-8
- **分隔符**: 逗号 (`,`)
- **字段**: 站名,车站地址,铁路局,类别,性质,省,市,WGS84_Lng,WGS84_Lat

### 字段说明

| 字段名 | 说明 | 是否必填 | 示例 |
|--------|------|----------|------|
| 站名 | 火车站名称 | ✅ 是 | 北京站 |
| 车站地址 | 详细地址 | ❌ 否 | 北京市东城区建国门内大街 |
| 铁路局 | 所属铁路局 | ❌ 否 | 北京铁路局 |
| 类别 | 车站类别 | ❌ 否 | - |
| 性质 | 车站性质 | ❌ 否 | 客运站 |
| 省 | 省级行政区 | ❌ 否 | 北京 |
| 市 | 市级行政区 | ❌ 否 | 海淀区 |
| WGS84_Lng | 经度（WGS84坐标系） | ✅ 是 | 116.333229 |
| WGS84_Lat | 纬度（WGS84坐标系） | ✅ 是 | 39.981082 |

### 坐标系说明

系统使用 **WGS84 坐标系**（SRID: 4326），因此必须使用 `WGS84_Lng` 和 `WGS84_Lat` 字段。

**其他坐标系字段（如火星坐标、百度坐标）不需要导入**。

## 🚀 导入方法

### 方法 1: 使用 SQL 脚本（推荐，速度快）

1. 将 CSV 文件放到 `scripts/` 目录下，命名为 `train_stations.csv`

2. 修改 `scripts/import-train-stations-sql.sql` 中的文件路径（如果需要）

3. 执行导入：
```bash
psql -d postgres -f scripts/import-train-stations-sql.sql
```

### 方法 2: 使用 TypeScript 脚本

```bash
# 使用默认路径 (scripts/train_stations.csv)
npm run import:train-stations

# 或指定 CSV 文件路径
npm run import:train-stations scripts/your_file.csv
```

## 🔄 转换为 Place 数据

导入原始数据后，需要转换为系统的 `Place` 数据：

```bash
npm run convert:train-stations
```

转换脚本会：
1. 从 `RawTrainStationData` 表读取未处理的数据
2. 创建或关联 `City` 记录
3. 创建 `Place` 记录（`category = 'TRANSIT_HUB'`）
4. 设置 PostGIS 地理位置（WGS84 坐标系）
5. 标记原始数据为已处理

## 📊 数据表结构

### RawTrainStationData（原始数据表）

存储从 CSV 导入的原始火车站数据：

```prisma
model RawTrainStationData {
  id            Int      @id @default(autoincrement())
  name          String   // 站名
  address       String?  // 车站地址
  railwayBureau String?  // 铁路局
  category      String?  // 类别
  nature        String?  // 性质（客运站、货运站等）
  province      String?  // 省级行政区
  city          String?  // 市级行政区
  wgs84Lng      Float?   // 经度（WGS84）
  wgs84Lat      Float?   // 纬度（WGS84）
  importedAt    DateTime @default(now())
  processed     Boolean  @default(false)
}
```

### Place（转换后的数据）

转换后的数据存储在 `Place` 表中，`category = 'TRANSIT_HUB'`：

```prisma
model Place {
  id       Int
  uuid     String
  name     String
  category PlaceCategory  // TRANSIT_HUB
  location Geography?     // PostGIS Point (WGS84)
  address  String?
  cityId   Int?
  metadata Json?          // 包含铁路局、性质等信息
}
```

## ✅ 验证导入结果

### 检查原始数据导入

```sql
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN "wgs84Lng" IS NOT NULL AND "wgs84Lat" IS NOT NULL THEN 1 END) as with_coords,
  COUNT(CASE WHEN processed = false THEN 1 END) as pending
FROM "RawTrainStationData";
```

### 检查 Place 数据转换

```sql
SELECT 
  COUNT(*) as total_stations,
  COUNT(CASE WHEN "cityId" IS NOT NULL THEN 1 END) as with_city
FROM "Place"
WHERE category = 'TRANSIT_HUB';
```

## 📝 示例数据

```csv
站名,车站地址,铁路局,类别,性质,省,市,WGS84_Lng,WGS84_Lat
清华园站,北京海淀区知春路大运村北航西门对面,北京铁路局,,客运站,北京,海淀区,116.333229,39.981082
北京站,北京市东城区建国门内大街,北京铁路局,,客运站,北京,东城区,116.426789,39.903738
```

## 🔍 常见问题

### Q: 为什么只使用 WGS84 坐标？

A: 系统使用 PostGIS，标准坐标系是 WGS84（SRID: 4326）。其他坐标系（如火星坐标、百度坐标）需要转换，而 CSV 中已提供 WGS84 坐标，直接使用即可。

### Q: 如何处理重复的车站？

A: 导入脚本会检查站名、省份、城市的组合，如果已存在则更新记录。转换脚本会检查 Place 表中是否已有相同名称和类别的记录，避免重复创建。

### Q: 城市关联失败怎么办？

A: 转换脚本会自动创建未找到的城市记录（使用中国国家代码 `CN`）。如果城市名称格式特殊，可能需要手动调整 `provinceToCityMap` 映射。

## 📚 相关文件

- `prisma/schema.prisma` - 数据模型定义
- `scripts/import-train-stations.ts` - TypeScript 导入脚本
- `scripts/import-train-stations-sql.sql` - SQL 导入脚本
- `scripts/convert-train-stations-to-places.ts` - 转换脚本
