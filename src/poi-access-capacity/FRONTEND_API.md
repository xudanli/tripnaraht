# POI Access & Capacity — 前端接口文档

> **Global prefix**：`/api`  
> **响应格式**：`{ success, data?, error? }`（行中接口）；`/poi-access-capacity/*` 当前为裸 JSON 返回  
> **鉴权**：生产环境需 Bearer；开发环境部分行中接口允许 `anonymous-dev-user`  
> **适用场景**：冰岛行程规划、行中晨间预警、POI 详情页「能不能去」、行中匿名反馈

---

## 一、接口一览

| 场景 | 方法 | 路径 | 前端用途 |
|------|------|------|----------|
| 单 POI 评估 | `GET` | `/poi-access-capacity/evaluate` | POI 详情 / 改时间后即时结论 |
| 规则查询 | `GET` | `/poi-access-capacity/rules` | 规则说明页、免责声明 |
| 行中反馈（在线） | `POST` | `/poi-access-capacity/feedback` | 离开 POI 后提交等待/停车体验 |
| 晨间预警（扩展字段） | `GET` | `/trips/:tripId/in-trip/offline/morning-pack` | 当日 POI 阻塞/风险提示卡片 |
| 离线反馈（队列） | `POST` | `/trips/:tripId/in-trip/offline/sync` | 无网时排队，联网回放 |
| 行程校验 issue | — | `itinerary.verify` 输出 | 规划阶段 issue 列表（见 §五） |

> **运维接口**（App 一般不调用）：`POST /poi-access-capacity/sync/vatnajokull`、`/sync/all`、`/sync/capacity`

---

## 二、单 POI 评估

### `GET /api/poi-access-capacity/evaluate`

**Query 参数**

| 参数 | 必填 | 示例 | 说明 |
|------|------|------|------|
| `poiId` | 是 | `is.gullfoss` | 冰岛 POI slug（见 §七） |
| `dateISO` | 是 | `2026-07-15` | 访问日期 `YYYY-MM-DD` |
| `arrivalTime` | 是 | `11:00` | 计划到达时刻 `HH:mm`（目的地当地） |
| `vehicleType` | 否 | `SUV` | `SEDAN` / `SUV` / `4x4` 等，影响 F 路/高地规则 |
| `poiName` | 否 | `Gullfoss` | 仅用于日志/展示，不参与计算 |

**响应 `data`（裸返回，无 success 包装）**

```json
{
  "verdict": "FEASIBLE_WITH_RISK",
  "poiId": "is.reynisfjara",
  "bottleneckResource": "POI",
  "bottleneckRuleType": "SAFETY_RESTRICTION",
  "reason": "Reynisfjara：离岸流与涌浪风险，需在安全线内活动",
  "confidence": "OFFICIAL",
  "signalSources": ["MODEL"],
  "predictedWaitP50": 12,
  "predictedWaitP90": 25,
  "crowdLevel": "MEDIUM",
  "planB": [
    {
      "action": "SHIFT_ARRIVAL",
      "detail": "建议提前约 45 分钟到达以避开高峰",
      "suggestedArrivalTime": "10:15"
    }
  ],
  "blockingRuleIds": []
}
```

### `verdict` 前端映射

| verdict | 含义 | 建议 UI |
|---------|------|---------|
| `FEASIBLE` | 可执行 | 绿色 / 无横幅 |
| `FEASIBLE_WITH_RISK` | 可去但有风险或拥堵 | 黄色提示 + `planB` |
| `BLOCKED` | 硬约束，不可按当前计划执行 | 红色阻断 + `planB` |
| `NEEDS_CONFIRMATION` | 规则过期或待官方确认 | 橙色「出发前确认」 |

### `planB[].action` 前端映射

| action | 含义 | 建议交互 |
|--------|------|----------|
| `SHIFT_ARRIVAL` | 改到达时刻 | 时间选择器 / 「提前 N 分钟」 |
| `BOOK_NOW` | 需预约 | 外链官方预订 |
| `CHANGE_DATE` | 改日期 | 日历改期 |
| `USE_ALTERNATIVE` | 替代 POI | 展示 `alternativePoiId`，一键替换行程项 |

