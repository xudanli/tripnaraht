# 世界模型 API 接口文档

## 概述

世界模型（World Model）是系统的核心决策基础，包含三个主要组成部分：
- **PhysicalRealityModel**（物理现实模型）：DEM证据、道路状态、危险区域、渡轮状态、气候季节性
- **HumanCapabilityModel**（人体能力模型）：体能、节奏、风险承受度
- **RouteDirection**（路线方向）：路线哲学、季节性、约束

---

## API 接口列表

### 1. 构建世界模型上下文

**端点**: `POST /api/world/buildContext`

**描述**: 根据 tripId 或原始参数构建完整的世界模型上下文（WorldModelContext）

**请求体**:
```json
{
  "tripId": "9a4dbd2e-e76a-4fd3-bab0-09332fb2581b",  // 推荐：从 Trip 中提取所有信息
  // 或使用原始参数：
  "countryCode": "IS",
  "season": 7,
  "duration": 8,
  "partyProfile": {
    "riskTolerance": "high",
    "fitness": "high",
    "pace": "moderate"
  },
  "routeDirectionId": "cf4283ff-4a88-4824-a306-66d4b2af979c"  // 可选
}
```

**响应格式**:
```json
{
  "success": true,
  "data": {
    "world": {
      "physical": {
        "demEvidence": [
          {
            "segmentId": "trip_xxx_full_route",
            "elevationProfile": [5.4, 104.3, 136.1, ...],
            "cumulativeAscent": 1680.5,
            "maxSlopePct": 1.21,
            "rollingAscent3Days": 1054.3,
            "fatigueIndex": 7.81,
            "violation": "NONE",
            "explanation": "基于实际行程路线生成：10 个路线点，总距离 601.2km，累计爬升 1680.5m",
            "metadata": {
              "elevationRange": {
                "min": -0.6,
                "max": 1058.4
              },
              "distanceM": 601232.8,
              "avgSlopePct": 0.5
            }
          }
        ],
        "roadStates": [],
        "hazardZones": [],
        "ferryStates": [],
        "countryCode": "IS",
        "month": 7
      },
      "human": {
        "profileId": "party-xxx",
        "maxDailyAscentM": 1200,
        "rollingAscent3DaysM": 3000,
        "maxSlopePct": 30,
        "preferredPace": "MEDIUM",
        "riskTolerance": "HIGH",
        "highAltitudeExperience": "NONE",
        "maxElevationM": 3000
      },
      "routeDirection": {
        "id": 30,
        "uuid": "cf4283ff-4a88-4824-a306-66d4b2af979c",
        "name": "西峡湾环线",
        "countryCode": "IS",
        ...
      }
    },
    "missingPieces": {
      "demGaps": [],
      "humanProfileIncomplete": false,
      "routeDirectionMissing": false,
      "physicalRealityIncomplete": false
    }
  }
}
```

**功能说明**:
- 如果提供 `tripId`，会从实际行程路线（ItineraryItem）提取坐标生成真实的 DEM 证据
- 如果路线点不足，会返回占位符 DEM 证据（标记为 `physicalRealityIncomplete: true`）
- 自动使用冰岛 20m DEM 数据（如果坐标在冰岛范围内）

**示例请求**:
```bash
# 使用 tripId（推荐）
curl -X POST http://localhost:3000/api/world/buildContext \
  -H "Content-Type: application/json" \
  -d '{"tripId": "trip-iceland-froad-1770720249574"}'

# 使用原始参数
curl -X POST http://localhost:3000/api/world/buildContext \
  -H "Content-Type: application/json" \
  -d '{
    "countryCode": "IS",
    "season": 7,
    "duration": 8,
    "partyProfile": {
      "fitness": "high",
      "pace": "moderate",
      "riskTolerance": "high"
    }
  }'
```

---

## 相关接口（世界模型组成部分）

### 2. DEM 海拔查询

**端点**: `GET /api/dem/elevation`

**描述**: 查询单个坐标点的海拔高度（世界模型 PhysicalRealityModel 的数据源）

**查询参数**:
- `lat` (必需): 纬度
- `lng` (必需): 经度

**响应格式**:
```json
{
  "success": true,
  "data": {
    "lat": 64.1466,
    "lng": -21.9426,
    "elevation": 5,
    "unit": "meters"
  }
}
```

