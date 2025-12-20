# Travel Readiness Checker - 旅行准备度检查系统

## 概述

Travel Readiness Checker 是一个可扩展到全球的旅行准备度检查系统，能够针对不同目的地输出"必须做/强烈建议/可选"的准备清单、风险和证据引用。

## 核心设计

### 1. 架构分层

- **Facts Layer（事实层）**：`CountryProfile` 表中的国家事实数据（电源、紧急电话、支付、签证等）
- **Policy/Readiness Pack Layer（规则层）**：基于 Facts + 目的地/季节/活动，产出 must/should/optional
- **Decision Layer（决策层）**：Abu/Dr.Dre/Neptune 用规则层输出的约束与风险，做取舍/排期/修复

### 2. 6 大准备维度

1. **Entry & Transit（入境与过境）**：签证/免签/电子签、入境材料
2. **Safety & Hazards（安全与风险）**：野生动物/治安/极端天气/地形风险
3. **Health & Insurance（医疗与保险）**：医疗水平、必须覆盖的项目
4. **Gear & Packing（装备与穿搭）**：气候 + 活动 + 城市基础设施计算装备清单
5. **Activities & Bookings（活动与预订）**：需要提前订的项目、运营商合规要求
6. **Logistics（物流与后勤）**：到达方式、货币/网络/电源/通讯、预算区间

## 文件结构

```
src/trips/readiness/
├── types/
│   ├── readiness-pack.types.ts      # Readiness Pack 类型定义
│   ├── trip-context.types.ts        # 规则引擎运行时上下文
│   └── readiness-findings.types.ts  # 检查结果类型
├── engine/
│   ├── rule-engine.ts               # 规则判定引擎
│   └── readiness-checker.ts         # 准备度检查器
├── compilers/
│   ├── facts-to-readiness.compiler.ts    # Facts → Readiness 编译器
│   └── readiness-to-constraints.compiler.ts  # Readiness → Constraints 编译器
├── services/
│   └── readiness.service.ts         # 主服务
├── data/
│   └── svalbard-pack.example.ts     # 斯瓦尔巴示例 Pack
├── readiness.module.ts              # NestJS 模块
├── index.ts                         # 统一导出
└── README.md                        # 本文档
```

## 使用方法

### 1. 从国家事实检查准备度

```typescript
import { ReadinessService } from './readiness/services/readiness.service';

// 注入服务
constructor(private readonly readinessService: ReadinessService) {}

// 检查准备度
const context = {
  traveler: {
    nationality: 'CN',
    budgetLevel: 'medium',
    riskTolerance: 'medium',
  },
  trip: {
    startDate: '2026-01-15',
  },
  itinerary: {
    countries: ['SA'], // 沙特阿拉伯
    activities: ['sightseeing'],
  },
};

const result = await this.readinessService.checkFromCountryFacts(
  ['SA'],
  context
);

// 获取约束
const constraints = await this.readinessService.getConstraints(result);

// 获取任务列表
const tasks = await this.readinessService.getTasks(result);
```

### 2. 从 Readiness Pack 检查准备度

```typescript
import { svalbardPack } from './readiness/data/svalbard-pack.example';

const result = await this.readinessService.checkFromPacks(
  [svalbardPack],
  context
);
```

### 3. 混合检查（Pack + Facts）

```typescript
const result = await this.readinessService.check(
  [svalbardPack],  // Pack 文件
  ['NO', 'IS'],    // 国家代码（从 CountryProfile 读取）
  context
);
```

## 规则引擎

规则引擎支持以下条件操作符：

- `all`: 所有条件都必须满足
- `any`: 任一条件满足即可
- `not`: 条件取反
- `exists`: 检查路径是否存在
- `eq`: 等于
- `in`: 在列表中
- `containsAny`: 数组包含任一值

### 示例规则

```typescript
{
  id: 'rule.sval.safety.no-solo-wilderness',
  category: 'safety_hazards',
  severity: 'high',
  when: {
    containsAny: {
      path: 'itinerary.activities',
      values: ['hiking', 'camping', 'backcountry', 'wildlife'],
    },
  },
  then: {
    level: 'must',
    message: 'Avoid independent wilderness travel...',
    tasks: [
      {
        title: 'Book guided tours for wilderness activities',
        dueOffsetDays: -21,
        tags: ['booking', 'safety'],
      },
    ],
  },
}
```

## 与决策层集成

Readiness Checker 已集成到 `TripDecisionEngineService` 中。在生成计划时，会自动检查准备度：

```typescript
// 在 generatePlan 中自动调用
const readinessResult = await this.readinessService.checkFromCountryFacts(
  [state.context.destination],
  context
);
```

### 约束编译

Readiness Findings 会被编译成决策层可用的约束：

- **Blockers / Must** → Hard Constraints (error)
- **Should** → Soft Constraints (warning)
- **Optional** → Soft Constraints (info)

这些约束会被传递给 `ConstraintChecker` 和决策策略（Abu/Dr.Dre/Neptune）。

## 扩展新目的地

### 1. 创建 Readiness Pack

参考 `data/svalbard-pack.example.ts`，创建新的 Pack 文件：

```typescript
export const icelandPack: ReadinessPack = {
  packId: 'pack.is.iceland',
  destinationId: 'IS-ICELAND',
  displayName: 'Iceland Travel Readiness',
  version: '1.0.0',
  lastReviewedAt: '2025-12-20T00:00:00Z',
  geo: {
    countryCode: 'IS',
    region: 'Iceland',
    city: 'Reykjavik',
  },
  supportedSeasons: ['winter', 'summer', 'shoulder'],
  rules: [
    // ... 规则定义
  ],
  checklists: [
    // ... 清单定义
  ],
  hazards: [
    // ... 风险定义
  ],
};
```

### 2. 使用 Pack

```typescript
import { icelandPack } from './data/iceland-pack';

const result = await this.readinessService.checkFromPacks(
  [icelandPack],
  context
);
```

## 数据模型

### Readiness Pack Schema

参考 `types/readiness-pack.types.ts` 中的完整类型定义。核心结构：

- `packId`: Pack 唯一标识
- `destinationId`: 目的地标识
- `version`: 版本号（语义化版本）
- `rules`: 规则数组
- `checklists`: 清单数组
- `hazards`: 风险数组

### Trip Context

规则引擎运行时需要的上下文：

```typescript
interface TripContext {
  traveler: {
    nationality?: string;
    residencyCountry?: string;
    tags?: string[];
    budgetLevel?: 'low' | 'medium' | 'high';
    riskTolerance?: 'low' | 'medium' | 'high';
  };
  trip: {
    startDate?: string;
    endDate?: string;
  };
  itinerary: {
    countries: string[];
    transitCountries?: string[];
    activities?: string[];
    season?: string;
  };
}
```

## 未来扩展

1. **规则包版本化**：支持规则包的版本管理和更新
2. **实时数据源**：接入签证/安全提示/交通中断的实时数据
3. **时间规划**：引入签证办理周期、疫苗窗口、旺季订票节点
4. **装备可租借建议**：本地化装备租借/购买建议
5. **多国籍支持**：扩展 VisaPolicy 表支持多国家组合

## 相关文档

- [决策层 README](../decision/README.md)
- [用户故事](../../../docs/用户故事.md)

