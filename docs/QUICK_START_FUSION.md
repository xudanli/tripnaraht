# TripNARA 融合架构快速开始指南

## 概述

本文档提供 TripNARA 融合 LangGraph、MoBagel 和图数据库的快速开始指南。

## 已创建的文件

### 1. 架构文档
- `docs/ARCHITECTURE_FUSION_LANGGRAPH_MOBAGEL.md` - 完整的架构融合指南
- `docs/IMPLEMENTATION_ROADMAP.md` - 详细的实施路线图

### 2. TripNARA Core Tool（LangGraph 集成）
- `src/trips/decision/tools/tripnara-core-tool.interface.ts` - 工具接口定义
- `src/trips/decision/tools/tripnara-core-tool.service.ts` - 工具服务实现（需要完善）

**用途**: 将 TripNARA 核心决策引擎封装成可以被 LangGraph 调用的工具

**使用示例**:
```typescript
import { TripNaraCoreToolService } from './tools/tripnara-core-tool.service';

// 在 LangGraph 中注册为 Tool
const tool = new TripNaraCoreToolService(orchestrator, ...);
const result = await tool.execute({
  countryCode: 'IS',
  month: 7,
  routeDirectionId: 'iceland-highlands',
  humanCapability: {
    maxDailyAscentM: 800,
    preferredPace: 'MEDIUM',
    riskTolerance: 'MEDIUM',
  },
});
```

### 3. MoBagel 预测模型接口
- `src/trips/decision/prediction/mobagel-forecast.interface.ts` - 预测接口定义
- `src/trips/decision/prediction/mobagel-forecast.service.ts` - 预测服务实现（占位实现）

**用途**: 作为"动态权重源"，将预测结果注入到 PhysicalRealityModel / ObjectiveWeights

**使用示例**:
```typescript
import { MoBagelForecastService } from './prediction/mobagel-forecast.service';

const forecastService = new MoBagelForecastService();

// 获取价格预测
const priceForecast = await forecastService.getPriceForecast('IS', 7, 'iceland-highlands');

// 获取风险预测
const riskForecast = await forecastService.getRouteRiskForecast('IS', 7, 'iceland-highlands');

// 将预测结果注入到 PhysicalRealityModel
physicalRealityModel.tags = [
  {
    type: 'RISK',
    value: {
      level: riskForecast.weatherRiskLevel,
      score: riskForecast.weatherRiskScore,
      probability: riskForecast.closureProbability,
    },
    source: 'MOBAGEL',
    confidence: riskForecast.confidence,
  },
];
```

### 4. 图数据库接口
- `src/trips/decision/graph-db/graph-db.interface.ts` - 图数据库接口定义

**用途**: 定义图数据结构，为未来迁移到 Neo4j 做准备

**设计思路**:
- 节点类型: Place, RouteDirection, RouteSegment, Country, Region
- 关系类型: CONNECTS_TO, BELONGS_TO, HAS_SEGMENT, IN_COUNTRY, IN_REGION, SUITABLE_FOR
- 支持图算法查询（Dijkstra、A* 等）

**Cypher 查询示例**:
```cypher
// 查询适合 Dr.Dre 节奏的替代路径
MATCH (start:Place {id: $startId})
MATCH (end:Place {id: $endId})
MATCH path = (start)-[:CONNECTS_TO*..5]-(end)
WHERE ALL(segment IN path.segments WHERE 
  segment.fatigueIndex < $maxFatigue AND
  segment.rollingAscent3Days < $maxRollingAscent
)
RETURN path
ORDER BY path.totalAscent ASC
LIMIT 10
```

### 5. LangGraph 编排器接口
- `src/trips/decision/orchestration/langgraph-orchestrator.interface.ts` - 编排器接口定义

**用途**: 定义 LangGraph 编排器的接口，用于多 Agent 协作

**Agent 类型**:
- `PLANNER` - 意图识别、任务拆解
- `NARRATOR` - 结果润色、故事层文案
- `COMPLIANCE` - 合规检查（RAG + 文档库）
- `LOCAL_INSIGHT` - 本地洞察（RAG 负责）
- `CORE_DECISION` - TripNARA Core Tool（封装调用）

## 下一步行动

### 立即开始（Priority 1）
1. **重构数据模型**：按图结构设计现有数据模型
   - 参考 `graph-db.interface.ts` 中的节点和关系定义
   - 在现有模型中添加图关系字段

2. **完善 TripNARA Core Tool**
   - 实现 `buildWorldModelContext` 方法
   - 实现 `buildInitialPlan` 方法
   - 添加单元测试

### E2E 稳定后（Priority 2）
1. **安装 LangGraph 依赖**
   ```bash
   npm install @langchain/langgraph @langchain/core
   ```

2. **创建 Planner Agent**
   - 实现意图识别逻辑
   - 实现参数提取逻辑

3. **创建 Narrator Agent**
   - 实现结果润色逻辑
   - 实现故事层文案生成

4. **创建 LangGraph 编排器**
   - 实现编排图结构
   - 实现状态管理
   - 实现分支控制

### 有真实数据后（Priority 3）
1. **接入 MoBagel 或自建模型**
   - 训练价格预测模型
   - 训练拥挤度预测模型
   - 训练风险预测模型

2. **集成到决策流程**
   - 在 `PhysicalRealityModel` 中添加预测标签字段
   - 修改 `AbuStrategy` 读取预测标签
   - 修改 `DrDreStrategy` 读取预测权重

## 核心原则回顾

### 坚硬内核 + 柔软外壳
- **Hard Core**: Abu, Dr.Dre, Neptune, DEM, RouteDirection（不能被任何框架稀释）
- **Soft Shell**: LangGraph（负责"听懂人话"、"拆解任务"、"安抚用户"）
- **External Radar**: MoBagel（作为"动态权重源"）

### 融合的黄金法则
- ✅ LangGraph 作为"调度员"而非"驾驶员"
- ✅ MoBagel 输出 Feature Flags / Meta Tags，不直接输出路线
- ✅ 保护 Hard Core 的确定性逻辑不变

## 参考文档

- [架构融合指南](./ARCHITECTURE_FUSION_LANGGRAPH_MOBAGEL.md)
- [实施路线图](./IMPLEMENTATION_ROADMAP.md)
- [第一性原理架构](./FIRST_PRINCIPLES_ARCHITECTURE.md)
- [策略契约系统](./STRATEGY_CONTRACT_SYSTEM.md)

