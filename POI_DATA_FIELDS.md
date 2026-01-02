# POI 数据字段说明

## 一、数据库表字段（Place 模型）

根据 Prisma Schema 定义，`Place` 表包含以下字段：

### 基础字段

| 字段名 | 类型 | 说明 | 必填 |
|--------|------|------|------|
| `id` | Int | 主键，自增 | ✅ |
| `uuid` | String | 唯一标识符 | ✅ |
| `nameCN` | String | 中文名称 | ✅ |
| `nameEN` | String? | 英文名称 | ❌ |
| `category` | PlaceCategory | 地点类别（枚举） | ✅ |
| `location` | Geography? | 地理位置（PostGIS，经纬度） | ❌ |
| `address` | String? | 地址 | ❌ |
| `cityId` | Int? | 关联的城市ID | ❌ |
| `googlePlaceId` | String? | Google Places API ID | ❌ |
| `rating` | Float? | 评分（0-5） | ❌ |
| `embedding` | Vector? | 向量嵌入（用于语义搜索） | ❌ |
| `metadata` | Json? | 扩展元数据（JSONB） | ❌ |
| `physicalMetadata` | Json? | 体力消耗元数据（JSONB） | ❌ |
| `createdAt` | DateTime | 创建时间 | ✅ |
| `updatedAt` | DateTime | 更新时间 | ✅ |

### 关联关系

- `City`: 关联的城市（通过 `cityId`）
- `ItineraryItem[]`: 关联的行程项
- `Trail[]`: 关联的徒步路线（起点/终点）

---

## 二、category 枚举值（PlaceCategory）

```typescript
enum PlaceCategory {
  ATTRACTION   // 景点
  RESTAURANT   // 餐厅
  SHOPPING     // 购物
  HOTEL        // 酒店
  TRANSIT_HUB  // 交通枢纽
}
```

---

## 三、metadata 字段结构（JSONB）

`metadata` 字段存储为 JSONB，包含以下可选结构：

### 3.1 营业时间（openingHours）

```typescript
openingHours?: {
  weekday?: string;        // 工作日营业时间，如 "09:00 - 18:00"
  weekend?: string;        // 周末营业时间
  lastEntry?: string;      // 最后入场时间，如 "17:30"
  isOpenNow?: boolean;     // 抓取时的营业状态
  mon?: string;            // 周一
  tue?: string;            // 周二
  wed?: string;            // 周三
  thu?: string;            // 周四
  fri?: string;            // 周五
  sat?: string;            // 周六
  sun?: string;            // 周日
}
```

### 3.2 联系方式（contact）

```typescript
contact?: {
  website?: string;        // 官网
  phone?: string;          // 电话
  instagram?: string;      // Instagram
}
```

### 3.3 服务设施（facilities）

```typescript
facilities?: {
  wheelchair?: {
    accessible: boolean;      // 轮椅是否可访问
    hasElevator?: boolean;    // 是否有电梯
    hasRestroom?: boolean;    // 是否有无障碍洗手间
  };
  payment?: string[];         // 支付方式，如 ["Visa", "Alipay", "Cash Only"]
  children?: {
    strollerAccessible?: boolean;  // 婴儿车是否可进入
    highChair?: boolean;           // 是否有儿童椅
  };
  parking?: {
    hasParking?: boolean;     // 是否有停车场
    isFree?: boolean;         // 是否免费
  };
  internet?: {
    available: boolean;       // 是否有网络
    type?: 'wlan' | 'wired' | 'none';  // 网络类型
  };
  drinkingWater?: boolean;    // 是否有饮用水
  toilets?: boolean;          // 是否有厕所
}
```

### 3.4 其他 metadata 字段

```typescript
rawTags?: string[];          // 原始标签（从抓取源）
timezone?: string;           // 时区，如 "Asia/Tokyo"
lastCrawledAt?: string | Date;  // 最后抓取时间

// 酒店专用字段
location_score?: {
  center_distance_km?: number;           // 距离市中心距离（公里）
  nearest_station_walk_min?: number;     // 到最近车站步行时间（分钟）
  is_transport_hub?: boolean;            // 是否是交通枢纽
  avg_distance_to_attractions_km?: number;  // 到景点的平均距离
  transport_convenience_score?: number;     // 交通便利性评分
};
hotel_tier?: number;         // 酒店星级（1-5）

// 数据源相关字段（实际使用中常见）
countryCode?: string;        // 国家代码（ISO 3166-1 alpha-2）
externalSource?: string;     // 外部数据源，如 "OSM", "Nepal (Overpass)", "中国景点数据库"
regionKey?: string;          // 区域键，如 "NP_Kathmandu", "NZ_Auckland"
profile?: string;            // 数据配置文件标识
```

---

## 四、physicalMetadata 字段结构（JSONB）

`physicalMetadata` 字段存储体力消耗相关的元数据：

