# Constraint Capability Registry — Phase 0（冰岛 Limited Pilot）

**状态：** SSOT · 2026-07-13  
**受众：** 产品 / 前端 / BFF / TEP / QA  
**关联：** [TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md](./TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md) · [TEP-SELF-DRIVE-FRONTEND-HANDOFF.md](../frontend/TEP-SELF-DRIVE-FRONTEND-HANDOFF.md) §2.11 · [CONSTRAINT_SEMANTIC_CONSOLIDATION.md](../../src/decision-runtime/CONSTRAINT_SEMANTIC_CONSOLIDATION.md)

---

## 0. 为什么需要这份 Registry

**问题：** 前端约束控制台已接近「旅行决策 OS」，但后端仍在「BFF 投影 + 部分 enforce」阶段。  
**风险：** `type: HARD` 在 BFF 上会被投影为 `violationResult: BLOCK`，**即使底层没有 enforce 代码**（见 `trip-constraint-bff.projection.util.ts` → `resolveViolation`）。

**原则：**

1. **UI 承诺 ≤ Registry 声明能力** — 不以 `type===HARD` 作为「系统保证」依据。
2. **Canonical Key** 统一 Legacy 卡片、Catalog 模板、TEP Profile、enforce 规则。
3. **冰岛 Phase 0** 只 **OPEN** 白名单；其余 **HIDDEN** 或 **DISPLAY_ONLY**。

---

## 1. 能力枚举（前端必读）

### 1.1 `enforcementLevel`

| 值 | 含义 | UI 建议 |
|----|------|---------|
| `ENABLED` | planning + feasibility（或 execution）真实检测并阻断 | 可标「系统会检查」；违反进 conflicts / executability |
| `PARTIAL` | 部分阶段或部分数据源 enforce（如 TEP 有、constraint check 无） | 标「部分保障」；注明哪条链路生效 |
| `DISPLAY_ONLY` | 仅 BFF 文案 / 卡片展示，**无** enforce | 标「偏好记录」或隐藏；**禁止**「不可突破」 |
| `ADVISORY_ONLY` | SOFT tradeoff / planning advisory，不进 hard block | 标「尽量满足」；冲突为建议级 |

### 1.2 `phase0UiPolicy`

| 值 | 含义 |
|----|------|
| `OPEN` | Limited Pilot 可编辑 + 可宣传 |
| `DISPLAY_ONLY` | 可展示，不可宣传为 enforce |
| `HIDDEN` | Phase 0 不展示或折叠 |
| `DEFAULT_ONLY` | 仅默认值，不提供编辑入口 |

### 1.3 `optimizationStatus`（SOFT / 旅行目标，目标字段 — 尚未全链实现）

| 值 | 含义 |
|----|------|
| `REGISTERED` | 已写入 contract / catalog |
| `COMPILED` | 已编译权重（`compileObjectiveWeights`） |
| `CONSUMED` | 优化器 / schedule eval 已消费 |
| `ADVISORY` | 仅 check advisory |

Phase 0 前端：**未标 `CONSUMED` 的 SOFT 不要暗示「系统会帮你优化」。**

---

## 2. 目标链 vs 现状

```
【目标】
TripConstraint (canonical key)
    → ConstraintCapability
    → ConstraintAssessment
    → DecisionProblem (reason + impact + options)
    → Repair Action
    → Effective Plan

【Phase 0 现状】
TripConstraint + BFF 投影          ✅
ConstraintCapability Registry      📄 本文（静态 SSOT）
ConstraintAssessment               ⚠️ feasibility + gateway 双轨
DecisionProblem                    ⚠️ 行中较完整；规划期 partial
Repair                             ⚠️ feasibility repair / TEP repair 分散
Effective Plan                     ✅ Guardian RFC-001 写回
```

---

## 3. Canonical Key 映射规则

每条能力使用 **`constraintKey`**（全大写 snake）作为 SSOT：

```
constraintKey
 ├── legacyConstraintId   (c_*)
 ├── catalogTemplateId    (templateId)
 ├── metadataPaths[]      (写入真源)
 ├── tepRuleIds[]         (SDR，若有)
 └── enforcement          (阶段矩阵)
```

**Phase 0 已知双源债（P0 工程）：**

