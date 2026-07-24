# M12 离线策略 + 冰岛内测指标 — 前端接口文档

> **Global prefix**：`/api`  
> **响应格式**：`{ success, data?, error? }`  
> **鉴权**：开发环境 `anonymous-dev-user`；生产需 Bearer + 行程成员  
> **开关**：`IN_TRIP_EXECUTION_ENABLED=true`

---

## 一、接口一览

| 场景 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 晨间离线包（单行程） | `GET` | `/trips/:tripId/in-trip/offline/morning-pack` | TRAVELING 时拉取精简行中快照 |
| 离线写同步 | `POST` | `/trips/:tripId/in-trip/offline/sync` | 联网后按 `clientSeq` 回放队列 |
| 客户端策略 | `GET` | `/trips/:tripId/in-trip/runtime-policy` | 省电 / 流量 / 同步间隔 |
| 扩展离线包 | `GET` | `/trips/:tripId/offline-pack` | 原有包 + `inTripMorning` 字段 |
| 内测验收仪表盘 | `GET` | `/trips/in-trip/beta/metrics` | 50 团 cohort 聚合指标 |

---

## 二、晨间离线包

### `GET /trips/:tripId/in-trip/offline/morning-pack`

**何时调用**：每日清晨 Wi-Fi 下；或 App 从后台恢复且距上次同步 > `syncIntervalMinutes`。

**响应 `data`**：

```json
{
  "schemaVersion": 1,
  "syncedAt": "2026-06-18T06:00:00.000Z",
  "anchorSummary": { "tripId": "...", "budget": { "total": 12000, "currency": "CNY" } },
  "todayTimeline": {
    "dayNumber": 3,
    "date": "2026-06-20",
    "items": [{ "id": "...", "title": "冰川徒步", "refundable": false }]
  },
  "vulnerability": { "severity": "yellow", "stabilityScore": 0.72 },
  "budgetSnapshot": { "overallUsagePercent": 58, "currency": "CNY", "dailyBudget": 800 },
  "walletBalances": { "currency": "CNY", "edges": [] },
  "pendingOperations": [],
  "poiAccessAlerts": [
    {
      "itemId": "item-bl",
      "poiId": "is.blue_lagoon",
      "poiName": "Blue Lagoon",
      "arrivalTime": "14:00",
      "verdict": "BLOCKED",
      "reason": "Blue Lagoon：入场需要预约",
      "planB": [
        { "action": "BOOK_NOW", "detail": "前往官方预订" },
        { "action": "USE_ALTERNATIVE", "detail": "改选 Sky Lagoon", "alternativePoiId": "is.sky_lagoon" }
      ]
    }
  ]
}
```

`poiAccessAlerts` **可选字段**：仅当当日存在非 `FEASIBLE` 的冰岛 POI 时出现；全可行时不返回该 key。详见 `src/poi-access-capacity/FRONTEND_API.md` §六。

`anchorSummary` 为脱敏摘要；完整锚点仍走 `GET .../anchor-snapshot`。

---

## 三、离线写同步

### 客户端流程

1. 离线时将操作写入本地 IndexedDB，附带单调递增 `clientSeq`
2. 联网后批量 `POST .../offline/sync`
3. 服务端按 `clientSeq` 升序应用；已同步序号跳过

### `POST /trips/:tripId/in-trip/offline/sync`

**请求体**：

```json
{
  "operations": [
    {
      "clientSeq": 1,
      "operationType": "record_transaction",
      "recordedAt": "2026-06-18T12:30:00.000Z",
      "payload": {
        "captureMethod": "manual",
        "amountLocal": 3200,
        "currencyLocal": "ISK",
        "category": "food",
        "splitAmongUserIds": ["u1", "u2"],
        "paidByUserId": "u1"
      }
    },
    {
      "clientSeq": 2,
      "operationType": "mood_check",
      "recordedAt": "2026-06-18T20:00:00.000Z",
      "payload": { "score": 4 }
    },
    {
      "clientSeq": 3,
      "operationType": "poi_execution_feedback",
      "recordedAt": "2026-07-15T14:20:00.000Z",
      "payload": {
        "poiId": "is.gullfoss",
        "dateISO": "2026-07-15",
        "parkingWaitMin": 15,
        "crowdLevelSubjective": "MEDIUM"
      }
    }
  ]
}
```

