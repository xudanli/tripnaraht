# 团队任务（任务 Tab）接口

> 目标 UI：团队 Hub「任务」Tab — 我的任务、团队任务、新建、领取/完成、提醒成员  
> 产品名：**Team Tasks（团队任务 / 轻量分工）**  
> 实现：`TeamTasksController` / `PackingTemplatesController` / `MyPackingListController`  
> Base：`/api/trips/:tripId/team-tasks` · 模板 `/packing-templates` · 个人清单 `/my-packing-list`  
> 鉴权：`Authorization: Bearer <token>`（须为行程成员；非生产无 token 回落 `anonymous-dev-user`）  
> iOS：`TeamHubTasksTab` / `TeamTaskRepository` / `TeamTaskModels`  
> **最后更新：** 2026-08-05  
> **后端状态：** P0 + P1 已落地

**不要与下列能力混淆：**

| 能力 | 路径 / 位置 | 说明 |
|------|-------------|------|
| **团队任务（本文）** | `/api/trips/:tripId/team-tasks/*` | 行前轻量分工：谁负责、做到哪 |
| Silent Vote / 待办决策 | `/api/trips/:tripId/silent-votes/*` | 决什么、写回行程；**不是**任务 |
| 自驾准备报告 | readiness / overall-readiness | 系统还差什么；可「认领为任务」桥接 |
| 团队账本 | `/api/trips/:tripId/ledger/*` | 支出流水与结算，与任务无关 |
| 打包清单模板 | `/api/trips/:tripId/packing-templates/*` | 模板能力，生成后写入 team-tasks 或个人清单 |

信封：统一 `StandardAPIResponse`（`success` / `data` / `error` / …）。

---

## 1. 接口一览

### P0

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/trips/:tripId/team-tasks?scope=all\|mine\|open` | 列表 + 统计（stats 始终全量；可选 `sourceType` / `refId`） |
| `POST` | `/api/trips/:tripId/team-tasks` | 新建（含 `source.itinerary_item` 幂等） |
| `POST` | `.../team-tasks/:taskId/claim` | 领取 |
| `POST` | `.../team-tasks/:taskId/complete` | 完成 |
| `PATCH` | `.../team-tasks/:taskId` | 改标题 / 负责人 / 截止 / 备注 |
| `DELETE` | `.../team-tasks/:taskId` | 软删 → `cancelled` |
| `GET` | `/api/trips/:tripId/packing-templates` | 模板目录 |
| `GET` | `/api/trips/:tripId/packing-templates/:templateId` | 模板条目 |
| `POST` | `.../team-tasks/from-packing-template` | `mode=team_tasks` 或 `personal_checklist` |

### P1

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `.../team-tasks/from-readiness` | body `{ itemIds }` → 认领为任务（assignee=自己, claimed） |
| `POST` | `.../team-tasks/:taskId/reopen` | `done` → `claimed` |
| `POST` | `.../team-tasks/remind` | 提醒成员（写日志 + 可选 APNs） |
| `GET` | `/api/trips/:tripId/my-packing-list` | 当前用户个人勾选清单 |
| `POST` | `/api/trips/:tripId/my-packing-list/items` | 手动新增 `{ titleZh, categoryZh? }` |
| `PATCH` | `/api/trips/:tripId/my-packing-list/items/:id` | `{ checked }` |
| `DELETE` | `/api/trips/:tripId/my-packing-list/items/:id` | 删除一项 |

---

## 2. 状态机

```text
open → claimed → done ⇄ claimed（reopen）
     ↘ cancelled（DELETE 软删；默认列表与 stats 不计）
