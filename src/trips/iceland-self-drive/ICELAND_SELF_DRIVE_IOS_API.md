# 创建冰岛自驾 · 前端对接接口文档

> 后端已实现路径前缀：`/api/iceland-self-drive`  
> 依据实现代码整理（P0 + P1 + P2；含车辆 payload 扩展 / OCR 草稿 / 字典 / 路线影响预览）。  
> 最后更新：2026-07-21  
> 个人中心（用户级画像 / 驾驶员资料 / 证件库）见 [PERSONAL_CENTER_IOS_API.md](../../mobile/PERSONAL_CENTER_IOS_API.md)；创建行程时会从用户级 `travel-portrait` + `driver-profile` 投影 `driving-settings` 默认值。

---

## 1. 通用约定

### Base URL

```
开发: http://127.0.0.1:3000/api
生产: https://tripnara.com/api
```

### 请求头

| Header | 必填 | 说明 |
|--------|------|------|
| `Authorization` | 多数接口必填 | `Bearer <accessToken>`；**免登录**：`GET /regions`、`GET /locations`、`GET /catalog/rental-companies`、`GET /catalog/vehicle-classes` |
| `Content-Type` | 写操作 | `application/json` |
| `Idempotency-Key` | **仅** `POST /trips` | UUID；重复提交返回同一 `tripId` |
| `X-Client-Version` | 建议 | 如 `1.0.0` |

### 响应信封

```json
{
  "success": true,
  "data": { }
}
```

失败时 `success: false`，业务错误常见：

| code | 场景 |
|------|------|
| `VALIDATION_ERROR` | 参数非法 / 缺 Idempotency-Key / 日期倒挂 |
| `UNAUTHORIZED` | 未登录 |
| `FORBIDDEN` | 非协作成员 / 非草稿所有者 |
| `TRIP_NOT_FOUND` / `DRAFT_NOT_FOUND` | 资源不存在 |
| `NOT_ICELAND_SELF_DRIVE` | trip 不是本产品线 |

### 时间格式

| 类型 | 格式 |
|------|------|
| 日期 | `yyyy-MM-dd` |
| 日期时间 | ISO-8601，如 `2027-02-13T10:00:00Z` |

---

## 2. 推荐前端调用顺序

```text
进入向导
  ├─ GET  /locations          （起终点选项）
  ├─ GET  /regions            （想去区域 + 封面）
  ├─ GET  /bookable-places    （Step3 住宿/活动真实地点）
  ├─ GET  /daylight-hint      （Step1 日照文案，可本地兜底）
  └─ POST /drafts             （可选：跨设备同步草稿）

Step3 提交
  └─ POST /trips              （必带 Idempotency-Key）
        │
        ├─ generationStatus == READY  → 直接结果页
        └─ generationStatus == RUNNING → 轮询 GET .../bootstrap
              直到 READY（或 FAILED）

结果页
  ├─ GET  /trips/{tripId}/bootstrap
  ├─ CTA 进入规划 → 打开 tripId（PLANNING）
  └─ CTA 自驾设置 → GET/PATCH .../driving-settings
        ├─ GET  /catalog/rental-companies · /catalog/vehicle-classes
        ├─ POST .../vehicle/documents（可选 OCR）→ 确认后 PATCH
        └─ POST .../vehicle/preview-impact（可选，草稿影响预览）
```

**可替换现状：** 不再只调 `POST /exploration/scenarios` + `materialize` 最小字段；改走本 BFF。Exploration 旧路径仍可用，但不承接完整向导。

---

## 3. 接口一览

