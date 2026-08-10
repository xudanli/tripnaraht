# ADR-SELF-DRIVE-KERNEL — 通用自驾内核架构冻结

## Status

**Accepted**（2026-08-10）— 架构原则冻结；实施分期见 §9。  
**K1 ✅** `buildSelfDriveContext` + Pack capabilities + 经典线→critical segments。  
**K2 ✅** `RoadStatusEvidence` 归一（CN 季节窗 → `freshness=PARTIAL`）；`context.roadEvidence`。  
**K3 ✅** `runSelfDriveEngines`（Fit / Executability / Load / Monitor / Recovery）。  
**K4 ✅** overview-dashboard 影子字段 `advisories` + `selfDriveKernel`。  
**K5 ✅** `GET /trips/:tripId/self-drive/*` 产品门面（见 `SELF_DRIVE_API.md`）。  
**不**要求一次性推翻现有 CN / IS HTTP 面；既有接口逐步下沉为 Pack / Adapter 输入。

## Context

当前产品事实是两套能力并行生长：

| 面 | 代表入口 | 问题 |
|----|----------|------|
| 冰岛自驾 | `/iceland-self-drive/**`、`iceland-self-drive-situation`、Gagnaveita / road.is、DEM、F-road | 深度足够，但逻辑粘在国家 BFF |
| 中国 G318 | `/countries/CN/classic-self-drive-routes`、`driving-context`、`ChinaRoadStatusAdapter`（季节窗） | 仍停在「经典线 + 顾问」，缺路段级 World State |
| 行中投影 | `overview-dashboard` / `daily-drive` / `in-trip-home` | 契约偏通用，装配层偏 IS；CN 语义未灌入 |

已有可复用基座（**禁止另起炉灶**）：

- TEP：`SelfDriveProfile` / `DailyDrivePlan` / `ExecutabilityAssessment`（`src/trips/tep/contracts/tep-self-drive.types.ts`）
- Destination Pack：`DestinationPackManifest` + `data/destination-packs/{is,cn,nz}/`
- Road segment 静态：`RoadSegmentProfile`（`decision-runtime/packs/road/road-segment-profile.types.ts`）
- Evidence：`EvidenceEnvelope`、`RoadStatusAdapter`、Gagnaveita collectors
- Traversability / Abu：`ADR-ROAD-TRAVERSABILITY-MODEL.md`、Guardian assessors
- Mobile Projection：overview-dashboard 等（展示就绪、安静原则）

目标**不是**「把冰岛能力复制到中国」，而是：

> 把冰岛验证出来的自驾能力，抽象成 **Self-Drive Kernel**；  
> 冰岛、中国、新西兰只是不同的 **Destination Pack** 与 **Evidence Provider**。

---

## Decision

### 冻结原则（一句）

```
Self-Drive Kernel owns the decision logic.
Destination Pack owns local knowledge.
Evidence Adapter owns reality.
Projection owns user experience.
```

国家差异只提供：**规则、数据、证据、语义**；**不得**重新定义一套自驾逻辑或产品层专用决策 API。

### 四层职责

```
                    Self-Drive Runtime
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
     Route Model       Driver Model      Vehicle Model
         │                 │                 │
         └─────────────────┼─────────────────┘
                           ↓
                  Road Segment Graph
                           ↓
                 Destination Pack          ← 静态 / 半静态知识
                           +
                 Live Evidence Adapters    ← 实时 / 准实时事实
                           ↓
                     World State
                           ↓
                  Self-Drive Engines
         ┌───────────────┼────────────────┐
         │               │                │
   Vehicle Fit      Executability     Driving Load
         │               │                │
         └───────────────┼────────────────┘
                         ↓
                  Decision Runtime
           ALLOW / NEED_CONFIRM / SUGGEST_REPLACE / BLOCK
                         ↓
                    Adjustment
                         ↓
                   Mobile Projection
```

