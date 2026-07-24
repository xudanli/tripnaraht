# 私密想法 / 愿望单接口（iOS 对接）

> 目标 UI：规划工作台「私密想法」徽标、个人心愿列表、团队可见心愿、语音/灵感/卡片录入  
> 产品名：**私密想法**；后端模型：**Trip Wish（愿望单）**  
> 实现：`TripWishController`（`src/trips/wishlist/trip-wish.controller.ts`）  
> Base：`/api/trips/:tripId/wishes`  
> 鉴权：`Authorization: Bearer <token>`（生产必填；非生产无 token 时回落 `anonymous-dev-user`）  
> 更新：2026-07-16

**不要与下列能力混淆：**

| 能力 | 路径 | 说明 |
|------|------|------|
| **愿望单（本文）** | `/api/trips/:tripId/wishes/*` | 个人私密 / 团队可见心愿 CRUD |
| 协作聚合 BFF | `/api/trips/:tripId/collab-overview` | 含 `wishSummary` 摘要，不替代详细列表 |
| 规划工作台徽标 | `/api/planning-workbench/trips/:tripId/wish-summary` | 与 `GET .../wishes/summary` 同源 |
| 约束控制台 | `/api/trips/:tripId/constraints` | `c_wish_*` **只读合成**；改愿望请走本文 wishes API |
| 活动收藏 | `/api/trips/:tripId/activity-favorites` | 收藏夹，不是愿望单 |

---

## 1. iOS 推荐流程

```
① GET  .../wishes/summary              → 徽标 privateCount / teamCount
② GET  .../wishes/mine                 → 「我的想法」Tab（含 private）
③ GET  .../wishes/team                 → 「团队」Tab（anonymous | signed）
        ↓ 新建
④ GET  .../wishes/categories           → 领域下拉
⑤ POST .../wishes                      → 自由文本创建（默认 private）
   或 POST .../from-card/:cardId
   或 POST .../from-inspiration
   或 POST .../voice/transcribe → POST .../from-voice
        ↓ 改隐私 / 归档
⑥ PATCH .../wishes/:wishId             → visibility 开关
⑦ DELETE .../wishes/:wishId            → 归档（软删）
```

| 场景 | 调用 |
|------|------|
| 进入「私密想法」页 / 徽标 | `GET .../summary` |
| 我的列表 | `GET .../mine` |
| 团队列表 | `GET .../team` |
| 时间轴 Day 角标 | `GET .../day-impact` 或用 summary 内 `impactByDay` |
| 自由输入提交 | `POST .../wishes`，`visibility: "private"` |
| 改为团队可见 | `PATCH .../:wishId`，`visibility: "anonymous"` 或 `"signed"` |
| 语音（先看再提交） | `POST .../voice/transcribe` → 编辑 → `POST .../from-voice` |
| 按住说话直接提交 | `POST .../from-voice/audio` |
| 成员 Tab 首屏 | `GET /api/trips/:tripId/collab-overview?preset=shell`，全量再带 wishes |

---

## 2. 接口一览（P0 for iOS）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/trips/:tripId/wishes/summary` | 徽标摘要 + Day 影响 |
| GET | `/api/trips/:tripId/wishes/mine` | 当前用户愿望（含私密） |
| GET | `/api/trips/:tripId/wishes/team` | 团队可见愿望 |
| GET | `/api/trips/:tripId/wishes/day-impact` | 各天影响计数 |
| GET | `/api/trips/:tripId/wishes/categories` | 领域下拉选项 |
| POST | `/api/trips/:tripId/wishes` | 创建愿望 |
| PATCH | `/api/trips/:tripId/wishes/:wishId` | 更新（含隐私开关） |
| DELETE | `/api/trips/:tripId/wishes/:wishId` | 归档 |

