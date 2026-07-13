# ADR-ROAD: Road Traversability Model — 五维路面可执行性

## Status

**Proposed** (2026-07-11) — 设计冻结候选；实现待 Weather Formal Soak 签字后启动

## Context

### 已解决的问题（Slice 2 / Pre-Signoff）

Gagnaveita 接入与 Pre-Signoff Drill 已证明：

```
REAL-SHAPE Gagnaveita (replay/live)
  → WorldStateAssertion (road.status = OPEN | LIMITED | CLOSED)
  → DecisionProblem (FEASIBILITY_FAILURE)
  → Repair candidates → W-01 → PlanVersion → Revalidation
```

证据：`ROAD_PROD_CANARY_PRE_SIGNOFF_ENGINEERING_EVIDENCE`（独立 Road Trip `b0b88888-8888-4888-8888-888888888888`）。

这回答的是：**当前道路发生了什么（动态状态）**。

### 尚未解决的问题

官方安全指南与冰岛自驾实践要求区分：

- 铺装路 vs 碎石路 / 非铺装（抓地力、制动距离、速度预期不同）
- F-road 等级、四驱要求、涉水点
- 同一 `LIMITED` 对 2WD 与大型 4WD 不是同一结论
- 降雨/降雪对不同 `surfaceType` 的影响不同

Authority 文档已冻结语义：

| Gagnaveita enum | RFC-001 | 决策语义（目标） |
|-----------------|---------|------------------|
| `FAERT_FJALLABILUM` | `LIMITED` | **2WD 不可行；4WD 可能可行** |
| `LOKAD` | `CLOSED` | 硬阻断 |

但当前 `abu-road-constraint.adapter.ts` 对 `LIMITED` 仅产出泛化 `WARNING`，**未读取车辆能力**。

因此 Slice 2 更准确的描述是：

> 系统已知道路当前状态，但尚未完整理解「这条路对这个用户意味着什么」。

### 约束

- **不**新建独立「路面监测服务」——动态状态继续由 Gagnaveita Collector + World State 承担
- **不**在 Weather Formal Soak 期间改动 PM2 / Vedur env / Live Road 自动触发
- Traversability 设计可与 Soak **并行**；代码接线在 Soak PASS 后

---

## Decision

### 1. 道路 World Model 必须包含五个维度

道路可执行性不由单一 `road.status` 决定，而由以下五组信息联合得出：

| # | 维度 | 问题 | SSOT 归属（目标） |
|---|------|------|-------------------|
| 1 | **静态属性** | 这是什么路？ | Destination Pack + Road Ontology catalog |
| 2 | **动态状态** | 现在路况如何？ | Gagnaveita → `WorldStateAssertion` |
| 3 | **天气 × 路面** | 当前天气对此路面意味着什么？ | Weather assertion + Traversability 函数 |
| 4 | **车辆能力** | 这辆车能不能走？ | Trip rental / vehicle profile |
| 5 | **驾驶者 / 团队** | 这个人 / 团队能不能走？ | Driver profile + trip constraints |

最终判断：

```
roadProfile + liveCondition + weather + vehicle + driver + tripContext
  → RoadTraversabilityAssessment
  → Constraint Gateway gate (ALLOW | NEED_CONFIRM | SUGGEST_REPLACE | REJECT)
```

### 2. 新增评估层，不新增监测层

在现有三层之间插入 **纯函数评估模块**：

```
Road Ontology (静态 profile SSOT)
        ↓
World State (Gagnaveita live + weather assertions)
        ↓
Road Traversability Assessment   ← 本 ADR
        ↓
Constraint Gateway (Abu / Dre / Pack rules)
        ↓
DecisionProblem / Repair / Execute
```

**禁止：** 平行建设第二个 road polling / ingestion 管道。

**允许：** `assessRoadTraversability()` 作为 Guardian evaluate 路径上的确定性评估步骤，输出约束断言与 gate 建议。

### 3. `LIMITED` 语义升级

`LIMITED` **不得**等同于「封闭」，也**不得**默认为「可通行 + WARNING」。

