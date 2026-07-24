# iOS 接入说明 — ETA-L2-EXECUTION-ACTUAL-01

**受众：** iOS 执行页  
**目标：** 用轻量确认完成「规划车程 vs 实际驾驶」对账  
**不是：** 导航、全程 GPS、偏航重算、实时 ETA

契约源码：

- `src/transport/contracts/travel-eta-user-evidence.contract.ts`
- `src/transport/contracts/travel-eta-field-events.contract.ts`
- `src/transport/contracts/travel-eta-actual.contract.ts`
- `src/transport/contracts/travel-eta-reconciliation.contract.ts`

---

## 0. 状态一览

| 能力 | 状态 | iOS 现在做什么 |
|------|------|----------------|
| 规划证据 `userEvidence` + `eta` | ✅ **已上线** | 执行页直接渲染 |
| 执行确认写接口（出发/到达/停车） | 📋 **契约已冻，写 API 待上线** | 可先按本文实现 UI + 本地状态；请求体按契约对齐 |
| Actual / Reconciliation 读回 | 📋 随写接口一起 | 到达后展示「实际 vs 规划」 |

写接口目标路径（Mobile BFF，与现有 `mobile/trips/:tripId` 一致）：

```text
POST /mobile/trips/:tripId/execution/travel-segments/:segmentId/depart
POST /mobile/trips/:tripId/execution/travel-segments/:segmentId/arrive
POST /mobile/trips/:tripId/execution/travel-segments/:segmentId/stops
GET  /mobile/trips/:tripId/execution/travel-segments/:segmentId/actual
```

> 上线前若路径微调，以 Swagger 为准；**请求体字段以本文契约为准，不要自行发明导航事件。**

---

## 1. 产品交互（执行页，非导航页）

`segmentId` = 本段目的地行程项 ID = travel-info 里的 **`toItemId`**。

### 1.1 未开始

展示规划证据（来自 `userEvidence`）：

```text
前往 {toPlace}
建议预留 {planningDurationLabel}
基础车程 {baseDurationLabel}
额外预留 {extraBufferLabel}   ← 可空
原因：{reasonBullets}

[开始这段车程]
```

若 `kind == ROUTE_BLOCKED`：展示阻断文案，**不要**显示「开始这段车程」作为可排程驾驶。

### 1.2 进行中

```text
这段车程已开始
开始时间 {localTime of departedAt}

[记录中途停车]   [我到了]
```

**不要做：** 实时地图诱导、转向、偏航、剩余 ETA 刷新、强制后台 GPS。

### 1.3 到达确认 Sheet

```text
这段途中是否有不计入驾驶时间的停留？
· 没有
· 有，我来填写（时长 + 原因）
· 不确定  → 样本 PARTIAL，仍可提交
```

可选勾选：

- 已到计划目的地？（默认是）
- 中途是否换了目的地 / 完全不同路线？（是 → INVALID）

### 1.4 到达后

```text
本段实际驾驶：{actualDrivingLabel}
规划建议：{planningDurationLabel}
差异：{deltaLabel}   // 例如「少 8 分钟」/「多 12 分钟」
```

用户侧 **不要** 展示 MAE、模型命中率、Provider 归因。

---

## 2. 已上线：读规划证据

### 2.1 按天（推荐执行日页）

```http
GET /itinerary-items/trip/{tripId}/days/{dayId}/travel-info?mode=cached
Authorization: Bearer {token}
```

| Query | 说明 |
|-------|------|
| `mode=cached` | 只读 DB / Trip.metadata 已写入的权威 ETA（Selected Trips 同步后用这个） |
| `mode=live` | 可能触发重算；执行页优先 `cached` |
| `includeTerrain` | **可省略**；服务端 AUTO，勿依赖客户端传 1 |

**响应信封：**

```json
{
  "success": true,
  "data": {
    "dayId": "...",
    "date": "2026-07-18",
    "itemCount": 5,
    "segments": [ /* 见下 */ ],
    "summary": {
      "totalDuration": 420,
      "totalDistance": 280000,
      "segmentCount": 4
    }
  }
}
```

