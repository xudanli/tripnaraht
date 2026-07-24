# 行程核心 — App Native 对接文档（第三阶段）

> **前置：** 第一、二阶段已完成（[`SESSION_NATIVE_API.md`](../auth/SESSION_NATIVE_API.md)、[`USER_PROFILE_NATIVE_API.md`](../auth/USER_PROFILE_NATIVE_API.md)）  
> **Global prefix：** `/api`  
> **本阶段目标：** 首页行程列表、行程详情、待关注队列  
> **创建行程入口：** 见 [`TRIP_CREATE_ENTRIES_NATIVE_API.md`](./TRIP_CREATE_ENTRIES_NATIVE_API.md)（①探索 ②攻略）  
> **响应格式：** 统一 `{ success, data, error }`  
> **最后更新：** 2026-07-08（含 §2 行程状态说明）

---

## 0. 本阶段接口一览

| 优先级 | 方法 | 路径 | 用途 |
|--------|------|------|------|
| P0 | GET | `/api/trips/list` | 行程列表（BFF，**优先使用**） |
| P1 | GET | `/api/trips` | 行程列表降级（全量树形，较重） |
| P0 | GET | `/api/trips/:id` | 行程详情（全景树） |
| P1 | GET | `/api/trips/attention-queue` | 待关注事项（Dashboard 角标） |

**Base URL（真机联调）：** `http://192.168.8.153:8080/api`

**通用请求头：**

```
Authorization: Bearer <accessToken>
```

### 0.1 权限模型

- 行程按 **TripCollaborator** 过滤：只返回当前用户作为协作者的行程。
- 通过任意创建入口落库后，创建者会自动写入 `role: OWNER` 协作者记录（见 [`TRIP_CREATE_ENTRIES_NATIVE_API.md`](./TRIP_CREATE_ENTRIES_NATIVE_API.md)）。
- 无 Token 时列表可能返回空或全量（取决于路由）；**Native 应始终带 Bearer**。

---

## 1. 整体流程

```
首页
  ├─ GET /trips/list              → 渲染行程卡片
  │     └─ 点击卡片 → 按 listSummary.primaryAction.intent 跳转
  │
  ├─ GET /trips/attention-queue   → 顶部待办角标（可选）
  │
  └─ 「新建行程」→ 见 [`TRIP_CREATE_ENTRIES_NATIVE_API.md`](./TRIP_CREATE_ENTRIES_NATIVE_API.md)
        ├─ Hub ① 探索 → /exploration/* → materialize
        └─ Hub ② 攻略 → /guide-to-plan/* → accept

行程详情页
  └─ GET /trips/:id               → TripDay + ItineraryItem + Place 树
```

---

## 2. 行程状态说明

TripNARA 有两套状态：**数据库存储的 API 状态**（`Trip.status`）和列表 BFF 计算的 **UI 展示状态**（`listSummary.displayStatus`）。Native 应区分使用。

### 2.1 数据库 / API 生命周期状态

定义见 `src/trips/dto/trip-status.dto.ts`。

| 状态 | 值 | 含义 |
|------|-----|------|
| 草稿 | `DRAFT` | 刚创建，未公开 |
| 招募中 | `RECRUITING` | 寻找同行成员 |
| 预成团 | `FORMING` | 确认成员与基本规则 |
| 规划中 | `PLANNING` | 生成可执行方案（**多数创建入口默认**） |
| 旅行中 | `TRAVELING` | 行程进行中 |
| 已完成 | `COMPLETED` | 行程已结束 |
| 已取消 | `CANCELLED` | 已取消 |
| ~~进行中~~ | `IN_PROGRESS` | **已废弃**，兼容旧数据，等价 `TRAVELING` |

**典型流转：**

```
DRAFT → RECRUITING → FORMING → PLANNING → TRAVELING → COMPLETED
                                              ↓
                                         CANCELLED（任意阶段可取消）
```

