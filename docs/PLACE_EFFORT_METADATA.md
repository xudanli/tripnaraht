# Place 表体力消耗元数据更新指南

## 概述

基于 DEM 数据计算并更新 Place 表的体力消耗元数据，存储在 `physicalMetadata.effort` 字段中。

## 数据结构

体力消耗元数据存储在 `Place.physicalMetadata.effort` 中：

```typescript
interface EffortMetadata {
  /** 累计爬升（米） */
  totalAscent?: number;
  /** 累计下降（米） */
  totalDescent?: number;
  /** 最高海拔（米） */
  maxElevation?: number;
  /** 最低海拔（米） */
  minElevation?: number;
  /** 平均海拔（米） */
  avgElevation?: number;
  /** 最大坡度（百分比） */
  maxSlope?: number;
  /** 平均坡度（百分比） */
  avgSlope?: number;
  /** 总距离（米） */
  totalDistance?: number;
  /** 体力消耗评分（0-100） */
  effortScore?: number;
  /** 难度等级 */
  difficulty?: 'easy' | 'moderate' | 'hard' | 'extreme';
  /** 预计时长（分钟） */
  estimatedDuration?: number;
  /** 建议休息点数量 */
  suggestedRestPoints?: number;
  /** 地形复杂度（0-1） */
  terrainComplexity?: number;
  /** 海拔（米）- 单个点的海拔 */
  elevation?: number;
  /** 更新时间 */
  updatedAt?: string;
}
```

## 计算策略

### 1. 徒步路线起点/终点

如果 Place 是徒步路线的起点或终点：
- 计算从起点到终点的完整路线消耗
- 包含：累计爬升、坡度、预计时长等

### 2. 景点（ATTRACTION）

如果 Place 是景点：
- 查找附近的入口POI（trailhead, parking, information）
- 计算从最近入口到景点的消耗
- 如果找不到入口，只记录当前点的海拔

### 3. 其他类型

对于其他类型的 Place：
- 只记录当前点的海拔
- 不计算路线消耗

## 使用方法

### 更新所有 Place

```bash
npm run update:place:effort -- --all
```

### 更新指定 Place

```bash
npm run update:place:effort -- --place-id 123
```

### 按类别更新

```bash
npm run update:place:effort -- --category ATTRACTION
```

### 按城市更新

```bash
npm run update:place:effort -- --city-id 1
```

### 干运行（预览，不实际更新）

```bash
npm run update:place:effort -- --all --dry-run
```

## 使用示例

### 在代码中读取体力消耗元数据

```typescript
const place = await prisma.place.findUnique({
  where: { id: placeId },
});

const physicalMetadata = place?.physicalMetadata as any;
const effort = physicalMetadata?.effort;

if (effort) {
  console.log(`累计爬升: ${effort.totalAscent}m`);
  console.log(`体力消耗评分: ${effort.effortScore}`);
  console.log(`难度: ${effort.difficulty}`);
  console.log(`预计时长: ${effort.estimatedDuration}分钟`);
}
```

### 在行程规划中使用

```typescript
// 根据体力消耗调整行程强度
if (effort?.effortScore && effort.effortScore > 70) {
  // 高消耗活动，建议：
  // 1. 增加休息时间
  // 2. 降低当日其他活动强度
  // 3. 提前准备补给
}
```

## 与现有 PhysicalMetadata 的关系

`physicalMetadata` 包含两部分：

1. **基础体力消耗**（现有字段）：
   - `base_fatigue_score` - 游玩时的基础消耗
   - `terrain_type` - 地形类型
   - `intensity_factor` - 强度系数
   - `estimated_duration_min` - 预估游玩时长

2. **路线体力消耗**（新增 effort 字段）：
   - `totalAscent` - 累计爬升
   - `effortScore` - 路线消耗评分
   - `difficulty` - 路线难度
   - `estimatedDuration` - 路线预计时长

两者可以结合使用：
- 基础消耗：游玩景点本身的体力消耗
- 路线消耗：到达景点或完成路线的体力消耗

## 更新频率

建议：
- **首次导入**：批量更新所有 Place
- **新增 Place**：创建时自动计算
- **定期更新**：每月或每季度更新一次

## 注意事项

1. **DEM 数据依赖**：需要先导入 DEM 数据才能计算
2. **计算耗时**：每个 Place 需要查询 DEM 数据，批量更新可能较慢
3. **数据完整性**：不是所有 Place 都有路线消耗数据（如餐厅、酒店）
4. **坐标要求**：Place 必须有有效的 `location` 坐标

## 相关文档

- [DEM体力消耗元数据文档](./DEM_EFFORT_METADATA.md)
- [DEM测试用例](./DEM_TEST_CASES.md)
- [Place vs POI](./PLACE_VS_POI.md)

