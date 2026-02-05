# GeoAgent - 地理与路线 Agent

## 架构定位

**所属层级**：World Model & Context Layer（世界模型层）

**Domain Agent 类型**：地理领域专家

GeoAgent 是 TripNARA 的"地理专家"，负责**地理结构分析、路线可行性评估、空间关系计算**。核心能力是理解物理世界的空间结构。

> **核心理念**：地理是硬约束的基础，GeoAgent 负责"物理世界能不能走通"

---

## 核心职责

### 1. 地理结构分析

```typescript
interface GeographicAnalysis {
  // 地形分析
  terrain: {
    elevationProfile: ElevationPoint[];  // 海拔剖面
    maxElevation: number;
    minElevation: number;
    totalAscent: number;                 // 累计爬升
    totalDescent: number;                // 累计下降
    maxSlope: number;                    // 最大坡度
    terrainType: 'FLAT' | 'HILLY' | 'MOUNTAINOUS' | 'ALPINE';
  };
  
  // 道路网络
  roadNetwork: {
    roadTypes: Map<string, number>;      // 道路类型分布
    roadConditions: RoadCondition[];     // 路况
    restrictions: RoadRestriction[];     // 限制（封路、单行等）
  };
  
  // 空间结构
  spatialStructure: {
    regions: Region[];                   // 区域划分
    corridors: Corridor[];               // 走廊（主要路线）
    hubs: Hub[];                         // 枢纽点
  };
}
```

### 2. 路线可行性评估

```typescript
interface RouteFeasibility {
  routeId: string;
  
  // 可达性
  reachability: {
    isReachable: boolean;
    blockingFactors?: string[];          // 阻断因素
    alternativeRoutes?: RouteAlternative[];
  };
  
  // 难度评估
  difficulty: {
    overall: 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT';
    factors: {
      terrain: DifficultyLevel;
      distance: DifficultyLevel;
      elevation: DifficultyLevel;
      roadCondition: DifficultyLevel;
    };
  };
  
  // 时间估算
  timeEstimate: {
    optimistic: number;   // 乐观估计（分钟）
    expected: number;     // 期望值
    pessimistic: number;  // 悲观估计
    confidence: number;   // 置信度
  };
  
  // 证据
  evidence: EvidenceRef[];
}
```

### 3. 空间关系计算

```typescript
interface SpatialRelations {
  // 距离矩阵
  distanceMatrix: {
    points: GeoPoint[];
    distances: number[][];               // 两两距离
    durations: number[][];               // 两两时长
  };
  
  // 邻近分析
  proximityAnalysis: {
    nearbyPOIs: Map<string, POI[]>;      // 各点附近的 POI
    clusterAnalysis: Cluster[];          // 聚类分析
  };
  
  // 走廊分析
  corridorAnalysis: {
    mainCorridor: GeoPolygon;            // 主走廊
    branchCorridors: GeoPolygon[];       // 分支走廊
    coverageArea: number;                // 覆盖面积
  };
}
```

---

## 输入/输出 Schema

### 输入：GeoAgentInput

```typescript
{
  request_id: string;
  
  // 查询类型
  query_type: 'ANALYZE_TERRAIN' | 'CHECK_FEASIBILITY' | 'CALCULATE_SPATIAL' | 'FIND_ALTERNATIVES';
  
  // 地理范围
  geo_scope: {
    origin: GeoPoint;
    destination: GeoPoint;
    waypoints?: GeoPoint[];
    boundingBox?: GeoBoundingBox;
  };
  
  // 约束条件
  constraints?: {
    maxDistance?: number;
    maxDuration?: number;
    maxElevation?: number;
    avoidRoadTypes?: string[];
    requiredRoadTypes?: string[];
  };
  
  // 交通方式
  transport_mode: 'DRIVE' | 'WALK' | 'CYCLE' | 'TRANSIT';
}
```

### 输出：GeoAgentOutput

```typescript
{
  request_id: string;
  
  // 地形分析
  terrain_analysis?: GeographicAnalysis['terrain'];
  
  // 路线可行性
  route_feasibility?: RouteFeasibility;
  
  // 空间关系
  spatial_relations?: SpatialRelations;
  
  // 替代方案
  alternatives?: Array<{
    alternativeId: string;
    route: Route;
    comparison: {
      vsPrimary: string;
      tradeoff: string;
    };
  }>;
  
  // 硬约束检查结果
  hard_constraint_check: {
    passed: boolean;
    violations?: Array<{
      constraint: string;
      violation: string;
      evidence: EvidenceRef[];
    }>;
  };
  
  // 证据
  evidence: EvidenceRef[];
  
  // 置信度
  confidence: number;
}
```

---

## 与约束系统的关系

GeoAgent 输出直接影响 **Hard Constraints**：

| GeoAgent 输出 | 约束类型 | 处理方式 |
|---------------|----------|----------|
| 不可达 | HARD | 直接 BLOCK |
| 道路封闭 | HARD | 直接 BLOCK |
| 难度超限 | HARD/SOFT | 取决于用户能力 |
| 时间过长 | SOFT | 权衡处理 |

---

## 数据来源

- DEM 数据（地形）
- 道路网络数据
- 实时路况 API
- 封路/施工信息
- POI 地理位置

---

## 与其他 Agent 的协作

| 协作 Agent | 协作方式 |
|------------|----------|
| **Gatekeeper** | 提供可达性检查结果 |
| **LocalInsight** | 提供空间替代方案 |
| **WeatherAgent** | 天气影响路况评估 |
| **CoreDecision** | 提供地理维度评分 |

---

## Claude 快捷唤起

```
作为 TripNARA 的 GeoAgent，请分析：
[起点] → [终点]
[途经点（可选）]

要求：
1. 分析地形（海拔、坡度、难度）
2. 评估路线可行性（是否可达、阻断因素）
3. 计算空间关系（距离、时长）
4. 如有问题，提供替代路线
5. 输出硬约束检查结果
```
