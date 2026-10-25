# RouteDirection（路线方向）说明

## 什么是 RouteDirection？

**RouteDirection（路线方向）** 是世界模型（WorldModelContext）的核心组成部分之一，采用**三段式架构**：

1. **PhysicalRealityModel（物理现实模型）**：地形、路网、天气、危险区域等
2. **HumanCapabilityModel（人体能力模型）**：爬升能力、坡度限制、适应度等
3. **RouteDirection（路线方向）**：路线哲学、不可背叛的规则、核心体验

### RouteDirection 的作用

RouteDirection 定义了**路线的哲学和约束**，用于：

- **约束AI决策系统**：确保生成的行程不违反路线的基本哲学
- **定义核心体验**：明确必须涵盖的体验类型（mustVisitTags）
- **设置不可协商的规则**：定义红线，AI不能打破（nonNegotiableRules）
- **提供灵活调整空间**：指定可以灵活调整的部分（flexibleParts）

### RouteDirection 的数据结构

```typescript
model RouteDirection {
  id                Int                       @id
  uuid              String                    // 唯一标识
  countryCode       String                    // 国家代码（如 'IS'）
  name              String                    // 名称
  nameCN            String                    // 中文名称
  nameEN            String?                   // 英文名称
  description       String?                  // 描述
  tags              String[]                  // 标签（如 'self-drive', 'easy', 'low'）
  corridorGeom      Unsupported("geography")? // 路线走廊几何（PostGIS）
  regions           String[]                  // 覆盖区域
  entryHubs         String[]                 // 入口枢纽
  seasonality       Json?                    // 季节性信息
  constraints       Json?                    // 约束条件
  riskProfile       Json?                    // 风险画像
  signaturePois     Json?                    // 标志性POI
  itinerarySkeleton Json?                    // 行程骨架
  metadata          Json?                    // 元数据（包含philosophy）
  isActive          Boolean                  // 是否激活
  status            String?                  // 状态（'active', 'deprecated'等）
  version           String?                  // 版本
  rolloutPercent    Int?                     // 灰度发布百分比
  audienceFilter    Json?                    // 受众过滤
}
```

### RouteDirection 与 RoutePhilosophy 的关系

RouteDirection 的 `metadata` 字段可以包含 `philosophy`（路线哲学），定义：

- **coreStatement**：核心陈述（一句话描述路线的本质）
- **mustVisitTags**：必须涵盖的体验类型
- **nonNegotiableRules**：不可协商的规则
- **flexibleParts**：可灵活调整的部分
- **durationFlexibility**：天数弹性区间

#### Philosophy 字段的作用 ⭐

**位置**: `metadata.philosophy`

**作用**: Philosophy字段是AI决策系统的核心约束机制，确保生成的行程不违反路线的本质。

**在决策系统中的使用**:

1. **Neptune策略验证**:
   - 在空间修复（REPLACE操作）前，验证替换操作是否违反路线哲学
   - 使用`validateReplacementAgainstPhilosophy()`函数检查
   - 如果违反`mustVisitTags`或`nonNegotiableRules`，拒绝替换

2. **核心体验保护**:
   - 使用`checkCoreExperienceCoverage()`函数检查行程是否仍然覆盖核心体验
   - 如果缺失`mustVisitTags`中的体验，要求补充

3. **灵活调整指导**:
   - 在`flexibleParts`范围内允许优化和调整
   - 超出`flexibleParts`范围的调整需要额外验证

**示例（内陆高地F路）**:
```typescript
{
  coreStatement: '从文明进入高地，再回到人间',
  mustVisitTags: ['高地荒原', '温泉', '火山'],
  nonNegotiableRules: [
    '必须有一晚住高地 hut 或营地',
    '必须经过至少一个 F-road 路段',
    '必须从 Ring Road 进入高地，再回到 Ring Road',
    '必须使用四驱SUV（法律要求）'
  ],
  flexibleParts: [
    '具体 F-road 选择（F26 / F35 / F208 / F225 / F910）',
    '中间停留点（POI 可替换）',
    '天数（5-7 天范围内）'
  ]
}
```