- `GET /trips/:id` 的 `data.status` 返回上述原始值。
- 列表筛选 `?status=` 可传：`PLANNING`、`IN_PROGRESS`、`TRAVELING`、`COMPLETED`、`CANCELLED`、`DRAFT` 等（逗号分隔）。

### 2.2 列表 UI 展示状态（`displayStatus`）

`GET /trips/list` 的 `listSummary.displayStatus` 由 **API 状态 + 出发日期** 推导，**不等于** DB 字段直接映射。

| displayStatus | displayStatusLabel | 判定规则 |
|---------------|-------------------|----------|
| `planning` | 规划中 | 默认；或 `PLANNING` 且距出发 **> 14 天** |
| `pre_trip` | 行前准备 | `PLANNING` 且距出发 **≤ 14 天** |
| `traveling` | 旅行中 | `TRAVELING` / `IN_PROGRESS` |
| `completed` | 已完成 | `COMPLETED` |
| `cancelled` | 已取消 | `CANCELLED` |

列表卡片上的 `status` 字段会**简化为 4 值**（BFF 投影）：

| 列表 `status` | 对应 DB |
|---------------|---------|
| `PLANNING` | `PLANNING`、`DRAFT`、`RECRUITING`、`FORMING` 等 |
| `IN_PROGRESS` | `TRAVELING`（及废弃的 `IN_PROGRESS`） |
| `COMPLETED` | `COMPLETED` |
| `CANCELLED` | `CANCELLED` |

**卡片主按钮与 displayStatus 对应：**

| displayStatus | primaryAction 示例 |
|---------------|-------------------|
| `planning` | `{ label: "继续规划", intent: "open_plan_studio" }` |
| `pre_trip` | `{ label: "去确认", intent: "open_detail" }` |
| `traveling` | `{ label: "进入今日行程", intent: "open_execute" }` |
| `completed` | `{ label: "查看复盘", intent: "open_insights" }` |
| `cancelled` | 通常无 primaryAction |

### 2.3 规划进度（`planningAvailability`，独立维度）

表示**规划内容做到哪一步**，与生命周期状态无关：

| 值 | 含义 |
|----|------|
| `collecting_info` | 基础信息未齐 |
| `ready_to_generate` | 可触发生成 |
| `generating` | 正在生成行程项 |
| `ready` | 已有可执行内容 |
| `failed` | 生成失败 |

可用于卡片副标题或进度条，**不要**与 `displayStatus` 混用。

### 2.4 Native 使用建议

| 场景 | 用哪个字段 |
|------|-----------|
| 首页卡片标题/标签 | `listSummary.displayStatusLabel` |
| 卡片点击跳转 | `listSummary.primaryAction.intent` |
| 详情页 / 改状态 / 筛选 | `Trip.status`（API 生命周期值） |
| 规划进度 UI | `planningAvailability` |

```swift
func badgeText(for card: TripListCard) -> String {
    card.listSummary?.displayStatusLabel ?? statusFallback(card.status)
}

func onCardTap(_ card: TripListCard) {
    switch card.listSummary?.primaryAction?.intent {
    case "open_execute": navigateToExecute(card.id)
    case "open_plan_studio": navigateToPlanning(card.id)
    case "open_insights": navigateToInsights(card.id)
    default: navigateToDetail(card.id)
    }
}
```

---

## 3. GET /api/trips/list

行程列表 BFF，返回带 `listSummary` 的卡片投影，供 Native 首页直接使用。

### 3.1 请求

```
GET /api/trips/list?limit=50&offset=0&status=PLANNING,IN_PROGRESS&includeCancelled=true
Authorization: Bearer <accessToken>
```

| Query | 类型 | 默认 | 说明 |
|-------|------|------|------|
| limit | number | 50 | 每页条数，最大 100 |
| offset | number | 0 | 偏移量 |
| status | string | — | 逗号分隔状态筛选，如 `PLANNING,IN_PROGRESS,COMPLETED` |
| includeCancelled | boolean | true | 是否包含已取消（通常排末尾） |

