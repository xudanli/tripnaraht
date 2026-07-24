# 全程地图 · Journey Map BFF API

> **Base**: `/api/trips/:tripId/journey-map`  
> **Companion**: `/api/itinerary-items/trip/:tripId`

将全程地图首屏从 **1+N+4** 次 HTTP 降为 **1～2** 次；服务端并行查库，支持 ETag 缓存。

---

## `GET /api/trips/:tripId/journey-map`

### Query

| 参数 | 必填 | 说明 |
|------|------|------|
| `include` | 否 | 逗号分隔。默认 `shell`。`shell` = 首屏全部字段；`inspector` = 追加 decision-checker evidence/impact + score 分解（较慢，建议二段加载） |
| `fields` | 否 | coverage 裁剪：`full`（默认）\| `minimal`。`minimal` 跳过 gaps / deduplicatedWarnings，且 segment polyline 使用直线（不调路线 API） |

**示例**

```
GET /api/trips/{tripId}/journey-map?fields=minimal
GET /api/trips/{tripId}/journey-map?include=shell,inspector
GET /api/trips/{tripId}/journey-map?fields=full&include=inspector
```

### 请求头

| Header | 说明 |
|--------|------|
| `If-None-Match` | 与上次响应 `ETag` 一致时返回 **304**（无 body） |

### 响应头

| Header | 说明 |
|--------|------|
| `ETag` | `tripId` + `trip.updatedAt` + `coverage.calculatedAt` + `itemCount` + `fields` + `includeInspector`（header 与 body 同一值） |
| `Cache-Control` | `private, max-age=60` |

### 响应体

统一 `{ success: true, data: JourneyMapResponse }` 包装。404 时 `{ success: false, error: { code: 'NOT_FOUND', ... } }`。

---

## 完整响应示例

