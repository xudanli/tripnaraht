# POI 路线亲和度文档

## 📋 概述

P2.2: POI 的路线亲和度

本文档描述了 TripNARA 系统中 POI（兴趣点）与路线方向的亲和度计算机制，用于优化POI选择和排序，确保推荐的POI与用户选择的路线方向高度匹配。

## 🎯 设计目标

1. **智能匹配**：根据多个维度计算POI与路线方向的匹配度
2. **可解释性**：提供详细的匹配原因和不匹配原因
3. **灵活配置**：支持自定义权重和计算选项
4. **性能优化**：批量计算，支持缓存

## 📊 亲和度评分维度

### 1. 标签匹配（Tag Match）

**权重**：25%（默认）

**计算方式**：
- 比较POI的标签与路线方向的标签
- 匹配的标签数量 / 路线方向标签总数
- 有匹配至少20分基础分

**示例**：
- 路线方向标签：`["摄影", "徒步", "自然"]`
- POI标签：`["摄影", "观景点"]`
- 匹配度：1/3 = 33.3%，加上基础分 = 53.3分

### 2. 类型匹配（Type Match）

**权重**：30%（默认）

**计算方式**：
- 检查POI类型是否在路线方向的`signaturePois.types`中
- 如果是签名类型，基础80分，根据`signaturePois.weights`调整
- 如果部分匹配（子类型），40分
- 如果不匹配，10分

**示例**：
- 路线方向签名类型：`["volcano", "waterfall", "hot_spring"]`
- POI类型：`"volcano"`
- 类型权重：`signaturePois.weights["volcano"] = 1.5`
- 分数：80 + (1.5 - 1) * 20 = 90分

### 3. 地理位置匹配（Location Match）

**权重**：15%（默认）

**计算方式**：
- 在走廊内：100分
- 在区域内但不在走廊内：70分
- 距离走廊100km内：50-20分（根据距离）
- 不在区域内且距离较远：10分

**示例**：
- POI在路线走廊内：100分
- POI在路线区域但不在走廊：70分
- POI距离走廊50km：35分

### 4. 目标权重匹配（Objective Match）

**权重**：15%（默认）

**计算方式**：
- 检查POI标签是否匹配路线方向的`objectives`偏好
- 匹配的目标权重总和 / 总目标权重

**目标映射**：
- `preferViewpoints` → `["viewpoint", "观景点", "摄影", "photography"]`
- `preferHotSpring` → `["hot_spring", "温泉", "spa"]`
- `preferPhotography` → `["photography", "摄影", "viewpoint", "观景点"]`
- `preferHiking` → `["hiking", "徒步", "trail", "步道"]`
- `preferCulture` → `["museum", "博物馆", "temple", "寺庙", "culture", "文化"]`
- `preferNature` → `["nature", "自然", "waterfall", "瀑布", "volcano", "火山"]`

**示例**：
- 路线目标：`{ preferViewpoints: 0.5, preferPhotography: 0.3 }`
- POI标签：`["摄影", "观景点"]`
- 匹配权重：0.5 + 0.3 = 0.8
- 分数：(0.8 / 0.8) * 100 = 100分

### 5. 示例POI加分（Example Bonus）

**权重**：10%（默认）

**计算方式**：
- 如果POI在`signaturePois.examples`中：100分
- 否则：0分

**示例**：
- POI ID在路线方向的示例列表中：100分
- 不在：0分

### 6. 季节性匹配（Seasonality Match）

**权重**：5%（默认）

**计算方式**：
- 当前月份在最佳月份中：100分
- 当前月份在禁忌月份中：0分
- 距离最佳月份越近分数越高（30-90分）

**示例**：
- 路线最佳月份：`[6, 7, 8]`
- 当前月份：7月
- 分数：100分

## 🔧 使用方式

### 基本使用

```typescript
// 计算单个POI的亲和度
const affinity = await poiAffinityService.calculateAffinity(
  poiInfo,
  routeDirection,
  {
    currentMonth: 7,
    considerLocation: true,
    considerSeasonality: true,
  }
);

console.log(`亲和度分数: ${affinity.affinityScore}`);
console.log(`匹配原因: ${affinity.matchReasons.join(', ')}`);
```

