# Travel Product Catalog — 管理后台 & 前端对接接口文档

> **模块**: `src/travel-product-catalog`  
> **前缀**: `/api`  
> **响应壳**: `{ success: boolean, data?, error?: { code, message, details? } }`  
> **状态**: Catalog CRUD **已上线**；**体验项目（无供应商）** 为添加活动主路径；Offering/Session 为可选升格

Demo / 种子：

| 实体 | ID / Code |
|------|-----------|
| Place（杰古沙龙） | `381041` / `Jökulsárlón Glacier Lagoon` |
| Operator | `op_demo_arctic_adventures` |
| Offering | `offer_demo_solheim_glacier_discovery` |
| Session | `sess_demo_solheim_20260718_0900` |
| Experience（示例） | `EXP_JOKULSARLON_ZODIAC` 等 |

---

## 0. 职责切分（体验优先）

| 端 | 干什么 | 不干什么 |
|----|--------|----------|
| **管理后台** | 维护 Experience；维护 **Place↔Experience**（此地可做什么）；有货时再维护 Operator/Offering/Session | 不要求每条体验都有供应商 |
| **C 端添加活动** | 主路径：选地点 → 选**体验项目** → 写入 `experienceDefinitionId`+`placeId` | **不要**把选供应商做成必经步 |
| **可选升格** | 有 PUBLISHED Offering 时再选班次，写 `productOfferingId`/`productSessionId` | 没有货也可完成规划 |

```
Admin: Experience + PlaceExperienceLink
         ↓
GET /travel-products/places/:placeId/experiences   ← 添加活动「体验」Tab
         ↓
POST /itinerary-items  { placeId, experienceDefinitionId, … }
         ↓（可选）
GET /travel-products/offerings?experienceDefinitionId=…
GET …/sessions?date=…
PATCH item { productOfferingId, productSessionId }
```

---

## 1. 前端已可用接口

### 1.0 添加活动 — 体验项目（主入口，无供应商）

**当用户已选/上下文有 Place（如杰古沙龙 `381041`）：**

```http
GET /api/travel-products/places/381041/experiences
```

```json
{
  "success": true,
  "data": {
    "place": { "id": 381041, "nameEN": "Jökulsárlón Glacier Lagoon", "nameCN": "冰河湖", "category": "ATTRACTION" },
    "items": [
      {
        "linkId": "…",
        "sortOrder": 20,
        "label": "Zodiac 快艇",
        "isFeatured": true,
        "isActive": true,
        "displayNameZh": "Zodiac 快艇",
        "displayNameEn": "Zodiac 快艇",
        "experience": {
          "id": "cuid…",
          "code": "EXP_JOKULSARLON_ZODIAC",
          "productType": "CRUISE_BOAT_TOUR",
          "categoryCode": "SCENIC_CRUISE",
          "subtypeCode": "ZODIAC_BOAT",
          "displayNameZh": "杰古沙龙 Zodiac 快艇",
          "displayNameEn": "Jökulsárlón Zodiac Boat",
          "typicalDurationMin": 75,
          "fitnessLevel": "LOW",
          "riskLevel": "MEDIUM",
          "weatherDependency": "HIGH",
          "requiresGuide": true
        }
      }
    ]
  }
}
```

**弹窗列表用：** `displayNameZh` / `label` / `experience.typicalDurationMin` / `isFeatured`。  
**写入行程：** `experience.id` → `experienceDefinitionId`，`place.id` → `placeId`。

杰古沙龙种子包含：水陆两栖船、Zodiac、私人快艇、皮划艇、摄影团、湖＋冰洞、湖＋冰川徒步、直升机。

#### 创建行程项（仅体验，无供应商）

```http
POST /api/itinerary-items
Content-Type: application/json

{
  "tripDayId": "…",
  "type": "ACTIVITY",
  "placeId": 381041,
  "startTime": "2026-07-18T10:00:00.000Z",
  "endTime": "2026-07-18T11:15:00.000Z",
  "experienceDefinitionId": "<experience.id>",
  "travelFromPreviousDuration": 45,
  "note": "{\"planningIntent\":\"experience_only\"}"
}
```

`productOfferingId` / `productSessionId` **可省略**。时间轴按体验名展示即可。

#### （可选）升格到供应商产品

```http
GET /api/travel-products/offerings?experienceDefinitionId=<id>&placeId=381041
GET /api/travel-products/offerings/{offeringId}/sessions?date=2026-07-18

PATCH /api/itinerary-items/{itemId}
{
  "productOfferingId": "…",
  "productSessionId": "…",
  "note": "{\"arriveLocal\":\"09:30\",\"hasFallbackPlan\":true}"
}
```

无 PUBLISHED 结果时 UI 显示「暂无可订班次，已按体验加入行程」。

---

### 1.0b 产品约束

