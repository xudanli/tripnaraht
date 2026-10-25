# 后台管理 — 旅行决策合同 API

> **Swagger tag**: `trips`  
> **Admin 主接口**: `GET /api/trips/admin/:id/decision-contract`  
> **响应壳**: `{ success, data, error }`  
> **Admin schemaId**: `tripnara.admin_trip_decision_contract@v1`  
> **合同 schemaId**: `tripnara.travel_decision_contract@v1`  
> **实现**: `src/trips/services/admin-trip-decision-contract.service.ts`  
> **DTO**: `src/trips/dto/admin-trip-decision-contract.dto.ts`  
> **合同类型**: `src/trips/trip-constraint-solver/types/travel-decision-contract.types.ts`  
> **用户侧完整字段**: [TRAVEL_DECISION_CONTRACT_FRONTEND_API.md](../trips/trip-constraint-solver/TRAVEL_DECISION_CONTRACT_FRONTEND_API.md)  
> **后台总览**: [ADMIN_API_GUIDE.md](./ADMIN_API_GUIDE.md)

---

## 1. 产品定位

约束控制台 **不是规则列表**，而是 **旅行决策合同**：

| 用户填写 | API 字段 | 页面区块 |
|----------|----------|----------|
| 这趟旅行优先优化什么 | `contract.objectives` | 旅行目标 |
| 绝不能突破什么 | `items`（HARD） | 必须满足 |
| 可妥协偏好 | `items`（SOFT） | 尽量满足 |
| 成员与决策权限 | `items`（MEMBER）+ `contract.teamGovernance` | 团队成员 |
| 变化时多激进 | `contract.changeStrategy` | 风险与变化策略 |
| 系统自动做到哪一步 | `contract.automation` | 自动化授权 |
| 冲突与改约束影响 | `contract.conflicts` | 冲突与影响 |
| 官方规则 / 实时验证 | `readonly_*` sections | 只读折叠区 |

**禁止**前端自行区分「用户约束 vs 官方规则」——用 `meta.sections` + `section.readonly` + `source.type`。  
**禁止**用 `type === 'HARD'` 推断红框——读 `item.cardTone`。

后台详情页按 `meta.sections` 分区渲染：有 `contractBlock` 的区块读 `contract.*`，其余用 `constraintIds` 从 `items` 取卡片。

---

## 2. 接口清单

后台管理系统对旅行决策合同 **只有只读投影**，不写库、不校验行程成员。

| 方法 | 路径 | 用途 | 写库 |
|------|------|------|------|
| **GET** | `/api/trips/admin/:id/decision-contract` | 行程旅行决策合同只读投影 | 否 |