**示例：Blue Lagoon 无预约**

```http
GET /api/poi-access-capacity/evaluate?poiId=is.blue_lagoon&dateISO=2026-08-01&arrivalTime=14:00
```

```json
{
  "verdict": "BLOCKED",
  "poiId": "is.blue_lagoon",
  "bottleneckRuleType": "RESERVATION_REQUIRED",
  "reason": "Blue Lagoon：入场需要预约",
  "planB": [
    { "action": "BOOK_NOW", "detail": "前往 Blue Lagoon 官方预订" },
    {
      "action": "USE_ALTERNATIVE",
      "detail": "同类温泉体验，时段库存压力通常较低",
      "alternativePoiId": "is.sky_lagoon"
    }
  ]
}
```

---

## 三、规则查询

### `GET /api/poi-access-capacity/rules?poiId=is.skaftafell`

```json
{
  "poiId": "is.skaftafell",
  "rules": [
    {
      "id": "is.skaftafell.trail_status",
      "poiId": "is.skaftafell",
      "ruleType": "TRAIL_RESTRICTION",
      "targetResource": "TRAIL",
      "status": "ACTIVE",
      "enforcement": "HARD",
      "sourceAuthority": "Vatnajökull National Park",
      "lastVerifiedAt": "2026-06-20T00:00:00.000Z",
      "confidence": "OFFICIAL",
      "notes": "..."
    }
  ],
  "statusOverrides": [
    {
      "id": "sync.vatnajokull.s1_morsardalur",
      "poiId": "is.skaftafell",
      "ruleType": "TRAIL_RESTRICTION",
      "status": "ACTIVE",
      "effectiveFrom": "2026-06-01T00:00:00.000Z",
      "effectiveTo": "2026-09-30T23:59:59.000Z",
      "notes": "Morsárjökull 步道临时关闭"
    }
  ]
}
```

- `rules`：静态准入规则  
- `statusOverrides`：官方同步的动态覆盖（步道关闭、繁殖期限流等）

---

## 四、行中反馈

### 4.1 在线提交

### `POST /api/poi-access-capacity/feedback`

**请求体**

