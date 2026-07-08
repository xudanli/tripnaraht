# AI 自动执行授权中心 · 前端接口文档

> 对应 UI：授权中心页（L0–L4 档位 + 6 组权限 + 执行边界 + 最近记录）  
> 版本 1.0.0 · 2026-07-04  
> 类型参考：`src/trips/travel-status/dto/frontend-travel-status-api.types.ts`

---

## 1. 页面与接口总览

| UI 区块 | 主要接口 | 说明 |
|---------|---------|------|
| **授权中心整页（推荐）** | `GET .../automation-authorization` | 聚合 contract + catalog + 记录 + 模板 |
| 顶栏 · 行程标题 | `GET /api/trips/:tripId` | 行程名、天数（现有 Trip API） |
| L0–L4 自主档位 | BFF 或 `PATCH .../automation-authorization` | `automation.defaultLevel` |
| 规则作用范围 | `PATCH .../automation-authorization` | `scope`: `TRIP` / `USER_TEMPLATE` |
| 6 组权限卡片 | BFF → `travelStatus.automation.catalog` | 读 |
| 单项权限切换 | `PATCH .../automation-authorization` | `automation.actionOverrides` |
| Tab：自动 / 需确认 / 禁止 | 前端过滤 `catalog` | 按 `effectiveTier` 分组计数 |
| 执行边界与条件 | BFF `contract` + PATCH | `changeStrategy` + `executionConditions` |
| 需确认成员 | `GET .../context-snapshot` | `members` + `contract.teamGovernance` |
| 最近自动执行记录 | BFF → `travelStatus.aiCompletedWork` | 含 `changeSummary` / `undo` |
| 撤销最近操作 | `POST .../ai-completed-work/:logId/undo` | |
| 暂停自动执行 | `POST .../automation-authorization/pause` | `{ paused, constraintsVersion }` |
| 恢复默认 | `POST .../automation-authorization/reset-defaults` | |
| 用户默认模板 | `GET/PUT /users/me/automation-authorization-template` | 「全部我的行程」 |
| 环境监控扫描 | `POST .../monitoring/scan` | 触发监控（无 body 或 `{}`） |

**推荐加载顺序：**

```text
1. GET /api/trips/:tripId/automation-authorization   → 单请求覆盖整页
2. GET /api/trips/:tripId/context-snapshot             → members（可选，渲染确认成员）
```

**细粒度接口（仍可用）：** `GET .../constraints`、`GET .../travel-status`、`PATCH .../constraints/contract`

---

## 2. 读：授权中心聚合数据

### `GET /api/trips/:tripId/travel-status`

**用途：** 权限 6 组列表、Tab 计数、最近 AI 自动执行记录、是否暂停。