### 2.2 整趟只读批量

```http
GET /itinerary-items/trip/{tripId}/travel-info
GET /itinerary-items/trip/{tripId}/travel-info?dates=2026-07-18,2026-07-19
```

不触发路由重算。

### 2.3 Segment 字段（iOS 模型）

```swift
struct TravelInfoSegment: Decodable {
  let fromItemId: String
  let toItemId: String      // == segmentId
  let fromPlace: String
  let toPlace: String
  let duration: Double?     // 排程用分钟 = eta.schedulableDurationMin
  let distance: Double?     // 米
  let travelMode: String?
  let eta: TravelEtaEnvelope?
  let userEvidence: TravelEtaUserEvidence?
}

struct TravelEtaUserEvidence: Decodable {
  let schema: String        // "tripnara/travel-eta-user-evidence/v1"
  let kind: String          // "SCHEDULABLE_ETA" | "ROUTE_BLOCKED"
  let baseDurationLabel: String
  let planningDurationLabel: String?
  let extraBufferLabel: String?
  let reasonBullets: [String]
  let confidenceLabel: String   // 高|中|低|未知
  let blockedTitle: String?
  let blockedDetail: String?
  let suggestedAction: String?
}
```

**UI 规则：**

| `kind` | 行为 |
|--------|------|
| `SCHEDULABLE_ETA` | 直接显示 labels + bullets；主 CTA = 开始这段车程 |
| `ROUTE_BLOCKED` | 显示 `blockedTitle` / `blockedDetail` / `suggestedAction`；**禁止**写成「车程较长」 |

**禁止话术：**「根据真实数据校准」「比地图准 X%」「AI 精准预测」——目前无冰岛 VALID Actual。

### 2.4 出发时冻结 Snapshot（从 `eta` 映射）

点击「开始这段车程」时，iOS **必须**把当前段的 `eta` 打成不可变 snapshot（服务端也会再存一份；客户端先冻，防本地改行程后覆盖）：

```swift
struct TravelEtaSnapshot: Codable {
  let baseDurationMin: Int
  let planningDurationMin: Int
  let uncertaintyMin: Int?
  let confidence: Double
  let provider: String
  let adjustments: [Adjustment]
  let geometryRef: String?
  let calculatedAt: String   // ISO8601；无则用 Date().ISO8601

  struct Adjustment: Codable {
    let type: String
    let durationDeltaMin: Int
  }
}

func makeSnapshot(from eta: TravelEtaEnvelope) -> TravelEtaSnapshot {
  TravelEtaSnapshot(
    baseDurationMin: Int(eta.baseDurationMin.rounded()),
    planningDurationMin: Int(eta.planningDurationMin.rounded()),
    uncertaintyMin: eta.uncertaintyMin.map { Int($0.rounded()) },
    confidence: eta.confidence,
    provider: eta.provenance.provider,           // 或顶层 provider 字段
    adjustments: (eta.adjustments ?? []).map {
      .init(type: $0.type ?? $0.reason, durationDeltaMin: Int($0.deltaMin.rounded()))
    },
    geometryRef: eta.geometry?.ref ?? eta.geometry?.id,
    calculatedAt: ISO8601DateFormatter().string(from: Date())
  )
}
```

`eta` 关键字段（只读，不必全展示）：

| 字段 | 含义 |
|------|------|
| `baseDurationMin` | 基础车程 |
| `planningDurationMin` | 建议预留（L2） |
| `schedulableDurationMin` | 当前权威排程用（Shadow=base；Authoritative=planning） |
| `uncertaintyMin` | 不确定性带宽 |
| `adjustments[]` | L2 调整项 |
| `schedulability` / `gateReasons` | 阻断时用；已被 `userEvidence` 投影 |

---

## 3. 待上线：执行确认写接口（契约）

统一信封（Mobile）：

```json
{
  "success": true,
  "data": { },
  "tripId": "...",
  "planVersion": 12,
  "requestId": "...",
  "serverTime": "2026-07-18T01:00:00.000Z"
}
```