| 优先级 | 方法 | 路径 | 用途 |
|--------|------|------|------|
| P2 | `GET` | `/iceland-self-drive/locations` | 起终点字典 |
| P2 | `GET` | `/iceland-self-drive/regions` | 区域字典 |
| P0 | `GET` | `/iceland-self-drive/bookable-places` | Step3 住宿/活动目录（placeId） |
| P2 | `GET` | `/iceland-self-drive/daylight-hint` | 日照提示 |
| P2 | `POST` | `/iceland-self-drive/drafts` | 创建/更新草稿 |
| P2 | `GET` | `/iceland-self-drive/drafts` | 草稿列表 |
| P2 | `GET` | `/iceland-self-drive/drafts/{draftId}` | 恢复草稿 |
| P0 | `POST` | `/iceland-self-drive/trips` | **主写：创建 Trip + 初始路线** |
| P0 | `GET` | `/iceland-self-drive/trips/{tripId}/bootstrap` | 结果页摘要 |
| P1 | `GET` | `/iceland-self-drive/trips/{tripId}/driving-settings` | 自驾设置读（含 fuel/insurance） |
| P1 | `PATCH` | `/iceland-self-drive/trips/{tripId}/driving-settings` | 自驾设置写（drivers/route/fuel/insurance） |
| P1 | `GET` | `/iceland-self-drive/catalog/rental-companies` | 租车公司字典 |
| P1 | `GET` | `/iceland-self-drive/catalog/vehicle-classes` | 车型等级字典 |
| P1 | `POST` | `/iceland-self-drive/trips/{tripId}/driving-settings/vehicle/documents` | 上传订单/合同（OCR 草稿） |
| P1 | `GET` | `/iceland-self-drive/trips/{tripId}/driving-settings/vehicle/documents/{docId}` | 查识别状态/结果 |
| P1 | `POST` | `/iceland-self-drive/trips/{tripId}/driving-settings/reevaluate` | 保存后重评 / 调整草案 |
| P2 | `POST` | `/iceland-self-drive/trips/{tripId}/driving-settings/preview-impact` | 通用草稿影响预览 |
| P2 | `POST` | `/iceland-self-drive/trips/{tripId}/driving-settings/vehicle/preview-impact` | 车辆影响预览（别名） |

完整 URL = Base URL + 上表路径，例如：  
`POST https://tripnara.com/api/iceland-self-drive/trips`

---

## 4. 枚举（前后端对齐）

### `locationCode`

| code | 展示 |
|------|------|
| `keflavik` | 凯夫拉维克国际机场 KEF（默认） |
| `reykjavik` | 雷克雅未克市中心 |
| `akureyri` | 阿库雷里 |

### `vehicleAcquisition`

| code | 含义 |
|------|------|
| `rent` | 租车 |
| `owned` | 已有车 |
| `undecided` | 未定 |

### `regionId`（多选，可空）

`golden_circle` · `south_coast` · `snaefellsnes` · `east_fjords` · `north` · `ring_road` · `westfjords` · `highlands` · `reykjanes`

### `booking.kind`

`lodging` | `activity`

### `cancellationPolicy`

`free_cancellation` | `partial_non_refundable` | `unknown`

### 自驾设置

| 字段 | 值 |
|------|-----|
| `lifecycleStatus` | `not_rented` / `booked_unconfirmed` / `model_confirmed`（页面三态） |
| `vehicleClass` | `sedan_2wd` / `crossover` / `suv_4wd` / `camper` / `unknown`（决策枚举） |
| `vehicleClassLabel` | 展示名，如 `Toyota RAV4 或同级` |
| `fuelType` | `gasoline` / `diesel` / `hybrid` / `electric` |
| `source` | `manual` / `order_ocr` / `contract_ocr` |
| `experienceLevel` | `beginner` / `intermediate` / `experienced` |
| `gravelTolerance` | `low` / `moderate` / `high` |
| `restFrequency` | `frequent` / `normal` / `minimal` |
| `rentalRestrictions[]` | `no_f_road` / `no_highland` / `no_gravel` / `no_wading` |
| `settingsStatus` | `needs_confirm` / `pending` / `completed` |

### `generationStatus`

| 值 | 前端行为 |
|----|----------|
| `RUNNING` | 结果页展示生成中，轮询 bootstrap |
| `READY` | 可展示路线摘要 + checklist |
| `FAILED` | 提示失败，允许重试创建（换新 Idempotency-Key） |

---

## 5. 详细契约

### 5.1 `GET /iceland-self-drive/locations`

**免登录。**

**Response `data`**

```json
{
  "items": [
    {
      "code": "keflavik",
      "nameZh": "凯夫拉维克国际机场 KEF",
      "nameEn": "Keflavík International Airport (KEF)",
      "shortNameZh": "凯夫拉维克",
      "pickupCode": "KEF"
    }
  ]
}
```

### 5.2 `GET /iceland-self-drive/regions`

**免登录**（向导 Step 选区可直接调用）。

```json
{
  "items": [
    {
      "id": "south_coast",
      "nameZh": "南岸",
      "nameEn": "South Coast",
      "coverImageUrl": "https://tripnara.com/static/iceland-self-drive/regions/south_coast.jpg",
      "supportLevel": "full"
    }
  ]
}
```

