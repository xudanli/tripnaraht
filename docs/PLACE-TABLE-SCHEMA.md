# Place 表结构说明

## 📋 表名

**`Place`** - 地点/POI 主表

## 🗂️ 表结构

### 主键和唯一标识

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `Int` | 主键，自增 |
| `uuid` | `String` | UUID，唯一标识 |

### 基本信息

| 字段 | 类型 | 说明 |
|------|------|------|
| `nameCN` | `String` | 中文名称（主要显示） |
| `nameEN` | `String?` | 英文名称（可选，用于国际化） |
| `category` | `PlaceCategory` | 类别枚举（见下方） |
| `address` | `String?` | 地址（可选） |
| `rating` | `Float?` | 评分（0-5，可选） |

### 地理位置

| 字段 | 类型 | 说明 |
|------|------|------|
| `location` | `geography(Point)` | PostGIS 地理坐标（经纬度） |
| `cityId` | `Int?` | 关联城市 ID（可选） |

### 元数据

| 字段 | 类型 | 说明 |
|------|------|------|
| `metadata` | `Json?` | 扩展信息（JSONB）<br>- OSM 数据：osmId, osmType, canonicalType, regionKey, profile, rawTags<br>- Nature POI：externalSource, countryCode, subCategory, elevationMeters 等<br>- 其他自定义字段 |
| `physicalMetadata` | `Json?` | 体力消耗元数据（JSONB）<br>- terrain_type: 地形类型<br>- seated_ratio: 坐着比例<br>- intensity_factor: 强度因子等 |

### 外部关联

| 字段 | 类型 | 说明 |
|------|------|------|
| `googlePlaceId` | `String?` | Google Places API ID（唯一，可选） |
| `cityId` | `Int?` | 关联 City 表的外键 |

### 向量搜索

| 字段 | 类型 | 说明 |
|------|------|------|
| `embedding` | `vector(1536)` | 向量表示，用于语义搜索（可选） |

### 时间戳

| 字段 | 类型 | 说明 |
|------|------|------|
| `createdAt` | `DateTime` | 创建时间 |
| `updatedAt` | `DateTime` | 更新时间 |

## 📊 PlaceCategory 枚举

```typescript
enum PlaceCategory {
  ATTRACTION    // 景点/吸引点
  RESTAURANT    // 餐厅
  SHOPPING      // 购物
  HOTEL         // 酒店
  TRANSIT_HUB   // 交通枢纽
}
```

## 🔗 关联关系

### 一对多关系

- `itineraryItems` → `ItineraryItem[]` - 行程项
- `trailsAsStart` → `Trail[]` - 作为起点的徒步路线
- `trailsAsEnd` → `Trail[]` - 作为终点的徒步路线
- `trailWaypoints` → `TrailWaypoint[]` - 作为途经点的徒步路线

### 多对一关系

- `city` → `City?` - 所属城市（通过 cityId）

## 📝 Metadata 字段说明

### 尼泊尔 POI 的 metadata 结构

```json
{
  "osmId": 123456789,
  "osmType": "node",
  "canonicalType": "TEAHOUSE_LODGE",
  "regionKey": "NP_KTM",
  "profile": "Tea House / Lodge",
  "rawTags": {
    "tourism": "guest_house",
    "name": "Everest Tea House",
    ...
  }
}
```

### Nature POI 的 metadata 结构

```json
{
  "mainCategory": "nature",
  "subCategory": "volcano",
  "externalSource": "iceland_nsi",
  "externalId": "volcano_001",
  "countryCode": "IS",
  "region": "South Iceland",
  "elevationMeters": 1500,
  "tags": ["photography", "hiking"],
  "rawProperties": { ... }
}
```

## 🔍 索引

- `@@index([metadata(ops: JsonbPathOps)], type: Gin)` - GIN 索引，支持 JSONB 路径查询

## 📊 数据统计

- **总记录数**: 49,862 个 POI
- **有坐标**: 49,656 个 (99.6%)
- **有 metadata**: 49,862 个 (100%)

## 💡 查询示例

### 查询尼泊尔 POI

```sql
SELECT * FROM "Place"
WHERE metadata->>'regionKey' LIKE 'NP_%';
```

### 查询特定类型的 POI

```sql
SELECT * FROM "Place"
WHERE metadata->>'canonicalType' = 'TEAHOUSE_LODGE';
```

### 查询附近的 POI（使用 PostGIS）

```sql
SELECT * FROM "Place"
WHERE ST_DWithin(
  location::geography,
  ST_SetSRID(ST_MakePoint(85.300140, 27.700769), 4326)::geography,
  50000  -- 50km
);
```

## 📚 相关表

- **City** - 城市表（通过 cityId 关联）
- **ItineraryItem** - 行程项表（引用 Place）
- **Trail** - 徒步路线表（起点/终点关联 Place）
- **TrailWaypoint** - 路线途经点表（关联 Place）

