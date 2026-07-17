# 执行阶段 — App Native 对接文档（第五阶段）

> **前置：** 登录 / 会话 / 资料 / 行程列表（见 [`SESSION_NATIVE_API.md`](./SESSION_NATIVE_API.md)、[`TRIPS_NATIVE_API.md`](./TRIPS_NATIVE_API.md)）  
> **Global prefix：** `/api`  
> **本阶段目标：** `TripLifecycle = traveling` 时三个 Tab（总览 / 今日行程 / 路线地图）  
> **响应格式：** `{ success, data, error }`  
> **Base URL（真机联调）：** `http://192.168.8.153:8080/api`  
> **最后更新：** 2026-07-17（P0 单项调整 / P1 日历·活动详情 / execution-risks recommendations 填满 + apply 写 Active Plan）

**文档路径：** [`src/auth/EXECUTE_NATIVE_API.md`](./EXECUTE_NATIVE_API.md)  
**实现代码：** `src/mobile/`（`MobileExecutionController` + `MobileExecutionService` + `MobileExecutionWriteService`）  
**Swagger Tag：** `mobile-execution`（启动后访问 `/api-docs` 可预览）

---

## 0. 接口一览

### P0 — 替换 Preview 数据（已实现）

| 优先级 | 方法 | 路径 | 对应 iOS ViewData |
|--------|------|------|-------------------|
| P0 | GET | `/api/mobile/trips/{tripId}/context-snapshot` | `TripContextSnapshot` |
| P0 | GET | `/api/mobile/trips/{tripId}/execution-overview` | `ExecutionOverviewViewData` |
| P0 | GET | `/api/mobile/trips/{tripId}/today-itinerary` | `TodayItineraryViewData` |
| P0 | GET | `/api/mobile/trips/{tripId}/live-route` | `LiveRouteViewData` |

### P1 — 详情子资源（已实现）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/mobile/trips/{tripId}/itinerary-calendar` | **行程日历** — tripTitle / dateRange / 天列表（weekday·地点·活动数·status·天气）+ overview；切天用 today-itinerary?dayIndex |
| GET | `/api/mobile/trips/{tripId}/activities/{activityId}` | **活动详情**（确认码/商家/成员/导航点） |
| GET | `/api/mobile/trips/{tripId}/activities/{activityId}/execution-detail` | 同上（执行态别名） |
| GET | `/api/mobile/trips/{tripId}/execution/execution-alerts` | **执行预警（第一层）** — STOP / REPLAN_REQUIRED / AT_RISK |
| GET | `/api/mobile/trips/{tripId}/execution/adjustment-queue` | **待调整事项（第二层）** — `ExecutionIntervention[]` + `causalChain` |
| GET | `/api/mobile/trips/{tripId}/execution/interventions/{id}/causal-trace` | 单个调整项因果链完整回放 |
| GET | `/api/mobile/trips/{tripId}/execution/risk-alerts` | ⚠️ 已废弃，等同 `execution-alerts` |
| GET | `/api/mobile/trips/{tripId}/execution/pending-adjustments` | ⚠️ 已废弃，等同 `adjustment-queue` |
| GET | `/api/mobile/trips/{tripId}/execution/today-progress` | 今日进度 |
| GET | `/api/mobile/trips/{tripId}/execution/team-status` | 团队状态（含相对距离） |
| GET | `/api/mobile/trips/{tripId}/intercom/messages` | 对讲消息历史 |
| GET | `/api/mobile/trips/{tripId}/intercom/summary` | 对讲 AI 摘要 |
| GET | `/api/mobile/trips/{tripId}/execution/road-conditions` | 路况详情 |
| GET | `/api/mobile/trips/{tripId}/execution/meeting-points/{pointId}` | 集合点详情 |

### P1 — 写操作（已实现）

| 方法 | 路径 | 用途 | 状态 |
|------|------|------|------|
| **PATCH** | `/api/mobile/trips/{tripId}/activities/{activityId}` | **单项调整行程**（改计划时间/标题/备注） | ✅ |
| POST | `/api/mobile/trips/{tripId}/decisions/{decisionId}/accept` | 接受决策/调整 | ✅ |
| POST | `/api/mobile/trips/{tripId}/decisions/{decisionId}/defer` | 延后决策 | ✅ |
| PUT | `/api/mobile/trips/{tripId}/members/{memberId}/presence` | 位置心跳 | ✅ |
| POST | `/api/mobile/trips/{tripId}/execution-events` | 记录事件（append-only） | ✅ |
| POST | `/api/mobile/trips/{tripId}/notifications` | 团队通知 | ✅ |
| POST | `/api/mobile/trips/{tripId}/activities/{activityId}/complete` | 标记活动完成 | ✅ |
| POST | `/api/mobile/trips/{tripId}/emergency/sos` | SOS 紧急求助 | ✅ |
| GET | `/api/mobile/trips/{tripId}/emergency-pack` | 行程应急资料包 | ✅ |
| GET | `/api/mobile/trips/{tripId}/emergency/local-numbers` | 目的地紧急号码 | ✅ |
| GET | `/api/mobile/users/me/emergency-contacts` | 紧急联系人（读） | ✅ |
| PUT | `/api/mobile/users/me/emergency-contacts` | 紧急联系人（写） | ✅ |
| POST | `/api/mobile/users/me/push-tokens` | 注册 APNs device token | ✅ |
| DELETE | `/api/mobile/users/me/push-tokens/{deviceId}` | 注销 device token | ✅ |
| GET | `/api/mobile/trips/{tripId}/emergency/sos/active` | 活跃 SOS 状态 | ✅ |
| POST | `/api/mobile/trips/{tripId}/emergency/sos/{sosId}/acknowledge` | 领队确认收到 SOS | ✅ |
| POST | `/api/mobile/trips/{tripId}/emergency/sos/{sosId}/resolve` | 解除/取消 SOS | ✅ |
| POST | `/api/mobile/trips/{tripId}/emergency/location-share` | 开启紧急位置共享 | ✅ |
| DELETE | `/api/mobile/trips/{tripId}/emergency/location-share` | 关闭紧急位置共享 | ✅ |
| POST | `/api/mobile/trips/{tripId}/navigation/sessions` | 导航会话同步 | ✅ |
| POST | `/api/mobile/trips/{tripId}/intercom/messages` | 对讲消息（语音 multipart / 文字 JSON） | ✅ |

