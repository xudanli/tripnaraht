# 规划阶段 — 空间路线接口要求

> 目标 UI：规划工作区 Tab「空间路线」及子页（POI 搜索 / 候选 POI / 地图图层 / 道路风险 / 空间影响 / AI 空间建议）  
> iOS 读模型：`SpatialRouteViewData`（`tripvlea/Features/SpatialRoute/SpatialRouteViewData.swift`）  
> 原则：地图几何由后端权威计算；写操作必须带版本与幂等；**未确认的 AI 方案不得直写 Active Plan**  
> 状态：✅ **P0/P1/P2 后端已接入**；iOS 正式替换 `.preview` 待跟进  
> 更新：2026-07-16

---

## 1. 产品范围

当 `TripLifecycle = planning` 时，工作区第三个 Tab 为空间路线：

```
Active Plan + POI Catalog + World Fact
        ↓
① GET spatial-route（Tab 聚合读，含 map）
        ↓
② 子页按需加载（search / candidates / road-risks）
        ↓
③ 写操作：插入候选 / 添加地点
        ↓
④ 刷新 spatial-route + 推送 trip_context_changed
```

| 入口 | 调用 |
|------|------|
| Tab「空间路线」 | `GET .../spatial-route` |
| POI 搜索 | `GET .../planning/spatial/search`（或聚合内 `searchResults`） |
| 候选 POI 详情 | 聚合内 `candidateDetail` 或 `GET .../planning/spatial/candidates/{poiId}` |
| 道路风险 | 聚合内 `routeWarning` 或 `GET .../planning/spatial/road-risks` |
| 「插入路线」 | `POST .../planning/spatial/candidates/{poiId}/insert` |
| 「添加地点」 | `POST .../planning/spatial/locations` |
| 日程「优化当日路线」 | **不走本接口** → 见 [AUTO_ARRANGE_API.md](../trips/arrange-itinerary/AUTO_ARRANGE_API.md) |

交互重点（人机交互规范）：查看空间关系 → 评估候选影响 → 确认插入 / 放弃。

---

## 2. 接口一览

### P0 — Tab 聚合读（替换 Preview）

| 方法 | 路径 | 对应 iOS | 状态 |
|------|------|----------|------|
| GET | `/api/mobile/trips/{tripId}/spatial-route` | `SpatialRouteViewData` + `map` | ✅ 已接入 |

### P1 — 详情子资源（可聚合内嵌，或懒加载）

| 方法 | 路径 | 用途 | 状态 |
|------|------|------|------|
| GET | `.../planning/spatial/candidates/{poiId}` | 候选 POI 详情 | ✅ |
| GET | `.../planning/spatial/search` | POI 搜索 | ✅ |
| GET | `.../planning/spatial/road-risks` | 道路风险详情 | ✅ |
| GET | `.../planning/route-blueprint` | 路线蓝图（「查看计划」跳转） | ✅ |
| PATCH | `.../planning/days/{dayIndex}` | 更新单日主题 | ✅ |
| PATCH | `.../planning/day-themes` | 批量更新主题 | ✅ |

### P2 — 写操作

| 方法 | 路径 | 用途 | 状态 |
|------|------|------|------|
| POST | `.../planning/spatial/candidates/{poiId}/insert` | 将候选插入路线 | ✅ |
| POST | `.../planning/spatial/locations` | 添加自定义地点 | ✅ |

### 相关（非本 Tab 专有，但会刷新地图）

| 能力 | 说明 |
|------|------|
| `GET .../context-snapshot` | SSOT；规划期 `execution=null` |
| WebSocket `trip_context_changed` | `changedSections` 含 `plan` / `worldFacts` 时拉新 `spatial-route` |
| 自动编排 Apply | 写入行程后几何变化，需刷新本 Tab |

---

## 3. 通用约定

### 3.1 请求头