### P1（录入增强，可按版本接）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `.../suggestions/cards` | AI 推荐愿望卡片 |
| POST | `.../from-card/:cardId` | 从卡片创建 |
| GET | `.../inspiration` | 冰岛灵感图库 |
| POST | `.../from-inspiration` | 从灵感收藏为愿望 |
| POST | `.../voice/transcribe` | STT + 草稿 |
| POST | `.../from-voice` | 确认转写后创建 |
| POST | `.../from-voice/audio` | 一键语音创建 |

### 调试（首版可不接）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `.../agent-snapshot` | Agent 上下文快照 |

---

## 3. 通用约定

### 3.1 请求头

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

语音上传接口使用 `multipart/form-data`，字段名 `audio`。

### 3.2 响应信封

统一为：

```typescript
{
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}
```

列表类 `mine` / `team` 的 `data` 为：

```typescript
{ items: T[]; count: number }
```

创建 / 更新成功：`data` 直接为单条 `TripWishItem`（HTTP 201 创建 / 200 更新）。  
归档成功：`data: { archived: true, wishId }`。

### 3.3 权限

- 须为行程成员（`assertTripMember`）。
- 只能改 / 归档**自己**的愿望。
- `team` 列表**不返回**他人 `private` 条目。

---

## 4. 枚举与核心模型

### 4.1 `visibility`（个人 ↔ 团队）

| 值 | 含义 | 出现在 |
|----|------|--------|
| `private` | 仅本人可见（默认） | 仅 `mine` |
| `anonymous` | 团队可见，不署名 | `mine` + `team` |
| `signed` | 团队可见，署名 `authorDisplayName` | `mine` + `team` |

### 4.2 `category`

| value | 中文 label（`locale=zh-CN`） |
|-------|------------------------------|
| `destination_route` | 目的地与路线 |
| `main_transport` | 大交通与接驳 |
| `accommodation` | 住宿方案 |
| `activities` | 活动与体验 |
| `dining` | 餐饮选择 |
| `local_transport` | 当地交通（租车） |
| `shopping` | 购物 |
| `insurance_visa` | 保险与签证 |

### 4.3 其他枚举

| 字段 | 取值 |
|------|------|
| `inputMode` | `card_select` \| `free_text` \| `voice` \| `inspiration` \| `ai_convert` |
| `status` | `active` \| `archived`（列表只返回 active；DELETE → archived） |
| `importance` | `1`–`5`，默认 `3` |

### 4.4 `TripWishItem`（mine / create / update 返回）

```typescript
interface TripWishItem {
  id: string;
  tripId: string;
  userId: string;
  category: WishCategory;
  text: string;                 // ≤ 2000
  importance: number;           // 1–5
  inputMode: WishInputMode;
  sourceRef: {
    cardId?: string;
    inspirationAssetId?: string;
    aiMessageId?: string;
    voiceTranscriptId?: string;
    assistantSessionId?: string;
  } | null;
  visibility: 'private' | 'anonymous' | 'signed';
  agentEligible: boolean;       // 默认 true；是否注入 Agent 规划上下文
  structuredHints: {
    must_do?: string[];
    must_avoid?: string[];
    soft_constraints?: Array<{
      type: string;
      category?: string;
      amount?: number;
      currency?: string;
      note?: string;
    }>;
    tags?: string[];
    pace?: string;
  } | null;
  status: 'active' | 'archived';
  createdAt: string;            // ISO-8601
  updatedAt: string;
}
```

### 4.5 `TeamWishViewItem`（team 返回，已脱敏）

```typescript
interface TeamWishViewItem {
  id: string;
  category: WishCategory;
  categoryLabel: string;        // 已本地化中文
  text: string;
  importance: number;
  visibility: 'anonymous' | 'signed';
  authorDisplayName?: string;   // 仅 signed
  createdAt: string;
}
```

---

## 5. 接口详情

### 5.1 `GET /api/trips/:tripId/wishes/summary`

**用途：**「私密想法」徽标数字。

**`data`：**

