# TransportModule 阻塞诊断

## 问题状态

应用仍然阻塞，延迟初始化 `GoogleRoutesService` 的 axios 实例没有解决问题。

## 依赖链分析

```
DecisionController
  -> TripDecisionEngineService
    -> SenseToolsAdapter
      -> SmartRoutesService (TransportModule)
        -> GoogleRoutesService (TransportModule) ✅ 已延迟初始化
        -> AmapRoutesService (TransportModule) ⚠️ 构造函数中创建 axios
        -> LocationDetectorService (TransportModule) ✅ 无构造函数
```

## 可能的原因

1. **AmapRoutesService 构造函数**：
   - 在构造函数中创建 `axios.create()`，虽然是同步的，但可能有其他问题

2. **TransportModule 的导入**：
   - 导入了 `PrismaModule`（Global 模块，不应该阻塞）
   - 条件导入 `RedisModule`（可能阻塞）

3. **依赖注入顺序**：
   - `SmartRoutesService` 需要同时注入 `GoogleRoutesService`, `AmapRoutesService`, `LocationDetectorService`
   - 如果其中任何一个阻塞，整个依赖注入链会阻塞

## 下一步建议

1. **检查 AmapRoutesService**：
   - 也延迟初始化 axios 实例（类似 GoogleRoutesService）

2. **检查 TransportModule 的 RedisModule 导入**：
   - 如果不在 MCP 模式下，`RedisModule` 的初始化可能阻塞

3. **检查 PrismaModule**：
   - 虽然 `PrismaService` 在构造函数中不阻塞，但可能有其他问题

4. **暂时禁用 TransportModule**：
   - 如果禁用 `TransportModule` 后应用能启动，说明问题确实在 `TransportModule`
   - 但这会导致 `SenseToolsAdapter` 无法注入 `SmartRoutesService`
