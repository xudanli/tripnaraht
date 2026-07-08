# Trip Constraints API — 约束控制台统一 SSOT

> **Swagger Tag**: `trip-constraints`  
> **Global prefix**: `/api`  
> **响应**: `{ success, data, error }`  
> **架构收口（规划）：** [CONSTRAINT_SEMANTIC_CONSOLIDATION](../decision-runtime/CONSTRAINT_SEMANTIC_CONSOLIDATION.md)

约束控制台 V1 统一读写在 `GET/POST /trips/:tripId/constraints`；存量字段（intent / budget / wishes）在读时合成为 `TripConstraint`，写时路由到对应持久化层。

## 与 constraints-summary 的关系

| 能力 | 接口 |
|------|------|
| 左侧四块摘要（日期/预算/人数/交通） | `GET /trips/:tripId/constraints-summary` |
| 全量约束卡片 + 过滤 | `GET /trips/:tripId/constraints` |
| 确认约束包完整 | `PATCH /trips/:tripId/constraints/confirm` |

### Plan Studio 导航（2026-06）

**已移除左侧「团队」Tab。** 成员、协作者、决策画像、团队节奏等统一从 **右上角「团队协作中心」** 进入。

| 场景 | `pendingItems[].deepLink` / CTA |
|------|----------------------------------|
| 出行人数缺失 / 与成员不一致 | `openCollaborationCenter=1&section=members` |
| 交通方式 | `openIntent=1`（不变） |
| team_fit 摩擦 / 画像 | `decision-profiling` 子页（见 `uiHints.deepLink`，非 Plan Studio Tab） |

前端：删除 `tab=team` 路由与 Tab 项；解析 `openCollaborationCenter=1` 打开右上角协作面板。