| constraintKey | 约束引擎读 | TEP 读 | 风险 | P0 读路径 |
|---------------|-----------|--------|------|-----------|
| `MAX_DAILY_DRIVE` | `metadata.constraints.maxDailyDrivingHours`（**小时**） | `metadata.constraints.maxDailyDriveMinutes`（**分钟**） | 只写一侧 → 一侧 PASS 一侧 FAIL | ✅ **2026-07-13** `tep-constraint-profile-sync.util.ts` 归一化读 |
| `NO_NIGHT_DRIVE` | `c_no_night_drive` ← `metadata.constraints.noNightDrive` | 同 metadata + exploration principles | 相对一致，但仍有多入口 | — |

**P1 写入建议（冻结至 Compiler 落地前）：** 同时写 `maxDailyDriveMinutes` **与** `maxDailyDrivingHours = minutes/60`，或只暴露单一表单经后端双写。

---

## 4. Phase 0 白名单 — 规划 + 冰岛自驾

### 4.1 必须满足（OPEN + ENABLED）

| constraintKey | 用户标签 | legacyId | templateId | metadata / 源 | enforce 阶段 | TEP |
|---------------|---------|----------|------------|---------------|-------------|-----|
| `TIME_RANGE` | 行程日期 | `c_time_range` | `time_range` | trip dates | planning ✅ | — |
| `BUDGET_TOTAL` | 总预算 | `c_budget_total` | `budget_total` | budget OS / metadata | planning ✅ feasibility ✅ | — |
| `TRANSPORT_SELF_DRIVE` | 自驾 | `c_transport_mode` | `transport_mode` | 固定 `self_drive_only` | planning ✅（默认） | Profile 默认 |
| `MAX_DAILY_DRIVE` | 单日驾驶上限 | `c_max_daily_drive` | `max_daily_drive` | 见 §3 双源 | feasibility ✅ | SDR-101 |
| `NO_NIGHT_DRIVE` | 不夜驾 | `c_no_night_drive` | `no_night_drive` | `metadata.constraints.noNightDrive` | feasibility ✅ | SDR-202 |

### 4.2 官方 / 外部（DISPLAY_ONLY 或 PARTIAL — 只读展示 + TEP/Guardian enforce）

| constraintKey | 用户标签 | legacyId | enforce | phase0UiPolicy | 说明 |
|---------------|---------|----------|---------|----------------|------|
| `OFFICIAL_IS_FROAD_2WD` | F 路须四驱 | `c_official_is_froad_2wd` | PARTIAL | DISPLAY_ONLY | readonly_official；TEP SDR-001 |
| `OFFICIAL_IS_WINTER_FROAD` | 冬季 F 路 | `c_official_is_winter_froad` | PARTIAL | DISPLAY_ONLY | 季节性规则展示 |
| `OFFICIAL_IS_RED_ALERT` | 红色预警 | `c_official_is_red_alert` | PARTIAL | DISPLAY_ONLY | SafeTravel |
| `OFFICIAL_IS_WIND_SAFETY` | 横风安全 | `c_official_is_wind_safety` | ADVISORY_ONLY | DISPLAY_ONLY | 运营建议 |
| `WORLD_FEASIBILITY` | 实时验证 | `c_world_feasibility` | PARTIAL | DISPLAY_ONLY | readonly_world 快照 |

### 4.3 TEP 主路径（非 Constraint 卡片，但 Phase 0 必接）

| 能力 | API | phase0UiPolicy |
|------|-----|----------------|
| 可执行性诊断 | `GET /executability` | OPEN |
| 车型 / 驾驶经验 | P1 `PUT /trips` metadata | OPEN |
| 节点弹性 | P1 `PATCH itinerary-items` `_tep` | OPEN |
| 行中修复 | P2 `tep-repairs/accept` | OPEN |

---

## 5. Phase 0 禁止宣传 / 应 HIDDEN 或 DISPLAY_ONLY

### 5.1 Catalog HARD — 注册 ≠ enforce