| 条件 | 目标 `result` | 目标 `gate` |
|------|---------------|-------------|
| `CLOSED` | `CLOSED` | `REJECT` |
| `LIMITED` + 2WD + F-road / `requires4wd` | `VEHICLE_INCOMPATIBLE` | `REJECT` 或 `SUGGEST_REPLACE` |
| `LIMITED` + 4WD + 无涉水/合同限制 | `PASSABLE_WITH_CAUTION` | `NEED_CONFIRM` |
| `LIMITED` + 4WD + 降雨 + 涉水点 | `TEMPORARILY_IMPASSABLE` | `SUGGEST_REPLACE` |
| `OPEN` + gravel + 无经验驾驶者 | `DRIVER_INCOMPATIBLE` | `NEED_CONFIRM` |
| 数据缺口（profile 或 condition UNKNOWN） | `UNKNOWN` | `REQUIRES_VERIFICATION`（fail-closed 于安全 scope） |

与 ADR-006 一致：**没有 profile 数据 ≠ 可通行**。

---

## Type Contracts (Frozen for T1)

### 1. 道路静态属性

```typescript
interface RoadSegmentProfile {
  roadId: string;
  segmentId: string;

  roadClass:
    | 'PRIMARY'
    | 'SECONDARY'
    | 'HIGHLAND_F_ROAD'
    | 'LOCAL'
    | 'TRACK';

  surfaceType:
    | 'PAVED'
    | 'GRAVEL'
    | 'MIXED'
    | 'UNPAVED'
    | 'UNKNOWN';

  terrainType:
    | 'LOWLAND'
    | 'MOUNTAIN'
    | 'HIGHLAND'
    | 'COASTAL'
    | 'GLACIAL_RIVER';

  requires4wd: boolean;
  minVehicleClass?: string;

  hasUnbridgedRiver: boolean;
  riverCrossingCount?: number;

  typicalSpeedKph?: number;
  winterServiceLevel?: string;
}
```

**SSOT：** `data/destination-packs/is/` 道路 catalog（新建 `is-road-segment-profiles.json` 或扩展现有 route templates）；trip 绑定通过 `rfc001IcelandRoadBindings`。

**现有碎片：** `travel-ontology` `RouteSegment`（`roadClass`, `surfaceType`, `fRoad`, `riverCrossing`）——T1 收敛到此 contract。

### 2. 道路动态状态

```typescript
interface RoadSegmentCondition {
  status: 'OPEN' | 'LIMITED' | 'CLOSED' | 'UNKNOWN';

  condition:
    | 'NORMAL'
    | 'WET'
    | 'SLIPPERY'
    | 'ICY'
    | 'SNOW_COVERED'
    | 'HEAVY_SNOW'
    | 'LOOSE_GRAVEL'
    | 'FLOODED'
    | 'IMPASSABLE'
    | 'UNKNOWN';

  observedAt: string;
  validUntil?: string;
  sourceProvider: string; // vegagerdin_gagnaveita
}
```

**SSOT：** Gagnaveita mapper → `WorldStateAssertion` payload；`condition` 细粒度由 `AstandYfirbord` + `FrkvLysingEn` + `AstandVidbotaruppl` 映射（T1 扩展 mapper，非新 ingest）。

### 3. 车辆能力

```typescript
interface VehicleCapability {
  driveType: '2WD' | 'AWD' | '4WD';
  vehicleClass:
    | 'SMALL_CAR'
    | 'SUV'
    | 'LARGE_4X4'
    | 'CAMPERVAN'
    | 'MOTORHOME';

  groundClearanceMm?: number;
  riverCrossingAllowed: boolean;
  rentalRestrictions?: string[];
}
```

**SSOT：** Trip metadata / rental contract facts（现有 `exploration-rental-contract.adapter` 投影 `2WD` vs `4WD`）。

### 4. 驾驶者 / 行程上下文