写合同、改约束仍走用户侧（需行程成员），见 [§7](#7-写接口非-admin-路径)。

### 2.1 不要混用的接口

| 方法 | 路径 | 实际对象 |
|------|------|----------|
| GET | `/api/admin/saga/logs/:id/decision-contract` | Agent 动作 Saga 的 `DecisionContractV1`（期望状态 / 证据） |
| GET | `/api/admin/saga/logs/:id/decision-contract/compare` | 期望 vs 实际（预算 hold + 物理规则 PASS/DRIFT） |

Saga 接口见 [§8](#8-saga-decisioncontract勿与旅行决策合同混用)。

---

## 3. GET `/api/trips/admin/:id/decision-contract`

与用户侧 `GET /api/trips/:tripId/constraints` **同构**（`meta.sections` 7+2 分区 + `items` + `contract`），差异：

| 项 | Admin | 用户侧 |
|----|-------|--------|
| 成员校验 | **不校验** | 必须是行程成员 |
| 上下文用户 | 愿望/风险优先用 **OWNER**；无协作者时 `contextUserId=null`，内部用 `admin-readonly` | 当前登录用户 |
| 冲突计算 | **默认轻量读**：跳过 planning-conflicts 与执行风险聚合 | 默认快路径；`?includeConflicts=full` 可全量 |
| 写库 | 否 | GET 不写；PATCH/POST 写 |

### 3.1 鉴权

当前 `TripsController` 标了 `@Public()`（开发期临时开放）。生产应对齐其它 Admin：

```
Authorization: Bearer <admin-jwt>
```

或配置了 `ADMIN_GOD_API_KEY` 时使用 `x-admin-god-key` / `Bearer <god-key>`。角色：`ADMIN` / `OPERATOR`。

登录：`POST /api/admin/auth/login`。

### 3.2 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | UUID | 是 | 行程 ID |

### 3.3 Query

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `HARD` \| `SOFT` \| `EXTERNAL` | 否 | 过滤 `items` |
| `category` | 见 [§5.2](#52-枚举) | 否 | 过滤类别 |
| `status` | 见 [§5.2](#52-枚举) | 否 | 过滤状态 |
| `conflictOnly` | `true` / `1` | 否 | 仅返回 `hasConflict` 的卡片 |
| `memberId` | string | 否 | DTO 有字段；Admin 轻量读 **当前不生效** |
| `dayId` | string | 否 | DTO 有字段；Admin 轻量读 **当前不生效** |
| `includeConflicts` | `full` / `1` | 否 | 用户侧可拉全量冲突；**Admin 恒跳过**，此参数无效 |

> **性能**：Admin 固定走 `listLightweight`（`skipPlanningConflicts` + `skipRiskActivation`）。响应含 `degraded.planningConflictsSkipped=true`。冲突高亮可能为空；完整冲突请用 `POST /api/trips/:tripId/constraints/check`（需成员身份）。

### 3.4 成功响应

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.admin_trip_decision_contract@v1",
    "tripId": "trip-001",
    "capturedAt": "2026-08-16T10:00:00.000Z",
    "contextUserId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "degraded": {
      "planningConflictsSkipped": true,
      "riskActivationSkipped": true
    },
    "meta": {
      "tripId": "trip-001",
      "constraintsVersion": 3,
      "total": 12,
      "byType": { "HARD": 5, "SOFT": 6, "EXTERNAL": 1 },
      "byStatus": { "ACTIVE": 10, "DRAFT": 2 },
      "conflictCount": 1,
      "pendingConfirmCount": 0,
      "countryCode": "IS",
      "sections": [
        { "key": "travel_objectives", "label": "旅行目标", "constraintIds": [], "contractBlock": "objectives" },
        { "key": "hard_must_satisfy", "label": "必须满足", "constraintIds": ["c_time_range", "c_budget_total"] },
        { "key": "soft_prefer", "label": "尽量满足", "constraintIds": ["c_pacing_level"] },
        { "key": "team_members", "label": "团队成员", "constraintIds": ["c_travelers"], "contractBlock": "team_governance" },
        { "key": "change_strategy", "label": "风险与变化策略", "constraintIds": [], "contractBlock": "change_strategy" },
        { "key": "automation", "label": "自动化授权", "constraintIds": [], "contractBlock": "automation" },
        { "key": "conflicts_and_impact", "label": "冲突与影响", "constraintIds": [], "contractBlock": "conflicts" },
        { "key": "readonly_official", "label": "目的地规则", "constraintIds": ["c_official_is_froad_2wd"], "readonly": true },
        { "key": "readonly_world", "label": "实时验证快照", "constraintIds": [], "readonly": true }
      ]
    },
    "items": [
      {
        "id": "c_no_night_drive",
        "name": "不夜驾",
        "type": "HARD",
        "category": "SAFETY",
        "enabled": true,
        "cardTone": "default",
        "source": { "type": "USER", "templateId": "no_night_drive" },
        "contractMeta": {
          "enabledSummary": "已启用：不夜驾",
          "scopeLabel": "整趟行程",
          "judgmentRule": "日落后 30 分钟不得继续驾驶",
          "violationResult": "BLOCK",
          "violationResultLabel": "阻断执行"
        }
      }
    ],
    "contract": {
      "schemaId": "tripnara.travel_decision_contract@v1",
      "tripId": "trip-001",
      "constraintsVersion": 3,
      "objectives": {
        "rankedPrinciples": ["SAFETY", "PACE", "CORE_EXPERIENCE"],
        "version": 1
      },
      "displayPrinciples": [
        { "key": "SAFETY", "label": "安全第一", "rank": 1 },
        { "key": "PACE", "label": "行程轻松", "rank": 2 },
        { "key": "CORE_EXPERIENCE", "label": "核心体验优先", "rank": 3 }
      ],
      "compiledWeights": { "legacy": {}, "canonical": {} },
      "changeStrategy": {
        "archetype": "BALANCED",
        "tolerances": { "maxBudgetOverrunPct": 10 }
      },
      "automation": {
        "defaultLevel": "SUGGEST",
        "autoAllowed": [],
        "confirmationRequired": ["change_lodging"]
      },
      "teamGovernance": { "rules": [] },
      "conflicts": {
        "hasConflicts": false,
        "mustHandle": 0,
        "suggestAdjust": 0,
        "pendingConfirm": 0,
        "conflictConstraintIds": []
      }
    }
  }
}
```

### 3.5 `data` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `schemaId` | string | 固定 `tripnara.admin_trip_decision_contract@v1` |
| `tripId` | string | 行程 ID |
| `capturedAt` | ISO string | 本次投影捕获时间 |
| `contextUserId` | string \| null | 组装愿望/风险用的用户（优先 OWNER）；无协作者为 `null` |
| `degraded.planningConflictsSkipped` | boolean | 恒 `true`：未跑可行性 / 规划冲突 |
| `degraded.riskActivationSkipped` | boolean | 恒 `true`：未聚合执行风险绑定的约束激活 |
| `meta` | object | 与用户侧 `GET /constraints` 的 `meta` 同构 |
| `items` | `TripConstraint[]` | 约束卡片列表，按 `id` 索引 |
| `contract` | `TravelDecisionContract` | 旅行决策合同 SSOT |

### 3.6 错误

| HTTP | `error.code` | 场景 |
|------|--------------|------|
| 404 | `NOT_FOUND` | 行程不存在 |
| 500 | `INTERNAL_ERROR` | 组装失败 |

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "行程 ID xxx 不存在"
  }
}
```

### 3.7 调用示例

```bash
# 完整合同
GET /api/trips/admin/{tripId}/decision-contract

# 仅 HARD 且冲突项
GET /api/trips/admin/{tripId}/decision-contract?type=HARD&conflictOnly=true
```

---

## 4. `meta.sections`（7+2 分区）

| `section.key` | 中文 | `contractBlock` | 渲染内容 |
|---------------|------|-----------------|----------|
| `travel_objectives` | 旅行目标 | `objectives` | `contract.displayPrinciples` 原则排序 |
| `hard_must_satisfy` | 必须满足 | — | HARD 约束卡片 |
| `soft_prefer` | 尽量满足 | — | SOFT 约束卡片 |
| `team_members` | 团队成员 | `team_governance` | 成员卡片 + `contract.teamGovernance.rules` |
| `change_strategy` | 风险与变化策略 | `change_strategy` | `contract.changeStrategy` |
| `automation` | 自动化授权 | `automation` | `contract.automation` |
| `conflicts_and_impact` | 冲突与影响 | `conflicts` | `contract.conflicts`（轻量读下冲突高亮常空） |
| `readonly_official` | 目的地规则 | — | 只读；`source.type === 'OFFICIAL_RULE'` |
| `readonly_world` | 实时验证快照 | — | 只读 |

`readonly: true` 的区块隐藏编辑/删除。**禁止**把 `OFFICIAL_RULE` 放进 `hard_must_satisfy`。

### 4.1 详情页渲染伪代码

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
    if (view.degraded.planningConflictsSkipped) {
      renderDegradedHint('轻量读未计算冲突，完整冲突请走 constraints/check');
    }
    renderConflictSummary(view.contract.conflicts);
  }
  for (const c of constraints) {
    renderConstraintCard(c, { readonly: section.readonly });
  }
}
```

推荐加载顺序：

```
1) GET /api/trips/admin/:id
2) GET /api/trips/admin/:id/decision-contract
3) GET /api/trips/admin/:id/world-state   // 可选，六域世界状态
```

---

## 5. `contract` 字段

| 字段 | 说明 |
|------|------|
| `schemaId` | 固定 `tripnara.travel_decision_contract@v1` |
| `tripId` | 行程 ID |
| `constraintsVersion` | 乐观锁版本；所有写操作必带 |
| `objectives.rankedPrinciples` | 原则排序（靠前 = 更高优化权重） |
| `objectives.version` / `updatedAt` | 目标配置版本 |
| `displayPrinciples` | `{ key, label, rank }` 展示标签 |
| `compiledWeights.legacy` / `canonical` | 编译后的多目标权重 |
| `compiledWeights.softPreferences` | SOFT 约束 id / templateId → priority/10 |
| `changeStrategy.archetype` | `CONSERVATIVE` / `BALANCED` / `EXPLORATORY` |
| `changeStrategy.tolerances` | 见下表 |
| `automation.defaultLevel` | 四级授权 |
| `automation.autoAllowed` | 可自动执行的动作语义键（legacy） |
| `automation.confirmationRequired` | 必须用户确认的动作语义键（legacy） |
| `automation.actionOverrides` | 按 catalog action key 覆盖 `AUTO` / `ASK` / `DENY` |
| `automation.executionConditions` | 按 catalog action key 覆盖执行条件 |
| `teamGovernance.rules` | 团队决策规则 |
| `conflicts.hasConflicts` | 是否有冲突 |
| `conflicts.mustHandle` | 必须处理数 |
| `conflicts.suggestAdjust` | 建议调整数 |
| `conflicts.pendingConfirm` | 待确认数 |
| `conflicts.conflictConstraintIds` | 冲突约束 ID 列表 |

持久化形态在 `trip.metadata.travelDecisionContract`，另含 `automationPaused`、`automationScope`（`TRIP` \| `USER_TEMPLATE`）；GET 合成读模型以本表为准。

### 5.1 容忍度 `changeStrategy.tolerances`

| 字段 | 说明 |
|------|------|
| `maxBudgetOverrunPct` | 最大超预算百分比 |
| `maxDelayMinutes` | 最大延误分钟 |
| `maxPoiRemovals` | 最多删除 POI 数 |
| `allowTemporaryLodgingChange` | 允许临时改住宿 |
| `allowSameDayReroute` | 允许当日改线 |
| `acceptLowConfidencePlans` | 接受低置信方案 |

### 5.2 枚举

**旅行原则 `TravelPrincipleKey`**

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

**变化策略 `ChangeStrategyArchetype`**

| 值 | 中文 |
|----|------|
| `CONSERVATIVE` | 保守型 |
| `BALANCED` | 平衡型 |
| `EXPLORATORY` | 探索型 |

**自动化级别 `AutomationLevel`**

| 值 | 中文 |
|----|------|
| `INFORM_ONLY` | 仅提醒 |
| `SUGGEST` | 建议方案 |
| `AUTO_REPAIR_LOW_RISK` | 低风险自动修复 |
| `AUTO_EXECUTE_CONDITIONAL` | 条件式自动执行 |

**自动化权限 `AutomationPermissionTier`**: `AUTO` / `ASK` / `DENY`

**团队治理 `TeamGovernanceRuleType`**: `UNANIMOUS` / `MAJORITY` / `PAYER_CONFIRM` / `VETO` / `PROTECTIVE_PRIORITY`

**约束类型 `type`**: `HARD` / `SOFT` / `EXTERNAL`

**约束类别 `category`**: `TIME` / `BUDGET` / `DESTINATION` / `ACTIVITY` / `TRANSPORT` / `ACCOMMODATION` / `MEMBER` / `SAFETY` / `WORLD_STATE` / `CUSTOM`

**约束状态 `status`**: `DRAFT` / `ACTIVE` / `LOCKED` / `CONFLICTED` / `SATISFIED` / `UNSATISFIED` / `OUTDATED` / `DISABLED` / `SUPERSEDED`

**来源 `source.type`**: `USER` / `MEMBER` / `AI_INFERRED` / `PRIVATE_WISH` / `TEAM_CONSENSUS` / `OFFICIAL_RULE` / `WORLD_DATA`

---

## 6. 约束卡片 `items[]`

| 字段 | 说明 |
|------|------|
| `id` | 稳定 ID（legacy 如 `c_time_range`；模板如 `c_tpl_earliest_departure`） |
| `name` / `description` | 展示名 |
| `type` / `category` / `status` | 见 [§5.2](#52-枚举) |
| `enabled` | `status=DISABLED` 时为 `false` |
| `locked` | 官方规则常为 `true` |
| `cardTone` | `default` / `caution` / `danger` / `muted` |
| `hasConflict` | 轻量读下常为假 / 空 |
| `source.type` / `source.templateId` | 来源与模板 |
| `displayValue` | 侧栏摘要 |
| `contractMeta.enabledSummary` | 如「已启用：不夜驾」 |
| `contractMeta.scopeLabel` | 如「整趟行程」 |
| `contractMeta.judgmentRule` | 判定规则 |
| `contractMeta.violationResult` | `BLOCK` / `CONFIRM` |
| `contractMeta.violationResultLabel` | 阻断执行 / 需确认后调整 |
| `sectionKey` | 所属分区 |
| `value` / `scope` / `scopeBinding` | 判定参数与生效范围 |

**卡片样式**

| `cardTone` | 样式 |
|------------|------|
| `default` | 正常；HARD 可显示锁图标 |
| `caution` | 琥珀左边线（DRAFT） |
| `danger` | 红色左边线（`hasConflict`） |
| `muted` | 停用 |

官方规则：`source.type === 'OFFICIAL_RULE'` → 隐藏编辑/删除。

**常见稳定 ID**

| ID | 含义 |
|----|------|
| `c_time_range` | 行程日期 |
| `c_budget_total` | 总预算 |
| `c_travelers` | 出行人数 |
| `c_transport_mode` | 交通方式 |
| `c_pacing_level` | 节奏 |
| `c_must_places` / `c_avoid_places` | 必去 / 避开 |
| `c_max_daily_drive` | 单日驾驶上限 |
| `c_no_night_drive` | 不夜驾 |
| `c_official_is_froad_2wd` | 冰岛 F 路车辆准入（只读） |
| `c_official_is_winter_froad` | 冬季 F 路 |
| `c_official_is_red_alert` | 红色预警 |
| `c_official_is_wind_safety` | 大风安全 |

---

## 7. 写接口（非 Admin 路径）

后台 **没有** PATCH 合同接口。运营若要改合同，走用户侧（需行程成员 + `constraintsVersion` 乐观锁）：

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/trips/:tripId/constraints` | 完整读（可 `?includeConflicts=full`） |
| GET | `/api/trips/:tripId/constraints/catalog` | 约束模板目录（`?type=HARD\|SOFT`） |
| PATCH | `/api/trips/:tripId/constraints/contract` | 改目标 / 策略 / 自动化 / 团队治理 |
| POST | `/api/trips/:tripId/constraints` | 新增约束（catalog 模板） |
| PATCH | `/api/trips/:tripId/constraints/:constraintId` | 改单条约束 |
| DELETE | `/api/trips/:tripId/constraints/:constraintId` | 删除 |
| POST | `/api/trips/:tripId/constraints/:constraintId/disable` | 停用（不删存量字段） |
| POST | `/api/trips/:tripId/constraints/check` | 冲突检测（Admin 轻量读的补全路径） |
| POST | `/api/trips/:tripId/constraints/preview-impact` | 沙盘预览（默认不持久化） |
| POST | `/api/trips/:tripId/constraints/repair` | 修复建议 |