| constraintKey | templateId | enforcementLevel | phase0UiPolicy | 原因 |
|---------------|------------|------------------|------------------|------|
| `ELDERLY_WALK_LIMIT` | `elderly_walk_limit` | DISPLAY_ONLY | HIDDEN | 无 walking enforce |
| `CHILD_NAP_TIME` | `child_nap_time` | DISPLAY_ONLY | HIDDEN | 无 schedule enforce |
| `ACCESSIBILITY` | `accessibility` | DISPLAY_ONLY | HIDDEN | 无 enforce |
| `MOTION_SICKNESS` | `motion_sickness` | DISPLAY_ONLY | HIDDEN | 无 enforce |
| `NO_UNPAVED_ROAD` | `no_unpaved_road` | PARTIAL | DISPLAY_ONLY | TEP gravel/F-road 部分覆盖；catalog 未统一 |
| `NO_BAD_WEATHER` | `no_bad_weather` | PARTIAL | DISPLAY_ONLY | readiness/world 部分；非统一 gateway |
| `NO_HIGH_RISK_ACTIVITY` | `no_high_risk_activity` | DISPLAY_ONLY | HIDDEN | 无统一 enforce |
| `NO_UNVERIFIED_ROUTE` | `no_unverified_route` | PARTIAL | HIDDEN | Guardian 部分 |
| `EARLIEST_DEPARTURE` | `earliest_departure` | DISPLAY_ONLY | HIDDEN | 模板无 full enforce |
| `LATEST_END` | `latest_end` | DISPLAY_ONLY | HIDDEN | 同上 |
| `MAX_DAILY_ACTIVITY` | `max_daily_activity` | DISPLAY_ONLY | HIDDEN | 同上 |
| `REQUIRED_REST` | `required_rest` | DISPLAY_ONLY | HIDDEN | 同上 |
| `FIXED_APPOINTMENTS` | `fixed_appointments` | PARTIAL | HIDDEN | 部分 feasibility |
| `ACTIVITY_BUDGET` | `activity_budget` | DISPLAY_ONLY | HIDDEN | 同上 |
| `BUDGET_OVERRUN_TOLERANCE` | `budget_overrun_tolerance` | PARTIAL | HIDDEN | 预算子路径 |

### 5.2 SOFT 模板（16 个）— 默认 ADVISORY_ONLY

| 代表 templateId | optimizationStatus（现状） | phase0UiPolicy |
|-----------------|---------------------------|----------------|
| `minimize_hotel_changes` | ADVISORY / 部分 schedule eval | HIDDEN 或折叠 |
| `lunch_time_window` | ADVISORY | HIDDEN |
| `sunset_photography` / `aurora_photo` | ADVISORY | HIDDEN |
| 其余 SOFT catalog | REGISTERED | HIDDEN |

**旅行目标 9 条**（`rankedPrinciples`）：`COMPILED`（权重）但 **非** 全量 optimizer → Phase 0 **可展示排序**，文案用「冲突时优先保哪项」，勿写「系统自动优化行程」。

### 5.3 决策合同其他块

| 块 | phase0UiPolicy | 说明 |
|----|----------------|------|
| `teamGovernance` | HIDDEN | 未接入 TEP accept / 多人协商 |
| `automation`（全级别） | DISPLAY_ONLY | 影响 resolutionMode，但勿过度承诺 auto execute |
| `changeStrategy` | DEFAULT_ONLY | 可用默认 BALANCED，不强调 |

---

## 6. 前端渲染规则（Phase 0 冻结）

### 6.1 禁止

| 不要做 | 原因 |
|--------|------|
| `item.type === 'HARD'` → 显示「不可突破 / 系统保证」 | BFF 假 BLOCK |
| 开放 Catalog POST 全部 31 模板 | 31 注册 ≠ 31 enforce |
| 约束 PASS + 忽略 TEP FAIL（或反之） | 双源未 Compiler |
| 规划 repair 无 `problemId` 仍称「AI 决策」 | DecisionProblem 未贯通 |

### 6.2 应该

| 做法 | 依据 |
|------|------|
| 读 Registry（或后端 future `capability` 字段）决定 badge | 本文 §4–5 |
| HARD 白名单内：展示 `contractMeta.judgmentRule` + 链至 conflicts/executability | TRAVEL_DECISION_CONTRACT API |
| 违反时：规划 → `planning-conflicts` + `executability`；行中 → P2/P3 | TEP handoff |
| 未 OPEN 项：折叠或「实验性偏好」 |

### 6.3 BFF `capability` 字段 ✅（2026-07-13）

