# 今日自驾状态 · 后端接口（P0）

> 依据产品「今日自驾状态」与 iOS `DailyDrive*` 模型。  
> **样式不跟稿**：本稿只锁 API 契约、枚举与同源关系。  
> **最后更新：** 2026-07-19

**相关能力边界：**

| 能力 | 路径 / 文档 | 与本能力关系 |
|------|-------------|--------------|
| 自驾准备报告 | `overall-readiness?view=self_drive_report` | 行前 checklist；**不**承接当日确认 |
| Situation（规划） | `icelandSelfDriveSituation` | 规划期诊断；**不**替代当日出发快览 |
| 活跃风险提醒 | `GET .../execution/execution-alerts` | 执行中主风险中心；本页注意项可 **下钻** 至此 |
| Departure Slip | `POST .../execution/departure-slip` | 「我晚了」延误上报；与本确认 **不同写入口** |
| 执行总览 Dashboard | [OVERVIEW_DASHBOARD_API.md](../execution-overview-dashboard/OVERVIEW_DASHBOARD_API.md) | 新总览首屏投影；本页为下钻，非首屏唯一依赖 |

---

## 1. 产品一句话

> 回答用户：**「今天还能不能按计划自驾出发？现场状态准不准？还要盯什么？」**

| 页面 | 读 / 写 | 数据职责 |
|------|---------|----------|
| 今日自驾状态 | 读 | 总览 gate + 五维摘要 + 是否已确认 |
| 今日自驾信息确认 | 读草稿 + 写提交 | 油量 / 出发 / 驾驶员 / 疲劳 / 车辆 / 准备 |
| 今日风险提醒 | 读（内嵌） | 当日注意项列表 + NARA 建议文案 |

---

## 2. 通用约定

### 2.1 路径前缀（已裁定）

挂在 mobile 执行子资源下（与 `execution-alerts` 同级）：

```
/api/mobile/trips/{tripId}/execution/daily-drive-status
/api/mobile/trips/{tripId}/execution/daily-drive-confirm
```

相对 `baseURL`（已含 `/api`）：

```
mobile/trips/{tripId}/execution/daily-drive-status
mobile/trips/{tripId}/execution/daily-drive-confirm
```

**P0 不提供** canonical `/api/trips/...` 双写。

### 2.2 信封

与执行阶段一致：

```json
{
  "success": true,
  "data": { },
  "requestId": "uuid",
  "tripId": "trip-xxx",
  "contextVersion": 142,
  "serverTime": "2026-07-19T08:00:00Z"
}
```

写操作响应 **必须** 带回新 `contextVersion`（根级或 `data` 内）。

### 2.3 请求头

| Header | 读 | 写 | 说明 |
|--------|----|----|------|
| `Authorization: Bearer <token>` | 必填 | 必填 | |
| `X-Client-Version` | 建议 | 建议 | |
| `Idempotency-Key` | — | **必填** | UUID；重复提交返回同一结果（`replay: true`） |
| `If-Match: <contextVersion>` | — | **必填** | 冲突 → `CONTEXT_VERSION_CONFLICT` |

### 2.4 时间与日界

| 字段 | 格式 |
|------|------|
| 日期 `localDate` | `yyyy-MM-dd`，行程当地时区（缺省 `Atlantic/Reykjavik`） |
| 时刻文案 | 服务端直接给展示字符串（如 `建议 08:30 前离开`） |
| 「今日」 | 以行程当地日历日为准；跨日 00:00 后需新确认 |

### 2.5 错误码

| code | 场景 |
|------|------|
| `UNAUTHORIZED` | 未登录 |
| `FORBIDDEN` | 非行程成员 |
| `TRIP_NOT_FOUND` / `NOT_FOUND` | 行程不存在 |
| `VALIDATION_ERROR` | 枚举非法 / 缺字段 / 缺头 / 驾驶员非成员 |
| `CONTEXT_VERSION_CONFLICT` | `If-Match` 不匹配 |
| `CONFIRM_EXPIRED` | 提交的 `localDate` 已不是当地「今日」 |

### 2.6 非执行态

`lifecycle !== traveling` **仍返回完整 schema**（空态友好），不 404。规划态可展示；确认仅当地今日有效。

---

## 3. 接口一览

| 优先级 | 方法 | 路径 | 用途 |
|--------|------|------|------|
| **P0** | `GET` | `.../execution/daily-drive-status` | 状态页 + 内嵌风险提醒 + 确认态 |
| **P0** | `GET` | `.../execution/daily-drive-status/dimensions/{code}` | 五维详情下钻（§12） |
| **P0** | `GET` | `.../execution/daily-drive-confirm` | 确认页草稿（含可选驾驶员） |
| **P0** | `POST` | `.../execution/daily-drive-confirm` | 提交当日确认（幂等） |

