# 国家能力包（Capability Packs）使用指南

## 概述

国家能力包是一套可复用的地理/环境能力包系统，基于地理特征和 POI 数据自动触发。这些 Pack 可以应用到任何国家/地区，无需硬编码。

## 设计理念

### 为什么需要能力包？

传统的 Readiness Pack 是**目的地特定**的（如 `norway-pack.example.ts`），每个目的地都需要单独维护。而能力包是**地理特征驱动**的，可以自动应用到任何符合条件的目的地。

### 核心优势

1. **可复用**: 一套 Pack 可以应用到全世界
2. **自动触发**: 基于地理特征自动判断是否需要
3. **数据驱动**: 依赖地理数据和 POI 数据，而非硬编码
4. **易于扩展**: 添加新 Pack 即可覆盖新场景

## 5 个核心能力包

### 1. High Altitude Pack（高海拔）

**触发条件**:
- 海拔 >= 2500m/3000m
- 或高原国家标签（如不丹、尼泊尔）

**输出**:
- 高反分级和风险评估
- 适应日安排建议
- 禁忌事项提醒
- 氧气/医院/药房优先插入

**适用场景**:
- 不丹、尼泊尔、秘鲁、玻利维亚等高海拔国家
- 任何海拔超过 2500m 的地区

### 2. Sparse Supply Pack（补给稀疏）

**触发条件**:
- 路线段距离长（> 100km）
- 道路密度低（< 0.3）
- 沿途 FUEL/SUPPLY 密度低（< 0.2）

**输出**:
- 强制加油点/补给点插入
- 离线地图提醒
- 备用水食建议

**适用场景**:
- 澳大利亚内陆
- 撒哈拉沙漠
- 西伯利亚
- 任何补给稀疏的长距离路线

### 3. Seasonal Road Pack（季节性封路/山口）

**触发条件**:
- 命中 mountain_pass 或山地覆盖高
- 冬季月份（11-3 月）

**输出**:
- 避免夜行提醒
- 加 buffer 时间建议
- 查封路/胎链提醒

**适用场景**:
- 挪威冬季山口（Trollstigen）
- 阿尔卑斯山冬季路线
- 任何冬季山地路线

### 4. Permit & Checkpoint Pack（许可/检查站）

**触发条件**:
- 命中检查站/边境限制关键词
- 或国家规则（如中国、俄罗斯、印度）

**输出**:
- 证件/边防证/许可要求
- 拍摄限制提醒
- 路线绕行或降级提示

**适用场景**:
- 中国西藏、新疆（需要边防证）
- 俄罗斯远东地区
- 印度边境地区
- 任何需要特殊许可的地区

### 5. Emergency Pack（应急）

**触发条件**:
- 偏远地区（道路密度 < 0.2）
- 海拔高（> 3000m）
- 长距离无人区（> 300km）

**输出**:
- 最近医院/警局位置
- 紧急电话列表
- 通信弱提示
- 保险建议

**适用场景**:
- 任何偏远地区
- 高海拔地区
- 长距离无人区

## 使用方法

### 1. 基本使用

```typescript
import { CapabilityPackEvaluatorService } from './readiness/services/capability-pack-evaluator.service';
import { highAltitudePack, sparseSupplyPack } from './readiness/packs';

// 评估能力包
const evaluator = new CapabilityPackEvaluatorService();

const context: TripContext = {
  traveler: { ... },
  trip: { ... },
  itinerary: {
    countries: ['NP'], // 尼泊尔
    season: 'winter',
    activities: ['hiking'],
  },
  geo: {
    mountains: {
      mountainElevationAvg: 3500, // 高海拔
      inMountain: true,
    },
    roads: {
      roadDensityScore: 0.15, // 道路稀疏
    },
    pois: {
      supply: {
        hasFuel: false,
        hasSupermarket: false,
      },
    },
  },
};

// 评估高海拔 Pack
const altitudeResult = evaluator.evaluatePack(highAltitudePack, context);
if (altitudeResult.triggered) {
  console.log('高海拔 Pack 已触发');
  console.log('规则:', altitudeResult.rules);
}

// 评估补给稀疏 Pack
const supplyResult = evaluator.evaluatePack(sparseSupplyPack, context);
if (supplyResult.triggered) {
  console.log('补给稀疏 Pack 已触发');
}
```