| Header | 场景 | 必填 |
|--------|------|------|
| `Authorization: Bearer <token>` | 全部 | 是 |
| `X-Trip-Id: <tripId>` | 行程相关 | 建议 |
| `X-Client-Version: <semver>` | 全部 | 建议 |
| `If-Match: <contextVersion>` | 写操作 | 是 |
| `Idempotency-Key: <uuid>` | 写操作 | 是 |

### 3.2 响应信封

```json
{
  "success": true,
  "data": {},
  "requestId": "uuid",
  "tripId": "trip-xxx",
  "contextVersion": 142,
  "planVersion": 18,
  "serverTime": "2026-07-16T04:00:00Z"
}
```

写操作成功后 **`contextVersion` / `planVersion` 必须递增**。

### 3.3 坐标契约（硬性）

- 折线 / 风险区 `coordinates`：**`[lng, lat]`**（GeoJSON 顺序）
- Marker：`lat` / `lng` 分字段；禁止混用两种折线顺序
- 文档与实现必须一致，变更需发版说明

---

## 4. P0 — 空间路线聚合读

### 4.1 请求

```
GET /api/mobile/trips/{tripId}/spatial-route
Authorization: Bearer <token>
X-Trip-Id: <tripId>
```

**Query（可选）：**

| 参数 | 说明 |
|------|------|
| `dayIndex` | 1-based；地图焦点日，影响高亮 / `selectedPOI` 默认上下文 |
| `ifNoneMatch` | 基于 `contextVersion`；未变可 `304`（若支持） |

**鉴权：** 行程成员。

### 4.2 响应 `data`

对应 `SpatialRouteViewData` + 地图几何：

```typescript
{
  dayMarkers: [{
    id: string
    dayNumber: number           // 1-based
    label: string               // 可直接展示，如「南岸」
    isConfirmed: boolean
  }]

  selectedPOI: {
    title: string
    distanceFromDay: string     // "距离 Day3：28km"
    timeImpact: string          // "影响：+40 分钟"
    matchPercent: number        // 0–100
    systemImage: string         // SF Symbol 名，如 "drop"
  }

  aiInsight: {
    title: string
    detail: string
    suggestion: string
  }

  routeWarning: {
    label: string
    roadName: string
    status: string
    riskLevel: string
    impactRange: string
    updatedAt: string           // 展示文案或 ISO8601；iOS 首版按字符串展示
  }

  pageSubtitle: string          // 如「冰岛环岛旅行 · Day 3 · 规划中」

  layerSummary: {
    confirmedRoutes: number
    candidatePOIs: number
    riskPoints: number
    memberPreferences: number
    routeElements: number
    poiCount: number
  }

  searchResults: [{
    id: string
    title: string
    distanceInfo: string
    timeImpact: string
    matchPercent: number
    systemImage: string
  }]

  candidateDetail: {
    title: string
    region: string
    distanceInfo: string
    stayDuration: string
    timeImpact: string
    matchPercent: number
    tags: string[]
    recommendReasons: string[]
    impactMetrics: [{
      icon: string
      label: string
      value: string
      tag: string
    }]
    insertionOptions: [{
      id: string                // 给 insert API 的 insertionOptionId
      title: string
      detail: string
      drivingImpact: string
      isRecommended: boolean
      isSelected: boolean
    }]
    aiRecommendation: string
  }

  aiSuggestionDetail: {
    alertMessage: string
    alertNote: string
    happened: string
    affected: string
    options: string
    recommendation: string
    currentDriving: string
    currentDistance: string
    currentIntensity: string
    currentStatus: string
    optimizedDriving: string
    optimizedDistance: string
    optimizedIntensity: string
    optimizedStatus: string
    optimizedSummary: string
    evidenceItems: [{
      title: string
      detail: string
    }]
  }

  map: {
    polylines: [{
      id: string
      dayNumber: number
      coordinates: [number, number][]   // [lng, lat]
      style: "confirmed" | "candidate" | "risk"
    }]
    markers: [{
      id: string
      type: "confirmedPOI" | "candidatePOI" | "riskPoint" | "memberPreference"
      lat: number
      lng: number
      label?: string
    }]
    riskZones?: [{
      id: string
      coordinates: [number, number][]   // [lng, lat]
      level: string
    }]
  }
}
```

