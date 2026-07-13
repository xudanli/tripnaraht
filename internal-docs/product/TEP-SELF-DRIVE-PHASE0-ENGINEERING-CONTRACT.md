# TEP Self-Drive — Phase 0 Engineering Contract

**父文档：** [TRAVEL-EXECUTION-PLANNING-SPEC-SELF-DRIVE-v1.0.md](./TRAVEL-EXECUTION-PLANNING-SPEC-SELF-DRIVE-v1.0.md)  
**状态：** Phase 0 **Functional Complete** · Production Hardening · **v0.3.1**  
**版本：** 0.3.1 · **2026-07-13**  
**状态总览：** [TEP-PHASE0-STATUS.md](./TEP-PHASE0-STATUS.md)  
**交叉契约：** [CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md](./CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md) · 前端联调 [TEP-CONSTRAINT-CONSOLE-ASSESSMENT-INTEGRATION.md](../frontend/TEP-CONSTRAINT-CONSOLE-ASSESSMENT-INTEGRATION.md)

**变更摘要（0.3.0 → 0.3.1）：**

- **P0** `preview-impact`：空 `planning-conflicts` / `dailyDrivePlans` / `items` 不再 500；双数据源（conflicts anchors → TEP SDR-202 + `dailyDrivePlans`）降级 `summary_only`
- **P0** NO_NIGHT **draft 重算**：`changes[].patch.maxMinutesAfterSunset` 经 `reprojectSdr202ForDraftBuffer` 重算 `cutoffLocal` / `+Nmin` / `verdictReason`（禁止复用持久化 assessment 快照文案）
- **P1** `constraint-assessments` SDR-202 structured evidence：`sunsetLocal` / `cutoffLocal` / `arriveLocal` / `segmentLabel` / `maxMinutesAfterSunset`（`tep-rule-result-to-assessment.adapter` + `dailyDrivePlans`）
- 冰岛 PILOT `5945a3ab-75d2-4911-ae82-9647c8c29e96` 联调验收写入 §2.1.1

**变更摘要（0.2.0 → 0.3.0）：**

- Phase 0 状态升级为 **Functional Complete → Production Hardening**
- 新增 [TEP-PHASE0-STATUS.md](./TEP-PHASE0-STATUS.md) 为状态 SSOT
- 新增 [TEP-PHASE0-CONTRACT-FREEZE.md](./TEP-PHASE0-CONTRACT-FREEZE.md) WP-TEP-16 签字草案
- §11 重写：WP-TEP-13～16、IS-CERT-401～405、TEP/Canonical 去重键
- WP-TEP-10～12 标记已实现；写回边界（REMOVE only）冻结

**变更摘要（0.1.0 → 0.2.0）：**

- 新增附录 A–E（Verdict 映射、DailyDrivePlan 投影、Hook↔Problem、Profile Resolver、用户态映射）
- 钉死 SDR-101 / IS-CERT-101 判定（消除「或」）
- 补充 `EvidenceRef` 最小契约
- Phase 0 检查清单补充 Owner 与完成定义

本文档将 Product Foundation **契约化、规则编号化、状态统一化、验收案例化**，供后端 / 规划工作台 / Decision Runtime 实施。

---

## 1. 核心对象契约

**Schema 命名空间：** `tripnara/tep_self_drive@v1`

### 1.0.1 约束预览联调验收（冰岛 PILOT · 2026-07-13）

**TripId：** `5945a3ab-75d2-4911-ae82-9647c8c29e96` · Day1 长驾 + 不夜驾

| 场景 | 请求 | 期望 |
|------|------|------|
| NO_NIGHT draft | `preview-impact` · `maxMinutesAfterSunset: 45` · `persist: false` | HTTP 200 · `verdictReason` 含 `23:49` · `+45 分钟` · `+64min` · `userFacingSummary` 人话 |
| MAX_DAILY_DRIVE | `preview-impact` · `c_max_daily_drive` | HTTP 200（共用 schedule 链路不 500） |
| 持久化 assessment | `GET constraint-assessments` | SDR-202 evidence 全 structured 字段 |
| 缺 anchors | 无 conflicts 路段标签 | TEP `dailyDrivePlans` 兜底；仍无则 `day_summary` + reason |

**代码落点：** `constraint-impact-*` · `trip-constraint-registry.previewImpact` · `sdr-202-rule-metadata.util.ts` · `tep-rule-result-to-assessment.adapter.ts`

### 1.1 SelfDriveProfile

```typescript
interface SelfDriveProfile {
  vehicle: VehicleProfile;
  drivers: DriverProfile[];
  drivingPolicy: DrivingPolicy;
  rentalRestrictions?: RentalRestriction[];
}

interface VehicleProfile {
  vehicleType: '2WD' | '4WD' | 'AWD' | 'CAMPERVAN' | 'OTHER';
  drivetrain?: string;
  fuelType?: 'PETROL' | 'DIESEL' | 'EV' | 'HYBRID';
  transmission?: 'MANUAL' | 'AUTOMATIC';
  dimensions?: { heightM?: number; weightKg?: number };
}

interface DriverProfile {
  driverId: string;
  experienceLevel: 'NOVICE_ABROAD' | 'INTERMEDIATE' | 'EXPERIENCED';
  maxContinuousDriveMinutes?: number;
}

interface DrivingPolicy {
  maxDailyDriveMinutes?: number;
  nightDrivingAllowed: boolean;
  nightDrivingPreference: 'AVOID' | 'ALLOW_WITH_CAUTION' | 'ALLOW';
  maxConsecutiveHighLoadDays?: number;
}

interface RentalRestriction {
  code: string;
  description: string;
  source: 'RENTAL_CONTRACT' | 'PACK_DEFAULT' | 'USER_DECLARED';
}
```

**真源（P0）：** Exploration `mobilityContext.vehicleType`、Guide `vehicleType`、Trip `pacingConfig` / metadata。

---

### 1.2 DailyDrivePlan

