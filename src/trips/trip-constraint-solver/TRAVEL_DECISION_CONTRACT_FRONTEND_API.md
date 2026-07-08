# 旅行决策合同 / 约束控制台 — 前端对接文档

> **Swagger tag**: `trip-constraints`  
> **前缀**: `/api/trips/:tripId/constraints`  
> **响应壳**: `{ success, data, error }`  
> **TypeScript**: `dto/frontend-travel-decision-contract-api.types.ts`  
> **Client**: `dto/frontend-travel-decision-contract-api-client.ts`

---

## 1. 产品定位（前端必读）

约束控制台 **不是规则列表**，而是 **旅行决策合同**：

| 用户填写 | API 字段 | 页面区块 |
|----------|----------|----------|
| 这趟旅行优先优化什么 | `contract.objectives` | 旅行目标 |
| 绝不能突破什么 | `items`（HARD） | 必须满足 |
| 可妥协偏好 | `items`（SOFT） | 尽量满足 |
| 成员与决策权限 | `items`（MEMBER）+ `contract.teamGovernance` | 团队成员 |
| 变化时多激进 | `contract.changeStrategy` | 风险与变化策略 |
| 系统自动做到哪一步 | `contract.automation` | 自动化授权 |
| 冲突与改约束影响 | `contract.conflicts` + `preview-impact` | 冲突与影响 |
| 官方规则 / 实时验证 | `readonly_*` sections | 只读折叠区 |

**禁止**前端自行区分「用户约束 vs 官方规则」——用 `meta.sections` + `section.readonly` + `source.type`。

---

## 2. 推荐加载流程

```
页面 mount
  → GET  /trips/:tripId/constraints
  → buildConstraintConsoleViewModel(data)   // 或 fetchConstraintConsole()

用户改「旅行原则」排序
  → PATCH /trips/:tripId/constraints/contract
  → 刷新 GET（或 merge 返回的 contract）

用户改单条约束（预算/驾驶上限等）
  → PATCH /trips/:tripId/constraints/:constraintId
  → POST  /trips/:tripId/constraints/preview-impact   // 沙盘预览
  → 确认后 persist 或 planning/commands

进入页 / 改约束后
  → POST  /trips/:tripId/constraints/check            // 冲突列表 + contractConflicts
```

---

## 3. GET `/constraints` — 主读模型

### 3.1 响应结构

```typescript
interface TripConstraintsListResponse {
  meta: {
    constraintsVersion: number;      // 乐观锁 — 所有写操作必带
    sections: TravelDecisionContractSection[];
    conflictCount: number;
    // ...
  };
  items: TripConstraint[];           // 全量卡片，按 id 索引
  contract: TravelDecisionContract;  // 决策合同 SSOT
}
```

### 3.2 七块 + 两辅助区（`meta.sections`）

| `section.key` | 渲染内容 | `contractBlock` |
|---------------|----------|-----------------|
| `travel_objectives` | 原则排序 UI | `objectives` → 读 `contract.displayPrinciples` |
| `hard_must_satisfy` | HARD 约束卡片 | — |
| `soft_prefer` | SOFT 约束卡片 | — |
| `team_members` | 成员相关卡片 | `team_governance` → `contract.teamGovernance.rules` |
| `change_strategy` | 保守/平衡/探索 + 容忍度 | `change_strategy` |
| `automation` | 四级授权 + 自动/需确认列表 | `automation` |
| `conflicts_and_impact` | 冲突摘要 + CTA | `conflicts` |
| `readonly_official` | 目的地规则（只读） | — |
| `readonly_world` | 实时验证快照（只读） | — |

**渲染伪代码：**

```tsx
for (const { section, constraints, contractBlock } of view.sections) {
  if (contractBlock === 'objectives') {
    renderPrincipleSorter(view.contract.displayPrinciples);
  } else if (contractBlock === 'change_strategy') {
    renderChangeStrategy(view.contract.changeStrategy);
  } else if (contractBlock === 'automation') {
    renderAutomationPolicy(view.contract.automation);
  } else if (contractBlock === 'team_governance') {
    renderGovernanceRules(view.contract.teamGovernance);
  } else if (contractBlock === 'conflicts') {
    renderConflictSummary(view.contract.conflicts);
  }
  for (const c of constraints) {
    renderConstraintCard(c, { readonly: section.readonly });
  }
}
```

### 3.3 约束卡片样式

读 `item.cardTone`，**禁止** `type === 'HARD'` 即红框：