### 4.3 硬性约束

- `map` **必填**：至少 **1 条 polyline** + **1 个 `confirmedPOI` marker**（有正式行程日时）；无 Active Plan 几何时返回空数组并配合空态文案，勿省略 `map` 键
- `dayMarkers` 与行程日一致；`dayNumber` 1-based
- 展示文案字段由后端投影成可直接展示的中文（或当前 locale），客户端不做二次路由计算
- `insertionOptions[].id` 稳定、可回传；推荐项 `isRecommended: true`，默认选中 `isSelected: true`（建议有且仅有一个 `isSelected`）
- 空字段勿用 `null` 阻断 UI；无内容用空数组 / 空字符串 / 合理默认

### 4.4 后端数据来源建议

| 区块 | 可复用能力 |
|------|-----------|
| `dayMarkers` / `map.polylines` | Active Plan 路线几何 |
| `selectedPOI` / `searchResults` / `candidateDetail` | POI Catalog + 空间匹配 / 影响估算 |
| `routeWarning` / `riskZones` / `map` 风险 style | World Fact / 道路规则 |
| `aiInsight` / `aiSuggestionDetail` | AI Gateway 结构化输出 |
| `layerSummary` | Plan 图层统计 |

---

## 5. P1 — 详情子资源

首版可将详情内嵌在 §4 聚合中；子页深链或刷新时再拆独立 GET。

### 5.1 候选 POI 详情

```
GET /api/mobile/trips/{tripId}/planning/spatial/candidates/{poiId}
```

响应 `data` 结构同 §4.2 `candidateDetail`（可额外带 `poiId` / `placeId`）。

### 5.2 POI 搜索

```
GET /api/mobile/trips/{tripId}/planning/spatial/search
```

**Query：**

| 参数 | 说明 |
|------|------|
| `q` | 关键词 |
| `dayIndex` | 焦点日，影响距离 / 时长估算 |
| `lat` / `lng` | 搜索中心（可选） |
| `limit` | 默认建议 20 |

```typescript
{
  items: [{
    id: string
    title: string
    distanceInfo: string
    timeImpact: string
    matchPercent: number
    systemImage: string
  }]
}
```

与聚合 `searchResults` 元素形态一致。

### 5.3 道路风险详情

```
GET /api/mobile/trips/{tripId}/planning/spatial/road-risks
```

```typescript
{
  alertTitle: string
  alertDetail: string
  items: [{
    label: string
    roadName: string
    status: string
    riskLevel: string
    impactRange: string
    updatedAt: string
  }]
  evidence: [{
    source: string
    detail: string
    updatedAt: string
    sourceURL?: string
  }]
}
```

`items[0]` 宜能投影到 Tab 上的 `routeWarning`。

### 5.4 路线蓝图（跨 Tab）

```
GET /api/mobile/trips/{tripId}/planning/route-blueprint
```

空间页「查看计划」会跳转。实现：`MobilePlanningService.getRouteBlueprint` + `route-blueprint.projection.util.ts`。

响应 `data` 对齐 iOS `RouteBlueprintData`：`title` / `summary` / `days[]`（主题、核心景点、住宿城、`status`、`confirmationStatus`）/ `pace` / `aiInsight`。

概览卡可调用 `projectRouteBlueprintOverviewSummary` 嵌入 `planning-overview.routeBlueprint`（仅 id/dayNumber/label/subtitle/status）。

### 5.5 每日主题写入

```
PATCH /api/mobile/trips/{tripId}/planning/days/{dayIndex}
PATCH /api/mobile/trips/{tripId}/planning/day-themes
```

