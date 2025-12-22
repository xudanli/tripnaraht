# Place 表 vs POI 数据：区别与用途

## 📋 核心区别

### Place 表（业务核心表）

**定位**: TripNARA 的核心业务数据，用于**行程规划**和**用户交互**

**数据来源**:
- Google Places API
- 手动录入
- 从原始数据表（RawAttractionData, RawTrainStationData 等）转换而来

**主要特点**:
- ✅ **结构化业务数据**：有明确的业务分类（ATTRACTION, RESTAURANT, SHOPPING, HOTEL, TRANSIT_HUB）
- ✅ **关联到 City**：每个 Place 属于一个城市
- ✅ **用户可见**：直接用于行程规划、推荐、展示
- ✅ **业务元数据**：包含评分、Google Place ID、向量嵌入（用于语义搜索）
- ✅ **行程关联**：`ItineraryItem` 直接关联到 `Place`

**字段结构**:
```typescript
{
  id: number
  uuid: string
  nameCN: string        // 中文名称（主要显示）
  nameEN?: string       // 英文名称
  category: PlaceCategory  // ATTRACTION | RESTAURANT | SHOPPING | HOTEL | TRANSIT_HUB
  location: geography   // PostGIS Point
  address?: string
  cityId?: number       // 关联到 City
  metadata?: Json       // 营业时间、设施、支付方式等
  physicalMetadata?: Json  // 体力消耗元数据
  googlePlaceId?: string   // Google Places ID
  rating?: number       // 评分
  embedding?: vector(1536)  // 向量表示，用于语义搜索
}
```

**使用场景**:
- 行程规划：用户选择景点、餐厅、酒店
- 推荐系统：基于用户偏好推荐地点
- 语义搜索：通过向量嵌入进行相似度搜索
- 行程展示：在行程中显示具体地点信息

---

### POI 数据（地理特征数据）

**定位**: 从 OpenStreetMap 抓取的**地理背景信息**，用于**决策支持**和**地理特征提取**

**数据来源**:
- OpenStreetMap (OSM) via Overpass API
- 自动抓取和更新

**主要特点**:
- ✅ **地理覆盖广泛**：包含基础设施、服务点、自然特征等
- ✅ **类别丰富**：PORT, HARBOUR, AIRPORT, TRAILHEAD, SAFETY, SUPPLY, TOILETS, PARKING, INFORMATION, VIEWPOINT 等
- ✅ **区域标识**：支持多区域（冰岛、格陵兰、斯瓦尔巴等）
- ✅ **决策支持**：用于 `GeoFactsService` 提取地理特征，支持决策层（Abu, Dr.Dre, Neptune）
- ✅ **不直接用于行程规划**：作为"背景信息"和"决策依据"

**字段结构**:
```typescript
// poi_osm_raw（原始数据）
{
  osm_type: 'node' | 'way' | 'relation'
  osm_id: bigint
  geom: geometry(Point, 4326)
  tags: jsonb              // OSM 原始标签
  region_key?: string      // 区域标识（如 IS_REYKJAVIK）
  region_name?: string
  region_center?: jsonb
}

// poi_canonical（规范化数据）
{
  poi_id: uuid
  source: 'OSM'
  source_key: string       // 'node:123' | 'way:456' | 'relation:789'
  name_default?: string
  category: string         // PORT, HARBOUR, AIRPORT, TRAILHEAD, SAFETY, SUPPLY, etc.
  lat: number
  lng: number
  geom: geometry(Point, 4326)
  address?: string
  opening_hours?: string
  phone?: string
  website?: string
  tags_slim?: jsonb        // 关键标签
  region_key?: string
  region_name?: string
  region_center?: jsonb
}
```

**使用场景**:
- 地理特征提取：`GeoFactsService` 计算 `nearPort`, `nearAirport`, `trailAccessPoints` 等
- 决策支持：帮助决策层判断"是否有港口"、"是否有医院"、"是否有徒步入口"等
- 风险评估：结合地理特征计算 `riskScore`, `accessibilityScore` 等
- 背景信息：提供"附近有什么"的上下文信息

