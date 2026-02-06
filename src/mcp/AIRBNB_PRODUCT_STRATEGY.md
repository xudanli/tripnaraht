# Airbnb 作为 TripNara 住宿工具的产品策略

## 📋 文档说明

本文档从**产品经理**和**首席AI科学家**的角度，分析 Airbnb 在 TripNara 中的定位和使用范围。

**作者**: 产品经理 + 首席AI科学家  
**日期**: 2026-02-06  
**状态**: 策略文档

---

## 🎯 TripNara 核心定位回顾

### TripNara 是什么
> **"我们不是在规划旅行，而是在替用户判断：在这个世界的这个角落，他该不该这样走。"**

- ✅ **世界级路线认知 Agent**
- ✅ **地理 × 体力 × 风险的联合决策系统**
- ✅ **会替用户承担"判断责任"的决策引擎**

### TripNara 的核心能力
1. **三人格决策系统**（Abu/Dr.Dre/Neptune）
2. **RouteDirection 系统**（路线人格母本）
3. **DEM 决策证据**（地形、海拔、疲劳分析）
4. **天气决策证据**（风速、能见度、降水）
5. **世界模型构建**（物理现实、人类能力、路线方向）
6. **决策日志系统**（责任账本）

---

## 🏠 Airbnb 能力分析

### Airbnb MCP 提供的工具
1. ✅ **airbnb_search** - 搜索房源
2. ✅ **airbnb_listing_details** - 获取房源详情（包含照片）

### Airbnb 数据特点
- ✅ **实时可用性**: 基于实际日期和人数搜索
- ✅ **地理位置**: 精确的坐标信息
- ✅ **价格信息**: 实时价格和费用
- ✅ **房源详情**: 房间数、床数、设施、评价
- ✅ **照片信息**: 房源照片（已集成在详情中）

---

## 💡 产品策略：Airbnb 在 TripNara 中的定位

### 核心原则

#### 1. **住宿是路线的支撑，不是路线的决定因素**
- ❌ **不是**住宿推荐系统
- ❌ **不是**住宿预订平台
- ✅ **是**路线决策的**约束条件**和**支撑信息**
- ✅ **是**在路线确定后，为路线提供**可执行的住宿方案**

#### 2. **路线先于住宿**
- TripNara 的核心是**路线决策**（RouteDirection）
- 住宿应该**服从路线**，而不是决定路线
- 住宿位置必须在**路线走廊内**或**路线关键节点附近**

#### 3. **住宿是空间约束的一部分**
- 住宿位置影响**每日移动距离**
- 住宿位置影响**路线节奏**（Dr.Dre 的职责）
- 住宿可用性影响**路线可行性**（Abu 的职责）

---

## 🎯 应该框定的内容（推荐使用）

### ✅ **P0 - 核心场景（必须启用）**

#### 1. **路线走廊内的住宿搜索** ⭐⭐⭐
**场景**: 在路线确定后，搜索路线走廊内或关键节点附近的住宿

**使用工具**: `airbnb_search` + `airbnb_listing_details`

**具体用例**:
- ✅ **路线节点住宿**: 在路线关键节点（起点、终点、中转点）搜索住宿
- ✅ **走廊内住宿**: 在路线走廊缓冲区内搜索住宿，确保住宿位置不偏离路线
- ✅ **多日路线住宿**: 为多日路线搜索每日住宿，确保住宿位置符合路线节奏

**集成点**:
- **Neptune（空间修复）**: 当路线节点附近没有可用住宿时，搜索替代住宿位置
- **Dr.Dre（节奏调整）**: 根据住宿位置调整路线节奏，确保每日移动距离合理
- **Itinerary Planning**: 在生成行程时，为每日路线搜索合适的住宿

**示例**:
```typescript
// 在路线节点搜索住宿
const accommodation = await airbnbService.search({
  location: routeNode.coordinates, // 路线节点坐标
  checkin: day1Date,
  checkout: day2Date,
  adults: partySize,
});

// 验证住宿位置是否在路线走廊内
if (isWithinCorridor(accommodation.location, routeDirection.corridorGeom)) {
  // 使用该住宿
} else {
  // 搜索替代位置或调整路线
}
```