| cardTone | 样式 |
|----------|------|
| `default` | 正常；HARD 显示锁图标 |
| `caution` | 琥珀左边线（DRAFT） |
| `danger` | 红色左边线（hasConflict） |
| `muted` | 停用 |

官方规则：`source.type === 'OFFICIAL_RULE'` → 隐藏编辑/删除。

### 3.4 硬约束 BFF 字段（P0 SSOT）

每条 `items[]` 经 BFF 投影后包含 **判定规则 / 违反结果 / scope / enabled**，前端应优先读这些字段，静态规则表仅作兜底。

| 前端展示 | 字段 | 说明 |
|----------|------|------|
| 已启用：不夜驾 | `enabled` + `name` | `enabled=false` → `contractMeta.enabledSummary` 为「已停用：…」 |
| 作用范围：整趟行程 | `contractMeta.scopeLabel` | 由 `scope.type` 生成 |
| 判定规则 | `contractMeta.judgmentRule` | 也可读 `value.judgmentRule` |
| 违反结果 | `contractMeta.violationResultLabel` | `BLOCK`→阻断执行；`CONFIRM`→需确认后调整 |
| 侧栏摘要 | `displayValue` | 可选 |
| 模板对齐 | `source.templateId` | 如 `no_night_drive` / `max_daily_drive` / `budget_total` |

**最小硬约束示例（不夜驾）：**

```json
{
  "id": "c_no_night_drive",
  "name": "不夜驾",
  "type": "HARD",
  "category": "SAFETY",
  "enabled": true,
  "scope": { "type": "TRIP" },
  "displayValue": "日落后 30 分钟",
  "source": { "type": "USER", "templateId": "no_night_drive" },
  "value": {
    "maxMinutesAfterSunset": 30,
    "judgmentRule": "日落后 30 分钟不得继续驾驶",
    "violationResult": "阻断执行"
  },
  "contractMeta": {
    "enabledSummary": "已启用：不夜驾",
    "scopeLabel": "整趟行程",
    "judgmentRule": "日落后 30 分钟不得继续驾驶",
    "violationResult": "BLOCK",
    "violationResultLabel": "阻断执行"
  }
}
```

**PATCH 写回（带 `constraintsVersion`）：**

| constraintId | value 示例 | 说明 |
|--------------|------------|------|
| `c_no_night_drive` | `{ "maxMinutesAfterSunset": 45 }` | 停用：`status: "DISABLED"` |
| `c_max_daily_drive` | `4` 或 `{ "maxHours": 4 }` | 单日驾驶上限 |
| `c_budget_total` | `50000` 或 `{ "total": 50000, "currency": "CNY" }` | 总预算 |

`hard_must_satisfy` 分区内的约束 `type` 必须为 `HARD`；冲突高亮用 `POST /check` 返回的 `contractConflicts.conflictConstraintIds`。

### 3.5 求解器 enforce（P1）

BFF 展示与 **trip-conflicts → feasibility → verdict** 共用同一 metadata 源（`trip-constraint-hard-enforcement.util.ts`）：

| templateId | 检测 | issueKind | 违反结果 |
|------------|------|-----------|----------|
| `max_daily_drive` | 当日 DRIVING 累计超时 | `daily_drive` | `NOT_EXECUTABLE` + `hardConstraintBlocked`（Guardian transport） |
| `no_night_drive` | 驾驶段结束晚于 SunCalc 日落 + 缓冲 | `no_night_drive` | 同上 |
| `budget_total` | Budget OS / constraint-checker（既有链路） | `budget` | 预算 gate / 决策中心 |

`violationResult: 阻断执行`（`contractMeta.violationResult === 'BLOCK'`）的约束在 feasibility 中均为 `priority: must_handle`、`severity: high`。

### 3.6 目的地规则 SSOT（与 hard_must_satisfy 分离）

**禁止**把 `OFFICIAL_RULE` 放进 `hard_must_satisfy`。目的地规则只在 `readonly_official` 分区展示，用户不可 PATCH（`OFFICIAL_RULE_READONLY`）。