```typescript
interface DailyDrivePlan {
  date: string;                          // ISO date
  dayIndex: number;
  origin: RouteAnchor;
  destination: RouteAnchor;
  legs: DriveLeg[];
  accommodation?: AccommodationAnchor;
  activities: PlannedActivity[];
  buffers: PlanningBuffer[];
  pois: PlannedPoi[];                    // 填充项，不驱动骨架
}

interface DriveLeg {
  legId: string;
  fromRef: string;
  toRef: string;
  baseNavigationMinutes: number;
  adjustedMinutes?: number;
  roadRefs: string[];
  importance: PlanImportance;
  flexibility: PlanFlexibility;
}

interface RouteAnchor {
  ref: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  label: string;
}

interface AccommodationAnchor {
  ref: string;
  checkInFrom?: string;                  // ISO local time
  latestArrival?: string;
  parkingRequired?: boolean;
  cancellationPolicyRef?: string;
}

interface PlannedActivity {
  ref: string;
  importance: PlanImportance;
  flexibility: PlanFlexibility;
  weatherSensitive: boolean;
  reservationRequired: boolean;
  durationMinutes: number;
  bufferMinutes: number;
  fixedStartAt?: string;                 // 有预约时必填
}

interface PlanningBuffer {
  ref: string;
  kind: 'TRANSIT' | 'REST' | 'FUEL' | 'FLEX';
  minutes: number;
}

type PlanImportance = 'MANDATORY' | 'RECOMMENDED' | 'OPTIONAL';
type PlanFlexibility = 'FIXED' | 'MOVABLE' | 'REPLACEABLE' | 'REMOVABLE';
```

---

### 1.3 ExecutabilityAssessment

```typescript
interface ExecutabilityAssessment {
  schemaId: 'tripnara/executability_assessment@v1';
  status: ExecutabilityStatus;
  findings: ValidationFinding[];
  ruleResults: PlanningRuleResult[];
  score?: number;                        // 0–100，可选
  evidenceRefs: EvidenceRef[];
  evaluatedAt: string;
  planVersionRef?: string;
  packId: string;
  packVersion: string;
}

type ExecutabilityStatus =
  | 'EXECUTABLE'
  | 'EXECUTABLE_WITH_CAUTION'
  | 'REQUIRES_CONFIRMATION'
  | 'REQUIRES_REPAIR'
  | 'NOT_EXECUTABLE'
  | 'UNKNOWN';

interface ValidationFinding {
  findingId: string;
  ruleId: string;
  outcome: RuleOutcome;
  severity: RuleSeverity;
  message: string;
  affectedRefs: string[];
}

interface PlanningRuleResult {
  ruleId: string;
  outcome: RuleOutcome;
  severity: RuleSeverity;
  affectedRefs: string[];
  explanation: string;
  evidenceRefs: EvidenceRef[];
  suggestedActions?: SuggestedAction[];
  degraded?: boolean;                      // 数据不足降级时为 true
  degradationReason?: string;
}

type RuleOutcome =
  | 'PASS'
  | 'CAUTION'
  | 'NEED_CONFIRM'
  | 'SUGGEST_REPAIR'
  | 'REJECT'
  | 'UNKNOWN';

type RuleSeverity =
  | 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** 与 guardian `WorldStateAssertion` 对齐的最小证据引用 */
interface EvidenceRef {
  assertionId?: string;
  provider: string;
  sourceType: 'OFFICIAL' | 'PARTNER' | 'USER' | 'MODEL' | 'INTERNAL';
  observedAt: string;
  validUntil?: string;
  subjectRef?: string;
  predicate?: string;
  confidence?: number;
  degraded?: boolean;
}
```

**真源类型：** `src/trips/guardian-decision-core/contracts/world-state.types.ts` — TEP 层使用上表子集，完整断言图仍在 Evidence Resolver。

---

### 1.4 RecoveryGraph

```typescript
interface RecoveryGraph {
  schemaId: 'tripnara/recovery_graph@v1';
  removableNodes: string[];
  replaceableNodes: string[];
  movableNodes: string[];
  protectedNodes: string[];
  dependencies: PlanDependency[];
  fallbackOptions: RecoveryOption[];
}

interface PlanDependency {
  fromRef: string;
  toRef: string;
  kind: 'TEMPORAL' | 'ROUTING' | 'ACCOMMODATION' | 'RESERVATION';
  description?: string;
}

interface RecoveryOption {
  optionId: string;
  triggerRuleId?: string;
  action: 'REMOVE' | 'REPLACE' | 'SHIFT' | 'REROUTE';
  targetRefs: string[];
  description: string;
  preconditions?: string[];
}
```

---

### 1.5 DecisionHook

```typescript
interface DecisionHook {
  hookId: string;
  targetRef: string;
  triggerType: TriggerType;
  triggerCondition: TriggerCondition;
  leadTime: string;                      // ISO 8601 duration, e.g. PT24H
  impactScope: string[];
  defaultPolicy: DecisionPolicy;
  evidenceRequirement?: string;
}

type TriggerType =
  | 'WEATHER_THRESHOLD'
  | 'ROAD_STATUS_CHANGE'
  | 'EXECUTION_SLIP'
  | 'RESERVATION_DEADLINE'
  | 'SUPPLY_THRESHOLD';

interface TriggerCondition {
  metric: string;
  operator: '>' | '>=' | '<' | '<=' | '==' | 'IN';
  value: number | string | string[];
  unit?: string;
}

type DecisionPolicy =
  | 'AUTO_SUGGEST_REPAIR'
  | 'REQUIRE_USER_CONFIRMATION'
  | 'BLOCK_UNTIL_RESOLVED';
```

**示例：**

```json
{
  "hookId": "HOOK-GLACIER-WIND-001",
  "targetRef": "activity_glacier_hike_day3",
  "triggerType": "WEATHER_THRESHOLD",
  "triggerCondition": {
    "metric": "windSpeed",
    "operator": ">=",
    "value": 18,
    "unit": "m/s"
  },
  "leadTime": "PT24H",
  "impactScope": [
    "activity_glacier_hike_day3",
    "drive_leg_day3_02",
    "accommodation_day3"
  ],
  "defaultPolicy": "REQUIRE_USER_CONFIRMATION"
}
```

---

## 2. P0 规则规格（12 条）

### 裁决权总则

| 冲突类型 | 最终裁决方 | 说明 |
|----------|------------|------|
| 同一 `affectedRef` 多条规则 | **Rule Aggregator** | 取最严 `outcome`：`REJECT` > `SUGGEST_REPAIR` > `NEED_CONFIRM` > `CAUTION` > `PASS` > `UNKNOWN` |
| 同 outcome 不同 severity | Rule Aggregator | 取最高 `severity` |
| `REJECT` vs 用户显式确认覆盖 | **User Confirmation Gate** | 仅当 Pack 标记 `overridable: true` 且用户 signed confirm |
| 规划期 vs 行中监测 | **Phase Split** | 规划期：TEP Validator；行中：Decision Runtime（可升级 status） |
| 证据源冲突 | **Evidence Authority Table** | Pack 内 `evidenceProviders.primary` 优先于 fallback |

---

### SDR-001 车辆道路准入

