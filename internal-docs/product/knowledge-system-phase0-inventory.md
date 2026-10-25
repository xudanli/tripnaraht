# Knowledge System Phase 0 — Inventory（冻结盘点）

**文档版本：** 1.0.0  
**状态：** Phase 0 交付物（**不改业务代码**）  
**生效日期：** 2026-08-13  
**执行计划：** [tripnara-knowledge-system-execution-plan-v2.md](./tripnara-knowledge-system-execution-plan-v2.md)

> 本文件用于会签 Identity / Predicate / Relation 冻结规则。会签前禁止大规模业务迁移。

---

## 1. Entity Inventory

| 当前类型 | 当前 ID 示例 | 来源 | Canonical 规则（拟冻结） | 是否需迁移 |
|----------|--------------|------|--------------------------|------------|
| Place | `is.reynisfjara` | CPRE `src/canonical-poi-resolution/` | **保留** `{cc}.{slug}`；regex `^[a-z]{2}\.[a-z0-9_]+$` | **否**（真源） |
| Place（DB） | `Place.id` 数值 / `poi_*` | Prisma Place | `sourceRefs: [{system:'poi', sourceId}]` → CPRE | Adapter，不改主键 |
| Place（TripItem） | `placeId` / 名称字符串 | ItineraryItem | 经 CPRE resolve | Adapter |
| RouteSegment | `seg_f208` · `seg_river_crossing` | ontology ingest / harness | `segment:is:{roadSlug}` 例 `segment:is:f208` | **是**（逻辑 ID） |
| Road（权威） | `IS-R1-SOUTH` · `F208` | road.is / RAG chunks / Snapshot `roadId` | `road:is:{code}` 小写规范化 | **是**（对齐） |
| RentalVehicle | `veh_1` · `trip_{tripId}_vehicle` | facts ingest / specs | `vehicle:trip:{tripId}` 或 `vehicle:contract:{id}` | **是** |
| Traveler | trip-scoped subject | ingest | `traveler:{userId}` 或 `traveler:trip:{tripId}` | **是**（约定） |
| InsurancePolicy | policy subject | ingest | `insurance:{contractId}` | **是** |
| RentalContract | contract subject | exploration adapter | `contract:{contractId}` | **是** |
| WeatherRegion | `south_coast` · `wx_south_coast` | weather adapters | `weather-region:is:south_coast` | **是**（去重别名） |
| Flight | `flight_kef_arrival` | rental adapter | `flight:{carrier}:{number}` 或 `flight:trip:{id}:arrival` | **是** |
| Activity | `activityId` 字符串 | ActivityCapability | `activity:{cc}:{slug}` | **是** |
| Hazard | `hazardId` | NaturalHazard / ERC | `hazard:{type}:{scope}` | **是** |
| Decision | `decision:*` | decision-semantics ledger | 保留决策命名空间（非地理实体） | 否（独立 NS） |

### 冻结决议（拟）

1. **Place 真源 = CPRE**；禁止再发明 `place:is:reynisfjara` 作为第二主键（若需文档可读形式，仅作 alias）。  
2. 迁移一律 **旧 ID → Identity Adapter → Canonical**，**不改** Prisma 主键。  
3. Phase 1 先落地：Place + RouteSegment + RentalVehicle + WeatherRegion。其余后置。

### 已知分裂例（Unresolved 候选）

| 现实对象 | 出现过的 ID |
|----------|-------------|
| F208 路段 | `seg_f208` · `F208` · RAG `is-road-f208-*` |
| 南岸天气 | `south_coast` · `wx_south_coast` · `WeatherRegion` |
| 本行程车辆 | `veh_1` · `trip_{id}_vehicle` |

---

## 2. Predicate Inventory

### 2.1 契约常量（`TRAVEL_WORLD_PREDICATES`）

| Predicate | 含义 |
|-----------|------|
| `mobility.hasDrivetrain` | 车辆驱动 |
| `mobility.permittedRoadClass` | 允许路类 |
| `mobility.prohibitedRoadClass` | 禁止路类 |
| `route.requiredVehicleCapability` | 路段所需能力 |
| `route.currentRoadStatus` | 当前路况 |
| `insurance.coversDamageCause` | 保险覆盖 |
| `insurance.excludesDamageCause` | 保险除外 |
| `immigration.entryEligibility` | 入境资格 |
| `immigration.visaRequired` | 是否需签 |
| `weather.warningLevel` | 天气预警等级 |
| `activity.operatingStatus` | 活动营业/可执行 |
| `accommodation.checkInWindow` | 入住窗 |

**路径：** `src/travel-ontology/contracts/travel-world-fact.types.ts`

### 2.2 代码中额外使用的 predicate（未进常量）

| Predicate | 出现位置 | 建议 |
|-----------|----------|------|
| `mobility.vehicleClass` | weather-repair / evaluator | **升格进常量** |
| `route.windExposed` | weather-warning adapter | 升格或并入 weather.* |
| `route.hasRiverCrossing` | ingest / evaluator | **升格进常量** |
| `immigration.nationality` | ingest | 升格 |
| `rental.counterHours` | exploration rental adapter | 升格 `rental.*` 命名空间 |
| `rental.afterHoursPickupConfirmed` | 同上 | 升格 |
| `rental.pickupLocation` | 同上 | 升格 |
| `transport.scheduledArrival` | 同上 | 升格 `transport.*` |
| `weather.summary`（type 字段） | trip-world-facts.builder | 与 `warningLevel` 区分，勿混 |

### 2.3 命名冲突风险（一件事多种叫法）

