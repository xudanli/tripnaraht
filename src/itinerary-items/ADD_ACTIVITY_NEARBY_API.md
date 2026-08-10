# 添加活动 · 附近 POI（独立接口）

> **与以下接口无关，请勿混用：**
> - `GET /api/trips/:tripId/attraction-explore/recommendations`（探索页推荐卡片）
> - `GET /api/itinerary-items/nearby-poi`（旧通用附近搜索，多类别混排易不准）

执行阶段「添加活动」页请只调本接口。

---

## `GET {BASE}/api/itinerary-items/add-activity-nearby`

公开接口。**每次只查一个类别**，严格分类；**有封面图优先**；返回一等字段 `nearbyCategory` / `imageUrl` / `placeId`。

### Query

| 参数 | 必填 | 说明 |
|------|------|------|
| `itemId` | 与 lat/lng 二选一 | 行程项 ID（解析坐标） |
| `lat` / `lng` | 与 itemId 二选一 | 搜索中心 |
| `category` | 与 chip 二选一* | 见下表 |
| `chip` | 与 category 二选一* | `hotel` / `gas` / `supermarket` / `indoor` / `rest` / `nearby` |
| `radius` | 否 | 米；不传则按类别默认 |
| `limit` | 否 | 默认 30，最大 50 |
| `tripId` | 否 | 传入则排除该行程已排程 Place |

\* 同时传时以 `category` 为准。

### category / chip 映射与默认半径

| chip | category | 默认 radius | 规则摘要 |
|------|----------|-------------|----------|
| `hotel` | `HOTEL` | 15km | 酒店/民宿/青旅；**排除营地** |
| `gas` | `GAS_STATION` | 20km | 仅燃油/充电 + 编目油站；**不含超市** |
| `supermarket` | `SUPERMARKET` | 20km | 仅超市品牌（Bónus/Krónan 等）；**不含便利店/油站** |
| `indoor` | `INDOOR` | 15km | 博物馆/泳池/影院/SPA；**不含运动中心** |
| `rest` | `REST_AREA` | 15km | 编目休息区 + **有名**停车点；不含油站、无名 Parking |
| `nearby` | `ATTRACTION` | 10km | 编目著名景点（rating≥4、非 OSM 碎片）；有图优先 |

### 请求示例

```http
GET /api/itinerary-items/add-activity-nearby?lat=64.1466&lng=-21.9426&chip=supermarket
GET /api/itinerary-items/add-activity-nearby?itemId=<uuid>&category=GAS_STATION&tripId=trip_xxx
GET /api/itinerary-items/add-activity-nearby?lat=63.42&lng=-19.02&chip=hotel&limit=20
```

### 成功响应

```json
{
  "success": true,
  "data": [
    {
      "id": 390012,
      "placeId": 390012,
      "nearbyCategory": "SUPERMARKET",
      "nameCN": "Bónus 超市（雷克雅未克店）",
      "nameEN": "Bónus",
      "imageUrl": "http://…/places/390012/….jpg",
      "hasImage": true,
      "rating": 4.2,
      "address": "…, Reykjavík, 冰岛",
      "openingHoursText": "Mo-Su 10:00-20:00",
      "openStatus": "open",
      "phone": "+354 …",
      "website": "https://…",
      "requiresReservation": null,
      "feeLabel": null,
      "priceHint": null,
      "lat": 64.14,
      "lng": -21.92,
      "distanceMeters": 820,
      "source": "place",
      "addable": true,
      "metadata": { "nearbyCategory": "SUPERMARKET", "canonicalType": "SUPERMARKET_BONUS" }
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `nearbyCategory` | **展示/筛选以它为准**（不要再用 Place.category 猜） |
| `imageUrl` / `hasImage` | 封面；列表已按有图 → 距离排序 |
| `placeId` + `addable` | 可加入行程时用 `placeId` 调 planning/activities |
| `source=safe_stop` | 编目油站/休息点，通常无 `placeId`，`addable=false` |
| `openingHoursText` | OSM 营业时间原文；无标签为 `null` |
| `openStatus` | `open` / `closed` / `unknown`（粗判，缺数据勿当权威） |
| `phone` / `website` | 联系方式；无则为 `null` |
| `requiresReservation` | OSM `reservation` 有值才给 true/false，否则 `null` |
| `feeLabel` / `priceHint` | 门票/停车等费用说明（**不是人均消费**）；无则为 `null` |

详情：`GET /api/places/{placeId}`（仅 `addable=true`）的 `metadata` 含结构化 `openingHours`、`contact`、`commercial`（回填/enrich 后）。

### iOS Chip 建议

```swift
enum AddActivityNearbyChip: String {
  case hotel, gas, supermarket, indoor, rest, nearby
}
// GET …/add-activity-nearby?itemId=&chip=\(chip.rawValue)&tripId=
```