**响应（节选）：**

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.travel_status@v1",
    "tripId": "trip-1",
    "automation": {
      "defaultLevel": "SUGGEST",
      "defaultLevelLabel": "生成建议，需您确认后修改",
      "uiLevel": "L2",
      "uiLevelLabel": "建议执行",
      "tierCounts": { "auto": 28, "ask": 12, "deny": 4 },
      "paused": false,
      "scope": "TRIP",
      "catalog": {
        "schemaId": "tripnara.automation_authorization_summary@v1",
        "coldStartActionKeys": [
          "monitoring.weather_road_update",
          "time_route.update_eta"
        ],
        "groups": [
          {
            "group": "MONITORING",
            "label": "环境监控",
            "autoCount": 6,
            "askCount": 0,
            "denyCount": 0,
            "actions": [
              {
                "key": "monitoring.weather_road_update",
                "label": "更新天气与道路状态",
                "effectiveTier": "AUTO",
                "effectiveTierLabel": "自动处理",
                "defaultTier": "AUTO",
                "coldStart": true,
                "userOverride": null
              }
            ]
          }
        ]
      }
    },
    "aiCompletedWork": {
      "recentCount": 4,
      "items": [
        {
          "activityId": "acl_abc123",
          "occurredAt": "2026-07-04T10:00:00.000Z",
          "summary": "已根据室内备选调整第 2 天，共修改 1 项，可撤销",
          "changeSummary": "已根据室内备选调整第 2 天，共修改 1 项，可撤销",
          "kind": "AUTO_REPAIR",
          "problemId": "problem_1",
          "automatic": true,
          "reversible": true,
          "undo": {
            "enabled": true,
            "logId": "acl_abc123",
            "undoActionId": "original"
          },
          "status": "APPLIED"
        }
      ]
    }
  }
}
```

#### UI 映射

| UI | 字段 |
|----|------|
| L 档位选择器 | `uiLevel` / `uiLevelLabel`（或 `defaultLevel` 写回） |
| 6 组卡片标题 | `catalog.groups[].label` |
| 组内条目 | `catalog.groups[].actions[]` |
| 组右侧摘要 chip | 由 `autoCount/askCount/denyCount` 推导（见 §5） |
| Tab「可自动处理 (N)」 | `tierCounts.auto` |
| Tab「执行前需确认 (N)」 | `tierCounts.ask` |
| Tab「禁止自动执行 (N)」 | `tierCounts.deny` |
| 最近记录列表 | `aiCompletedWork.items` |
| 记录「已自动执行」标签 | `automatic === true` |
| 撤销按钮 | `undo.enabled === true` → 调 undo API |
| 暂停状态 | `automation.paused` |

> **C 端展示 SSOT：** `automation.catalog` + `tierCounts`。  
> **勿用：** `autoAllowed` / `confirmationRequired` / `autoAllowedCount` / `confirmationRequiredCount`（legacy 兼容字段，已从 travel-status 移除）。  
> **控制台 automation 区块：** 仅渲染 `catalog` 摘要（L 档位 + Tab 计数 + 六组），或整块隐藏；`context-snapshot.contract.automation` 不含权限列表。

---

### `GET /api/trips/:tripId/constraints`

**用途：** 全局 L 档位、执行边界（预算/时间/策略）、乐观锁版本号。

**响应（节选）：**

```json
{
  "success": true,
  "data": {
    "meta": {
      "constraintsVersion": 3
    },
    "contract": {
      "changeStrategy": {
        "archetype": "BALANCED",
        "tolerances": {
          "maxBudgetOverrunPct": 10,
          "maxDelayMinutes": 60,
          "maxPoiRemovals": 2,
          "allowTemporaryLodgingChange": false,
          "allowSameDayReroute": true
        }
      },
      "automation": {
        "defaultLevel": "SUGGEST",
        "actionOverrides": {
          "activity.trim_optional_items": "AUTO"
        },
        "executionConditions": {
          "activity.reorder_unbooked_low_priority": {
            "onlyUnbooked": true,
            "excludeCoreActivities": true,
            "maxItemsPerChange": 2
          }
        }
      },
      "teamGovernance": {
        "rules": [
          { "topic": "高风险活动", "rule": "UNANIMOUS" },
          { "topic": "预算增加", "rule": "PAYER_CONFIRM", "thresholdPct": 15 }
        ]
      }
    }
  }
}
```

#### UI 映射 · 执行边界侧栏

| UI 文案 | 字段 |
|---------|------|
| 预算变动上限 | `changeStrategy.tolerances.maxBudgetOverrunPct`（%） |
| 时间变动上限 | `changeStrategy.tolerances.maxDelayMinutes`（分钟/天） |
| 核心体验保护 | 各 action 的 `executionConditions.*.excludeCoreActivities` |
| 已预订项保护 | 各 action 的 `executionConditions.*.onlyUnbooked` |
| 需确认成员 | `teamGovernance.rules` + snapshot `members` |

---

### `GET /api/trips/:tripId/context-snapshot`

**用途：** 渲染「需确认成员」头像列表。

```json
{
  "data": {
    "members": { "count": 4, "travelers": [] },
    "contract": {
      "teamGovernance": { "rules": [] }
    }
  }
}
```

---

## 3. 写：保存授权规则

### `PATCH /api/trips/:tripId/constraints/contract`

**用途：** 「保存并应用规则」、L 档位切换、单项权限 override、执行条件。

**Headers / Body：**

```http
PATCH /api/trips/:tripId/constraints/contract
Content-Type: application/json

