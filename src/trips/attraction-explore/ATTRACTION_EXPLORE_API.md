# Attraction Explore BFF API

**Base URL:** `/api/trips/:tripId/attraction-explore`  
**鉴权:** `Authorization: Bearer <JWT>`（非 production 可匿名 dev user）  
**TS Client:** [frontend-attraction-explore-api-client.ts](./dto/frontend-attraction-explore-api-client.ts)  
**更新:** 2026-07-17（添加活动页：quickFilters / sort / contextTip / 扁平 items）

## 心智模型

```text
进页
  ├─ GET /context?dayIndex=
  ├─ GET /api/trips/attention-queue?tripId=   // 红点（全局）
  └─ GET /recommendations?dayIndex=&sort=&quickFilter=&lat=&lng=
点 Chip / 改排序
  ├─ PUT|PATCH /context  { selectedFilters }
  └─ GET /recommendations（带新 filter/sort）
搜索
  └─ GET /api/mobile/.../planning/spatial/search 或 recommendations?q=
加入今天
  └─ POST /api/mobile/.../planning/activities
```

## 接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/context?dayIndex=` | 页头：Chips / 排序 / dayLabel / 副标题；兼容 themes / suitabilities |
| PATCH / PUT | `/context` | 更新 `selectedFilters`（含 `quickFilterIds` / `sort`）；响应完整 context |
| GET | `/recommendations?themeIds=&suitabilityIds=&viewTab=&dayIndex=&quickFilter=&sort=&q=&lat=&lng=` | 扁平 `items` + 分组 `groups`；含 `contextTip` |
| POST | `/search` | 顶栏语义搜索，结构与 recommendations 相同；body 可带 `dayIndex` |