**约束**:
- ⚠️ 住宿位置必须在路线走廊内或关键节点附近（±5km）
- ⚠️ 住宿日期必须符合路线时间窗口
- ⚠️ 住宿容量必须满足团队人数

---

#### 2. **住宿可用性验证** ⭐⭐⭐
**场景**: 在路线决策前，验证关键节点的住宿可用性

**使用工具**: `airbnb_search`

**具体用例**:
- ✅ **路线可行性检查**: 验证路线关键节点的住宿是否可用
- ✅ **旺季住宿检查**: 在旅游旺季，提前检查住宿可用性和价格
- ✅ **特殊需求检查**: 检查是否有符合特殊需求（宠物、无障碍设施等）的住宿

**集成点**:
- **Abu（安全检查）**: 如果关键节点没有可用住宿，可能 REJECT 路线
- **World Model 构建**: 在构建世界模型时，补充住宿可用性信息
- **RouteDirection 验证**: 验证 RouteDirection 的可行性时，检查住宿可用性

**示例**:
```typescript
// 在 Abu 安全检查时
const accommodationAvailable = await airbnbService.search({
  location: criticalNode.coordinates,
  checkin: tripStartDate,
  checkout: tripEndDate,
  adults: partySize,
});

if (accommodationAvailable.results.length === 0) {
  // 关键节点没有可用住宿，可能需要 REJECT 或调整路线
  return {
    allowed: false,
    reason: '关键节点没有可用住宿',
  };
}
```

**约束**:
- ⚠️ 仅用于**关键节点**（起点、终点、必须过夜点）
- ⚠️ 不用于所有节点（避免过度调用 API）
- ⚠️ 如果住宿不可用，应该提供替代方案（调整路线或日期）

---

#### 3. **住宿位置对路线节奏的影响** ⭐⭐
**场景**: 根据住宿位置调整路线节奏，确保每日移动距离合理

**使用工具**: `airbnb_search` + `airbnb_listing_details`

**具体用例**:
- ✅ **节奏优化**: 根据住宿位置优化每日移动距离
- ✅ **中转点选择**: 选择合适的中转点住宿，平衡每日移动距离
- ✅ **住宿切换**: 如果住宿位置不合理，建议调整住宿位置或路线

**集成点**:
- **Dr.Dre（节奏调整）**: 根据住宿位置调整路线节奏
- **Itinerary Planning**: 在生成行程时，考虑住宿位置对路线的影响

**示例**:
```typescript
// 在 Dr.Dre 节奏调整时
const accommodation = await airbnbService.search({
  location: dayEndPoint.coordinates,
  checkin: dayDate,
  checkout: nextDayDate,
  adults: partySize,
});

const distanceToAccommodation = calculateDistance(
  dayEndPoint,
  accommodation.results[0].location
);

if (distanceToAccommodation > 10) { // 超过 10km
  // 调整路线节奏，选择更近的住宿或调整路线终点
  adjustRoutePace(day, accommodation.location);
}
```

**约束**:
- ⚠️ 住宿位置不应显著增加每日移动距离（建议 ±5km）
- ⚠️ 如果住宿位置不合理，应该提供替代方案

---

### ✅ **P1 - 重要场景（建议启用）**

#### 4. **住宿价格对路线成本的影响** ⭐⭐
**场景**: 在路线决策时，考虑住宿价格对总成本的影响

**使用工具**: `airbnb_listing_details`

**具体用例**:
- ✅ **成本估算**: 估算路线总成本时，包含住宿成本
- ✅ **预算约束**: 如果住宿价格超过预算，建议调整路线或日期
- ✅ **性价比分析**: 比较不同住宿位置的性价比

**集成点**:
- **Budget Planning**: 在预算规划时，考虑住宿成本
- **RouteDirection 选择**: 在选择 RouteDirection 时，考虑住宿成本

**约束**:
- ⚠️ 仅用于**成本敏感**的用户
- ⚠️ 不用于所有用户（避免过度调用 API）

---

#### 5. **住宿设施对路线体验的影响** ⭐
**场景**: 根据用户需求（宠物、无障碍设施等）搜索符合条件的住宿

**使用工具**: `airbnb_listing_details`