| 概念 | 已见形式 | 冻结建议 |
|------|----------|----------|
| 路况 | `route.currentRoadStatus` · Snapshot `RoadState.status` · RAG `ROAD_STATUS` | Fact 统一 `route.currentRoadStatus`；RAG 仅证据 |
| 天气预警 | `weather.warningLevel` · Snapshot `alertLevel` | Fact 统一 `weather.warningLevel` |
| 车辆驱动 | `mobility.hasDrivetrain` · 口语 drive_type / 2WD | Fact 只用 `hasDrivetrain` |
| 禁止路类 | `mobility.prohibitedRoadClass` | 唯一 |

**Phase 1–2 动作：** 扩展 `TRAVEL_WORLD_PREDICATES`；写入路径拒绝未登记 predicate（可先 WARN soft-gate）。

---

## 3. Relation Inventory

### 3.1 Golden Set / Region Pack（已进规划运行时）

| 当前类型 | 含义 | 目标 RelationType | 备注 |
|----------|------|-------------------|------|
| `CO_VISIT_CLUSTER` | 同日共访簇 | `CO_VISIT` | metadata.groupId 保留 |
| `SOFT_ALTERNATIVE` | 软替代 | `SOFT_ALTERNATIVE` | 可并行挂 `ALTERNATIVE_TO` + kind=SOFT |
| `PARENT_CHILD` | 父子景点 | **DEFER 或** `LOCATED_IN` / 专用 `PARENT_OF`（V1 十二词外） | V1 可不投影 |
| `ALIAS_OF` | 别名 | **Identity.aliases / sourceRefs**，不进 Relation | Identity 层处理 |

**路径：** `src/trips/iceland-self-drive/packs/iceland-region-planning-packs.ts`  
**类型：** `iceland-region-planning-pack.types.ts`

### 3.2 POI Access Alternatives

| 当前 | 目标 |
|------|------|
| `alternativePoiId` / `USE_ALTERNATIVE` | `ALTERNATIVE_TO` 或 `SOFT_ALTERNATIVE` |

**路径：** `src/poi-access-capacity/fixtures/iceland-poi-alternatives.ts`

### 3.3 Spatial

| 当前 | 目标 |
|------|------|
| `SpatialDomainSegment.fromPoiId → toPoiId` | `CONNECTED_TO`（端点 Place） |
| 路段在行程中的顺序 | `ON_ROUTE` / `BEFORE`（BEFORE 非 V1 十二词，可后置） |

**路径：** `src/domain/spatial/spatial-graph.service.ts`

### 3.4 Causal / Risk

| 当前 | 目标 |
|------|------|
| ERC `causal-chains` Admin | `AFFECTS` · `INCREASES_RISK_OF` |
| decision-semantics `caused_by` | **Decision ledger 边**，勿与 Travel KG 混名；或映射 `CAUSES`（DEFER） |

**路径：** `execution-risk-knowledge-admin.controller.ts` · `decision-ledger-causality`

### 3.5 隐式 requires

| 当前 | 目标 |
|------|------|
| Pack / ActivityCapability 门槛 | `REQUIRES` |
| F-road + 能力 | Rules，不一定成边；可选 `REQUIRES` VehicleCapability |

### 3.6 V1 十二词锁定（Phase 3）

```text
LOCATED_IN · NEAR · CONNECTED_TO · ON_ROUTE
CO_VISIT · ALTERNATIVE_TO · SOFT_ALTERNATIVE
REQUIRES · INCOMPATIBLE_WITH · SUITABLE_FOR
AFFECTS · INCREASES_RISK_OF
```

| 现有 → | V1 |
|--------|-----|
| CO_VISIT_CLUSTER | CO_VISIT |
| SOFT_ALTERNATIVE | SOFT_ALTERNATIVE |
| POI alternative | ALTERNATIVE_TO / SOFT_ALTERNATIVE |
| spatial endpoints | CONNECTED_TO |
| causal-chains | AFFECTS / INCREASES_RISK_OF |
| ALIAS_OF | Identity（非 Relation） |
| PARENT_CHILD | DEFER |
| INSTANCE_OF / SUBCLASS_OF | 契约可有，不建库 |

---

## 4. World State / Context 双轨盘点（供 Phase 2）

| 结构 | 路径 | Phase 2 角色 |
|------|------|--------------|
| `TravelWorldFact` | `travel-ontology/contracts/travel-world-fact.types.ts` | **事实原子** |
| `CanonicalWorldStateSnapshot` | `decision-runtime/contracts/world-state-snapshot.ts` | **SSOT** |
| `WorldModelContext` | `trips/decision/shared/world-model.types.ts` | Legacy → adapter |
| Travel Context | `src/travel-context/` | 读投影，非写 SSOT |
| ETC | `travel-memory/effective-context/` | Phase 4 唯一人侧读 |

---

## 5. Phase 0 会签清单

- [x] Entity：同意 Place=`is.*` 真源；Segment/Vehicle/WeatherRegion 命名空间  
- [x] Predicate：同意扩展常量 + 拒绝未登记（先 WARN）— *Phase 2 再接写入门*  
- [x] Relation：同意 V1 十二词；ALIAS→Identity；PARENT_CHILD DEFER  
- [x] 确认 **不改** Prisma 主键；仅 Adapter  
- [x] 确认 Neo4j / 深 taxonomy **本阶段不做**

**Phase 1 已落地：** `EntityIdentityRegistry` + Admin（resolve / unresolved）。会签通过后进入 **Phase 2（World State SSOT）**。
