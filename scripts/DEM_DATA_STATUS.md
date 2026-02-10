# DEM 数据系统状态文档

**更新时间**: 2026-02-10

## 概述

DEM (Digital Elevation Model，数字高程模型) 数据存储在 PostGIS 数据库中，使用栅格（raster）格式。系统通过多层级查询策略获取海拔数据。

## 数据存储架构

### DEM 表层级结构

系统采用**三级查询策略**，按优先级顺序：

1. **合并城市 DEM 表** (`geo_dem_cities_merged`)
   - **优先级**: 最高
   - **用途**: 包含所有城市数据，性能最佳
   - **覆盖范围**: 主要城市区域
   - **状态**: 如果存在则优先使用

2. **区域 DEM 表** (`geo_dem_xizang` 等)
   - **优先级**: 中等
   - **用途**: 特定区域的高精度数据
   - **覆盖范围**: 特定区域（如西藏）
   - **状态**: 作为后备表

3. **全球 DEM 表** (`geo_dem_global`)
   - **优先级**: 最低
   - **用途**: 全球覆盖，精度较低
   - **覆盖范围**: 全球
   - **状态**: 最终后备，确保全球覆盖

### 查询策略

```typescript
// DEMElevationService.getElevation() 查询流程

1. 尝试查询 geo_dem_cities_merged
   ↓ 成功 → 返回海拔
   ↓ 失败 → 继续

2. 尝试查询区域后备表 (geo_dem_xizang)
   ↓ 成功 → 返回海拔
   ↓ 失败 → 继续

3. 尝试查询 geo_dem_global
   ↓ 成功 → 返回海拔
   ↓ 失败 → 返回 null
```

## 核心服务

### 1. DEMElevationService

**文件**: `src/trips/dem/services/dem-elevation.service.ts`

**功能**:
- 查询单个坐标点的海拔
- 批量查询多个坐标点的海拔
- 检查 DEM 表是否存在
- 获取 DEM 表的覆盖范围

**主要方法**:

```typescript
// 获取单个点海拔
async getElevation(lat: number, lng: number, fallbackTable?: string): Promise<number | null>

// 批量获取海拔
async getElevations(points: Array<{lat: number, lng: number}>): Promise<Array<number | null>>

// 检查表是否存在
async checkDEMTableExists(demTable: string): Promise<boolean>

// 获取表覆盖范围
async getDEMBounds(demTable: string): Promise<{minLat, maxLat, minLng, maxLng} | null>
```

### 2. DEMEffortMetadataService

**文件**: `src/trips/dem/services/dem-effort-metadata.service.ts`

**功能**:
- 计算路线的体力消耗元数据
- 生成海拔剖面（elevation profile）
- 计算累计爬升、坡度、疲劳指数等

**主要方法**:

```typescript
// 计算体力消耗元数据
async calculateEffortMetadata(
  routePoints: RoutePoint[],
  options: {
    activityType?: 'walking' | 'driving' | 'cycling';
    samplingInterval?: number;
    includeElevationProfile?: boolean;
  }
): Promise<EffortMetadata>
```

## API 接口

### 1. 获取单个点海拔

**端点**: `GET /api/dem/elevation`

**参数**:
- `lat` (必需): 纬度
- `lng` (必需): 经度

**示例**:
```bash
GET /api/dem/elevation?lat=64.1466&lng=-21.9426
```

**响应**:
```json
{
  "success": true,
  "data": {
    "lat": 64.1466,
    "lng": -21.9426,
    "elevation": 123.5,
    "unit": "meters"
  }
}
```

### 2. 获取路线海拔剖面

**端点**: `POST /api/dem/profile`

**请求体**:
```json
{
  "polyline": [
    { "lat": 64.1466, "lng": -21.9426 },
    { "lat": 64.1500, "lng": -21.9500 }
  ],
  "samples": 100,
  "activityType": "walking"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "elevationProfile": [...],
    "cumulativeAscent": 21.7,
    "maxSlope": 2.17,
    "fatigueIndex": 2.2,
    "difficulty": "easy"
  }
}
```

### 3. 获取行程地形数据

**端点**: `GET /api/dem/trip/:tripId/terrain`

**参数**:
- `tripId` (路径参数): 行程 ID
- `samples` (查询参数，可选): 采样间隔

## 数据查询方式

### PostGIS 栅格查询

DEM 数据使用 PostGIS 的栅格（raster）功能存储和查询：

```sql
-- 查询海拔
SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(lng, lat), 4326))::INTEGER as elevation
FROM geo_dem_cities_merged
WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
LIMIT 1;
```

### 查询优化

1. **索引**: PostGIS 栅格表使用空间索引加速查询
2. **优先级**: 先查询高精度表，失败后再查询低精度表
3. **批量查询**: 支持批量查询，但当前实现是逐个查询（可优化）

## 数据覆盖情况

### 已知覆盖区域

1. **城市区域**: 
   - 通过 `geo_dem_cities_merged` 表覆盖
   - 包含主要城市的高精度数据

2. **特定区域**:
   - `geo_dem_xizang`: 西藏地区
   - 其他区域表（如果存在）

3. **全球覆盖**:
   - `geo_dem_global`: 全球低精度数据
   - 确保任何坐标都能查询到数据（可能精度较低）

### 数据缺失处理

当查询返回 `null` 时：
- 系统会尝试所有后备表
- 如果所有表都查询失败，返回 `null`
- 调用方需要处理 `null` 情况（使用默认值或标记为数据缺失）

