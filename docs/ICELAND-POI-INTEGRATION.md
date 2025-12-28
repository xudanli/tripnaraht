# 冰岛 POI 数据决策层集成文档

## 概述

本文档描述了冰岛 POI 数据与决策层（Abu/Dr.Dre/Neptune）的集成实现。

## 实现内容

### 1. IcelandPoiFeaturesService

位置：`src/places/services/iceland-poi-features.service.ts`

为决策层提供结构化的冰岛 POI Features，包括：
- **交通节点**：机场、渡轮码头、停车场
- **自然景点**：瀑布、温泉、间歇泉、冰川、火山、海滩、观景点
- **安全保障点**：医院、诊所、药房、警察局、消防站
- **补给点**：加油站、超市、便利店、厕所
- **服务点**：信息中心、旅行社、租车、露营、SPA/泳池

#### 使用示例

```typescript
import { IcelandPoiFeaturesService } from './places/services/iceland-poi-features.service';

// 注入服务
constructor(
  private readonly icelandFeatures: IcelandPoiFeaturesService
) {}

// 获取 POI Features
const features = await this.icelandFeatures.getIcelandFeatures('IS_REYKJAVIK');

// 使用 features 进行决策
if (features.supply.hasFuel) {
  // Dr.Dre: 插入加油提醒
}

if (features.attractions.waterfalls.length > 0) {
  // Abu: 评估核心景点可用性
}

if (!features.safety.hasHospital) {
  // Neptune: 如果缺少医院，可能需要调整活动或添加安全提醒
}
```

### 2. Readiness Pack for Iceland

位置：`src/trips/readiness/data/packs/pack.is.iceland.json`

包含冰岛特定的准备度规则：
- **天气规则**：分层衣物、天气预报检查
- **地热安全规则**：温泉/间歇泉安全距离
- **燃料补给规则**：偏远地区燃料规划
- **驾驶规则**：F-路要求、4x4 车辆
- **海岸安全规则**：黑沙滩安全提示
- **露营规则**：季节性可用性

### 3. PoiFeaturesAdapterService

位置：`src/trips/decision/services/poi-features-adapter.service.ts`

统一的 POI Features 适配器，自动识别目的地类型并返回相应的 POI Features。

#### 功能

- 自动识别冰岛和斯瓦尔巴目的地
- 从目的地字符串推断区域
- 提供类型守卫函数（`isIcelandFeatures`, `isSvalbardFeatures`）

#### 使用示例

```typescript
import { PoiFeaturesAdapterService } from './decision/services/poi-features-adapter.service';

constructor(
  private readonly poiAdapter: PoiFeaturesAdapterService
) {}

// 自动识别目的地并获取 POI Features
const features = await this.poiAdapter.getPoiFeatures({
  destination: 'IS-ICELAND',
  region: 'IS_GOLDEN_CIRCLE', // 可选
});

if (features && this.poiAdapter.isIcelandFeatures(features)) {
  // 使用冰岛特定的 POI Features
  if (features.supply.hasFuel) {
    // 处理逻辑
  }
}
```

### 4. 决策层集成

#### TripDecisionEngineService

位置：`src/trips/decision/trip-decision-engine.service.ts`

决策引擎已更新，可选地加载 POI Features 用于决策优化：

```typescript
// 在 generatePlan 方法中
let poiFeatures: PoiFeatures | null = null;
if (this.poiFeaturesAdapter) {
  try {
    poiFeatures = await this.poiFeaturesAdapter.getPoiFeatures({
      destination: state.context.destination,
    });
    if (poiFeatures) {
      this.logger.log(`Loaded POI Features for destination: ${state.context.destination}`);
    }
  } catch (error) {
    this.logger.warn(`Failed to load POI Features: ${error}`);
  }
}
```

#### 策略使用场景

**Abu（风险优先选择）**：
- 使用 `features.supply.hasFuel` 判断是否需要降级行程
- 使用 `features.safety.hasHospital` 评估安全风险
- 使用 `features.attractions` 评估核心景点可用性

**Dr.Dre（约束排程）**：
- 使用 `features.supply.fuelStations` 插入加油提醒
- 使用 `features.services.informationCenters` 安排信息点访问
- 使用 `features.transport.parking` 安排停车点

**Neptune（最小改动修复）**：
- 使用 `features.supply.hasFuel` 判断是否需要替换活动
- 使用 `features.safety` 评估是否需要调整安全相关活动
- 使用 `features.attractions` 寻找替代景点

## 测试

位置：`src/trips/decision/__tests__/iceland-poi-integration.spec.ts`

测试覆盖：
1. IcelandPoiFeaturesService 基本功能
2. PoiFeaturesAdapterService 目的地识别
3. 决策策略与 POI 数据的集成

运行测试：
```bash
npm test -- iceland-poi-integration.spec.ts
```

## 模块注册

### PlacesModule

已注册 `IcelandPoiFeaturesService`：
```typescript
// src/places/places.module.ts
providers: [
  // ...
  IcelandPoiFeaturesService,
],
exports: [
  // ...
  IcelandPoiFeaturesService,
],
```

### DecisionModule

已注册 `PoiFeaturesAdapterService` 并导入 `PlacesModule`：
```typescript
// src/trips/decision/decision.module.ts
imports: [
  // ...
  PlacesModule,
],
providers: [
  // ...
  PoiFeaturesAdapterService,
],
```

## 数据查询

IcelandPoiFeaturesService 使用以下查询模式：

```sql
SELECT 
  id,
  "nameCN",
  "nameEN",
  ST_Y(location::geometry) as lat,
  ST_X(location::geometry) as lng,
  metadata
FROM "Place"
WHERE metadata->>'regionKey' = ${region}
  AND metadata->>'canonicalType' IN (...)
```

支持的 `canonicalType` 值：
- 交通：`AIRPORT`, `PORT_FERRY_TERMINAL`, `PORT_PIER`, `PARKING`
- 景点：`ATTRACTION_NATURE_WATERFALL`, `ATTRACTION_NATURE_HOT_SPRING`, `ATTRACTION_NATURE_GEYSER`, `ATTRACTION_NATURE_GLACIER`, `ATTRACTION_NATURE_VOLCANO`, `ATTRACTION_NATURE_BEACH`, `VIEWPOINT`
- 安全：`HOSPITAL`, `CLINIC`, `PHARMACY`, `POLICE`, `FIRE_STATION`
- 补给：`FUEL_STATION`, `SUPERMARKET`, `CONVENIENCE_STORE`, `TOILETS`
- 服务：`INFORMATION_CENTER`, `TOUR_OPERATOR`, `CAR_RENTAL`, `CAMPING`, `SPA_POOL`

## 下一步

1. **增强策略集成**：在 Abu/Dr.Dre/Neptune 策略中更深入地使用 POI Features
2. **性能优化**：缓存 POI Features 查询结果
3. **扩展支持**：添加更多冰岛区域的支持
4. **监控和日志**：添加 POI Features 使用情况的监控

## 相关文档

- [ICELAND-POI-GUIDE.md](./ICELAND-POI-GUIDE.md) - 冰岛 POI 导入指南
- [SVALBARD-POI-GUIDE.md](./SVALBARD-POI-GUIDE.md) - 斯瓦尔巴 POI 指南（参考实现）
