# 徒步路线表（Trail）设计方案

## 问题分析

### 当前架构的问题

1. **概念不匹配**
   - `Place` 表设计用于存储"点"（Point of Interest），如景点、餐厅、酒店
   - 徒步路线是"路径"（Route/Trail），包含起点、终点、途经点、GPX轨迹等
   - 将路线数据存储在 `Place.metadata` 中不符合数据模型设计原则

2. **数据存储问题**
   - GPX轨迹数据可能很大（数千个点），不适合存储在JSONB中
   - 路线特有的字段（距离、爬升、难度、轨迹）与Place的通用字段混在一起

3. **关系复杂**
   - 一条徒步路线可能关联多个Place（起点、终点、途经点）
   - 一个Place可能有多条徒步路线（如武功山有多条登山路线）
   - 当前 `ItineraryItem.placeId` 只能关联一个Place，无法表达路线概念

4. **业务逻辑**
   - 创建行程时选择徒步，应该选择的是"路线"而不是"地点"
   - 路线有独立的难度评估、体力消耗计算、时间估算等逻辑

## 设计方案

### 1. 创建 Trail 表

```prisma
model Trail {
  id               Int       @id @default(autoincrement())
  uuid             String    @unique
  nameCN           String    // 中文名称（主要显示）
  nameEN           String?   // 英文名称
  description      String?   // 路线描述
  
  // 路线基本信息
  distanceKm       Float?    // 总距离（公里）
  elevationGainM   Float?    // 累计爬升（米）
  elevationLossM   Float?    // 累计下降（米）
  maxElevationM   Float?    // 最高海拔（米）
  minElevationM    Float?    // 最低海拔（米）
  averageSlope     Float?    // 平均坡度（%）
  
  // 难度评估
  difficultyLevel  String?   // EXTREME, HARD, MODERATE, EASY
  equivalentDistanceKm Float? // 等效距离（公里）
  fatigueScore    Float?    // 疲劳评分
  
  // 轨迹数据
  gpxData         Json?      // GPX轨迹数据（JSON格式，包含坐标点数组）
  gpxFileUrl      String?    // GPX文件URL（如果存储在外部）
  bounds          Json?      // 边界框 {minlat, minlon, maxlat, maxlon}
  
  // 关联的Place
  startPlaceId    Int?       // 起点Place ID
  endPlaceId      Int?       // 终点Place ID
  startPlace      Place?     @relation("TrailStartPlace", fields: [startPlaceId], references: [id])
  endPlace        Place?     @relation("TrailEndPlace", fields: [endPlaceId], references: [id])
  
  // 途经点（多对多关系）
  waypoints       TrailWaypoint[]
  
  // 元数据
  metadata        Json?      // 扩展信息（来源、评分、注意事项等）
  source          String?    // 数据来源（alltrails, gpx, manual等）
  sourceUrl       String?    // 来源链接
  rating          Float?     // 评分
  
  // 时间估算
  estimatedDurationHours Float? // 预计耗时（小时）
  
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  
  // 关联
  itineraryItems ItineraryItem[]
  
  @@index([startPlaceId])
  @@index([endPlaceId])
  @@index([difficultyLevel])
  @@index([source])
}
```

### 2. 创建 TrailWaypoint 表（途经点）

```prisma
model TrailWaypoint {
  id        Int     @id @default(autoincrement())
  trailId   Int
  placeId   Int
  order     Int     // 途经点顺序（从起点到终点）
  note      String? // 途经点备注
  
  trail     Trail   @relation(fields: [trailId], references: [id], onDelete: Cascade)
  place     Place   @relation(fields: [placeId], references: [id])
  
  @@unique([trailId, placeId])
  @@index([trailId])
  @@index([placeId])
}
```

### 3. 扩展 Place 表

```prisma
model Place {
  // ... 现有字段 ...
  
  // 新增关联
  trailsAsStart    Trail[]  @relation("TrailStartPlace")
  trailsAsEnd      Trail[]  @relation("TrailEndPlace")
  trailWaypoints   TrailWaypoint[]
}
```

### 4. 扩展 ItineraryItem 表

```prisma
model ItineraryItem {
  // ... 现有字段 ...
  
  // 新增字段
  trailId   Int?
  trail     Trail?  @relation(fields: [trailId], references: [id])
  
  // 当 trailId 存在时，placeId 可以指向起点或终点
  // 如果 trailId 和 placeId 都存在，placeId 通常指向起点
}
```

### 5. 扩展 ItemType 枚举（可选）