```typescript
{
  privateCount: number;       // 本人 private
  mineCount: number;          // 本人全部 active
  teamCount: number;          // 行程内 anonymous+signed
  agentEligibleCount: number; // 本人 agentEligible=true
  impactByDay: DayWishImpact[];
}

interface DayWishImpact {
  dayIndex: number;
  impactCount: number;
  wishIds: string[];
}
```

**示例：**

```json
{
  "success": true,
  "data": {
    "privateCount": 2,
    "mineCount": 4,
    "teamCount": 3,
    "agentEligibleCount": 4,
    "impactByDay": [
      { "dayIndex": 1, "impactCount": 2, "wishIds": ["wish_a", "wish_b"] }
    ]
  }
}
```

---

### 5.2 `GET /api/trips/:tripId/wishes/mine`

**`data`：** `{ items: TripWishItem[]; count: number }`

含本人 `private` / `anonymous` / `signed`，按 `createdAt` 降序。

---

### 5.3 `GET /api/trips/:tripId/wishes/team`

**`data`：** `{ items: TeamWishViewItem[]; count: number }`

不含任何用户的 `private`。`anonymous` 无 `authorDisplayName`。

---

### 5.4 `GET /api/trips/:tripId/wishes/day-impact`

**`data`：** `{ impactByDay: DayWishImpact[] }`

与 summary 中数组同源；可单独刷新时间轴角标。

---

### 5.5 `GET /api/trips/:tripId/wishes/categories`

| Query | 默认 | 说明 |
|-------|------|------|
| `locale` | `zh-CN` | `zh*` 返回中文 label |

**`data`：**

```json
{
  "categories": [
    { "value": "activities", "label": "活动与体验" }
  ]
}
```

---

### 5.6 `POST /api/trips/:tripId/wishes`

**Body：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `category` | ✅ | 见 §4.2 |
| `text` | ✅ | 非空，≤ 2000 |
| `inputMode` | ✅ | 自由输入用 `free_text` |
| `importance` | 否 | 1–5，默认 3 |
| `visibility` | 否 | 默认 `private` |
| `agentEligible` | 否 | 默认 `true` |
| `sourceRef` | 否 | 追溯来源 |
| `structuredHints` | 否 | 不传则服务端按 text/category 推断 |

**示例：**

```json
{
  "category": "activities",
  "text": "想看冰洞，不想太累",
  "inputMode": "free_text",
  "importance": 4,
  "visibility": "private"
}
```

**成功：** HTTP `201`，`data` = `TripWishItem`。

---

### 5.7 `PATCH /api/trips/:tripId/wishes/:wishId`

Body 均为可选：`category` / `text` / `importance` / `visibility` / `agentEligible` / `structuredHints`。

改 `text` 或 `category` 时服务端会**重新推断** `structuredHints`（若未显式传）。

**隐私开关示例：**

```json
{ "visibility": "anonymous" }
```

---

### 5.8 `DELETE /api/trips/:tripId/wishes/:wishId`

软归档，`status → archived`。列表不再出现。

**`data`：** `{ archived: true, wishId: string }`

---

### 5.9 推荐卡片（P1）

**`GET .../suggestions/cards?category=activities`**

**`data`：** `{ cards: WishSuggestionCard[] }`

```typescript
interface WishSuggestionCard {
  id: string;
  category: WishCategory;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  defaultImportance: number;
  defaultText: string;
  structuredHints?: WishStructuredHints;
}
```

**`POST .../from-card/:cardId`**

可选 Body：`{ text?, importance?, visibility? }` → `201` + `TripWishItem`（`inputMode: card_select`）。

---

### 5.10 灵感图库（P1）

**`GET .../inspiration?region=&tag=&offset=0&limit=20`**

`limit` 最大 50。

**`data`：** `{ items: InspirationAsset[]; total: number }`

```typescript
interface InspirationAsset {
  id: string;
  region: string;
  tags: string[];
  imageUrl: string;
  caption: string;
  relatedPoiIds?: string[];
  seasonHint?: string;
}
```

**`POST .../from-inspiration`**