### 批量计算

```typescript
// 批量计算多个POI的亲和度
const affinities = await poiAffinityService.calculateAffinities(
  poiInfos,
  routeDirection,
  {
    currentMonth: 7,
  }
);

// 按亲和度分数排序
affinities.sort((a, b) => b.affinityScore - a.affinityScore);
```

### 自定义权重

```typescript
// 自定义各维度权重
const affinity = await poiAffinityService.calculateAffinity(
  poiInfo,
  routeDirection,
  {
    customWeights: {
      tagMatch: 0.3,      // 提高标签匹配权重
      typeMatch: 0.4,     // 提高类型匹配权重
      locationMatch: 0.1, // 降低地理位置权重
      objectiveMatch: 0.1,
      exampleBonus: 0.05,
      seasonalityMatch: 0.05,
    },
  }
);
```

## 📈 集成到路线生成

POI路线亲和度服务已集成到`RouteDirectionPoiGeneratorService`中：

1. **自动计算**：生成候选POI后自动计算亲和度
2. **自动排序**：根据亲和度分数对候选POI排序
3. **质量分数更新**：将亲和度分数归一化后更新`qualityScore`
4. **元数据存储**：将亲和度信息存储到`affinityInfo`中，用于调试和解释

**示例输出**：
```typescript
{
  id: "poi-uuid",
  name: { zh: "蓝湖温泉" },
  qualityScore: 0.85, // 亲和度分数归一化
  affinityInfo: {
    score: 85,
    reasons: [
      "类型匹配：hot_spring（路线代表性类型）",
      "位于路线走廊内",
      "符合路线偏好：preferHotSpring",
    ],
  },
}
```

## 🎨 分数分解示例

```typescript
{
  affinityScore: 85.5,
  scoreBreakdown: {
    tagMatch: {
      score: 80,
      weight: 0.25,
      matchedTags: ["温泉", "spa"],
      totalRouteTags: 5,
    },
    typeMatch: {
      score: 90,
      weight: 0.30,
      poiType: "hot_spring",
      isSignatureType: true,
      typeWeight: 1.5,
    },
    locationMatch: {
      score: 100,
      weight: 0.15,
      inRegion: true,
      inCorridor: true,
    },
    objectiveMatch: {
      score: 100,
      weight: 0.15,
      matchedObjectives: ["preferHotSpring"],
    },
    exampleBonus: {
      score: 0,
      weight: 0.10,
      isExample: false,
    },
    seasonalityMatch: {
      score: 100,
      weight: 0.05,
      currentMonth: 7,
      isBestMonth: true,
      isAvoidMonth: false,
    },
  },
  matchReasons: [
    "标签匹配：温泉、spa",
    "类型匹配：hot_spring（路线代表性类型）",
    "位于路线走廊内",
    "符合路线偏好：preferHotSpring",
    "当前月份（7月）为最佳旅行时间",
  ],
}
```

## 🔍 调试和监控

### 日志输出

服务会记录以下信息：
- 亲和度计算完成日志
- 平均亲和度分数
- 计算失败警告

### 元数据存储

每个候选POI的`affinityInfo`包含：
- `score`: 亲和度分数（0-100）
- `reasons`: 匹配原因列表

## 🚀 性能优化

1. **批量计算**：使用`calculateAffinities`批量计算，减少数据库查询
2. **缓存友好**：亲和度计算结果可以缓存
3. **可选计算**：可以通过选项控制是否计算地理位置和季节性匹配

## 📝 注意事项

1. **地理位置计算**：需要PostGIS支持，如果失败会降级处理
2. **季节性匹配**：需要提供`currentMonth`参数
3. **权重总和**：自定义权重应该总和为1.0，否则分数会偏差
4. **性能考虑**：大量POI计算时建议使用批量接口

## 🔗 相关文档

- [POI分层架构](./POI_LAYER_ARCHITECTURE.md)
- [路线方向选择器](./ROUTE_DIRECTION_SELECTOR.md)
- [路线方向POI生成器](./ROUTE_DIRECTION_POI_GENERATOR.md)