| 项 | 说明 |
|----|------|
| **输入** | `SelfDriveProfile.vehicle`；`DailyDrivePlan.legs[].roadRefs`；Pack `roadProfile`（路面类型、准入车型） |
| **判定** | ∃ leg：车辆类型 ∉ 道路 `allowedVehicles` → `REJECT` |
| **输出** | `outcome: REJECT`，`severity: CRITICAL`，`affectedRefs: [legId, roadRef]` |
| **数据不足** | 道路无 profile → `UNKNOWN` + `degraded: true`；**不** 默认 PASS |
| **冰岛** | 2WD × F-road（官方仅 4WD）→ REJECT；映射 `IS_ROAD_*` + `terrain-vehicle-compatibility` |

---

### SDR-002 道路关闭

| 项 | 说明 |
|----|------|
| **输入** | `roadRefs`；计划日期；`EvidenceRef`（Road.is / Gagnaveita）`status` + `validFor` |
| **判定** | 执行窗口内 `status === CLOSED` → `REJECT` |
| **输出** | `REJECT` / `CRITICAL` |
| **数据不足** | 证据 `expiresAt` 已过 → `UNKNOWN` / `HIGH`；禁止静默 PASS |
| **冰岛** | 已有 `IS_ROAD_CLOSED_BLOCK` → 映射本规则 |

---

### SDR-003 租车合同限制

| 项 | 说明 |
|----|------|
| **输入** | `rentalRestrictions[]`；路线 `{country, roadClass, gravelRatio}` |
| **判定** | 明确禁止（如 gravel > 合同阈值）→ `REJECT`；模糊条款 → `NEED_CONFIRM` |
| **输出** | `REJECT/CRITICAL` 或 `NEED_CONFIRM/MEDIUM` |
| **数据不足** | 无合同数据 → 跳过（PASS），Pack 默认限制仍生效 |

---

### SDR-101 单日驾驶负荷

| 项 | 说明 |
|----|------|
| **输入** | `Drive Load Score`（§3）；`DrivingPolicy.maxDailyDriveMinutes` |
| **判定** | LOW → `PASS`；MEDIUM → `CAUTION`；HIGH → `SUGGEST_REPAIR` / `HIGH`；**EXTREME → `NEED_CONFIRM` / `HIGH`**（钉死，无「或」） |
| **输出** | 附带 `driveLoadTier: LOW\|MEDIUM\|HIGH\|EXTREME` 于 `explanation` |
| **数据不足** | 无导航基线 → 用 Pack 默认速度估算 + `degraded: true` |

---

### SDR-102 连续驾驶限制

| 项 | 说明 |
|----|------|
| **输入** | 日内 `DriveLeg` 序列；`DriverProfile.maxContinuousDriveMinutes`；休息 `PlanningBuffer` |
| **判定** | 连续驾驶 > 阈值且无 REST 缓冲 → `SUGGEST_REPAIR` |
| **输出** | `severity: HIGH`；建议插入休息或拆分 leg |

---

### SDR-103 连续多日疲劳

| 项 | 说明 |
|----|------|
| **输入** | 多日 `driveLoadTier`；`maxConsecutiveHighLoadDays` |
| **判定** | 连续 N 天 HIGH+ → `CAUTION`；超过政策 → `SUGGEST_REPAIR` |
| **输出** | `affectedRefs: [dayIndex...]` |

---

### SDR-201 住宿最晚抵达

| 项 | 说明 |
|----|------|
| **输入** | `AccommodationAnchor.latestArrival`；末 leg 预计抵达 |
| **判定** | 晚到 ≤ 缓冲（Pack 配置，默认 20min）→ `NEED_CONFIRM`；超出 → `REJECT` |
| **数据不足** | 无 `latestArrival` → `CAUTION`（仅提醒确认） |

---

### SDR-202 安全日照窗口（不夜驾）

| 项 | 说明 |
|----|------|
| **Capability** | `NO_NIGHT_DRIVE` · legacy `c_no_night_drive` |
| **输入** | leg 级 `finishLocal`（预计结束本地时刻）；`daylight.sunset:HH:mm`（`daylight-fact.provider`；冰岛夏季 civil dusk 缺失时 **sunset fallback**）；`maxMinutesAfterSunset`（用户 buffer，常见 30/45） |
| **判定** | `finishLocal` 晚于 `sunset + maxMinutesAfterSunset` → `SUGGEST_REPAIR` / `REJECT`；跨午夜：`arrive < 06:00` 且 evening cutoff 视为次日超时（`computeMinutesOverCutoff`） |
| **文案 SSOT** | `src/trips/tep/utils/sdr-202-rule-metadata.util.ts` ↔ 前端同名模块：`预计 {arrive} 结束，超出安全截止 {cutoff}（日落 {sunset} + {buffer} 分钟，+{over}min）` |
| **数据不足** | 极昼/极夜或日照不可用 → `degraded: true` · `degradationReason: DAYLIGHT_DATA_AMBIGUOUS`；**禁止伪造** sunset/cutoff |

**BFF 读模型：**

| API | TEP 角色 |
|-----|----------|
| `GET …/constraint-assessments` | executability lane · `measuredValue` → evidence 全字段 |
| `POST …/constraints/preview-impact` | **what-if**：必须用 **draft** buffer 重算，不得粘贴已持久化 TEP `explanation` |

---

### SDR-203 固定活动可达性

| 项 | 说明 |
|----|------|
| **输入** | `fixedStartAt`；前序 leg `adjustedMinutes`；缓冲 |
| **判定** | 预计到达 > `fixedStartAt - grace` → `REJECT`（数学不可行） |
| **输出** | `CRITICAL` |

---

### SDR-301 每日弹性节点

| 项 | 说明 |
|----|------|
| **输入** | 当日节点 Importance/Flexibility；`driveLoadTier` |
| **判定** | HIGH+ 负荷日且无 `REMOVABLE|MOVABLE` 节点 → `CAUTION` |
| **输出** | 建议标记弹性节点 |

---

### SDR-302 天气敏感活动替代

| 项 | 说明 |
|----|------|
| **输入** | `weatherSensitive` 活动；`RecoveryGraph.fallbackOptions` |
| **判定** | 敏感活动无 fallback → `CAUTION` |
| **输出** | 规划期提示；并应生成 `DecisionHook` |

---

### SDR-303 关键节点依赖

| 项 | 说明 |
|----|------|
| **输入** | `PlanDependency[]` |
| **判定** | 不阻断；为每个可编辑节点生成依赖影响摘要 |
| **输出** | `PASS` + 写入 `RecoveryGraph.dependencies` |