**具体用例**:
- ✅ **特殊需求**: 搜索符合特殊需求（宠物、无障碍设施、厨房等）的住宿
- ✅ **体验优化**: 根据住宿设施优化路线体验（例如，有厨房的住宿可以自己做饭）

**集成点**:
- **User Preferences**: 在考虑用户偏好时，搜索符合条件的住宿
- **Itinerary Planning**: 在生成行程时，考虑住宿设施对体验的影响

**约束**:
- ⚠️ 仅用于**有特殊需求**的用户
- ⚠️ 不用于一般用户（避免过度调用 API）

---

### ❌ **P2 - 不推荐场景（应限制使用）**

#### 6. **住宿推荐系统** ❌
**场景**: 基于住宿推荐路线

**不推荐原因**:
- ❌ TripNara 的核心是**路线决策**，不是住宿推荐
- ❌ 住宿不应该决定路线，路线应该决定住宿
- ❌ 偏离 TripNara 的核心定位

**建议**:
- ⚠️ **禁用**或**不暴露给 Agent**
- ✅ 仅在路线确定后，搜索路线内的住宿

---

#### 7. **住宿预订管理** ❌
**场景**: 管理住宿预订、取消、修改

**不推荐原因**:
- ❌ TripNara 不是预订平台
- ❌ 预订管理不是 TripNara 的核心功能
- ❌ 增加系统复杂度和责任边界

**建议**:
- ⚠️ **禁用**或**不暴露给 Agent**
- ✅ 仅提供住宿搜索和详情查询，不提供预订功能

---

#### 8. **住宿评价和推荐** ⚠️（有限使用）
**场景**: 基于住宿评价推荐住宿

**有限使用场景**:
- ✅ **质量筛选**: 在多个可选住宿中，优先选择评价较好的住宿
- ✅ **风险提示**: 如果住宿评价较差，提示用户风险

**不推荐场景**:
- ❌ 基于评价推荐路线（偏离核心定位）
- ❌ 过度依赖评价（评价可能不准确）

**建议**:
- ⚠️ **限制使用范围**，仅用于质量筛选和风险提示
- ✅ 不用于路线决策

---

## 🏗️ 架构集成建议

### 1. **集成到决策流程**

```
用户查询
  ↓
Agent Router (理解意图)
  ↓
World Model 构建
  ├─ 结构化数据（DEM、天气、交通）← 已有数据源
  └─ 住宿可用性（Airbnb 搜索）← Airbnb 补充
  ↓
三人格决策（Abu/Dr.Dre/Neptune）
  ├─ Abu: 安全检查（验证关键节点住宿可用性）
  ├─ Dr.Dre: 节奏调整（根据住宿位置调整路线节奏）
  └─ Neptune: 空间修复（搜索路线内的替代住宿）
  ↓
决策结果 + 决策日志
```

### 2. **集成点设计**

#### 2.1 **Abu 安全检查**
```typescript
// 在 Abu 评估时
async evaluate(world: WorldModelContext, plan: RoutePlanDraft) {
  // 1. 检查关键节点的住宿可用性
  for (const criticalNode of plan.criticalNodes) {
    const accommodation = await airbnbService.search({
      location: criticalNode.coordinates,
      checkin: criticalNode.date,
      checkout: nextDayDate,
      adults: world.human.partySize,
    });
    
    if (accommodation.results.length === 0) {
      return {
        allowed: false,
        reason: `关键节点 ${criticalNode.name} 没有可用住宿`,
      };
    }
  }
  
  // 2. 继续其他安全检查
  // ...
}
```

#### 2.2 **Dr.Dre 节奏调整**
```typescript
// 在 Dr.Dre 调整节奏时
async adjustPace(world: WorldModelContext, plan: RoutePlanDraft) {
  // 1. 为每日路线搜索住宿
  for (const day of plan.days) {
    const accommodation = await airbnbService.search({
      location: day.endPoint.coordinates,
      checkin: day.date,
      checkout: nextDayDate,
      adults: world.human.partySize,
    });
    
    // 2. 检查住宿位置是否合理
    const distanceToAccommodation = calculateDistance(
      day.endPoint,
      accommodation.results[0].location
    );
    
    if (distanceToAccommodation > 10) {
      // 调整路线节奏或选择更近的住宿
      adjustRoutePace(day, accommodation.location);
    }
  }
  
  // 3. 继续其他节奏调整
  // ...
}
```

