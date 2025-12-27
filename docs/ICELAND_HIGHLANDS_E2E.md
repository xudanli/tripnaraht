# 冰岛高地 F-Road Expedition - E2E 测试文档

## 概述

这是 TripNARA 决策引擎的完整端到端测试，验证从用户输入到最终行程生成的完整链路。

**测试文件：** `src/trips/e2e/iceland-highlands.e2e.spec.ts`

**RouteDirection Fixture：** `src/route-directions/fixtures/is_highlands_froad.fixture.ts`

## 完整决策链路

```
用户输入 
  ↓
选 RouteDirection（冰岛高地 F 路）
  ↓
生成候选 POI 
  ↓
DEM 校验
  ↓
Abu 硬约束判决 
  ↓
Dr.Dre 节奏修复
  ↓
Neptune 空间替换（如有封路/POI关闭）
  ↓
最终行程 + DecisionLog
```

## 三个测试场景

### 场景 1: 理想夏季高地穿越（正常通过）✅

**设定：**
- 用户：偏"徒步 + 摄影 + 原野"，风险中等
- 时间：8 月（高地最适季节）
- DEM 数据：单日爬升 & 3 日滚动爬升都在阈值内
- 路网/POI：无封路，无危区

**验证点：**
- ✅ Abu 必须 ALLOW 且没有 REJECT 记录
- ✅ Dr.Dre 可以是 ALLOW 或轻微 ADJUST
- ✅ Neptune 在无 issue 时应保持 ALLOW
- ✅ 整体节奏：天数不减少

**意义：**
证明正常条件下，三人格不会乱动，系统给出一条可靠、节奏合理、高地逻辑正确的路线。

### 场景 2: 5 月高地入口封闭 → 直接被否决❌

**设定：**
- 路线：同样是冰岛高地 F 路 RD
- 时间：5 月（高地仍未正式开放）
- entryRoad.status = SEASONAL 且 5 月不在开放窗口
- Abu 的硬约束：requiresSeasonOpen = true

**验证点：**
- ✅ Abu 必须拒绝
- ✅ result.plan = null
- ✅ DecisionLog 清晰说明"季节封路，不允许执行"

**意义：**
证明季节/合规可以推翻"看起来没问题的 DEM"，Abu 把关，有"说不"的能力。

**关键洞察：**
> "即便 DEM 看起来一切正常，只要合规/季节层面认为'不应该走'，这条路就是不存在的。"

### 场景 3: 局部 F 路封闭，有绕行 → Neptune 出手🔄

**设定：**
- 时间：8 月（高地季节 OK）
- 入口开放
- 中间某一段 F-road 因最近暴雨临时封闭 → SEGMENT_BLOCKED
- 在走廊缓冲区内，有一条替代 gravel road 可以绕过去

**验证点：**
- ✅ Neptune 检测到问题并执行替换
- ✅ 替换后的计划中，不应再包含 BLOCKED segment
- ✅ RouteDirection 不变

**意义：**
证明 Neptune 真正具有"空间修复"能力，而不是简单的重新算整个行程；它能在不背叛 RouteDirection 的前提下，为现实世界的问题打补丁。

## 技术实现

### RouteDirection Fixture

```typescript
export const IS_HIGHLANDS_F_ROAD_EXPEDITION: RouteDirectionData = {
  name: 'ICELAND_HIGHLANDS_F_ROAD_EXPEDITION',
  nameCN: '冰岛高地 F 路穿越',
  countryCode: 'IS',
  seasonality: {
    bestMonths: [7, 8],
    avoidMonths: [11, 12, 1, 2, 3, 4, 5, 6], // 5月仍在封闭期
  },
  // ...
}
```

### 测试结构

每个场景都包含：
1. **WorldModelContext 构造**：包含 DEM、Weather、Compliance 证据
2. **RoutePlanDraft 构造**：初始计划草案
3. **Mock Services 设置**：SpatialIssueDetector、SpatialReplacement 等
4. **执行决策引擎**：调用 `StrategyOrchestratorService.run()`
5. **断言验证**：检查结果、日志、计划变更

## 运行测试

```bash
# 运行所有 E2E 测试
npm test -- iceland-highlands.e2e.spec.ts

# 运行特定场景
npm test -- iceland-highlands.e2e.spec.ts -t "场景 1"
```

## 测试结果

```
✅ 场景 1: 理想夏季高地穿越（正常通过）
✅ 场景 2: 5 月高地入口封闭 → 直接被否决
✅ 场景 3: 局部 F 路封闭，有绕行 → Neptune 出手

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

## 关键价值

这三个 E2E 场景完整验证了 TripNARA 决策引擎的核心能力：

1. **正常流程的稳定性**：系统不会在正常条件下过度干预
2. **硬约束的权威性**：季节/合规可以否决"看起来可行"的计划
3. **空间修复的智能性**：Neptune 能在保持路线哲学的前提下修复现实问题

## 相关文档

- [Strategy Contract System](./STRATEGY_CONTRACT_SYSTEM.md)
- [Neptune Spatial Replacement](./NEPTUNE_SPATIAL_REPLACEMENT.md)
- [Decision Log System](./DECISION_LOG_SYSTEM.md)