```json
{
  "success": true,
  "data": {
    "tripId": "trip_abc",
    "etag": "W/\"jm-abc123\"",

    "trip": {
      "id": "trip_abc",
      "name": "冰岛南岸",
      "destination": "IS",
      "updatedAt": "2026-06-29T12:00:00.000Z",
      "TripDay": [
        { "id": "day-uuid-1", "date": "2026-07-01", "theme": "黄金圈" }
      ]
    },

    "coverage": {
      "tripId": "trip_abc",
      "bounds": { "northeast": { "lat": 64.2, "lng": -18.0 }, "southwest": { "lat": 63.3, "lng": -22.0 } },
      "center": { "lat": 63.8, "lng": -19.5 },
      "zoom": 8,
      "pois": [
        {
          "id": "poi-1",
          "itemId": "item-uuid",
          "day": 1,
          "order": 1,
          "name": "雷克雅未克",
| `type` | 前端枚举：`city` \| `attraction` \| `hotel` \| `restaurant` \| `transport` \| `other`（`nature`→`attraction`，`accommodation`→`hotel`） |
          "coordinates": { "lat": 64.14, "lng": -21.92 },
          "coverageStatus": "covered",
          "evidenceCount": 2
        }
      ],
      "segments": [
        {
          "id": "seg-1",
          "sequenceIndex": 0,
          "day": 1,
          "fromPoiId": "poi-1",
          "toPoiId": "poi-2",
          "distance": 142,
          "duration": 118,
          "routeType": "driving",
          "coverageStatus": "covered",
          "polyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
          "geometrySource": "route_api",
          "hazards": []
        }
      ],
      "gaps": [],
      "summary": { "totalPois": 12, "coverageRate": 0.85 },
      "calculatedAt": "2026-06-30T12:00:00.000Z",
      "dataFreshness": {
        "weather": "2026-06-30T08:30:00.000Z",
        "roadClosure": "2026-06-30T08:45:00.000Z",
        "openingHours": "2026-06-30T08:10:00.000Z",
        "inventory": "2026-06-30T08:05:00.000Z"
      }
    },

    "itineraryItems": [
      {
        "id": "item-uuid",
        "type": "ACTIVITY",
        "tripDayId": "day-uuid-1",
        "Place": { "nameCN": "蓝湖", "metadata": { "lat": 63.88, "lng": -22.45 } },
        "participantIds": ["user-uuid-1", "user-uuid-2"]
      }
    ],

    "feasibilityScore": 72,
    "travelerCount": 10,

    "members": [
      {
        "id": "user-uuid-1",
        "name": "张三",
        "initials": "张三",
        "groupId": "young",
        "avatarColor": "#6366f1"
      }
    ],
    "memberGroups": [
      { "id": "young", "label": "年轻人组", "count": 8 },
      { "id": "elderly", "label": "长者组", "count": 2 },
      { "id": "children", "label": "儿童组", "count": 0 }
    ],

    "daySummaries": [
      { "day": 1, "routeLabel": "雷克雅未克 → 维克" },
      { "day": 2, "routeLabel": "维克 → 斯卡夫塔山" }
    ],

    "diversions": [
      {
        "id": "split_d3_glacier",
        "dayIndex": 2,
        "title": "Day 3 体力分流",
        "splitCoordinates": [-19.02, 63.42],
        "trunkSegmentIds": ["seg-7", "seg-8", "seg-9"],
        "forkAfterSegmentId": "seg-9",
        "groupA": {
          "label": "A组 · 冰川徒步",
          "activityId": "item-hike",
          "color": "#8b5cf6",
          "participantIds": ["user-1", "user-2"],
          "polyline": "...",
          "geometrySource": "route_api"
        },
        "groupB": {
          "label": "B组 · 温泉休息",
          "activityId": "item-rest",
          "color": "#f97316",
          "participantIds": ["user-3"],
          "polyline": "...",
          "geometrySource": "route_api"
        },
        "merge": {
          "coordinates": [-19.0, 63.41],
          "label": "汇合 · 维克",
          "activityId": "item-dinner",
          "time": "17:30",
          "polylineA": "...",
          "polylineB": "...",
          "geometrySource": "route_api"
        }
      }
    ],

    "stats": {
      "totalDays": 6,
      "totalDistanceKm": 1118,
      "activityCount": 28,
      "diversionCount": 1
    },

    "dataFeeds": [
      { "id": "weather", "label": "天气", "updatedAt": "6/30 08:30", "status": "fresh" },
      { "id": "road", "label": "道路状况", "updatedAt": "6/30 08:45", "status": "fresh" },
      { "id": "hours", "label": "开放时间", "updatedAt": "6/30 08:10", "status": "fresh" },
      { "id": "inventory", "label": "住宿库存", "updatedAt": "6/30 08:05", "status": "fresh" }
    ],

    "inspector": {
      "evidence": {},
      "impact": {},
      "scoreRisks": [],
      "scoreFindings": [],
      "activityContexts": [
        {
          "activityId": "item-hike",
          "activityDetail": {
            "activityId": "item-hike",
            "activityTypeLabel": "冰川徒步 / 高强度 / 户外",
            "durationHours": 3.5,
            "transportMinutes": 100,
            "equipment": ["冰爪", "头盔"],
            "intensityScore": 4,
            "summary": "沿冰川边缘安全徒步"
          },
          "memberRows": [
            { "memberId": "user-1", "participating": true, "roleLabel": "发起人", "tags": ["强体力"], "alternativePlan": null }
          ],
          "fitAssessment": {
            "suitabilityPercent": 92,
            "suitabilityLabel": "非常适配",
            "physicalRequirement": "高",
            "riskLevel": "中",
            "weatherImpact": "中",
            "suggestion": "多数成员体力匹配…"
          },
          "diversionDetail": {
            "activityId": "item-hike",
            "overview": "Day 3 上午在瓦特纳区域分流…",
            "meetingPoint": "瓦特纳冰川停车场",
            "groupA": { "label": "A组 · 冰川徒步", "badge": "主活动组", "participantCount": 8 }
          },
          "evidenceSources": [
            { "id": "weather", "label": "Vedur.is", "status": "fresh" }
          ],
          "evidenceConclusion": { "verdict": "executable", "text": "基于当前证据，满足执行条件…" },
          "riskView": {
            "level": "medium",
            "levelLabel": "中风险",
            "keyRisks": ["天气变化", "冰面湿滑"]
          }
        }
      ]
    }
  }
}
```

`inspector` 仅在 `include` 含 `inspector` 时返回；`activityContexts` 仅对有检查器语义的活动生成（分流 / 缺口 / 高强度等）。