{
  "constraintsVersion": 3,
  "automation": {
    "defaultLevel": "AUTO_REPAIR_LOW_RISK",
    "actionOverrides": {
      "activity.trim_optional_items": "AUTO",
      "booking.change_lodging": "ASK"
    },
    "executionConditions": {
      "time_route.reorder_optional": {
        "onlyUnbooked": true,
        "excludeCoreActivities": true,
        "noCrossDay": true,
        "maxItemsPerChange": 3,
        "notifyOnApply": true,
        "teamCanUndo": true
      }
    }
  },
  "changeStrategy": {
    "tolerances": {
      "maxBudgetOverrunPct": 10,
      "maxDelayMinutes": 120
    }
  },
  "teamGovernance": {
    "rules": [
      { "topic": "预算增加", "rule": "PAYER_CONFIRM", "thresholdPct": 15 }
    ]
  }
}
```

| 场景 | PATCH 字段 |
|------|-----------|
| 切换 L2 → L3 | `automation.defaultLevel` |
| 切换某动作为「自动/需确认/禁止」 | `automation.actionOverrides[actionKey]` |
| 修改执行边界 | `changeStrategy.tolerances` + `executionConditions` |
| 恢复默认 | 清空 `actionOverrides`，`defaultLevel: "SUGGEST"` |

**错误：**

| HTTP | code | 处理 |
|------|------|------|
| 409 | `CONSTRAINTS_STALE` | 重新 GET constraints，带新 `constraintsVersion` 重试 |

---

## 4. L 档位与后端枚举（UI 四档）

C 端展示 **4 档**；L0/L1 后端均为 `INFORM_ONLY`，**合并为一档**展示（copy 可区分「仅回答 / 主动提醒」，写入时统一 `INFORM_ONLY`）。

| UI 档位 | `uiLevel` | 后端 `defaultLevel`（写入） | 行为摘要 |
|---------|-----------|----------------------------|---------|
| **观察与提醒**（L0/L1 合并） | `L0_L1` | `INFORM_ONLY` | 只更新事实与提醒，不改行程 |
| **建议执行**（推荐默认） | `L2` | `SUGGEST` | 出方案，改行程需确认 |
| **边界内自动执行** | `L3` | `AUTO_REPAIR_LOW_RISK` | 低风险自动修复 |
| **高度自主** | `L4` | `AUTO_EXECUTE_CONDITIONAL` | 满足 catalog + 执行条件时自动 apply |

**读：** `travelStatus.automation.uiLevel` + `uiLevelLabel`  
**写：** PATCH `automation.defaultLevel`（见上表右列）

**前端锁定 L3/L4：** 产品策略；后端不禁止写入，可由前端按 `coldStart` 或会员等级 gating。

**档位与单项 tier 关系：**

- 单项 `effectiveTier === 'AUTO'` 且 `defaultLevel` 为 `SUGGEST` / `INFORM_ONLY` 时，**仍不会自动改行程**（全局门控）。
- 只有 `AUTO_REPAIR_LOW_RISK` 或 `AUTO_EXECUTE_CONDITIONAL` 才允许 auto-apply 链执行。

**TypeScript 映射表（复制到前端）：** 见 `frontend-travel-status-api.types.ts` → `AUTOMATION_UI_LEVEL_MAP`。

---

## 5. 权限 Tier 与 UI 组件

### `AutomationPermissionTier`

| 值 | UI 文案 | Tab |
|----|---------|-----|
| `AUTO` | 自动处理 | 可自动处理 |
| `ASK` | 需要我确认 | 执行前需确认 |
| `DENY` | 禁止自动执行 | 禁止自动执行 |

**硬底线：** 部分 action 带 `floorTier`（如 `booking.payment` 永不可升为 AUTO），即使用户 override 也无效；前端应 disable 升级控件。

### 6 组 `group` 枚举

| `group` | UI 组名 |
|---------|--------|
| `MONITORING` | 环境监控 |
| `TIME_ROUTE` | 时间与路线 |
| `ACTIVITY` | 活动与体验 |
| `BUDGET_BOOKING` | 预算与预订 |
| `SAFETY` | 安全与风险 |
| `TEAM_PRIVACY` | 团队与隐私 |

### 组右侧 chip 文案（前端推导）

```typescript
function groupChip(g: AutomationGroupSummary): string {
  const n = g.actions.length;
  if (g.denyCount > 0 && g.denyCount >= n / 2) return '禁止自动执行';
  if (g.askCount === n) return '执行前需确认';
  if (g.autoCount === n) return '全部自动执行';
  if (g.autoCount > 0 && g.askCount > 0) return '部分自动执行';
  return '部分需确认';
}
```

---

## 6. 动作 Key 完整列表（catalog SSOT）

与 UI 组内条目一一对应；`label` 以 API 返回为准。

<details>
<summary>环境监控 MONITORING</summary>

| key | 默认 tier |
|-----|-----------|
| `monitoring.weather_road_update` | AUTO |
| `monitoring.poi_status` | AUTO |
| `monitoring.transport_status` | AUTO |
| `monitoring.booking_status` | AUTO |
| `monitoring.activity_status` | AUTO |
| `monitoring.trip_progress` | AUTO |
| `tasks.create_update_reminders` | AUTO |

</details>

<details>
<summary>时间与路线 TIME_ROUTE</summary>

| key | 默认 tier |
|-----|-----------|
| `time_route.update_eta` | AUTO |
| `time_route.shift_unstarted` | AUTO |
| `time_route.insert_rest_buffer` | AUTO |
| `time_route.insert_fuel_charge` | AUTO |
| `time_route.optimize_route` | AUTO |
| `time_route.reorder_optional` | AUTO |
| `time_route.check_day_feasibility` | AUTO |
| `time_route.reroute_for_closure` | ASK |
| `time_route.cross_day_move` | ASK |
| `plan.record_changes_sync` | AUTO |

</details>

<details>
<summary>活动与体验 ACTIVITY</summary>

| key | 默认 tier |
|-----|-----------|
| `activity.generate_plan_b` | AUTO |
| `activity.enable_plan_b` | ASK |
| `activity.reorder_unbooked_low_priority` | AUTO |
| `activity.replace_normal` | AUTO |
| `activity.trim_optional_items` | ASK |
| `activity.replace_core` | ASK |
| `activity.adjust_booked` | ASK |
| `decision_queue.surface_issues` | AUTO |

</details>

<details>
<summary>预算与预订 BUDGET_BOOKING</summary>

| key | 默认 tier |
|-----|-----------|
| `budget.forecast_update` | AUTO |
| `budget.increase` | ASK |
| `booking.change_lodging` | ASK |
| `booking.change_transport` | ASK |
| `booking.cancel` | ASK |
| `booking.payment` | DENY |

</details>

<details>
<summary>安全与风险 SAFETY</summary>

| key | 默认 tier |
|-----|-----------|
| `safety.reduce_intensity` | AUTO |
| `safety.avoid_closed_road` | AUTO |
| `safety.elevate_warnings` | AUTO |
| `safety.enable_high_risk_route` | DENY |
| `safety.ignore_official_warning` | DENY |
| `safety.lower_safety_level` | DENY |

</details>

<details>
<summary>团队与隐私 TEAM_PRIVACY</summary>

| key | 默认 tier |
|-----|-----------|
| `team.sync_plan_changes` | AUTO |
| `team.remind_members` | AUTO |
| `team.start_vote` | ASK |
| `team.send_external_message` | ASK |
| `team.share_location` | ASK |
| `team.proxy_consent` | DENY |

</details>

---

## 7. 执行条件 `executionConditions`

PATCH 时按 action key 设置；auto-apply 链执行前校验。

| 字段 | UI 含义 |
|------|---------|
| `onlyUnbooked` | 仅调整未预订活动 |
| `excludeCoreActivities` | 不碰核心体验 |
| `noCrossDay` | 不跨天移动 |
| `noBudgetIncrease` | 不增加预算 |
| `noDriveTimeIncrease` | 不增加驾驶时长 |
| `maxItemsPerChange` | 单次最多改 N 项 |
| `minMinutesBeforeActivity` | 活动开始前 N 分钟内不再改 |
| `notifyOnApply` | 执行后通知 |
| `teamCanUndo` | 允许撤销（影响 `undo.enabled`） |

---

## 8. 撤销与快捷操作

### 撤销 AI 自动修改

```http
POST /api/trips/:tripId/ai-completed-work/:logId/undo
```

**Body：** 无

**响应：**

```json
{
  "success": true,
  "data": {
    "submit": { "problemId": "...", "status": "...", "nextStep": "APPLY" },
    "apply": { "revalidation": { "status": "PASSED" } },
    "rolledBackLogId": "acl_abc123"
  }
}
```

**UI：** 最近记录 `undo.logId`；成功后刷新 `travel-status`。

### 暂停自动执行

- **读：** `automation.paused === true` 或 BFF `automationPaused`
- **写：** `POST /api/trips/:tripId/automation-authorization/pause` 或 PATCH BFF `automationPaused`

### 查看决策历史

→ `GET /api/trips/:tripId/decision-queue`

### 触发监控扫描（可选）

```http
POST /api/trips/:tripId/monitoring/scan?dayIndex=0
```

无 body，或 `{}`；**不要** send `null` body。

---

## 9. TypeScript 类型（前端复制）

见 `src/trips/travel-status/dto/frontend-travel-status-api.types.ts`（含 `AUTOMATION_UI_LEVEL_MAP`、`AutomationTierCounts`、`AutomationCatalogSummary`）。

**C 端展示约定：**

- 概览 Tab 计数 → `automation.tierCounts`
- 六组权限 → `automation.catalog.groups`
- L 档位 → `automation.uiLevel` / `uiLevelLabel`
- **勿用** `autoAllowed` / `confirmationRequired` 作展示（legacy，仅决策链 fallback）

补充类型：

```typescript
export type AutomationUiLevel = 'L0_L1' | 'L2' | 'L3' | 'L4';