**常用 status 值：** `PLANNING`、`IN_PROGRESS`（兼容，映射 traveling）、`TRAVELING`、`COMPLETED`、`CANCELLED`、`DRAFT`

### 3.2 成功响应 200

```json
{
  "success": true,
  "data": {
    "trips": [
      {
        "id": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
        "name": "冰岛夏季之旅",
        "destination": "IS",
        "destinationLabel": "冰岛",
        "startDate": "2026-08-01T00:00:00.000Z",
        "endDate": "2026-08-07T00:00:00.000Z",
        "status": "PLANNING",
        "totalBudget": 30000,
        "currency": "CNY",
        "days": [
          { "id": "day-uuid-1", "date": "2026-08-01T00:00:00.000Z" }
        ],
        "createdAt": "2026-07-08T10:00:00.000Z",
        "updatedAt": "2026-07-08T11:00:00.000Z",
        "planningAvailability": "ready",
        "generatingItems": false,
        "tripContentMode": "poi_timeline",
        "metadata": {},
        "listSummary": {
          "displayStatus": "planning",
          "displayStatusLabel": "规划中",
          "coverImageUrl": "https://cdn.example.com/covers/is.jpg",
          "durationDays": 7,
          "memberCount": 1,
          "memberAvatars": [
            { "userId": "...", "name": "张三", "avatarUrl": null }
          ],
          "progressPercent": 35,
          "feasibilityScore": 82,
          "feasibilityLabel": "良好",
          "hardConflictCount": 0,
          "pendingConfirmCount": 2,
          "budgetPerPerson": 30000,
          "primaryAction": {
            "label": "继续规划",
            "intent": "open_plan_studio"
          }
        }
      }
    ],
    "total": 1
  }
}
```

### 3.3 卡片字段说明

| 字段 | 说明 |
|------|------|
| destination | ISO 3166-1 alpha-2 国家码，如 `IS`、`JP` |
| destinationLabel | 中文目的地名 |
| status | API 状态：`PLANNING` \| `IN_PROGRESS` \| `COMPLETED` \| `CANCELLED` |
| listSummary.displayStatus | UI 状态：`planning` \| `pre_trip` \| `traveling` \| `completed` \| `cancelled` |
| listSummary.primaryAction.intent | 卡片主按钮跳转意图（见下表） |
| planningAvailability | `collecting_info` \| `ready_to_generate` \| `generating` \| `ready` \| `failed` |
| tripContentMode | `poi_timeline` \| `hiking_primary` \| `skeleton_only` |

**primaryAction.intent 跳转建议：**

| intent | Native 行为 |
|--------|-------------|
| `open_detail` | 打开行程详情 |
| `open_plan_studio` | 打开规划页 |
| `open_execute` | 打开行中执行页 |
| `open_insights` | 打开洞察/分析页 |

`listSummary` 可能为 `null`（投影失败时降级），UI 应能只展示基础字段。

### 3.4 空列表

```json
{
  "success": true,
  "data": {
    "trips": [],
    "total": 0
  }
}
```

展示 Empty State +「创建行程」按钮（跳转创建入口，见 [`TRIP_CREATE_ENTRIES_NATIVE_API.md`](./TRIP_CREATE_ENTRIES_NATIVE_API.md)）。

### 3.5 降级方案

若 `/trips/list` 不可用，降级 `GET /api/trips`（见 §4），客户端自行提取卡片所需字段。

---

## 4. GET /api/trips（降级）

返回当前用户协作者行程的**完整树**（含 TripDay、ItineraryItem），数据量大，**仅作降级**。

### 4.1 请求

```
GET /api/trips
Authorization: Bearer <accessToken>
```