#### 2.3 **Neptune 空间修复**
```typescript
// 在 Neptune 空间修复时
async replaceAccommodation(issue: SpatialIssue, world: WorldModelContext) {
  // 1. 搜索路线内的替代住宿
  const alternatives = await airbnbService.search({
    location: issue.originalLocation,
    checkin: issue.date,
    checkout: nextDayDate,
    adults: world.human.partySize,
  });
  
  // 2. 筛选路线内的住宿
  const validAlternatives = alternatives.results.filter(acc =>
    isWithinCorridor(acc.location, world.routeDirection.corridorGeom)
  );
  
  if (validAlternatives.length > 0) {
    return {
      type: 'ACCOMMODATION_REPLACEMENT',
      originalAccommodationId: issue.accommodationId,
      newAccommodationId: validAlternatives[0].id,
      explanation: '找到路线内的替代住宿',
    };
  }
  
  return null;
}
```

---

## 🚫 使用限制和边界

### 1. **API 调用限制**
- ⚠️ **关键节点优先**: 仅对关键节点（起点、终点、必须过夜点）搜索住宿
- ⚠️ **缓存策略**: 相同位置和日期的住宿搜索结果缓存 6-24 小时
- ⚠️ **批量查询**: 合并多个节点的住宿查询，减少 API 调用

### 2. **数据质量保证**
- ⚠️ **位置验证**: 验证住宿位置是否在路线走廊内
- ⚠️ **可用性验证**: 验证住宿是否在指定日期可用
- ⚠️ **容量验证**: 验证住宿容量是否满足团队人数

### 3. **降级策略**
- ✅ **住宿不可用**: 如果关键节点没有可用住宿，提供替代方案（调整路线或日期）
- ✅ **API 失败**: 如果 Airbnb API 失败，降级到其他住宿数据源或跳过住宿检查
- ✅ **价格过高**: 如果住宿价格过高，提示用户但继续路线规划

---

## 📈 成功指标（KPI）

### 1. **决策质量提升**
- ✅ 路线可行性提升（关键节点住宿可用性验证）
- ✅ 路线节奏优化（住宿位置对路线节奏的影响）
- ✅ 用户满意度提升（住宿位置合理，符合路线需求）

### 2. **成本控制**
- ✅ Airbnb API 调用成本控制在预算内
- ✅ 缓存命中率 > 60%
- ✅ 平均响应时间 < 2秒

### 3. **用户体验提升**
- ✅ 住宿位置符合路线需求
- ✅ 住宿搜索不阻塞路线规划流程
- ✅ 住宿信息准确可靠

---

## 🚀 实施路线图

### Phase 1: 核心集成（1-2周）✅ 已完成
1. ✅ 集成 `airbnb_search` 到 Abu 安全检查（关键节点住宿可用性验证）
2. ✅ 集成 `airbnb_search` 到 Dr.Dre 节奏调整（住宿位置对路线节奏的影响）
3. ✅ 集成 `airbnb_search` 到 Neptune 空间修复（路线内替代住宿搜索）
4. ✅ 添加缓存机制（住宿搜索结果缓存 6-24 小时）
5. ✅ 创建 AirbnbIntegrationService（封装搜索逻辑、缓存、错误处理）
6. ✅ 创建测试脚本（`scripts/test-airbnb-integration.ts`）

### Phase 2: 增强功能（1-2周）✅ 已完成
1. ✅ 集成住宿价格到成本估算（`estimateAccommodationCost` 方法）
2. ✅ 集成住宿设施到用户偏好匹配（`searchAccommodationsWithPreferences` 方法）
3. ✅ 添加住宿位置验证（`validateAccommodationInCorridor` 方法）

### Phase 3: 优化和监控（1周）✅ 已完成
1. ✅ 优化缓存策略（不同场景使用不同 TTL：关键节点搜索 6-24 小时，偏好搜索 12-24 小时）
2. ✅ 添加成本监控（`AirbnbMonitoringService`，记录每次 API 调用，估算成本）
3. ✅ 添加使用分析（每日统计、性能指标、按工具分组统计）
4. ✅ 添加性能监控（响应时间、成功率、成本限制检查）
5. ✅ 提供监控 API 端点（`GET /api/airbnb/monitoring/stats`, `GET /api/airbnb/monitoring/cost-check`）