---

## `GET /api/trips/:tripId/journey-map/inspector/activities/:activityId`

单活动懒加载（BFF 二段过慢时按 activity 拉取）。

### Query

| 参数 | 说明 |
|------|------|
| `fields` | 同 journey-map，默认 `full` |

### 响应

```json
{
  "success": true,
  "data": {
    "tripId": "trip_abc",
    "activityId": "item-hike",
    "context": { "...": "同 activityContexts[] 单项" },
    "evidence": {},
    "impact": {},
    "etag": "a1b2c3d4e5f67890"
  }
}
```

### ETag

`journey-map etag` + `activityId` 派生；支持 `If-None-Match` → **304**。

---

## 字段说明

### 顶层

| 字段 | 类型 | 说明 |
|------|------|------|
| `tripId` | string | 行程 ID |
| `trip` | object | 行程摘要 + `TripDay[]` |
| `coverage` | object | 与 `GET /readiness/trip/:id/coverage-map` 对齐 |
| `itineraryItems` | array | 全程行程项，含 `Place` 坐标 |
| `feasibilityScore` | number | 准备度总分（0–100，四舍五入） |
| `travelerCount` | number | 出行人数（与 `members.length` 一致） |
| `members` | array | 成员列表（侧栏筛选） |
| `memberGroups` | array | 年龄分组统计 |
| `daySummaries` | array | 侧栏日程起终点文案 |
| `diversions` | array | 分流计划（Inspector 分流 Tab + 地图支路） |
| `stats` | object | 行程统计（覆盖前端推算口径） |
| `dataFeeds` | array | 侧栏数据新鲜度（4 条：天气/道路/开放时间/住宿库存） |
| `inspector` | object | 可选，决策检查器详情 + `activityContexts[]` |
| `etag` | string | 响应体指纹（亦在响应头 `ETag`） |

### `members[]`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 用户 UUID 或占位 id |
| `name` | string | 显示名 |
| `initials` | string | 头像缩写（1–2 字） |
| `groupId` | `"young"` \| `"elderly"` \| `"children"` | 年龄组 |
| `avatarColor` | string? | HEX 头像色 |

### `memberGroups[]`

| 字段 | 说明 |
|------|------|
| `id` | 同 `members[].groupId` |
| `label` | 组名（年轻人组 / 长者组 / 儿童组） |
| `count` | 该组 `members` 数量 |

### `daySummaries[]`

| 字段 | 说明 |
|------|------|
| `day` | **1-based**，与 coverage segment `day` 一致 |
| `routeLabel` | 侧栏展示；优先级：itinerary 起终点 → segment 首尾 POI → 当天 POI → `theme` → `第 N 天` |

**约束**：`daySummaries.length === trip.TripDay.length`，`day` 连续 1…N。

### `dataFeeds[]`

| 字段 | 说明 |
|------|------|
| `id` | `weather` \| `road` \| `hours` \| `inventory` |
| `label` | 展示名 |
| `updatedAt` | 格式化时间 `M/d HH:mm`；无数据时为 `—` |
| `status` | `fresh` \| `stale` |

`inventory` 缺省时回退 `coverage.calculatedAt`。

### `inspector.activityContexts[]`

按 `activityId` 索引，五 Tab 富化（`include=inspector` 时返回）。

| 子字段 | Tab | 说明 |
|--------|-----|------|
| `activityDetail` | 活动详情 | 类型标签、时长、装备、向导、强度分 |
| `memberRows` / `fitAssessment` | 参与人 | 角色、标签、适配度 |
| `diversionDetail` | 分流 | 与 `diversions[]` 互补的概览 / 集合点 / A·B 组 |
| `evidenceSources` / `weatherSnapshot` / `routeEvidence` / `activitySource` / `evidenceConclusion` | 证据 | `verdict`: `executable` \| `caution` \| `blocked` |
| `riskView` | 风险与影响 | 聚合 `scoreRisks` / `scoreFindings` / gaps |

### `stats`

| 字段 | 说明 |
|------|------|
| `totalDays` | `TripDay.length` |
| `totalDistanceKm` | `sum(coverage.segments.distance)` |
| `activityCount` | 非 TRANSIT、非住宿类 itinerary 项 |
| `diversionCount` | `diversions.length` |