```typescript
interface TripConstraintCapability {
  constraintKey: string;
  enforcementLevel: 'ENABLED' | 'PARTIAL' | 'DISPLAY_ONLY' | 'ADVISORY_ONLY';
  stages: {
    planning: boolean;
    feasibility: boolean;
    execution: boolean;
    tep: boolean;
    optimizer: boolean;
  };
  phase0UiPolicy: 'OPEN' | 'DISPLAY_ONLY' | 'HIDDEN' | 'DEFAULT_ONLY';
}
```

**实现：** `GET /trips/:id/constraints` → `items[].capability`（`constraint-capability-registry.util.ts` + `projectTripConstraintForBff`）。  
`DISPLAY_ONLY` / `ADVISORY_ONLY` 项的 `contractMeta.violationResultLabel` 不再误标「阻断执行」。

---

## 7. SSOT 分工（Constraint vs TEP）

```
Planning 阶段
─────────────
TravelDecisionContract + Constraint 卡片
  │  用户意图 / 硬边界 / 软偏好 / 自动化策略
  │
  ├─► Feasibility / planning-conflicts  (ENABLED keys only)
  │
  └─► TEP Profile Compiler（目标形态，Phase 0 部分手工对齐）
        │
        ▼
      ExecutabilityAssessment (SDR-101/202/…)
        │
Execution 阶段
─────────────
WorldState + Hooks
        │
        ▼
      ERC / adjustment-queue / TEP Local Repair
        │
        ▼
      Effective Plan (PlanVersion writeback)
```

**Phase 0 不要：** Constraint 与 TEP 各读各的 metadata 分支而不对齐（见 §3）。

---

## 8. QA 验收 — Capability 不对位

| # | 场景 | 预期 |
|---|------|------|
| 1 | 只写 `maxDailyDriveMinutes=480`，不写 hours | PATCH max_daily_drive → 双写字段；Constraint + TEP 读一致 |
| 2 | 添加 `elderly_walk_limit` HARD 卡片 | UI 不得显示「阻断执行」除非 enforcement 升级 |
| 3 | 旅行目标把 SAFETY 排第一 | executability 不应自动变绿；仅影响优化权重 |
| 4 | 开启 20 个 SOFT 模板 | planning-conflicts 可有 advisory，但不得称「已优化」 |
| 5 | constraint check PASS + executability NOT_EXECUTABLE | 允许；以 **executability 为准** 门控出发 |

---

## 9. 工程优先级（与 Registry 配套）

| 优先级 | 项 | 说明 |
|--------|-----|------|
| **P0** | Canonical Key + MAX_DAILY_DRIVE 双写/Compiler | 读 ✅ + **写路径双写** ✅（`applyMaxDailyDrivingHoursConstraintPatch`） |
| **P0** | BFF `enforcementLevel` 或 `capability` 字段 | ✅ `items[].capability` |
| **P1** | 规划期 DecisionProblem 完整投影 | reason + impact + options |
| **P1** | Legacy/Catalog 归一 | 单一 PATCH/POST 路径 |
| **P1** | SOFT `optimizationStatus` | 避免假优化 |
| **P2** | ConstraintEvaluationGateway 单轨 | 见 CONSTRAINT_SEMANTIC_CONSOLIDATION |

---

## 10. 相关文档

| 文档 | 用途 |
|------|------|
| [TRAVEL_DECISION_CONTRACT_FRONTEND_API.md](../../src/trips/trip-constraint-solver/TRAVEL_DECISION_CONTRACT_FRONTEND_API.md) | 约束控制台 API |
| [TRIP_CONSTRAINTS_API.md](../../src/trips/trip-constraint-solver/TRIP_CONSTRAINTS_API.md) | CRUD + check/repair |
| [TEP-SELF-DRIVE-WEB-P0/P1](../frontend/) | executability + metadata 写入 |
| [CONSTRAINT_SEMANTIC_CONSOLIDATION.md](../../src/decision-runtime/CONSTRAINT_SEMANTIC_CONSOLIDATION.md) | 架构收口 |

---

## 11. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-13 | BFF `items[].capability` + MAX_DAILY_DRIVE 写路径双写 |
| 2026-07-13 | Phase 0 Capability Registry 初版 — 白名单 + enforcement 矩阵 + 双源债 |