---

## 3. Driving Load P0 因子表（Pack 可配置）

**路径建议：** `data/destination-packs/{cc}/modifiers/{cc}-driving-load.json`

| 因子 | P0 默认值 |
|------|-----------|
| 普通铺装 | ×1.00 |
| 狭窄/山路 | ×1.15 |
| 碎石路 | ×1.20 |
| 中等恶劣天气 | ×1.15 |
| 高影响天气 | ×1.30 |
| 房车/大型车 | ×1.10 |
| 新手海外驾驶 | +30 min 等效 |
| 夜间驾驶 | +20% 等效 |
| 每次计划停靠 | +10–20 min |

**分级阈值（等效分钟）：** LOW 0–180 · MEDIUM 181–300 · HIGH 301–420 · EXTREME >420

---

## 4. ExecutabilityStatus 聚合规则

| 条件 | Status |
|------|--------|
| 任一 `REJECT` | `NOT_EXECUTABLE` |
| 任一 `UNKNOWN` 且 severity ≥ HIGH，且无 REJECT | `UNKNOWN` |
| 任一 `SUGGEST_REPAIR` | `REQUIRES_REPAIR` |
| 任一 `NEED_CONFIRM`（无 REJECT/REPAIR） | `REQUIRES_CONFIRMATION` |
| 仅有 `CAUTION` | `EXECUTABLE_WITH_CAUTION` |
| 全部 `PASS` | `EXECUTABLE` |

**Outcome × Severity 示例：**

| 情况 | Outcome | Severity |
|------|---------|----------|
| 单日驾驶略长 | CAUTION | MEDIUM |
| 住宿预计晚到 20min | NEED_CONFIRM | MEDIUM |
| 删一景点可恢复 | SUGGEST_REPAIR | HIGH |
| 2WD 进明确限制路 | REJECT | CRITICAL |
| 道路数据过期 | UNKNOWN | HIGH |

---

## 5. 数据不足降级策略（总则）

| 数据类型 | 降级行为 |
|----------|----------|
| 道路状态缺失/过期 | `UNKNOWN`；触发刷新证据；禁止 Executable |
| 天气缺失 | 使用 Pack 季节默认 + `degraded`；敏感活动 → `CAUTION` |
| 导航时长缺失 | Haversine × Pack 默认速度 + `degraded` |
| 日照缺失 | 纬度默认表 + `degraded` |
| 租车合同缺失 | 跳过 SDR-003；Pack 默认限制仍执行 |
| 住宿最晚抵达缺失 | SDR-201 → `CAUTION` |

---

## 6. Planner vs Decision Runtime 边界（实施检查表）

| 能力 | Planner (TEP) | Decision Runtime |
|------|---------------|------------------|
| 生成 DailyDrivePlan | ✅ | ❌ |
| 运行 SDR 规则（规划快照） | ✅ | ✅（行中再评估） |
| 产出 ExecutabilityAssessment | ✅ | ✅（写回后复检） |
| 预埋 DecisionHook | ✅ | 消费 |
| 监测天气/道路变化 | ❌ | ✅ |
| 生成 Decision Problem | 仅预览 | ✅ |
| Plan Version 写回 | 用户 commit 时 | 用户确认 repair 时 |
| LLM 解释文案 | 可选 | 可选；**不得**作为 BLOCK 依据 |

---

## 7. Iceland Pack 接口扩展（Phase 0 清单）

在现有 `data/destination-packs/is/destination.pack.json` 基础上扩展：

| _bundle | 用途 | Phase |
|---------|------|-------|
| `rules/is-road-rules.json` | SDR-001/002 | 已有，映射 RuleOutcome |
| `rules/is-load-rules.json` | SDR-101–103 | 已有，补阈值 JSON |
| `modifiers/is-driving-load.json` | §3 因子 | **新增** |
| `rules/is-daylight-rules.json` | SDR-202 | **新增** |
| `rules/is-accommodation-rules.json` | SDR-201 | **新增** |
| `certification/*.scenarios.json` | §8 验收 | 扩展 |

**Pack 适配器：** `src/decision-runtime/packs/` — 规则执行输出 **必须** 转为 `PlanningRuleResult`，禁止直接返回 `BLOCK`/`WARNING` 字符串。

**双 Pack SSOT（架构约束）：**

- **规则真源：** `data/destination-packs/{cc}/`（decision-runtime Pack）
- **Readiness Pack**（`src/trips/readiness/data/packs/`）只 **消费** 同一 `ruleId` / `semanticKey`，不独立定义 BLOCK 语义
- 新增规则须先写入 destination Pack，再投影到 readiness findings

---

## 8. 验收案例（Iceland Golden Scenarios）

### 8.1 必须 PASS 的阻断案例（→ NOT_EXECUTABLE）

| Case ID | 场景 | 期望 |
|---------|------|------|
| **IS-CERT-001** | 2WD + F208 高地路段 | SDR-001 `REJECT` → `NOT_EXECUTABLE` |
| **IS-CERT-002** | 计划日 F-road 官方 CLOSED | SDR-002 `REJECT` |
| **IS-CERT-003** | 16:00 预约活动，前序 leg 17:00 才能到 | SDR-203 `REJECT` |

### 8.2 必须产生的软处置案例

| Case ID | 场景 | 期望 |
|---------|------|------|
| **IS-CERT-101** | 单日等效负荷 340min | SDR-101 `HIGH` → assessment **`REQUIRES_REPAIR`**（钉死） |
| **IS-CERT-102** | 抵达酒店晚于 latestArrival 15min | SDR-201 `NEED_CONFIRM` |
| **IS-CERT-103** | 道路证据过期 | SDR-002 `UNKNOWN` → `UNKNOWN` assessment |

### 8.3 可恢复性案例

| Case ID | 场景 | 期望 |
|---------|------|------|
| **IS-CERT-201** | HIGH 负荷日仅 MANDATORY+FIXED | SDR-301 `CAUTION` |
| **IS-CERT-202** | 天气敏感冰川徒步无 fallback | SDR-302 `CAUTION` + Hook 存在 |

### 8.4 运行命令（现状）

```bash
# 道路封闭认证（已有 harness）
npm test -- src/trips/guardian-decision-core/e2e/iceland-road-close.harness.spec.ts

# 负荷场景（扩展指向）
# data/destination-packs/is/certification/excessive-daily-load.scenarios.json
```

**Phase 1 完成定义：** 上述 **IS-CERT-001～003、101～103、201～202** 全部自动化且结果稳定。