### `itineraryItems[].participantIds`

分流活动上的参与者 id 列表（来自 split plan branch members）。无分流时字段省略。

---

## 地图路线几何（§9）

前端 `buildRouteSegments` / `FullJourneyMapCanvas` 已对接。Polyline 为 **Google / Mapbox encoded polyline**，WGS84，可用 `@mapbox/polyline` 解码。

### 主路线 `coverage.segments[]`

| 字段 | 说明 |
|------|------|
| `id` | segment 唯一 id，与 `trunkSegmentIds` 对齐 |
| `sequenceIndex` | 全程 0-based 序号 |
| `day` | 1-based 天序号 |
| `fromPoiId` / `toPoiId` | 关联 `coverage.pois[].id` |
| `polyline` | 贴路几何；无 API 时为两点直线 |
| `geometrySource` | `route_api` \| `straight_line` \| `cached_metadata` |

**成段规则**：按天分组，仅连接当天 itinerary 中**相邻**且均有坐标的 POI（`pois[i] → pois[i+1]`，同 `day`）。不跨天连线；某天有 N 个 POI 时应返回 N−1 条 segment。

**POI 入链规则**：`coverage.pois` 与 `itineraryItems` 使用同一套 `resolvePlaceCoordinates`（PostGIS 批量 → `metadata` / `metadata.location` / enriched `lat`/`lng` / `_coordinates`）。仅含 Place 的行程项；无坐标项不入链（服务端 debug 日志 `coverage POI 链跳过无坐标项`）。前端 marker 来自 itinerary、连线来自 coverage，**须保证有坐标的 Place 项均进入 `coverage.pois`**，否则表现为「有标记、无连线」。

**前端行为**：有 `polyline` 则解码绘线；否则 `fromPoiId → toPoiId` 直线。

### 分流 `diversions[]`

| 字段 | 说明 |
|------|------|
| `trunkSegmentIds` | 分叉前主线 segment id 列表；省略则当天主路线全段绘制 |
| `forkAfterSegmentId` | 可选，等同 fork 点对应 coverage segment id |
| `splitCoordinates` | 分叉点 `[lng, lat]` |
| `groupA/B.polyline` | 分叉点 → 对应组末活动 |
| `groupA/B.activityId` | 地图 activity id（`item-{id}` 或 `poi-{id}`） |
| `groupA/B.participantIds` | 该组参与者 |
| `merge.coordinates` | 汇合点 `[lng, lat]` |
| `merge.polylineA` | A 组活动 → 汇合点 |
| `merge.polylineB` | B 组活动 → 汇合点 |

### `fields` 与几何质量

| `fields` | gaps | segment polyline |
|----------|------|------------------|
| `full`（默认） | 含 | 调 Mapbox Directions / 高德 / Google（`route_api`） |
| `minimal` | 省略 | 直线回退（`straight_line`），不调路线 API |

---

## `coverage.dataFreshness`

| 字段 | 说明 |
|------|------|
| `weather` | 天气证据最后更新时间 ISO |
| `roadClosure` | 道路封闭 |
| `openingHours` | 开放时间 |
| `inventory` | 住宿预订/库存（住宿 POI 的 booking_confirmation） |

---

## 推荐加载策略

1. **地图首屏（快）**：`GET /trips/:id/journey-map?fields=minimal`
2. **贴路几何 + 缺口**：`GET /trips/:id/journey-map?fields=full`（或首屏后二段刷新）
3. **Inspector 面板**：`GET /trips/:id/journey-map?fields=full&include=inspector`
4. **单活动懒加载（可选）**：`GET /trips/:id/journey-map/inspector/activities/:activityId`

---

## 聚合读源