---

## 🔄 关系与协作

### 互补关系

1. **Place 表** = **用户可见的、可规划的、业务核心的地点**
   - 用户可以直接选择、添加到行程
   - 有评分、有详细元数据
   - 关联到城市，用于行程规划

2. **POI 数据** = **地理背景信息、决策支持数据**
   - 提供"附近有什么基础设施"
   - 帮助决策层判断"是否可行"
   - 不直接用于行程规划，但影响决策

### 协作示例

**场景 1：规划一个冰岛行程**

1. **Place 表**：用户选择"黄金圈"的景点（如 Gullfoss 瀑布）
   - 这些是**可规划的、用户可见的**地点

2. **POI 数据**：`GeoFactsService` 查询附近 POI
   - 发现附近有 `PORT`（港口）→ 可以安排出海活动
   - 发现附近有 `TRAILHEAD`（徒步入口）→ 可以安排徒步
   - 发现附近有 `HOSPITAL`（医院）→ 风险评估：有医疗保障
   - 发现附近有 `FUEL`（加油站）→ 自驾可行性：有补给点

3. **决策层**：基于 POI 特征做出决策
   - Abu：如果附近没有医院，降低风险评分
   - Dr.Dre：如果附近有徒步入口，可以安排徒步活动
   - Neptune：如果附近没有港口，出海活动不可行

**场景 2：识别"集合点"**

1. **POI 数据**：`POIPickupScorerService` 从 POI 中识别"最可能的集合点"
   - 基于 `PORT`, `HARBOUR`, `man_made=pier` 等标签
   - 结合距离海岸线的距离
   - 评分排序，返回 Top 3

2. **Place 表**：如果集合点需要用户可见，可以：
   - 将高分 POI 转换为 Place（可选）
   - 或者在行程中直接引用 POI 信息

---

## 📊 数据规模对比

| 维度 | Place 表 | POI 数据 |
|------|----------|----------|
| **数据量** | 相对较少（精选地点） | 大量（基础设施全覆盖） |
| **覆盖范围** | 主要景点、餐厅、酒店 | 所有基础设施、服务点 |
| **更新频率** | 手动/API 同步 | 定期自动抓取 |
| **数据质量** | 高（有评分、元数据） | 中等（依赖 OSM 数据质量） |
| **业务关联** | 直接关联行程 | 间接支持决策 |

---

## 💡 使用建议

### 何时使用 Place 表？

- ✅ 用户选择景点、餐厅、酒店
- ✅ 行程规划中的具体地点
- ✅ 需要评分、详细元数据的场景
- ✅ 语义搜索和推荐系统

### 何时使用 POI 数据？

- ✅ 地理特征提取（`GeoFactsService`）
- ✅ 决策支持（"附近有什么基础设施"）
- ✅ 风险评估（"是否有医院/加油站"）
- ✅ 背景信息（"附近有港口，可以安排出海"）

### 何时需要转换？

- 如果某个 POI 需要用户可见和可规划，可以考虑转换为 Place
- 例如：高分的"集合点"POI → 转换为 Place（category: TRANSIT_HUB）

---

## 🔗 相关服务

- **Place 表相关**:
  - `PlacesService`: 管理 Place 的 CRUD 和查询
  - 语义搜索：基于 `embedding` 向量

- **POI 数据相关**:
  - `GeoFactsPOIService`: 查询 POI 特征
  - `POIPickupScorerService`: 识别集合点
  - `POITrailheadService`: 识别徒步入口
  - `GeoFactsService`: 统一的地理特征服务

---

## 📝 总结

| 特性 | Place 表 | POI 数据 |
|------|----------|----------|
| **定位** | 业务核心，用户可见 | 地理背景，决策支持 |
| **用途** | 行程规划 | 地理特征提取 |
| **数据来源** | Google Places, 手动录入 | OpenStreetMap |
| **关联** | 直接关联行程 | 间接支持决策 |
| **可见性** | 用户可见 | 系统内部使用 |

**核心区别**：Place 是"用户要去的"，POI 是"系统用来判断的"。