export interface AutomationTierCounts {
  auto: number;
  ask: number;
  deny: number;
}

export type AutomationPermissionTier = 'AUTO' | 'ASK' | 'DENY';

export type AutomationLevel =
  | 'INFORM_ONLY'
  | 'SUGGEST'
  | 'AUTO_REPAIR_LOW_RISK'
  | 'AUTO_EXECUTE_CONDITIONAL';

export interface AutomationExecutionConditions {
  onlyUnbooked?: boolean;
  excludeCoreActivities?: boolean;
  noCrossDay?: boolean;
  noBudgetIncrease?: boolean;
  noDriveTimeIncrease?: boolean;
  maxItemsPerChange?: number;
  minMinutesBeforeActivity?: number;
  notifyOnApply?: boolean;
  teamCanUndo?: boolean;
}
```

---

## 10. 待接入 / 前端 Mock

| UI 能力 | 状态 |
|---------|------|
| 规则作用范围「全部我的行程」 | ✅ `GET/PUT /users/me/automation-authorization-template` |
| 管理规则模板 | ✅ 同上 + `POST .../reset-defaults` |
| L3/L4 解锁逻辑 | 前端 gating |
| 暂停自动执行 · 写 | ✅ `PATCH/POST .../automation-authorization/pause` 或 PATCH `automationPaused` |
| 临时提高自主性 | PATCH `defaultLevel` |
| 授权中心单页聚合 | ✅ `GET /trips/:id/automation-authorization` |
| 恢复默认 | ✅ `POST .../automation-authorization/reset-defaults` |

---

## 11. 新增接口（2026-07-04 补全）

### `GET /api/trips/:tripId/automation-authorization`

授权中心**单页聚合**（推荐前端主入口）。

**加载与空态：**

- 进入页面时展示 loading / 空态骨架
- 本接口返回 `success: true` 后，用 `data.travelStatus.automation.catalog.groups` 渲染 **固定 6 组**权限卡片，空态自动消失
- `catalog.groups.length` 恒为 **6**（顺序：环境监控 → 时间与路线 → 活动与体验 → 预算与预订 → 安全与风险 → 团队与隐私）
- 即使行程尚未保存过任何授权规则，也会返回 catalog 默认值（非空数组）

**就绪判定：**

```typescript
const ready =
  data?.schemaId === 'tripnara.automation_authorization_view@v1' &&
  data.travelStatus?.automation?.catalog?.groups?.length === 6;