---

## 4. GET 今日自驾状态

```
GET /api/mobile/trips/{tripId}/execution/daily-drive-status
```

| Query | 类型 | 说明 |
|-------|------|------|
| `localDate` | `yyyy-MM-dd` | 默认行程当地「今日」 |
| `includeReminders` | boolean | 默认 `true` |

`data.schemaId` = `tripnara.daily_drive_status@v1`。

固定返回 **5** 个 `dimensions`（`ROAD` / `WEATHER` / `DAYLIGHT` / `FUEL` / `SCHEDULE`），顺序固定。

### gate 判定

| gate | 条件 |
|------|------|
| `BLOCKED` | 存在 STOP / REPLAN 级 alerts，或任一五维 `BLOCKED` |
| `NEEDS_ATTENTION` | 无阻断，但任一五维 `ATTENTION`，或 reminders 含 `MEDIUM`，或确认负向（车辆异常 / 准备未完成 / 疲劳） |
| `CAN_DEPART` | 其余情况 |

### 与 execution-alerts 同源

- `reminders.items[].relatedRiskId` = alert.`riskId` ?? `id`，可在风险中心打开。
- 当日注意项是 alerts 的 **轻量投影**（`MEDIUM` \| `LOW`）；阻断级进 `gate=BLOCKED`，不堆在 reminders。

### 确认负向副作用

`vehicleAbnormal=true` 或 `prepCompleted=false`（及 `fatigue=FATIGUED`）→ 至少 `NEEDS_ATTENTION` + 对应 `MEDIUM` reminder；**不**单独抬到 `BLOCKED`。

---

## 5. GET 确认草稿

```
GET /api/mobile/trips/{tripId}/execution/daily-drive-confirm
```

`data.schemaId` = `tripnara.daily_drive_confirm@v1`。

含 `defaults` / `lastSubmission` / `driverOptions`（`isPrimaryDriver` 优先 OWNER/EDITOR）。

---

## 6. POST 提交确认

```
POST /api/mobile/trips/{tripId}/execution/daily-drive-confirm
Idempotency-Key: <uuid>
If-Match: <contextVersion>
```

### 写后副作用

1. `contextVersion` 递增（`Trip.updatedAt` 变更）。
2. `FUEL.detailZh` 消费最新 `fuelLevel`。
3. WebSocket `trip_context_changed`：`changedSections` 含 **`daily_drive`** 与 **`execution`**。
4. 同 `Idempotency-Key` → 幂等重放（`replay: true`），不双写。
5. 同日新 Key → **覆盖更新** 当日确认。

响应建议含刷新后的 `status` 投影。

---

## 7. 持久化

`Trip.metadata.mobileExecution.dailyDrive.byLocalDate[yyyy-MM-dd]`：

```ts
{
  confirmationId, confirmedAt, confirmedByMemberId,
  payload: DailyDriveConfirmPayload
}
```

幂等键：`mobileExecution.idempotencyKeys[<key>] = "<localDate>::<confirmationId>"`。

---

## 8. iOS 调用映射

| 后端 | iOS（拟） |
|------|-----------|
| `GET daily-drive-status` | `ExecutionDataRepository.fetchDailyDriveStatus` |
| `GET daily-drive-status/dimensions/{code}` | 五维详情 View（见 §12.7） |
| `GET daily-drive-confirm` | `fetchDailyDriveConfirmDraft` |
| `POST daily-drive-confirm` | `submitDailyDriveConfirm` |
| WS `changedSections` 含 `daily_drive` | 刷新 status 页 / 入口卡 |

---

## 9. 验收清单

- [x] `GET status` 固定 5 个 `dimensions`
- [x] `gate` 与五维 / reminders 同向
- [x] `confirmation.isConfirmed` 与当日 POST 一致；跨当地日后归 `false`
- [x] `POST confirm` 必须 `Idempotency-Key` + `If-Match`；重放不双写
- [x] 提交后 `FUEL.detailZh` 反映新油量
- [x] `relatedRiskId` 可对上 `execution-alerts`
- [x] WS `daily_drive` + `contextVersion` 写后可刷新
- [x] 非执行态返回完整 schema（不 404）

---

## 10. 已裁定