---

## 📝 总结

### 核心结论

1. **Airbnb 是 TripNara 的"住宿约束工具"**
   - 不替代路线决策逻辑
   - 为路线提供住宿约束和支撑信息
   - 增强路线的可执行性

2. **应该框定的内容**
   - ✅ **P0**: 路线走廊内的住宿搜索、住宿可用性验证、住宿位置对路线节奏的影响
   - ✅ **P1**: 住宿价格对路线成本的影响、住宿设施对路线体验的影响
   - ⚠️ **P2**: 住宿评价和推荐（有限使用）
   - ❌ **禁用**: 住宿推荐系统、住宿预订管理

3. **集成原则**
   - 在路线决策的关键节点调用 Airbnb
   - 优先使用缓存，控制成本
   - 失败时降级到其他数据源，不阻塞路线规划

4. **产品边界**
   - ✅ 增强路线可执行性
   - ❌ 不替代路线决策
   - ❌ 不偏离核心定位

---

**文档状态**: ✅ Phase 1、Phase 2、Phase 3 已完成  
**下一步**: 
- 运行测试验证集成效果：`npm run test:airbnb:integration`
- 根据实际使用情况调整策略
- 监控 Airbnb API 使用情况和成本
- 根据实际使用情况优化缓存策略和成本控制

---

## 🔧 技术实现状态

### ✅ 已完成（Phase 1）

1. **AirbnbIntegrationService** (`src/mcp/airbnb-integration.service.ts`)
   - ✅ 封装 Airbnb 搜索逻辑
   - ✅ 提供缓存机制（Redis）
   - ✅ 错误处理和降级逻辑
   - ✅ 关键节点住宿可用性检查 (`checkCriticalNodeAvailability`)
   - ✅ 路线走廊内住宿搜索 (`searchAccommodationsInCorridor`)
   - ✅ 住宿位置对路线节奏的影响检查 (`checkAccommodationImpactOnPace`)

2. **Abu Strategy 集成** (`src/trips/decision/strategies/abu-strategy.service.ts`)
   - ✅ 在合规检查前，验证第一天起点和最后一天终点的住宿可用性
   - ✅ 如果关键节点没有可用住宿，直接 REJECT 计划
   - ✅ 降级处理：Airbnb 失败时继续其他检查，不阻塞决策

3. **Dr.Dre Strategy 集成** (`src/trips/decision/strategies/dr-dre-strategy.service.ts`)
   - ✅ 在构建 DayProfiles 后，检查每日住宿位置对路线节奏的影响
   - ✅ 如果住宿距离路线终点过远（>10km），调整该日的疲劳指数
   - ✅ 降级处理：Airbnb 失败时使用原始节奏

4. **Neptune Strategy 集成** (`src/trips/decision/strategies/neptune-strategy.service.ts`)
   - ✅ 当 SpatialReplacementService 找不到替代方案时，使用 Airbnb 搜索路线内的替代住宿
   - ✅ 搜索半径 5km 内的住宿，选择最近的作为替代方案
   - ✅ 降级处理：Airbnb 失败时继续其他修复方案

5. **模块集成**
   - ✅ `AirbnbModule` 导入到 `DecisionModule`
   - ✅ `AirbnbIntegrationService` 导出供其他模块使用

### 📝 使用说明

**Airbnb 工具不直接暴露给 Agent**，而是通过以下方式集成：

1. **自动集成**（无需 Agent 调用）:
   - Abu 安全检查时自动验证关键节点住宿可用性
   - Dr.Dre 节奏调整时自动检查住宿位置对路线节奏的影响
   - Neptune 空间修复时自动搜索路线内的替代住宿

2. **HTTP API**（前端/后端调用）:
   - `POST /api/airbnb/search` - 搜索房源（推荐使用）
   - `GET /api/airbnb/listing/:listingId` - 获取房源详情（推荐使用）

3. **限制**:
   - ❌ 不推荐 Agent 直接调用 Airbnb 工具（除非特殊场景）
   - ✅ 推荐通过 `AirbnbIntegrationService` 封装的方法使用
   - ✅ 所有调用都有缓存和降级保护