| 字段 | 读源 |
|------|------|
| `trip` | Prisma `trip` + `TripDay` + `metadata.dayThemes` |
| `coverage` | `CoverageMapService.getCoverageMap` |
| `coverage.segments[].polyline` | `RouteGeometryService`（海外 Mapbox → Google；国内高德 + 缓存） |
| `itineraryItems` | `ItineraryItemsService.findByTrip` |
| `feasibilityScore` / inspector score | `CoverageMapService.getReadinessScore` |
| `members` / `memberGroups` | 发起人 + 协作者 + `pacingConfig/metadata.travelers` |
| `daySummaries` | itinerary / coverage POI / segment / theme 多级 fallback |
| `dataFeeds` | `coverage.dataFreshness` |
| `diversions` | `SplitPlanService.projectDaySplits` + 路线几何 enrichment |
| `stats` | 服务端聚合 |
| `inspector` | `DecisionCheckerService` + `activityContexts` 富化 |
| `inspector.activityContexts` | `journey-map-inspector-context.util.ts` |
| `inspector.decisionItems` | `trip.metadata.journeyMapDecisionItems` |

---

## Inspector 写接口（P2）

### `PATCH /api/trips/:tripId/split-plans/:splitPlanId`

编辑分流方案（Inspector「编辑分流」）。覆盖项持久化至 `trip.metadata.splitPlanOverrides[splitPlanId]`，读路径自动 merge。

**Body（部分字段）**

```json
{
  "constraintsVersion": 2,
  "logistics": {
    "meetupPoint": "瓦特纳冰川停车场",
    "meetupTime": "13:30",
    "emergencyContact": "+354 777 1234",
    "transport": "超级吉普"
  },
  "groups": [{ "id": "grp_a", "label": "A组 · 冰川徒步" }],
  "daySplit": {
    "title": "Day 3 体力分流",
    "stats": { "meetupTime": "13:30" },
    "rejoin": { "placeName": "维克酒店", "startTime": "13:30" }
  },
  "emergencyNote": "天气变化时优先联系向导"
}
```

**响应**：`{ splitPlanId, constraintsVersion, overrides, splitPlan, daySplit }`

**已有写接口**：`POST /api/trips/:tripId/split-plans/:splitPlanId/apply`（应用分流）

---

### `POST /api/trips/:tripId/decision-items`

从 Inspector 风险 Tab 创建决策事项（「创建决策事项」按钮）。

**Body**

```json
{
  "activityId": "item-hike",
  "title": "确认 Day 3 冰川装备与向导",
  "description": "基于 riskView 聚合",
  "severity": "high",
  "verdict": "caution",
  "riskLabels": ["天气变化", "冰面湿滑"],
  "constraintsVersion": 2
}
```

**响应**

```json
{
  "success": true,
  "data": {
    "item": {
      "id": "uuid",
      "tripId": "trip_abc",
      "activityId": "item-hike",
      "title": "确认 Day 3 冰川装备与向导",
      "severity": "high",
      "status": "open",
      "source": "journey_map_inspector",
      "createdAt": "2026-06-30T12:00:00.000Z",
      "createdBy": "user-uuid"
    },
    "constraintsVersion": 3
  }
}
```

`include=inspector` 时 `inspector.decisionItems[]` 返回该行程全部 open 事项。

---

## 伴生接口

### `GET /api/itinerary-items/trip/:tripId`

| Query | 说明 |
|-------|------|
| `includePlace` | 默认 `true`；`false` 时省略 `Place` |

一次返回全程全部行程项，可与 journey-map 并行或单独使用。

---

## 实现文件

| 文件 | 职责 |
|------|------|
| `trips.controller.ts` | journey-map / decision-items 路由 |
| `trip-constraint-solver/controllers/split-plan.controller.ts` | split-plans PATCH / apply |
| `services/journey-map.service.ts` | BFF 聚合 |
| `services/journey-map-decision-items.service.ts` | 决策事项写 |
| `trip-constraint-solver/services/split-plan.service.ts` | 分流投影 + PATCH |
| `trip-constraint-solver/utils/split-plan-overrides.util.ts` | 分流覆盖 merge |
| `dto/journey-map.dto.ts` | 响应类型 |
| `utils/journey-map-enrichment.util.ts` | 成员 / 日程 / 分流 / 统计 |
| `utils/journey-map-route-geometry.util.ts` | 分流几何 + trunkSegmentIds |
| `utils/journey-map-etag.util.ts` | ETag + 304 |
| `utils/journey-map-inspector-context.util.ts` | 检查器五 Tab 富化 |
| `readiness/services/coverage-map.service.ts` | coverage + 主路线 polyline + POI 类型归一化 |
| `transport/services/route-geometry.service.ts` | 路线 API 封装 |
