# POI Metadata 和 PhysicalMetadata 生成依据说明

## 一、metadata（扩展元数据）生成依据

### 1.1 生成逻辑（脚本中的 enrichMetadata 函数）

脚本中 `metadata` 的生成**非常简单**，主要做以下工作：

```typescript
function enrichMetadata(existingMetadata: any, category: PlaceCategory): PlaceMetadata {
  const metadata: any = existingMetadata || {};  // 保留现有 metadata
  
  // 1. 确保 countryCode 设置为对应国家代码
  if (!metadata.countryCode) {
    metadata.countryCode = 'CN' | 'NP' | 'NZ' | 'IS';  // 根据脚本而定
  }
  
  // 2. 如果没有 timezone，设置国家时区
  if (!metadata.timezone) {
    metadata.timezone = 'Asia/Shanghai' | 'Asia/Kathmandu' | 'Pacific/Auckland' | 'Atlantic/Reykjavik';
  }
  
  return metadata as PlaceMetadata;  // 返回，保留所有原有字段
}
```

### 1.2 生成依据

- **最小化修改原则**：只添加缺失的字段（countryCode 和 timezone），保留所有现有 metadata
- **国家标识**：根据脚本目标国家设置 `countryCode`（ISO 3166-1 alpha-2 格式）
- **时区设置**：根据国家设置标准时区
  - 中国：`Asia/Shanghai` (UTC+8)
  - 尼泊尔：`Asia/Kathmandu` (UTC+5:45)
  - 新西兰：`Pacific/Auckland` (UTC+12/+13)
  - 冰岛：`Atlantic/Reykjavik` (UTC+0)

### 1.3 保留的字段

脚本**不会**修改或生成以下字段（这些字段需要在数据导入时已经存在）：
- `openingHours` - 营业时间
- `contact` - 联系方式
- `facilities` - 服务设施
- `rawTags` - 原始标签
- `externalSource` - 数据源标识
- `regionKey` - 区域键（如 `NP_KTM`、`NZ_AUCKLAND` 等）
- `subCategory` - 子类别
- 其他所有现有字段

---

## 二、physicalMetadata（体力消耗元数据）生成依据

### 2.1 生成逻辑（使用 PhysicalMetadataGenerator）

`physicalMetadata` 的生成**更加智能**，使用 `PhysicalMetadataGenerator.generateByCategory()` 方法：

```typescript
function generatePhysicalMetadata(category: PlaceCategory, metadata: any): any {
  return PhysicalMetadataGenerator.generateByCategory(category, metadata);
}
```

### 2.2 生成依据 - 两步法

#### 第一步：根据 category（地点类别）获取默认值

`PhysicalMetadataGenerator` 根据 `PlaceCategory` 枚举值提供默认的体力消耗数据：

| Category | base_fatigue_score | terrain_type | seated_ratio | intensity_factor | estimated_duration_min |
|----------|-------------------|--------------|--------------|------------------|----------------------|
| **ATTRACTION** (景点) | 5 | FLAT | 0.2 (20%) | 1.0 | 60分钟 |
| **RESTAURANT** (餐厅) | 2 | FLAT | 0.9 (90%) | 0.3 | 60分钟 |
| **SHOPPING** (购物) | 4 | FLAT | 0.1 (10%) | 0.8 | 90分钟 |
| **HOTEL** (酒店) | 1 | ELEVATOR_AVAILABLE | 0.95 (95%) | 0.2 | 480分钟 (8小时) |
| **TRANSIT_HUB** (交通枢纽) | 4 | FLAT | 0.3 (30%) | 0.9 | 30分钟 |

**依据说明**：
- **景点**：中等强度（5分），20%时间坐着（博物馆、展览），预估1小时
- **餐厅**：低强度（2分），90%时间坐着，预估1小时
- **购物**：低到中等强度（4分），10%时间坐着（试衣间、休息区），预估1.5小时
- **酒店**：极低强度（1分），95%时间坐着或躺着，有电梯，预估8小时（过夜）
- **交通枢纽**：中等强度（4分），30%时间坐着（等车），预估30分钟

#### 第二步：从 metadata 中提取信息增强（规则优先级系统）

如果 POI 的 `metadata` 中包含额外信息，系统会按照以下**优先级顺序**应用规则来增强 `physicalMetadata`：

```
优先级从高到低：
1. accessType（访问类型）
2. typicalStay（典型停留时间）
3. elevationMeters（海拔高度）
4. visitDuration（游玩时长）- 覆盖 typicalStay
5. facilities（设施信息）
6. subCategory（子类别）
7. trailDifficulty（徒步难度）- 作为弱耦合调制器（最后应用，只微调 5-15%）
```

### 2.3 规则详解

#### 规则1：accessType（访问类型）

**依据**：访问方式直接影响地形类型和体力消耗