`planVersionId`：优先用响应信封 `planVersion` 转字符串；若无，用行程 `updatedAt` 或客户端已知 plan 版本。**出发与到达必须同一 `planVersionId`。**

幂等：客户端生成 `eventId`（UUID）；重复提交同 `eventId` 视为成功。

### 3.1 开始车程

```http
POST /mobile/trips/{tripId}/execution/travel-segments/{segmentId}/depart
Content-Type: application/json
```

```json
{
  "schema": "tripnara/travel-eta-execution-event/v1",
  "eventType": "SEGMENT_DEPARTED",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "planVersionId": "12",
  "occurredAt": "2026-07-18T09:20:00.000Z",
  "confirmationSource": "USER_TAP",
  "travelEtaSnapshot": {
    "baseDurationMin": 166,
    "planningDurationMin": 216,
    "uncertaintyMin": 30,
    "confidence": 0.72,
    "provider": "HEURISTIC",
    "adjustments": [
      { "type": "F_ROAD", "durationDeltaMin": 50 }
    ],
    "geometryRef": "geom_abc",
    "calculatedAt": "2026-07-18T08:00:00.000Z"
  }
}
```

**成功 `data`（建议）：**

```json
{
  "segmentId": "...",
  "state": "IN_PROGRESS",
  "departedAt": "2026-07-18T09:20:00.000Z",
  "travelEtaSnapshot": { }
}
```

### 3.2 记录非驾驶停留（可选，可多次）

```http
POST /mobile/trips/{tripId}/execution/travel-segments/{segmentId}/stops
```

```json
{
  "schema": "tripnara/travel-eta-execution-event/v1",
  "eventType": "NON_DRIVING_STOP_RECORDED",
  "eventId": "...",
  "durationMin": 25,
  "reason": "SIGHTSEEING",
  "source": "USER_RECORDED",
  "startedAt": "2026-07-18T10:00:00.000Z",
  "endedAt": "2026-07-18T10:25:00.000Z"
}
```

| `reason` | 用途 |
|----------|------|
| `MEAL` / `SIGHTSEEING` / `SHOPPING` / `FUEL` / `REST` / `OTHER` | 用户选择 |

| `source` | 何时 |
|----------|------|
| `USER_RECORDED` | 行中点「记录中途停车」 |
| `POST_ARRIVAL_CONFIRMATION` | 到达后补填 |
| `OPTIONAL_GPS_SUGGESTION` | 仅当可选 GPS 提示且用户确认 |

### 3.3 确认到达（可同时声明停留）

```http
POST /mobile/trips/{tripId}/execution/travel-segments/{segmentId}/arrive
```

```json
{
  "schema": "tripnara/travel-eta-execution-event/v1",
  "eventType": "SEGMENT_ARRIVED",
  "eventId": "...",
  "planVersionId": "12",
  "occurredAt": "2026-07-18T12:48:00.000Z",
  "confirmationSource": "USER_TAP",
  "arrivalAssessment": {
    "reachedPlannedDestination": true,
    "routeMateriallyChanged": false
  },
  "stopDeclaration": {
    "kind": "NONE"
  }
}
```

`stopDeclaration.kind`：

| kind | 含义 | 质量影响 |
|------|------|----------|
| `NONE` | 没有非驾驶停留 | 可 VALID |
| `RECORDED` | 附带 `stops: [{ durationMin, reason }]` | 可 VALID |
| `UNCERTAIN` | 不确定有没有 / 多久 | → **PARTIAL** |

`RECORDED` 示例：

```json
"stopDeclaration": {
  "kind": "RECORDED",
  "stops": [
    { "durationMin": 25, "reason": "SIGHTSEEING" }
  ]
}
```

**成功 `data`：**