> `supportLevel`：`full`（有代表景点包）/ `partial`（有包但 Catalog 薄，目前 **东峡湾**）/ `experimental`（无包）/ `corridor`（环岛）。  
> 封面图目前为静态占位 URL，CDN 未齐时可本地图兜底。

### 5.2b `GET /iceland-self-drive/bookable-places`

Step3 住宿/活动选点目录（**无 tripId**；与规划 `Place` 同源，保证 `placeId` 创建后可进行程/地图）。

**Query**

| 参数 | 必填 | 说明 |
|------|------|------|
| `kind` | 是 | `lodging` \| `activity` |
| `q` | 否 | 关键词（中英名 / 地址） |
| `regionIds` | 否 | 逗号分隔 ISD regionId，如 `south_coast,golden_circle` |
| `limit` | 否 | 默认 40，最大 80 |

**Response `data`**

```json
{
  "items": [
    {
      "placeId": 4242,
      "kind": "lodging",
      "nameZh": "维克黑沙滩酒店",
      "nameEn": "Vik Black Beach Hotel",
      "locationText": "Vík í Mýrdal",
      "regionId": "south_coast",
      "regionKey": "IS_SOUTH_COAST",
      "lat": 63.42,
      "lng": -19.01,
      "rating": 4.6
    }
  ]
}
```

- `lodging` → `Place.category=HOTEL`
- `activity` → `ATTRACTION` / `SERVICE`
- 作用域：`City.countryCode=IS` 或 `metadata.countryCode=IS`

### 5.3 `GET /iceland-self-drive/daylight-hint`

**Query**

| 参数 | 必填 | 例 |
|------|------|-----|
| `startDate` | 是 | `2027-02-10` |
| `endDate` | 是 | `2027-02-18` |

**Response `data`**

```json
{
  "dayCount": 9,
  "nightCount": 8,
  "seasonLabel": "冬季旅行（2月）",
  "daylightLabel": "预计每日可用日照约 7-8 小时",
  "daylightHoursMin": 7,
  "daylightHoursMax": 8
}
```

### 5.4 草稿（可选）

#### `POST /iceland-self-drive/drafts`

- 新建：不带 `draftId`
- 更新：`POST /iceland-self-drive/drafts?draftId=<uuid>`

Body 字段均可选（渐进保存），与正式创建字段同名：

```json
{
  "destinationCode": "IS",
  "productLine": "iceland_self_drive",
  "dateRange": { "startDate": "2027-02-10", "endDate": "2027-02-18" },
  "travelerCount": 4,
  "startLocationCode": "keflavik",
  "endLocationCode": "keflavik",
  "endSameAsStart": true,
  "vehicleAcquisition": "rent",
  "regionIds": ["south_coast"],
  "bookings": [],
  "skipBookings": true,
  "step": 2
}
```

**Response `data`**

```json
{
  "draftId": "uuid",
  "createdAt": "2027-01-01T00:00:00.000Z",
  "updatedAt": "2027-01-01T00:00:00.000Z",
  "step": 2,
  "wizard": { }
}
```

#### `GET /iceland-self-drive/drafts` → `{ "items": [ ...同上 ] }`

#### `GET /iceland-self-drive/drafts/{draftId}` → 单条同上

草稿 **没有** `tripId`；正式生成时在 `POST /trips` 带 `draftId` 可标记草稿已消费。

---

### 5.5 `POST /iceland-self-drive/trips`（主写）

**Headers：** `Idempotency-Key: <uuid>` 必填

**Request**