```typescript
// 示例规则
if (accessType === 'HIKING' || accessType === 'TREKKING') {
  terrain_type: 'HILLY',
  intensity_factor: 1.5,
  seated_ratio: 0,  // 徒步，不坐着
}

if (accessType === 'VEHICLE' || accessType === 'BOAT') {
  seated_ratio: 0.8,  // 大部分时间在交通工具上
  intensity_factor: 0.6,
}

if (accessType === 'CABLE_CAR') {
  terrain_type: 'ELEVATOR_AVAILABLE',
  has_elevator: true,
  seated_ratio: 0.7,
  intensity_factor: 0.5,
}
```

#### 规则2：typicalStay（典型停留时间）

**依据**：停留时间类型反映活动强度

```typescript
// 示例规则
if (typicalStay === 'PHOTO_STOP') {
  estimated_duration_min: 15,
  seated_ratio: 0.1,
  intensity_factor: 0.6,
}

if (typicalStay === 'HALF_DAY_HIKE') {
  estimated_duration_min: 240,  // 4小时
  terrain_type: 'HILLY',
  intensity_factor: 1.5,
  seated_ratio: 0,
}

if (typicalStay === 'FULL_DAY_HIKE') {
  estimated_duration_min: 480,  // 8小时
  terrain_type: 'HILLY',
  intensity_factor: 2.0,
  seated_ratio: 0,
}
```

#### 规则3：elevationMeters（海拔高度）

**依据**：高海拔地区增加体力消耗

```typescript
// 如果海拔 > HIGH_ELEVATION_THRESHOLD (默认 2500 米)
if (elevationMeters > 2500) {
  intensity_factor: 1.3,  // 增加30%强度
  // 注意：不改变地形类型
}
```

#### 规则4：visitDuration（游玩时长）

**依据**：直接指定的时长，优先级高于 typicalStay

```typescript
// 支持多种格式解析
"1小时" → 60分钟
"2-3小时" → 150分钟（平均值）
"半天" → 240分钟
"全天" → 480分钟
"30分钟" → 30分钟
```

#### 规则5：facilities（设施信息）

**依据**：设施直接影响无障碍性和地形

```typescript
if (facilities.wheelchair?.hasElevator) {
  has_elevator: true,
  terrain_type: 'ELEVATOR_AVAILABLE',
}

if (facilities.wheelchair?.accessible) {
  wheelchair_accessible: true,
}
```

#### 规则6：subCategory（子类别）

**依据**：子类别反映活动特点

```typescript
// 火山、冰川等高强度活动
if (subCategory.includes('volcano') || subCategory.includes('glacier')) {
  intensity_factor: 1.8,
  terrain_type: 'HILLY',
  base_fatigue_score: 8,
}

// 温泉、观景台等低强度
if (subCategory.includes('hot_spring') || subCategory.includes('viewpoint')) {
  intensity_factor: 0.6,
  seated_ratio: 0.3,
}
```

#### 规则7：trailDifficulty（徒步难度）- 弱耦合调制器

**依据**：难度影响心理压力和技术消耗，但不改变疲劳的主量级

```typescript
// 只微调 intensity_factor（5-15%）
EASY: intensity_factor × 0.95  // -5%
MODERATE: intensity_factor × 1.0  // 基准
HARD: intensity_factor × 1.1  // +10%
EXTREME: intensity_factor × 1.15  // +15%
```

**重要说明**：Difficulty 和 Fatigue 是分离的两个轨道
- Difficulty 关注技术性、风险、门槛（是否"难"）
- Fatigue 关注时长、强度、消耗（有多"累"）
- 二者分离，只在最后用 difficulty 微调 fatigue

---

## 三、数据来源总结

### 3.1 metadata 数据来源

| 字段 | 来源 | 说明 |
|------|------|------|
| `countryCode` | 脚本设置 | 根据脚本目标国家自动设置 |
| `timezone` | 脚本设置 | 根据国家设置标准时区 |
| `openingHours` | **数据导入时已有** | 脚本不生成 |
| `contact` | **数据导入时已有** | 脚本不生成 |
| `facilities` | **数据导入时已有** | 脚本不生成 |
| `regionKey` | **数据导入时已有** | 脚本不生成（如 `NP_KTM`、`NZ_AUCKLAND`） |
| `subCategory` | **数据导入时已有** | 脚本不生成 |
| `externalSource` | **数据导入时已有** | 脚本不生成（如 `"OSM"`、`"Nepal (Overpass)"`） |

### 3.2 physicalMetadata 数据来源

| 字段 | 主要来源 | 次要来源（增强） |
|------|----------|------------------|
| `base_fatigue_score` | category 默认值 (1-5) | subCategory（火山/冰川 → 8） |
| `terrain_type` | category 默认值 (FLAT) | accessType, facilities, subCategory |
| `seated_ratio` | category 默认值 (0.1-0.95) | accessType, typicalStay, subCategory |
| `intensity_factor` | category 默认值 (0.2-1.0) | elevationMeters, subCategory, trailDifficulty |
| `has_elevator` | category 默认值 | facilities.wheelchair.hasElevator, accessType |
| `wheelchair_accessible` | category 默认值 (false) | facilities.wheelchair.accessible |
| `estimated_duration_min` | category 默认值 (30-480分钟) | typicalStay, visitDuration |