```typescript
interface DriverCapability {
  gravelRoadExperience?: boolean;
  snowDrivingExperience?: boolean;
  acceptsRiverCrossing?: boolean;
  acceptsNightDriving?: boolean;
  maxDailyDrivingHours?: number;
}

interface TripExecutionContext {
  tripId: string;
  destination: string;
  hasElderlyOrChildren?: boolean;
  isMotorhome?: boolean;
  highWindExposure?: boolean; // 高侧面车辆
  timeWindow?: { lastEntryAt?: string; closesAt?: string };
}
```

**SSOT：** Trip constraints API + member participation metadata（T1 最小字段；不全量推断）。

### 5. Traversability 评估

```typescript
interface RoadTraversabilityInput {
  roadProfile: RoadSegmentProfile;
  liveCondition: RoadSegmentCondition;
  weather: WeatherCondition; // 已有 weather assertion 形状
  vehicle: VehicleCapability;
  driverProfile: DriverCapability;
  tripContext: TripExecutionContext;
}

interface RoadTraversabilityAssessment {
  result:
    | 'PASSABLE'
    | 'PASSABLE_WITH_CAUTION'
    | 'VEHICLE_INCOMPATIBLE'
    | 'DRIVER_INCOMPATIBLE'
    | 'TEMPORARILY_IMPASSABLE'
    | 'CLOSED'
    | 'UNKNOWN';

  expectedSpeedKph?: number;
  addedDurationMinutes?: number;

  hardConstraints: string[];
  risks: string[];
  evidenceRefs: string[];

  gate: 'ALLOW' | 'NEED_CONFIRM' | 'SUGGEST_REPLACE' | 'REJECT';
}
```

**实现位置（T1）：** `src/trips/guardian-decision-core/assessment/road-traversability.assessor.ts`（纯函数 + spec）。

**调用点：** `RoadSegmentUnavailableEvaluateService` 在 Abu 之前；Abu 消费 assessment 而非仅 `road.status`。

---

## Reference Profile — F208 (Frozen for acceptance)

独立 Road Canary / 验收场景使用：

```json
{
  "roadId": "F208",
  "roadClass": "HIGHLAND_F_ROAD",
  "surfaceType": "GRAVEL",
  "terrainType": "HIGHLAND",
  "requires4wd": true,
  "hasUnbridgedRiver": true,
  "riverCrossingCount": 1,
  "typicalSpeedKph": 40,
  "winterServiceLevel": "SEASONAL"
}
```

**Live Gagnaveita（2026-07-10）：** rollup `LIMITED`（`FAERT_FJALLABILUM` = mountain vehicles only）。

**Replay CLOSED（Pre-Signoff）：** `gagnaveita-f208-closed-real-shape.json` — 不得与 Live LIMITED 混记。

---

## Acceptance Scenarios (T2 — Traversability Drill)

与 Pre-Signoff CLOSED drill **并列**，证据标签：`ROAD_TRAVERSABILITY_ENGINEERING_EVIDENCE`。

| ID | liveCondition | vehicle | 预期 result | 预期 gate | Problem? |
|----|---------------|---------|-------------|-----------|----------|
| RT-F208-001 | `LIMITED` | 2WD | `VEHICLE_INCOMPATIBLE` | `SUGGEST_REPLACE` | OPEN |
| RT-F208-002 | `LIMITED` | LARGE_4X4, river OK | `PASSABLE_WITH_CAUTION` | `NEED_CONFIRM` | 可选 |
| RT-F208-003 | `LIMITED` + rain + river | LARGE_4X4 | `TEMPORARILY_IMPASSABLE` | `SUGGEST_REPLACE` | OPEN |
| RT-F208-004 | `CLOSED` | any | `CLOSED` | `REJECT` | OPEN（已有 Pre-Signoff） |
| RT-F208-005 | `OPEN` + gravel | 2WD, 无碎石经验 | `DRIVER_INCOMPATIBLE` | `NEED_CONFIRM` | 可选 |

**Trip：** 继续使用独立 Road Trip `b0b88888-8888-4888-8888-888888888888`；**不得**使用 Weather Canary Trip。

---

## Relationship to Current Milestones