**支持的 `operationType`**：

| 类型 | 等价在线接口 |
|------|-------------|
| `record_transaction` | `POST .../money/transactions` |
| `mood_check` | `POST .../pulse/mood-check` |
| `motion_signal` | `POST .../pulse/signals/motion` |
| `micro_feedback` | `POST .../pulse/micro-feedback` |
| `experience_pulse` | `POST .../experience/pulses` |
| `poi_execution_feedback` | `POST /api/poi-access-capacity/feedback`（payload 同 §POI 反馈） |

**响应 `data`**：

```json
{
  "applied": 2,
  "skipped": 0,
  "conflicts": [],
  "syncedAt": "2026-06-18T22:01:00.000Z"
}
```

冲突项 `conflicts[].reason` 含失败原因，对应队列记录标记 `manual_review`。

---

## 四、运行时策略

### `GET /trips/:tripId/in-trip/runtime-policy`

无需行程阶段校验；App 启动时拉取一次，缓存至下次冷启动。

```json
{
  "syncIntervalMinutes": 5,
  "environmentScanMinutes": 30,
  "experienceWeightCronHourUtc": 22,
  "lowPowerMode": {
    "disableMotionPolling": false,
    "reduceEnvironmentScan": false,
    "batchOfflineSync": true
  },
  "networkPolicy": {
    "wifiOnlyPackDownload": true,
    "maxPackSizeMb": 8,
    "compressResponses": true
  }
}
```

**环境变量覆盖**（运维）：

| 变量 | 默认 | 说明 |
|------|------|------|
| `IN_TRIP_LOW_POWER_MODE` | `false` | 开启后同步 15min、环境扫描 60min |
| `IN_TRIP_SYNC_INTERVAL_MINUTES` | `5` | 客户端建议轮询间隔 |
| `IN_TRIP_WIFI_ONLY_PACK` | `true` | 仅 Wi-Fi 下载离线包 |
| `IN_TRIP_MAX_PACK_MB` | `8` | 包大小软上限 |

---

## 五、扩展离线包

### `GET /trips/:tripId/offline-pack`

当 `trip.status === TRAVELING` 且模块启用时，原有 `data` 增加：

```json
{
  "trip": { },
  "days": [ ],
  "exportedAt": "...",
  "inTripMorning": { }
}
```

`inTripMorning` 结构与 §二 晨间包相同（不含用户维度的 `pendingOperations` 过滤）。

---

## 六、冰岛内测验收仪表盘

### `GET /trips/in-trip/beta/metrics?destination=Iceland`

面向运营 / QA；可选 `destination` 过滤 cohort。

```json
{
  "cohortLabel": "Iceland",
  "generatedAt": "2026-06-18T22:00:00.000Z",
  "activeTrips": 12,
  "completedTrips": 38,
  "anchorMaterializationRate": 0.92,
  "environment": {
    "openRedEvents": 2,
    "adoptionRate": 0.67,
    "avgDetectionDelayMinutes": 18.5
  },
  "money": {
    "transactionsToday": 45,
    "avgTransactionsPerTrip": 6.2,
    "nudgeTriggerRate": 0.31
  },
  "groupPulse": {
    "moodChecksToday": 28,
    "moodParticipationRate": 0.7,
    "pendingInterventions": 3
  },
  "experience": {
    "pulsesSubmittedToday": 15,
    "pulseCompletionRate": 0.45
  },
  "offline": {
    "pendingQueueEntries": 4,
    "syncedToday": 120,
    "conflictCount": 1
  }
}
```

**PRD 验收对照**：

| 指标 | 字段 |
|------|------|
| 环境检测延迟 ≤30min | `environment.avgDetectionDelayMinutes` |
| 红事件方案采纳率 ≥60% | `environment.adoptionRate` |
| 锚点移交完成率 | `anchorMaterializationRate` |
| 离线冲突率 | `offline.conflictCount / offline.syncedToday` |

---

## 七、推荐集成顺序

```
App 启动
  → GET runtime-policy
  →（Wi-Fi）GET offline-pack 或 morning-pack
行中离线操作 → 本地队列
恢复网络 → POST offline/sync → 刷新 GET today
运营面板 → GET beta/metrics（每 5min 轮询）
```
