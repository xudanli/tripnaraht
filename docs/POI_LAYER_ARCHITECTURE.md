# POI 分层架构文档

## 📋 概述

P2.1: POI 的正确分层

本文档描述了 TripNARA 系统中 POI（兴趣点）数据的分层架构，确保在路线生成时只使用稳定可靠的数据层，避免使用高度动态的实时数据。

## 🎯 设计目标

1. **数据稳定性**：路线生成应基于稳定、可预测的数据
2. **性能优化**：避免在路线生成时依赖实时API调用
3. **数据质量**：区分不同数据层的更新频率和质量
4. **可扩展性**：支持未来接入更多数据源

## 📊 三层架构

### 1. 静态层（STATIC）

**定义**：基本不变的数据，如地理位置、名称、类型

**特点**：
- 更新频率：静态（很少变化）
- 数据来源：OSM、官方地理数据库
- 用于路线生成：✅ 是
- 典型字段：
  - POI ID、名称、多语言名称
  - 地理位置（经纬度、地址、区域）
  - 分类、子分类、标签
  - 数据来源、外部ID

**存储位置**：`poi_canonical` 表

**示例**：
```typescript
{
  id: "uuid-123",
  name: "蓝湖温泉",
  location: { lat: 64.0479, lng: -22.1906 },
  category: "hot_spring",
  tags: ["温泉", "spa", "relaxation"]
}
```

### 2. 半动态层（SEMI_DYNAMIC）

**定义**：定期更新的数据，如开放时间、价格、评分

**特点**：
- 更新频率：每日或每周
- 数据来源：POI数据库、第三方API（定期同步）
- 用于路线生成：✅ 是
- 典型字段：
  - 开放时间（结构化或原始字符串）
  - 价格信息（价格范围、具体价格）
  - 评分信息（平均分、评分数量）
  - 联系方式（电话、网站、社交媒体）
  - 预订信息（是否需要预订、预订难度）

**存储位置**：`poi_canonical` 表（`opening_hours`, `phone`, `website` 等字段）

**示例**：
```typescript
{
  poiId: "uuid-123",
  openingHours: {
    raw: "Mo-Fr 09:00-18:00",
    structured: {
      "monday": [{ open: "09:00", close: "18:00" }]
    }
  },
  contact: {
    phone: "+354 420 8800",
    website: "https://www.bluelagoon.com"
  }
}
```

### 3. 高度动态层（HIGHLY_DYNAMIC）

**定义**：实时变化的数据，如实时可用性、拥挤度、天气影响

**特点**：
- 更新频率：实时或每小时
- 数据来源：实时API、预测服务、外部服务
- 用于路线生成：❌ 否（仅用于运行时决策）
- 典型字段：
  - 实时可用性（是否开放、可用容量）
  - 拥挤度（等级、描述、预计等待时间）
  - 天气影响（是否受影响、影响程度）
  - 实时事件（关闭、维护、特殊活动）

**存储位置**：外部API、缓存服务（Redis）

**示例**：
```typescript
{
  poiId: "uuid-123",
  availability: {
    isOpen: true,
    isAvailable: true,
    capacityPercentage: 75
  },
  crowding: {
    level: 3,
    description: "busy",
    estimatedWaitTime: 15
  },
  weatherImpact: {
    isAffected: false
  }
}
```

## 🔧 实现细节

### 核心服务

#### `POILayerService`

位置：`src/poi/services/poi-layer.service.ts`

**主要方法**：

1. **`getPOIsForRouteGeneration(poiIds: string[])`**
   - 获取用于路线生成的POI数据（只包含静态和半动态层）
   - 自动过滤掉高度动态层

2. **`getPOIForRouteGeneration(poiId: string)`**
   - 获取单个POI用于路线生成

3. **`getCompletePOI(poiId: string)`**
   - 获取完整的POI数据（包含所有层）
   - 用于运行时决策和UI展示

4. **`filterUsablePOIs(poiIds: string[])`**
   - 批量过滤出可用于路线生成的POI

5. **`getPOILayerMetadata(poiId: string)`**
   - 获取POI各层的数据质量元数据

### 集成点

#### `RouteDirectionPoiGeneratorService`

位置：`src/route-directions/services/route-direction-poi-generator.service.ts`

**更新**：
- 注入 `POILayerService`
- 在生成候选POI时自动过滤，只使用静态和半动态层
- 记录过滤日志，便于调试

**示例代码**：
```typescript
// 使用POI分层服务过滤出可用于路线生成的POI
let usableUuids = exampleUuids;
if (this.poiLayerService) {
  usableUuids = await this.poiLayerService.filterUsablePOIs(exampleUuids);
  this.logger.log(
    `POI分层过滤: ${exampleUuids.length} -> ${usableUuids.length} (只使用静态+半动态层)`
  );
}
```

## 📈 数据质量评分

系统为每个数据层计算质量评分（0-100），用于评估数据完整性和可靠性。

### 静态层评分标准

- 名称（20分）：有名称且不是"未命名"
- 位置（30分）：有有效的经纬度
- 分类（20分）：有明确的分类
- 标签（20分）：有标签信息
- 地址（10分）：有地址信息

### 半动态层评分标准

- 开放时间（40分）：有开放时间信息
- 联系方式（30分）：有电话或网站
- 价格信息（20分）：有价格信息
- 评分信息（10分）：有评分信息

## 🚀 使用指南

### 在路线生成中使用

```typescript
// 自动过滤，只使用静态+半动态层
const candidates = await routeDirectionPoiGeneratorService.generateCandidatePois(
  recommendation,
  regions,
  bufferMeters
);
// 此时 candidates 中的所有POI都只包含静态和半动态层数据
```

### 获取完整POI数据（运行时）

```typescript
// 获取完整数据（包含高度动态层）
const completePOI = await poiLayerService.getCompletePOI(poiId);
if (completePOI.highlyDynamic?.availability?.isOpen === false) {
  // 处理POI关闭的情况
}
```

### 检查POI是否可用于路线生成

```typescript
const usable = await poiLayerService.isUsableForRouteGeneration(poiId);
if (!usable) {
  // POI不可用（可能缺少静态层数据）
}
```

## 🔮 未来扩展

### 高度动态层数据源

未来可以接入以下数据源：

1. **Google Places API**
   - 实时可用性
   - 实时拥挤度
   - 实时评分

2. **天气服务**
   - 天气影响评估
   - 季节性可用性

3. **预订系统**
   - 实时可用性
   - 预订状态

4. **社交媒体**
   - 实时拥挤度预测
   - 用户反馈

### 数据同步策略

1. **静态层**：按需更新（当OSM数据更新时）
2. **半动态层**：每日同步（通过定时任务）
3. **高度动态层**：实时查询（通过API或缓存）

## 📝 注意事项

1. **路线生成时**：只使用静态和半动态层，确保稳定性和可预测性
2. **运行时决策**：可以使用高度动态层数据，但不应影响已生成的路线结构
3. **数据质量**：定期检查数据质量评分，确保数据完整性
4. **性能考虑**：高度动态层数据应通过缓存机制减少API调用

## 🔗 相关文档

- [POI数据集成总结](./POI_DATA_INTEGRATION_SUMMARY.md)
- [路线方向POI生成器](./ROUTE_DIRECTION_POI_GENERATOR.md)
- [数据治理架构分析](./数据治理架构分析.md)

