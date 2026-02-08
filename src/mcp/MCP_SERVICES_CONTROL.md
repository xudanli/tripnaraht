# MCP 服务控制配置

本文档说明如何在测试环境中控制 MCP 服务的启用/禁用，特别是 Google 相关服务。

## 环境变量控制

### Google 服务控制

在测试环境中，如果无法连接 Google 相关服务，可以通过环境变量禁用：

```bash
# 禁用所有 Google 相关服务（在 MCP 模式下）
DISABLE_GOOGLE_SERVICES=true
```

**影响范围：**
- `GoogleMapsDirectModule` - Google Maps API 模块（路线规划、地理编码、附近搜索等）
- 当禁用时，`itinerary-items` 的附近 POI 搜索将跳过 Google Places API，只返回数据库中的结果

**注意：**
- 此设置仅影响 MCP 模式下的模块加载（`mcp-app.module.ts`）
- 主应用模式（`app.module.ts`）不受此设置影响
- 即使模块被加载，如果 API Key 未配置，服务也会自动标记为不可用

### 其他服务控制

#### 已支持的环境变量

```bash
# Decision Skills（决策技能）
ENABLE_DECISION_SKILLS=true

# Readiness Module（准备度模块）
ENABLE_READINESS_MODULE=true

# Places Module（地点模块）
ENABLE_PLACES_MODULE=true

# Context Engine Module（上下文引擎模块，默认启用）
ENABLE_CONTEXT_ENGINE_MODULE=false  # 设置为 false 禁用

# Trips Module（行程模块）
ENABLE_TRIPS_MODULE=true

# Route Directions Module（路线方向模块）
ENABLE_ROUTE_DIRECTIONS_MODULE=true

# Skills Module（技能模块）
ENABLE_SKILLS_MODULE=true

# Redis（Redis 缓存，MCP 模式下默认禁用）
DISABLE_REDIS=true

# Stripe MCP（Stripe 支付服务，默认启用）
ENABLE_STRIPE_MCP=false  # 设置为 false 禁用

# Rail MCP（铁路服务，默认启用）
ENABLE_RAIL_MCP=false  # 设置为 false 禁用
```

## 服务可用性检查

所有 MCP 服务都实现了 `isServiceAvailable()` 方法，用于检查服务是否可用：

```typescript
// 示例：检查 Google Maps 服务是否可用
if (googleMapsService?.isServiceAvailable()) {
  // 使用服务
}
```

**服务不可用的常见原因：**
1. API Key 未配置
2. 环境变量禁用了服务模块
3. 服务初始化失败
4. 网络连接问题

## 在代码中使用

### 依赖注入

服务使用 `@Optional()` 装饰器注入，即使模块未加载也不会报错：

```typescript
constructor(
  @Optional() private readonly googleMapsService?: GoogleMapsDirectService,
) {}
```

### 安全检查

在使用服务前，始终检查服务是否可用：

```typescript
if (this.googleMapsService?.isServiceAvailable()) {
  // 使用服务
} else {
  // 降级处理或跳过
}
```

## 测试环境配置示例

在测试环境的 `.env` 文件中：

```bash
# 禁用 Google 服务（测试环境无法连接 Google）
DISABLE_GOOGLE_SERVICES=true

# 禁用 Redis（如果测试环境没有 Redis）
DISABLE_REDIS=true

# 禁用其他不需要的服务
ENABLE_DECISION_SKILLS=false
ENABLE_READINESS_MODULE=false
ENABLE_TRIPS_MODULE=false
```

## 服务状态查询

可以通过 API 端点查询服务状态：

```bash
# Google Maps 服务状态
GET /api/google-maps/status

# 其他服务状态端点
GET /api/weather/status
GET /api/stripe/status
GET /api/restaurant/status
GET /api/hotel/status
GET /api/translation/status
GET /api/image/status
```

## 注意事项

1. **模块级禁用 vs 服务级禁用**
   - 模块级禁用（环境变量）：模块不会被加载，减少启动时间和内存占用
   - 服务级禁用（API Key 未配置）：模块被加载但服务不可用，代码会自动跳过

2. **性能影响**
   - 禁用不需要的模块可以加快应用启动速度
   - 在测试环境中禁用 Google 服务可以避免超时错误

3. **功能影响**
   - 禁用 Google Maps 服务后，附近 POI 搜索将只返回数据库中的结果
   - 加油站和休息点等类别可能无法搜索（如果数据库中不存在）

4. **向后兼容**
   - 所有服务都使用可选依赖注入，即使服务不可用也不会导致应用崩溃
   - 代码会自动降级处理，返回可用结果

## 相关文件

- `src/mcp/mcp-app.module.ts` - MCP 应用模块配置
- `src/app.module.ts` - 主应用模块配置
- `src/mcp/google-maps-direct.service.ts` - Google Maps 服务实现
- `src/itinerary-items/itinerary-items.service.ts` - 附近 POI 搜索实现