```typescript
physicalMetadata?: {
  base_fatigue_score: number;           // 基础消耗分数（每10分钟游玩消耗多少HP，默认 5）
  terrain_type: 'FLAT' | 'HILLY' | 'STAIRS_ONLY' | 'ELEVATOR_AVAILABLE';  // 地形类型
  seated_ratio: number;                 // 坐着的时间比例（0.0 - 1.0），如剧院 = 1.0，博物馆 = 0.2，爬山 = 0.0
  intensity_factor?: number;            // 强度系数（1.0 = 标准，1.5 = 高强度，0.5 = 低强度）
  has_elevator?: boolean;               // 是否有电梯/缆车
  wheelchair_accessible?: boolean;      // 是否有无障碍设施
  estimated_duration_min?: number;      // 预估游玩时长（分钟）
}
```

---

## 五、扩展元数据（AttractionMetadata，用于景点）

对于 `category = ATTRACTION` 的地点，`metadata` 可能包含更详细的结构（参考 `AttractionMetadata` 接口）：

### 5.1 基础信息（basic）

```typescript
basic?: {
  type?: 'NATURAL' | 'CULTURAL' | 'ENTERTAINMENT' | 'SHOPPING' | 'FOOD' | 'OTHER';
  openingHours?: { weekday?: { open: string; close: string }; ... };
  ticketPrice?: { adult?: number; child?: number; currency?: string; ... };
  contact?: { phone?: string; email?: string; website?: string; ... };
  officialWebsite?: string;
}
```

### 5.2 体验特征（experience）

```typescript
experience?: {
  highlights?: Array<{ keyword: string; weight: number; category?: string; }>;
  atmosphere?: Array<'ROMANTIC' | 'QUIET' | 'LIVELY' | 'SERENE' | 'URBAN' | 'NATURAL'>;
  suitableFor?: Array<'FAMILY' | 'COUPLE' | 'SENIOR' | 'SOLO' | 'FRIENDS' | 'BUSINESS'>;
  interestVector?: { history?: number; nature?: number; photography?: number; ... };
  walkingIntensity?: 1 | 2 | 3 | 4 | 5;
  physicalRequirement?: 'LOW' | 'MEDIUM' | 'HIGH';
  terrain?: { type?: string; wheelchairAccessible?: boolean; ... };
  estimatedCost?: { min?: number; max?: number; currency?: string; ... };
  // ...
}
```

### 5.3 约束条件（constraints）

```typescript
constraints?: {
  crowdLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  bookingRequired?: boolean;
  ageRestriction?: { min?: number; max?: number; };
  dressCode?: string[];
  photographyRestriction?: boolean;
  // ...
}
```

### 5.4 时间相关（time）

```typescript
time?: {
  bestVisitTime?: { season?: string[]; timeOfDay?: string[]; };
  peakHours?: string[];
  recommendedDuration?: { min?: number; max?: number; unit?: string; };
  // ...
}
```

### 5.5 交通路径（transport）

```typescript
transport?: {
  nearestStation?: { name?: string; walkTime?: number; };
  parkingInfo?: { available?: boolean; fee?: number; };
  accessibility?: { publicTransport?: boolean; taxi?: boolean; ... };
  // ...
}
```

### 5.6 AI 匹配（ai）

```typescript
ai?: {
  userMatchScore?: Array<{ profile: string; reason: string; score: number; }>;
  // ...
}
```

---

## 六、常见数据源标识

根据实际数据，`metadata.externalSource` 常见值包括：

- `"OSM (Overpass)"` - OpenStreetMap 数据
- `"Nepal (Overpass)"` - 尼泊尔数据
- `"中国景点数据库"` - 中国景点数据
- `"RawHotelData_Slim"` - 酒店数据
- `"全国火车站数据库"` - 火车站数据
- `"alltrails"` - AllTrails 数据
- `"mafengwo"` - 马蜂窝数据

---

## 七、查询示例

### 查询所有字段

```sql
SELECT 
  id, uuid, "nameCN", "nameEN", category, location, address, 
  "cityId", "googlePlaceId", rating, metadata, "physicalMetadata",
  "createdAt", "updatedAt"
FROM "Place"
LIMIT 1;
```

### 查询特定 metadata 字段

```sql
SELECT 
  id, "nameCN", 
  metadata->>'countryCode' as country_code,
  metadata->>'externalSource' as source,
  metadata->'openingHours'->>'weekday' as opening_hours
FROM "Place"
WHERE metadata->>'countryCode' = 'CN';
```

---

## 八、总结

- **基础字段**：15 个核心字段（id, uuid, nameCN, nameEN, category, location 等）
- **metadata**：灵活的 JSONB 结构，包含营业时间、联系方式、设施、数据源等信息
- **physicalMetadata**：体力消耗相关元数据（地形、强度、时长等）
- **关联数据**：通过 `cityId` 关联到 `City` 表，可获取国家代码等信息
- **向量搜索**：`embedding` 字段支持语义搜索功能

完整的数据结构支持多种用途：
- 地理位置搜索（PostGIS）
- 语义搜索（向量嵌入）
- 体力消耗计算（physicalMetadata）
- 详细的营业信息和服务设施（metadata）

