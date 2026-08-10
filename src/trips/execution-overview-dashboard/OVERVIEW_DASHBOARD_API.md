# 执行总览 Dashboard · iOS 对接文档（P0）

> 产品：新执行总览 Tab 首屏投影  
> **样式不跟稿**：只锁 API 契约、枚举与同源关系。  
> **状态：** 后端 P0–P2 已落地；P1 Execution Projection（now / exception / planReality）已叠加。总览 Tab 以 `overview-dashboard` 为准，旧 `execution-overview` 仅兼容。  
> **最后更新：** 2026-08-10

**实现类型：** `src/mobile/dto/mobile-overview-dashboard.types.ts`  
**投影：** `src/mobile/utils/overview-dashboard.projection.util.ts`

---

## 0. 能力边界（先读）

| 能力 | 回答的问题 | 路径 / 文档 | 与本能力关系 |
|------|------------|-------------|--------------|
| **执行总览 Dashboard（本稿）** | 今天按计划吗？下一站来不来得及？要不要出发？车/队怎样？ | `execution/overview-dashboard` | **本能力 · 首屏唯一读依赖** |
| 今日自驾状态 | 门禁 + 五维详情 | [DAILY_DRIVE_STATUS_API.md](../daily-drive/DAILY_DRIVE_STATUS_API.md) | 点综合状态 / 自驾卡再拉 |
| **Self-Drive Kernel** | 统一 context / 路段 / advisories / 可执行性 | [SELF_DRIVE_API.md](../self-drive-kernel/SELF_DRIVE_API.md) | 新产品主读；与本页 `advisories` 同源 |
| 行中执行首页 | heading / 提醒 / Runbook | [IN_TRIP_HOME_API.md](../in-trip-home/IN_TRIP_HOME_API.md) | 有 `activeRunbookId` 再拉 |
| `execution-overview` | 旧总览（活动 / metrics / statusRows） | 已有 | **P2 已降级**：总览首屏用 [overview-dashboard](../execution-overview-dashboard/OVERVIEW_DASHBOARD_API.md)；本接口仅兼容 / workspace shell |
| `today-itinerary` | 今日行程全量 | 已有 | 首屏不要等；住宿已在 dashboard 投影 |

**原则：**

1. 首屏只打 **1 个**读接口（+ 本地骨架）
2. 返回 **展示就绪投影**（headline / labels），客户端不再算「按计划 vs 建议调整」
3. 重字段异步：地图坐标、酒店图、Nara insight、Runbook 详情、五维详情
4. WS 只推 `changedSections`，按 section 局部重拉
5. 写操作走现有能力，不新开总览专用写接口

---

## 1. 产品一句话

> **总览首屏 = 一个 overview-dashboard lite 投影；其余全部是下钻与写。**  
> 服务端给「结论 + 文案 + 少量机器字段」，客户端负责渲染与乐观交互。

---

## 2. 通用约定

### 2.1 路径

```
GET /api/mobile/trips/{tripId}/execution/overview-dashboard
  ?lite=1          // 默认 true：首屏
  &dayIndex=       // 可选
```

相对 `baseURL`（已含 `/api`）：

```
mobile/trips/{tripId}/execution/overview-dashboard
```

### 2.2 Query

| 参数 | 默认 | 说明 |
|------|------|------|
| `lite` | `true` | `0`/`false` 时带坐标、图片等；lite 省略大图/完整坐标 |
| `dayIndex` | 行程当地今日 | 1-based |

### 2.3 响应信封

与执行阶段一致：

```json
{
  "success": true,
  "data": { "schemaId": "tripnara.execution_overview_dashboard@v1", "...": "..." },
  "requestId": "uuid",
  "tripId": "trip-xxx",
  "contextVersion": 142,
  "serverTime": "2026-07-22T08:00:00Z"
}
```

### 2.4 请求头

| Header | 读 | 说明 |
|--------|----|------|
| `Authorization: Bearer <token>` | 必填 | |
| `X-Client-Version` | 建议 | |

---

## 3. lite 响应结构