```json
{
  "poiId": "is.gullfoss",
  "placeId": 12345,
  "tripId": "trip-uuid",
  "dateISO": "2026-07-15",
  "arrivalTime": "11:30",
  "parkingWaitMin": 20,
  "visitDurationMin": 45,
  "couldNotPark": false,
  "abandonedDueToCrowd": false,
  "crowdLevelSubjective": "HIGH",
  "notes": "停车场几乎满位"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `poiId` | 是 | POI slug |
| `dateISO` | 是 | 访问日 |
| `parkingWaitMin` | 否 | 停车等待（分钟） |
| `couldNotPark` | 否 | 未能停车 |
| `abandonedDueToCrowd` | 否 | 因拥挤放弃 |
| `crowdLevelSubjective` | 否 | `LOW` / `MEDIUM` / `HIGH` / `VERY_HIGH` |

**响应**

```json
{
  "id": "feedback-uuid",
  "aggregatedSnapshot": {
    "poiId": "is.gullfoss",
    "crowdLevel": "MEDIUM",
    "predictedWaitP50": 18,
    "signalSources": ["USER"],
    "confidenceScore": 0.62
  }
}
```

### 4.2 离线队列（推荐行中无网场景）

写入本地队列，`operationType` 为 **`poi_execution_feedback`**，联网后走：

`POST /api/trips/:tripId/in-trip/offline/sync`

```json
{
  "operations": [
    {
      "clientSeq": 5,
      "operationType": "poi_execution_feedback",
      "recordedAt": "2026-07-15T14:20:00.000Z",
      "payload": {
        "poiId": "is.gullfoss",
        "dateISO": "2026-07-15",
        "arrivalTime": "11:30",
        "parkingWaitMin": 20,
        "crowdLevelSubjective": "HIGH"
      }
    }
  ]
}
```

> 离线同步时 `tripId` 由 URL 注入，payload 内 `tripId` 可省略。

---

## 五、行程校验 issue（规划阶段）

`itinerary.verify` 在冰岛 POI 上会追加以下 **issue.type**（嵌在 verify 结果 `issues[]` 中，非独立 HTTP 接口）：

| type | severity | 含义 |
|------|----------|------|
| `POI_ACCESS_BLOCKED` | `ERROR` | 硬约束阻断 |
| `POI_ACCESS_RISK` | `WARNING` | 可执行但有风险/拥堵 |
| `POI_ACCESS_UNCONFIRMED` | `WARNING` | 待官方确认 |

**单条 issue 结构**

```json
{
  "type": "POI_ACCESS_BLOCKED",
  "severity": "ERROR",
  "item_id": "item-bl",
  "day": "2026-08-01",
  "message": "Blue Lagoon：入场需要预约",
  "suggestion": "前往官方预订；改选 Sky Lagoon",
  "evaluation": {
    "verdict": "BLOCKED",
    "poiId": "is.blue_lagoon",
    "reason": "Blue Lagoon：入场需要预约",
    "planB": [
      { "action": "BOOK_NOW", "detail": "前往官方预订" },
      {
        "action": "USE_ALTERNATIVE",
        "detail": "同类温泉体验…",
        "alternativePoiId": "is.sky_lagoon"
      }
    ]
  },
  "violation": {
    "anchor": { "constraintId": "entity.mandatory_reservation" },
    "entityRef": { "type": "POI", "id": "item-bl" },
    "suggestedActions": [
      { "action": "ASK_USER", "detail": "前往官方预订" },
      { "action": "REPLACE", "detail": "改选 Sky Lagoon" }
    ]
  }
}
```

**Neptune Repair 映射（供「一键修复」按钮）**

| violation.suggestedActions[].action | 后端修复策略 |
|-------------------------------------|--------------|
| `REORDER` | 提前 `start_window`（SHIFT_ARRIVAL） |
| `REPLACE` | 替换为 `alternativePoiId` |
| `ASK_USER` | 跳转预订 / 弹窗确认 |

Repair 后行程项 `metadata` 可能含：

- `poi_access_repair`: `"SHIFT_ARRIVAL"` | `"REPLACE"`
- `poi_access_repair_to`: 替代 POI slug

---

## 六、晨间包扩展（Phase 4 新增）

### `GET /api/trips/:tripId/in-trip/offline/morning-pack`

**前置条件**：行程 `status === TRAVELING`，且 `IN_TRIP_EXECUTION_ENABLED=true`

**新增字段 `poiAccessAlerts`**（仅当当日存在非 `FEASIBLE` POI 时返回；否则省略该字段）

```json
{
  "schemaVersion": 1,
  "syncedAt": "2026-07-15T06:00:00.000Z",
  "todayTimeline": {
    "dayNumber": 3,
    "date": "2026-07-15",
    "items": [{ "id": "item-1", "title": "Blue Lagoon", "type": "POI" }]
  },
  "poiAccessAlerts": [
    {
      "itemId": "item-1",
      "poiId": "is.blue_lagoon",
      "poiName": "Blue Lagoon",
      "arrivalTime": "14:00",
      "verdict": "BLOCKED",
      "reason": "Blue Lagoon：该时段已无可用库存",
      "crowdLevel": "HIGH",
      "predictedWaitP50": 30,
      "disclosureLabel": "（基于模型推断）",
      "planB": [
        { "action": "BOOK_NOW", "detail": "改订其他时段" },
        {
          "action": "USE_ALTERNATIVE",
          "detail": "改选 Sky Lagoon",
          "alternativePoiId": "is.sky_lagoon"
        }
      ]
    }
  ]
}
```

**前端建议**

1. 晨间 Wi-Fi 拉包后，若 `poiAccessAlerts.length > 0`，展示顶部横幅或推送  
2. 点击 alert → 调 `GET /poi-access-capacity/evaluate` 刷新详情，或走 Repair 流程  
3. POI 名称匹配由后端从 `title` 解析 slug；无法识别的 POI 不会出现在 alerts 中

---

## 七、冰岛 POI slug 速查

| slug | 名称 |
|------|------|
| `is.landmannalaugar` | Landmannalaugar |
| `is.blue_lagoon` | Blue Lagoon |
| `is.sky_lagoon` | Sky Lagoon |
| `is.skaftafell` | Skaftafell |
| `is.dyrholaey` | Dyrhólaey |
| `is.reynisfjara` | Reynisfjara |
| `is.dettifoss` | Dettifoss |
| `is.gullfoss` | Gullfoss |
| `is.geysir` | Geysir |
| `is.seljalandsfoss` | Seljalandsfoss |
| `is.skogafoss` | Skógafoss |
| `is.jokulsarlon` | Jökulsárlón |
| `is.thingvellir` | Þingvellir |

**替代 POI 映射（`USE_ALTERNATIVE`）**

| 阻塞 POI | 首选替代 |
|----------|----------|
| `is.landmannalaugar` | `is.landmannalaugar.bus` |
| `is.blue_lagoon` | `is.sky_lagoon` |
| `is.skaftafell` | `is.skaftafell.visitor_center` / `is.svinafellsjokull` |
| `is.dyrholaey` | `is.reynisfjara` |
| `is.dettifoss` | `is.dettifoss.east` |
| `is.gullfoss` | `is.geysir` |
| `is.seljalandsfoss` | `is.skogafoss` |

---

## 八、信号来源展示文案

评估结果 `signalSources` / 库存 `signalSource` 建议加后缀说明：

| 来源 | 展示文案 |
|------|----------|
| `BOOKING` / `PARKA` / `BOKUN` | （基于预约库存预测） |
| `MODEL` | （基于模型推断） |
| `USER` | （基于近期游客反馈） |
| `TRAFFIC` | （基于车流数据） |
| `OFFICIAL` | （官方公告） |

---

## 九、TypeScript 类型（可直接复制）

```typescript
export type AccessCapacityVerdict =
  | 'BLOCKED'
  | 'FEASIBLE_WITH_RISK'
  | 'FEASIBLE'
  | 'NEEDS_CONFIRMATION';