```json
{
  "id": "c_official_is_froad_2wd",
  "name": "F 路车辆准入",
  "type": "EXTERNAL",
  "sectionKey": "readonly_official",
  "locked": true,
  "enabled": true,
  "verificationStatus": "CURRENT",
  "source": { "type": "OFFICIAL_RULE", "templateId": "f_road_vehicle_access" },
  "value": {
    "destinationRuleCategory": "TRAFFIC",
    "destinationRuleTier": "BLOCK",
    "sourceAgency": "冰岛道路管理部门",
    "applicableScope": "高地道路（F 路）",
    "judgmentRule": "仅允许符合要求的四驱车辆进入 F 路",
    "violationResult": "阻断路线",
    "evidenceRef": "road.is/froad",
    "evidenceVerifiedAt": "2026-07-03T12:00:00Z"
  },
  "contractMeta": {
    "enabledSummary": "已生效：F 路车辆准入",
    "scopeLabel": "高地道路（F 路）",
    "judgmentRule": "仅允许符合要求的四驱车辆进入 F 路",
    "violationResult": "BLOCK",
    "violationResultLabel": "阻断路线"
  }
}
```

| `destinationRuleTier` | 求解器 | 前端 `violationResult` |
|----------------------|--------|------------------------|
| `BLOCK` | hard conflict · `hardConstraintBlocked` | 阻断路线 |
| `CONDITIONAL` | 检查预约/季节/车型 | 检查条件是否满足 |
| `ADVISORY` | 影响 feasibility 分数，不 block | 影响风险评分 |

`POST /check` · feasibility `issues[]` 的 `relatedConstraintIds` 应指回上述 `c_official_*` / `c_official_poi_*` id，与卡片 `judgmentRule` 同源。

### 3.7 添加硬约束（catalog POST）

前端「添加约束」仅使用已有接口，**无需新路由**：

| 步骤 | 接口 |  body |
|------|------|-------|
| 添加 | `POST /trips/:tripId/constraints` | `type: HARD` + `source.templateId` + 可选 `value` + `constraintsVersion` |
| 保存 | `PATCH /trips/:tripId/constraints/:id` | `value` + `constraintsVersion` |

**示例（最早出发时间）：**

```json
POST /api/trips/{tripId}/constraints
{
  "name": "最早出发时间",
  "type": "HARD",
  "category": "TIME",
  "source": { "type": "USER", "templateId": "earliest_departure" },
  "value": { "time": "07:30" },
  "constraintsVersion": 3
}
```

**201** 返回 `constraint.id` = `c_tpl_earliest_departure`；GET 后在 `meta.sections[hard_must_satisfy].constraintIds` 可见，含完整 `contractMeta`。

| 错误码 | 含义 |
|--------|------|
| `UNKNOWN_CONSTRAINT_TEMPLATE` | templateId 不在注册表 — 扩 `constraint-template-registry.util.ts` |
| `CONSTRAINT_TEMPLATE_ALREADY_EXISTS` | 同 trip 已添加该模板 |
| `LEGACY_CONSTRAINT_USE_PATCH` | `no_night_drive` / `budget_total` 等 legacy 项请 PATCH，勿 POST |

已注册 catalog（16 个）：`earliest_departure`、`latest_end`、`max_daily_activity`、`required_rest`、`fixed_appointments`、`activity_budget`、`allow_budget_overrun`（SOFT→`soft_prefer`）、`budget_overrun_tolerance`、`elderly_walk_limit`、`child_nap_time`、`accessibility`、`motion_sickness`、`no_unpaved_road`、`no_bad_weather`、`no_high_risk_activity`、`no_unverified_route`。

`scope` / `operator` 可省略 — 由模板默认值填充。

### 3.8 约束范围 `value.scopeBinding`（PATCH/GET 已有路由）

**无需新 POST/PATCH 路由** — 使用现有 `PATCH /trips/:tripId/constraints/:id` 写入 `value.scopeBinding`，GET 完整回显供编辑。

| 动作 | 要求 |
|------|------|
| PATCH | 接受并原样保存 `value.scopeBinding`（`temporal` / `member` / `phase` / `activity`） |
| GET | 返回完整 `value.scopeBinding` |
| `contractMeta.scopeLabel` | 由 `scopeBinding` 格式化（`formatConstraintScopeSummary`），无 binding 时回退 `scope.type` |
| `scope` 字段 | 粗粒度索引（`TRIP` / `DAY` / `MEMBER` / `ROUTE_SEGMENT`）；细粒度以 `value.scopeBinding` 为准 |

**PATCH 示例（路段 + 成员）：**