如果需要区分徒步活动和其他活动：

```prisma
enum ItemType {
  ACTIVITY
  HIKING        // 新增：徒步活动
  REST
  MEAL_ANCHOR
  MEAL_FLOATING
  TRANSIT
}
```

或者保持 `ACTIVITY`，通过 `trailId` 是否存在来判断是否为徒步。

## 数据迁移策略

### 方案A：渐进式迁移（推荐）

1. **阶段1：创建新表**
   - 创建 `Trail` 和 `TrailWaypoint` 表
   - 扩展 `ItineraryItem` 表添加 `trailId` 字段
   - 保持现有 `Place` 表不变

2. **阶段2：数据迁移**
   - 编写脚本，将 `Place` 表中具有徒步路线数据的记录迁移到 `Trail` 表
   - 识别条件：`category = 'ATTRACTION'` 且 `metadata.source = 'alltrails'` 或 `metadata.source = 'gpx'`
   - 创建 `Trail` 记录，关联到原 `Place`（作为起点或终点）

3. **阶段3：功能切换**
   - 更新创建行程的UI，支持选择 `Trail` 而不是 `Place`
   - 更新 `ItineraryItem` 创建逻辑，支持 `trailId`
   - 更新路线难度计算接口，支持从 `Trail` 表读取数据

4. **阶段4：清理**
   - 将 `Place` 表中的路线数据标记为已迁移
   - 可选：保留 `Place` 记录作为路线的起点/终点参考

### 方案B：双写策略

在迁移期间，同时写入 `Place` 和 `Trail` 表，确保数据一致性。

## API 设计

### 1. 创建/更新 Trail

```typescript
POST /trails
PUT /trails/:id

{
  nameCN: string;
  nameEN?: string;
  description?: string;
  distanceKm?: number;
  elevationGainM?: number;
  startPlaceId?: number;
  endPlaceId?: number;
  waypointPlaceIds?: number[]; // 途经点Place ID数组
  gpxData?: GPXPoint[]; // 或 gpxFileUrl
  metadata?: any;
}
```

### 2. 查询 Trail

```typescript
GET /trails?placeId=123&difficulty=HARD&minDistance=5&maxDistance=20
GET /trails/:id
```

### 3. 创建行程项时支持 Trail

```typescript
POST /itinerary-items

{
  tripDayId: string;
  type: ItemType.ACTIVITY;
  trailId?: number;  // 新增：徒步路线ID
  placeId?: number;  // 保留：用于非徒步活动，或作为起点参考
  startTime: string;
  endTime: string;
  note?: string;
}
```

### 4. 从 GPX 导入 Trail

```typescript
POST /trails/import-gpx

{
  gpxFile: File;
  nameCN?: string;
  startPlaceId?: number;
  endPlaceId?: number;
}
```

## 业务逻辑

### 1. 创建行程时选择徒步

**当前流程：**
```
用户选择 Place (category=ATTRACTION) → 创建 ItineraryItem (placeId=xxx)
```

**新流程：**
```
用户选择"徒步" → 显示 Trail 列表 → 选择 Trail → 创建 ItineraryItem (trailId=xxx)
```

### 2. 路线难度计算

- 优先使用 `Trail` 表中的数据（distanceKm, elevationGainM等）
- 如果没有，可以调用 Python 脚本计算
- 结果更新到 `Trail.difficultyLevel` 和 `Trail.fatigueScore`

### 3. 体力消耗计算

- 从 `Trail` 表读取路线数据
- 结合用户的 `pacingConfig` 计算体力消耗
- 在行程优化时考虑路线难度

## 优势

1. **概念清晰**：路线和地点分离，符合领域模型
2. **数据完整**：GPX轨迹、难度评估等数据有专门存储
3. **关系灵活**：支持多起点、多终点、途经点
4. **扩展性强**：未来可以支持路线推荐、路线比较等功能
5. **性能优化**：路线数据独立存储，查询和索引更高效

## 注意事项

1. **向后兼容**：迁移期间需要同时支持 `placeId` 和 `trailId`
2. **数据一致性**：确保 `Trail` 和关联的 `Place` 数据一致
3. **GPX存储**：考虑GPX数据大小，可能需要外部存储（S3等）
4. **搜索优化**：为 `Trail` 表添加全文搜索索引

## 实施优先级

1. **P0（必须）**：创建 `Trail` 表，扩展 `ItineraryItem` 表
2. **P1（重要）**：数据迁移脚本，更新创建行程逻辑
3. **P2（优化）**：路线推荐、路线比较等高级功能