```ts
{
  schemaId: 'tripnara.execution_overview_dashboard@v1'
  contextVersion: number
  serverTime: string
  lite: boolean
  trafficUpdatedAt?: string          // 页脚「路况更新于…」
  offlineMapHint?: { available: boolean }

  overallStatus: {
    code: 'ON_PLAN' | 'NEEDS_ATTENTION' | 'SUGGEST_ADJUST' | 'PAUSE_EXECUTION'
    headlineZh: string
    detailZh?: string
    primaryRiskId?: string
    pendingAdjustmentCount?: number
  }

  selfDrive: {
    lifecycle: 'NOT_DEPARTED' | 'PREPARING' | 'DRIVING' | 'TEMPORARY_STOP'
             | 'ARRIVED' | 'DAY_ENDED' | 'BLOCKED'
    driver?: { memberId: string, displayName: string }
    continuousDriveMinutes?: number   // P1 drive-session
    todayDrivenMinutes?: number
    todayRemainingDriveMinutes?: number
    planBadgeZh?: string
    nightEtaZh?: string
    driverContextLineZh?: string
    dailyDriveLineZh?: string
    planContextLineZh?: string
  }

  nextDestination: {
    activityId?: string
    titleZh: string
    placeTypeZh?: string
    timeWindowZh?: string            // 11:30–12:30
    distanceKm?: number
    driveMinutes?: number
    distanceDurationZh?: string
    etaZh?: string
    timeMarginMinutes?: number       // 有符号：+提前 / -迟到
    timeMarginZh?: string
    timeMarginSeverity?: 'OK' | 'TIGHT' | 'LATE'
    accessNoteZh?: string
    statusNoteZh?: string
    latitude?: number                // lite 省略
    longitude?: number
    imageUrl?: string                // lite 省略
    ctaPhase: 'NOT_DEPARTED' | 'DRIVING' | 'AT_DESTINATION' | 'ACTIVITY_ENDED'
  }

  departureSuggestion?: {
    kind: 'CAN_DEPART_NOW' | 'DEPART_WITHIN' | 'CAN_LINGER'
        | 'DELAY_DEPART' | 'DO_NOT_DEPART' | 'CHANGE_ROUTE'
    titleZh: string
    detailZh?: string
    departBeforeLocalTime?: string   // "10:35"
  }

  vehicle: {
    isNormal: boolean
    summaryLineZh: string
    fuelPercent?: number
    rangeKm?: number
    nextFuelKm?: number
    nextFuelLabelZh?: string
    vehicleTypeZh?: string
    roadFitZh?: string
    alertTitleZh?: string
    alertDetailZh?: string
    continuousDriveWarningZh?: string
    rentalEmergencyPhone?: string    // P1 / full
  }

  teamReadiness: {
    kind: 'READY' | 'PARTIAL' | 'BLOCKED'
    summaryLineZh: string
    attentionLineZh?: string
    readyCount: number
    totalCount: number
    // 不要 members[]
  }

  attention?: { riskCount: number, pendingDecisionCount: number }
  lodging?: { nameZh: string, detailZh: string, statusZh: string, imageUrl?: string }
  activeRunbookId?: string

  // ── Execution Projection（P1，Travel Mode 优先读）──
  now?: {
    kind: 'NOT_STARTED' | 'PREPARING' | 'DRIVING' | 'AT_STOP' | 'DAY_ENDED' | 'BLOCKED'
    activityId?: string
    titleZh: string
    detailZh?: string
    atDestination: boolean          // true=在店停留；false=在开/未出发
  }
  exception?: {                     // 仅 hasImpact 时出现；安静原则
    code: 'RISK' | 'BLOCKED' | 'NEEDS_ADJUSTMENT' | 'LATE'
    titleZh: string
    detailZh?: string
    primaryRiskId?: string
  }
  planReality?: {
    plannedArrivalLocalHHmm?: string
    actualOrEtaLocalHHmm?: string
    realitySource: 'ACTUAL' | 'ETA' | 'PLANNED_ONLY'
    deviationMinutes?: number       // 正=提前 / 负=迟到
    deviationZh?: string
    hasImpact: boolean              // 要不要打扰
    impactReasonZh?: string
    recommendedAdjustment?: {
      kind: 'DELAY_DEPART' | 'CHANGE_STOP' | 'SHORTEN_STAY'
          | 'OPEN_ADJUSTMENT_QUEUE' | 'FOLLOW_RUNBOOK'
      titleZh: string
      detailZh?: string
    }
  }

  // ── Self-Drive Kernel 影子（K4；旧客户端可忽略）──
  // 国家知识统一成 DriveAdvisory；不抬升 overallStatus（安静原则仍由 Impact 门禁）
  advisories?: Array<{
    type: 'WEATHER' | 'ROAD_ACCESS' | 'VEHICLE_FIT' | 'ALTITUDE' | 'RESTRICTION'
        | 'FERRY' | 'CHECKPOINT' | 'FUEL' | 'FATIGUE' | 'SEASONAL' | 'OTHER'
    severity: 'INFO' | 'WARNING' | 'BLOCK'
    titleZh: string
    summaryZh: string
    affectedSegmentId?: string
    recommendation?: { action: string, detailZh?: string }
  }>
  selfDriveKernel?: {
    destinationPackId: string      // destination.cn / destination.is
    countryCode: string
    corridorId?: string | null     // 经典线 id（编排单位，裁决仍看 segment）
    criticalSegmentCount: number
    roadEvidenceFreshness?: 'FRESH' | 'STALE' | 'EXPIRED' | 'PARTIAL' | 'UNKNOWN'
    roadStatus?: string
    roadStrongJudgmentAllowed?: boolean  // CN 季节窗多为 false
  }
}
```