- 仅写 `metadata.dayThemes` / `dayLabels`（可选 `dayThemeSources`），**不**改 itinerary / 几何
- `dayIndex`：**1-based**；需 `If-Match` + `Idempotency-Key`
- 空串 → `400`；清空用 `theme: null` 或 `clearTheme: true`；过长 → `THEME_TOO_LONG`
- 写成功后 `route-blueprint.days[].theme` 与 `schedule-timeline.days[].theme|title` 对齐；WS `changedSections: ['plan']`

---

## 6. P2 — 写操作

### 6.1 插入候选 POI

```
POST /api/mobile/trips/{tripId}/planning/spatial/candidates/{poiId}/insert
Authorization: Bearer <token>
If-Match: <contextVersion>
Idempotency-Key: <uuid>
Content-Type: application/json
```

```json
{
  "dayIndex": 4,
  "insertionOptionId": "2",
  "slotTime": "10:00"
}
```

| 字段 | 说明 |
|------|------|
| `dayIndex` | 1-based 目标日 |
| `insertionOptionId` | 对应 `candidateDetail.insertionOptions[].id` |
| `slotTime` | 可选 `"HH:mm"`；缺省由选项或服务端排程决定 |

**触发 UI：** 候选 POI 详情「插入路线」

**成功：** 写入 Active Plan；返回更新后的 `contextVersion` / `planVersion`；建议响应内带回刷新用摘要或要求客户端重拉 `spatial-route`。

**版本冲突：** `409` + `CONTEXT_VERSION_CONFLICT`，带新 `contextVersion`。

### 6.2 添加地图地点

```
POST /api/mobile/trips/{tripId}/planning/spatial/locations
```

```json
{
  "placeId": "poi-custom-1",
  "lat": 63.5321,
  "lng": -19.5112,
  "title": "自定义观景点",
  "dayIndex": 3
}
```

| 字段 | 说明 |
|------|------|
| `placeId` | 可选；已知目录 ID |
| `lat` / `lng` | 必填（自定义落点） |
| `title` | 展示名 |
| `dayIndex` | 挂到哪一天 |

**触发 UI：** 「添加地点」

同样要求 `If-Match`、`Idempotency-Key`、成功后版本递增与刷新。

### 6.3 错误码

| 场景 | HTTP | code / errorCode | 客户端 |
|------|------|------------------|--------|
| 版本冲突 | 409 | `CONTEXT_VERSION_CONFLICT` | 拉新后重试 |
| 非法 insertionOptionId | 400 | — | Toast / 回详情重选 |
| 无行程日 / dayIndex 越界 | 400 | `NO_TRIP_DAYS` 等 | 提示补齐日期 |
| 非成员 | 403 | — | 常规会话 |
| 行程 / POI 不存在 | 404 | — | — |
| Idempotency 重放 | 200 | — | 与首次结果一致 |

---

## 7. 实时刷新

```
ws://<host>:3000/ws?token=<accessToken>
```

```json
{
  "type": "trip_context_changed",
  "tripId": "trip-1",
  "contextVersion": 29,
  "changedSections": ["plan", "worldFacts"]
}
```

**iOS 行为：** `changedSections` 含 `plan` / `worldFacts` / `readiness` 时，刷新 `context-snapshot` 与 `spatial-route`（及受影响的其它规划读模型）。

---

## 8. 与自动编排的边界

| 能力 | 走哪条契约 |
|------|------------|
| 空间 Tab 读模型 / 地图 | **本文档** `spatial-route` |
| 候选插入 / 添加地点 | **本文档** spatial write |
| Dock / 添加活动「自动编排」 | [AUTO_ARRANGE_API.md](../trips/arrange-itinerary/AUTO_ARRANGE_API.md) `auto-arrange` |
| 「优化当日路线」 | 同上 `ai-actions` + `optimize_route` |
| Apply / Discard Proposal | 同上 `proposals/{id}/apply\|discard` |

**不要**实现或对接已废弃的 `POST .../planning/ai-optimize`。  
日程 Proposal Apply 成功后，客户端应刷新 `spatial-route` 以同步几何。