### Mobile 别名

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/mobile/trips/:tripId/planning/activities/recommendations` | 同 `/recommendations`（`mode=same_day` 除外） |
| GET | `/api/mobile/trips/:tripId/planning/spatial/search` | POI 搜索 |
| POST | `/api/mobile/trips/:tripId/planning/activities` | 「加入今天」：`dayIndex` + `placeId` / `attractionId` |
| GET | `/api/trips/attention-queue?tripId=` | 铃铛未读（非本页独有） |

### `dayIndex`（推荐 / 搜索 / context）

- **1-based**，与 route-blueprint / schedule-timeline 归一化后一致
- 过滤：当日行程 `placeId` 或标题（中英）已出现的点不进主推荐列表
- 排序：提高与当日 theme/label、邻近当日锚点的权重
- 标记：`alreadyInItinerary`（任意日已在 Active Plan）、`alreadyInDay`（当日）；搜索结果可能带 badge「已在行程 / 已在当日」

### GET `/context`

```json
{
  "tripId": "...",
  "dayIndex": 3,
  "dayLabel": "Day 3",
  "subtitle": "黄金圈",
  "destination": "IS",
  "quickFilters": [
    { "id": "nearby", "label": "附近可去", "icon": "location", "selected": true }
  ],
  "themes": [{ "id": "waterfalls", "label": "瀑布" }],
  "suitabilities": [{ "id": "family", "label": "亲子家庭" }],
  "selectedFilters": {
    "quickFilterIds": ["nearby"],
    "themeIds": [],
    "suitabilityIds": [],
    "viewTab": "recommended",
    "sort": "smart"
  },
  "sortOptions": [
    { "id": "smart", "label": "智能推荐" },
    { "id": "distance", "label": "距离最近" }
  ],
  "travelConditions": { "origin": "...", "weatherHint": "..." },
  "memberPreferences": { "memberCount": 2, "topThemes": [], "topSuitabilities": [] }
}
```

### PUT/PATCH `/context`

```json
{
  "selectedFilters": {
    "quickFilterIds": ["nearby", "indoor"],
    "sort": "smart",
    "viewTab": "recommended"
  },
  "dayIndex": 3
}
```

写入 `trip.metadata.attractionExplore`，响应与 GET 一致。改完后前端再拉 `/recommendations`。

### GET `/recommendations`（相对现网补齐）

```json
{
  "tripId": "...",
  "dayIndex": 3,
  "viewTab": "recommended",
  "contextTip": "当前有强风提示…",
  "aiTip": "当前有强风提示…",
  "items": [
    {
      "id": 123,
      "placeId": 123,
      "attractionId": "uuid",
      "name": "黄金瀑布",
      "title": "黄金瀑布",
      "summary": "...",
      "imageUrl": "...",
      "badge": "AI 推荐",
      "isAiRecommended": true,
      "openStatus": "unknown",
      "travelInfo": "驾车 12 分钟 · 距离 8.6 km",
      "driveMinutes": 12,
      "distanceKm": 8.6,
      "tags": ["不影响后续行程", "适合风大天气"],
      "matchPercent": 92,
      "recommendationReasons": ["..."],
      "alreadyInItinerary": false,
      "primaryAction": "add_to_day",
      "meta": {}
    }
  ],
  "groups": [/* 兼容 Web 分组 */]
}
```

| Query | 说明 |
|-------|------|
| `dayIndex` | 必传（添加活动页） |
| `quickFilter` / `quickFilterIds` | 与 Chip 对应 |
| `sort` | `smart` \| `distance` \| `match` \| `open_now` |
| `q` | 搜索词 |
| `lat`, `lng` | 可选，算附近 / 驾车时间 |
| `themeIds`, `viewTab` | 兼容现有 |

## 字段说明

### `travelConditions.origin`

按优先级解析：租车取车点 → `metadata.origin` / `departureCity` → 探索场景 `initialInput` → 冰岛默认 `凯夫拉维克机场 (KEF)`。

### `summary.routeSpanKm`

按优先级：`metadata.routeSpanKm` → 探索已选路线 `routeDetail.totalKm` → 候选清单有序路径 Haversine 累加（至少 2 个可解析坐标）。

### PATCH `/context` 持久化

与顶层 `themeIds` / `suitabilityIds` / `viewTab` / `quickFilterIds` / `sort` 等价；写入 `trip.metadata.attractionExplore`。

## 快捷筛选 Chips

| id | 标签 |
|----|------|
| `nearby` | 附近可去 |
| `indoor` | 室内备选 |
| `supply` | 补给便利 |
| `easy` | 轻松好走 |
| `team` | 团队匹配 |

## 排序

| id | 标签 |
|----|------|
| `smart` | 智能推荐 |
| `distance` | 距离最近 |
| `match` | 匹配度 |
| `open_now` | 正在开放 |

## 候选 priority

- `must_go` — 必去（攻略 accept seed 默认）
- `very_interested` — 很感兴趣（路线 seed / 手动默认）
- `alternative` — 备选

## 候选 source

- `manual` — 用户在中栏/搜索添加
- `guide_accept` — 攻略 canonical accept 写入
- `route_seed` — 探索路线选路后 seed（`/dashboard/explore` 流）
- `search` / `ai_consult` — 预留

## 推荐分组

| groupId | 标题 |
|---------|------|
| `first_time_must_see` | 第一次来最值得去 |
| `along_route` | 刚好在路线附近 |
| `rainy_day` | 下雨天也能玩（博物馆/教堂/室内/商业温泉浴场；排除高地徒步、湖景、户外天然温泉、黑教堂等纯外景点；**不受主题筛选影响**） |

## 数据库

迁移：`20260706120000_trip_attraction_explore_candidates`  
表：`trip_attraction_explore_candidates`（`trip_id` + `place_id` 唯一）

## 前端迁移

1. 进入景点探索页：`GET /candidates` 替代 `sessionStorage` 读取
2. 添加/排序：`POST` / `PATCH /candidates`
3. 创建 trip 后若 `metadata.attractionExplore.suggestAttractionExplore === true`，直接打开探索页
4. 探索路线流选路成功后后端自动 `route_seed`，无需前端写 seed
5. **添加活动页**：先 `GET context?dayIndex=`，再 `GET recommendations`；Chip 变更用 `PUT context` 后重拉 recommendations