**Phase 1 自动化落点（已实现）：**

```bash
npm test -- src/trips/tep/certification/is-cert.harness.spec.ts
```

| 模块 | 路径 |
|------|------|
| TEP Validator（SDR 规则） | `src/trips/tep/validation/sdr-rule-evaluators.ts` |
| 评估聚合 | `src/trips/tep/validation/tep-validator.ts` |
| Orchestrator | `src/trips/tep/orchestrators/tep-orchestrator.service.ts` |
| IS-CERT 场景 | `data/destination-packs/is/certification/tep-is-cert.scenarios.json` |
| IS-CERT Harness | `src/trips/tep/certification/is-cert.harness.ts` |

---

## 9. Phase 0 完成检查清单

| # | 交付物 | Owner | 完成定义 |
|---|--------|-------|----------|
| 1 | TypeScript 契约 `src/trips/tep/contracts/` | Backend Core | 类型编译通过；`schemaId` 与本文一致 | 🟡 已起草 |
| 2 | `VerdictMapper`（附录 A） | Backend Core | 单测覆盖 Pack BLOCK/WARNING + feasibility priority | 🟡 已起草 |
| 3 | `SelfDriveProfileResolver`（附录 D） | Backend Core | Exploration/Guide/Trip 三入口归一 golden test | 🟢 已实现 |
| 4 | `DailyDrivePlanProjector`（附录 B） | Backend Core | 从 fixture PlanVersion 投影只读 `DailyDrivePlan` | 🟢 已实现 |
| 5 | `ExecutabilityAssessment` BFF | BFF / Trips | `GET .../executability` 或 validate 响应嵌入 | 🟢 已实现 |
| 6 | Iceland Pack `is-driving-load.json` | Pack / IS | 因子表与 §3 一致 | 🟢 已实现 |
| 7 | Pack rules `ruleId` 前缀 `SDR-*` | Pack / IS | `is-road-rules` 等映射表入库 | 🟢 已实现 |
| 8 | 附录 A–E 评审签字 | Product + Arch + Eng | 父文档 §17 三方签收 | 🟡 待签 |

**代码落点（已起草）：**

| 模块 | 路径 |
|------|------|
| TEP 契约 | `src/trips/tep/contracts/tep-self-drive.types.ts` |
| Verdict 映射 | `src/trips/tep/mappers/verdict.mapper.ts` |
| Profile Resolver | `src/trips/tep/resolvers/self-drive-profile.resolver.ts` |
| DailyDrive 投影 | `src/trips/tep/projectors/daily-drive-plan.projector.ts` |
| UI 投影 | `src/trips/tep/projectors/executability-assessment-ui.projector.ts` |
| Executability BFF | `src/trips/tep/controllers/executability.controller.ts` |
| Driving Load Pack | `data/destination-packs/is/modifiers/is-driving-load.json` |
| SDR 映射表 | `data/destination-packs/is/rules/sdr-rule-mapping.json` |
|  barrel | `src/trips/tep/index.ts` |

---

## 附录 A — Verdict 映射表（Legacy → TEP）

**目的：** 消除第三套状态并存。所有对外新 API **只暴露** `RuleOutcome` + `ExecutabilityStatus`；Legacy 经 `VerdictMapper` 转换。

### A.1 Destination Pack 规则结果

| Pack `result.verdict` | `overridable` | → `RuleOutcome` | → `RuleSeverity` |
|----------------------|---------------|-----------------|------------------|
| `BLOCK` | `false` | `REJECT` | `CRITICAL` |
| `BLOCK` | `true` | `NEED_CONFIRM` | `HIGH` |
| `WARNING` | `true` | `CAUTION` | `MEDIUM` |
| `WARNING` | `false` | `SUGGEST_REPAIR` | `HIGH` |
| （无匹配 / 证据缺失） | — | `UNKNOWN` | `HIGH` |

**代码落点：** `data/destination-packs/is/rules/*.json`（`verdict: BLOCK|WARNING`）  
**映射实现建议：** `src/trips/tep/mappers/pack-verdict.mapper.ts`

### A.2 Feasibility / Constraint Solver

| `FeasibilityIssuePriority` | Conflict `severity` | → `RuleOutcome` | → `RuleSeverity` |
|---------------------------|---------------------|-----------------|------------------|
| `must_handle` | HIGH / CRITICAL | `REJECT` 或 `SUGGEST_REPAIR`¹ | `HIGH`–`CRITICAL` |
| `suggest_adjust` | MEDIUM | `SUGGEST_REPAIR` | `MEDIUM` |
| `pending_confirm` | — | `NEED_CONFIRM` | `MEDIUM` |
| （info / low） | LOW | `CAUTION` | `LOW` |

¹ 若 issue `type === 'blocker'` 或数学不可行 → `REJECT`；否则 `SUGGEST_REPAIR`。

**代码落点：** `src/trips/trip-constraint-solver/types/trip-constraint-solver.types.ts`

### A.3 Decision Semantics `ConstraintEnforcement`

| `ConstraintEnforcement` | → `RuleOutcome` | → `ExecutabilityStatus` 贡献 |
|------------------------|-----------------|------------------------------|
| `BLOCK` | `REJECT` | → `NOT_EXECUTABLE` |
| `REQUIRE_ADJUSTMENT` | `SUGGEST_REPAIR` | → `REQUIRES_REPAIR` |
| `REQUIRE_CONFIRMATION` | `NEED_CONFIRM` | → `REQUIRES_CONFIRMATION` |
| `WARN` | `CAUTION` | → `EXECUTABLE_WITH_CAUTION` |
| `INFORM` | `PASS` | （不影响 status） |

**代码落点：** `src/trips/decision-semantics/types/decision-semantics.types.ts`

### A.4 Reason Code Severity

| `ReasonCodeSeverity` | → `RuleSeverity` | 默认 `RuleOutcome` |
|---------------------|------------------|---------------------|
| `FATAL` | `CRITICAL` | `REJECT` |
| `BLOCKING` | `HIGH`–`CRITICAL` | `REJECT` |
| `WARNING` | `MEDIUM` | `CAUTION` / `NEED_CONFIRM`² |
| `INFO` | `INFO` | `PASS` |

² 若 `requiresHumanConfirmation` → `NEED_CONFIRM`。

**代码落点：** `src/trips/guardian-decision-core/reason-codes/reason-code.registry.ts`

### A.5 POI Access / Readiness

| `verdict: BLOCKED` | → `REJECT` | `CRITICAL` |
| `verdict: LIMITED` | → `NEED_CONFIRM` 或 `CAUTION` | `MEDIUM` |
| Readiness `type: blocker` | → `REJECT` | `HIGH` |