```json
{
  "inspirationAssetId": "insp_xxx",
  "visibility": "private",
  "importance": 4,
  "textOverride": "可选覆盖文案"
}
```

---

### 5.11 语音（P1）

#### A. 两步确认（推荐）

1. **`POST .../voice/transcribe`** — `multipart/form-data`

| 字段 | 必填 | 说明 |
|------|------|------|
| `audio` | ✅ | 二进制，≤ 10MB |
| `language` | 否 | 如 `zh-CN` |
| `format` | 否 | 如 `audio/webm` / `audio/m4a` |

**`data`：**

```typescript
{
  voiceTranscriptId: string;
  transcript: string;
  language?: string;
  confidence?: number;
  suggestedDraft: {
    text: string;
    category: WishCategory;
    importance: number;
    structuredHints: WishStructuredHints;
  };
}
```

2. **`POST .../from-voice`**

```json
{
  "voiceTranscriptId": "vt_xxx",
  "text": "用户编辑后的文本",
  "category": "activities",
  "importance": 4,
  "visibility": "private"
}
```

#### B. 一键提交

**`POST .../from-voice/audio`** — `multipart`：`audio` + 可选 `language` / `format` / `category` / `importance` / `visibility`（表单字符串）。

**`data`：** `{ transcribe: WishVoiceTranscribeResult; wish: TripWishItem }`

---

## 6. iOS 模型建议（Swift）

```swift
enum WishVisibility: String, Codable {
  case `private`, anonymous, signed
}

enum WishCategory: String, Codable, CaseIterable {
  case destination_route, main_transport, accommodation
  case activities, dining, local_transport, shopping, insurance_visa
}

struct TripWishItem: Codable, Identifiable {
  let id: String
  let tripId: String
  let userId: String
  let category: WishCategory
  let text: String
  let importance: Int
  let inputMode: String
  let visibility: WishVisibility
  let agentEligible: Bool
  let status: String
  let createdAt: String
  let updatedAt: String
  // sourceRef / structuredHints 可按需 Codable
}

struct TeamWishViewItem: Codable, Identifiable {
  let id: String
  let category: WishCategory
  let categoryLabel: String
  let text: String
  let importance: Int
  let visibility: WishVisibility
  let authorDisplayName: String?
  let createdAt: String
}

struct WishSummary: Codable {
  let privateCount: Int
  let mineCount: Int
  let teamCount: Int
  let agentEligibleCount: Int
  let impactByDay: [DayWishImpact]
}

struct DayWishImpact: Codable {
  let dayIndex: Int
  let impactCount: Int
  let wishIds: [String]
}
```

解码时取 `response.data`；列表再取 `.items`。

---

## 7. 错误与边界

| 情况 | 表现 |
|------|------|
| 未登录（生产） | `401 Unauthorized` |
| 非行程成员 | 业务错误（access assert） |
| 改别人的 wish | `404`「不存在或无权修改」 |
| 卡片 / 灵感 ID 无效 | `404` |
| 语音未上传 / STT 失败 | `400` |
| VoiceService 未注入 | `400`「无法进行语音转写」 |
| 其余 Service 异常 | `{ success: false, error: { code: "INTERNAL_ERROR", message } }` |

**约束侧：** 若走 constraints 改 `c_wish_*`，会返回 `WISH_CONSTRAINT_USE_WISH_API` — 请改用本文接口。

---

## 8. 相关文档 / 代码

| 资源 | 路径 |
|------|------|
| Controller | `src/trips/wishlist/trip-wish.controller.ts` |
| DTO | `src/trips/wishlist/dto/trip-wish.dto.ts` |
| Types | `src/trips/wishlist/types/trip-wish.types.ts` |
| 协作摘要 | `src/trips/COLLAB_OVERVIEW_API.md` |
| 约束合成说明 | `src/trips/trip-constraint-solver/TRIP_CONSTRAINTS_API.md` |
| 工作台摘要 | `GET /api/planning-workbench/trips/:tripId/wish-summary` |