| 层 | 拥有 | 禁止 |
|----|------|------|
| **Kernel** | 通用问题与裁决（能不能走、车合不合适、负荷、监控、恢复） | `if (country === 'IS')` 决策分支 |
| **Destination Pack** | capabilities 声明 + 规则/路段 profile/合规/补给语义 | 暴露为国家专用产品决策接口 |
| **Evidence Adapter** | `*Evidence`（status / observedAt / validUntil / confidence / freshness） | 把 provider 响应形状直接当产品 API |
| **Projection** | 结论 + 文案 + CTA（国家无关枚举） | 前端渲染 `ChinaAltitudeRisk` / `IcelandWindRisk` 专用字段 |

---

## 1. SelfDriveContext（统一上下文，非国家 Context）

**禁止：** `IcelandContext` / `ChinaContext` / `NewZealandContext` 作为决策输入顶层类型。

**采用：** 行程级聚合上下文（新建类型，**内嵌复用** TEP Profile / metadata，不替换 TEP）：

```ts
interface SelfDriveContext {
  schemaId: 'tripnara.self_drive_context@v1'
  tripId: string
  localDate: string
  timezone: string
  destinationPackId: string          // e.g. dest.cn / dest.is
  capabilities: DestinationSelfDriveCapabilities

  route: RouteUnderstandingSnapshot  // corridor + critical segments
  roadConditions: RoadConditionSlice // from Evidence，非 Pack 静态
  vehicle: VehicleProfile            // TEP
  driver: DriverProfile[]            // TEP
  environment: EnvironmentSlice      // weather / daylight / altitude…
  regulations: RegulationSlice       // permit / toll / ferry / checkpoint / limit
  tripExecution: TripExecutionSlice  // lifecycle / now / planReality
  resources: ResourceSlice           // fuel / charging / shelter / recovery
  evidence: EvidenceRef[]            // TEP EvidenceRef / Envelope 指针
}
```

映射既有碎片：

| 字段 | 既有来源（下沉，不并行定义第二套） |
|------|-----------------------------------|
| vehicle / driver | TEP `SelfDriveProfile` |
| route（经典线） | CN `classicRouteId` / IS route templates → **segments** |
| regulations | CN `drivingContext`、IS rental / F-road policy |
| roadConditions | `RoadStatusAdapter` + collectors → Envelope |
| tripExecution | overview-dashboard `now` / `selfDrive.lifecycle` / drive-session |

---

## 2. 统一道路单位：RoadSegmentProfile + Live Evidence

产品与决策的原子单位是 **路段**，不是「整条经典线」。

经典线（G318 / Ring Road）只是 **Corridor 编排与 seed**，必须分解为：

```
Itinerary / GPS → Route → Road Segments → Corridor → Critical Segments
```

### 2.1 静态 Profile（Pack 拥有）

以现有 `RoadSegmentProfile` 为 SSOT 基线，**扩展而非分叉**：

```ts
// 目标扩展（向后兼容现有 is-road-segment-profiles.json）
interface RoadSegmentProfileV2 extends /* 现有字段 */ {
  geometry?: { from: GeoPoint; to: GeoPoint; polyline?: string }
  access?: {
    status: 'OPEN' | 'RESTRICTED' | 'DIFFICULT' | 'CLOSED' | 'UNKNOWN'
    seasonal?: boolean
  }
  vehicleConstraints?: VehicleConstraint[]
  hazards?: RoadHazard[]           // altitude pass / ford / wind / landslide…
  regulations?: RoadRegulation[]   // checkpoint / permit / toll…
  facilities?: {
    fuel?: boolean
    shelter?: boolean
    repair?: boolean
    emergency?: boolean
  }
  evidence?: EvidenceRef[]         // 静态知识出处
}
```

语义对齐：

| 现象 | 都是 |
|------|------|
| 冰岛 F-road | `RoadSegmentProfile` + vehicleConstraints |
| 中国 G318 垭口 | 同左 + altitude / seasonal access |
| 新西兰碎石山路 | 同左 + gravel / one-lane |
| 美国冬季山口 | 同左 + seasonal CLOSED |

### 2.2 动态证据（Adapter 拥有）

Kernel **只读**统一信封（复用 `EvidenceEnvelope` / TEP `EvidenceRef`）：

