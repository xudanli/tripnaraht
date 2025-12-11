# 交通计算核心思路与实现策略

## 📋 核心思路总结

### 1. 数据输入：准确的地理和交通信息

| 数据来源 | 数据类型 | 作用 |
|---------|---------|------|
| 景点/POI 数据库 | 经纬度 (lng, lat) | 确定起点和终点的精确地理位置 |
| 交通网络数据 | 道路、公交线路、地铁线路 | 确定可用的交通路径 |
| 实时/历史交通 API | 实时路况、历史速度数据 | 计算实际旅行时间（避免使用纯理论速度） |
| 出行偏好 | 用户输入 (步行、自驾、公共交通) | 限制搜索空间，确定计算权重 |

### 2. 核心算法：路径搜索与时间估算

#### A. 路径搜索算法 (Pathfinding)

**Dijkstra's Algorithm**: 用于计算图中某一点到所有其他点的最短路径。适用于小型或中型网络。

**A* Algorithm**: 在 Dijkstra 算法的基础上加入了启发式函数（Heuristic Function），例如直线距离，使其在大型网络中搜索效率更高。

**权重 (Cost)**: 在交通网络中，边的权重不再是距离，而是估计旅行时间。

#### B. 旅行时间估算 (Travel Time Estimation)

**纯理论时间**: `T = D/S` (距离 / 理论速度)

**考虑路况的时间**:
- **自驾/打车**: 必须调用地图服务商的实时路况 API（如高德/百度地图 API），获取 API 返回的预估时间
- **公共交通**: `T_total = T_walking + T_waiting + T_in-vehicle + T_transfer`
- **步行/骑行**: 使用路网数据结合固定速度计算

### 3. 结果输出：整合与优化

#### A. 多模式整合 (Multi-modal Integration)

对于一次旅行，需要同时计算并比较多种交通方案（自驾、公交、步行）的时间和成本，并根据用户的偏好进行排序。

#### B. 行程优化 (Itinerary Optimization)

当用户选择了一组景点 (P₁, P₂, P₃, P₄)，App 需要解决旅行商问题 (Traveling Salesman Problem - TSP) 的变体。

**目标**: 找到访问所有景点并返回起点所需时间最短的顺序。

**方法**: 使用近似算法（如最近邻法或模拟退火）来快速找到一个接近最优的解。

---

## 🏗️ 当前项目实现状态

### ✅ 已实现的功能

1. **Google Routes API 集成** (`src/transport/services/google-routes.service.ts`)
   - ✅ 支持多种交通模式（TRANSIT, WALKING, DRIVING）
   - ✅ 解析 API 响应，提取时间、距离、换乘信息
   - ✅ 估算费用

2. **交通决策服务** (`src/transport/transport-decision.service.ts`)
   - ✅ 根据用户画像对交通选项进行智能排序
   - ✅ 考虑预算敏感度、时间敏感度、身体条件等因素

3. **路线优化服务** (`src/itinerary-optimization/services/route-optimizer.service.ts`)
   - ✅ 使用模拟退火算法解决 TSP 问题
   - ✅ 考虑距离惩罚、时间窗口、缓冲时间

4. **路线缓存服务** (`src/transport/services/route-cache.service.ts`)
   - ✅ 短距离步行时间计算（使用 PostGIS）
   - ⚠️ 路线缓存功能（已设计但未实现）

### ⚠️ 需要改进的地方

1. **交通时间估算过于简化**
   - 当前 `RouteOptimizerService.estimateTransportTime()` 只使用简单的距离/速度估算
   - 注释说"实际应该调用交通规划服务"，但未真正集成

2. **缺少实时路况支持**
   - 自驾/打车模式应该调用实时路况 API
   - 当前只有 Google Routes API，但需要配置 API Key

3. **公共交通时刻表缺失**
   - 无法准确计算等待时间和换乘时间
   - 需要集成公交/地铁时刻表数据

4. **路线缓存未实现**
   - `RouteCacheService` 中的缓存功能只是占位符
   - 需要创建 RouteCache 表并实现缓存逻辑

---

## 🚀 改进方案

### 方案 1: 完善 Google Routes API 集成（推荐）