```

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.automation_authorization_view@v1",
    "tripId": "trip-1",
    "scope": "TRIP",
    "constraintsVersion": 3,
    "automationPaused": false,
    "contract": {
      "automation": { "defaultLevel": "SUGGEST" },
      "changeStrategy": { "archetype": "BALANCED" }
    },
    "travelStatus": {
      "automation": {
        "defaultLevel": "SUGGEST",
        "defaultLevelLabel": "生成建议，需您确认后修改",
        "uiLevel": "L2",
        "uiLevelLabel": "建议执行",
        "tierCounts": { "auto": 28, "ask": 12, "deny": 4 },
        "paused": false,
        "scope": "TRIP",
        "catalog": {
          "schemaId": "tripnara.automation_authorization_summary@v1",
          "coldStartActionKeys": ["monitoring.weather_road_update", "time_route.update_eta"],
          "groups": [
            {
              "group": "MONITORING",
              "label": "环境监控",
              "autoCount": 6,
              "askCount": 0,
              "denyCount": 0,
              "actions": [{ "key": "monitoring.weather_road_update", "effectiveTier": "AUTO" }]
            },
            { "group": "TIME_ROUTE", "label": "时间与路线", "actions": [] },
            { "group": "ACTIVITY", "label": "活动与体验", "actions": [] },
            { "group": "BUDGET_BOOKING", "label": "预算与预订", "actions": [] },
            { "group": "SAFETY", "label": "安全与风险", "actions": [] },
            { "group": "TEAM_PRIVACY", "label": "团队与隐私", "actions": [] }
          ]
        }
      },
      "aiCompletedWork": { "recentCount": 0, "items": [] },
      "monitoring": { "activeCount": 0, "items": [] },
      "openDecisions": { "count": 0, "headline": "", "items": [] }
    },
    "userTemplate": { "schemaId": "tripnara.user_automation_authorization_template@v1" }
  }
}
```