```ts
interface RoadStatusEvidence {
  segmentId: string
  status: 'OPEN' | 'RESTRICTED' | 'DIFFICULT' | 'CLOSED' | 'UNKNOWN'
  observedAt: string
  validUntil?: string
  source: string
  confidence?: number
  freshness?: string
}
```

Provider 按国家绑定，接口形状不变：

```
RoadStatusProvider
├── Iceland (road.is / Gagnaveita)
├── China (traffic / map / seasonal fallback)
├── NZTA
└── …
```

`ChinaRoadStatusAdapter` 今日的季节窗输出 = **低 freshness 的 Evidence**，不是「中国专用产品结论」。

---

## 3. Destination Pack：提供知识，不提供功能

### 3.1 Capabilities 声明（Resolver 读取）

```ts
interface DestinationSelfDriveCapabilities {
  countryCode: string
  road_status: 'NONE' | 'PARTIAL' | 'SUPPORTED' | 'PROVIDER_DEPENDENT'
  vehicle_road_fit: 'NONE' | 'PARTIAL' | 'SUPPORTED'
  altitude_risk: 'NONE' | 'PARTIAL' | 'SUPPORTED'
  restricted_area: 'NONE' | 'PARTIAL' | 'SUPPORTED'
  seasonal_window: 'NONE' | 'PARTIAL' | 'SUPPORTED'
  ferry: 'NONE' | 'PARTIAL' | 'SUPPORTED'
  toll: 'NONE' | 'PARTIAL' | 'SUPPORTED'
  live_traffic: 'NONE' | 'PARTIAL' | 'SUPPORTED' | 'PROVIDER_DEPENDENT'
  // …按需扩展，禁止按国家加布尔业务分支到 Kernel
}
```

示例：

| Capability | IS | CN（当前） | 目标 |
|------------|----|------------|------|
| road_status | SUPPORTED（live） | PARTIAL（季节窗） | PROVIDER_DEPENDENT |
| altitude_risk | PARTIAL（DEM） | SUPPORTED（知识） | SUPPORTED + evidence |
| ferry | SUPPORTED | NONE | — |
| restricted_area | PARTIAL | SUPPORTED（涉藏/限行） | evidence 化 |
| live_traffic | PROVIDER_DEPENDENT | NONE | 接入后升格 |

### 3.2 Pack 内容形态

```
ChinaSelfDrivePack          IcelandSelfDrivePack
├── road semantics          ├── F-road / ford
├── altitude rules          ├── wind exposure
├── seasonal windows        ├── road.is bindings
├── plateau risks           ├── vehicle categories
├── restricted / checkpoint ├── winter closures
├── vehicle suitability     └── ferry
├── fuel / charging density
└── emergency / recovery
```

挂载点：`data/destination-packs/{cn,is,nz}/` + `DestinationPackManifest`（含已有 `RoadProfileBundleRef` / `EvidenceProviderBinding`）。

**Country Pack（readiness 阈值）** 与 **Destination Pack（规则/路段/证据绑定）** 双轨并存期间：  
新增自驾知识一律进 Destination Pack；Country Pack 仅保留段距离等 pacing 阈值，直至合并 ADR。

---

## 4. 六个统一 Engine（编排层，非六套国家实现）

| # | Engine | 回答 | 现有落点（编排聚合，勿第三套） |
|---|--------|------|--------------------------------|
| ① | **Route Understanding** | 今天走哪、关键段是谁 | 经典线 skeleton → segment graph；TEP anchors |
| ② | **Vehicle–Road Fit** | 车×路×天气×季节 | `assessVehicleRoadFit` + Traversability；输出统一 `INCOMPATIBLE` 等 |
| ③ | **Route Executability** | 今天能不能执行 | `ExecutabilityAssessment` + Abu gate：`ALLOW` / `NEED_CONFIRM` / `SUGGEST_REPLACE` / `BLOCK` |
| ④ | **Driving Load** | 同样小时数不同负荷 | daylight load + excessive-daily-load + Pack 难度因子（高原/强风/盘山） |
| ⑤ | **Runtime Monitor** | 变化→影响→决策 | collectors → WorldStateAssertion → Guardian → DecisionProblem |
| ⑥ | **Recovery / Replan** | 怎么办 | 统一动作：`DELAY` / `REROUTE` / `SHORTEN` / `DROP_STOP` / `CHANGE_STOP` / `CHANGE_HOTEL` / `STOP_DRIVING`；国家只影响**触发原因** |

