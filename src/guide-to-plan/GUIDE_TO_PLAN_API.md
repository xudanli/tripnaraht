# Guide-to-Plan 前端对接 API 文档

**Base URL：** `/api/guide-to-plan`  
**鉴权：** 所有接口需 `Authorization: Bearer <JWT>`（SSE 见 §3.3）  
**统一响应：**

```json
{ "success": true, "data": { /* 业务数据 */ } }
```

错误时 HTTP 4xx/5xx：

```json
{ "statusCode": 400, "message": "错误描述", "error": "Bad Request" }
```

---

## 目录

1. [页面流程](#页面流程)
2. [会话管理](#1-会话管理)
3. [攻略导入](#2-攻略导入)
4. [解析](#3-解析)
5. [理解摘要](#4-理解摘要)
6. [出行条件](#5-出行条件)
7. [草案生成与对比](#6-草案生成与对比)
8. [接受与落地](#7-接受与落地)
9. [共享类型](#8-共享类型)
10. [枚举速查](#9-枚举速查)

---

## 页面流程

```
创建会话 → 导入攻略(可多次) → 异步解析 → 理解摘要 → 确认出行条件 → 生成草案 → 接受落地
```

| 页面 | 主要接口 |
|------|----------|
| 入口 / 恢复 | `POST /sessions`、`GET /sessions` |
| 导入页 | `POST /import`、`/import/file`、`/import/screenshot`、`GET /import/preview` |
| 解析进度 | `POST /parse/async` → `GET /parse/stream` 或 `/parse/status` |
| 理解摘要 | `GET /understanding`、`POST /places/rematch`、`PATCH /places/:candidateId` |
| 出行条件 | `PATCH /travel-context` |
| 草案 / 对比 | `POST /generate`、`GET /plan-candidates`、`GET /plan-candidates/:id` |
| 逐项确认 | `GET .../review-items` → `POST .../confirm` |
| 接受 / 放弃 | `POST /accept`、`POST /abandon` |

---

## 1. 会话管理

### 1.1 创建会话

`POST /api/guide-to-plan/sessions`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `countryCode` | string | 否 | 国家代码，如 `IS` |
| `destination` | string | 否 | 目的地，如 `冰岛南岸` |

**Response `data`：** `GuideToPlanSessionView`

### 1.2 列出用户会话

`GET /api/guide-to-plan/sessions`

**Query 参数**

| 参数 | 说明 |
|------|------|
| `status` | 按状态过滤 |
| `includeAbandoned` | `true` 时包含已放弃会话（默认 false） |
| `limit` | 1–50，默认 20 |
| `offset` | 分页偏移，默认 0 |

**Response `data`：** `GuideToPlanSessionView[]`

会话对象新增恢复字段：

```typescript
{
  // ...原有字段
  parseProgress?: { status, progress, error, currentStepLabel } | null;
  requiresTravelContext?: boolean;
  draftCandidateCount?: number;
  resumeRoute?: 'import' | 'parse_progress' | 'understanding'
              | 'travel_context' | 'draft' | 'trip';
}
```

> 前端恢复会话时优先读 `resumeRoute`，无需多次请求推断步骤。

### 1.3 获取会话详情

`GET /api/guide-to-plan/sessions/:sessionId`

**Response `data`：** `GuideToPlanSessionView`

### 1.4 放弃会话

`POST /api/guide-to-plan/sessions/:sessionId/abandon`

**Response `data`**

```json
{ "sessionId": "uuid", "status": "abandoned" }
```

> 已 `accepted` 的会话不可放弃（400）。

---

## 2. 攻略导入

### 2.1 导入页预览

`GET /api/guide-to-plan/sessions/:sessionId/import/preview`

**Response `data`**

```typescript
{
  guideCount: number;
  estimatedPlaces: number;
  estimatedRestaurants: number;
  estimatedHotels: number;
  estimatedRisks: number;
}
```

### 2.2 导入文字 / 链接 / 手动灵感

`POST /api/guide-to-plan/sessions/:sessionId/import`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sourceType` | enum | 是 | `link` \| `text` \| `manual` |
| `title` | string | 否 | 用户可编辑标题 |
| `content` | string | 否 | 粘贴正文（`text` 时必填） |
| `sourceUrl` | string | 否 | 来源链接（`link` 时填） |
| `manualInspirations` | string[] | 否 | 如 `["冰河湖","黑沙滩"]` |
| `parseImmediately` | boolean | 否 | 默认 **false**；`true` 时触发异步解析 |

> **链接导入：** 可只传 `sourceUrl`，解析阶段会自动抓取正文（Exa / HTTP）；失败提示改粘贴文字。  
> **正常流程：** 导入后不解析，用户点「开始解析」再调 `POST /parse/async`。

**Response `data`：** `ImportedGuideView`

### 2.3 上传文件

`POST /api/guide-to-plan/sessions/:sessionId/import/file`

**Content-Type：** `multipart/form-data`

| 字段 | 类型 | 必填 |
|------|------|------|
| `file` | binary | 是 |
| `title` | string | 否 |

**支持：** PDF、DOCX、XLSX/XLS、CSV、TXT/MD · **限制 20MB**

### 2.4 上传截图（OCR）

`POST /api/guide-to-plan/sessions/:sessionId/import/screenshot`

**Content-Type：** `multipart/form-data`

OCR 失败 → `400`

### 2.5 删除攻略

`DELETE /api/guide-to-plan/sessions/:sessionId/guides/:guideId`

**Response `data`：** `{ "deleted": true, "guideId": "uuid" }`

---

## 3. 解析

### 3.1 异步解析（推荐）

`POST /api/guide-to-plan/sessions/:sessionId/parse/async`

**Response `data`：** `{ "jobId": "<sessionId>" }`

> 已有任务进行中 → `409`。副作用：会话 `status` → `parsing`

### 3.2 轮询进度

`GET /api/guide-to-plan/sessions/:sessionId/parse/status`

**Response `data`：** `GuideParseProgressView`

```typescript
{
  jobId: string;
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  currentStep?: 'content_analysis' | 'place_extraction' | 'route_identification'
              | 'fact_verification' | 'draft_generation';
  currentStepLabel?: string;
  progress: number;                 // 0–1
  estimatedSecondsRemaining?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  counts: { places, restaurants, hotels, tips, risks: number };
  recognizedTags: string[];
}
```

| `currentStep` | 标签 | `progress` |
|---------------|------|------------|
| `content_analysis` | 内容解析 | 0.12 |
| `place_extraction` | 地点提取 | 0.38 |
| `route_identification` | 路线识别 | 0.62 |
| `fact_verification` | 事实校验 | 0.88 |
| `draft_generation` | 生成草案 | 1.0 |

### 3.3 SSE 推送

`GET /api/guide-to-plan/sessions/:sessionId/parse/stream`

**Response：** `Content-Type: text/event-stream`

| 事件 | 数据 | 说明 |
|------|------|------|
| `message` | `GuideParseProgressView` JSON | 进度更新 |
| `end` | `{}` | 终态后发送 |

原生 `EventSource` 不支持自定义 Header，请用 `fetch` + Bearer：

```typescript
const res = await fetch(
  `/api/guide-to-plan/sessions/${sessionId}/parse/stream`,
  { headers: { Authorization: `Bearer ${token}` } },
);
// 解析 SSE：event: message / data: {...} / event: end
```

**推荐时序：** `POST /parse/async` → 连接 SSE

### 3.4 同步解析（调试）

`POST /api/guide-to-plan/sessions/:sessionId/parse`

阻塞直到完成，**Response `data`：** `GuideUnderstandingView`

---

## 4. 理解摘要

### 4.1 获取理解结果

`GET /api/guide-to-plan/sessions/:sessionId/understanding`

**Response `data`：** `GuideUnderstandingView`

```typescript
{
  sessionId: string;
  status: GuideToPlanSessionStatus;
  summary: {
    guideCount: number;
    placeCount: number;
    restaurantCount: number;
    hotelAreaCount: number;
    tipCount: number;
    riskCount: number;
    unmatchedPlaceCount: number;
    suggestedTripDays?: number;       // LLM 推断天数
    potentialIssues: string[];
  };
  themeNarrative?: string | null;
  places: Array<{
    id: string;
    candidateType: 'poi' | 'restaurant' | 'hotel' | 'activity' | 'route_theme';
    rawName: string;
    placeId?: number | null;
    matchStatus: 'unmatched' | 'matched' | 'ambiguous' | 'rejected';
    credibilityLevel: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';  // 徽章
    suggestedDay?: number | null;
    routeOrder?: number | null;
    sourceGuideIds: string[];
  }>;
  claims: Array<{
    id: string;
    claimType: string;
    statement: string;
    confidenceLevel: 'L1' | 'L2' | ...;
    verificationStatus: string;
  }>;
  importedGuides: ImportedGuideView[];
  requiresTravelContext: boolean;     // 是否有必填 pendingConfirmations
  pendingConfirmations: GuidePendingConfirmation[];
}
```

**可信度徽章**

| 等级 | 含义 |
|------|------|
| L1 | 单篇攻略、未交叉验证 |
| L2 | ≥2 篇攻略提及同一地点/观点 |
| L3 | 已匹配 POI 数据库 |

### 4.2 批量重新匹配 POI

`POST /api/guide-to-plan/sessions/:sessionId/places/rematch`

对 `matchStatus=unmatched` 的 POI 候选按名称重新匹配（需有国家代码）。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `countryCode` | string | 否 | 如 `IS`；不传则用会话 `countryCode` 或 `travelContext.countryCode` |

**Response `data`**

```typescript
{
  sessionId: string;
  countryCode: string;
  attempted: number;      // 本次尝试匹配的 unmatched 数量
  matched: number;        // 新匹配成功数
  stillUnmatched: number;
  summary: {
    unmatchedPlaceCount: number;
    potentialIssues: string[];
  };
}
```

> 填写出行条件后若未自动匹配，可主动调用此接口；也可在 `PATCH /travel-context` 首次设置 `countryCode` 时自动触发。

### 4.3 手动绑定 / 拒绝 POI

`PATCH /api/guide-to-plan/sessions/:sessionId/places/:candidateId`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `placeId` | number | 二选一 | TripNARA Place ID |
| `matchStatus` | `'rejected'` | 二选一 | 用户确认无需匹配 POI |

**POI 搜索（绑定前）：** 使用现有接口 `GET /api/places/autocomplete?q=蓝湖&countryCode=IS`

**Response `data`**

```typescript
{
  sessionId: string;
  place: GuideInspirationCandidateView;  // 含 geo、credibilityLevel
  bind: {
    candidateId: string;
    placeId: number | null;
    matchStatus: 'matched' | 'rejected';
    credibilityLevel: 'L1' | 'L2' | 'L3';
    matchedName?: string;
    matchedNameEn?: string | null;
  };
  summary: {
    unmatchedPlaceCount: number;
    potentialIssues: string[];
  };
}
```

---

## 5. 出行条件

### 5.1 确认出行条件

`PATCH /api/guide-to-plan/sessions/:sessionId/travel-context`

| 字段 | 类型 | 说明 |
|------|------|------|
| `startDate` | string | `YYYY-MM-DD` |
| `endDate` | string | `YYYY-MM-DD` |
| `travelers` | object | `{ adults?, children?, seniors? }` |
| `transportMode` | enum | `self_drive` \| `bus` \| `tour` \| `mixed` \| `unknown` |
| `preserveExperiences` | string[] | 最想保留的体验 |
| `countryCode` | string | 如 `IS` |
| `destination` | string | 目的地描述 |

> **PATCH 为合并更新**：只传需要修改的字段，未传字段保留原值。`endDate` 不能早于 `startDate`。

**Response `data`**

```json
{
  "sessionId": "uuid",
  "travelContext": { /* ... */ },
  "countryCode": "IS",
  "destination": "冰岛南岸"
}
```

---

## 6. 草案生成与对比

### 6.1 生成草案

`POST /api/guide-to-plan/sessions/:sessionId/generate`

| 字段 | 类型 | 说明 |
|------|------|------|
| `variant` | enum | 单变体，默认 `balanced` |
| `variants` | enum[] | 一次生成多个变体 |

**变体：** `balanced` \| `faithful` \| `comfortable` \| `risk_min` \| `photography`

**前置：** 需已 `PATCH travel-context` 且 `pendingConfirmations` 中无必填项

**Response `data`：** `GuidePlanCandidateDetailView[]`

| 字段 | 说明 |
|------|------|
| `decisionEngineStatus` | `unavailable` \| `applied` \| `skipped` \| `finalized` |
| `finalized` | 是否经 `DecisionCore.finalize` 正式决策（`GUIDE_CANONICAL_PLAN_SELECTION=1`） |
| `canonicalRecommended` | 是否为 Canonical 推荐变体 |
| `canonicalDecisionId` | 关联 DecisionRecord ID |
| `canonicalOverallStatus` | 该变体约束评估总状态（如 `FEASIBLE` / `UNVERIFIED`） |

启用 `GUIDE_CANONICAL_PLAN_SELECTION=1`（默认跟随 `CANONICAL_FULL_PLAN_SELECTION`）时，多变体一次走 Gateway → `DecisionCore.finalize`，**不写 Effective Plan**。会话级摘要写入 `understandingSummary.canonicalDecision`（生成阶段）；接受后追加 `acceptedTripId`、`effectivePlanVersionId`、`itemCount`。

### 6.2 列出草案

`GET /api/guide-to-plan/sessions/:sessionId/plan-candidates`

**Response `data`：** `GuidePlanCandidateDetailView[]`

### 6.3 草案详情（BFF）

`GET /api/guide-to-plan/sessions/:sessionId/plan-candidates/:planCandidateId`

**Response `data`：** `GuidePlanCandidateDetailView`

```typescript
{
  id: string;
  variant: GuidePlanVariant;
  status: 'draft' | 'verified' | 'accepted' | 'rejected';
  comparisonDiff?: Array<{
    aspect: string;
    originalGuide: string;
    adjustedPlan: string;
    reason?: string;
  }>;
  itineraryDraft?: {
    days: Array<{
      day: number;
      date?: string;              // 有 travelContext.startDate 时为真实日期
      accommodation?: {
        candidateId?: string;
        placeId?: number | null;
        name: string;
        nameEn?: string | null;
        type: 'hotel' | 'area';
        source: 'guide' | 'adjusted' | 'inferred';
        checkInTime?: string;     // 默认当日 20:00 UTC
        areaHint?: string;        // 仅 type=area 或 inferred 时
        geo?: { lat?: number; lng?: number };
      };
      items: Array<{
        candidateId?: string;
        placeId?: number | null;
        name: string;
        type: string;             // 含 hotel（晚间入住节点，通常在 items 末尾）
        startTime: string;
        endTime: string;
        source: 'guide' | 'adjusted';
        travelMinutesFromPrev?: number;
        visitDurationMinutes?: number;
      }>;
      drivingMinutesEstimate?: number;
      activityCount: number;
      routeAvailability?: object;
    }>;
    totalDays: number;
    variant: string;
    sourceConfidence: number;
    warnings: string[];
  };
  decisionReasons?: object[];
  retainedItems?: object[];
  modifiedItems?: object[];
  rejectedItems?: object[];
  warnings?: string[];
  feasibilityScore: number;       // 0–100 准备度
  pendingConfirmations: GuidePendingConfirmation[];
  decisionEngineStatus?: 'unavailable' | 'applied' | 'skipped' | 'finalized';
  finalized?: boolean;
  canonicalRecommended?: boolean;
  canonicalDecisionId?: string;
  canonicalOverallStatus?: string;
  createdAt: string;
}
```

---

## 7. 接受与落地

### 7.1 接受草案

`POST /api/guide-to-plan/sessions/:sessionId/accept`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `planCandidateId` | uuid | 是 | 草案 ID |
| `acceptanceMode` | enum | 否 | 见下表，默认 `accept_all` |

**acceptanceMode**

| 模式 | 行为 |
|------|------|
| `accept_all` | 直接创建正式 `Trip`（`status: PLANNING`） |
| `keep_faithful` | 若非 `faithful` 变体，先按 FAITHFUL 策略重生成再落地 |
| `review_items` | **不创建 Trip**；返回逐项确认列表 |

#### `accept_all` / `keep_faithful` 响应

启用 `GUIDE_CANONICAL_ACCEPT_EXECUTE=1`（默认跟随 `GUIDE_CANONICAL_PLAN_SELECTION` + `CANONICAL_EXECUTION_ENABLED`）且草案已 `finalized` 时，接受流程为：

1. 创建 Trip 壳（无 Effective Plan）
2. 重新 `DecisionCore.finalize` 并持久化 DecisionRecord
3. `authorize`（用户所选变体）
4. `execute` 通过 `ADD_ITEM` PlanOperation 从 TripPlan 写入 ItineraryItem 并设置 Effective Plan

```json
{
  "sessionId": "uuid",
  "planCandidateId": "uuid",
  "acceptanceMode": "accept_all",
  "status": "accepted",
  "tripId": "uuid",
  "itemCount": 12,
  "canonicalExecuted": true,
  "decisionId": "dec_...",
  "effectivePlanVersionId": "plan_v...",
  "message": "已创建正式行程 ...（Canonical L2 execute）"
}
```

未启用 Canonical accept 时，仍直接 `GuideTripMaterializer` 创建 Trip + 活动项（legacy 路径）。

```json
{
  "sessionId": "uuid",
  "planCandidateId": "uuid",
  "acceptanceMode": "accept_all",
  "status": "accepted",
  "tripId": "uuid",
  "itemCount": 12,
  "message": "已创建正式行程 ..."
}
```

#### `review_items` 响应

```json
{
  "sessionId": "uuid",
  "planCandidateId": "uuid",
  "acceptanceMode": "review_items",
  "status": "draft_ready",
  "reviewRequired": true,
  "items": [ /* GuidePlanReviewItem[] */ ],
  "message": "请勾选要保留的活动后调用 POST .../confirm"
}
```

### 7.2 获取逐项确认列表

`GET /api/guide-to-plan/sessions/:sessionId/plan-candidates/:planCandidateId/review-items`

**Response `data`**

```typescript
{
  planCandidateId: string;
  items: Array<{
    reviewKey: string;           // 确认时回传，格式 "day:index:candidateId|name"
    day: number;
    date?: string;
    name: string;
    type: string;
    placeId?: number | null;
    candidateId?: string;
    source: 'guide' | 'adjusted';
    startTime: string;
    endTime: string;
    defaultSelected: boolean;    // guide 来源默认勾选
  }>;
}
```

### 7.3 逐项确认后落地

`POST /api/guide-to-plan/sessions/:sessionId/plan-candidates/:planCandidateId/confirm`

| 字段 | 类型 | 必填 |
|------|------|------|
| `planCandidateId` | uuid | 是（须与路径一致） |
| `acceptedItemKeys` | string[] | 是（至少 1 项） |

**Response `data`**

```json
{
  "sessionId": "uuid",
  "planCandidateId": "uuid",
  "acceptanceMode": "review_items",
  "status": "accepted",
  "tripId": "uuid",
  "itemCount": 8,
  "acceptedItemCount": 8,
  "message": "已创建正式行程 ..."
}
```

### 逐项确认完整流程

```
POST /accept  { acceptanceMode: "review_items" }
  → 展示 items（或 GET /review-items）
  → 用户勾选
POST /confirm  { acceptedItemKeys: ["1:0:uuid", "2:1:冰河湖"] }
  → 跳转 tripId
```

---

## 8. 共享类型

### GuideToPlanSessionView

```typescript
{
  id: string;
  status: 'collecting' | 'parsing' | 'awaiting_context' | 'generating'
        | 'draft_ready' | 'accepted' | 'abandoned';
  countryCode?: string | null;
  destination?: string | null;
  travelContext?: GuideTravelContext | null;
  understandingSummary?: GuideUnderstandingSummary | null;
  themeNarrative?: string | null;
  tripId?: string | null;
  importedGuides: ImportedGuideView[];
  createdAt: string;
  updatedAt: string;
}
```

### ImportedGuideView

```typescript
{
  id: string;
  title?: string | null;
  sourceType: 'link' | 'screenshot' | 'text' | 'file' | 'manual';
  sourceUrl?: string | null;
  sourcePlatform?: string | null;   // xiaohongshu / douyin / wechat / bilibili
  sourceMetadata?: object | null;
  parseStatus: 'pending' | 'parsing' | 'parsed' | 'failed';
  sourceConfidence: number;
  credibilityLevel: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  importedAt: string;
  parsedAt?: string | null;
  parseError?: string | null;
}
```

### GuidePendingConfirmation

```typescript
{
  field: string;        // startDate | endDate | travelers | transportMode | ...
  label: string;        // 中文标签
  reason: string;
  required: boolean;
}
```

---

## 9. 枚举速查

| 枚举 | 值 |
|------|-----|
| 会话状态 | `collecting` → `parsing` → `awaiting_context` → `generating` → `draft_ready` → `accepted` / `abandoned` |
| 攻略解析 | `pending` / `parsing` / `parsed` / `failed` |
| 可信度 | L1 单篇 / L2 多篇交叉 / L3 POI 已匹配 |
| 草案变体 | `balanced` / `faithful` / `comfortable` / `risk_min` / `photography` |
| POI 匹配 | `unmatched` / `matched` / `ambiguous` / `rejected` |
| 接受模式 | `accept_all` / `keep_faithful` / `review_items` |

---

## 注意事项

1. **草案 ≠ 正式行程**：`itineraryDraft` 是草稿；`POST /accept` 或 `/confirm` 后才创建 `Trip`。
2. **链接-only 导入**：解析时自动抓取；失败需引导用户粘贴正文。
3. **无三人格 UI 字段**：已移除 `personaThoughts` / `personaOpinions`；用 `comparisonDiff`、`warnings`、`feasibilityScore` 替代。
4. **SSE 鉴权**：需 Bearer token，不能用原生 EventSource。
5. **恢复会话**：`GET /sessions` 过滤 `status !== 'abandoned'` 的未完成会话。

---

## 接口清单（速查）

| 方法 | 路径 |
|------|------|
| POST | `/sessions` |
| GET | `/sessions` |
| GET | `/sessions/:sessionId` |
| POST | `/sessions/:sessionId/abandon` |
| GET | `/sessions/:sessionId/import/preview` |
| POST | `/sessions/:sessionId/import` |
| POST | `/sessions/:sessionId/import/file` |
| POST | `/sessions/:sessionId/import/screenshot` |
| DELETE | `/sessions/:sessionId/guides/:guideId` |
| POST | `/sessions/:sessionId/parse/async` |
| GET | `/sessions/:sessionId/parse/status` |
| GET | `/sessions/:sessionId/parse/stream` |
| POST | `/sessions/:sessionId/parse` |
| GET | `/sessions/:sessionId/understanding` |
| PATCH | `/sessions/:sessionId/travel-context` |
| POST | `/sessions/:sessionId/generate` |
| GET | `/sessions/:sessionId/plan-candidates` |
| GET | `/sessions/:sessionId/plan-candidates/:planCandidateId` |
| GET | `/sessions/:sessionId/plan-candidates/:planCandidateId/review-items` |
| POST | `/sessions/:sessionId/plan-candidates/:planCandidateId/confirm` |
| POST | `/sessions/:sessionId/accept` |