**查询优先级**:
1. 冰岛专用高精度 DEM (`geo_dem_iceland_20m`) - 如果坐标在冰岛范围内
2. 合并城市 DEM (`geo_dem_cities_merged`)
3. 区域 DEM 表（如 `geo_dem_xizang`）
4. 全球 DEM (`geo_dem_global`)

**示例请求**:
```bash
curl "http://localhost:3000/api/dem/elevation?lat=64.1466&lng=-21.9426"
```

---

### 3. DEM 路线海拔剖面

**端点**: `POST /api/dem/profile`

**描述**: 生成路线的详细海拔剖面（用于世界模型的 DEM 证据生成）

**请求体**:
```json
{
  "polyline": [
    { "lat": 64.1466, "lng": -21.9426 },
    { "lat": 64.2553, "lng": -21.1150 },
    { "lat": 63.9833, "lng": -19.0667 }
  ],
  "samples": 100,
  "activityType": "driving"
}
```

**响应格式**:
```json
{
  "success": true,
  "data": {
    "elevationProfile": [
      {
        "distance": 0,
        "lat": 64.1466,
        "lng": -21.9426,
        "elevation": 5.4,
        "slope": 0,
        "cumulativeAscent": 0
      },
      {
        "distance": 41834,
        "lat": 64.2553,
        "lng": -21.1150,
        "elevation": 104.3,
        "slope": 0.24,
        "cumulativeAscent": 98.9
      }
    ],
    "cumulativeAscent": 1680.5,
    "maxSlope": 1.21,
    "fatigueIndex": 7.81
  }
}
```

**示例请求**:
```bash
curl -X POST http://localhost:3000/api/dem/profile \
  -H "Content-Type: application/json" \
  -d '{
    "polyline": [
      {"lat": 64.1466, "lng": -21.9426},
      {"lat": 64.2553, "lng": -21.1150}
    ],
    "samples": 100
  }'
```

---

## 世界模型数据流

```
用户请求
  ↓
POST /api/world/buildContext
  ↓
WorldBuildContextSkill.execute()
  ↓
├─→ 从 Trip 提取信息（如果提供 tripId）
│   ├─→ 提取 ItineraryItem 坐标
│   ├─→ 查询 DEM 数据（使用 DEMElevationService）
│   └─→ 生成 DEM 证据（使用 DEMEffortMetadataService）
│
├─→ 构建 PhysicalRealityModel
│   ├─→ DEM 证据（从实际路线或占位符）
│   ├─→ 道路状态（从 Exa 实时信息）
│   ├─→ 危险区域
│   └─→ 渡轮状态
│
├─→ 构建 HumanCapabilityModel
│   └─→ 从 partyProfile 或 Trip.pacingConfig 提取
│
└─→ 获取 RouteDirection
    └─→ 从 RouteDirectionsService 查询
```

---

## 使用场景

### 场景 1: 计划生成阶段

在计划生成之前，使用原始参数构建世界模型：

```bash
POST /api/world/buildContext
{
  "countryCode": "IS",
  "season": 7,
  "partyProfile": {
    "fitness": "high",
    "pace": "moderate"
  }
}
```

**返回**: 占位符 DEM 证据（`physicalRealityIncomplete: true`）

### 场景 2: 路线规划完成后

路线规划完成后，使用 tripId 构建世界模型：

```bash
POST /api/world/buildContext
{
  "tripId": "trip-iceland-froad-xxx"
}
```

**返回**: 真实的 DEM 证据（基于实际路线点）

---

## 数据质量说明

### DEM 证据质量

- **占位符**: `segmentId` 包含 `'placeholder'`，`elevationProfile` 为空
- **真实数据**: `segmentId` 为 `trip_{tripId}_full_route`，包含完整的海拔剖面

### 缺失数据片段

`missingPieces` 字段指示哪些数据不完整：
- `demGaps`: DEM 数据缺口列表
- `humanProfileIncomplete`: 人体能力模型不完整
- `routeDirectionMissing`: 缺少路线方向
- `physicalRealityIncomplete`: 物理现实模型不完整（通常是占位符 DEM 证据）

---

## 相关文档

- `scripts/ICELAND_DEM_WORLD_MODEL_TEST_REPORT.md` - 冰岛 DEM 世界模型测试报告
- `scripts/route-planning-and-world-model-test.md` - 路线规划和世界模型测试指南
- `src/trips/dem/DEM_API_DOCUMENTATION.md` - DEM API 完整文档
- `WORLD_MODEL_ARCHITECTURE.md` - 世界模型架构文档

---

**最后更新**: 2026-02-10