```json
{
  "destinationCode": "IS",
  "productLine": "iceland_self_drive",
  "dateRange": {
    "startDate": "2027-02-10",
    "endDate": "2027-02-18"
  },
  "arrivalAt": null,
  "departureAt": null,
  "travelerCount": 4,
  "startLocationCode": "keflavik",
  "endLocationCode": "keflavik",
  "endSameAsStart": true,
  "vehicleAcquisition": "rent",
  "regionIds": ["south_coast", "snaefellsnes", "ring_road"],
  "bookings": [
    {
      "clientId": "local-uuid-1",
      "kind": "lodging",
      "placeId": 4242,
      "regionId": "reykjanes",
      "name": "雷克雅未克KEX酒店",
      "locationText": "Reykjavík",
      "startDate": "2027-02-10",
      "endDate": "2027-02-12",
      "cancellationPolicy": "free_cancellation",
      "notes": null
    },
    {
      "clientId": "local-uuid-2",
      "kind": "activity",
      "placeId": 5566,
      "regionId": "south_coast",
      "name": "冰川徒步体验",
      "locationText": "Sólheimajökull",
      "startDate": "2027-02-13",
      "endDate": null,
      "startDateTime": "2027-02-13T10:00:00Z",
      "durationMinutes": 180,
      "cancellationPolicy": "free_cancellation"
    }
  ],
  "skipBookings": false,
  "fillBookingsLater": false,
  "draftId": null,
  "asyncGeneration": false
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `destinationCode` | 是 | 固定 `IS` |
| `productLine` | 是 | 固定 `iceland_self_drive` |
| `dateRange` | 是 | `endDate >= startDate` |
| `travelerCount` | 是 | `1…12` |
| `startLocationCode` / `endLocationCode` | 是 | 见枚举 |
| `endSameAsStart` | 是 | `true` 时终点按起点处理 |
| `vehicleAcquisition` | 是 | |
| `regionIds` | 否 | 可 `[]` |
| `bookings` | 否 | 硬锚点 |
| `skipBookings` / `fillBookingsLater` | 否 | UI 开关 |
| `draftId` | 否 | 消费服务端草稿 |
| `asyncGeneration` | 否 | `true` → 先 `RUNNING` 再后台生成 |

**Response `data`**

```json
{
  "tripId": "uuid",
  "tripVersion": 1,
  "contextVersion": "cv_1",
  "lifecycle": "PLANNING",
  "scenarioId": "uuid",
  "generationStatus": "READY",
  "generatedRoute": {
    "summaryTitle": "初始路线已生成",
    "summarySubtitle": "你可以先预览，再决定要不要调整",
    "regionSummary": "南岸 + 斯奈山 + 环岛",
    "durationLabel": "9天8晚",
    "dateRangeLabel": "2月10日 - 2月18日",
    "transferLabel": "凯夫拉维克往返",
    "travelerLabel": "4人同行"
  },
  "completion": {
    "progress": 0.5,
    "headline": "你已完成基础信息录入",
    "subheadline": "还需要关键的自驾信息以完成路线确认",
    "doneItems": [
      { "code": "check_date_range", "label": "检查基础时间范围" },
      { "code": "route_skeleton", "label": "建立路线骨架" },
      { "code": "fix_bookings", "label": "固定已预订住宿" }
    ],
    "pendingItems": [
      {
        "code": "confirm_vehicle_class",
        "label": "确认车辆级别",
        "settingsItem": "vehicle"
      },
      {
        "code": "set_driver_count",
        "label": "设置驾驶人数",
        "settingsItem": "drivers"
      },
      {
        "code": "confirm_daily_drive_limit",
        "label": "确认每日驾驶上限",
        "settingsItem": "drivers"
      }
    ]
  },
  "warnings": [
    {
      "code": "REGION_TIGHTNESS",
      "message": "9天冬季行程同时包含太多区域可能会比较紧张…"
    }
  ]
}
```

**iOS 注意**

1. 用 `tripId` 进入规划空间 / 结果页二次进入。
2. 同一次用户点击只生成一个 `Idempotency-Key` 并缓存；重试网络用同一 key。
3. `asyncGeneration: true` 时：先落结果页 loading，再 `GET bootstrap` 直到 `generationStatus !== "RUNNING"`（建议 1–2s 间隔，超时 ~30s）。
4. `warnings` 非阻断，结果页可横幅展示。
5. **双层状态（方案 A'）**：
   - `generationStatus`：Trip 壳 + 走廊骨架是否跑完（`RUNNING`/`READY`/`FAILED`）。
   - `initialPlan.status`：初始可执行日程是否完成（`GENERATING`/`READY`/`PARTIAL`/`FAILED`）。**结果页以 `initialPlan.status` 为准**，不要把顶层 READY 当成「日程已生成」。
6. **流水线**：seed（**Region Planning Pack** 核心候选 + Catalog RECOMMENDER 填充；`limit = min(48, max(24, dayCount*3))`）→ **coverage-first**（优先 `REGION_CORE`，尊重 `substitutionGroup`）→ 若 `OR_TOOLS_SOLVER_URL` 可达则**按日 VRPTW 重写 times 写入 `proposal.changes`**（note=`[ortools-initial]`，非 shadow）→ **verify** → 仅 `PASS`/`WARN` 时 apply（**无** `force`）。求解器不可用或 coverage 失败 → 回退贪心 `AUTO_ARRANGE`。`BLOCK` → 不写入 + `PLAN_VERIFICATION_BLOCKED`。**不**打开全局 `OR_TOOLS_AUTHORITATIVE_CANARY`。
7. 日程验收：`GET /api/trips/{tripId}/schedule-timeline?include=items`；按日条目在 `data.days[].itineraryItems`。看 `scheduledActivityCount` / `emptyDayCount` / `initialPlan.regionCoverage`，不要用「items≥1」当产品完成标准。9 天 / 南岸预期应覆盖瀑布/黑沙滩等**代表点的一部分**，而非塞满全部种子 POI。
8. **前端兜底**：仅当 `initialPlan.status === "FAILED"` **且** `initialPlan.fallbackAllowed === true` 时才可自行 auto-arrange+apply。`GENERATING` / `PARTIAL` / 网络超时 **不要**接管。
9. Warning 码：`ATTRACTION_CANDIDATES_EMPTY` / `INITIAL_SCHEDULE_EMPTY`（→ FAILED）/ `INITIAL_SCHEDULE_PARTIAL`（→ PARTIAL）/ `PLAN_VERIFICATION_BLOCKED` / `REGION_PACK_MISSING` / `REGION_CORE_CANDIDATES_EMPTY` / `REGION_COVERAGE_PARTIAL` / `REGION_CAPACITY_INSUFFICIENT` / `REGION_SEASONALLY_UNAVAILABLE` / `REGION_VEHICLE_INCOMPATIBLE`。
10. `initialPlan.arrangeAuthority`（可选）：`coverage_ortools` | `coverage` | `greedy`。
11. **`initialPlan.regionCoverage`**：证明所选 `regionIds` 是否被真实覆盖（种子 ≠ 强制全排）。

#### 区域规划种子包（Region Planning Pack）语义

| 类型 | 含义 | 是否强制入日程 |
|------|------|----------------|
| BOOKING_HARD_ANCHOR | 已确认住宿/活动/取还车 | ✅ 必须 |
| USER_MUST_GO | 用户明确必去 | ✅ 尽量必须 |
| REGION_COVERAGE_ANCHOR | 区域代表候选（`REGION_CORE`） | ⚠️ 至少选部分 |
| OPTIONAL_CANDIDATE | 次级/推荐填充 | ❌ 容量允许再排 |

P0/P1 已冻结包：`reykjavik_arrival`、`golden_circle`、`south_coast_west`、`south_coast_east`、`snaefellsnes`、`north`、`westfjords`、`highlands`；`east_fjords` 有包但 Catalog 景点薄（`supportLevel: partial`）。`ring_road` 为走廊偏好（`corridor`），不按地理覆盖验收。高地包带 `involvesFRoad` / 四驱与夏季约束。

示例：

```json
"regionCoverage": {
  "requested": ["golden_circle", "south_coast"],
  "covered": [
    {
      "regionId": "golden_circle",
      "packId": "golden_circle",
      "scheduledPlaceIds": [381037, 381084]
    },
    {
      "regionId": "south_coast",
      "packId": "south_coast_west",
      "scheduledPlaceIds": [381080, 381038, 381039]
    }
  ],
  "excluded": [],
  "activePackIds": ["reykjavik_arrival", "golden_circle", "south_coast_west", "south_coast_east"]
}
```


| `initialPlan.status` | UI 建议 |
|----------------------|---------|
| `GENERATING` | 正在生成初始日程 |
| `READY` | 初始日程已生成 |
| `PARTIAL` | 基础日程已建立，部分日期仍需补充 |
| `FAILED` | 初始日程生成失败（可兜底重试） |

---

### 5.6 `GET /iceland-self-drive/trips/{tripId}/bootstrap`

二次进入结果页 / 异步轮询用。

**Response `data`**

```json
{
  "tripId": "uuid",
  "generationStatus": "READY",
  "generatedRoute": { "...": "同 POST /trips" },
  "completion": { "...": "同 POST /trips" },
  "drivingSettingsSummary": {
    "items": [
      { "code": "vehicle", "status": "needs_confirm", "pendingCount": null },
      { "code": "drivers", "status": "pending", "pendingCount": 2 },
      { "code": "members", "status": "completed", "pendingCount": 0 },
      { "code": "route_preference", "status": "completed", "pendingCount": 0 }
    ]
  },
  "initialPlan": {
    "status": "READY",
    "verificationStatus": "PASS",
    "scheduledDayCount": 9,
    "scheduledActivityCount": 14,
    "scheduledAnchorCount": 2,
    "emptyDayCount": 0,
    "lastProposalId": "proposal_…",
    "fallbackAllowed": false,
    "applyReason": "INITIAL_PLAN_CREATION",
    "authorizationSource": "CREATE_WIZARD_SUBMISSION",
    "arrangeAuthority": "coverage_ortools",
    "regionCoverage": {
      "requested": ["south_coast"],
      "covered": [
        {
          "regionId": "south_coast",
          "packId": "south_coast_west",
          "scheduledPlaceIds": [381080, 381038, 381039]
        }
      ],
      "excluded": [],
      "activePackIds": ["reykjavik_arrival", "south_coast_west", "south_coast_east"]
    },
    "generatedAt": "2026-07-21T00:00:00.000Z",
    "warnings": []
  },
  "initialScheduleReady": true,
  "scheduledItemCount": 16,
  "activeProposalId": null,
  "warnings": []
}
```

补全车辆+驾驶者后，再拉 bootstrap：`pendingItems` 应清空，`progress` 上升。

- `generationStatus === "RUNNING"` 时 `initialPlan.status` 强制为 `GENERATING`，`fallbackAllowed=false`。
- 扁平 `initialScheduleReady` / `scheduledItemCount` 仅兼容旧客户端（`READY` ⇔ status；count = activity+anchor）。
- `activeProposalId` 在方案 A'（已条件 apply）下恒为 `null`。

---

### 5.7 `GET /iceland-self-drive/trips/{tripId}/driving-settings`

```json
{
  "tripId": "uuid",
  "intro": "完善自驾设置，让 NARA 帮你生成更安全、更合适的冰岛路线。",
  "privacyNote": "所有设置仅用于生成和优化路线，不会对外分享",
  "routeHint": {
    "code": "GRAVEL_EXPOSURE",
    "message": "当前路线包含 54 公里碎石路，请先确认车辆级别和驾驶经验",
    "gravelKm": 54
  },
  "contextVersion": "cv_1",
  "items": [
    {
      "code": "vehicle",
      "title": "车辆信息",
      "subtitle": "车型、四驱能力、租车合同限制等会直接影响可行路线",
      "status": "needs_confirm",
      "pendingCount": null,
      "payload": {
        "lifecycleStatus": "not_rented",
        "acquisition": "rent",
        "rentalCompanyId": null,
        "rentalCompanyName": null,
        "vehicleClass": null,
        "vehicleClassLabel": null,
        "is4wd": null,
        "fuelType": null,
        "isHighBody": null,
        "estimatedRangeKm": null,
        "pickupAt": null,
        "rentalRestrictions": [],
        "source": "manual",
        "recognitionSummary": null
      }
    },
    {
      "code": "drivers",
      "title": "驾驶者信息",
      "subtitle": "…",
      "status": "pending",
      "pendingCount": 2,
      "payload": {
        "driverCount": null,
        "experienceLevel": null,
        "dailyDrivingLimitHours": null
      }
    },
    {
      "code": "members",
      "title": "成员状态",
      "subtitle": "…",
      "status": "completed",
      "pendingCount": 0,
      "payload": {
        "hasChildren": false,
        "hasElderly": false,
        "motionSickness": false
      }
    },
    {
      "code": "route_preference",
      "title": "路线偏好",
      "subtitle": "…",
      "status": "completed",
      "pendingCount": 0,
      "payload": {
        "gravelTolerance": "moderate",
        "allowNightDriving": false,
        "restFrequency": "normal"
      }
    }
  ]
}
```

`routeHint` 可能为 `null`（无明显碎石暴露时）。

---

### 5.8 `PATCH /iceland-self-drive/trips/{tripId}/driving-settings`

部分更新，只传改动的块：

```json
{
  "vehicle": {
    "lifecycleStatus": "model_confirmed",
    "acquisition": "rent",
    "rentalCompanyId": "blue_car_rental",
    "rentalCompanyName": "Blue Car Rental",
    "vehicleClass": "suv_4wd",
    "vehicleClassLabel": "Toyota RAV4 或同级",
    "is4wd": true,
    "fuelType": "gasoline",
    "isHighBody": true,
    "estimatedRangeKm": 500,
    "pickupAt": "2026-07-16T10:00:00Z",
    "rentalRestrictions": ["no_f_road", "no_wading"],
    "source": "manual",
    "recognitionSummary": null
  },
  "drivers": {
    "driverCount": 2,
    "experienceLevel": "intermediate",
    "dailyDrivingLimitHours": 5
  },
  "members": {
    "hasChildren": false,
    "hasElderly": false,
    "motionSickness": false
  },
  "routePreference": {
    "gravelTolerance": "moderate",
    "allowNightDriving": false,
    "restFrequency": "normal"
  }
}
```

**Response：** 与 GET 同结构（更新后完整 settings + 新 `contextVersion`，如 `cv_2`）。  
未显式传 `lifecycleStatus` 时，服务端按 `vehicleClass` / 租车信息自动推导三态。  
`routeHint` 会随车辆限制（如 `no_f_road` / `is4wd=false`）重算。

---

### 5.9 `GET /iceland-self-drive/catalog/rental-companies`

**免登录。**

```json
{
  "items": [
    {
      "id": "blue_car_rental",
      "nameZh": "Blue Car Rental",
      "nameEn": "Blue Car Rental"
    }
  ]
}
```

### 5.10 `GET /iceland-self-drive/catalog/vehicle-classes`

**免登录。**

```json
{
  "items": [
    {
      "code": "suv_4wd",
      "labelZh": "Toyota RAV4 或同级",
      "labelEn": "Toyota RAV4 or similar",
      "defaultIs4wd": true,
      "defaultFuelType": "gasoline",
      "defaultIsHighBody": true,
      "defaultEstimatedRangeKm": 500
    }
  ]
}
```

### 5.11 `POST .../driving-settings/vehicle/documents`

`multipart/form-data`：字段 `file`（截图/PDF，≤12MB），可选 `sourceHint`=`order_ocr`|`contract_ocr`。

**Response `data`（可合并进 vehicle 的草稿；客户端确认后再 PATCH）**

```json
{
  "docId": "uuid",
  "status": "ready",
  "createdAt": "2026-07-21T00:00:00.000Z",
  "updatedAt": "2026-07-21T00:00:00.000Z",
  "contentType": "image/png",
  "fileName": "order.png",
  "vehicleDraft": {
    "lifecycleStatus": "booked_unconfirmed",
    "acquisition": "rent",
    "rentalCompanyId": "blue_car_rental",
    "rentalCompanyName": "Blue Car Rental",
    "vehicleClass": "suv_4wd",
    "vehicleClassLabel": "Toyota RAV4 或同级",
    "is4wd": true,
    "fuelType": "gasoline",
    "rentalRestrictions": ["no_f_road", "no_wading"],
    "source": "order_ocr",
    "recognitionSummary": {
      "fields": ["rentalCompany", "vehicleClass", "is4wd"],
      "warnings": ["wading_insurance_unconfirmed"]
    }
  },
  "warnings": ["wading_insurance_unconfirmed"]
}
```

> 当前为 stub OCR（启发式草稿），接口形状已冻结；后续可替换真实识别而不改客户端契约。

### 5.12 `GET .../driving-settings/vehicle/documents/{docId}`

返回与上传时同形的文档记录（`status` / `vehicleDraft` / `warnings`）。

### 5.13 `POST .../driving-settings/vehicle/preview-impact`

传入草稿 `vehicle`（可与 PATCH 同形），**不落库**：

```json
{
  "vehicle": {
    "vehicleClass": "sedan_2wd",
    "is4wd": false,
    "rentalRestrictions": ["no_f_road", "no_wading"]
  }
}
```

**Response `data`**

```json
{
  "impactSummary": "合同限制：暂不可行 f_road / wading；当前路线约含 54 公里碎石/高地相关路段，租车合同限制可能要求改线",
  "routeHint": {
    "code": "GRAVEL_RESTRICTED",
    "message": "…",
    "gravelKm": 54
  },
  "blockedCapabilities": ["f_road", "wading"],
  "warnings": []
}
```

---

## 5.14 自驾设置扩展（drivers / routePreference / fuel / insurance）

> 2026-07-21：Hub 增加 `fuel` / `insurance` item；`drivers.candidates` 来自 trip 成员；`routePreference` 含 F-road/涉水/高风/节奏。

### GET `items[]` 新增 code

| code | 说明 |
|------|------|
| `fuel` | 燃油补给策略 |
| `insurance` | 保险确认 + 路线暴露投影 |

### PATCH 扩展 body

```json
{
  "drivers": {
    "arrivalDayDriving": "short_only",
    "candidates": [
      { "memberId": "uuid", "isSelected": true, "role": "main", "snowExperience": "familiar" }
    ]
  },
  "routePreference": {
    "pacePreference": "safe",
    "dailyDrivingLimitHours": 5,
    "fRoadPreference": "avoid",
    "waterCrossingPreference": "avoid",
    "highWindPreference": "avoid",
    "nightDrivingPreference": "avoid"
  },
  "fuel": {
    "fuelType": "gasoline",
    "refuelStrategy": "early",
    "useDynamicSafetyMargin": true
  },
  "insurance": {
    "userAcknowledgedCodes": ["wading"],
    "preferredUpgradeCodes": [],
    "syncRentalRestrictions": true
  },
  "reevaluate": false
}
```

- 日驾上限以 `routePreference.dailyDrivingLimitHours` 为源，PATCH 时同步到 `drivers`
- `insurance.syncRentalRestrictions=true` 且确认涉水 → 写入 `vehicle.rentalRestrictions` 含 `no_wading`
- 未知 `memberId` / 非唯一 `role=main` → `VALIDATION_ERROR`

### 新路由

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `.../driving-settings/preview-impact` | 通用草稿影响（vehicle/route/insurance/fuel） |
| `POST` | `.../driving-settings/reevaluate` | 触发重评；返回 `status=queued` + `previewBullets` |
| `POST` | `.../driving-settings/vehicle/preview-impact` | 车辆专用别名（保留） |

---

## 6. iOS 对接清单（建议）

| 阶段 | 改动 |
|------|------|
| 1 | `IcelandSelfDriveCreationStore` 提交改调 `POST .../trips`，带齐向导字段 + `Idempotency-Key` |
| 2 | 结果页改读响应内 `generatedRoute` / `completion`；二次进入调 `bootstrap` |
| 3 | 去掉本地假进度；`pendingItems[].settingsItem` 跳转自驾设置对应分区 |
| 4 | 自驾设置页改 `GET/PATCH driving-settings`（扩展 vehicle 三态 + 租车/燃料等字段） |
| 5 | 租车公司 / 车型等级改读 `catalog/*`（可降级本地） |
| 6 | （可选）订单/合同 OCR：`POST/GET .../vehicle/documents` → 确认后 PATCH |
| 7 | （可选）草稿影响：`POST .../vehicle/preview-impact` |
| 8 | Step1 日照改 `daylight-hint`；区域封面改 `regions`（可降级本地） |
| 9 | （可选）草稿同步 `drafts`；`asyncGeneration` + bootstrap 轮询 |

进入规划空间：使用返回的 `tripId`，lifecycle 已是 `PLANNING`（与现有规划工作区打开方式一致）。

---

## 7. 最小可跑通示例（同步）

```http
POST /api/iceland-self-drive/trips
Authorization: Bearer <token>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "destinationCode": "IS",
  "productLine": "iceland_self_drive",
  "dateRange": { "startDate": "2027-02-10", "endDate": "2027-02-18" },
  "travelerCount": 2,
  "startLocationCode": "keflavik",
  "endLocationCode": "keflavik",
  "endSameAsStart": true,
  "vehicleAcquisition": "rent",
  "regionIds": ["south_coast"],
  "skipBookings": true,
  "asyncGeneration": false
}
```

成功后：

```http
GET /api/iceland-self-drive/trips/{tripId}/bootstrap
Authorization: Bearer <token>
```

---

## 8. 实现位置（后端）

- Controller：`src/trips/iceland-self-drive/iceland-self-drive.controller.ts`
- Module：`src/trips/iceland-self-drive/iceland-self-drive.module.ts`
- Initial Plan 权威编排：`services/iceland-initial-plan-arrange.service.ts`（coverage-first + 可选按日 OR-Tools；写入 `changes`，非全局 canary）
- Region Planning Pack：`packs/iceland-region-planning-packs.p0.ts` + `services/iceland-region-planning-pack.service.ts`