export type PlanBAction = 'SHIFT_ARRIVAL' | 'CHANGE_DATE' | 'USE_ALTERNATIVE' | 'BOOK_NOW';

export interface AccessCapacityPlanB {
  action: PlanBAction;
  detail: string;
  suggestedArrivalTime?: string;
  alternativePoiId?: string;
}

export interface AccessCapacityEvaluationResult {
  verdict: AccessCapacityVerdict;
  poiId: string;
  reason: string;
  confidence: 'OFFICIAL' | 'PARTNER' | 'INFERRED';
  signalSources: string[];
  predictedWaitP50?: number;
  predictedWaitP90?: number;
  crowdLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'FULL';
  planB: AccessCapacityPlanB[];
}

export interface PoiAccessMorningAlert {
  itemId: string;
  poiId: string;
  poiName: string;
  arrivalTime: string;
  verdict: AccessCapacityVerdict;
  reason: string;
  planB: AccessCapacityPlanB[];
  crowdLevel?: string;
  predictedWaitP50?: number;
}

export interface RecordPoiExecutionFeedbackInput {
  poiId: string;
  placeId?: number;
  tripId?: string;
  dateISO: string;
  arrivalTime?: string;
  parkingWaitMin?: number;
  visitDurationMin?: number;
  couldNotPark?: boolean;
  abandonedDueToCrowd?: boolean;
  crowdLevelSubjective?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  notes?: string;
}
```

---

## 十、变更摘要（相对 Phase 3）

| 变更 | 说明 |
|------|------|
| 晨间包 + `poiAccessAlerts` | 行中当日 POI 预警 |
| 离线 `poi_execution_feedback` | 无网反馈队列新类型 |
| `planB[].alternativePoiId` | 替代 POI 一键替换 |
| `GET /rules` | 含 `statusOverrides` 动态公告 |
| evaluate `planB` | BLOCKED 时自动附加 `USE_ALTERNATIVE` |