1. 本能力是 **当日出发快览**，不是准备报告、不是 Situation、不是活跃风险主页。
2. P0：**一个 GET status 内嵌 reminders**；确认单独 GET/POST。
3. 风险等级 P0 仅 `MEDIUM` \| `LOW`；阻断用 `gate`。
4. 写操作走 `Idempotency-Key`；同日可覆盖更新。
5. 展示文案优先服务端 `*LabelZh` / `*Zh`。
6. **路径**：`/api/mobile/...`（无 canonical 双写）。
7. **WS**：新增 `"daily_drive"`（同时带 `"execution"`）。
8. **`If-Match`**：强制。
9. **负向确认**：抬至至少 `NEEDS_ATTENTION` + reminder；不单独 `BLOCKED`。
10. **非执行态**：完整 schema，不 404。

### P1（未做）

- `execution-overview.dailyDriveEntry` 入口卡投影
- 独立 reminders GET
- Prisma 专用表

---

## 12. 五维详情页（P0 下钻）

从 `dimensions[].code` 下钻，**不**替代 status 主接口。

| 优先级 | 方法 | 路径 | 用途 |
|--------|------|------|------|
| **P0** | `GET` | `.../execution/daily-drive-status/dimensions/ROAD` | 路况详情 |
| **P0** | `GET` | `.../execution/daily-drive-status/dimensions/WEATHER` | 天气详情 |
| **P0** | `GET` | `.../execution/daily-drive-status/dimensions/DAYLIGHT` | 日照详情 |
| **P0** | `GET` | `.../execution/daily-drive-status/dimensions/FUEL` | 燃油详情 |
| **P0** | `GET` | `.../execution/daily-drive-status/dimensions/SCHEDULE` | 日程详情 |

Query：`localDate`（默认当地今日），与 status 一致。非法 `code` → `VALIDATION_ERROR`。

各页 `schemaId`：

- `tripnara.daily_drive_dimension_road@v1`
- `tripnara.daily_drive_dimension_weather@v1`
- `tripnara.daily_drive_dimension_daylight@v1`
- `tripnara.daily_drive_dimension_fuel@v1`
- `tripnara.daily_drive_dimension_schedule@v1`

### 12.1 共用外壳

```typescript
{
  schemaId: string;
  localDate: string;
  timezone: string;
  contextVersion?: number;
  context: { tripLabelZh: string; dayLabelZh: string };
  hero: {
    titleZh: string;
    detailZh: string;
    metaZh?: string;
    severity: "OK" | "ATTENTION" | "CAUTION" | "BLOCKED";
    iconHint?: string;
  };
  primaryAction?: {
    labelZh: string;
    action: "OPEN_MAP" | "ENABLE_WEATHER_REMINDERS" | "VIEW_TIME_IMPACT" | "ADJUST_TODAY" | "NAVIGATE_FUEL" | "UPDATE_FUEL_LEVEL";
  };
}
```

`hero.detailZh` 与 status 对应维 `detailZh` 对齐；燃油页「更新油量」P0 复用 `POST .../daily-drive-confirm`。

### 12.2–12.6 要点字段

| code | 要点字段 |
|------|----------|
| ROAD | `routeSummaryZh`、`nextChangeLabelZh`、`routeNodesZh[]`、`stats[{id:TOTAL_KM\|PROGRESS_KM\|ARRIVAL_WINDOW}]`、`segments[{titleZh,statusZh,severity}]`、`riskNotesZh[]`、`parkingSpots[{role:NEXT\|ALTERNATE,nameZh,distanceKm,durationZh}]`（**Place OSM 停车优先** + pack safe-stop 兜底）、`changeNoteZh`（Runbook 政策页脚）；hero=可通行结论+路况摘要+下次变化；CTA=`OPEN_MAP` |
| WEATHER | `summaryLineZh`、`mainImpactZh`、`metrics[{id:TEMP\|WIND\|VISIBILITY\|SNOWFALL}]`、`trends[]`（约 6h）、`impacts[{id:CROSSWIND\|ICING\|VISIBILITY,statusZh}]`、`suggestionsZh[]`、`reminderSettings[{id:wind\|snowfall\|visibility}]`；CTA=`ENABLE_WEATHER_REMINDERS` |
| DAYLIGHT | `sunriseLabelZh`/`sunsetLabelZh`/`dawnLabelZh`、`suggestedDepartBeforeZh`、`estimatedArrivalZh`、`timelineMarkers[{kind:dawn\|suggested_depart\|sunrise\|now\|sunset\|arrival\|night}]`、`daylightBands[{id:DAWN\|DAY\|DUSK\|NIGHT}]`、`itineraryLinks[{daylightStatus,daylightStatusZh}]`、`nightExposure{durationZh,durationMin,segmentZh,severityZh}`、`suggestionsZh[]`、`robustPlan`；CTA=`ADJUST_TODAY`（建议出发时刻） |
| FUEL | `fuelFraction`、`fuelLevelLabelZh`、`rangeKm`、`nextStationKm`、`coverage[{id,labelZh,valueZh,statusZh,status}]`、`stations[{id,nameZh,tag,tagZh,distanceKm,durationZh,priceLabelZh?,lat,lng}]`（**Place 油站 + 今日/明日行程走廊实时投影**；pack seed 兜底）、`ifNoRefuelZh`、`suggestionZh`、`selectedFuelLevel`；CTA=`UPDATE_FUEL_LEVEL` |
| SCHEDULE | `arrivalWindowZh`、`timeline[{timeZh,titleZh,status,statusZh,isHardWindow}]`、`buffers[{id:OVERALL\|TO_NEXT\|TO_CHECKIN,labelZh,valueZh,tone}]`、`impacts[{id:DRIVE_DELAY\|DAYLIGHT\|EXECUTABLE,...}]`、`naraSuggestionZh`、`keyNodes[{id:NEXT_HARD_WINDOW\|HOTEL_CHECKIN\|SELF_CHECKIN,...}]`；hero=`仍可按计划推进` + 预计到达 + 硬窗；CTA=`ADJUST_TODAY` |

