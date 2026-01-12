# StrategyOrchestratorService 阻塞问题解决方案

## 当前状态

✅ **应用不再阻塞**（禁用 `StrategyOrchestratorService` 后）

## 问题分析

- **问题定位**：`StrategyOrchestratorService` 或其依赖链导致阻塞
- **关键发现**：策略服务（AbuStrategy, DrDreStrategy, NeptuneStrategy）已经启用（SkillsModule 需要它们），但应用可以启动
- **结论**：问题不在策略服务本身，而在 `StrategyOrchestratorService` 的创建过程中

## StrategyOrchestratorService 的使用情况

### 所有使用都是可选的

1. **TripDecisionEngineService**: `@Optional() private readonly strategyOrchestrator?: StrategyOrchestratorService`
2. **DecisionRunThreeGuardiansSkill**: `@Optional() private readonly strategyOrchestrator?: StrategyOrchestratorService`
3. **DecisionController**: 已禁用

### 依赖链

```
StrategyOrchestratorService
├── AbuStrategy (无依赖，已启用)
├── DrDreStrategy (依赖 FatigueCalculatorService，已启用)
├── NeptuneStrategy (依赖 SpatialReplacementService, SpatialIssueDetectorService，已启用)
├── DecisionLogStorageService (已启用)
├── ContextEngineerService (可选，@Optional())
└── SkillsRegistryService (可选，@Optional())
```

## 可能的问题

1. **循环依赖导致的死锁**
   - `DecisionModule` <-> `ContextEngineModule`（如果启用）
   - `DecisionModule` <-> `SkillsModule`（如果启用，使用 forwardRef）

2. **PrismaService 初始化阻塞**
   - `SpatialReplacementService` 依赖 `PrismaService`
   - 虽然 `PrismaService` 的 `onModuleInit` 有超时保护，但可能在依赖注入阶段阻塞

3. **可选依赖的初始化阻塞**
   - `ContextEngineerService` 或 `SkillsRegistryService` 的初始化阻塞

## 解决方案

### 方案 1：保持禁用（推荐）

由于 `StrategyOrchestratorService` 的所有使用都是可选的，可以暂时保持禁用，不影响应用启动。

**优点**：
- 应用可以正常启动
- 不影响核心功能（策略服务仍然可用）

**缺点**：
- `TripDecisionEngineService` 无法使用 `StrategyOrchestratorService`
- `DecisionRunThreeGuardiansSkill` 无法使用 `StrategyOrchestratorService`

### 方案 2：使用懒加载

将 `StrategyOrchestratorService` 的创建延迟到运行时，使用 `ModuleRef.get()` 获取。

**实现**：
- 在需要使用 `StrategyOrchestratorService` 的地方，使用 `ModuleRef.get()` 懒加载
- 避免在构造函数中注入 `StrategyOrchestratorService`

### 方案 3：检查并修复循环依赖

检查是否有循环依赖导致死锁，并修复。

### 方案 4：逐个恢复策略服务

逐个恢复策略服务，找到具体的阻塞点（但这可能不是必要的，因为策略服务已经启用）。

## 当前配置

- `DecisionController`: 已禁用
- `StrategyOrchestratorService`: 已禁用
- 策略服务（AbuStrategy, DrDreStrategy, NeptuneStrategy）: 已启用（SkillsModule 需要）

## 建议

由于 `StrategyOrchestratorService` 的所有使用都是可选的，建议：
1. **暂时保持禁用**：应用可以正常启动，不影响核心功能
2. **如果以后需要**：使用懒加载方案，延迟 `StrategyOrchestratorService` 的创建

## 下一步

如果需要恢复 `StrategyOrchestratorService`：
1. 检查是否有循环依赖
2. 使用懒加载方案
3. 或者，逐个测试策略服务，确认是否有某个策略服务导致阻塞

 