```json
PATCH /api/trips/{tripId}/constraints/c_max_daily_drive
{
  "scope": { "type": "DAY", "ids": ["2"] },
  "value": {
    "hours": 4,
    "scopeBinding": {
      "temporal": {
        "kind": "route_segment",
        "segmentId": "item-a__item-b",
        "label": "D2 维克 → 冰河湖",
        "dayNumber": 2,
        "fromItemId": "item-a",
        "toItemId": "item-b"
      },
      "member": { "kind": "members", "memberIds": ["u1"], "labels": ["Alice"] },
      "phase": { "planning": true, "execution": true },
      "activity": { "kind": "all" }
    }
  },
  "constraintsVersion": 3
}
```

**校验层 scope 过滤（check / feasibility / solver）：**

| 维度 | 行为 |
|------|------|
| `temporal.kind=trip` | 全程生效 |
| `day` / `day_range` | 仅对应 `dayNumber` 或区间 |
| `route_segment` | 匹配 `segmentId` + `fromItemId`/`toItemId`（+ `dayNumber`） |
| `member.kind=primary_driver` | 解析 `contract.teamGovernance` 中 role 含「驾驶/主驾/driver」 |
| `member.kind=members` | 仅 `memberIds` 列表 |
| `phase` | `planning` / `execution` 分阶段生效 |

Legacy `c_max_daily_drive` 的扩展 value 存于 `metadata.constraintExtendedValues`；`c_no_night_drive` 的 `scopeBinding` 存于 `metadata.constraints.noNightDrive.scopeBinding`。

| 错误码 | 含义 |
|--------|------|
| `INVALID_SCOPE_BINDING` | PATCH unified 约束时 schema 校验失败（非法 day 范围、空 memberIds 等） |

### 3.9 软约束 `soft_prefer`（尽量满足）

**无需新路由** — `POST/PATCH/GET /trips/:tripId/constraints` 与 checklist 对齐。

| 项 | 约定 |
|----|------|
| 分区 | `sectionKey: soft_prefer`，`type: SOFT`，`allowRelaxation: true` |
| 稳定 id | `c_tpl_{templateId}`（与 hard catalog 一致） |
| priority ↔ intensity | 高 8/85 · 中 5/50 · 低 3/25（`soft-constraint-priority.util.ts`） |
| POST | 写入默认 priority + `value.intensity`；未传 priority 时用模板 `defaultPriority`（默认 5） |
| PATCH | `priority` 与 `value.intensity` 同步 normalize |
| check | SOFT 未满足 → `priority: suggest_adjust`，不进 `mustHandle`；含 `relatedConstraintIds` |
| 取舍 | 资源冲突时按 priority 升序牺牲（`soft-constraint-evaluation.util.ts`） |

**POST 示例（少换酒店）：**

```json
POST /api/trips/{tripId}/constraints
{
  "name": "少换酒店",
  "type": "SOFT",
  "category": "ACCOMMODATION",
  "source": { "type": "USER", "templateId": "minimize_hotel_changes" },
  "value": { "templateId": "minimize_hotel_changes" },
  "priority": 8,
  "constraintsVersion": 12
}
```

**已注册 SOFT 模板：** `minimize_hotel_changes`、`budget_soft`、`elderly_rest`、`lunch_time_window`、`max_major_pois_per_day`、`daily_free_time`、`avoid_early`、`avoid_backtracking`、`prefer_nature_scenery`、`allow_budget_overrun`、`less_shopping`、`sunset_photography`、`aurora_photo`、`prefer_local_food`、`avoid_crowds`、`attractions_over_shopping`。

**二期（已实现）：**

| 能力 | 说明 |
|------|------|
| 日程评估 | `soft-constraint-schedule-eval.util.ts` — `daily_count` / `time_window` / `time_budget` / `lodging_continuity` 等按 TripDay 检测 |
| check advisory | 日程违规 + trade-off 牺牲 → `suggest_adjust`，带 `suggestedResolution` 文案 |
| `planning-conflicts` | 与 HARD 冲突合并返回 SOFT advisory（`userId` 可用时） |
| `compiledWeights.softPreferences` | `{ constraintId \| templateId: priority/10 }`，与 `items[].priority` 同源；canonical 权重同步 boost |

### 3.10 模板注册表（JSON Schema + OpenAPI 扩展）

**机器可读 SSOT**（由 `exportConstraintTemplateCatalog()` 从 TS registry 导出，CI 校验一致）：

| 文件 | 用途 |
|------|------|
| `schemas/constraint-template-registry.schema.json` | JSON Schema — 代码生成 / 校验 |
| `schemas/constraint-template-registry.json` | 当前 31 条模板快照（16 HARD + 15 SOFT） |

**重新生成 JSON：**

```bash
npm run export:constraint-templates
```

