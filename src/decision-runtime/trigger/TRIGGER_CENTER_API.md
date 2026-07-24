# M7 触发中心 — 前端对接文档

> **端点：** `GET /api/decision-engine/v1/trigger-center/by-trip/:tripId`  
> **前置：** `DECISION_TRIGGER_GATEWAY_ENABLED=1`（lineage 才会写入）  
> **Schema：** `tripnara.trigger_center_view@v1`

## 用途

向用户展示 Monitoring / In-trip / Kernel 触发链路的可读摘要：

- 发生了什么
- 影响了哪一天 / 哪个范围
- 当前方案是否仍有效
- 系统建议什么
- 是否需要确认
- 是否已自动修复 / 跳过 / 委托全量重规划

## 请求

```http
GET /api/decision-engine/v1/trigger-center/by-trip/{tripId}
```

无需鉴权（`@Public()` QA 端点）。生产环境建议加 trip 成员校验后再开放。

## 响应示例

```json
{
  "success": true,
  "data": {
    "schemaId": "tripnara.trigger_center_view@v1",
    "tripId": "trip_abc",
    "generatedAt": "2026-07-02T12:00:00.000Z",
    "itemCount": 2,
    "items": [
      {
        "runId": "run_001",
        "recordedAt": "2026-07-02T11:55:00.000Z",
        "headline": "Road Closed",
        "eventType": "ROAD_CLOSED",
        "triggerKind": "IN_TRIP_DEVIATION",
        "source": "INTERNAL",
        "affectedScope": "ITEM",
        "affectedDayLabel": "Day 2",
        "planValidity": "REPAIRING",
        "recommendation": {
          "strategy": "LOCAL_REPAIR",
          "action": "LOCAL_REPAIR",
          "urgency": "HIGH",
          "summary": "trigger=IN_TRIP_DEVIATION severity=HIGH → LOCAL_REPAIR"
        },
        "humanConfirmationRequired": false,
        "disposition": "AUTO_REPAIR",
        "detectorId": "detector.in-trip-recovery",
        "eventId": "env_evt_123"
      }
    ],
    "detectorWiring": { "...": "monitoring detector catalog summary" }
  }
}
```

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `headline` | string | 用户可见标题（由 `eventType` / `triggerType` 人类化） |
| `eventType` | string | 原始事件类型，如 `ROAD_CLOSED`、`WEATHER_HAZARD_CHANGED` |
| `triggerKind` | string | Gateway 归一化种类，如 `IN_TRIP_DEVIATION`、`WORLD_EVENT` |
| `affectedScope` | `ITEM` \| `DAY` \| `SEGMENT` \| `FULL_TRIP` \| `UNKNOWN` | Replanning 影响范围 |
| `affectedDayLabel` | string? | 如 `Day 2`（来自 metadata `dayIndex`） |
| `planValidity` | `VALID` \| `REPAIRING` \| `STALE` \| `UNKNOWN` | 方案有效性判断 |
| `recommendation` | object | `strategy` / `action` / `urgency` / `summary` |
| `humanConfirmationRequired` | boolean | 是否需要用户确认 |
| `disposition` | enum | 见下表 |
| `skippedReason` | string? | policy 跳过时的原因码 |
| `detectorId` | string? | 对应 `monitoring-detector-wiring.catalog` 条目 |

### disposition 枚举

| 值 | UI 建议 |
|----|---------|
| `AUTO_REPAIR` | 显示「系统正在局部修复」 |
| `DELEGATED_FULL_REPLAN` | 显示「已转交全量重规划」 |
| `SKIPPED` | 显示「本次未触发重规划」+ `skippedReason` |
| `ADVISORY_ONLY` | 显示「仅建议，无操作」 |
| `AWAITING_CONFIRMATION` | 显示确认按钮 |
| `PENDING` | 显示处理中 |

### planValidity 枚举

| 值 | UI 建议 |
|----|---------|
| `VALID` | 绿色 — 方案仍有效 |
| `REPAIRING` | 黄色 — 局部修复中 |
| `STALE` | 红色 — 需重规划 |
| `UNKNOWN` | 灰色 — 待评估 |

## 排序

`items` 按 `recordedAt` **降序**（最新在前）。

## 空列表

无 lineage 时 `itemCount: 0`，`items: []`。常见原因：

- `DECISION_TRIGGER_GATEWAY_ENABLED=0`
- 该 trip 尚未产生触发事件

## 相关端点

| 端点 | 用途 |
|------|------|
| `GET /decision-engine/v1/runtime-capabilities` | Runtime 模式、detector/trigger wiring |
| `GET /decision-engine/v1/trigger-center/by-trip/:tripId` | 本接口 |

## 推荐轮询

行中场景建议 **30–60s** 轮询，或在 WebSocket / SSE 推送 `IN_TRIP_DEVIATION` 后单次拉取。

## 内部最小 UI（M7 Preview）

无独立前端仓库时，使用内置静态页：

```bash
npm run m7-trigger-center:preview
# → http://localhost:8090/?tripId=<id>&base=http://localhost:3000/api
```

文件：`src/decision-runtime/trigger/m7-trigger-center.internal.html`  
面向：内部运营 / 产品 / 工程调试（非 C 端）。

## 类型来源

- 视图构建：`src/decision-runtime/trigger/trigger-center.view.ts`
- Lineage 存储：`src/decision-runtime/trigger/decision-trigger-lineage.store.ts`