> 示例中 `TIME_ROUTE` 等组 `actions` 省略为 `[]` 仅为篇幅；实际响应每组均含完整动作列表。

### `PATCH /api/trips/:tripId/automation-authorization`

「保存并应用规则」。

```json
{
  "scope": "USER_TEMPLATE",
  "constraintsVersion": 3,
  "automationPaused": false,
  "automation": {
    "defaultLevel": "AUTO_REPAIR_LOW_RISK",
    "actionOverrides": { "activity.trim_optional_items": "AUTO" }
  },
  "changeStrategy": { "tolerances": { "maxDelayMinutes": 120 } }
}
```

| `scope` | 行为 |
|---------|------|
| `TRIP` | 仅写入本行程 `travelDecisionContract` |
| `USER_TEMPLATE` | 写入 `UserProfile.preferences.automationAuthorization` 并同步到本行程 |

### `POST /api/trips/:tripId/automation-authorization/pause`

```json
{ "paused": true, "constraintsVersion": 3 }
```

### `POST /api/trips/:tripId/automation-authorization/reset-defaults`

恢复 catalog 默认（清空 overrides）。

### `GET /api/users/me/automation-authorization-template`

### `PUT /api/users/me/automation-authorization-template`

### `POST /api/users/me/automation-authorization-template/reset-defaults`

---

## 12. 相关文档

- [AI_AUTOMATION_AUTHORIZATION_CENTER.md](./AI_AUTOMATION_AUTHORIZATION_CENTER.md) — 产品 SSOT  
- [AI_ACTIVITY_LOG_FRONTEND_API.md](./AI_ACTIVITY_LOG_FRONTEND_API.md) — AI 活动记录页  