`?lite=1`：**不要**带大图、完整成员、五维详情、Runbook 六段、因果链。`now` / `exception` / `planReality` / `advisories` / `selfDriveKernel` 在 lite 也返回（展示就绪、体量小）。

**Kernel 来源：** `buildSelfDriveContext`（`src/trips/self-drive-kernel`）；架构见 [ADR-SELF-DRIVE-KERNEL](../../../internal-docs/architecture/ADR-SELF-DRIVE-KERNEL.md)。

---

## 4. 服务端裁定字段（客户端勿猜）

| 字段 | 原因 |
|------|------|
| `overallStatus.code` | 四态是产品裁决；**无 Impact 不抬升 NEEDS_ATTENTION** |
| `overallStatus.hasImpact` | 与 `planReality.hasImpact` 同源 |
| `now` / `now.atDestination` | 在店 vs 在开，勿用 next 反推 |
| `planReality.*` | planned vs actual/ETA + deviation + 是否打扰 |
| `exception` | 仅有 Impact 时出现；前端勿自行造异常条 |
| `timeMarginMinutes` | ETA vs 计划窗，统一时钟 |
| `departureSuggestion` | 含停车步行缓冲 |
| `vehicle.isNormal` + alert | 油站稀疏 / 车辆异常 |
| `teamReadiness` | 「是否影响出发」≠ 在线人数 |
| `selfDrive.lifecycle` | 与确认 / 阻断对齐 |

客户端可保留乐观态；最终以 `contextVersion` 纠正。

### 4.1 安静原则

- `hasImpact = false` → `overallStatus.code = ON_PLAN`，且 **不返回** `exception`
- 软 gate（如准备项 / 车辆留意）alone **不会**抬升综合态；仍可出现在 `departureSuggestion` / 五维下钻
- Impact 来源：阻断、待调整、计划迟到（`timeMarginSeverity=LATE`）、需立即关注的风险

---

## 5. 下钻 / 写（不必新建总览专用写）

| 场景 | 接口 |
|------|------|
| 五维 / 确认出发 | `daily-drive-status` + `dimensions/:code` |
| Runbook | `in-trip-home` / `runbooks/{id}` |
| 风险详情 | `execution-alerts` |
| 待调整 | `adjustment-queue` |
| 团队详情 | `team-status` / member-status |
| 燃油详情 | `daily-drive-status/dimensions/FUEL` |
| **车辆详情** | `GET .../execution/overview-dashboard/vehicle` |
| **权威驾驶会话** | `GET .../execution/drive-session` |
| 导航 / 到达 / 换驾 | 现有 navigation / travel-segment / quick-actions（写时会更新 `driveSession`） |

### 5.1 Drive Session

