# Context Engine Module

## 概述

Context Engine Module 是 TripNARA 的"上下文编译器"核心模块。它实现了 **Write / Select / Compress / Isolate** 四大支柱，让 Planner/Abu/DrDre/Neptune/Narrator 永远在"干净、够用、可追溯"的 RAM 里工作。

## 架构

```
ContextEngineModule
├── services/
│   └── context-engineer.service.ts    # 核心服务
├── types/
│   ├── context-package.types.ts       # Context Package 类型定义
│   └── trip-state-projection.types.ts # State Schema 投影类型
└── utils/
    └── langgraph-context-integration.ts # LangGraph 集成工具
```

## 核心服务

### ContextEngineerService

**职责**：
- 构建 Context Package
- 投影状态为 Public/Private
- 写入回写（Write Back）

**依赖**：
- `PrismaService`：数据库访问
- `SkillsRegistryService`：获取其他 skills（通过 forwardRef 避免循环依赖）

**主要方法**：

1. **build(options: ContextPackageOptions): Promise<ContextPackage>**
   - 构建完整的 Context Package
   - 自动调用其他 skills（countryPack.getBlocks, plan.selectSlices 等）
   - 处理 Token 预算和压缩

2. **projectState(state: TripState | LangGraphState, config?: ProjectionConfig): Promise<StateProjection>**
   - 将全量 State 投影为 Public/Private 两部分
   - Public 部分可进 prompt，Private 部分只存状态

3. **writeBack(tripRunId, attemptNumber, scratchpad, decisionLogDelta, artifactsRefs): Promise<void>**
   - 写入 TripAttempt 的 scratchpad
   - 保存决策日志增量
   - 存储 artifacts 引用

## 内部方法

### buildWorldModelBlocks
从 Trip 构建世界模型摘要块

### buildCountryPackBlocks
调用 `countryPack.getBlocks` skill 获取国家包块

### buildPlanBlocks
调用 `plan.selectSlices` skill 获取计划片段

### buildDecisionLogBlocks
从数据库获取决策日志摘要

### buildConstraintBlocks
从 Trip 提取约束和用户画像

### compressBlocks
调用 `context.compress` skill 压缩块（如果超预算）

## 使用方式

### 在 LangGraph 节点中使用

```typescript
import { buildContextForNode, writeBackFromNode } from '../../agent/context-engine/utils/langgraph-context-integration';

async function myNode(state: LangGraphState, contextEngineer: ContextEngineerService) {
  // 1. 构建上下文（节点开始）
  const ctx = await buildContextForNode(state, contextEngineer, {
    agent: 'PLANNER',
    phase: 'planning',
    tokenBudget: 3600,
    requiredTopics: ['VISA', 'ROAD_RULES', 'SAFETY'],
  });
  
  // 2. 使用 Context Package 构建 prompt
  const prompt = buildPromptFromContextPackage(ctx.contextPackage);
  
  // 3. 执行节点逻辑
  // ... 
  
  // 4. 写入回写（节点结束）
  await writeBackFromNode(state, contextEngineer, {
    tripRunId: state.metadata?.tripRunId as string,
    attemptNumber: state.metadata?.attemptNumber as number || 1,
    scratchpad: {
      planOutline: '已完成的计划...',
      nextActions: ['decision.abuCheck', 'decision.drdrePace'],
    },
    decisionLogDelta: [...],
    artifactsRefs: {...},
  });
}
```

### 直接使用 ContextEngineerService

```typescript
const contextPackage = await contextEngineer.build({
  tripId: 'trip-123',
  phase: 'planning',
  agent: 'PLANNER',
  userQuery: '帮我规划冰岛7天行程',
  tokenBudget: 3600,
  requiredTopics: ['VISA', 'ROAD_RULES', 'SAFETY'],
});

const projection = await contextEngineer.projectState(tripState, {
  tokenBudget: 3600,
  decisionLogLimit: 5,
});
```

## 依赖关系

### 导入依赖
- `PrismaModule`：数据库访问
- `SkillsModule`（通过 forwardRef）：获取 SkillsRegistryService

### 被导入
- `SkillsModule`（通过 forwardRef）：ContextBuildSkill 需要 ContextEngineerService

## 注意事项

1. **循环依赖**：使用 `forwardRef` 避免 ContextEngineModule 和 SkillsModule 之间的循环依赖
2. **错误处理**：所有内部方法都使用 try-catch，失败时返回空数组，不影响主流程
3. **性能**：Context Package 构建可能涉及多个技能调用，建议使用缓存
4. **Token 预算**：默认 3600（60% of 6k），可根据需要调整

## 未来改进

1. **缓存机制**：缓存已构建的 Context Package（基于 tripId + phase + agent）
2. **异步优化**：并行调用多个 skills（countryPack.getBlocks + plan.selectSlices）
3. **智能压缩**：根据 phase 和 agent 动态调整压缩策略
4. **监控指标**：记录 Token 使用、压缩率、命中率等指标