Verdict 映射继续服从 TEP 附录与 Abu；**不**为国家新建平行 verdict 枚举。

---

## 5. Projection：国家无关的行中五件套

行中 / 总览只投影：

1. **当前结论**（按计划 / 建议调整 / 勿继续）
2. **下一段驾驶**（起讫、时长、里程、difficulty）
3. **关键因素**（最多 2–3 条 `DriveAdvisory`）
4. **待处理决策**（时间窗 + 建议）
5. **CTA**（导航 / 调整今天 / 问 Nara）

统一 advisory（前端不感知来源国家类型名）：

```ts
interface DriveAdvisory {
  type:
    | 'WEATHER'
    | 'ROAD_ACCESS'
    | 'VEHICLE_FIT'
    | 'ALTITUDE'
    | 'RESTRICTION'
    | 'FERRY'
    | 'CHECKPOINT'
    | 'FUEL'
    | 'FATIGUE'
    | 'OTHER'
  severity: 'INFO' | 'WARNING' | 'BLOCK'
  titleZh: string
  summaryZh: string
  affectedSegmentId?: string
  validWindow?: { fromLocal?: string; toLocal?: string }
  recommendation?: { action: string; detailZh?: string }
}
```

`overview-dashboard.selfDrive` / `daily-drive` / `now`+`exception`+`planReality` **继续作为主投影载体**；本 ADR 要求装配层改为读 `SelfDriveContext` + Engines，去掉 IS 硬编码与 CN 字段断裂。

---

## 6. 产品 API 收口

### 6.1 目标门面（Trip 作用域）

主产品层逐步收敛为：

```
GET /trips/:tripId/self-drive/context
GET /trips/:tripId/self-drive/readiness
GET /trips/:tripId/self-drive/daily-drive
GET /trips/:tripId/self-drive/road-segments
GET /trips/:tripId/self-drive/advisories
GET /trips/:tripId/self-drive/evidence
GET /trips/:tripId/self-drive/alternatives
```

`daily-drive` 示例语义（国家无关）：

```json
{
  "status": "NEED_ATTENTION",
  "drive": {
    "distanceKm": 286,
    "expectedDurationMin": 315,
    "difficulty": "HIGH"
  },
  "criticalSegments": [],
  "advisories": [
    { "type": "WEATHER", "severity": "WARNING" },
    { "type": "ROAD_ACCESS", "severity": "WARNING" }
  ],
  "recommendation": {
    "action": "DEPART_EARLIER",
    "latestDeparture": "13:30"
  }
}
```

Mobile 既有路径可保留为 **薄 BFF**（`/mobile/trips/.../execution/*`），内部必须调用同一 Kernel 投影，禁止再走国家专用装配。

### 6.2 既有国家 API 的命运

| 现有 | 命运 |
|------|------|
| `GET /countries/CN/classic-self-drive-routes` | **Catalog / bootstrap 输入**；非行中决策面；可长期保留为选线 UX |
| `GET /countries/CN/driving-context` | 下沉为 CN Pack 规则摘要 + `SelfDriveContext.regulations` 构建器 |
| `GET /data-contracts/road-status` | Evidence Adapter 出口；产品层改读 `/self-drive/evidence` 或 context 内嵌 |
| `GET .../road-status/by-froads` | IS Provider 细节；经 Adapter 归一后不再作为主产品依赖 |
| `/iceland-self-drive/**`、`iceland-self-drive-situation` | 兼容门面 → 委托 Kernel Projection；新客户端勿新增依赖 |

**原则：** 不推翻；**新产品能力不得**再增加 `/countries/{CC}/decision-*` 或平行自驾逻辑。

---

## 7. 与既有 ADR / 契约的关系