**优势**: 
- Google Routes API 提供准确的实时路况
- 支持多种交通模式
- 包含换乘信息和时刻表

**实现步骤**:
1. 配置 Google Routes API Key
2. 在 `RouteOptimizerService` 中调用 `GoogleRoutesService`
3. 添加缓存机制，避免重复调用 API
4. 处理 API 失败时的降级策略

### 方案 2: 集成国内地图 API（高德/百度）

**优势**:
- 国内数据更准确
- 实时路况更及时
- 公共交通数据更完整

**实现步骤**:
1. 创建 `AmapRoutesService` 或 `BaiduRoutesService`
2. 实现与 `GoogleRoutesService` 相同的接口
3. 根据地区选择使用哪个 API

### 方案 3: 混合策略

**策略**:
- 短距离（< 1km）: 使用 PostGIS 计算步行时间
- 中距离（1-10km）: 调用地图 API 获取公共交通方案
- 长距离（> 10km）: 调用地图 API 获取自驾/打车方案
- TSP 优化: 使用缓存 + API 混合，减少 API 调用次数

---

## 📝 具体实现建议

### 1. 改进 RouteOptimizerService

```typescript
// 当前实现（简化版）
private estimateTransportTime(from, to): number {
  const distance = this.calculateDistance(from, to);
  return Math.round((distance / 1000 / 30) * 60);
}

// 改进实现（调用真实 API）
private async estimateTransportTime(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: 'walking' | 'transit' | 'driving' = 'transit'
): Promise<number> {
  // 1. 检查缓存
  const cached = await this.routeCacheService.getCachedRoute(from, to, mode);
  if (cached) return cached.durationMinutes;
  
  // 2. 调用 Google Routes API
  const options = await this.googleRoutesService.getRoutes(
    from.lat, from.lng,
    to.lat, to.lng,
    mode
  );
  
  // 3. 缓存结果
  if (options.length > 0) {
    await this.routeCacheService.saveCachedRoute(from, to, mode, options[0]);
    return options[0].durationMinutes;
  }
  
  // 4. 降级：使用简单估算
  return this.fallbackEstimate(from, to, mode);
}
```

### 2. 实现路线缓存

```sql
-- 创建 RouteCache 表
CREATE TABLE "RouteCache" (
  id SERIAL PRIMARY KEY,
  from_lat DOUBLE PRECISION NOT NULL,
  from_lng DOUBLE PRECISION NOT NULL,
  to_lat DOUBLE PRECISION NOT NULL,
  to_lng DOUBLE PRECISION NOT NULL,
  travel_mode VARCHAR(20) NOT NULL,
  route_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  UNIQUE(from_lat, from_lng, to_lat, to_lng, travel_mode)
);

CREATE INDEX "RouteCache_location_idx" ON "RouteCache" 
  USING GIST(ST_MakePoint(from_lng, from_lat));
```

### 3. 优化 TSP 算法中的 API 调用

在 TSP 优化过程中，需要计算 N×(N-1) 个点对之间的时间。如果每次都调用 API，成本会很高。

**优化策略**:
1. **批量预计算**: 在优化开始前，预先计算所有点对的时间
2. **缓存优先**: 优先使用缓存，只对未缓存的路段调用 API
3. **异步并行**: 并行调用多个 API 请求，减少总耗时
4. **智能降级**: API 失败时使用距离估算，保证算法能继续运行

---

## 💡 总结

**当前项目的优势**:
- ✅ 已有完整的交通规划模块架构
- ✅ 已集成 Google Routes API
- ✅ 已有 TSP 优化算法（模拟退火）
- ✅ 已有用户画像和决策系统

**需要改进的关键点**:
1. 🔧 将简化的时间估算替换为真实的 API 调用
2. 🔧 实现路线缓存，减少 API 调用成本
3. 🔧 添加降级策略，保证系统稳定性
4. 🔧 优化 TSP 算法中的批量 API 调用

**推荐实施顺序**:
1. 先实现路线缓存（降低 API 成本）
2. 在 RouteOptimizerService 中集成 GoogleRoutesService
3. 优化 TSP 算法，使用批量预计算
4. 添加国内地图 API 支持（可选）
