# Booking.com (RapidAPI) 产品策略

## 📋 概述

**服务名称**: Booking.com Car Rentals (via RapidAPI)  
**服务类型**: 租车搜索和预订  
**集成方式**: RapidAPI  
**API 文档**: https://rapidapi.com/apidojo/api/booking-com15

## 🎯 战略定位

Booking.com 作为 TripNara 的**租车服务提供商**，通过 RapidAPI 提供全球租车搜索和预订能力。

### 核心价值

1. **租车搜索**: 根据取车/还车地点和时间搜索可用车辆
2. **价格对比**: 提供多个租车公司的价格对比
3. **全球覆盖**: 支持全球主要城市的租车服务
4. **实时可用性**: 实时查询车辆可用性和价格

## 🔧 工具能力

### 可用工具（基于 RapidAPI Booking.com API）

1. **searchCarRentals** - 搜索租车
   - 输入：取车/还车地点（经纬度）、时间、司机年龄、货币、位置
   - 输出：可用车辆列表、价格、租车公司信息

## 📍 使用场景

### P0 - 核心场景（必须实现）

1. **路线规划中的租车需求**
   - **场景**: 用户在规划行程时，需要租车完成某段路线
   - **触发点**: 路线规划时检测到需要租车（如跨城市移动、偏远地区）
   - **集成点**: 
     - `TripService`: 在创建/更新行程时检查是否需要租车
     - `RoutePlanDraft`: 在路线段中标记需要租车的路段
   - **决策影响**: 
     - **Abu (Safety)**: 检查租车公司的安全记录、车辆类型是否适合路线
     - **Dr.Dre (Pace)**: 考虑租车对行程节奏的影响（取车/还车时间）
     - **Neptune (Spatial Repair)**: 如果公共交通不可用，提供租车作为替代方案

2. **关键节点的租车可用性检查**
   - **场景**: 验证计划路线中关键节点（起点、终点、中转点）是否有可用租车
   - **触发点**: 路线规划完成后，Abu 安全检查阶段
   - **集成点**: `AbuStrategy.checkCriticalNodeCarRentalAvailability()`
   - **决策影响**: 如果关键节点没有可用租车，可能拒绝路线或建议调整

### P1 - 重要场景（优先实现）

3. **租车成本估算**
   - **场景**: 在行程成本估算中包含租车费用
   - **触发点**: 行程成本计算时
   - **集成点**: `TripService.estimateTripCost()`
   - **决策影响**: 帮助用户了解总行程成本

4. **租车位置对路线节奏的影响**
   - **场景**: 分析取车/还车位置对行程节奏的影响
   - **触发点**: Dr.Dre 节奏调整阶段
   - **集成点**: `DrDreStrategy.checkCarRentalImpactOnPace()`
   - **决策影响**: 如果取车/还车位置导致行程节奏不合理，建议调整

### P2 - 增强场景（后续实现）

5. **租车偏好匹配**
   - **场景**: 根据用户偏好（车型、价格范围、租车公司）筛选租车选项
   - **触发点**: 用户设置租车偏好后
   - **集成点**: `UserPreferencesService`
   - **决策影响**: 优先推荐符合用户偏好的租车选项

6. **租车位置验证**
   - **场景**: 验证租车取车/还车位置是否在路线走廊内
   - **触发点**: Neptune 空间修复阶段
   - **集成点**: `NeptuneStrategy.validateCarRentalInCorridor()`
   - **决策影响**: 如果租车位置不在路线走廊内，建议调整或拒绝

## 🚫 使用限制

1. **仅用于租车搜索**: 不用于酒店、航班等其他 Booking.com 服务
2. **不直接预订**: 只提供搜索和价格信息，实际预订需跳转到 Booking.com
3. **依赖 RapidAPI**: 需要有效的 RapidAPI API Key
4. **速率限制**: 遵循 RapidAPI 的速率限制（需要查看具体限制）

## 📊 关键指标 (KPIs)

1. **搜索成功率**: 租车搜索请求的成功率（目标: >95%）
2. **响应时间**: 搜索 API 的平均响应时间（目标: <2秒）
3. **结果相关性**: 返回的租车选项与用户需求的匹配度
4. **成本估算准确性**: 租车成本估算与实际价格的偏差（目标: <10%）