### 4.2 成功响应 200

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "name": "冰岛夏季之旅",
      "destination": "IS",
      "startDate": "...",
      "endDate": "...",
      "status": "PLANNING",
      "TripDay": [ "..." ],
      "isCollected": false
    }
  ]
}
```

---

## 5. GET /api/trips/:id

获取单个行程全景详情，含按日聚合的行程项与 Place。

### 5.1 请求

```
GET /api/trips/{tripId}
Authorization: Bearer <accessToken>
```

| 路径参数 | 说明 |
|----------|------|
| tripId | 行程 UUID |

### 5.2 成功响应 200

```json
{
  "success": true,
  "data": {
    "id": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "name": "冰岛夏季之旅",
    "destination": "IS",
    "startDate": "2026-08-01T00:00:00.000Z",
    "endDate": "2026-08-07T00:00:00.000Z",
    "status": "PLANNING",
    "budgetConfig": { "...": "..." },
    "pacingConfig": { "...": "..." },
    "metadata": {},
    "TripDay": [
      {
        "id": "day-uuid-1",
        "date": "2026-08-01T00:00:00.000Z",
        "ItineraryItem": [
          {
            "id": "item-uuid-1",
            "placeId": 12345,
            "startTime": "2026-08-01T10:00:00.000Z",
            "endTime": "2026-08-01T12:00:00.000Z",
            "notes": null,
            "Place": {
              "id": 12345,
              "nameCN": "蓝湖",
              "nameEN": "Blue Lagoon",
              "category": "ATTRACTION",
              "address": "...",
              "metadata": {}
            }
          }
        ]
      }
    ],
    "totalDays": 7,
    "totalItems": 0
  }
}
```

> 新创建的行程通常 `ItineraryItem` 为空，只有空的 `TripDay` 容器。

### 5.3 错误响应

| 条件 | error.code | 说明 |
|------|------------|------|
| 非协作者 / 不存在 | `NOT_FOUND` | `行程 ID xxx 不存在或您没有权限访问` |
| tripId 非法 | HTTP 400 | Nest 校验 |

### 5.4 详情页扩展接口（第四阶段可选）

| 接口 | 用途 | 文档 |
|------|------|------|
| `GET /trips/:id/timeline-overview` | 时间轴 Tab 聚合 BFF | `TIMELINE_OVERVIEW_API.md` |
| `GET /trips/:id/insight` | AI 洞察摘要 | `TRIP_DETAIL_API_DOCUMENTATION.md` |
| `GET /trips/:id/state` | 行中状态 | `IN_TRIP_EXECUTION_API.md` |

Native MVP 可先只用 `GET /trips/:id` 展示基础信息与空时间轴。

---

## 6. GET /api/trips/attention-queue（P1）

Dashboard 待关注事项，如冲突、天气风险、预算预警。

### 6.1 请求

```
GET /api/trips/attention-queue?limit=20&offset=0&severity=high&tripId={可选}
Authorization: Bearer <accessToken>
```

| Query | 说明 |
|-------|------|
| limit | 默认 20，最大 100 |
| offset | 分页偏移 |
| severity | `critical` \| `high` \| `medium` \| `low` |
| type | `schedule_conflict` \| `weather_risk` \| `budget_alert` 等 |
| tripId | 限定某行程 |

### 6.2 成功响应 200

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "att-1",
        "type": "schedule_conflict",
        "title": "时间窗冲突",
        "description": "Day 1 下午行程过于紧凑",
        "tripId": "f3626ff1-...",
        "severity": "high",
        "status": "new",
        "createdAt": "2026-07-08T10:00:00.000Z",
        "metadata": {
          "day": 1,
          "actionUrl": "/trips/xxx"
        }
      }
    ],
    "total": 1,
    "limit": 20,
    "offset": 0
  }
}
```

点击 item → 根据 `tripId` 跳详情，或解析 `metadata.actionUrl`。

---

## 7. Swift 数据模型参考