```json
{
  "segmentId": "...",
  "state": "COMPLETED",
  "actual": {
    "departedAt": "2026-07-18T09:20:00.000Z",
    "arrivedAt": "2026-07-18T12:48:00.000Z",
    "elapsedDurationMin": 208,
    "excludedStopDurationMin": 25,
    "actualDrivingDurationMin": 183,
    "sampleQuality": "VALID",
    "qualityReasons": [],
    "travelEtaSnapshot": { },
    "userSummary": {
      "actualDrivingLabel": "3小时03分",
      "planningDurationLabel": "3小时36分",
      "deltaLabel": "少33分钟",
      "deltaMin": -33
    }
  }
}
```

公式（服务端算；iOS 可本地预览）：

```text
elapsed = arrivedAt − departedAt
excluded = Σ stop.durationMin
actualDriving = elapsed − excluded
```

### 3.4 读回 Actual

```http
GET /mobile/trips/{tripId}/execution/travel-segments/{segmentId}/actual
```

返回与 arrive 成功体中的 `actual` 同形；未完成则 `state: IDLE | IN_PROGRESS` 且 `actual: null`。

---

## 4. 样本质量（iOS 只需理解，不自己算进 MAE）

| quality | 用户侧 | 进正式 MAE |
|---------|--------|------------|
| `VALID` | 正常展示结果 | 是 |
| `PARTIAL` | 仍可展示结果，可弱提示「记录不完整」 | 否 |
| `INVALID` | 可不展示对比，或提示「本段未计入验证」 | 否 |

常见 INVALID：没到原目的地、明显改线、缺 snapshot、时间戳乱、用户点「记录不准」。

**VALID 不要求 GPS。**

---

## 5. 可选 GPS（P1，非阻塞）

仅增强，例如出发/到达是否靠近起终点、提示疑似停留。最终仍以用户确认为准。

```json
"optionalLocationEvidence": {
  "departureNearOrigin": true,
  "arrivalNearDestination": true,
  "suspectedStopDurationMin": 20,
  "confidence": 0.6
}
```

无 GPS 权限时整段省略即可。

---

## 6. iOS 状态机建议

```text
idle
  --[开始这段车程]--> inProgress  (本地冻 snapshot + POST depart)
  --[记录中途停车]--> inProgress  (POST stops，可多次)
  --[我到了]--> confirmingStops
  --[提交 arrive]--> completed | failed
```

本地最少持久化：

```swift
struct LocalSegmentExecution: Codable {
  var segmentId: String
  var planVersionId: String
  var state: String
  var departedAt: Date?
  var snapshot: TravelEtaSnapshot?
  var pendingStops: [StopDraft]
  var lastEventIds: [String]   // 幂等
}
```

杀进程后：若有 `departedAt` 且未 arrive → 恢复为「进行中」，不要求恢复导航会话。

---

## 7. 验收清单（国内确认环）

| Case | 操作 | 期望 |
|------|------|------|
| A | 开始→到了，无停车 | Actual = 墙钟时长 |
| B | 行中记停车 25 分 | actualDriving = elapsed − 25 |
| C | 到达后补填停车 | 同上 |
| D | 声明未到计划目的地 | INVALID |
| E | 停留选「不确定」 | PARTIAL |
| F | 关闭定位权限 | 仍可完整闭环 |

---

## 8. 与现有 Mobile 执行 API 的关系

| 已有 | 关系 |
|------|------|
| `GET /mobile/trips/:tripId/execution-overview` | 今日执行总览；车程段 CTA 可挂在对应 activity/item |
| `GET .../activities/:activityId/execution-detail` | 活动详情；交通段以 `toItemId` 对齐 |
| travel-status / adjustment-queue | **无关**；不要用调整队列代替 Actual |

本工作项只新增「交通段执行确认」三写一读；不扩展导航能力。

---

## 9. 联系契约版本

| Schema | 值 |
|--------|-----|
| 用户证据 | `tripnara/travel-eta-user-evidence/v1` |
| 执行事件 | `tripnara/travel-eta-execution-event/v1` |
| Actual | `tripnara/travel-eta-actual/v1` |
| ETA 信封 | `tripnara/travel-eta/v1`（见 `eta` 字段） |