### 2. 转换为 Readiness Pack

```typescript
// 将能力包转换为 Readiness Pack
const readinessPack = evaluator.convertToReadinessPack(
  highAltitudePack,
  'NP-NEPAL',
  context.geo
);

// 使用 ReadinessService 检查
const result = await readinessService.checkFromPacks(
  [readinessPack],
  context
);
```

### 3. 批量评估所有 Pack

```typescript
import {
  highAltitudePack,
  sparseSupplyPack,
  seasonalRoadPack,
  permitCheckpointPack,
  emergencyPack,
} from './readiness/packs';

const allPacks = [
  highAltitudePack,
  sparseSupplyPack,
  seasonalRoadPack,
  permitCheckpointPack,
  emergencyPack,
];

const results = allPacks.map(pack =>
  evaluator.evaluatePack(pack, context)
);

const triggeredPacks = results.filter(r => r.triggered);
```

## 集成到 ReadinessService

### 更新 ReadinessService

```typescript
// 在 ReadinessService 中添加能力包评估
async checkWithCapabilityPacks(
  destinationId: string,
  context: TripContext,
  options?: {
    enhanceWithGeo?: boolean;
    geoLat?: number;
    geoLng?: number;
  }
): Promise<ReadinessCheckResult> {
  // 1. 获取地理特征
  let enhancedContext = context;
  if (options?.enhanceWithGeo && options?.geoLat && options?.geoLng) {
    const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(
      options.geoLat,
      options.geoLng
    );
    enhancedContext = { ...context, geo: { ... } };
  }

  // 2. 评估能力包
  const allPacks = [
    highAltitudePack,
    sparseSupplyPack,
    seasonalRoadPack,
    permitCheckpointPack,
    emergencyPack,
  ];

  const capabilityPacks = allPacks
    .map(pack => this.capabilityEvaluator.evaluatePack(pack, enhancedContext))
    .filter(result => result.triggered)
    .map(result => {
      const pack = allPacks.find(p => p.type === result.packType)!;
      return this.capabilityEvaluator.convertToReadinessPack(
        pack,
        destinationId,
        enhancedContext.geo
      );
    });

  // 3. 合并传统 Pack 和能力包
  const traditionalPacks = await this.packStorage.findPacksByCountry(
    destinationId.split('-')[0]
  );

  const allPacksToCheck = [...traditionalPacks, ...capabilityPacks];

  // 4. 执行检查
  return this.readinessChecker.checkMultipleDestinations(
    allPacksToCheck,
    enhancedContext
  );
}
```

## 自定义能力包

### 创建自定义 Pack

```typescript
import { CapabilityPackConfig } from './types/capability-pack.types';

export const customPack: CapabilityPackConfig = {
  type: 'custom_type',
  displayName: 'Custom Pack',
  trigger: {
    all: [
      {
        geoPath: 'geo.custom.feature',
        operator: 'gte',
        value: 100,
      },
    ],
  },
  rules: [
    {
      id: 'rule.custom.example',
      category: 'safety_hazards',
      severity: 'high',
      when: {
        eq: { path: 'itinerary.season', value: 'winter' },
      },
      then: {
        level: 'must',
        message: 'Custom rule message',
        tasks: [
          {
            title: 'Custom task',
            dueOffsetDays: -7,
            tags: ['custom'],
          },
        ],
      },
    },
  ],
};
```

## 最佳实践

1. **优先使用能力包**: 如果场景可以用能力包覆盖，优先使用能力包而非目的地特定 Pack
2. **组合使用**: 能力包和传统 Pack 可以组合使用，互补覆盖
3. **数据驱动**: 确保地理特征数据准确，能力包才能正确触发
4. **定期更新**: 根据实际使用情况调整触发条件和规则

## 相关文档

- [挪威 Readiness 集成](./NORWAY_READINESS_INTEGRATION.md)
- [POI 数据集成总结](./POI_DATA_INTEGRATION_SUMMARY.md)
- [地理数据指南](../src/trips/readiness/GEO_DATA_GUIDE.md)