---

## 9. iOS 接入要点

1. 新建 / 扩展 `PlanningDataRepository`：先接 `GET spatial-route`
2. `PlanningWorkspaceView` / `SpatialRoutePlanningTabView` 用 API 替换 `.preview`
3. `map` 后续接 MapLibre；首版也可只消费列表与卡片字段
4. 写操作：`If-Match` + `Idempotency-Key`；`409` → `AppError.versionConflict`
5. 子页：优先用聚合内嵌；深链或刷新时再调 §5
6. WS / Apply 后：并行刷新 `spatial-route`（可与 `itinerary-composer` 一起）

| 能力 | 建议方法 |
|------|----------|
| Tab 读 | `fetchSpatialRoute(tripId:dayIndex:)` |
| 搜索 | `searchSpatialPOIs(...)` |
| 候选详情 | `fetchSpatialCandidate(poiId:)` |
| 道路风险 | `fetchRoadRisks(...)` |
| 插入 | `insertSpatialCandidate(...)` |
| 添加地点 | `addSpatialLocation(...)` |

---

## 10. 验收

- [x] `GET spatial-route` 可填满 `SpatialRouteViewData`；关键字段无 null 致空白
- [x] `map` 至少 1 条 polyline + 1 个 `confirmedPOI`（有计划时）；坐标为 `[lng, lat]`
- [x] 传 `dayIndex` 时焦点日与 markers / 高亮一致
- [x] `search` 与聚合 `searchResults` 元素形态一致
- [x] `candidates/{id}` 与聚合 `candidateDetail` 一致；`insertionOptions.id` 可回传 insert
- [x] insert / add location：`If-Match` 冲突返回 `CONTEXT_VERSION_CONFLICT`；幂等重放一致
- [x] 写成功后 `contextVersion`/`planVersion` 递增，且再拉 `spatial-route` 可见几何/列表变化
- [ ] WS `plan` / `worldFacts` 推送后刷新可对齐服务端（写操作已推送 `trip_context_changed`；iOS 侧待接）

---

## 11. 实施优先级

```
P0  spatial-route（含 map）     → 替换 Preview
P1  search / candidates / road-risks → 子页懒加载
P2  insert / add location       → 地图深度编辑闭环
    + WS 刷新联动
```

---

## 12. 相关文件与文档

| 类型 | 路径 |
|------|------|
| 本文档 | `src/mobile/SPATIAL_ROUTE_API.md` |
| 实现 | `MobileSpatialRouteService` + `MobilePlanningController` |
| 投影 | `src/mobile/utils/spatial-route.projection.util.ts` |
| 路线蓝图 | `MobilePlanningService.getRouteBlueprint` + `route-blueprint.projection.util.ts` |
| DTO | `src/mobile/dto/mobile-planning.types.ts` → `MobileSpatialRouteDto` / `MobileRouteBlueprintDto` 等 |
| 候选落点复用 | `ArrangeItineraryItemsService.placeCandidate` / `createItem` |
| Mobile 信封 | `src/mobile/utils/mobile-envelope.util.ts` |
| Mobile Planning Controller | `src/mobile/controllers/mobile-planning.controller.ts` |
| 自动编排 | [AUTO_ARRANGE_API.md](../trips/arrange-itinerary/AUTO_ARRANGE_API.md) |
| Journey Map（Web BFF，可复用几何思路） | [JOURNEY_MAP_BFF_API.md](../trips/JOURNEY_MAP_BFF_API.md) |
| 执行期 live-route / context-snapshot | [EXECUTE_NATIVE_API.md](../auth/EXECUTE_NATIVE_API.md) |
| iOS 读模型 | `tripvlea/Features/SpatialRoute/SpatialRouteViewData.swift` |
| Tab UI | `SpatialRoutePlanningTabView.swift` / `SpatialRouteDestination.swift` |
| 既有空间领域 | `src/domain/spatial/`、`src/trips/decision/services/spatial-*.ts` |