```
GET /api/mobile/trips/{tripId}/execution/drive-session
```

```ts
{
  schemaId: 'tripnara.execution_drive_session@v1'
  localDate: string
  timezone: string
  phase: OverviewSelfDriveLifecycle
  continuousDriveMinutes: number
  todayDrivenMinutes: number
  todayRemainingDriveMinutes?: number
  lastDriverMemberId?: string
  continuousDriveWarningZh?: string  // ≥120 分钟
  serverTime: string
  contextVersion: number
  authoritative: boolean  // true=已持久化；false=由 nav/field/confirm 派生
}
```

写路径（既有能力，非新总览写接口）：

| 事件 | 效果 |
|------|------|
| `POST daily-drive-confirm` | `PREPARING` |
| `POST` startNavigation | `DRIVING` + 重置连续段 |
| trip-field `SAFE_STOP` / `NEED_REST` / `PAUSE_TRIP` | `TEMPORARY_STOP` |
| `ARRIVED` | `ARRIVED` |
| `CHANGE_DRIVER` | 重置连续段 |
| `END_EARLY` | `DAY_ENDED` |

Dashboard `selfDrive.*Minutes` 与本接口同源。

### 5.2 Vehicle Detail

```
GET /api/mobile/trips/{tripId}/execution/overview-dashboard/vehicle
```

返回租车紧急电话、道路适配/禁行提示、附近油站与**充电站**列表、连续驾驶警告。

```ts
{
  schemaId: 'tripnara.execution_overview_vehicle@v1'
  contextVersion: number
  serverTime: string
  summary: OverviewVehicleDto
  rentalEmergencyPhone?: string
  vehicleTypeZh?: string
  roadFitZh?: string
  forbiddenRoads: Array<{ titleZh: string, detailZh?: string, severityZh?: string }>
  fuelStations: Array<{ nameZh, distanceKm?, distanceZh?, durationZh?, tagZh? }>
  chargingStations: Array<{ nameZh, distanceKm?, distanceZh?, durationZh?, tagZh? }>
  continuousDriveWarningZh?: string
}
```

充电站 / 油站：以下一站坐标为圆心做 Place SUPPLY 附近检索（`EV_CHARGING` / `FUEL_*`）；无坐标时油站回退到 daily-drive FUEL 摘要。

---

## 6. WebSocket

```json
{
  "type": "trip_context_changed",
  "tripId": "…",
  "contextVersion": 143,
  "changedSections": ["overview_dashboard"]
}
```

也可与既有 section 组合，例如：

- `["overview_dashboard"]`
- `["daily_drive", "execution", "overview_dashboard"]`
- `["in_trip_home", "execution", "overview_dashboard"]`

**禁止**每次全量四接口齐飞；按 section 局部重拉 `overview-dashboard?lite=1`。

---

## 7. 分期

| 阶段 | 内容 |
|------|------|
| **P0（已落地）** | `GET overview-dashboard?lite=1`；WS `overview_dashboard`；`activeRunbookId` |
| **P1（已落地）** | `lite=0` 图/坐标/租车电话；gate 同源；`GET drive-session`；`GET overview-dashboard/vehicle`；写路径持久化 driveSession |
| **P1 Execution Projection（已落地）** | 叠加 `now` / `exception` / `planReality`；Now/Next 拆分；Impact 门禁 overallStatus；**不**新建日程编排 API |
| **P2（已落地）** | 总览首屏**不再**依赖旧 `execution-overview`（Swagger 标记 deprecated）；充电站列表充实 |
| **K4 shadow（已落地）** | `advisories[]` + `selfDriveKernel`；CN 高反/限行/季节窗与 IS 租车约束同构灌入；**不**改 overallStatus 门禁 |

### 7.1 P2 与旧接口关系

| 接口 | 角色 |
|------|------|
| `GET execution/overview-dashboard` | **总览 Tab 唯一首屏** |
| `GET execution-overview` | 遗留 / workspace shell；可并存，**勿**再作为总览首屏 |

---

## 8. 冷启动目标

```
GET overview-dashboard?lite=1   ← 唯一阻塞首屏
立刻渲染：综合状态 + 目的地文案 + 出发建议 + 车辆/团队一行
```