| 文档 | 关系 |
|------|------|
| [TEP Self-Drive Spec](../product/TRAVEL-EXECUTION-PLANNING-SPEC-SELF-DRIVE-v1.0.md) | 产品 Profile 基线；本 ADR 补 Runtime Kernel 与跨市场收口 |
| [TEP Phase 0 Contract](../product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md) | 规则编号 / Verdict 继续有效；Engine ③④⑥ 对齐其类型 |
| [ADR-ROAD Traversability](./ADR-ROAD-TRAVERSABILITY-MODEL.md) | Engine ②③ 的评估内核；五维模型提升为**全市场**默认，不只 IS |
| CN `MATERIALS_G318.md` | 实施清单改为「Pack + Adapter 加深」，不再以专用产品 API 清单为北极星 |

---

## 8. 非目标（本期明确不做）

- 一次性删除全部 `/countries/CN/*` 或 `/iceland-self-drive/*`
- 为每个国家新建平行 Engine 实现
- 前端按国家渲染专用风险组件树
- 用经典线路 ID 替代 `segmentId` 做可执行性裁决
- 在 overview-dashboard 再开一套「中国字段」而不走 `DriveAdvisory`

---

## 9. 分期落地

| 阶段 | 交付 | Done 定义 |
|------|------|-----------|
| **K0 · Freeze** | 本 ADR；类型草图 `self-drive-context.types.ts`（可先 docs-only） | 评审接受；新 PR 不得新增国家专用决策 API |
| **K1 · Context + Segments** | `SelfDriveContext` 构建器；CN/IS 经典线 → critical segments；CN Pack capabilities 声明 | ✅ CN trip 与 IS trip 同构 context shape（`src/trips/self-drive-kernel/**/*.spec.ts`） |
| **K2 · Evidence 归一** | `RoadStatusAdapter` 输出统一 `RoadStatusEvidence`；CN 季节窗标 `PARTIAL` freshness | ✅ `normalizeRoadStatusEvidence` + `context.roadEvidence` |
| **K3 · Engines 编排** | 六个 Engine 门面服务（内部委托现有 assessor）；Executability + Driving Load 参数化进 Pack | ✅ `runSelfDriveEngines`；CN 垭口 / IS F-road 同构 verdict |
| **K4 · Projection** | overview / daily-drive 装配改读 Kernel；`DriveAdvisory[]`；去掉 IS 硬编码主路径 | ✅ overview shadow；K5 `self-drive/daily-drive` |
| **K5 · Product façade** | `/trips/:id/self-drive/*`；旧 BFF 委托 | ✅ 七个 GET；文档 `src/trips/self-drive-kernel/SELF_DRIVE_API.md` |

---

## 10. 验收黄金句

1. **新增国家** = Destination Pack + Evidence Adapter(s) + Certification；**不是**新国家自驾服务模块。  
2. **同一 Kernel** 对 IS 强风关闭与 CN 雨季塌方风险给出同构 `DriveAdvisory` + Executability verdict。  
3. **行中首屏**不出现国家专用字段名；只出现结论、下一段、advisories、决策、CTA。  
4. **经典线 API** 仍可用于选线，但**不得**作为「能不能走」的权威答案——权威在 segment × evidence × engines。

---

## Consequences

**正向**

- 中国侧缺口从「缺接口」转为可排期的 Pack/Evidence 深度问题
- 冰岛深度实现可沉淀为 Kernel + IS Pack，而不是永久 BFF
- Mobile / overview-dashboard 投资可跨市场复用

**代价**

- 短期双轨：旧国家 API + 新 façade
- `RoadSegmentProfile` 需版本化扩展；IS JSON 与 CN 路段种子要补齐
- Country Pack vs Destination Pack 命名需后续合并 ADR

**风险缓解**

- K0–K1 只加编排与类型，不改 Abu / Gagnaveita 生产触发
- 投影层先 shadow 字段（`advisories`）再切主路径
- CN live traffic 未就绪时 capabilities=`PARTIAL`，Kernel 必须可降级（与 TEP `UNKNOWN` / degraded evidence 一致）