### 仍可复用的既有接口

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/trips/{tripId}/state` | 下一站 / ETA（MVP 联调） |
| GET | `/api/trips/{tripId}/in-trip/execution-advisory` | 行中守护 Plan B |
| POST | `/api/trips/{tripId}/in-trip/execution-advisory/recommendations/{id}/apply` | 应用推荐 |
| GET | `/api/trips/attention-queue?tripId={tripId}` | 列表角标 + 风险源 |
| POST | `/api/trips/{tripId}/in-trip/comms/sync` | 对讲消息同步（完整能力） |
| GET | `/api/trips/{tripId}/in-trip/comms` | 对讲历史 |

### 用户通用（非行程绑定，已实现）

| 方法 | 路径 | 用途 | 状态 |
|------|------|------|------|
| POST | `/api/contact/message` | 联系我们（文本 + 图片反馈） | ✅ |

> 实现于 `src/contact/`（非 Mobile BFF 前缀）；与 Web 共用同一接口。详见 **§7.19**。

**通用请求头：**

```
Authorization: Bearer <accessToken>
X-Trip-Id: <tripId>          # 建议
X-Client-Version: 1.0.0      # 建议
```

**写操作请求头（建议）：**

```
Idempotency-Key: <uuid>     # 幂等重放
If-Match: <contextVersion>  # 乐观锁（可选，冲突返回 CONTEXT_VERSION_CONFLICT）
```

### 0.1 响应信封（Mobile BFF 已实现）

所有 `/api/mobile/trips/{tripId}/*` 响应在 `{ success, data, error }` 基础上，**根级**附带：

```json
{
  "success": true,
  "data": { "contextVersion": 300012345, "planVersion": 5, "...": "..." },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "tripId": "trip-uuid",
  "contextVersion": 300012345,
  "planVersion": 5,
  "serverTime": "2026-07-08T12:00:00.000Z"
}
```

| 字段 | 说明 |
|------|------|
| `requestId` | 本次请求 UUID，便于日志关联 |
| `tripId` | 路径中的行程 ID |
| `contextVersion` | 从 `data.contextVersion` 投影到根级（便于 iOS 统一读取） |
| `planVersion` | 当前方案版本（`constraintsVersion`） |
| `serverTime` | 服务器 UTC 时间 |

错误响应同样携带 `requestId` / `tripId` / `serverTime`；`409 CONTEXT_VERSION_CONFLICT` 时根级 `contextVersion` 为 **当前** 版本。

### 0.2 WebSocket `trip_context_changed`（已实现）

**路径（无 `/api` 前缀）：**

```
ws://127.0.0.1:3000/ws?token=<accessToken>     # 开发
wss://tripnara.com/ws?token=<accessToken>      # 生产
```

**关闭：** `MOBILE_TRIP_CONTEXT_WS_ENABLED=false`

**客户端 → 服务端：**

```json
{ "type": "subscribe", "tripId": "trip-uuid" }
{ "type": "unsubscribe", "tripId": "trip-uuid" }
{ "type": "ping" }
```

> Token 也可放在 `subscribe.token`，或 URL query `?token=`。

**服务端 → 客户端（订阅成功）：**

```json
{ "type": "subscribed", "tripId": "trip-uuid", "serverTime": "..." }
```

**服务端 → 客户端（上下文变更）：**

```json
{
  "type": "trip_context_changed",
  "tripId": "trip-uuid",
  "contextVersion": 300012346,
  "changedSections": ["execution", "team", "intercom"],
  "planVersion": 5,
  "serverTime": "2026-07-08T12:00:05.000Z"
}
```

**iOS 行为：** 收到 push 后，若 `contextVersion > 本地缓存`，刷新 `context-snapshot` 或 `changedSections` 对应读模型。无 WebSocket 时继续轮询 `contextVersion`。

**服务端 → 客户端（对讲新消息，P1）：**

```json
{
  "type": "intercom_message",
  "tripId": "trip-uuid",
  "contextVersion": 300012347,
  "message": {
    "id": "msg-uuid",
    "clientId": "client-uuid",
    "tripId": "trip-uuid",
    "senderId": "user-1",
    "senderName": "张三",
    "kind": "text",
    "body": "我有点累，想在前面休息一会儿~",
    "sentAt": "2026-07-09T08:02:00.000Z",
    "deliveryStatus": "sent",
    "transport": "cloud",
    "isOwn": false
  },
  "serverTime": "2026-07-09T08:02:00.100Z"
}
```

| 字段 | 说明 |
|------|------|
| `message.kind` | `voice` \| `text` \| `status` \| `system` |
| `message.isOwn` | 按订阅连接用户计算；发送方收到 `true` |
| 触发时机 | 语音/文字 POST、快捷状态 notifications 写入对讲流后 |

**iOS 行为（对讲）：**

- 收到 `intercom_message` → 直接追加消息列表（优先于全量刷新）
- 收到 `trip_context_changed` 且 `changedSections` 含 `intercom` → `GET .../intercom/messages?after=<lastId>` 增量补偿

**APNs 自定义 payload（根级，与 `aps` 并列）：**

```json
{
  "aps": {
    "alert": { "title": "SOS · 医疗求助", "body": "张三 发起紧急求助" },
    "sound": "default"
  },
  "tripId": "trip-uuid",
  "contextVersion": 300012346,
  "eventType": "sos",
  "changedSections": ["execution", "risks", "team"],
  "planVersion": 5,
  "sosId": "sos-uuid"
}
```

| eventType | 触发场景 |
|-----------|----------|
| `sos` | SOS 发起 / 确认 / 解除 |
| `risk_alert` | `risk_alert` / `location_update` 团队通知 |
| `team_notification` | 其他团队通知 |
| `decision` | 决策 accept / defer |

**触发时机：** 写操作（events / notifications / complete / SOS / navigation / intercom）、决策 accept/defer、成员 presence 上报；**APNs** 在 SOS / 团队通知 / 决策等关键事件额外推送（需注册 push token）。

---

## 1. 何时进入执行阶段

| API `Trip.status` | iOS `TripLifecycle` |
|-------------------|---------------------|
| `PLANNING` 等 | `planning` |
| `TRAVELING` / `IN_PROGRESS` | `traveling` |
| `COMPLETED` | `completed` |

进入行中：`PATCH /api/trips/{tripId}` → `{ "status": "TRAVELING" }`  
行中模块需：`IN_TRIP_EXECUTION_ENABLED=true`（`in-trip/today` 等子模块）。

---

## 2. GET /api/mobile/trips/{tripId}/context-snapshot

领域 SSOT 的 **Mobile 投影**（Web 仍用 `/api/trips/{tripId}/context-snapshot`，Schema 不同）。

### 2.1 请求

```
GET /api/mobile/trips/{tripId}/context-snapshot
Authorization: Bearer <accessToken>
```

### 2.2 成功响应 200

```json
{
  "success": true,
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "tripId": "trip-uuid",
  "contextVersion": 300012345,
  "planVersion": 5,
  "serverTime": "2026-07-08T12:00:00.000Z",
  "data": {
    "trip": {
      "id": "trip-uuid",
      "name": "冰岛环岛",
      "destination": "IS",
      "startDate": "2026-07-08",
      "endDate": "2026-07-15"
    },
    "lifecycle": "traveling",
    "contextVersion": 300012345,
    "planVersion": 5,
    "activePlan": {
      "id": "plan-uuid",
      "version": 5,
      "title": "冰岛环岛 执行方案"
    },
    "members": [
      { "id": "user-1", "displayName": "张三", "role": "leader", "avatarUrl": "https://..." }
    ],
    "decisions": [
      { "id": "problem-1", "title": "缩短冰川徒步", "status": "pending" }
    ],
    "worldFacts": [
      { "id": "fact-1", "category": "weather.wind", "summary": "..." }
    ],
    "execution": {
      "currentActivityID": "item-uuid",
      "nextActivityID": "item-uuid-2",
      "progressPercent": 0.6
    },
    "readiness": null,
    "notifications": [
      { "id": "att-1", "category": "risk", "title": "强风预警", "createdAt": "..." }
    ],
    "generatedAt": "2026-07-08T12:00:00.000Z"
  }
}
```

### 2.3 字段说明

| 字段 | 说明 |
|------|------|
| `contextVersion` | int64，用于缓存/乐观锁；mutation 后应递增 |
| `lifecycle` | `planning` \| `traveling` \| `completed` \| `cancelled` |
| `execution` | 仅 `traveling` 时非 null |
| `members[].role` | `leader`（OWNER/EDITOR）\| `member` |

---

## 3. GET /api/mobile/trips/{tripId}/execution-overview

对应 **`ExecutionOverviewViewData`**，1:1 字段名。

### 3.1 请求

```
GET /api/mobile/trips/{tripId}/execution-overview?dayIndex=1
GET /api/mobile/trips/{tripId}/execution-overview?lite=1
Authorization: Bearer <accessToken>
```

| Query | 说明 |
|-------|------|
| dayIndex | 可选，默认按服务器日期计算 Day N |
| lite | `1`/`true`：跳过 AI advisory，首屏更快；`data.meta.partial=true` |

> 首屏建议 `?lite=1` 先渲染 skeleton，再不带 lite 拉完整 `aiInsight`。

### 3.2 成功响应 200（结构摘要）

```json
{
  "success": true,
  "data": {
    "tripName": "冰岛环岛",
    "dayLabel": "Day 1",
    "lifecycleLabel": "旅行中",
    "isExecuting": true,
    "contextVersion": 300012345,
    "currentActivity": {
      "title": "蓝湖",
      "subtitle": "计划 10:00 开始",
      "locationName": "蓝湖",
      "meetingPoint": "蓝湖",
      "meetingTime": "10:00 集合",
      "estimatedArrival": "10:05",
      "remainingTime": "剩余 1h 20m",
      "progress": 0.35,
      "imageUrl": "https://cdn.example.com/blue-lagoon.jpg",
      "currentLocationName": "204号公路 · 距营地 3.2km"
    },
    "metrics": [
      { "id": "time", "icon": "clock.fill", "title": "时间", "value": "12:00", "detail": "Atlantic/Reykjavik" },
      { "id": "weather", "icon": "cloud.sun.fill", "title": "天气", "value": "数据同步中", "detail": "—" },
      { "id": "wind", "icon": "wind", "title": "脆弱度", "value": "yellow", "detail": "稳定 62%" },
      { "id": "signal", "icon": "antenna.radiowaves.left.and.right", "title": "就绪", "value": "82", "detail": "今日可执行度" }
    ],
    "team": {
      "activeCount": 4,
      "totalCount": 4,
      "summary": "4 位成员同行",
      "trackingDeviceCount": 0,
      "members": [
        { "id": "u1", "name": "张三", "role": "leader", "status": "online" }
      ]
    },
    "statusRows": [
      { "id": "risk", "icon": "exclamationmark.triangle.fill", "title": "执行预警", "badgeCount": 2, "detail": "2 项需立即关注", "style": "risk" },
      { "id": "adjust", "icon": "arrow.triangle.branch", "title": "待调整", "badgeCount": 4, "detail": "4 项待处理", "style": "adjustment" },
      { "id": "progress", "icon": "chart.line.uptrend.xyaxis", "title": "今日进度", "detail": "2/5 已完成", "progress": 0.4, "style": "progress" }
    ],
    "quickActions": [
      { "id": "adjust-itinerary", "icon": "arrow.triangle.branch", "title": "调整行程", "isDestructive": false },
      { "id": "contact-leader", "icon": "person.2.fill", "title": "联系领队", "isDestructive": false },
      { "id": "send-notification", "icon": "bell.badge", "title": "发通知", "isDestructive": false },
      { "id": "log-event", "icon": "plus.circle", "title": "记事件", "isDestructive": false }
    ],
    "executionScore": 82,
    "executionScoreLabel": "良好",
    "scoreBreakdown": [
      { "id": "readiness", "label": "就绪度", "value": "82", "style": "success" }
    ],
    "aiInsight": {
      "observation": "当前路线受风力影响",
      "impact": "下午户外段风险升高",
      "recommendation": "保持当前计划",
      "executable": "keep"
    }
  }
}
```

**`currentActivity` 补充字段：**

| 字段 | 说明 |
|------|------|
| `imageUrl` | 下一站 Place 配图 URL；无图时为 `null` |
| `currentLocationName` | 行中位置摘要，如 `204号公路 · 距营地 3.2km`；由当前路段（TRANSIT 项 note/Place metadata）+ 用户位置到下一站直线距离拼接；缺数据时为 `null` |

---

## 4. GET /api/mobile/trips/{tripId}/today-itinerary

对应 **`TodayItineraryViewData`**。

### 4.1 请求

```
GET /api/mobile/trips/{tripId}/today-itinerary?dayIndex=1
Authorization: Bearer <accessToken>
```

### 4.2 `items[].status` 枚举

```
completed | inProgress | upcoming | delayed | risk | cancelled
```

由服务端根据当前时间、`currentItemId`、延误 metadata 推导。

### 4.3 成功响应 200（节选）

```json
{
  "success": true,
  "data": {
    "dayTitle": "Day 1 日程执行",
    "contextVersion": 300012345,
    "warningTitle": "今日行程正常",
    "warningDetail": "暂无需要立即处理的预警",
    "warningImpact": "—",
    "warningRecommendation": "按当前计划执行",
    "items": [
      {
        "id": "item-1",
        "time": "09:00",
        "endTime": "12:00",
        "title": "冰川徒步",
        "location": "冰川徒步",
        "duration": "3h",
        "experienceType": "ACTIVITY",
        "status": "inProgress",
        "merchantName": "",
        "confirmationCode": "BK-123",
        "plannedDepartAt": "2026-07-08T09:00:00.000Z"
      }
    ],
    "activeItem": { "...": "同 items 元素" },
    "participantCount": 4,
    "merchantName": "",
    "confirmationCode": "BK-123"
  }
}
```

### 4.4 iOS 解码契约（勿破）

| 字段 | 规则 |
|------|------|
| `dayTitle` / `warningTitle` / `warningDetail` / `warningImpact` / `warningRecommendation` | **必填字符串**，始终返回 |
| `merchantName` / `confirmationCode` | **根级与 items[] 均必填**；没有就给 `""`，**勿省略**（否则 iOS 解码失败） |
| `status` | camelCase：`completed` \| `inProgress` \| `upcoming` \| `delayed` \| `risk` \| `cancelled` |
| `activeItem` | 可为 `null`（客户端已兜底） |
| `plannedDepartAt` | 可选；延误单用，无则 `null` |
| `?dayIndex=` | 已支持；日历点某天后复用本接口 |

---

## 4A. GET /api/mobile/trips/{tripId}/itinerary-calendar

执行期**行程日历**聚合读口：整趟按天总览 + 天气摘要 + 默认选中天。  
点某天后**勿新开详情口**，复用：

```http
GET /api/mobile/trips/{tripId}/today-itinerary?dayIndex={n}
```

与规划期日程编排 / day-theme **不是同一页**；本口只服务执行日历（`TodayItineraryRoute.calendar`）。

### 4A.1 成功响应 200

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012345,
    "tripTitle": "冰岛环岛自驾",
    "dateRangeLabel": "Day 1 - Day 7 · 冰岛 2026-07-16",
    "currentDayIndex": 2,
    "days": [
      {
        "dayIndex": 1,
        "date": "2026-07-16",
        "weekday": "周四",
        "locationSummary": "蓝湖 · 雷克雅未克",
        "activityCount": 4,
        "status": "completed"
      },
      {
        "dayIndex": 2,
        "date": "2026-07-17",
        "weekday": "周五",
        "locationSummary": "瓦特纳冰川营地",
        "activityCount": 3,
        "status": "executing",
        "weather": {
          "tempRange": "8°C ~ 12°C",
          "wind": ""
        }
      },
      {
        "dayIndex": 3,
        "date": "2026-07-18",
        "weekday": "周六",
        "locationSummary": "冰川徒步",
        "activityCount": 2,
        "status": "upcoming"
      }
    ],
    "overview": {
      "totalDays": 7,
      "totalActivities": 21
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `tripTitle` | 页头 / 副标题 |
| `dateRangeLabel` | `Day 1 - Day N · {destination} {startDate}` |
| `currentDayIndex` | 1-based，默认选中天（按行程起止与今天推算） |
| `days[].weekday` | 中文短星期，如 `周四` |
| `days[].status` | `executing` \| `upcoming` \| `completed`（天级；活动级仍用 `inProgress`） |
| `days[].weather` | 可选；当前日尽量带回 `tempRange` / `wind`（无风速时 `wind` 为 `""`） |
| `overview` | 底部「行程概览」统计 |
| `contextVersion` | 与其它执行读口一致，供缓存 / If-Match |

`TripDay` 尚未物化时仍按 `startDate`–`endDate` 合成空天，保证日历可渲染。

---

## 4B. GET /api/mobile/trips/{tripId}/activities/{activityId}

等价路径：`GET .../activities/{activityId}/execution-detail`

列表字段不够时再拉（确认码、商家、成员、导航点）。

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012345,
    "id": "item-uuid",
    "title": "冰川徒步",
    "time": "09:00",
    "endTime": "12:00",
    "location": "冰川徒步",
    "status": "inProgress",
    "merchantName": "Glacier Guides",
    "confirmationCode": "BK-123",
    "notes": "记得带钉鞋",
    "plannedDepartAt": "2026-07-08T09:00:00.000Z",
    "experienceType": "ACTIVITY",
    "duration": "3h",
    "dayIndex": 1,
    "members": [{ "id": "u1", "name": "张三", "role": "leader" }],
    "navigationPoint": { "lat": 64.32, "lng": -17.12, "label": "冰川徒步" },
    "bookingStatus": "CONFIRMED",
    "bookingUrl": ""
  }
}
```

`merchantName` / `confirmationCode` / `notes` / `bookingStatus` / `bookingUrl` 无值时给 `""`。  
`navigationPoint` / `plannedDepartAt` 可为 `null`。

---

## 5. GET /api/mobile/trips/{tripId}/live-route

对应 **`LiveRouteViewData`** + 地图几何。

### 5.1 坐标约定

`map.coordinateOrder = "latLng"` → 每个点为 **`[lat, lng]`**（纬度在前）。

### 5.2 成功响应 200（节选）

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012345,
    "navInstruction": "前往 蓝湖",
    "navDistance": "—",
    "navNext": "蓝湖",
    "eta": "10:05",
    "remaining": "剩余 1h 20m",
    "activityTitle": "蓝湖",
    "distanceToDestination": "—",
    "progress": 0.35,
    "teamSummary": "4 位成员",
    "teamNote": "位置共享需开启对讲模块",
    "teamMembers": [
      { "id": "u1", "name": "张三", "status": "同行中" }
    ],
    "aiAlertTitle": "路况正常",
    "aiAlertDetail": "暂无显著道路或天气影响",
    "aiRecommendation": "按导航前往下一站",
    "map": {
      "coordinateOrder": "latLng",
      "polylines": [
        {
          "id": "today-route",
          "coordinates": [[64.66, -20.91], [64.67, -20.90]],
          "style": "primary"
        }
      ],
      "markers": [
        { "id": "destination", "type": "destination", "lat": 64.67, "lng": -20.90, "label": "蓝湖" }
      ],
      "navigationSteps": [
        { "instruction": "前往 蓝湖", "distance": "—", "maneuver": "straight" }
      ]
    }
  }
}
```

MVP 验收：`map.markers` 至少含 **`destination`**；有坐标的多 POI 会追加 `meeting` 类型 marker。

---

## 6. P1 详情接口

### 6.1 GET /api/mobile/trips/{tripId}/execution/execution-alerts

**第一层：执行预警** — 只放真正影响是否可继续执行的事件（`STOP` / `REPLAN_REQUIRED` / `AT_RISK`）。

**投影来源（P0+）：** 服务端优先通过 **Execution Risk Center** 统一 Read Model 输出（`projectionSource: "execution_risk_center"`）。此时 `alerts[].id` / `riskId` 为稳定统一 ID，可对接 `/api/trips/{tripId}/execution-risks/*`。Legacy 回退时 `projectionSource: "legacy"`。

**聚合语义（v2，`schemaId: tripnara.execution_alerts@v2`）：** 一个风险事件只展示一条主风险，派生影响折叠为 `impacts[]`，不再把「同日交通偏紧」等与天气/安全主风险并列成卡。

**日程派生规则：** 仅当与主风险 **同一天** 或 **共享活动/路段 scope** 时，才把 `SCHEDULE` / `same_day_travel` 折叠进 `impacts[]`。**第 4、5 天等跨天交通偏紧** 不进 `execution-alerts`，只在 §6.2 `adjustment-queue` 出现。

**文案三字段（仅 `primaryRisk` / `independentRisks[]`）：** 客户端展示用的 `title` / `reason` / `recommendedAction` **只**出现在主风险与独立风险项上；`impacts[]` 仅含 `{ id, type, label, sourceRiskId }`，不含上述三字段。

| 字段 | 含义 |
|------|------|
| `primaryRisk` | 唯一主风险（`presentationRole: PRIMARY`） |
| `primaryRisk.title` | 短结论：`{路段}：{灾害}，不建议按原计划出发` |
| `primaryRisk.reason` | 事实评估正文（P90 / 错过概率等），**不含**方案句 |
| `primaryRisk.recommendedAction` | 一句可执行方案（如「将蓝湖温泉的时间提早20分钟」） |
| `independentRisks[]` | 可独立成卡的次要风险 — **同样含** `title` / `reason` / `recommendedAction` |
| `impacts[]` | 派生影响（`SAFETY` / `ROUTE` / `DELAY` / `ITINERARY` 等），**无**上述三字段 |
| `requiredAction` | `STOP` / `REPLAN` / `NONE` — 底部 CTA 依据 |
| `alerts[]` | v1 兼容 — 仅 `PRIMARY` + `INDEPENDENT`，不含派生项 |

**`recommendedAction` 生成优先级（主风险）：**

1. **Advisory** — `execution-advisory.recommendations[].label`（或 summary 推荐文案）
2. **自动拆分** — 从 `reason` 源文本中的「最小干预建议将出发时间提前 N 分钟」等句提取，并格式化为「将{起点}的时间提早N分钟」
3. 独立风险无 trip 级 advisory 时，仅走第 2 步（基于该风险自身 `summary`）

**`primaryRisk.causalChain`（与 adjustment-queue `items[].causalChain` 同结构）：**

| 字段 | 含义 |
|------|------|
| `causalChain.headline` | 因果链标题（优先 advisory `guardianHeadline`） |
| `causalChain.assessment` | 评估正文（与 `reason` 同源，可更长） |
| `causalChain.nodes[]` | `WORLD_CHANGE` → `IMPACT` → `CONFLICT` → `OPTION` 节点 |

**生成优先级：** 优先透传 `execution-advisory.causalInsight.causalStory.chain[]`（环境事件因果链）；若 BFF 已聚合但 `nodes` 为空，则回退为基于 `ActiveRisk` 的四节点 fallback（与 adjustment-queue 纯风险项一致）。

**不包含**「交通偏紧」「缓冲不足」等日程类问题作为独立预警 — 有主风险时归入 `impacts[]`；待决定方案在 §6.2 `adjustment-queue`。

**请求：**

```
GET /api/mobile/trips/{tripId}/execution/execution-alerts
Authorization: Bearer <accessToken>
```

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.execution_alerts@v1",
    "tripId": "trip-uuid",
    "contextVersion": 300012345,
    "banner": {
      "level": "STOP",
      "title": "停止执行 / 必须重新规划",
      "detail": "冰川区域气温升高，原徒步方案已不满足安全条件"
    },
    "alerts": [
      {
        "id": "alert-1",
        "level": "STOP",
        "title": "冰川徒步不满足安全条件",
        "reason": "气温升高导致冰面融化风险",
        "impact": "Day 1 户外段",
        "affectedActivities": ["冰川徒步体验"],
        "evidenceRefs": ["ev-1"],
        "observedAt": "2026-07-08T10:12:00.000Z",
        "requiresImmediateAttention": true
      }
    ],
    "aiRecommendation": {
      "title": "建议",
      "detail": "优先处理执行预警后再继续行程",
      "evidenceIds": ["ev-1"]
    }
  }
}
```

| `alerts[].level` | 含义 |
|------------------|------|
| `STOP` | 必须停止执行 / 重新规划 |
| `REPLAN_REQUIRED` | 部分行程需重规划 |
| `AT_RISK` | 存在风险但尚未阻断 |

> 旧路径 `execution/risk-alerts` 返回相同结构，iOS 请迁移至本接口。

---

### 6.1.1 旅行执行风险中心（Canonical API）

Mobile `execution-alerts` 为 BFF 投影；**Canonical 活跃风险 Read Model** 如下（推荐新客户端直接使用）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/trips/{tripId}/execution-risks/adjustment-queue` | 待调整事项（关联 linkedRiskIds） |
| GET | `/api/trips/{tripId}/execution-risks/summary` | 今日风险概览 |
| GET | `/api/trips/{tripId}/execution-risks` | 活跃风险列表 |
| GET | `/api/trips/{tripId}/execution-risks/{riskId}` | 风险详情 |
| POST | `/api/trips/{tripId}/execution-risks/{riskId}/acknowledge` | 确认已阅读 |
| GET | `/api/trips/{tripId}/execution-risks/{riskId}/recommendations` | 关联建议（`items[]` 至少 1～N；含 id / title / isRecommended / benefitTags / memberImpacts） |
| POST | `/api/trips/{tripId}/execution-risks/{riskId}/recommendations/{recommendationId}/apply` | **采用方案** — 写回 Active Plan，bump `contextVersion`，WS `plan` / `itinerary` / `execution`（write-chain 开启时仍为预览，需 confirm） |
| POST | `/api/trips/{tripId}/execution-risks/{riskId}/recommendations/{recommendationId}/confirm` | 确认采用（write-chain / 决策队列 / advisory / environment） |

**采用建议闭环：**

1. `GET …/recommendations` → `{ riskId, items[], count }` — 有活跃风险时 **items 非空**；每项含 `id` / `title` / `isRecommended` / `benefitTags[]` / 可选 `memberImpacts[]`
2. `apply` → 默认写回 Active Plan，返回 `{ executionStatus: "APPLIED", contextVersion, planDiff, memberImpacts[] }`；客户端应停止硬编码方案 A/B/C
3. write-chain 开启时 `apply` 仍为预览 `{ executionStatus: "PREVIEW", requiresConfirmation: true }`，再 `confirm` + `{ confirm: true }` 完成采用

**`affectedMembers` / `memberImpacts`（环境风险 + 决策队列项）：**

| 字段 | 位置 | 说明 |
|------|------|------|
| `items[].affectedMembers` | adjustment-queue | **纯风险项**：`ENVIRONMENT` / `STOP` 等继承行程全部协作者；**决策项**：优先 `scope.memberIds`，否则继承关联 `ActiveRisk.affectedMembers`，`DYNAMIC_REPLAN`+`BLOCK` 再 fallback 全员 |
| `primaryRisk.causalChain` + `items[].causalChain` | execution-alerts / adjustment-queue | 因果链不变；`IMPACT` 节点描述受影响活动 |
| `memberImpacts[]` | `GET …/recommendations`、`POST …/apply` 预览 | 按成员展开 `impactType` + `explanation`（如 `SAFETY_EXPOSURE` / `DELAYED` / `BLOCKED`） |

强风 `impactType` 默认为 `SAFETY_EXPOSURE`；封路为 `BLOCKED`；带 `timeAdjustment`（如 `-30min`）的方案预览为 `DELAYED`。

#### GET …/recommendations 响应示例

```json
{
  "success": true,
  "data": {
    "riskId": "risk_a1b2c3d4e5f67890",
    "count": 3,
    "items": [
      {
        "id": "rec_cluster_wind_RECOMMENDED",
        "riskId": "risk_a1b2c3d4e5f67890",
        "title": "推荐方案：平衡安全与体验",
        "label": "推荐方案：平衡安全与体验",
        "description": "调整动作：缩短徒步、推迟出发",
        "isRecommended": true,
        "benefitTags": ["推荐", "-25min", "提升安全", "体验大部分保留"],
        "impactSummary": "-25min",
        "planType": "RECOMMENDED",
        "memberImpacts": []
      },
      {
        "id": "rec_cluster_wind_CONSERVATIVE",
        "title": "稳妥方案：优先避险",
        "isRecommended": false,
        "benefitTags": ["更稳妥", "显著提升安全", "体验有取舍"]
      },
      {
        "id": "rec_cluster_wind_MINIMAL_CHANGE",
        "title": "最小改动：尽量保留原计划",
        "isRecommended": false,
        "benefitTags": ["改动小", "+22min", "体验保留高"]
      }
    ]
  }
}
```

`riskId` 由 `tripId + riskKey` 稳定派生（`risk_[16 hex]`），可与 `execution-alerts` / `adjustment-queue` 的 `primaryRiskId` / `linkedRiskIds` 互查。

#### 数据层级（避免前端重复展示）

```
风险来源（Environment / Decision Queue / Attention）
        ↓ 聚合、关联、去重
ActiveRisk（type/code = 发生了什么）
        ↓ 判断严重程度
Execution Alert（STOP / REPLAN_REQUIRED / AT_RISK = 有多严重）
        ↓ 按共同根因聚类
ExecutionRiskCluster（一个现实问题）
        ↓ 生成用户需处理的事项
Adjustment Item（items[].type = 用户要做什么，非风险分类）
```

| 层级 | 职责 | 前端不应 |
|------|------|----------|
| `ActiveRisk` | 事实与 code | 逐条渲染为并列风险卡 |
| `execution-alerts` | 全局摘要 + 入口 | 重复完整方案与因果链 |
| `adjustment-queue` | 完整决策内容 | 按后端风险条数 1:1 出卡 |
| `items[].type` | 产品分类（四类调整项） | 与八类 `ActiveRisk.type` 一一对应 |

**`ExecutionRiskCluster`（响应字段 `riskClusters[]` + `items[].clusterId`）：**

同一外部事件 + 同一影响时段 + 同一组受影响活动 + 可由一次调整解决 → **一张主调整卡**。

| 字段 | 说明 |
|------|------|
| `clusterId` | 稳定簇 ID |
| `primaryRiskId` | 根因风险 |
| `relatedRiskIds[]` | 派生后果（延误、偏紧、预约窗口…） |
| `rootCauseCode` | 如 `WEATHER_STRONG_WIND` |
| `items[].consequenceImpacts[]` | 「影响」区块条目，非独立卡片 |
| `items[].affectedMembersScope` | `ALL_MEMBERS` / `FOCUSED` — 环境风险统一影响时用「影响全体成员」 |

**不应合并：** 强风 vs 司机疲劳 vs 成员分歧 vs 晚餐未确认 — 根因与解法不同，保留独立调整项。

---

### 6.1.2 GET /api/trips/{tripId}/execution-risks/adjustment-queue

**第二层：待调整事项（Canonical）** — 与 Mobile BFF §6.2 同结构，由 Execution Risk Center 统一投影。

**数据来源：**

| 来源 | 投影为 |
|------|--------|
| Decision Queue | `items[]`，`id = problemId`，含 `decisionProblemId` |
| Active Risk（尚无 DP） | `items[]`，`id = intervention-risk-{riskId}` |
| 两者关联 | `linkedRiskIds` / `primaryRiskId` / `recommendationId` |

**请求：**

```
GET /api/trips/{tripId}/execution-risks/adjustment-queue
Authorization: Bearer <accessToken>
```

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.execution_adjustment_queue@v1",
    "tripId": "trip-uuid",
    "contextVersion": 0,
    "projectionSource": "execution_risk_center",
    "pendingCount": 2,
    "criticalCount": 1,
    "highPriorityCount": 1,
    "headline": "今天需要您决定 2 件事",
    "linkedActiveRiskCount": 2,
    "generatedAt": "2026-07-08T16:50:00.000Z",
    "countsByType": {
      "SAFETY_INTERVENTION": 1,
      "DYNAMIC_REPLAN": 1,
      "TEAM_COORDINATION": 0,
      "EXECUTION_PREPARATION": 0
    },
    "items": [
      {
        "schemaId": "tripnara.execution_intervention@v1",
        "id": "dp-road-close-001",
        "tripId": "trip-uuid",
        "type": "SAFETY_INTERVENTION",
        "priority": "CRITICAL",
        "title": "道路 F208 已关闭",
        "reason": "官方已关闭 F208，原计划不可继续",
        "affectedMembers": ["Patrick", "Abu"],
        "affectedActivities": ["F208 穿越"],
        "recommendedAction": "查看替代路线",
        "requiresConfirmation": true,
        "status": "OPEN",
        "decisionProblemId": "dp-road-close-001",
        "linkedRiskIds": ["risk_abc123"],
        "linkedRiskKeys": ["road.status.closed|F208-segment"],
        "primaryRiskId": "risk_abc123",
        "causalChain": { "headline": "…", "assessment": "…", "nodes": [] },
        "actions": {
          "primary": { "label": "确认调整", "action": "accept", "actionId": "act-1", "enabled": true },
          "secondary": { "label": "查看影响", "action": "view_impact", "enabled": true }
        }
      },
      {
        "schemaId": "tripnara.execution_intervention@v1",
        "id": "intervention-risk-risk_wind001",
        "tripId": "trip-uuid",
        "type": "SAFETY_INTERVENTION",
        "priority": "HIGH",
        "title": "处理：强风影响冰川徒步",
        "reason": "预计 11:00 后阵风达到 16—18m/s",
        "linkedRiskIds": ["risk_wind001"],
        "primaryRiskId": "risk_wind001",
        "recommendationId": "env-rec-env-wind-001-plan-shorten",
        "environmentEventId": "env-wind-001",
        "requiresConfirmation": true,
        "status": "OPEN",
        "causalChain": { "headline": "…", "assessment": "…", "nodes": [] },
        "actions": {
          "primary": { "label": "查看建议", "action": "view_alternatives", "enabled": true, "count": 1 },
          "secondary": { "label": "确认已知晓", "action": "complete", "enabled": true }
        }
      }
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| `projectionSource` | 固定 `execution_risk_center`（Canonical）；Mobile BFF legacy 回退时为 `legacy` |
| `linkedActiveRiskCount` | 当前需处理的活跃风险数（`ACTION_REQUIRED` / `DECISION_REQUIRED`） |
| `items[].linkedRiskIds` | 关联 `/execution-risks/{riskId}` |
| `items[].recommendationId` | 纯风险项 → 走 `…/recommendations/{id}/apply` → `confirm` |
| `items[].decisionProblemId` | 决策项 → 走 `POST …/decisions/{id}/accept` 或 Decision Space |

**与 Mobile BFF 关系：**

| 路径 | 差异 |
|------|------|
| `GET /api/trips/{tripId}/execution-risks/adjustment-queue` | Canonical，推荐新客户端 |
| `GET /api/mobile/trips/{tripId}/execution/adjustment-queue` | BFF 包装，额外填充 `contextVersion`；失败时 legacy 回退 |

**curl 示例：**

```bash
curl -s "$BASE/trips/$TRIP/execution-risks/adjustment-queue" \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

### 6.2 GET /api/mobile/trips/{tripId}/execution/adjustment-queue

**第二层：待调整事项** — 领域对象 `ExecutionIntervention`，容器 `ExecutionAdjustmentQueue`。

**投影来源（P0+）：** 优先通过 **Execution Risk Center** 输出（`projectionSource: "execution_risk_center"`）。每项可含 `linkedRiskIds` / `primaryRiskId` 关联活跃风险；纯风险驱动项（尚无 DecisionProblem）以 `intervention-risk-{riskId}` 为 id。

Legacy 回退时 `projectionSource: "legacy"`。复杂项仍关联 `DecisionProblem`（`decisionProblemId`）。

**请求：**

```
GET /api/mobile/trips/{tripId}/execution/adjustment-queue
Authorization: Bearer <accessToken>
```

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.execution_adjustment_queue@v1",
    "tripId": "trip-uuid",
    "contextVersion": 300012345,
    "pendingCount": 4,
    "criticalCount": 1,
    "highPriorityCount": 2,
    "headline": "今天需要您决定 4 件事",
    "countsByType": {
      "SAFETY_INTERVENTION": 1,
      "DYNAMIC_REPLAN": 1,
      "TEAM_COORDINATION": 1,
      "EXECUTION_PREPARATION": 1
    },
    "items": [
      {
        "schemaId": "tripnara.execution_intervention@v1",
        "id": "problem-uuid",
        "tripId": "trip-uuid",
        "type": "SAFETY_INTERVENTION",
        "priority": "HIGH",
        "title": "缩短冰川徒步时长",
        "reason": "下午户外段风力超标，建议压缩至 90 分钟",
        "affectedMembers": ["Patrick", "Abu", "Nara", "Lara"],
        "affectedActivities": ["冰川徒步体验"],
        "recommendedAction": "缩短至 90 分钟",
        "alternativeActions": ["取消徒步", "改室内备选"],
        "actionDeadline": "2026-07-08T13:30:00.000Z",
        "evidenceRefs": ["ev-1"],
        "requiresConfirmation": true,
        "autoExecutable": false,
        "reversible": true,
        "modifiesEffectivePlan": true,
        "requiresRevalidation": true,
        "status": "OPEN",
        "decisionProblemId": "problem-uuid",
        "causalChain": {
          "headline": "强风影响冰川徒步",
          "assessment": "下午风力超标，户外段风险升高",
          "nodes": [
            { "nodeId": "n1", "type": "WORLD_CHANGE", "title": "天气变化", "description": "阵风 27 m/s" },
            { "nodeId": "n2", "type": "IMPACT", "title": "影响活动", "description": "冰川徒步体验" },
            { "nodeId": "n3", "type": "CONFLICT", "title": "安全冲突", "description": "原方案不满足安全条件" },
            { "nodeId": "n4", "type": "OPTION", "title": "建议", "description": "缩短至 90 分钟" }
          ],
          "traceId": "ct_1",
          "worldStateVersion": "ws_1",
          "technicalTraceRef": "ct_1"
        },
        "causalTraceRef": {
          "traceId": "ct_1",
          "worldStateVersion": "ws_1",
          "protocolVersion": "causal-trace-v1"
        },
        "actions": {
          "primary": { "label": "确认调整", "action": "accept", "actionId": "act-1", "enabled": true },
          "secondary": { "label": "查看影响", "action": "view_impact", "enabled": true },
          "defer": { "label": "稍后处理 · 最晚 13:30 前", "action": "defer", "actionId": "defer-1", "enabled": true }
        },
        "recommendation": {
          "title": "缩短至 90 分钟",
          "summary": "保留核心体验，降低安全风险",
          "keeps": ["冰川核心段"],
          "costs": ["减少拍照时间"],
          "recommendedActionId": "act-1"
        }
      }
    ]
  }
}
```

#### `items[].type` — 四类调整项

| type | 含义 | 示例 |
|------|------|------|
| `SAFETY_INTERVENTION` | 安全干预 | 缩短冰川徒步 |
| `DYNAMIC_REPLAN` | 环境驱动重规划 | 替换下午景点、**同日交通偏紧** |
| `TEAM_COORDINATION` | 团队协调 | 确认集合点 |
| `EXECUTION_PREPARATION` | 执行准备任务 | 检查装备与补水 |

#### `items[].priority`

| priority | 含义 |
|----------|------|
| `CRITICAL` | 紧急阻断，需立即处理 |
| `HIGH` | 活动开始前需完成决定 |
| `MEDIUM` | 不处理可能导致混乱/延误 |
| `LOW` | 优化与准备，不立即阻断 |

#### `items[].causalChain` — 因果链（Observe → Explain → Suggest）

每个 `ExecutionIntervention` **必须**携带因果链，供卡片「为什么重要」区域渲染：

| `nodes[].type` | 含义 |
|----------------|------|
| `WORLD_CHANGE` | 观察到的事实变化（天气、路况、成员状态…） |
| `IMPACT` | 对活动/成员/时间的影响 |
| `CONFLICT` | 与当前有效计划的冲突 |
| `OPTION` | 系统建议的处理方式 |
| `OUTCOME` | 已执行后的结果校准（如有） |

`SAFETY_INTERVENTION` 类型额外可能有 `guardianCausalChain`（Abu 安全视角）。

**完整回放（含 technical trace）：**

```
GET /api/mobile/trips/{tripId}/execution/interventions/{interventionId}/causal-trace
```

等价于 `GET /api/trips/{tripId}/decision-problems/{problemId}/causal-trace`。

#### 写操作（按 `actions` 映射）

| action | HTTP |
|--------|------|
| `accept` / `complete` | `POST .../decisions/{decisionProblemId}/accept` |
| `defer` / `snooze` | `POST .../decisions/{decisionProblemId}/defer` |
| `view_alternatives` / `view_impact` | 打开 Decision Space（Web）或后续专用 preview API |

> 旧路径 `execution/pending-adjustments` 返回相同结构，iOS 请迁移至本接口。

---

### 6.3 GET /api/mobile/trips/{tripId}/execution/team-status

**请求：**

```
GET /api/mobile/trips/{tripId}/execution/team-status
Authorization: Bearer <accessToken>
```

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "members": [
      {
        "id": "user-1",
        "name": "张三",
        "role": "leader",
        "status": "online",
        "distanceToMeeting": "1.2 km",
        "distanceToCurrentUserMeters": 32,
        "distanceToCurrentUserLabel": "32 m",
        "batteryPercent": 78,
        "lastUpdateAt": "2026-07-08T12:00:00.000Z"
      },
      {
        "id": "user-2",
        "name": "李四",
        "role": "member",
        "status": "offline",
        "distanceToMeeting": null,
        "distanceToCurrentUserMeters": null,
        "distanceToCurrentUserLabel": null,
        "batteryPercent": null,
        "lastUpdateAt": "2026-07-08T11:00:00.000Z"
      }
    ]
  }
}
```

| `members[].status` | `online` \| `warning` \| `offline`（来自 `in-trip/comms/peers`） |
| `distanceToMeeting` | 相对当前集合点的距离；无 GPS 时为 `null` |
| `distanceToCurrentUserMeters` | 相对**当前请求用户**的距离（米）；无 GPS 时为 `null`（iOS 显示「—」） |
| `distanceToCurrentUserLabel` | 服务端格式化，如 `"32 m"`；无 GPS 时为 `null` |
| `batteryPercent` | 来自 `PUT .../members/{id}/presence` 最近一次上报 |
| `groups` | 当前集合点分组（有下一站时返回） |

实时位置 → `PUT .../members/{memberId}/presence`（§7.2）。

---

### 6.4 GET /api/mobile/trips/{tripId}/execution/today-progress

```
GET /api/mobile/trips/{tripId}/execution/today-progress?dayIndex=1
```

**响应 `data`（节选）：**

```json
{
  "contextVersion": 300012345,
  "completedCount": 2,
  "totalCount": 5,
  "completionPercent": 0.4,
  "currentDelay": "—",
  "safetyScore": 85,
  "teamCompletionRate": 0.4,
  "milestones": [
    { "time": "09:00", "title": "冰川徒步", "location": "冰川徒步", "status": "completed" }
  ],
  "chartPoints": [
    { "time": "09:00", "planned": 1, "actual": 1 }
  ],
  "eventLog": [
    { "id": "evt-1", "time": "12:00", "type": "observation", "title": "路面湿滑", "detail": "", "actor": "user-1" }
  ]
}
```

---

### 6.5 GET /api/mobile/trips/{tripId}/execution/road-conditions

路况详情页。聚合 `environment/events` + `execution-advisory` + Context Snapshot `worldFacts`。

```
GET /api/mobile/trips/{tripId}/execution/road-conditions
Authorization: Bearer <accessToken>
```

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012345,
    "alertTitle": "强风预警",
    "alertDetail": "14:00 后阵风 7-9 m/s，F 路可能临时封闭",
    "timeline": [
      { "time": "11:00", "event": "强风预警", "severity": "high" }
    ],
    "evidence": [
      {
        "id": "wf-1",
        "source": "weather",
        "detail": "14:00 后阵风 7-9 m/s",
        "updatedAt": "2026-07-08T11:00:00.000Z",
        "publisher": "TripNara"
      }
    ]
  }
}
```

---

### 6.6 GET /api/mobile/trips/{tripId}/execution/meeting-points/{pointId}

集合点详情。`pointId` 可为 **ItineraryItem UUID**，或别名 **`current`** / **`next`**（指向下一站）。

```
GET /api/mobile/trips/{tripId}/execution/meeting-points/next
Authorization: Bearer <accessToken>
```

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012345,
    "id": "item-uuid",
    "name": "蓝湖停车场",
    "lat": 63.88,
    "lng": -22.45,
    "advisedArrivalTime": "16:30",
    "description": "蓝湖停车场 · Blue Lagoon",
    "instructions": [
      "建议 16:30 前到达",
      "开启位置共享以便团队追踪"
    ],
    "participants": [
      { "memberId": "user-1", "name": "张三", "eta": "约 5 分钟", "status": "接近中" }
    ],
    "syncCount": 3
  }
}
```

---

## 7. 写操作

### 7.1 接受决策

```
POST /api/mobile/trips/{tripId}/decisions/{decisionId}/accept
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "optionId": "action-id-from-queue",
  "comment": "采用方案 A"
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012346,
    "decisionStatus": "accepted",
    "previewSummary": "采用方案 A",
    "result": { "...": "decision-queue accept 原始结果" }
  }
}
```

> `decisionId` = decision-queue 的 `problemId`。也可传 `actionId` 字段。

### 7.1b 延后决策

```
POST /api/mobile/trips/{tripId}/decisions/{decisionId}/defer
Authorization: Bearer <accessToken>
If-Match: <contextVersion>
Content-Type: application/json

{ "comment": "稍后再说" }
```

**响应 `decisionStatus`：** `deferred`（内部使用 queue item 的 `defer.actionId`）。

### 7.2 成员位置上报

```
PUT /api/mobile/trips/{tripId}/members/{memberId}/presence
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "lat": 64.6643,
  "lng": -20.9119,
  "accuracy": 10,
  "batteryPercent": 78,
  "recordedAt": "2026-07-08T11:45:00Z",
  "shareLocation": true
}
```

> `memberId` 必须等于当前登录用户 ID。内部转发至 `in-trip/comms/peers/heartbeat`。

### 7.3 记录执行事件

```
POST /api/mobile/trips/{tripId}/execution-events
Authorization: Bearer <accessToken>
Idempotency-Key: <uuid>
If-Match: <contextVersion>
Content-Type: application/json

{
  "type": "incident",
  "title": "路面湿滑",
  "severity": "medium",
  "activityId": "item-uuid",
  "location": { "lat": 64.66, "lng": -20.91 },
  "description": "下山路段结冰",
  "attachments": []
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012347,
    "event": { "id": "evt-uuid", "type": "incident", "title": "路面湿滑", "recordedAt": "..." },
    "replay": false
  }
}
```

相同 `Idempotency-Key` 重放返回 `replay: true` 与同一 `event`。

### 7.4 POST /api/mobile/trips/{tripId}/notifications

```
POST /api/mobile/trips/{tripId}/notifications
Authorization: Bearer <accessToken>
Idempotency-Key: <uuid>
Content-Type: application/json
```

**请求体：**

```json
{
  "recipientIds": ["user-1", "user-2"],
  "type": "meeting",
  "title": "集合时间变更",
  "body": "16:30 在停车场集合",
  "attachments": {
    "includeLocation": true,
    "includeMeetingPoint": true,
    "includePlanLink": false
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| recipientIds | string[] | 是 | 接收者 userId 列表 |
| type | string | 是 | `announcement` \| `meeting` \| `safety` \| `risk_alert` \| `location_update` |
| title | string | 是 | 通知标题 |
| body | string | 是 | 正文 |
| attachments.includeLocation | boolean | 否 | `true` 时在正文末尾附坐标（需同时传 `location`） |
| location | `{ lat, lng }` | 否 | `includeLocation=true` 时使用 |

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012347,
    "notification": {
      "id": "notif-uuid",
      "recipientIds": ["user-1", "user-2"],
      "type": "meeting",
      "title": "集合时间变更",
      "body": "16:30 在停车场集合",
      "sentBy": "user-1",
      "sentAt": "2026-07-08T12:00:00.000Z"
    },
    "replay": false
  }
}
```

---

### 7.4A PATCH /api/mobile/trips/{tripId}/activities/{activityId}

**P0 — 单项调整行程（点「调整行程」真正改计划）**

```
PATCH /api/mobile/trips/{tripId}/activities/{activityId}
Authorization: Bearer <accessToken>
If-Match: <contextVersion>
Idempotency-Key: <uuid>
Content-Type: application/json
```

**路径参数：** `activityId` = ItineraryItem UUID

**请求体（与规划期对齐，至少一项）：**

```json
{
  "startTime": "10:30",
  "endTime": "13:00",
  "plannedDepartAt": "2026-07-08T10:30:00.000Z",
  "title": "冰川徒步（改期）",
  "notes": "延误后顺延"
}
```

| 字段 | 说明 |
|------|------|
| `startTime` / `endTime` | `HH:mm`（相对该 TripDay）或 ISO8601；只传 `startTime` 时保持原时长顺延 `endTime` |
| `plannedDepartAt` | 延误单用；写入 metadata + 投影 |
| `title` / `notes` | 可选；`title` 覆盖展示名 |

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012349,
    "planVersion": 5,
    "activityId": "item-uuid",
    "startTime": "2026-07-08T10:30:00.000Z",
    "endTime": "2026-07-08T13:00:00.000Z",
    "title": "冰川徒步（改期）",
    "notes": "延误后顺延",
    "plannedDepartAt": "2026-07-08T10:30:00.000Z",
    "replay": false,
    "patched": true
  }
}
```

成功后：

1. 根级 / `data` 带回新 `contextVersion`
2. WS `trip_context_changed`，`changedSections: ['plan', 'itinerary', 'execution']`
3. 客户端应刷新 `today-itinerary`

**错误：**

| 场景 | HTTP | code |
|------|------|------|
| 缺 If-Match / Idempotency-Key | 400 | `VALIDATION_ERROR` |
| 版本过期 | 409 | `CONTEXT_VERSION_CONFLICT` |
| 活动不存在 | 404 | `NOT_FOUND` |

---

### 7.5 POST /api/mobile/trips/{tripId}/activities/{activityId}/complete

```
POST /api/mobile/trips/{tripId}/activities/{activityId}/complete
Authorization: Bearer <accessToken>
Idempotency-Key: <uuid>
Content-Type: application/json
```

**路径参数：** `activityId` = ItineraryItem UUID

**请求体：**

```json
{
  "completedAt": "2026-07-08T12:00:00Z",
  "actualDurationMinutes": 180,
  "notes": "提前结束"
}
```

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012348,
    "activityId": "item-uuid",
    "completedAt": "2026-07-08T12:00:00.000Z",
    "actualDurationMinutes": 180,
    "replay": false
  }
}
```

完成后重新拉取 `today-itinerary`，对应项 `status` 为 `completed`。

---

### 7.6 POST /api/mobile/trips/{tripId}/emergency/sos

```
POST /api/mobile/trips/{tripId}/emergency/sos
Authorization: Bearer <accessToken>
Idempotency-Key: <uuid>
Content-Type: application/json
```

**请求体：**

```json
{
  "type": "medical",
  "location": { "lat": 64.66, "lng": -20.91 },
  "message": "需要医疗协助",
  "shareWithTeam": true
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | enum | 否 | `medical` \| `lost` \| `accident` \| `vehicle` \| `weather` \| `other`（默认 `other`） |
| location | `{ lat, lng }` | 否 | 可为 null / 省略（无 GPS 时） |
| message | string | 否 | 补充说明 |
| shareWithTeam | boolean | 否 | 默认 `true`；`false` 仅上报后台 |

**响应 `data`（节选）：**

```json
{
  "contextVersion": 300012348,
  "sos": {
    "sosId": "uuid",
    "tripId": "trip-uuid",
    "type": "medical",
    "status": "SENT",
    "publicStatus": "open",
    "location": { "lat": 64.66, "lng": -20.91 },
    "coordinates": { "latitude": 64.66, "longitude": -20.91 },
    "sentAt": "2026-07-08T12:00:00.000Z",
    "message": "需要医疗协助"
  },
  "replay": false
}
```

**副作用（P0）：** 通知领队（`risk_alert`）、写入 `attention-queue`（`type=sos`）、WebSocket `trip_context_changed`（sections: execution/risks/team/notifications）。

**对齐文档：** [`internal-docs/product/sos-backend-alignment.md`](../../internal-docs/product/sos-backend-alignment.md)

---

### 7.7 GET /api/mobile/trips/{tripId}/emergency-pack

```
GET /api/mobile/trips/{tripId}/emergency-pack
Authorization: Bearer <accessToken>
```

**响应 `data`：**

```json
{
  "tripId": "trip-uuid",
  "tripName": "冰岛环岛",
  "memberCount": 4,
  "leader": { "id": "user-1", "name": "张三", "phone": null },
  "medicalNotes": "过敏：青霉素",
  "vehicleInfo": { "plate": "ABC-123", "model": "Toyota RAV4", "color": "白色" },
  "offlinePackAvailable": true,
  "offlinePackVersion": "2026-07-08",
  "localEmergencyNumber": "112"
}
```

数据来源：`TripOfflinePack`、`trip.metadata.emergencyPack` / `vehicleInfo`、Country Profile 紧急号码。

---

### 7.8 GET /api/mobile/trips/{tripId}/emergency/local-numbers

```
GET /api/mobile/trips/{tripId}/emergency/local-numbers
Authorization: Bearer <accessToken>
```

**响应 `data`：**

```json
{
  "countryCode": "IS",
  "primary": "112",
  "police": "4441000",
  "ambulance": "112",
  "fire": "112",
  "displayHint": "冰岛统一紧急号码 112"
}
```

---

### 7.9 GET/PUT /api/mobile/users/me/emergency-contacts

```
GET  /api/mobile/users/me/emergency-contacts
PUT  /api/mobile/users/me/emergency-contacts
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**PUT 请求体（全量替换）：**

```json
{
  "contacts": [
    {
      "id": "ec_1",
      "name": "张三",
      "phone": "+86 138xxxx",
      "relationship": "spouse",
      "notifyOnSOS": true,
      "authorized": true
    }
  ]
}
```

存储路径：`UserProfile.preferences.other.emergencyContacts`（最多 10 条）。SOS 触发时读取 `notifyOnSOS=true` 的联系人并写入 `notifiedEmergencyContacts`（短信通道待接入；**队员/领队 APNs 见 push-tokens**）。

**Push token 注册（同 §0.2 APNs payload）：**

```
POST   /api/mobile/users/me/push-tokens
DELETE /api/mobile/users/me/push-tokens/{deviceId}
Authorization: Bearer <accessToken>
```

```json
{
  "token": "<apns-device-token>",
  "platform": "ios",
  "deviceId": "device-uuid",
  "appVersion": "1.0.0"
}
```

启用 APNs：`MOBILE_APNS_ENABLED=true` + `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_BUNDLE_ID` / p8 私钥。

**真机验证清单：**

| # | 步骤 | 通过标准 |
|---|------|----------|
| 1 | Xcode → Signing & Capabilities → **Push Notifications** | capability 已开启，Bundle ID 与 `APNS_BUNDLE_ID` 一致 |
| 2 | 后端 env：Debug 真机 | `MOBILE_APNS_ENABLED=true`，`APNS_USE_SANDBOX=true` |
| 3 | 真机登录 App | `POST .../push-tokens` 返回 `success: true`，`registered: true` |
| 4 | 领队账号触发 SOS | 锁屏/横幅推送；payload 含 `tripId`、`contextVersion`、`eventType=sos` |
| 5 | 发送 `risk_alert` 团队通知 | 接收方收到推送；`eventType=risk_alert` |
| 6 | 点开推送 | App 打开对应行程；若本地 `contextVersion` 过期则刷新 snapshot |

**常见失败：**

- token 注册成功但无推送 → 检查 p8 Key 是否勾选 **Apple Push Notifications service (APNs)**
- Debug 包收不到 → 确认 `APNS_USE_SANDBOX=true`（Development provisioning）
- `APNS_BUNDLE_ID` 与 Xcode Bundle ID 不一致 → 400 BadDeviceToken

---

### 7.10 GET /api/mobile/trips/{tripId}/emergency/sos/active

```
GET /api/mobile/trips/{tripId}/emergency/sos/active
Authorization: Bearer <accessToken>
```

**响应 `data`：**

```json
{
  "active": true,
  "sos": {
    "sosId": "sos_xxx",
    "type": "medical",
    "message": "需要协助",
    "location": { "lat": 64.66, "lng": -20.91 },
    "createdAt": "2026-07-08T12:00:00.000Z",
    "status": "open",
    "userId": "user-1",
    "acknowledgedBy": { "memberId": "leader-1", "name": "领队" }
  }
}
```

无活跃 SOS 时：`{ "active": false }`。

**推荐：** 同时读 `GET .../context-snapshot` → `execution.activeSOS`（相同结构，无 `active` 包裹；无 SOS 时为 `null`）。

---

### 7.11 POST /api/mobile/trips/{tripId}/emergency/sos/{sosId}/acknowledge

领队确认「已收到」（`open` → `acknowledged`）。

```
POST /api/mobile/trips/{tripId}/emergency/sos/{sosId}/acknowledge
Authorization: Bearer <accessToken>
If-Match: <contextVersion>
```

**响应 `data`：** 含 `contextVersion` + `activeSos`（同 §7.10 结构）。

---

### 7.12 POST /api/mobile/trips/{tripId}/emergency/sos/{sosId}/resolve

解除 / 误触取消 SOS（发起者或领队）。

```
POST /api/mobile/trips/{tripId}/emergency/sos/{sosId}/resolve
Authorization: Bearer <accessToken>
If-Match: <contextVersion>
Content-Type: application/json

{
  "reason": "false_alarm",
  "comment": "已找到队伍，安全"
}
```

| reason | 说明 |
|---|---|
| `false_alarm` | 误触 |
| `resolved` | 已脱险 |
| `cancelled` | 主动取消 |

**响应 `data`：**

```json
{
  "contextVersion": 300012349,
  "sos": { "sosId": "...", "publicStatus": "resolved", "...": "..." },
  "activeSos": { "active": false },
  "sosResolved": true
}
```

---

### 7.13 POST/DELETE /api/mobile/trips/{tripId}/emergency/location-share

SOS 进行中时，发起者开启高频位置共享（配合 presence 心跳）。

```
POST /api/mobile/trips/{tripId}/emergency/location-share
DELETE /api/mobile/trips/{tripId}/emergency/location-share
Authorization: Bearer <accessToken>
If-Match: <contextVersion>
```

**POST 可选 body：** `{ "sosId": "sos_xxx" }`

**iOS 约定：** 开启后 `PUT .../members/{id}/presence` 每 **10s**、`shareLocation: true`；后端标记 `mode: emergency`（存储于 `mobileExecution.emergencyLocationShare`）。SOS resolve 后自动清除共享标记。

---

### 7.14 POST /api/mobile/trips/{tripId}/navigation/sessions

导航会话同步（Dock「导航」）。

```
POST /api/mobile/trips/{tripId}/navigation/sessions
Authorization: Bearer <accessToken>
Idempotency-Key: <uuid>
If-Match: <contextVersion>
Content-Type: application/json

{
  "activityId": "item-uuid",
  "destinationId": "meeting-point-1",
  "shareWithTeam": true
}
```

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012348,
    "session": {
      "id": "session-uuid",
      "activityId": "item-uuid",
      "destinationId": "meeting-point-1",
      "shareWithTeam": true,
      "startedAt": "2026-07-08T12:00:00.000Z",
      "startedBy": "user-1"
    },
    "replay": false
  }
}
```

---

### 7.15 POST /api/mobile/trips/{tripId}/intercom/messages

对讲消息写入。支持两种 Content-Type：

#### 语音模式（multipart）

流程：**STT 转写** → **`in-trip/comms/sync` 同步**。

```
POST /api/mobile/trips/{tripId}/intercom/messages
Authorization: Bearer <accessToken>
Idempotency-Key: <uuid>
Content-Type: multipart/form-data

audio: <blob>
durationSeconds: 5
clientId: <uuid>   # 可选，幂等去重
language: zh-Hans   # 可选
```

#### 文字模式（JSON，P2）

```
POST /api/mobile/trips/{tripId}/intercom/messages
Authorization: Bearer <accessToken>
Idempotency-Key: <uuid>
Content-Type: application/json

{
  "kind": "text",
  "body": "我有点累，想在前面休息一会儿~",
  "clientId": "<uuid>"
}
```

**前置（缺一不可）：**

| 环境变量 | 说明 |
|----------|------|
| `IN_TRIP_COMMS_ENABLED=true` | 对讲模块 |
| VoiceService 可用 | 云端 STT（仅语音模式） |

**错误码：**

| code | 说明 |
|------|------|
| `COMMS_EXECUTION_DISABLED` | comms 未开 |
| `INTERCOM_AUDIO_INVALID` | 音频过短/无效 |
| `TRANSCRIBE_PROVIDER_UNAVAILABLE` | STT 不可用或假音频 |

> 联调请用 **真实 m4a/webm**；不可用随机 bytes 测 STT。

**成功响应 200（语音）：**

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012348,
    "message": {
      "clientId": "uuid",
      "type": "voice",
      "body": "我们在停车场集合",
      "transcript": "我们在停车场集合",
      "transcriptId": "vt_abc123",
      "durationSec": 5,
      "durationSeconds": 5,
      "sentAt": "2026-07-09T08:01:00.000Z",
      "deliveryStatus": "sent",
      "serverSeq": 42
    },
    "replay": false,
    "previewSummary": "语音已发送"
  }
}
```

**成功响应 200（文字）：**

```json
{
  "success": true,
  "data": {
    "contextVersion": 300012349,
    "message": {
      "id": "msg-uuid",
      "clientId": "uuid",
      "type": "text",
      "body": "我有点累，想在前面休息一会儿~",
      "sentAt": "2026-07-09T08:02:00.000Z",
      "deliveryStatus": "sent",
      "serverSeq": 43
    },
    "replay": false,
    "previewSummary": "文字已发送"
  }
}
```

---

### 7.16 GET /api/mobile/trips/{tripId}/intercom/messages

对讲消息历史（替换 iOS Preview 静态数据）。

```
GET /api/mobile/trips/{tripId}/intercom/messages?limit=50&before=<cursor>&after=<cursor>
Authorization: Bearer <accessToken>
```

| Query | 说明 |
|-------|------|
| `limit` | 默认 50，最大 100 |
| `before` | 游标（serverSeq 或 ISO8601），上拉加载更多 |
| `after` | 增量拉取（轮询 / WS 断线补偿） |

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg-1",
        "clientId": "uuid",
        "tripId": "trip-2",
        "senderId": "user-1",
        "senderName": "张三",
        "kind": "voice",
        "transcript": "我们在停车场集合",
        "durationSeconds": 5,
        "sentAt": "2026-07-09T08:01:00.000Z",
        "deliveryStatus": "sent",
        "transport": "cloud",
        "isOwn": false
      },
      {
        "id": "msg-2",
        "kind": "status",
        "statusType": "arrived",
        "body": "我到了",
        "sentAt": "2026-07-09T08:02:00.000Z",
        "deliveryStatus": "sent",
        "transport": "cloud",
        "isOwn": true
      }
    ],
    "hasMore": false,
    "nextCursor": null
  }
}
```

| `kind` | `voice` \| `text` \| `status` \| `system` |
| `statusType` | 快捷状态：`arrived` \| `wait_here` \| `need_rest` \| `separated` |
| `audioUrl` | 语音消息短期签名 URL（默认 15min）；无云端录音时为 `null`/省略 |

> `comms` 未启用时返回空列表 `{ messages: [], hasMore: false }`，不报错。

---

### 7.18 GET /api/mobile/trips/{tripId}/intercom/messages/{messageId}/audio

语音播放 URL **续期**（签名过期前可重复请求）。

```
GET /api/mobile/trips/{tripId}/intercom/messages/{messageId}/audio
Authorization: Bearer <accessToken>
```

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "audioUrl": "https://bucket.oss-cn-.../in-trip-comms/trip-id/uuid.m4a?Expires=...",
    "expiresAt": "2026-07-09T08:20:00.000Z",
    "ttlSec": 900,
    "mimeType": "audio/mp4",
    "durationSeconds": 5
  }
}
```

| 错误码 | 说明 |
|--------|------|
| `INTERCOM_AUDIO_NOT_FOUND` | 消息不存在或非 voice |
| `INTERCOM_AUDIO_NOT_STORED` | 历史消息 / 近场蓝牙发送，无云端录音 |

**存储与签名：**

| 环境变量 | 说明 |
|----------|------|
| `ALIYUN_OSS_*` | 生产环境 OSS 上传 + `signatureUrl` 签名 |
| `COMMS_AUDIO_SIGNED_URL_TTL_SEC` | 签名有效期（秒），默认 `900`（15min），最大 `3600` |
| `COMMS_AUDIO_UPLOAD_DIR` | 本地开发存储目录（默认 `uploads/in-trip-comms`） |
| `FILE_STORAGE_BASE_URL` | 无 OSS 时的静态文件基址 |

> 语音 POST 时服务端持久化录音至 `in-trip-comms/{tripId}/{clientId}.m4a`，`GET messages` 与 WS `intercom_message` 中的 `audioUrl` 均为读时签名。

---

### 7.17 GET /api/mobile/trips/{tripId}/intercom/summary

对讲页 AI 状态摘要卡片。

```
GET /api/mobile/trips/{tripId}/intercom/summary
Authorization: Bearer <accessToken>
```

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "status": "ready",
    "updatedAt": "2026-07-09T08:05:00.000Z",
    "bullets": [
      "张三 5 分钟前发送语音：我们在停车场集合",
      "李四 已到达当前位置",
      "团队 3/4 人在线"
    ]
  }
}
```

| `status` | `ready`（有摘要）\| `stale`（无新消息）\| `offline`（comms 未启用） |

---

### 7.4 补充 — 快捷状态写入对讲流

`POST .../notifications` 除推送团队通知外，对以下 `type` **同时写入对讲消息流**（`GET intercom/messages` 可见 `kind: "status"`）：

| `type` | 按钮 |
|--------|------|
| `arrived` | 我到了 |
| `wait_here` | 原地等 |
| `need_rest` | 需要休息 |
| `separated` | 我走散了 |

亦支持 `type: "intercom_status"` + `statusType` 字段。写后 WS `changedSections` 含 `intercom`。

---

### 7.15（旧备注）

> 完整对讲底层能力仍可用 [`IN_TRIP_COMMS_API.md`](../trips/in-trip-execution/IN_TRIP_COMMS_API.md) 的 `/in-trip/comms/*`（sync / peers / transcribe）。

---

### 7.19 POST /api/contact/message — 联系我们

设置页 / 帮助页「联系我们」反馈入口。支持纯文本、纯图片或图文混合提交；**无「我的反馈列表」读接口**，提交成功即可。

```
POST /api/contact/message
Content-Type: multipart/form-data
Authorization: Bearer <accessToken>   # 可选，建议登录用户带上
X-Client-Version: 1.0.0               # 建议
```

**认证与限流：**

| 场景 | 限流 | 说明 |
|------|------|------|
| 匿名（无 Token） | 3 次/小时 | 按客户端 IP |
| 已登录（带 Token） | 10 次/小时 | 按 `userId`，消息关联账号 |

路由标记 `@Public()`：无 Token 可提交；若带有效 Token 会自动解析用户（无效 Token 不阻断请求）。

**请求体（`multipart/form-data`）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | 否* | 文本反馈内容 |
| `images` | File[] | 否* | 图片，字段名固定 `images`，最多 5 张 |

> `message` 与 `images` **至少提供一项**。

**约束：**

- 图片格式：`jpg` / `jpeg` / `png` / `gif` / `webp`
- 单张最大 **5MB**
- 最多 **5 张**
- 图片上传至 OSS `tripnara-contact` bucket（失败时降级本地存储）

**成功响应 200：**

```json
{
  "success": true,
  "data": {
    "id": "ddc5e15c-8487-43b6-8513-f4f7c2c43be5",
    "success": true,
    "message": "消息发送成功"
  }
}
```

> 本接口**无** Mobile BFF 根级信封（无 `requestId` / `tripId` / `contextVersion`），仅标准 `{ success, data, error }`。

**错误响应：**

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "发送消息过于频繁，请稍后再试",
    "details": { "resetTime": "2026-07-09T09:30:00.000Z" }
  }
}
```

| `error.code` | HTTP | 说明 |
|--------------|------|------|
| `INVALID_REQUEST` | 400 | 文本与图片均为空 |
| `TOO_MANY_FILES` | 400 | 超过 5 张图片 |
| `FILE_TOO_LARGE` | 413 | 单张 > 5MB |
| `INVALID_FILE_TYPE` | 415 | 不支持的图片格式 |
| `RATE_LIMIT_EXCEEDED` | 429 | 触发限流；UI 可读 `details.resetTime` |
| `INTERNAL_ERROR` | 500 | 服务器错误 |

**iOS 对接要点：**

1. 使用 `multipart/form-data`；多图时对 `images` 字段重复 append（与 curl `-F "images=@..."` 一致）
2. 相册/截图建议压缩后再传，避免 413
3. 429 时展示「稍后再试」，可选格式化 `resetTime` 为本地时间
4. 成功态展示 `data.message`，无需轮询状态
5. 与 **§7.9 紧急联系人** 不同：紧急联系人为 SOS 通知对象；本接口为产品反馈/客服通道

**Android 对接要点：** OkHttp `MultipartBody`，字段名 `message` + `images`；可选 `Authorization` 头。

**管理后台（App 无需对接）：** `/api/contact/admin/*` — 见 [`src/contact/README.md`](../contact/README.md)。

---

## 8. iOS 接入顺序

```
1. GET .../context-snapshot              → TripContextSnapshot / contextVersion
2. 三 Tab 读模型：
   - execution-overview
   - today-itinerary
   - live-route
3. 详情子页：
   - execution/execution-alerts
   - execution/adjustment-queue
   - execution/today-progress
   - execution/team-status
4. 写操作（带 Idempotency-Key）：
   - decisions/{id}/accept
   - decisions/{id}/defer
   - members/{id}/presence
   - execution-events
   - notifications
   - activities/{id}/complete
   - emergency/sos
   - navigation/sessions
   - intercom/messages（需 comms 模块）
5. 详情按需：
   - execution/road-conditions
   - execution/meeting-points/{id}
6. 写后刷新：context-snapshot 或对应读模型；或比对 contextVersion 轮询
7. 设置页（非行程）：POST /api/contact/message — 联系我们（§7.19）
```

---

## 9. curl 联调（全量）

```bash
BASE=http://192.168.8.153:8080/api
TOKEN=<accessToken>
TRIP=<tripId>
IDEM=$(uuidgen)

# --- P0 读 ---
curl -s "$BASE/mobile/trips/$TRIP/context-snapshot" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/mobile/trips/$TRIP/execution-overview" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/mobile/trips/$TRIP/today-itinerary" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/mobile/trips/$TRIP/live-route" -H "Authorization: Bearer $TOKEN" | jq

# --- P1 读 ---
curl -s "$BASE/mobile/trips/$TRIP/execution/execution-alerts" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/mobile/trips/$TRIP/execution/adjustment-queue" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/mobile/trips/$TRIP/execution/today-progress" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/mobile/trips/$TRIP/execution/team-status" -H "Authorization: Bearer $TOKEN" | jq

# --- 写 ---
curl -s -X POST "$BASE/mobile/trips/$TRIP/execution-events" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM" \
  -d '{"type":"observation","title":"测试事件","severity":"low"}' | jq

curl -s -X POST "$BASE/mobile/trips/$TRIP/notifications" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM-notif" \
  -d '{"recipientIds":["user-id"],"type":"announcement","title":"测试","body":"hello"}' | jq

curl -s -X POST "$BASE/mobile/trips/$TRIP/activities/ITEM_ID/complete" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"notes":"done"}' | jq

curl -s -X POST "$BASE/mobile/trips/$TRIP/emergency/sos" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"other","location":{"lat":64.66,"lng":-20.91},"message":"测试SOS"}' | jq

# --- Push token（真机登录后，token 从 iOS 获取）---
curl -s -X POST "$BASE/mobile/users/me/push-tokens" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"token":"<hex-apns-device-token>","platform":"ios","deviceId":"test-device-1","appVersion":"1.0.0"}' | jq

# --- risk_alert 推送联调（需接收方已注册 push-tokens）---
curl -s -X POST "$BASE/mobile/trips/$TRIP/notifications" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM-risk" \
  -d '{"recipientIds":["LEADER_USER_ID"],"type":"risk_alert","title":"强风预警","body":"今日下午阵风 25m/s","attachments":{"includeLocation":true},"location":{"lat":64.66,"lng":-20.91}}' | jq

curl -s -X PUT "$BASE/mobile/trips/$TRIP/members/USER_ID/presence" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"lat":64.66,"lng":-20.91,"accuracy":10,"shareLocation":true}' | jq

curl -s "$BASE/mobile/trips/$TRIP/execution/road-conditions" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/mobile/trips/$TRIP/execution/meeting-points/next" -H "Authorization: Bearer $TOKEN" | jq

curl -s -X POST "$BASE/mobile/trips/$TRIP/navigation/sessions" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM-nav" \
  -d '{"activityId":"ITEM_ID","destinationId":"next","shareWithTeam":true}' | jq

curl -s "$BASE/mobile/trips/$TRIP/intercom/messages?limit=20" \
  -H "Authorization: Bearer $TOKEN" | jq '.success, (.data.messages|length)'

curl -s "$BASE/mobile/trips/$TRIP/intercom/summary" \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s -X POST "$BASE/mobile/trips/$TRIP/intercom/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $IDEM-voice" \
  -F "audio=@/path/to/voice.m4a" -F "durationSeconds=5" | jq

curl -s -X POST "$BASE/mobile/trips/$TRIP/intercom/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM-text" \
  -d '{"kind":"text","body":"我有点累，想在前面休息一会儿~"}' | jq

curl -s -X POST "$BASE/mobile/trips/$TRIP/notifications" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM-status" \
  -d '{"recipientIds":["USER_ID"],"type":"arrived","title":"我到了","body":"已到达当前位置","attachments":{"includeLocation":true}}' | jq

# --- 联系我们（非行程绑定）---
curl -s -X POST "$BASE/contact/message" \
  -F "message=这是一条测试反馈" | jq

curl -s -X POST "$BASE/contact/message" \
  -H "Authorization: Bearer $TOKEN" \
  -F "message=登录用户反馈" \
  -F "images=@/path/to/screenshot.png" | jq

# --- WebSocket（需 wscat: npm i -g wscat）---
wscat -c "ws://127.0.0.1:3000/ws?token=$TOKEN"
# 连接后发送: {"type":"subscribe","tripId":"'"$TRIP"'"}
```

---

## 10. 错误码

| 条件 | error.code | 说明 |
|------|------------|------|
| 未登录 | `UNAUTHORIZED` | refresh 或回登录 |
| 非行程成员 | `FORBIDDEN` | 无权限 |
| 行程不存在 | `NOT_FOUND` | — |
| 非 TRAVELING 调 in-trip 子能力 | 部分字段降级/stub | overview 仍可用 |
| contextVersion 过期 | `CONTEXT_VERSION_CONFLICT` | 刷新 snapshot，`error.details.currentContextVersion` |
| 行中模块未启用 | `in-trip/today` 等 503 | 设 `IN_TRIP_EXECUTION_ENABLED=true` |
| 对讲未启用 | `COMMS_EXECUTION_DISABLED` | 设 `IN_TRIP_COMMS_ENABLED=true` |
| 语音转写不可用 | `TRANSCRIBE_PROVIDER_UNAVAILABLE` | 检查 VoiceService 配置 |
| Idempotency-Key 重放 | 200 + `replay: true` | 正常，勿重复 UI 提示 |
| 联系我们：文本与图片均为空 | `INVALID_REQUEST` | 至少填一项 |
| 联系我们：图片过大/格式不对 | `FILE_TOO_LARGE` / `INVALID_FILE_TYPE` | 压缩或换格式 |
| 联系我们：提交过于频繁 | `RATE_LIMIT_EXCEEDED` | 读 `error.details.resetTime` |

---

## 11. 相关文档

| 文档 | 说明 |
|------|------|
| [`TRIPS_NATIVE_API.md`](./TRIPS_NATIVE_API.md) | 列表 / 详情 / 状态 |
| [`EXECUTE_NATIVE_API.md`](./EXECUTE_NATIVE_API.md) | **第五阶段：行中 Mobile BFF（本文件索引）** |
| [`IN_TRIP_EXECUTION_API.md`](../trips/in-trip-execution/IN_TRIP_EXECUTION_API.md) | 行中全量能力（Web） |
| [`IN_TRIP_COMMS_API.md`](../trips/in-trip-execution/IN_TRIP_COMMS_API.md) | 对讲 P2 |
| `src/mobile/controllers/mobile-execution.controller.ts` | 路由实现 |
| `src/mobile/dto/mobile-execution.types.ts` | TypeScript 契约 SSOT |
| `src/mobile/ws/trip-context-ws.service.ts` | WebSocket `/ws` |
| `src/mobile/utils/mobile-envelope.util.ts` | 响应信封投影 |
| [`src/contact/README.md`](../contact/README.md) | 联系我们 API（含管理后台） |
| `src/contact/contact.controller.ts` | 联系我们路由实现 |

---

## 12. 待后续迭代

| 能力 | 说明 |
|------|------|
| `comms` WebSocket P2.1 | `/in-trip/comms/ws` 实时 message / peer_update（Web 全量 API） |
| 全站响应信封 | 其他非 Mobile 接口逐步迁移根级 meta |