### A.6 命名对照（避免混用）

| TEP 层 | 规则层 | 聚合层 | 禁止混写 |
|--------|--------|--------|----------|
| — | `NEED_CONFIRM` | `REQUIRES_CONFIRMATION` | 勿在 UI 写 `NEED_CONFIRM` |
| — | `SUGGEST_REPAIR` | `REQUIRES_REPAIR` | 勿写「需修复」与「需调整」无映射 |

### A.7 `VerdictMapper` 接口（实现契约）

```typescript
interface VerdictMapper {
  fromPackRule(result: { verdict: string; overridable?: boolean }): Pick<PlanningRuleResult, 'outcome' | 'severity'>;
  fromFeasibilityIssue(issue: { priority: string; type?: string }): Pick<PlanningRuleResult, 'outcome' | 'severity'>;
  fromEnforcement(enforcement: ConstraintEnforcement): Pick<PlanningRuleResult, 'outcome' | 'severity'>;
  aggregate(ruleResults: PlanningRuleResult[]): ExecutabilityStatus;
}
```

**裁决权：** `aggregate()` 为 Executability 最终裁决；单条规则不直接写 `ExecutabilityStatus`。

---

## 附录 B — `DailyDrivePlan` 投影规范

**原则（P0）：** 只读投影，不强制改写 `PlanVersion` 存储。TEP Validator 消费投影结果。

### B.1 输入真源

| 字段 | 真源 | 模块 |
|------|------|------|
| 计划版本 | `PlanVersion` / Effective Plan | `guardian-decision-core` |
| 日程项 | `ItineraryItem[]` per `TripDay` | `itinerary-items` |
| 路段耗时 | `travelFromPreviousDuration`, `travelMode` | `ItineraryItem` |
| 道路绑定 | `metadata.routeSegmentId`, `roadRefs` | item metadata / route binding |
| 住宿 | `type: hotel` items + lodging workbench refs | `planning-lodging-workbench` |

### B.2 投影规则

```
TripDay[N]
  → DailyDrivePlan.dayIndex = N
  → DailyDrivePlan.date = TripDay.date

ItineraryItem (ordered)
  → 相邻 activity 之间：
      DriveLeg.legId = `${fromItemId}→${toItemId}`
      DriveLeg.baseNavigationMinutes = toItem.travelFromPreviousDuration ?? computed
      DriveLeg.roadRefs = toItem.metadata.routeSegmentId ?? []
      DriveLeg.fromRef / toRef = itemId

  → type IN (hotel, accommodation):
      AccommodationAnchor.ref = itemId
      AccommodationAnchor.latestArrival = metadata.latestArrival ?? null

  → type IN (activity, poi, restaurant, ...):
      PlannedActivity.ref = itemId
      PlannedActivity.fixedStartAt = startTime (if reservation)
      PlannedActivity.weatherSensitive = metadata.weatherSensitive ?? false

  → buffers:
      PlanningBuffer from metadata.bufferMinutes / REST slots
```

### B.3 `ref` 命名约定

```
drive_leg_{day}_{seq}     — DriveLeg
activity_{itemId}         — PlannedActivity
accommodation_{itemId}    — AccommodationAnchor
anchor_{placeId}          — RouteAnchor
```

与 Decision Hook `targetRef` / `impactScope` 共用同一命名空间。

### B.4 Importance / Flexibility 默认（P0 启发式）

| 条件 | Importance | Flexibility |
|------|------------|-------------|
| 有预约 `fixedStartAt` | MANDATORY | FIXED |
| 当晚唯一住宿 | MANDATORY | FIXED |
| 普通景点 | RECOMMENDED | REMOVABLE |
| 餐厅 / 咖啡 | OPTIONAL | REPLACEABLE |
| 用户标记 must-do | MANDATORY | MOVABLE |

持久化路径（Phase 1）：`ItineraryItem.metadata.tepImportance` / `tepFlexibility`。

### B.5 投影器接口

```typescript
interface DailyDrivePlanProjector {
  project(input: {
    tripId: string;
    planVersionId: string;
    tripDays: TripDayRow[];
    itemsByDayId: Map<string, ItineraryItemRow[]>;
  }): DailyDrivePlan[];
}
```

**落点建议：** `src/trips/tep/projectors/daily-drive-plan.projector.ts`

---

## 附录 C — `DecisionHook` ↔ `DecisionProblem` 关联

### C.1 ID 空间

| 概念 | ID 格式 | 所有者 |
|------|---------|--------|
| `hookId` | `HOOK-{DOMAIN}-{SEQ}` | TEP Planner（规划期写入 Plan metadata） |
| `semanticKey` | `ROAD_SEGMENT_UNAVAILABLE` 等 | Decision Gateway SSOT |
| `problemId` | UUID | RFC-001 Runtime（行中创建） |
| `problemTemplateId` | `TMPL-{semanticKey}` | Pack + 契约注册表 |

### C.2 映射表（P0）

| `triggerType` | `semanticKey` | `Rfc001DecisionProblemType` | 关联 SDR |
|---------------|---------------|----------------------------|----------|
| `ROAD_STATUS_CHANGE` | `ROAD_SEGMENT_UNAVAILABLE` | `RESOURCE_UNAVAILABLE` | SDR-002 |
| `ROAD_STATUS_CHANGE` | `ROAD_SEGMENT_RESTRICTED` | `FEASIBILITY_FAILURE` | SDR-001 |
| `WEATHER_THRESHOLD` | `WEATHER_ACTIVITY_PROHIBITED` | `FEASIBILITY_FAILURE` | SDR-302 |
| `WEATHER_THRESHOLD` | `WEATHER_ROUTE_RISK` | `SCHEDULE_RISK` | SDR-202 |
| `EXECUTION_SLIP` | `EXECUTION_SCHEDULE_INFEASIBLE` | `EXECUTION_FAILURE` | SDR-203 |
| `EXECUTION_SLIP` | `EXCESSIVE_DAILY_LOAD` | `EXCESSIVE_LOAD` | SDR-101 |
| `RESERVATION_DEADLINE` | `TIME_WINDOW_INFEASIBLE` | `SCHEDULE_RISK` | SDR-203 |

**代码落点：** `src/decision-runtime/gateway/contracts/decision-gateway.types.ts`（`DecisionSemanticKey`）

### C.3 规划期 → 行中链路

