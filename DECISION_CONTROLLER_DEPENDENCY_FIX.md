# DecisionController 依赖错误修复

## 错误信息

```
UnknownDependenciesException [Error]: Nest can't resolve dependencies of the DecisionController (TripDecisionEngineService, ?). 
Please make sure that the argument StrategyOrchestratorService at index [1] is available in the DecisionModule context.
```

## 问题分析

1. **错误原因**：`DecisionController` 需要 `StrategyOrchestratorService`，但我们在 `DecisionModule` 中禁用了它（作为 `TripNaraCoreToolService` 依赖链的一部分）

2. **DecisionController 的依赖**：
   - `TripDecisionEngineService` - 已启用
   - `StrategyOrchestratorService` - 被禁用

3. **StrategyOrchestratorService 的依赖**：
   - `AbuStrategy` - ✅ 已恢复
   - `DrDreStrategy` - ✅ 已恢复
   - `NeptuneStrategy` - ✅ 已恢复
   - `DecisionLogStorageService` - ✅ 已启用
   - `ContextEngineerService` - ✅ 可选（`@Optional()`）
   - `SkillsRegistryService` - ✅ 可选（`@Optional()`）

## 解决方案

恢复了 `StrategyOrchestratorService`，因为：
1. `DecisionController` 需要它（在多个方法中使用）
2. 所有必需依赖都已可用（策略服务已恢复）

## 当前状态

### 已恢复的服务

1. **AbuStrategy** - `DecisionAbuCheckSkill` 和 `StrategyOrchestratorService` 需要
2. **DrDreStrategy** - `DecisionDrdrePaceSkill` 和 `StrategyOrchestratorService` 需要
3. **NeptuneStrategy** - `DecisionNeptuneRepairSkill` 和 `StrategyOrchestratorService` 需要
4. **SpatialReplacementService** - `NeptuneStrategy` 需要
5. **SpatialIssueDetectorService** - `NeptuneStrategy` 需要
6. **FatigueCalculatorService** - `DrDreStrategy` 需要
7. **StrategyOrchestratorService** - `DecisionController` 需要

### 仍然禁用的服务

1. **DemDecisionEvidencePipelineService** - `TripNaraCoreToolService` 需要（已禁用）
2. **TripNaraCoreToolService** - 已禁用

## 下一步

请测试应用是否：
- **不再出现依赖错误**：说明修复成功
- **仍然阻塞**：说明问题不在策略服务，继续二分法
- **出现其他依赖错误**：需要进一步处理
