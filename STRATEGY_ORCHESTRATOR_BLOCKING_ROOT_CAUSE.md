# StrategyOrchestratorService 阻塞根因分析

## 重要发现

✅ **应用不再阻塞**（禁用 `StrategyOrchestratorService` 后）

这说明问题在 `StrategyOrchestratorService` 或其依赖链。

## StrategyOrchestratorService 的依赖链

### 直接依赖
1. **AbuStrategy** - 无依赖（只有 Logger）
2. **DrDreStrategy** - 依赖 `FatigueCalculatorService`（无依赖）
3. **NeptuneStrategy** - 依赖：
   - `SpatialReplacementService` → `PrismaService`
   - `SpatialIssueDetectorService`（所有依赖可选）
4. **DecisionLogStorageService** - 已启用（不是问题）
5. **ContextEngineerService** - 可选（`@Optional()`）
6. **SkillsRegistryService** - 可选（`@Optional()`）

### 依赖链分析

```
StrategyOrchestratorService
├── AbuStrategy (无依赖)
├── DrDreStrategy
│   └── FatigueCalculatorService (无依赖)
├── NeptuneStrategy
│   ├── SpatialReplacementService
│   │   └── PrismaService ⚠️ 可能的问题点
│   └── SpatialIssueDetectorService (所有依赖可选)
└── DecisionLogStorageService (已启用)
```

## 可能的问题点

### 1. PrismaService 初始化阻塞
- `SpatialReplacementService` 依赖 `PrismaService`
- 虽然 `PrismaService` 的 `onModuleInit` 有超时保护，但如果在构造函数中使用 `PrismaService`，可能会阻塞
- **检查结果**：`SpatialReplacementService` 的构造函数只是注入 `PrismaService`，没有在构造函数中使用它

### 2. 循环依赖导致的死锁
- 需要检查是否有循环依赖：
  - `StrategyOrchestratorService` → `AbuStrategy` / `DrDreStrategy` / `NeptuneStrategy`
  - 这些策略服务是否依赖 `StrategyOrchestratorService` 或其他形成循环的服务

### 3. 某个服务的构造函数中有阻塞逻辑
- 需要检查所有服务的构造函数是否有：
  - 同步阻塞操作（网络请求、文件读取、数据库查询）
  - 其他初始化逻辑

## 检查结果

### 策略服务
- ✅ `AbuStrategy`: 无构造函数（只有 Logger）
- ✅ `DrDreStrategy`: 构造函数只注入 `FatigueCalculatorService`
- ✅ `NeptuneStrategy`: 构造函数只注入 `SpatialReplacementService` 和 `SpatialIssueDetectorService`

### 依赖服务
- ✅ `FatigueCalculatorService`: 无构造函数（只有方法）
- ✅ `SpatialIssueDetectorService`: 构造函数所有依赖都是可选的
- ⚠️ `SpatialReplacementService`: 构造函数注入 `PrismaService`（但不在构造函数中使用）

### OnModuleInit
- ✅ 所有策略服务都没有 `OnModuleInit`
- ✅ 所有依赖服务都没有 `OnModuleInit`

## 下一步

由于禁用 `StrategyOrchestratorService` 后不再阻塞，需要：

1. **检查 PrismaService 的初始化**：虽然 `PrismaService` 的 `onModuleInit` 有超时保护，但如果在依赖注入阶段有阻塞，可能会影响 `SpatialReplacementService` 的创建

2. **检查循环依赖**：确认是否有循环依赖导致死锁

3. **延迟 StrategyOrchestratorService 的创建**：如果问题在初始化阶段，可以考虑使用懒加载

4. **逐个恢复策略服务**：测试是否可以逐个恢复策略服务，找到具体的阻塞点

## 建议的解决方案

### 选项 1：延迟 StrategyOrchestratorService 的创建
使用 `ModuleRef.get()` 在运行时获取 `StrategyOrchestratorService`，而不是在构造函数中注入。

### 选项 2：检查 PrismaService 的初始化
确保 `PrismaService` 的初始化不会阻塞依赖它的服务。

### 选项 3：逐个恢复策略服务
逐个恢复策略服务，找到具体的阻塞点。