```
TEP Planner
  → 写入 PlanVersion.metadata.decisionHooks[]
  → 每条 hook 含 semanticKey（预解析）

Runtime Detector 触发
  → 匹配 hook.triggerCondition
  → 创建 Rfc001DecisionProblem
      problemId = new UUID
      semanticCapability = hook.semanticKey
      affectedPlanItemIds = resolve(impactScope)
  → Unified Decision Center 展示
```

### C.4 Hook 注册接口

```typescript
interface DecisionHookRegistry {
  resolveTemplate(semanticKey: string): {
    problemTemplateId: string;
    defaultEnforcement: ConstraintEnforcement;
    defaultUrgency: Rfc001DecisionProblemUrgency;
  };
  matchHook(hooks: DecisionHook[], observation: Record<string, number>): DecisionHook | null;
}
```

**落点建议：** `src/trips/tep/registry/decision-hook.registry.ts`

---

## 附录 D — `SelfDriveProfile` Resolver

### D.1 输入源优先级

| 字段 | 优先级（高 → 低） | 来源 |
|------|-------------------|------|
| `vehicle.vehicleType` | 1. Guide `travelContext.vehicleType` | `4x4`→`4WD`, `2wd`→`2WD` |
| | 2. Exploration `mobilityContext.vehicleType` | `4WD_SUV`→`4WD`, `2WD_COMPACT_SUV`→`2WD` |
| | 3. Trip metadata `vehicle_type` | |
| | 4. Pack 默认 | `2WD`（冰岛 Consumer 默认） |
| `drivingPolicy.nightDrivingAllowed` | 1. User intent / principles `NO_NIGHT_DRIVING` | Exploration principles |
| | 2. Pack 默认 | `false`（冰岛 P0） |
| `drivers[].experienceLevel` | 1. User declared | onboarding / trip metadata |
| | 2. 默认 | `NOVICE_ABROAD`（保守） |
| `rentalRestrictions` | 1. User declared | optional |
| | 2. Pack `SDR-003` 默认条款 | Iceland pack |

### D.2 归一化规则

```typescript
interface SelfDriveProfileResolver {
  resolve(input: {
    tripId?: string;
    explorationInput?: ExplorationInput;
    guideTravelContext?: GuideTravelContext;
    tripPacingConfig?: unknown;
    tripMetadata?: unknown;
    destinationCountry: string;
  }): SelfDriveProfile;
}
```

**产品约束：** 交通方式固定自驾（`travel-mode-scope.constants.ts`）；Resolver **不** 接受 `public_transit`。

### D.3 落点

- `src/trips/tep/resolvers/self-drive-profile.resolver.ts`
- 单元测试：`self-drive-profile.resolver.spec.ts`（三入口归一）

---

## 附录 E — 用户可见状态映射

面向 App / Plan Studio / Decision Strip。**系统内部仍用 `ExecutabilityStatus`。**

| `ExecutabilityStatus` | 用户文案（中文） | Strip 级别 | 是否可 Commit | 主 CTA |
|----------------------|------------------|------------|---------------|--------|
| `EXECUTABLE` | 可以出发 | 绿 | ✅ | 确认行程 |
| `EXECUTABLE_WITH_CAUTION` | 可以出发，但有注意事项 | 黄 | ✅ | 查看注意事项 |
| `REQUIRES_CONFIRMATION` | 需要你确认几项再出发 | 橙 | ⚠️ 确认后 | 去确认 |
| `REQUIRES_REPAIR` | 需要调整后才能出发 | 橙红 | ❌ | 查看调整建议 |
| `NOT_EXECUTABLE` | 当前计划无法执行 | 红 | ❌ | 查看原因 |
| `UNKNOWN` | 部分信息待更新，暂无法确认 | 灰 | ❌ | 刷新/补充信息 |

### E.1 与规则层对照

| 用户看到 | 内部规则 `outcome` | 内部聚合 `status` |
|----------|-------------------|-------------------|
| 「需要你确认」 | `NEED_CONFIRM` | `REQUIRES_CONFIRMATION` |
| 「需要调整」 | `SUGGEST_REPAIR` | `REQUIRES_REPAIR` |
| 「无法执行」 | `REJECT` | `NOT_EXECUTABLE` |
| 「注意事项」 | `CAUTION` | `EXECUTABLE_WITH_CAUTION` |

### E.2 BFF 字段建议

```typescript
interface ExecutabilityAssessmentUi {
  status: ExecutabilityStatus;
  statusLabel: string;           // 上表「用户文案」
  stripLevel: 'success' | 'warning' | 'danger' | 'neutral';
  canCommit: boolean;
  primaryCta: { label: string; deepLink: string };
}
```

**落点：** `src/trips/tep/projectors/executability-assessment-ui.projector.ts`

---

## 10. 相关代码（迁移起点）

| 模块 | 路径 |
|------|------|
| Destination Pack | `data/destination-packs/is/` |
| Pack 契约 | `src/decision-runtime/packs/contracts/destination-pack.types.ts` |
| 道路评估 | `src/trips/guardian-decision-core/assessment/road-traversability.assessor.ts` |
| 可行性验证 | `src/trips/trip-constraint-solver/services/feasibility-report.service.ts` |
| 约束预览 BFF | `trip-constraint-registry.service.ts` · `constraint-impact-user-preview.util.ts` |
| SDR-202 元数据 / 文案 | `src/trips/tep/utils/sdr-202-rule-metadata.util.ts` |
| 统一 assessment | `decision-runtime/constraints/` · `GET constraint-assessments` |
| 日照事实 | `src/trips/tep/providers/daylight-fact.provider.ts` · `sdr-202-daylight.evaluator.ts` |
| 负荷语义 | `data/destination-packs/is/rules/is-load-rules.json` |
| 自驾范围常量 | `src/common/constants/travel-mode-scope.constants.ts` |

---

## 11. 项目状态与 Production Hardening

> **完整状态、认证清单与路线图见 [TEP-PHASE0-STATUS.md](./TEP-PHASE0-STATUS.md)。**

### 11.1 当前阶段定义（2026-07-12）

| 英文 | 中文 |
|------|------|
| **Phase 0 Functional Complete, Production Hardening** | **Phase 0 功能闭环完成，进入生产化加固** |

| 层面 | 状态 |
|------|------|
| 功能能力 | ✅ Functional Complete（持续决策 Vertical Slice） |
| 自动化认证 | 🟡 核心切片通过（~90 tests；IS-CERT 001–304；302 mock 写回） |
| 生产可信度 | ❌ 未完成（真实 PostgreSQL E2E、事务、并发待验） |
| 正式发布 | ❌ Not Production Ready |

**已成立主链：**