```

---

## 3. P1 响应摘要

**from-readiness / from-packing-template (team_tasks)**  
`{ createdCount, taskIds, skippedDuplicates }`  
去重：`(tripId, source.type, source.refId)` 且 status ∈ open|claimed。

**from-packing-template (personal_checklist)**  
`{ createdCount, itemIds, skippedDuplicates }`

**remind**

```json
{
  "memberIds": ["m_li"],
  "message": "请尽快完成分配给你的团队任务，方便行程按时推进。",
  "sendAppPush": true,
  "allowRemindAgain": true
}
```

→ `{ "notifiedCount": 1, "skippedRecentlyReminded?": 0 }`  
`allowRemindAgain=false` 时跳过 24h 内已提醒成员。推送 eventType=`team_tasks_remind`，`changedSections` 含 `teamTasks`。

**my-packing-list**

```json
{
  "schemaId": "tripnara.my_packing_list.client@v1",
  "stats": { "total": 3, "checked": 1 },
  "items": [
    {
      "id": "...",
      "titleZh": "防风防水外套",
      "categoryZh": "衣物",
      "checked": false,
      "source": { "type": "packing_template", "refId": "rain_jacket", "templateId": "iceland_summer_v1" },
      "updatedAt": "..."
    }
  ]
}
```

- `POST .../items` → 完整 `MyPackingListItem`（`source.type=manual`）
- `DELETE .../items/:id` → `{ "deleted": true, "itemId": "..." }`

---

## 4. 错误码

| code | HTTP | 含义 |
|------|------|------|
| `VALIDATION_ERROR` | 400 | 标题空 / 非法成员 / 非法 dueAt |
| `NOT_TRIP_MEMBER` | 403 | 非行程成员 |
| `TASK_NOT_FOUND` | 404 | |
| `TEMPLATE_NOT_FOUND` | 404 | |
| `NOT_FOUND` | 404 | 个人打包项不存在 |
| `TASK_ALREADY_CLAIMED` | 409 | claim 冲突 |
| `TASK_INVALID_TRANSITION` | 409 | 状态机非法 |

---

## 5. 数据表

- `trip_team_tasks` — 任务主表（`status=cancelled` 软删）
- `trip_team_task_reminds` — 提醒日志（冷却去重）
- `trip_my_packing_list_items` — 个人打包勾选清单

WS：`changedSections` 含 `teamTasks`；remind 推送走 `teamTasksRemindBus` → Mobile APNs。

---

## 6. iOS 对照

| 契约 | 代码 |
|------|------|
| Tab | `TeamHubTab.tasks` |
| 列表 UI | `TeamHubTasksTab` |
| 新建 | `CreateTeamTaskSheet` |
| 打包模板 | `PackingTemplateSheet` |
| 提醒 | `RemindTeamTasksView` → `POST .../remind` |
| 个人打包清单 | `MyPackingListView` → GET/POST/PATCH/DELETE `.../my-packing-list` |
| 模型 | `TeamTaskModels.swift` |
| 仓库 | `TeamTaskRepository`（Mock / `HTTPTeamTaskRepository`） |
| 依赖注入 | `DependencyContainer.teamTaskRepository` |

---

## 7. 日程联动（itinerary_item）

`source.type` 已知值：`manual` | `packing_template` | `readiness` | `ask_ai` | **`itinerary_item`**。未知 type **不 500**，写库后 GET **原样回传**。

**认领日程项（POST create）**

```json
{
  "title": "预订蓝湖门票",
  "source": {
    "type": "itinerary_item",
    "refId": "<itineraryItemId>",
    "labelZh": "日程 · 蓝湖"
  }
}
```

- `refId` 须属于本 trip 的 itinerary item，否则 `400 VALIDATION_ERROR`
- 去重：已存在 `(tripId, sourceType=itinerary_item, sourceRefId)` 且 status ∈ open|claimed → **幂等 200** 返回原任务；新建 → **201**
- `complete` / `reopen` / `DELETE` **不改** itinerary `bookingStatus`（预订同步由客户端另调既有 booking API）

**可选查询：** `GET .../team-tasks?sourceType=itinerary_item&refId=<itemId>`（stats 仍按全量未取消计算）

**WS：** 任务 CRUD 后广播 `changedSections: ['teamTasks']`（`teamTasksChangedBus`）。