**GET catalog（BFF 在线读取，与 JSON 文件同源）：**

```
GET /api/trips/{tripId}/constraints/catalog
GET /api/trips/{tripId}/constraints/catalog?type=SOFT
```

**重新生成 JSON（离线 / CI）：**

**单条模板字段（节选）：**

```json
{
  "templateId": "minimize_hotel_changes",
  "constraintId": "c_tpl_minimize_hotel_changes",
  "defaultName": "少换酒店",
  "type": "SOFT",
  "sectionKey": "soft_prefer",
  "defaultPriority": 8,
  "defaultIntensity": 85,
  "solverRuleKind": "lodging_continuity",
  "legacyPatchOnly": false
}
```

**OpenAPI 扩展（POST body 示例）— 可挂到 `CreateTripConstraintDto`：**

```yaml
CreateTripConstraintDto:
  type: object
  properties:
    source:
      type: object
      properties:
        templateId:
          type: string
          x-constraint-template-ref: '#/components/x-constraint-templates/minimize_hotel_changes'
  x-constraint-templates:
    $ref: './schemas/constraint-template-registry.json#/templates'
```

或在 Nest Swagger 用 `@ApiExtension('x-constraint-template-catalog', './schemas/constraint-template-registry.json')` 指向 catalog 路径。

**`solverRuleKind` 枚举：** `time_window` · `daily_count` · `time_budget` · `lodging_continuity` · `budget` · `route_shape` · `poi_preference` · `crowd_avoidance`

### 3.11 交通衔接 BFF 稳定字段（`same_day_travel` / `transfer_buffer`）

**长期约定** — feasibility `issues[]` 与 `planning-conflicts` 聚合项对下列 `issueKind` **稳定返回**：

| BFF `issueKind` | 后端 SSOT | 说明 |
|-----------------|-----------|------|
| `same_day_travel` | `same_day_travel` | 同日交通时间不足 / 缓冲偏紧 |
| `transfer_buffer` | `buffer_insufficient` | 活动间最小缓冲不足（`ConflictType.BUFFER_INSUFFICIENT`） |

```json
{
  "issueKind": "same_day_travel",
  "affectedDays": [4],
  "affectedDayNumbers": [4],
  "affectedScopeSummary": "瓦特纳冰川 → 冰河湖",
  "anchors": {
    "fromDayNumber": 4,
    "toDayNumber": 4,
    "fromPlaceLabel": "瓦特纳冰川",
    "toPlaceLabel": "冰河湖"
  }
}
```

| 字段 | 来源 |
|------|------|
| `affectedDayNumbers` | `affectedDays` + `anchors.fromDayNumber` / `toDayNumber` 去重排序 |
| `affectedScopeSummary` | `anchors.fromPlaceLabel` + ` → ` + `anchors.toPlaceLabel`；缺 label 时从 `message` 解析 |
| `affectedDays` | 保留兼容，与 `affectedDayNumbers` 同源 |

实现：`travel-scope-bff.util.ts` · `mapConflictToFeasibilityIssue` · `planning-conflicts.util.ts`。

---

## 4. PATCH `/constraints/contract` — 写决策合同

仅写入 `trip.metadata.travelDecisionContract`（目标 / 策略 / 授权 / 团队治理）。

```json
PATCH /api/trips/trip-1/constraints/contract
{
  "objectives": {
    "rankedPrinciples": ["SAFETY", "PACE", "CORE_EXPERIENCE", "BUDGET"]
  },
  "changeStrategy": {
    "archetype": "CONSERVATIVE",
    "tolerances": { "maxBudgetOverrunPct": 5 }
  },
  "automation": {
    "defaultLevel": "AUTO_REPAIR_LOW_RISK"
  },
  "constraintsVersion": 3
}
```

**原则枚举**（排序即权重，越靠前越高）：

| key | 中文 |
|-----|------|
| `SAFETY` | 安全第一 |
| `PACE` | 行程轻松 |
| `CORE_EXPERIENCE` | 核心体验优先 |
| `BUDGET` | 预算优先 |
| `FEWER_HOTEL_CHANGES` | 少换住宿 |
| `FLEXIBILITY` | 保留弹性 |
| `COVERAGE` | 尽可能多看 |
| `PHOTOGRAPHY` | 摄影体验优先 |
| `FAMILY_COMFORT` | 老人儿童体验优先 |

**自动化级别** → 影响决策队列数量（后端已接入 feasibility `resolutionMode`）：