## 🔄 集成点

### 1. TripService（行程服务）

```typescript
// 检查行程是否需要租车
async checkCarRentalNeeds(tripId: string): Promise<boolean>

// 估算租车成本
async estimateCarRentalCost(tripId: string): Promise<number>
```

### 2. AbuStrategy（安全检查）

```typescript
// 检查关键节点的租车可用性
async checkCriticalNodeCarRentalAvailability(
  location: { lat: number; lng: number },
  pickupTime: string,
  dropoffTime: string,
  driverAge: number
): Promise<CarRentalAvailability>
```

### 3. DrDreStrategy（节奏调整）

```typescript
// 检查租车对节奏的影响
async checkCarRentalImpactOnPace(
  pickupLocation: { lat: number; lng: number },
  dropoffLocation: { lat: number; lng: number },
  pickupTime: string,
  dropoffTime: string
): Promise<PaceImpact>
```

### 4. NeptuneStrategy（空间修复）

```typescript
// 验证租车位置是否在路线走廊内
async validateCarRentalInCorridor(
  pickupLocation: { lat: number; lng: number },
  dropoffLocation: { lat: number; lng: number },
  routeCorridor: RouteCorridor
): Promise<ValidationResult>

// 搜索路线走廊内的租车选项
async searchCarRentalsInCorridor(
  centerPoint: { lat: number; lng: number },
  radiusKm: number,
  pickupTime: string,
  dropoffTime: string,
  driverAge: number
): Promise<CarRentalAvailability>
```

## 🛠️ 实现计划

### Phase 1: 核心集成（P0）

- [x] 创建产品策略文档
- [x] 创建 Booking.com MCP 客户端（RapidAPI）
- [x] 创建 BookingComService（NestJS Service）
- [x] 创建 BookingComIntegrationService（业务逻辑层）
- [x] 创建 BookingComController（API 端点）
- [x] 创建 BookingComModule（模块配置）
- [x] 集成到 TripService（检查租车需求）
- [x] 集成到 AbuStrategy（关键节点可用性检查）
- [x] 添加缓存机制（Redis）
- [x] 添加错误处理和降级策略

### Phase 2: 增强功能（P1）

- [x] 集成到 DrDreStrategy（节奏影响分析）
- [x] 集成到 NeptuneStrategy（空间修复）
- [x] 实现租车成本估算（占位符，需要 RoutePlanDraft）
- [ ] 实现租车偏好匹配（P2 可选）
- [ ] 实现租车位置验证（P2 可选）

### Phase 3: 优化和监控（P2）

- [x] 添加 API 调用监控
- [x] 添加成本监控（RapidAPI 使用量）
- [x] 添加性能监控
- [x] 优化缓存策略（6-24 小时缓存）
- [x] 添加使用分析（监控 API 端点）

## 📝 数据模型

### CarRentalAvailability

```typescript
interface CarRentalAvailability {
  available: boolean;
  rentalsCount: number;
  rentals: Array<{
    id: string;
    company: string;
    vehicleType: string;
    price: {
      amount: number;
      currency: string;
    };
    pickupLocation: {
      lat: number;
      lng: number;
      address: string;
    };
    dropoffLocation: {
      lat: number;
      lng: number;
      address: string;
    };
    pickupTime: string;
    dropoffTime: string;
  }>;
  source: 'BOOKING_COM';
}
```

## 🔐 认证和配置

### 环境变量

```env
# RapidAPI Booking.com API
RAPIDAPI_BOOKING_COM_API_KEY=e94ff3b434mshffe79de400b77fap1b7118jsnd0ce7b088f64
RAPIDAPI_BOOKING_COM_HOST=booking-com15.p.rapidapi.com
```

### API 端点

- **Base URL**: `https://booking-com15.p.rapidapi.com/api/v1/cars`
- **搜索租车**: `GET /searchCarRentals`

## 📚 相关文档

- [RapidAPI Booking.com 文档](https://rapidapi.com/apidojo/api/booking-com15)
- [Booking.com API 文档](https://developers.booking.com/)

---

**状态**: 🚧 Phase 1 进行中  
**最后更新**: 2026-02-06