```
Executability → Hook/RecoveryGraph → WorldState → DecisionProblem
  → Adjustment Queue → User Accept → REMOVE Writeback → Materialization → Re-validation
```

### 11.2 Phase 0 功能闭环（已实现）

| WP | 名称 | 状态 |
|----|------|------|
| WP-TEP-10 | WorldState Evidence Bridge | ✅ |
| WP-TEP-11 | DecisionHook + Runtime 触发 + 持久化 | ✅ |
| WP-TEP-12 | RecoveryGraph + Local Repair + REMOVE 写回 | ✅ |

**规划期 SDR（P0）：** 001–003、101、201–203、301–303、202 ✅ · **102/103** ⏳ Production Hardening 之后

**写回边界：** `REMOVE` + `REPLACE`（预计算 `replacementPoiId`）；幂等键 `trip:{tripId}:tep-repair:{optionId}`

### 11.3 Phase 0 契约冻结（WP-TEP-16，待签字）

**签字文档：** [TEP-PHASE0-CONTRACT-FREEZE.md](./TEP-PHASE0-CONTRACT-FREEZE.md)

评审须确认并冻结：

1. `ExecutabilityStatus` / `RuleOutcome` 为**唯一**对外状态语言  
2. 四核心对象 + Hook / RecoveryGraph / RecoveryOption 契约  
3. `PlanVersion.metadata.tep` schema（`tripnara/tep_plan_version_metadata@v1`）  
4. 写回 API、ERC `intervention-tep-*` 映射、幂等键  
5. TEP / Canonical **去重键**：`tripId + eventSemanticKey + targetRef + effectivePlanVersionId`  
6. `note` `_tep` 过渡结构与迁移计划  

### 11.4 Production Hardening 工作包（WP-TEP-13～16）

| 顺序 | WP | 名称 | 目标 |
|------|-----|------|------|
| 1 | **WP-TEP-16** | Contract Sign-off | 冻结 §11.3 语义 |
| 2 | **WP-TEP-13** | Real PostgreSQL E2E | 写回在真实 DB/事务下成立 |
| 3 | — | 事务 / 幂等 / 并发 / `STALE_REPAIR_OPTION` | IS-CERT-401～403 |
| 4 | **WP-TEP-15** | Execution Slip → Daylight | `ExecutionSlipPipeline` → `tryTriggerFromDaylightScheduleRisk` |
| 5 | **WP-TEP-14** | REPLACE Writeback | ✅ 预计算 `replacementPoiId` only |
| 6 | — | SDR-102 / SDR-103 | 连续驾驶 / 多日疲劳 |

**WP-TEP-13 必覆盖：** 正常路径 · 幂等 · 并发 · 物化失败回滚 · `STALE_REPAIR_OPTION`

**WP-TEP-14 最小动作：**

```typescript
type TepRepairAction =
  | { type: 'REMOVE'; targetRef: string }
  | { type: 'REPLACE'; targetRef: string; replacementRef: string };
```

### 11.5 认证命令

```bash
# 规划期
npm test -- src/trips/tep/certification/is-cert.harness.spec.ts

# 运行时 Hook + Repair 预览
npm test -- src/trips/tep/certification/is-cert-runtime.harness.spec.ts

# REMOVE 写回（mock Prisma — 非 Production 证明）
npm test -- src/trips/tep/certification/is-cert-writeback.integration.spec.ts
npm test -- src/trips/tep/certification/is-cert-404.integration.spec.ts

# REMOVE 写回（真实 PostgreSQL — opt-in，拒绝 prod）
TEP_WRITEBACK_PG_E2E=1 DATABASE_URL=postgresql://... npm run test:tep-writeback-pg

npm test -- src/trips/tep
```

### 11.6 下一批认证（Production 门槛）

| Case | 验证 |
|------|------|
| IS-CERT-401 | 真实 DB 幂等写回 |
| IS-CERT-402 | 旧版本修复 → `STALE_REPAIR_OPTION` |
| IS-CERT-403 | 物化失败整体回滚 |
| IS-CERT-404 | TEP / Canonical 去重 |
| IS-CERT-405 | 执行晚点 → 日照 → REMOVE 写回 |

### 11.7 Pack 文件（冰岛）

| 文件 | SDR / 用途 |
|------|------------|
| `rules/is-daylight-rules.json` | SDR-202 |
| `rules/is-rental-rules.json` | SDR-003 |
| `rules/is-accommodation-rules.json` | SDR-201 |
| `certification/tep-is-cert*.scenarios.json` | IS-CERT 基线 |

### 11.8 Constraint Console ↔ TEP 分工（2026-07-13 联调冻结）

| 能力 | 负责方 | 说明 |
|------|--------|------|
| BFF 500 时 assessment fallback | 前端（临时） | 可逐步移除 |
| draft buffer 文案 reproject（BFF 仍返回旧值） | 前端（临时） | BFF 正式方案落地后删除 |
| `preview-impact` 正确重算 + activity 明细 | **后端** | draft `maxMinutesAfterSunset` · `affectedDayDetails[].items[]` |
| structured evidence 写入 assessments | **后端** | `segmentLabel` 来自 `dailyDrivePlans` + `drive_leg_*` |
| 数值一致 | **同源 TEP** | preview / assessments / 顶栏可行度共用 `getTepOnlyPlanningRuleResults` |

**preview-impact 成功契约（NO_NIGHT 摘要）：** `refreshType` · `scheduleDetailLevel: activity` · `userSummary`（`STILL_NOT_EXECUTABLE` + draft 文案）· `structuredImpact.constraintChanges[]` before/after 对象 + `userFacingSummary` · `constraintAssessments[]` 投影快照 · dev 字段仅 `meta.debug`

**后端自测：**

```bash
curl -s -X POST "$BASE/api/trips/5945a3ab-75d2-4911-ae82-9647c8c29e96/constraints/preview-impact" \
  -H 'Content-Type: application/json' \
  -d '{"changes":[{"constraintId":"c_no_night_drive","patch":{"value":{"maxMinutesAfterSunset":45},"unit":"minute"}}],"persist":false}'
# success: true · verdictReason 含 23:49 / +45 分钟 / +64min

curl -s "$BASE/api/trips/5945a3ab-75d2-4911-ae82-9647c8c29e96/constraint-assessments"
# NO_NIGHT_DRIVE lanes.executability.evidence 全 structured 字段
```

**架构纪律：** preview 是 **what-if** — `applyDraftChanges → re-run SDR-202 with projected buffer → build user preview`；空 schedule 返回 `summary_only`，不 throw。