---

## 四、生成流程示例

### 示例1：一个普通的中国景点（ATTRACTION）

```typescript
// 输入
category = 'ATTRACTION'
metadata = { countryCode: 'CN' }  // 只有基础字段

// 第一步：根据 category 获取默认值
base = {
  base_fatigue_score: 5,
  terrain_type: 'FLAT',
  seated_ratio: 0.2,
  intensity_factor: 1.0,
  has_elevator: false,
  wheelchair_accessible: false,
  estimated_duration_min: 60,
}

// 第二步：metadata 中没有额外信息，直接返回默认值
physicalMetadata = base  // 最终结果
```

### 示例2：一个尼泊尔的徒步路线（ATTRACTION，有 metadata）

```typescript
// 输入
category = 'ATTRACTION'
metadata = {
  countryCode: 'NP',
  regionKey: 'NP_PKR',
  subCategory: 'volcano',
  accessType: 'HIKING',
  typicalStay: 'HALF_DAY_HIKE',
  elevationMeters: 3000,
}

// 第一步：根据 category 获取默认值
base = {
  base_fatigue_score: 5,
  terrain_type: 'FLAT',
  seated_ratio: 0.2,
  intensity_factor: 1.0,
  estimated_duration_min: 60,
}

// 第二步：应用规则增强（按优先级）
// 规则1: accessType='HIKING' → terrain_type='HILLY', seated_ratio=0, intensity_factor=1.5
// 规则2: typicalStay='HALF_DAY_HIKE' → estimated_duration_min=240, intensity_factor=1.5, seated_ratio=0
// 规则3: elevationMeters=3000 → intensity_factor × 1.3
// 规则6: subCategory='volcano' → intensity_factor=1.8, terrain_type='HILLY', base_fatigue_score=8
// 规则7: 没有 trailDifficulty，跳过

// 合并规则（地形取最高强度：HILLY，强度系数乘法叠加，时长取最后覆盖值）
final = {
  base_fatigue_score: 8,  // subCategory 覆盖
  terrain_type: 'HILLY',  // accessType 和 subCategory 都指定 HILLY
  seated_ratio: 0,  // accessType 和 typicalStay 都指定 0
  intensity_factor: 1.5 × 1.3 × 1.8 = 3.51,  // 但会被限制在合理范围内
  estimated_duration_min: 240,  // typicalStay 覆盖
  has_elevator: false,
  wheelchair_accessible: false,
}

// 第三步：规范化（限制数值范围）
physicalMetadata = normalize(final)  // 最终结果
```

---

## 五、关键设计原则

### 5.1 metadata 生成原则

- **最小干预**：只添加缺失的基础字段，保留所有现有数据
- **不覆盖**：如果字段已存在，不修改
- **结构化**：返回符合 `PlaceMetadata` 接口的结构

### 5.2 physicalMetadata 生成原则

- **基于类别**：首先根据 `category` 提供合理的默认值
- **规则优先级**：使用明确的优先级系统，避免规则冲突
- **增量增强**：从 `metadata` 中提取信息增强默认值
- **弱耦合**：Difficulty 和 Fatigue 分离，Difficulty 只做微调
- **数值限制**：最终规范化，确保所有值在合理范围内

### 5.3 数值范围限制（normalize）

```typescript
// 限制范围
base_fatigue_score: 1-10
seated_ratio: 0.0-1.0
intensity_factor: 0.5-3.0（有上限）
estimated_duration_min: 5-1440（5分钟到24小时）
```

---

## 六、使用建议

### 6.1 数据导入时应该包含的字段

为了生成更准确的 `physicalMetadata`，建议在导入 POI 数据时包含：

- `accessType` - 访问类型（HIKING, VEHICLE, CABLE_CAR 等）
- `typicalStay` - 典型停留时间（PHOTO_STOP, HALF_DAY_HIKE 等）
- `elevationMeters` - 海拔高度（米）
- `visitDuration` - 游玩时长（字符串，如 "2小时"）
- `subCategory` - 子类别（如 'volcano', 'glacier', 'hot_spring'）
- `facilities` - 设施信息（wheelchair, parking 等）
- `trailDifficulty` - 徒步难度（EASY, MODERATE, HARD, EXTREME）

### 6.2 脚本的局限性

- **metadata 生成简单**：脚本只添加 `countryCode` 和 `timezone`，其他字段需要在数据导入时提供
- **physicalMetadata 依赖 metadata**：如果 metadata 中没有额外信息，physicalMetadata 只会使用 category 的默认值
- **坐标范围识别不精确**：通过坐标范围识别国家可能有误差，建议优先使用 `countryCode` 或 `regionKey`

### 6.3 改进方向

如果需要更智能的 metadata 生成，可以考虑：
- 从 POI 名称推断类型（使用 NLP）
- 从地址推断城市和时区
- 从外部 API 获取营业时间、联系方式等
- 使用机器学习模型预测体力消耗参数