| 链路 | 作用 | 说明 |
|------|------|------|
| **A. Feasibility 热路径** | 挂了 Offering/Session 才评估班次/缓冲等 | **仅有体验时**多数产品 issue 不出 |
| **B. 约束控制台** | 启停 `product_*` / `meeting_point_buffer` | POST `/trips/:id/constraints` |

模板：`product_session_time_window`、`meeting_point_buffer`、`product_participant_eligibility`、`product_weather_dependency`。

**已知缺口**：热路径尚未读控制台 `value.minBufferMinutes`。

---

### 1.1 行程项绑定字段

**Base**: `/api/itinerary-items`

| 字段 | 规划必填建议 | 说明 |
|------|--------------|------|
| `experienceDefinitionId` | ✅ 体验 Tab | 体验项目 |
| `placeId` | ✅ | 地点 |
| `productOfferingId` | 可选 | 供应商 SKU |
| `productSessionId` | 可选 | 班次 |
| `travelFromPreviousDuration` | 建议 | 到集合/地点交通分钟 |
| `note` | 可选 | `arriveLocal` / `hasFallbackPlan` |

---

### 1.2–1.4

可执行性 / 约束 / Place 护栏见既有路径；`PLACE_PRODUCT_CANONICAL_BLOCKED` 不变。

---

## 2. 管理后台

**前缀**: `/api/admin/travel-product-catalog`（当前 `@Public()`）

### 2.0 地点 ↔ 体验（后台维护重点）

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/places/:placeId/experiences` | 含停用 |
| `PUT` | `/places/:placeId/experiences` | **全量替换**挂靠 |

```json
{
  "links": [
    {
      "experienceDefinitionId": "cuid…",
      "sortOrder": 10,
      "label": "水陆两栖船",
      "isFeatured": true,
      "isActive": true
    }
  ]
}
```

### 2.1–2.6

Taxonomy / Experience CRUD / Operator / Offering / publish·suspend / place-links（供应商空间）/ Session / Rate — 路径不变。

### 2.7 C 端只读

```
GET /api/travel-products/taxonomy
GET /api/travel-products/places/:placeId/experiences
GET /api/travel-products/experiences?countryCode=IS
GET /api/travel-products/experiences/:id
GET /api/travel-products/experiences/by-code/:code
GET /api/travel-products/offerings?experienceDefinitionId=&placeId=&countryCode=
GET /api/travel-products/offerings/:id
GET /api/travel-products/offerings/:id/sessions?date=
GET /api/travel-products/sessions/:id
```

```bash
curl -s http://localhost:3000/api/travel-products/places/381041/experiences | jq
npm run seed:iceland-travel-product-catalog
```

---

## 3. 推荐对接时序

### 3.1 Admin

```
1. POST /admin/travel-product-catalog/experiences
2. PUT  /admin/travel-product-catalog/places/:placeId/experiences
3.（可选）Operator → Offering → Sessions → publish
```

### 3.2 前端「添加活动」

```
Tab A 探索景点（现有）
Tab B 体验项目（新）
  GET /travel-products/places/{placeId}/experiences
  POST /itinerary-items { experienceDefinitionId, placeId, … }
  （可选）offerings?experienceDefinitionId= → sessions → PATCH 升格
```

### 3.3 种子

```bash
npx prisma migrate deploy
npm run seed:iceland-travel-product-catalog
npm run seed:iceland-travel-product-catalog:demo   # 可选供应商 demo
```

---

## 4. TypeScript 引用

| 用途 | 路径 |
|------|------|
| taxonomy | `types/product-taxonomy.types.ts` |
| 杰古沙龙体验 | `data/iceland-jokulsarlon-experiences.seed.ts` |
| 实体契约 | `types/catalog-entities.types.ts` |
| 行程绑定 | `types/itinerary-product-binding.types.ts` |

---

## 5. 前后端改造清单

### 后端（本次）

| 项 | 状态 |
|----|------|
| `PlaceExperienceLink` + migration | ✅ |
| Admin/C `places/:placeId/experiences` | ✅ |
| Offerings 过滤 `experienceDefinitionId` / `placeId` | ✅ |
| 杰古沙龙 8 条体验 + 挂靠种子 | ✅ |
| 只绑 `experienceDefinitionId` 创建行程 | ✅（DTO 原有） |

### 前端（待接）

| 项 | 说明 |
|----|------|
| 添加活动 **体验项目** Tab | `GET …/places/:placeId/experiences` |
| 创建只传体验 + place | 不强制 Offering |
| 时间轴 | 体验名优先；有 Offering 再叠班次 |
| 可选第二步 | `offerings?experienceDefinitionId=` |
| 管理后台 | Experience + 按 Place 编辑挂靠 |

### 缺口

| 项 | 状态 |
|----|------|
| console value → 可行性热路径 | ⚠ |
| itinerary include ProductSession | ⚠ |
| AdminStrictAuthGuard | ⚠ |
| 产品专用 repair-options | ❌ |
