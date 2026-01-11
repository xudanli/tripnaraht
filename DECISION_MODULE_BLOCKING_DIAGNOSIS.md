# DecisionModule 阻塞诊断总结

## 当前状态

**已验证的事实：**
- ✅ 禁用 `TripsModule` 后应用可以启动
- ❌ 恢复 `TripsModule` 后应用阻塞（在 RouteDirectionsModule 之后）
- `TripsModule` 通过 `forwardRef` 导入 `DecisionModule`

**已测试的模块：**
1. ✅ `DemModule` - 不是问题（禁用后仍然阻塞）
2. ✅ `TransportModule` - 必需（禁用后出现依赖错误：`SenseToolsAdapter` 需要 `SmartRoutesService`）
3. ❌ `PlacesModuleOrLite` - 恢复后仍然阻塞

**当前 DecisionModule 的导入：**
- `TransportModule` - 必需
- `DemModule` - 不是问题
- `PlacesModuleOrLite` - 恢复，但可能有问题

**已禁用的模块：**
- `ReadinessModule` (app.module.ts) - 暂时禁用
- `RagModule` (app.module.ts) - 暂时禁用
- `MemoryModule` (DecisionModule) - 暂时禁用
- `LlmModule` (DecisionModule) - 暂时禁用
- `SkillsModule` (DecisionModule) - 默认禁用

## 问题分析

### 可能的根本原因

1. **`PlacesModuleOrLite` 的问题**
   - `PlacesModuleOrLite` 在非 MCP 模式下会加载完整的 `PlacesModule`
   - `PlacesModule` 可能导入其他模块导致阻塞

2. **`TripsModule` 和 `DecisionModule` 之间的 `forwardRef` 交互**
   - 虽然使用了 `forwardRef`，但可能在初始化顺序上有问题

3. **`DecisionModule` 中某个服务的初始化阻塞**
   - 虽然有 `ApprovalCleanupScheduler` 使用 `OnModuleInit`，但代码看起来没问题
   - 可能其他服务有阻塞的构造函数或初始化逻辑

## 建议的下一步

1. **检查 `PlacesModule` 的依赖**
   - 查看 `PlacesModule` 导入了哪些模块
   - 检查是否有循环依赖

2. **暂时禁用 `PlacesModuleOrLite` 并检查依赖错误**
   - 如果有服务依赖 `PlacesModule` 的服务，需要将其设为可选

3. **检查 `TripsModule` 是否真的需要 `DecisionModule`**
   - 查看 `TripsService` 是否直接使用 `DecisionModule` 的服务
   - 如果不需要，可以考虑移除 `forwardRef` 导入

4. **检查应用日志**
   - 查看是否有特定模块或服务的初始化日志
   - 找出最后一个初始化的模块

## 当前代码状态

- `decision.module.ts`: 导入 `TransportModule`, `DemModule`, `PlacesModuleOrLite`
- `trips.module.ts`: 通过 `forwardRef` 导入 `DecisionModule`
- `app.module.ts`: `TripsModule` 已启用，`ReadinessModule` 和 `RagModule` 暂时禁用

## 备注

- 这是一个复杂的依赖诊断问题，需要逐步定位
- 建议使用二进制搜索方法，逐步禁用/恢复模块
- 考虑使用 NestJS 的调试工具来查看模块初始化顺序