用户侧 Controller：`src/trips/trip-constraint-solver/controllers/trip-constraints.controller.ts`（当前亦为 `@Public()` + 成员校验）。

### 7.1 PATCH `/constraints/contract`

写入 `trip.metadata.travelDecisionContract`。

```http
PATCH /api/trips/{tripId}/constraints/contract
Content-Type: application/json

{
  "constraintsVersion": 3,
  "objectives": {
    "rankedPrinciples": ["SAFETY", "PACE", "CORE_EXPERIENCE", "BUDGET"]
  },
  "changeStrategy": {
    "archetype": "BALANCED",
    "tolerances": {
      "maxBudgetOverrunPct": 10,
      "maxDelayMinutes": 60,
      "allowSameDayReroute": true
    }
  },
  "automation": {
    "defaultLevel": "SUGGEST",
    "confirmationRequired": ["change_lodging"]
  },
  "teamGovernance": {
    "rules": [
      { "topic": "预算增加", "rule": "PAYER_CONFIRM", "thresholdPct": 15 }
    ]
  },
  "automationPaused": false,
  "automationScope": "TRIP",
  "resetAutomationToDefaults": false
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `constraintsVersion` | 建议 | 与 GET `meta.constraintsVersion` 对齐；过期 → `CONSTRAINTS_STALE` |
| `objectives.rankedPrinciples` | 否 | 原则排序，元素须在原则枚举内 |
| `changeStrategy` | 否 | 原型 + 容忍度（浅合并） |
| `automation` | 否 | 默认级别 / 动作列表 / overrides |
| `teamGovernance` | 否 | 规则列表 |
| `automationPaused` | 否 | 暂停本行程 AI 自动执行 |
| `automationScope` | 否 | `TRIP` / `USER_TEMPLATE` |
| `resetAutomationToDefaults` | 否 | 清空 `actionOverrides` / `executionConditions`，恢复 catalog 默认 |

### 7.2 写约束错误码（节选）

| `error.code` | 含义 |
|--------------|------|
| `CONSTRAINTS_STALE` | 乐观锁版本过期，重新 GET 再写 |
| `OFFICIAL_RULE_READONLY` | 官方规则不可 PATCH |
| `UNKNOWN_CONSTRAINT_TEMPLATE` | `templateId` 不在注册表 |
| `CONSTRAINT_TEMPLATE_ALREADY_EXISTS` | 同行程已添加该模板 |
| `LEGACY_CONSTRAINT_USE_PATCH` | `no_night_drive` / `budget_total` 等 legacy 项请 PATCH，勿 POST |
| `INVALID_SCOPE_BINDING` | `value.scopeBinding` 校验失败 |
| `FORBIDDEN` | 非行程成员 |
| `NOT_FOUND` | 行程或约束不存在 |

---

## 8. Saga DecisionContract（勿与旅行决策合同混用）

对象是 **单次 Agent 动作** 的期望状态，不是行程级旅行决策合同。

**鉴权**：`AdminStrictAuthGuard`（`Authorization: Bearer` 或 `x-admin-god-key`）。  
**响应壳**：`{ ok, ... }`，**不是** `{ success, data }`。  
**Controller**：`src/admin/controllers/agent-ops-admin.controller.ts`。

### 8.1 GET `/api/admin/saga/logs/:id/decision-contract`

| 字段 | 说明 |
|------|------|
| `ok` | 是否成功 |
| `id` | Saga log ID（= AgentActionLog id） |
| `decision_contract` | payload 上的 `DecisionContractV1`；无则为 `null` |
| `realized_state` | 实际落账状态 |
| `evidence_requirement_context` | 证据要求（如 FINANCIAL_HOLD） |
| `compare_path` | `/api/admin/saga/logs/{id}/decision-contract/compare` |
| `evidence_links[]` | `{ decision_log_id, qa_pair_path }` |

未找到 log：`{ ok: false, message: "Not found" }`。

### 8.2 GET `/api/admin/saga/logs/:id/decision-contract/compare`

对比合同期望 vs 实际：

- **预算 hold**：`variance.status` = `PASS` / `DRIFT`（metric `budget.hold_amount`，默认容差 1）
- **物理规则**：近 90 分钟 `decision_logs` 与 `physics_facts` 逐规则比较

每条规则 `status`：`PASS` / `DRIFT` / `MISSING_CURRENT` / `MISSING_EXPECTED` / `UNCOMPARABLE`。

无 `decision_contract`：`{ ok: false, message: "No decision_contract on saga payload" }`。

该 GET 会写入 Admin 审计日志。

---

## 9. 实现与类型

| 层 | 路径 |
|----|------|
| Admin Controller | `src/trips/trips.controller.ts` → `GET admin/:id/decision-contract` |
| Admin Service | `src/trips/services/admin-trip-decision-contract.service.ts` |
| Admin DTO | `src/trips/dto/admin-trip-decision-contract.dto.ts` |
| 用户侧 Controller | `src/trips/trip-constraint-solver/controllers/trip-constraints.controller.ts` |
| 合同 PATCH DTO | `src/trips/trip-constraint-solver/dto/travel-decision-contract.dto.ts` |
| 合同类型 | `src/trips/trip-constraint-solver/types/travel-decision-contract.types.ts` |
| 约束卡片类型 | `src/trips/trip-constraint-solver/types/trip-constraint.types.ts` |
| 前端 types / client | `dto/frontend-travel-decision-contract-api.types.ts` · `...-api-client.ts` |
| Saga Admin | `src/admin/controllers/agent-ops-admin.controller.ts` |

---

## 10. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-08-16 | 从实现抽取独立 Admin 对接文档 |