## 在世界模型中的使用

### PhysicalRealityModel

DEM 证据是 `PhysicalRealityModel` 的必需组成部分：

```typescript
interface PhysicalRealityModel {
  demEvidence: DemDecisionEvidence[];  // 必需
  // ...
}
```

### DEM 证据生成流程

1. **路线规划阶段**: 
   - 使用占位符 DEM 证据（`segmentId` 包含 `'placeholder'`）
   - 允许计划生成，但不能 finalize

2. **DEM 证据生成阶段**:
   - 从路线段提取坐标点
   - 调用 `DEMElevationService.getElevation()` 获取海拔
   - 调用 `DEMEffortMetadataService.calculateEffortMetadata()` 计算元数据
   - 生成完整的 `DemDecisionEvidence`

3. **验证阶段**:
   - 检查 DEM 证据是否存在
   - 检查是否有 HARD 违规
   - 验证通过后才能 finalize

## 当前限制和问题

### 1. 数据覆盖不完整

- ⚠️ **问题**: 某些区域可能没有 DEM 数据
- **影响**: 查询返回 `null`，无法生成 DEM 证据
- **解决方案**: 
  - 使用全球 DEM 表作为后备
  - 集成外部 DEM API（如 OpenElevation）

### 2. 批量查询性能

- ⚠️ **问题**: 批量查询是逐个查询，性能较差
- **影响**: 生成长路线的 DEM 证据较慢
- **解决方案**: 
  - 实现真正的批量 PostGIS 查询
  - 使用缓存减少重复查询

### 3. 占位符数据

- ⚠️ **问题**: 计划生成阶段使用占位符 DEM 证据
- **影响**: 占位符不能用于 finalize
- **解决方案**: 
  - 计划生成后立即生成真实 DEM 证据
  - 或允许异步生成 DEM 证据

### 4. 数据精度差异

- ⚠️ **问题**: 不同表的精度不同（城市表 > 区域表 > 全球表）
- **影响**: 某些区域的数据精度较低
- **解决方案**: 
  - 在 metadata 中标记数据源和精度
  - 根据精度调整决策权重

## 改进建议

### 短期改进

1. **添加数据源标记**:
   ```typescript
   interface DemDecisionEvidence {
     // ...
     metadata?: {
       dataSource?: 'cities_merged' | 'regional' | 'global';
       resolution?: number; // 米
       // ...
     };
   }
   ```

2. **实现批量查询优化**:
   ```typescript
   async getElevationsBatch(points: Array<{lat, lng}>): Promise<Array<number | null>> {
     // 使用 PostGIS 批量查询
     const query = `SELECT ... FROM ... WHERE ST_Intersects(...)`;
     // ...
   }
   ```

3. **添加缓存层**:
   ```typescript
   // 缓存最近查询的海拔数据
   const cache = new Map<string, number>();
   ```

### 长期改进

1. **集成外部 DEM API**:
   - OpenElevation API
   - Google Elevation API
   - Mapbox Terrain API

2. **数据质量监控**:
   - 监控查询成功率
   - 记录数据缺失区域
   - 自动触发数据补充

3. **预计算 DEM 证据**:
   - 为常用路线预计算 DEM 证据
   - 缓存到数据库或 Redis

## 测试和验证

### 检查 DEM 表是否存在

```typescript
const demService = new DEMElevationService(prisma);
const exists = await demService.checkDEMTableExists('geo_dem_cities_merged');
console.log(`geo_dem_cities_merged exists: ${exists}`);
```

### 测试查询

```bash
# 测试单个点查询
curl "http://localhost:3000/api/dem/elevation?lat=64.1466&lng=-21.9426"

# 测试路线剖面
curl -X POST "http://localhost:3000/api/dem/profile" \
  -H "Content-Type: application/json" \
  -d '{
    "polyline": [
      {"lat": 64.1466, "lng": -21.9426},
      {"lat": 64.1500, "lng": -21.9500}
    ]
  }'
```

## 相关文件

- `src/trips/dem/services/dem-elevation.service.ts` - DEM 海拔查询服务
- `src/trips/dem/services/dem-effort-metadata.service.ts` - DEM 体力元数据服务
- `src/trips/dem/dem.controller.ts` - DEM API 控制器
- `src/trips/dem/DEM_API_DOCUMENTATION.md` - DEM API 文档
- `src/trips/decision/interfaces/dem-decision-evidence.interface.ts` - DEM 证据接口

## 总结

### 当前状态

✅ **已实现**:
- PostGIS 栅格数据存储
- 三级查询策略（城市 → 区域 → 全球）
- 单个点和批量查询
- 路线海拔剖面生成
- API 接口

⚠️ **限制**:
- 数据覆盖可能不完整
- 批量查询性能待优化
- 占位符数据不能 finalize

### 数据可用性

- **城市区域**: ✅ 高精度数据（如果 `geo_dem_cities_merged` 存在）
- **特定区域**: ✅ 中等精度数据（如果区域表存在）
- **全球覆盖**: ✅ 低精度数据（如果 `geo_dem_global` 存在）
- **数据缺失**: ⚠️ 返回 `null`，需要处理

### 下一步行动

1. 检查数据库中的 DEM 表是否存在
2. 测试 DEM 查询功能
3. 评估数据覆盖情况
4. 根据实际情况优化查询策略