| 里程碑 | 状态 | 与本 ADR |
|--------|------|----------|
| Gagnaveita Live ingestion | PASS | 提供维度 2 |
| Road A/B/C Pre-Signoff (CLOSED replay) | PASS | 证明主链；**不**证明五维 |
| Weather Formal Soak | RUNNING | 阻塞 Road Production GO |
| Road Traversability T0 (本文档) | **当前** | 设计冻结 |
| Road Traversability T1 (接线) | 待 Soak PASS | Abu + assessor |
| Road Production Canary GO | PENDING | 需 Soak + Owner 签字 |

---

## Implementation Phases

### T0 — 设计冻结（Soak 期间可做）

- [x] 本 ADR
- [x] `is-road-segment-profiles.json`（至少 F208、Ring Road、F26）
- [x] 更新 `ICELAND-ROAD-SOURCE-AUTHORITY` 交叉引用 traversability 规则
- [x] `SLICE-2` 验收文档增补 RT-F208-* 场景

### T1 — 接线（Soak PASS 后）

1. `resolveRoadSegmentProfile(roadId)` — 读 pack catalog ✅
2. `assessRoadTraversability(input)` — 纯函数 + unit tests（RT-F208-001..005）✅
3. `AbuRoadConstraint` — `LIMITED` 分支读 `VehicleCapability` ✅
4. Evaluate 路径 — assessment → constraint assertions → 现有 Repair 链 ✅
5. Causal trace — 新增节点「车辆/路面不匹配」✅（lineage + impact chain）

### T2 — 工程验收（Road 正式 GO 前）

- 独立 Trip replay：Live LIMITED fixture + 2WD / 4WD 对照
- 证据：`road-traversability-pre-signoff-*.json`
- **不**替代 Weather Soak 签字；**不**提前标 Production GO

---

## Consequences

### Positive

- `LIMITED` 从模糊 WARNING 变为可审计的车辆/路面/天气联合判断
- 铺装 ↔ 碎石切换、F-road、涉水成为一等公民，而非隐含在速度 stub 里
- Repair 候选可区分「换路」vs「换车建议」vs「取消高地段」
- 与 ADR-006 fail-closed 语义一致

### Negative / Trade-offs

- 需要维护 `RoadSegmentProfile` catalog（静态 SSOT 成本）
- Gagnaveita `condition` 细粒度映射不完整时，部分场景仍为 `UNKNOWN`
- 驾驶者能力字段初期稀疏——T1 以车辆匹配为主，driver 维度渐进

### Non-goals (本 ADR)

- 实时 DEM / 河流水位遥测
- 替代 Vedur 天气链
- 新建 PM2 collector 进程
- 在 Soak 期间修改 Production Runtime 全局开关

---

## References

- [ICELAND-ROAD-SOURCE-AUTHORITY-2026-07-11.md](../operations/ICELAND-ROAD-SOURCE-AUTHORITY-2026-07-11.md)
- [SLICE-2-ICELAND-ROAD-CLOSE-CANARY-ACCEPTANCE.md](../operations/SLICE-2-ICELAND-ROAD-CLOSE-CANARY-ACCEPTANCE.md)
- [ADR-006 Unified Decision Runtime](../../src/decision-runtime/constraints/ADR-006-Unified-Decision-Runtime.md)
- `src/travel-ontology/contracts/core-entities.types.ts` — `RouteSegment`
- `src/trips/guardian-decision-core/adapters/abu-road-constraint.adapter.ts`
- `src/trips/guardian-decision-core/evidence/gagnaveita-faerd.mapper.ts`
- `data/destination-packs/is/repair/is-road-repair-templates.json`
- Pre-Signoff evidence: `internal-docs/operations/evidence/prod-canary-road-pre-signoff-abc-2026-07-10.json`

---

## Change Control

修改五维 contract、`LIMITED` gate 表、或 F208 reference profile 须：

1. 更新本 ADR effective date
2. `assessRoadTraversability` spec 全绿
3. 至少重跑 RT-F208-001（2WD + LIMITED）与 RT-F208-004（CLOSED）replay
4. 不得将 Traversability engineering PASS 等同于 Road Production Canary GO