**决策影响**:
- ✅ **必须体验保护**: 不允许删除`mustVisitTags`对应的体验
- ✅ **红线保护**: 不允许违反`nonNegotiableRules`
- ✅ **灵活优化**: 可以在`flexibleParts`范围内调整

## 冰岛的 RouteDirection

冰岛目前有 **6条** RouteDirection，全部为 `active` 状态：

### 1. 黄金圈经典环线
- **UUID**: `9a9f559e-307d-4c6b-b142-1b096d33bd42`
- **ID**: 25
- **标签**: `self-drive`, `easy`, `low`
- **区域**: `Reykjavik`
- **创建时间**: 2026-01-23
- **特点**: 适合自驾，难度低，风险低

### 2. 环岛公路南线精华
- **UUID**: `95df0508-8e0d-4a90-8739-558c06032dbb`
- **ID**: 26
- **标签**: `self-drive`, `easy-moderate`, `low-medium`
- **区域**: `Reykjavik`
- **创建时间**: 2026-01-23
- **特点**: 适合自驾，难度中等，风险中低

### 3. 斯奈山半岛环线
- **UUID**: `e8dd8d4f-cee2-46d4-9a30-329ac3a6b426`
- **ID**: 27
- **标签**: `self-drive`, `easy`, `low-medium`
- **区域**: `Reykjavik`
- **创建时间**: 2026-01-23
- **特点**: 适合自驾，难度低，风险中低

### 4. 冰岛环岛公路完整版
- **UUID**: `866db18a-7dac-453b-96e7-00b04df4a7d0`
- **ID**: 29
- **标签**: `paved`, `moderate`, `low`
- **区域**: `Reykjavík`
- **创建时间**: 2026-01-23
- **特点**: 铺装路面，难度中等，风险低

### 5. 内陆高地F路
- **UUID**: `8afd4b2e-7dd1-4837-8169-d3efed748138`
- **ID**: 28
- **标签**: `F路（砂石路、河流穿越、极端地形）`, `extreme`, `high`
- **区域**: `Reykjavík`
- **创建时间**: 2026-01-23
- **特点**: F路（砂石路、河流穿越、极端地形），难度极高，风险高

### 6. 西峡湾环线
- **UUID**: `cf4283ff-4a88-4824-a306-66d4b2af979c`
- **ID**: 30
- **标签**: `部分柏油路 + 大量砂石路`, `challenging`, `low`
- **区域**: `Reykjavík`
- **创建时间**: 2026-01-23
- **特点**: 部分柏油路 + 大量砂石路，挑战性高，风险低

## RouteDirection 的使用场景

1. **行程生成**：AI根据RouteDirection的哲学和约束生成符合要求的行程
2. **决策约束**：Neptune等决策策略使用RouteDirection确保不违反核心规则
3. **路线匹配**：根据用户偏好和国家代码匹配最合适的RouteDirection
4. **世界模型构建**：作为WorldModelContext的一部分，提供路线哲学信息

## 相关文件

- **数据库模型**: `prisma/schema.prisma` (RouteDirection model)
- **服务层**: `src/route-directions/route-directions.service.ts`
- **类型定义**: `src/trips/decision/shared/world-model.types.ts`
- **哲学模型**: `src/trips/decision/models/route-philosophy.model.ts`
- **世界模型构建**: `src/skills/world/world-build-context.skill.ts`

## 注意事项

- RouteDirection的`uuid`字段**不是**`@unique`，查询时需要使用`findFirst`而不是`findUnique`
- 部分RouteDirection可能没有`corridorGeom`（路线走廊几何），这会影响DEM证据的生成
- RouteDirection的`metadata`字段可能包含`philosophy`信息，用于约束AI决策