### 12.7 iOS 映射

| API code | iOS View |
|----------|----------|
| ROAD | `DailyDriveRoadDetailView` |
| WEATHER | `DailyDriveWeatherDetailView` |
| DAYLIGHT | `DailyDriveDaylightDetailView` |
| FUEL | `DailyDriveFuelDetailView` |
| SCHEDULE | `DailyDriveScheduleDetailView` |

相对路径示例：`mobile/trips/{tripId}/execution/daily-drive-status/dimensions/FUEL`

### 12.8 性能口径（P0 → 热路径 ≤500ms）

| 接口 | 策略 |
|------|------|
| `GET status` | 轻量 env + 当日 itinerary 直查；`execution-alerts` **最多等 120ms**，超时则 `reminders=[]` 且 `evidence.remindersDeferred=true` |
| `GET status` 缓存 | 进程内 TTL **20s**（同 trip+localDate+includeReminders）；写确认后失效 |
| `GET status?includeReminders=false` | 完全跳过 alerts |
| `GET dimensions/*` | 进程内 TTL **20s**（同 trip+localDate+code）；写确认后与 status 一并失效。按维按需取数（不跑 alerts / 不拼全量 status）。**ROAD** 停车用 `ST_DWithin` 近点查询（≤40，半径 80km，cell 缓存 60s），避免全岛 Place 扫描；**FUEL** 用 Place 油站缓存（TTL 15min）+ 今日/明日途经点走廊投影 |
| `POST confirm` | 写后内嵌 status 不拉 alerts；并清 status 缓存 |

**前端：** 若 `evidence.remindersDeferred === true`，可后台再拉一次 status 或单独拉 `execution-alerts` 补 reminders，不阻塞首屏。

---

## 13. 实现落点

| 文件 | 说明 |
|------|------|
| `src/mobile/services/mobile-daily-drive.service.ts` | 读/写 + 五维详情 |
| `src/mobile/utils/daily-drive-status.projection.util.ts` | gate / 五维摘要 / reminders |
| `src/mobile/utils/daily-drive-dimension-detail.projection.util.ts` | 五维详情投影 |
| `src/mobile/utils/daily-drive-fuel-corridor.projection.util.ts` | FUEL：Place/走廊油站投影 |
| `src/mobile/utils/daily-drive-schedule-detail.projection.util.ts` | SCHEDULE：时间线/缓冲/影响/NARA |
| `src/mobile/utils/daily-drive-road-detail.projection.util.ts` | ROAD：路线概览/路段/停车点 |
| `src/mobile/utils/daily-drive-daylight-detail.projection.util.ts` | DAYLIGHT：日照窗口/行程关系/夜间暴露 |
| `src/mobile/utils/daily-drive-weather-detail.projection.util.ts` | WEATHER：指标/趋势/驾驶影响/提醒 |
| `src/mobile/dto/mobile-daily-drive.types.ts` | DTO |
| `src/mobile/controllers/mobile-execution.controller.ts` | 路由 |
| `src/mobile/ws/trip-context-ws.types.ts` | `daily_drive` section |
| `src/auth/EXECUTE_NATIVE_API.md` | 执行阶段索引 |
