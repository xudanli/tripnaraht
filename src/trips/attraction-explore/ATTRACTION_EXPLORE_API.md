# Attraction Explore BFF API

**Base URL:** `/api/trips/:tripId/attraction-explore`  
**鉴权:** `Authorization: Bearer <JWT>`（非 production 可匿名 dev user）  
**TS Client:** [frontend-attraction-explore-api-client.ts](./dto/frontend-attraction-explore-api-client.ts)

## 心智模型

```text
GET /candidates  → 服务端持久化候选（含攻略 accept / 探索选路 seed）
前端 sessionStorage seed 仅为过渡；后端就绪后应改读此接口
创建 trip 时可带 metadata.attractionExplore.suggestAttractionExplore=1
```

## 接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/context` | 左栏：主题/适合谁、已选筛选、旅行条件、成员偏好 |
| PATCH | `/context` | 更新 themeIds / suitabilityIds / viewTab（支持顶层字段或 `selectedFilters` 嵌套）；响应为完整 context |
| GET | `/recommendations?themeIds=&suitabilityIds=&viewTab=` | 中栏分组推荐 |
| POST | `/search` | 顶栏语义搜索，结构与 recommendations 相同 |
| GET | `/candidates` | 右栏候选清单 + 汇总 |
| POST | `/candidates` | 添加候选 `{ placeId?, attractionId?, priority? }` |
| PATCH | `/candidates` | 批量更新 `{ candidates: [{ id, priority, sortOrder }] }` |
| DELETE | `/candidates/:candidateId` | 删除单个候选，返回更新后的清单 |
| POST | `/auto-arrange` | 默认生成 `PlanProposal`（`commitMode: "proposal"`）；`direct` 时直写 `{ taskId, status, itemCount? }` |
| POST | `/ai-consult` | AI 选点 `{ question?, candidateIds? }` |
| GET | `/map?candidateIds=&viewTab=` | 地图：路线 polyline + POI 坐标（PostGIS → metadata → 冰岛 canonical 名称降级） |

## 字段说明

### `travelConditions.origin`

按优先级解析：租车取车点 → `metadata.origin` / `departureCity` → 探索场景 `initialInput` → 冰岛默认 `凯夫拉维克机场 (KEF)`。

### `summary.routeSpanKm`

按优先级：`metadata.routeSpanKm` → 探索已选路线 `routeDetail.totalKm` → 候选清单有序路径 Haversine 累加（至少 2 个可解析坐标）。

### PATCH `/context` 持久化

请求体示例：

```json
{
  "selectedFilters": {
    "themeIds": ["waterfalls"],
    "viewTab": "map"
  }
}
```

与顶层 `themeIds` / `suitabilityIds` / `viewTab` 等价；写入 `trip.metadata.attractionExplore`，PATCH 响应与后续 GET 一致。

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
