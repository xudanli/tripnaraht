# DecisionModule 已启用服务诊断

## 当前状态

应用仍然阻塞，已延迟初始化 `GoogleRoutesService` 的 axios 实例，但问题仍然存在。

## 已启用的服务列表

在 `DecisionModule` 中已启用的服务（23 个）：

### 核心服务（必需）
1. **TripDecisionEngineService** - 必需：`DecisionController` 需要
2. **SenseToolsAdapter** - 必需：`TripDecisionEngineService` 需要

### DEM 服务
3. **DemDecisionEvidencePipelineService** - 必需：`TripNaraCoreToolService` 需要

### 策略服务
4. **StrategyOrchestratorService** - 必需：`TripNaraCoreToolService` 需要
5. **AbuStrategy** - 必需：`StrategyOrchestratorService` 需要
6. **DrDreStrategy** - 必需：`StrategyOrchestratorService` 需要
7. **NeptuneStrategy** - 必需：`StrategyOrchestratorService` 需要

### 支持服务（策略依赖）
8. **SpatialReplacementService** - 必需：`NeptuneStrategy` 需要
9. **SpatialIssueDetectorService** - 必需：`NeptuneStrategy` 需要
10. **FatigueCalculatorService** - 必需：`DrDreStrategy` 需要

### 工具服务
11. **TripNaraCoreToolService** - 构造函数：仅依赖注入（`StrategyOrchestratorService`, `RouteDirectionsService?`, `DemDecisionEvidencePipelineService?`）
12. **GraphDataConverterService** - 需要检查构造函数

### 统计和反馈服务
13. **DecisionStatsService** - 需要检查构造函数
14. **HeuristicDietService** - 需要检查构造函数
15. **TripFeedbackService** - 需要检查构造函数

### 存储服务
16. **DecisionLogStorageService** - 构造函数：`constructor(private readonly prisma: PrismaService) {}`（简单，不应阻塞）
17. **E2ECaseStorageService** - 需要检查构造函数
18. **E2EReplayService** - 需要检查构造函数
19. **DecisionLogClusteringService** - 需要检查构造函数

### Agent 服务
20. **ReadinessAgentService** - 需要检查构造函数

### 审批服务
21. **ApprovalService** - 需要检查构造函数
22. **AgentResumeService** - 构造函数：仅依赖注入（`PrismaService?`, `ApprovalService?`），都是 `@Optional()`

### 调度器
23. **ApprovalCleanupScheduler** - 构造函数：仅依赖注入（`ApprovalService`），`onModuleInit` 已被注释掉（不会阻塞）

## 已检查的服务

- ✅ `DecisionLogStorageService` - 构造函数简单，不应阻塞
- ✅ `TripNaraCoreToolService` - 构造函数简单，不应阻塞
- ✅ `ApprovalCleanupScheduler` - `onModuleInit` 已禁用，不应阻塞
- ✅ `AgentResumeService` - 构造函数简单，所有依赖都是 `@Optional()`，不应阻塞
- ✅ `GoogleRoutesService` - 已延迟初始化 axios 实例，不应阻塞构造函数

## 下一步建议

由于问题仍然存在，建议继续使用二分法缩小问题范围：

### 选项 1：继续二分法（推荐）

暂时禁用一半的已启用服务，测试是否阻塞：

**建议暂时禁用的服务（前半部分）：**
- `DemDecisionEvidencePipelineService` → 会导致 `TripNaraCoreToolService` 无法注入
- `StrategyOrchestratorService` → 会导致 `TripNaraCoreToolService` 无法注入
- `AbuStrategy`, `DrDreStrategy`, `NeptuneStrategy` → 会导致 `StrategyOrchestratorService` 无法注入
- `SpatialReplacementService`, `SpatialIssueDetectorService`, `FatigueCalculatorService` → 会导致策略服务无法注入

由于依赖关系复杂，建议暂时禁用**后半部分**的非必需服务：

```typescript
// 暂时禁用后半部分服务
DecisionStatsService,
HeuristicDietService,
TripFeedbackService,
// DecisionLogStorageService, // 暂时禁用
// E2ECaseStorageService, // 暂时禁用
// E2EReplayService, // 暂时禁用
// DecisionLogClusteringService, // 暂时禁用
TripNaraCoreToolService,
// GraphDataConverterService, // 暂时禁用
ReadinessAgentService,
ApprovalService,
AgentResumeService,
ApprovalCleanupScheduler,
```

### 选项 2：检查启动日志

如果可能，查看启动日志，找出最后一个成功初始化的服务。

### 选项 3：检查 GraphDataConverterService

`GraphDataConverterService` 可能不存在或有问题，检查其构造函数。