| defaultLevel | 用户感知 |
|--------------|----------|
| `INFORM_ONLY` | 只提示，不进决策中心 |
| `SUGGEST` | 默认：需确认才改行程 |
| `AUTO_REPAIR_LOW_RISK` | 午餐顺延、补缓冲等可自动 |
| `AUTO_EXECUTE_CONDITIONAL` | 满足规则时自动执行 |

**409** `CONSTRAINTS_STALE` → 重新 GET 拿最新 `constraintsVersion`。

---

## 5. 决策沙盘（§8 §9）

### 5.1 冲突检测

```
POST /trips/:tripId/constraints/check
```

响应除 `conflicts[]` 外，新增 **`contractConflicts`**（与 `contract.conflicts` 同构）：

```json
{
  "hasConflicts": true,
  "summary": { "mustHandle": 2, "suggestAdjust": 1, "total": 3 },
  "contractConflicts": {
    "hasConflicts": true,
    "mustHandle": 2,
    "conflictConstraintIds": ["c_max_daily_drive", "c_must_places"]
  }
}
```

用 `conflictConstraintIds` 高亮 `itemsById` 中对应卡片；点击 conflict 项时读 `relatedConstraintIds`。

### 5.2 影响预览

```
POST /trips/:tripId/constraints/preview-impact
{
  "changes": [{ "constraintId": "c_max_daily_drive", "patch": { "value": 3 } }],
  "constraintsVersion": 3
}
```

展示字段（**优先读 `structuredImpact`**）：

```json
{
  "structuredImpact": {
    "summaryBullets": [
      "第 2 天可能需拆分…",
      "预计增加 1 晚住宿",
      "2 个景点可能需要移动或移除",
      "当前可执行性从 86 预计变为 63（-23）"
    ],
    "executeability": { "scoreBefore": 86, "scoreAfter": 63, "scoreDelta": -23 },
    "schedule": {
      "daysNeedingSplit": [2],
      "extraLodgingNights": 1,
      "poisToRelocate": [{ "dayNumber": 2, "itemId": "…", "label": "…" }]
    },
    "budget": { "deltaPct": 12, "deltaAmount": 1200, "currency": "CNY" },
    "constraintChanges": [
      { "constraintId": "c_max_daily_drive", "name": "每日驾驶上限", "before": 5, "after": 3, "unit": "hour" }
    ]
  },
  "recommendations": ["…summaryBullets 也会合并进 recommendations"]
}
```

兼容字段：`executeabilityDelta` / `budgetDelta` / `conflictsBefore|After`

`refreshType: "deep"` 时关注 `suggestedFollowUp` 触发重算。  
`persist: true` 时 `structuredImpact` 基于真实写入后的 assess/feasibility。

---

## 6. 与周边模块衔接

| 模块 | 衔接方式 |
|------|----------|
| **constraints-summary** | 左侧四块摘要（日期/预算/人数/交通）；详情跳转对应 `constraintId` |
| **团队协作中心** | 成员画像 / 否决权 UI 可写 `teamGovernance`；成员 wish → `team_members` section |
| **Decision Center** | `automation.defaultLevel` 越低，`DECISION_REQUIRED` issue 越少 |
| **planning-conflicts** | 冲突项 `relatedConstraintIds` ↔ 约束卡片联动 |
| **PATCH legacy 约束** | 仍走 `/constraints/:id`；与 contract PATCH 独立 |

---

## 7. 前端 Client 快速开始

```typescript
import {
  fetchConstraintConsole,
  patchTravelDecisionContract,
  previewConstraintImpact,
  checkConstraintConflicts,
} from './frontend-travel-decision-contract-api-client';

const view = await fetchConstraintConsole(tripId);

await patchTravelDecisionContract(tripId, {
  objectives: { rankedPrinciples: ['SAFETY', 'BUDGET', 'PACE'] },
  constraintsVersion: view.constraintsVersion,
});

const preview = await previewConstraintImpact(
  tripId,
  [{ constraintId: 'c_max_daily_drive', patch: { value: 3 } }],
  { constraintsVersion: view.constraintsVersion },
);
```

---

## 8. 常见错误码

| code | 处理 |
|------|------|
| `CONSTRAINTS_STALE` | 重新 GET，提示用户刷新 |
| `CONSTRAINT_LOCKED` | 先解锁再改值 |
| `OFFICIAL_RULE_READONLY` | 只读卡片，勿展示编辑 |
| `AI_INFERRED_HARD_FORBIDDEN` | AI 推断不可直接设 HARD |