```swift
struct TripListPage: Decodable {
    let trips: [TripListCard]
    let total: Int
}

struct TripListCard: Decodable, Identifiable {
    let id: String
    let name: String?
    let destination: String
    let destinationLabel: String?
    let startDate: String
    let endDate: String
    let status: String
    let totalBudget: Double
    let currency: String?
    let listSummary: TripListSummary?
}

struct TripListSummary: Decodable {
    let displayStatus: String
    let displayStatusLabel: String
    let coverImageUrl: String?
    let durationDays: Int
    let memberCount: Int
    let progressPercent: Double?
    let feasibilityScore: Double?
    let primaryAction: TripPrimaryAction?
}

struct TripPrimaryAction: Decodable {
    let label: String
    let intent: String  // open_detail | open_execute | open_plan_studio | open_insights
}
```

---

## 8. 首页推荐实现

```swift
func loadHome(accessToken: String) async throws -> HomeViewModel {
    async let list = tripService.fetchList(limit: 50)
    async let queue = tripService.fetchAttentionQueue(limit: 10)
    let (trips, attention) = try await (list, queue)
    return HomeViewModel(cards: trips.trips, attentionCount: attention.total)
}

func onCardTap(_ card: TripListCard) {
    switch card.listSummary?.primaryAction?.intent {
    case "open_execute": navigateToExecute(card.id)
    case "open_plan_studio": navigateToPlanning(card.id)
    case "open_insights": navigateToInsights(card.id)
    default: navigateToDetail(card.id)
    }
}
```

---

## 9. curl 联调

```bash
BASE=http://192.168.8.153:8080/api
TOKEN=<accessToken>

# 1. 列表
curl -s "$BASE/trips/list?limit=20" \
  -H "Authorization: Bearer $TOKEN" | jq

# 2. 详情（替换 TRIP_ID）
curl -s "$BASE/trips/TRIP_ID" \
  -H "Authorization: Bearer $TOKEN" | jq

# 3. 关注队列
curl -s "$BASE/trips/attention-queue?limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## 10. 错误码速查

| 场景 | 识别 | Native 动作 |
|------|------|-------------|
| Token 失效 | `UNAUTHORIZED` | refresh → 重试 |
| 行程无权访问 | `NOT_FOUND` | 回列表 / 提示 |
| 列表为空 | `trips: []` | Empty State + 跳转创建入口 |
| 网络失败 | URLSession 错误 | 下拉刷新 |

---

## 11. 下一阶段预告

| 阶段 | 接口 | 说明 |
|------|------|------|
| **创建入口** | Hub ①–② | [`TRIP_CREATE_ENTRIES_NATIVE_API.md`](./TRIP_CREATE_ENTRIES_NATIVE_API.md) |
| **四** | `GET /trips/:id/timeline-overview` | 详情 Tab 聚合 |
| 四 | `GET /trips/:id/insight` | AI 洞察 |
| **五** | `/api/mobile/trips/:id/*` | 行中执行 Mobile BFF — [`EXECUTE_NATIVE_API.md`](./EXECUTE_NATIVE_API.md) |
| 五 | `/api/trips/:id/in-trip/*` | 行中执行（Web 全量） |

---

## 12. 相关文件

| 文件 | 说明 |
|------|------|
| [`TRIP_CREATE_ENTRIES_NATIVE_API.md`](./TRIP_CREATE_ENTRIES_NATIVE_API.md) | **创建行程**（探索 / 攻略） |
| [`SESSION_NATIVE_API.md`](../auth/SESSION_NATIVE_API.md) | 第一阶段 |
| [`USER_PROFILE_NATIVE_API.md`](../auth/USER_PROFILE_NATIVE_API.md) | 第二阶段 |
| `src/trips/dto/trip-status.dto.ts` | **行程生命周期状态枚举** |
| `src/trips/utils/trip-list-bff.projection.util.ts` | displayStatus / primaryAction 投影逻辑 |
| `src/trips/dto/frontend-trip-list-api.types.ts` | 列表 TypeScript SSOT |
| `src/trips/TRIP_DETAIL_API_DOCUMENTATION.md` | 详情页扩展接口 |
| `src/trips/TIMELINE_OVERVIEW_API.md` | 时间轴 BFF |