## 端点一览

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/trips/:tripId/constraints` | 列表 + **旅行决策合同**（`contract` + 7+2 `sections`） |
| `PATCH` | `/trips/:tripId/constraints/contract` | 写旅行目标 / 变化策略 / 自动化授权 / 团队治理 |
| `POST` | `/trips/:tripId/constraints` | 新增 custom / private wish |
| `PATCH` | `/trips/:tripId/constraints/:constraintId` | 修改 |
| `DELETE` | `/trips/:tripId/constraints/:constraintId` | 删除 |
| `POST` | `/trips/:tripId/constraints/:constraintId/disable` | 停用 |
| `POST` | `/trips/:tripId/constraints/preview-impact` | 影响预览 |
| `POST` | `/trips/:tripId/constraints/check` | 冲突检测 |
| `POST` | `/trips/:tripId/constraints/repair` | 修复建议 |
| `POST` | `/trips/:tripId/planning/commands` | 批量 `UPDATE_CONSTRAINTS` + 可选重算 |

## GET 列表

**查询参数**:

| 参数 | 说明 |
|------|------|
| `type` | `HARD` / `SOFT` / `EXTERNAL` |
| `category` | `TIME` / `BUDGET` / … |
| `status` | `ACTIVE` / `DRAFT` / `CONFLICTED` / … |
| `conflictOnly` | `true` / `1` |

### 冰岛官方规则卡片（`destination=IS`，只读）

冰岛行程 GET 会**合成注入**以下 `EXTERNAL` + `OFFICIAL_RULE` 卡片（不写入 DB；`locked=true`；PATCH/DELETE/disable → **400** `OFFICIAL_RULE_READONLY`）：

| ID | ruleId | 说明 |
|----|--------|------|
| `c_official_is_froad_2wd` | STRAT_ICE_002 | F 路须四驱；2WD 禁止 |
| `c_official_is_winter_froad` | STRAT_ICE_001 | 11–4 月 F 路季节性关闭 |
| `c_official_is_red_alert` | STRAT_ICE_000 | SafeTravel 红色预警 |
| `c_official_is_wind_safety` | STRAT_ICE_003 | 横风/提车安全（运营建议） |

`planning-conflicts` / feasibility issue 会通过 `inferConflictConstraintIds` 映射到上述 ID，写入对应卡片的 `hasConflict` / `cardTone=danger`。

**响应 `meta` 扩展**（冰岛）：

```json
{
  "countryCode": "IS",
  "sections": [
    { "key": "user", "label": "你的约束", "constraintIds": ["c_time_range", "..."] },
    { "key": "official", "label": "冰岛通行规则", "constraintIds": ["c_official_is_froad_2wd", "..."] },
    { "key": "snapshot", "label": "实时验证", "constraintIds": ["c_world_feasibility"] }
  ]
}
```

前端：按 `meta.sections` 分区渲染；`source.type=OFFICIAL_RULE` 隐藏编辑/删除；冲突样式读 `hasConflict` / `cardTone`（勿用 `type===HARD` 判断官方规则）。

> **2026-07 升级**：`meta.sections` 已改为 **7+2 旅行决策合同分区**（`travel_objectives` / `hard_must_satisfy` / … / `readonly_official`）。  
> 完整前端对接见 **[TRAVEL_DECISION_CONTRACT_FRONTEND_API.md](./TRAVEL_DECISION_CONTRACT_FRONTEND_API.md)**。

**响应 `meta.sections`（新）**：

```json
{
  "sections": [
    { "key": "travel_objectives", "label": "旅行目标", "constraintIds": [], "contractBlock": "objectives" },
    { "key": "hard_must_satisfy", "label": "必须满足", "constraintIds": ["c_time_range", "c_budget_total"] },
    { "key": "soft_prefer", "label": "尽量满足", "constraintIds": ["c_pacing_level"] },
    { "key": "team_members", "label": "团队成员", "constraintIds": ["c_travelers"], "contractBlock": "team_governance" },
    { "key": "change_strategy", "label": "风险与变化策略", "constraintIds": [], "contractBlock": "change_strategy" },
    { "key": "automation", "label": "自动化授权", "constraintIds": [], "contractBlock": "automation" },
    { "key": "conflicts_and_impact", "label": "冲突与影响", "constraintIds": [], "contractBlock": "conflicts" },
    { "key": "readonly_official", "label": "目的地规则", "constraintIds": ["c_official_is_froad_2wd"], "readonly": true }
  ]
}
```

**响应 `data.contract`**（决策合同 SSOT）：

```json
{
  "schemaId": "tripnara.travel_decision_contract@v1",
  "objectives": { "rankedPrinciples": ["SAFETY", "PACE", "CORE_EXPERIENCE"], "version": 1 },
  "displayPrinciples": [{ "key": "SAFETY", "label": "安全第一", "rank": 1 }],
  "changeStrategy": { "archetype": "BALANCED", "tolerances": { "maxBudgetOverrunPct": 10 } },
  "automation": { "defaultLevel": "SUGGEST", "autoAllowed": ["shift_meal_within_30min"], "confirmationRequired": ["change_lodging"] },
  "conflicts": { "hasConflicts": false, "mustHandle": 0, "conflictConstraintIds": [] }
}
```

### POI 动态官方规则（P1，`destination=IS`）

当行程/itinerary/`metadata.constraints.mustPlaces` 命中冰岛 POI，且规则有效期与行程日期重叠时，**额外注入** POI 准入卡片：

| ID 模式 | 示例 | 来源 |
|---------|------|------|
| `c_official_poi_{ruleId}` | `c_official_poi_is_blue_lagoon_reservation_required` | `poi-access-capacity` fixtures |

仅注入：`enforcement=HARD`、预约类、车型限制、安全提示（SOFT）等；无 POI 命中或日期不重叠则不出现。

### 冲突 ↔ 约束联动（P1）

`POST /trips/:tripId/constraints/check` 与 `POST .../repair` 的 conflict / repair 响应含：

```json
{
  "relatedConstraintIds": [
    "c_official_is_froad_2wd",
    "c_official_poi_is_blue_lagoon_reservation_required"
  ]
}
```

前端：点击冲突项时用 `relatedConstraintIds` 高亮对应约束卡片；`repair.relatedConstraintIds` 同理。

### 约束卡片视觉（`cardTone`）

**禁止** `type === HARD` 即整卡红框。读 `items[].cardTone`：

| cardTone | 含义 | 建议样式 |
|----------|------|----------|
| `default` | 正常生效的硬/软约束 | 灰边框 + 右侧锁图标（硬约束） |
| `caution` | 待确认 / 草稿 `DRAFT` | 琥珀色左边线 2px |
| `danger` | 冲突 `CONFLICTED` / `hasConflict` | 红色左边线 2px（非整卡红框） |
| `muted` | 已停用 | 低对比灰 |

**响应 `data`**:

```json
{
  "meta": {
    "tripId": "…",
    "constraintsVersion": 3,
    "total": 12,
    "byType": { "HARD": 5, "SOFT": 6, "EXTERNAL": 1 },
    "byStatus": { "ACTIVE": 10, "DRAFT": 2 },
    "conflictCount": 2,
    "pendingConfirmCount": 1
  },
  "items": [ /* TripConstraint */ ],
  "contract": { /* TravelDecisionContract — 见 TRAVEL_DECISION_CONTRACT_FRONTEND_API.md */ }
}
```

### 合成约束稳定 ID（legacy）

| ID | 来源 |
|----|------|
| `c_time_range` | `Trip.startDate/endDate` |
| `c_budget_total` | Budget OS / `budgetConfig` |
| `c_travelers` | pacing / metadata |
| `c_transport_mode` | `pacingConfig.travelMode` |
| `c_pacing_level` | `pacingConfig.level` |
| `c_must_places` | `metadata.constraints.mustPlaces` |
| `c_avoid_places` | `metadata.constraints.avoidPlaces` |
| `c_daily_walk_limit` | `metadata.constraints.dailyWalkLimit` |
| `c_max_segment_distance` | `metadata.constraints.maxSegmentDistanceKm`（冰岛默认 250km；全球 fallback 300km） |
| `c_planning_policy` | `metadata.planningPolicy` |
| `c_lunch_strategy` | `metadata.lunch_strategy` |
| `c_world_feasibility` | `metadata.feasibilityReportSnapshot` |
| `c_wish_{wishId}` | `trip_wish_item` |
| `c_custom_*` | `metadata.unifiedConstraints[]` |

## POST 新增

**Body**（`CreateTripConstraintDto`）:

```json
{
  "name": "老人下午避免高强度",
  "category": "MEMBER",
  "type": "SOFT",
  "scope": { "type": "MEMBER_GROUP" },
  "operator": "AFTER",
  "value": { "hour": 15, "avoid": "high_intensity" },
  "unit": "hour",
  "priority": 8,
  "allowRelaxation": true,
  "source": { "type": "USER" },
  "visibility": "TEAM",
  "constraintsVersion": 3
}
```

- `type=HARD` + `source.type=AI_INFERRED` → **400** `AI_INFERRED_HARD_FORBIDDEN`
- `source.type=PRIVATE_WISH` → 写入 `/wishes` 并返回 `c_wish_*`
- 其他 → `metadata.unifiedConstraints`

## PATCH 修改

支持 legacy ID 与 `c_custom_*`；`c_wish_*` 请走 wishes API。

写操作可选 `constraintsVersion` 乐观锁；不匹配 → **409** `CONSTRAINTS_STALE`。

锁定：PATCH `locked: true` 写入 `metadata.legacyConstraintLocks`；锁定后改 `value` → **400** `CONSTRAINT_LOCKED`。

`c_max_segment_distance` PATCH 示例（改 max 会自动按冰岛比例补 warn；也可用 `tolerance` 显式指定 warn）：

```json
PATCH /trips/:tripId/constraints/c_max_segment_distance
{
  "value": 350,
  "constraintsVersion": 3
}
```

或同时指定 warn：

```json
{
  "value": { "maxSegmentDistanceKm": 350, "warnSegmentDistanceKm": 180 },
  "constraintsVersion": 3
}
```

旧冰岛 trip 批量 seed：`npx tsx scripts/backfill-iceland-segment-distance-constraints.ts --apply`

### `c_max_segment_distance` → 用户可见文案（后端必读）

**问题：** 左侧约束已显示用户值（如 380km），但 planning-conflicts / 决策检查器 / road_class finding 仍出现 `>250km` 文案。

**根因：** 250 仅是冰岛**国家默认**，不是写死常量；用户 PATCH `c_max_segment_distance` 后，部分聚合缓存或旧 finding 仍携带改阈值前 baked 的 message。

**生成 message 时必须：**

| 规则 | 实现 |
|------|------|
| 读当前有效上限 | `resolveSegmentDistanceThresholds({ destination, metadata })` → `maxSegmentDistanceKm`（用户 `metadata.constraints.maxSegmentDistanceKm` 优先于国家默认 250） |
| 禁止写死 250 | 文案用 `longDistanceHighMessage(thresholds.maxSegmentDistanceKm)` / `longDistanceWarnMessage(thresholds.warnSegmentDistanceKm)` |
| 判定 road_class | `segment.distance > thresholds.maxSegmentDistanceKm`（勿用冰岛 pack 常量直接比） |
| 约束变更后失效缓存 | planning-conflicts 缓存键须含 `constraintsVersion`（`{revision}:cv{N}`） |
| 读路径兜底刷新 | `findingToIssue` 对 `issueKind === 'road_class'` 调用 `refreshRoadClassTransportMessage(message, anchors.distanceKm, coverage.segmentDistanceThresholds)` |

**涉及链路：** `coverage-map` hazard → readiness finding → `feasibility-assembler` issue → `planning-conflicts` / `decision-checker` / Decision Semantics `decision-problems`。

**验收：** PATCH `c_max_segment_distance` 为 380 后，462km 路段仍报硬冲突（462>380），但文案须为 `超长距离行驶(>380km)…`，不得再出现 `>250km`。

**代码锚点：** `segment-distance-threshold.util.ts`、`coverage-map.service.ts`（`evaluateSegmentRisk`）、`feasibility-assembler.util.ts`（`findingToIssue`）、`planning-conflicts.service.ts`（`resolveRevisionKey`）。

## POST preview-impact

```json
{
  "changes": [
    {
      "constraintId": "c_budget_total",
      "patch": { "value": 22000, "unit": "CNY" }
    }
  ],
  "planId": "optional-plan-id",
  "persist": false
}
```

| 字段 | 说明 |
|------|------|
| `refreshType` | `quick`（软偏好）/ `deep`（硬约束） |
| `conflictsBefore` / `conflictsAfter` | planning-conflicts 摘要 |
| `suggestedFollowUp` | deep 时建议调用的下游端点 |

## POST check / repair

- `check` → 同 `GET planning-conflicts`
- `repair` → 同 `GET feasibility-report/issues/:issueId/repair-options`；body 可传 `issueId`

## 错误码

| code | 场景 |
|------|------|
| `CONSTRAINTS_STALE` | version 不匹配 |
| `CONSTRAINT_LOCKED` | 锁定约束被修改/删除 |
| `AI_INFERRED_HARD_FORBIDDEN` | AI 推断直接升为硬约束 |
| `OFFICIAL_RULE_READONLY` | 修改/删除/停用官方规则卡片 |
| `WISH_CONSTRAINT_USE_WISH_API` | 通过 wishes 改成员愿望 |
| `LEGACY_CONSTRAINT_USE_DEDICATED_API` | 日期/人数等需 PUT trip |

## POST planning/commands（V1.5）

```json
{
  "command": "UPDATE_CONSTRAINTS",
  "constraintsVersion": 3,
  "changes": [
    { "constraintId": "c_pacing_level", "patch": { "value": "relaxed" } }
  ],
  "recalculate": false
}
```

| 字段 | 说明 |
|------|------|
| `applied` | 成功写入的 constraintId 列表 |
| `recalcRecommended` | true 时应再调 route_and_run（或传 recalculate:true） |

## POST preview-impact 增强字段（V1.5）

| 字段 | 说明 |
|------|------|
| `assessBefore` / `assessAfter` | 接入 `POST /trips/:id/assess` 摘要 |
| `feasibilityBefore` / `feasibilityAfter` | 接入 feasibility-report |
| `executeabilityDelta` | score / mustHandle 变化 |
| `budgetDelta` | 预算 patch 与当前值差额 |

`persist=true` + `deep` 时对首个受影响日调用 `validate-scope`。

## 联调示例

```bash
curl "http://localhost:3000/api/trips/{tripId}/constraints?conflictOnly=true"
curl -X POST "http://localhost:3000/api/trips/{tripId}/constraints/preview-impact" \
  -H "Content-Type: application/json" \
  -d '{"changes":[{"constraintId":"c_pacing_level","patch":{"value":"relaxed"}}]}'
curl -X POST "http://localhost:3000/api/trips/{tripId}/constraints/check"
```

## 后续（V1.5+）

- `POST /planning/commands` `UPDATE_CONSTRAINTS` 批量写 + `recalculate`
- 影响预览接入 `assess` diff 与 `validate-scope` 真实重算
- 成员级约束与 decision-profiling 深度对齐
