# GoogleRoutesService 延迟初始化修复

## 问题分析

应用启动阻塞，问题范围已缩小到：
- `TripDecisionEngineService`（必需：`DecisionController` 需要）
- `SenseToolsAdapter`（必需：`TripDecisionEngineService` 需要）
- `SmartRoutesService`（来自 `TransportModule`，必需：`SenseToolsAdapter` 需要）
- `GoogleRoutesService`（来自 `TransportModule`，必需：`SmartRoutesService` 需要）

## 可能的原因

1. **GoogleRoutesService 构造函数中的 HttpsProxyAgent 可能阻塞**：
   - `new HttpsProxyAgent<string>(proxyUrl)` 在某些环境下可能解析代理 URL（DNS 解析等），导致阻塞
   - 虽然在理论上 `HttpsProxyAgent` 的构造函数是同步的，但在某些环境下可能会有阻塞行为

2. **TransportModule 的其他服务**：
   - `TransportDecisionService`, `TransportRoutingService`, `RouteCacheService` 可能阻塞

3. **初始化顺序或循环依赖问题**

## 解决方案

将 `GoogleRoutesService` 的 `axios` 实例初始化从构造函数延迟到 `onModuleInit`：

### 修改内容

1. **实现 `OnModuleInit` 接口**：
   - 添加 `implements OnModuleInit`
   - 将 `axiosInstance` 从 `readonly` 改为可选（`?`）

2. **延迟初始化**：
   - 将 `axios.create()` 和 `HttpsProxyAgent` 的创建从构造函数移到 `onModuleInit`
   - 这样可以避免在构造函数中创建 `HttpsProxyAgent` 可能导致阻塞

3. **添加后备方法**：
   - 添加 `getAxiosInstance()` 方法，如果 `axiosInstance` 还未初始化，同步初始化（作为后备）

4. **更新使用**：
   - 将所有使用 `this.axiosInstance` 的地方改为使用 `this.getAxiosInstance()`

## 代码变更

```typescript
// 之前：在构造函数中初始化
constructor(@Optional() private configService?: ConfigService) {
  // ... baseURL 配置 ...
  const httpsAgent = proxyUrl
    ? new HttpsProxyAgent<string>(proxyUrl)
    : new https.Agent({...});
  this.axiosInstance = axios.create({...});
}

// 之后：延迟初始化
constructor(@Optional() private configService?: ConfigService) {
  // ... baseURL 配置 ...
  // ⚠️ 延迟初始化 axios 实例，避免在构造函数中创建 HttpsProxyAgent 可能导致阻塞
}

async onModuleInit() {
  if (this.axiosInstance) {
    return; // 已经初始化
  }
  // ... 创建 HttpsProxyAgent 和 axios 实例 ...
}

private getAxiosInstance(): AxiosInstance {
  if (!this.axiosInstance) {
    // 同步初始化（后备）
  }
  return this.axiosInstance;
}
```

## 预期效果

- **避免构造函数阻塞**：`HttpsProxyAgent` 的创建延迟到 `onModuleInit`，不会阻塞构造函数
- **保持功能不变**：通过 `getAxiosInstance()` 方法，功能保持不变
- **改善启动性能**：减少构造函数中的同步操作，改善启动性能

## 测试建议

1. 测试应用启动是否不再阻塞
2. 测试 `GoogleRoutesService.getRoutes()` 是否正常工作
3. 检查日志，确认 `axios` 实例在 `onModuleInit` 中正确初始化
