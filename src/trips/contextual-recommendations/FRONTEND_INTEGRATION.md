# 今日活动推荐 — 前端接入指南

面向 iOS / Web：如何调用**情境化当天微规划**，前端该传什么、页面怎么接。

契约细节见 [CONTEXTUAL_RECOMMENDATIONS_API.md](./CONTEXTUAL_RECOMMENDATIONS_API.md) · ADR [ADR-009](./ADR-009-Contextual-Same-Day-Micro-Planning.md)

**可直接引用的 TS Client：**  
[dto/frontend-contextual-recommendations-api-client.ts](./dto/frontend-contextual-recommendations-api-client.ts)

```ts
import {
  recommendTodayActivities,
  commitTodayActivities,
  fetchTodayActivitiesBootstrap,
} from '.../frontend-contextual-recommendations-api-client';
```

---

## 0. 先分清两个接口

| | 今日微规划（用这个） | 景点探索推荐（别混） |
|--|--|--|
| 正式路径 | `POST .../contextual-recommendations` | `GET .../activities/recommendations` |
| 引导/迁移 | `GET .../today-activities` 或 `GET .../activities/recommendations?mode=same_day` | 默认 GET（勿加 same_day） |
| 用户在问 | 「接下来几小时适合做什么？」 | 「还有哪些景点可以选？」 |
| 返回 | 1 主方案 + ≤2 备选 + 时间表（`apiKind=CONTEXTUAL_SAME_DAY`） | 景点卡片 `groups` |
| 典型场景 | 落地日、晚饭后空档、体力差 | 规划期逛景点 / 加候选 |

**日程「现在适合做什么」必须走 contextual（POST 正式；GET today-activities / mode=same_day 仅迁移）。**

---

## 1. 接口地址

| 端 | Method | Path |
|----|--------|------|
| 通用 | POST | `/api/trips/{tripId}/contextual-recommendations` |
| Mobile 正式 | POST | `/api/mobile/trips/{tripId}/planning/contextual-recommendations` |
| Mobile 引导 GET | GET | `/api/mobile/trips/{tripId}/planning/today-activities` |
| Mobile 迁移 | GET | `/api/mobile/trips/{tripId}/planning/activities/recommendations?mode=same_day` |
| 写入行程 | POST | `.../contextual-recommendations/commit` |

鉴权：`Authorization: Bearer <token>`（非 production 可匿名）。

Mobile 写操作额外要求：

- `If-Match: <contextVersion>`
- `Idempotency-Key: <uuid>`

---

## 2. 前端该提供什么

原则：**只传现场状态与此刻意图**；酒店、家庭结构、明日早发、已确认行程、天气等由后端用 `tripId` 补齐。

### 2.1 必传

| 字段 | 说明 |
|------|------|
| `scenario` | 固定 `"SAME_DAY_ACTIVITY"` |

### 2.2 强烈建议传（现场状态）

放在 `contextDelta`：

| 字段 | 来源 | 示例 |
|------|------|------|
| `currentLocation` | GPS 或用户选中位置 | `{ lat, lng, label }` 或 `"Keflavik Airport"` |
| `currentTime` | 设备本地时间 ISO | `"2026-07-16T16:20:00+00:00"` |
| `availableUntil` / `desiredReturnTime` | 用户愿玩到几点 / 何时回酒店 | `"21:00"` |
| `teamState.energy` | 快捷状态：累 / 还行 / 充沛 | `"LOW"` \| `"MEDIUM"` \| `"HIGH"` |
| `teamState.temporaryConstraints` | 临时状态 chips | `["刚完成长途飞行", "MOTION_SICKNESS"]` |
| `desiredIntensity` | 轻松 / 适中 / 多体验 | `"LIGHT"` \| `"MODERATE"` \| `"FULL"` |
| `preference` | 从意图或 chips | `["吃饭", "简单逛逛", "早点回酒店"]` |
| `tripPhase` | 能判断时传；不确定可省略 | `"ARRIVAL_DAY"` \| `"IN_TRIP"` \| `"DEPARTURE_DAY"` |

### 2.3 可选

| 字段 | 说明 |
|------|------|
| `intent` | 自然语言，如「今晚还有什么适合全家的轻松活动」；后端会编译进 Delta |
| `dayIndex` | 1-based 焦点日；不传则后端按日历/阶段推断 |
| `useLlmIntent` | 默认 `false`；规则不够时才开 LLM 精炼 |
| `useLiveRoutes` | 默认 `false`；当前位置→酒店走实时路线（失败回退启发式） |

### 2.4 不要由前端重复提交（后端权威）

- 已确认雷市酒店、入住信息（后端按焦点日解析；多晚连住会回溯入住日）  
- 一家几口、长期体能限制（画像）  
- Active Plan / 明日 08:30 出发  
- 道路关闭、官方天气 hazard  

漏传现场状态可以工作，但质量会变差（例如不知道人在机场还是已在市区）。  
若后端 `context.sources` 含 `hotel.anchor.missing` 或 `reasonCodes` 含 `HOTEL_ANCHOR_MISSING`，UI 应提示用户确认住宿后再 commit（`gate=NEED_CONFIRM`）。

---

## 3. 推荐请求示例

```http
POST /api/mobile/trips/{tripId}/planning/contextual-recommendations
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "scenario": "SAME_DAY_ACTIVITY",
  "intent": "我们刚落地，一家人都比较累，今晚适合做什么？",
  "dayIndex": 1,
  "contextDelta": {
    "currentLocation": { "lat": 63.985, "lng": -22.605, "label": "Keflavik Airport" },
    "currentTime": "2026-07-16T16:20:00+00:00",
    "desiredReturnTime": "21:00",
    "tripPhase": "ARRIVAL_DAY",
    "desiredIntensity": "LIGHT",
    "teamState": {
      "energy": "LOW",
      "temporaryConstraints": ["刚完成长途飞行", "MOTION_SICKNESS"]
    },
    "preference": ["吃饭", "早点回酒店"]
  }
}
```

最小可用（不推荐上线就这么简）：

```json
{
  "scenario": "SAME_DAY_ACTIVITY",
  "intent": "今晚安排一个轻松活动"
}
```

---

## 4. 响应怎么映射到 UI

页面心智：**Observe → Explain → Suggest → Execute**，不是 POI 瀑布流。

### 4.1 推荐区块

| 响应字段 | UI |
|----------|-----|
| `observation.summary` | 顶部一句观察（「刚抵达…体力偏低…明早要早发」） |
| `observation.facts[]` | 「考虑到」列表（含「组合求解评估 N 组候选」） |
| `recommendation.title` | 主推标题 |
| `recommendation.reasonCodes` | 可映射文案；含 `COMBINATION_SOLVER` 表示已过组合求解 |
| `recommendation.schedule[]` | 时间轴：入住 / 晚餐 / 散步… |
| `recommendation.impact` | 额外驾驶、步行、费用、对明日影响 |
| `recommendation.gate` | 见下节门禁 |
| `recommendation.feasibility` | 是否自动收敛过、违规项（可调试或次要展示） |
| `alternatives[]` | 「更轻松」「更有体验」；**现含完整 `schedule`，切换无需重请求** |
| `context.solverMethod` | `enumeration_v1`（可忽略或用于埋点） |
| `context.candidatesEvaluated` | 评估了几组组合（埋点） |

### 4.2 `gate` 怎么处理

| gate | 前端 |
|------|------|
| `ALLOW` | 显示「加入今天行程」主按钮 |
| `NEED_CONFIRM` | 按钮改为「确认并加入」；commit 时带 `forceConfirm: true` |
| `REJECT` | 禁用写入；提示放宽时间/强度，或点备选再 commit 其 `schedule` |

### 4.3 主操作建议（推荐写法）

```
[ 加入今天行程 ]     → commit 带回 recommendation.schedule
[ 换一个更轻松的 ]   → 本地切到 alternatives 里 character=MOST_RELAXED 的项，刷新时间轴；commit 带其 schedule
[ 想要更有体验 ]     → 同上，character=MORE_EXPERIENCE
[ 问 Nara 调整 ]     → 跳对话，带上 observation + 当前选中 schedule 摘要
```

备选已带 `schedule` / `gate` / `score` 时：**不要**为换备选再调 recommend；直接本地切换选中方案再 commit。
仅在改体力 / 返回时间 / 意图 chips 后才重新 `recommend`。

---

## 5. 写入行程（Commit）

```http
POST /api/mobile/trips/{tripId}/planning/contextual-recommendations/commit
Authorization: Bearer <token>
If-Match: <contextVersion>
Idempotency-Key: <uuid>
Content-Type: application/json
```

### 推荐写法（避免重算漂移）

把刚才推荐结果原样带回：

```json
{
  "variant": "PRIMARY",
  "dayIndex": 1,
  "title": "先入住，再安排轻松晚餐和海滨散步",
  "schedule": [ /* recommendation.schedule */ ],
  "forceConfirm": false
}
```

若 `gate === "NEED_CONFIRM"`：

```json
{ "forceConfirm": true, "schedule": [/* ... */], "variant": "PRIMARY" }
```

### 也可只传 variant（会重算）

```json
{
  "variant": "MOST_RELAXED",
  "dayIndex": 1,
  "contextDelta": { "teamState": { "energy": "LOW" }, "desiredReturnTime": "21:00" }
}
```

成功后：更新本地 `contextVersion` / `planVersion`，刷新日程；可听 WS `trip_context_changed`（`changedSections: ['plan']`）。

### Commit 错误码

| code | 处理 |
|------|------|
| `FEASIBILITY_REJECT` | Toast：当前约束下不可写入；引导改意图/时间 |
| `FEASIBILITY_NEED_CONFIRM` | 弹确认层，用户确认后 `forceConfirm: true` 重试 |
| `CONTEXT_VERSION_CONFLICT` | 拉新 contextVersion 后重试 |
| `NO_TRIP_DAYS` | 提示行程天数未就绪 |

---

## 6. 建议调用时机

| 时机 | 行为 |
|------|------|
| 打开「今天适合做什么」页 | 带 GPS + 当前时间 + 默认体力 chips 请求一次 |
| 用户改体力 / 返回时间 / 偏好 | debounce 后再请求 |
| 用户点备选性格 | 可不重新 recommend，直接 commit 对应 `variant`；或带新 intent 再 recommend |
| 从推送/空档卡片进入 | 同样走本接口，不要走景点推荐 |

快捷状态 chips 示例（写入 `contextDelta`）：

- 体力：累了 / 还行 / 很有劲  
- 临时：刚下飞机、晕车、孩子睡着  
- 意图：吃饭、简单逛逛、早点回酒店  

---

## 7. TypeScript 调用草图

```typescript
type ContextDelta = {
  currentLocation?: { lat: number; lng: number; label?: string } | string;
  currentTime?: string;
  desiredReturnTime?: string;
  availableUntil?: string;
  tripPhase?: 'ARRIVAL_DAY' | 'IN_TRIP' | 'DEPARTURE_DAY' | 'UNKNOWN';
  desiredIntensity?: 'LIGHT' | 'MODERATE' | 'FULL';
  teamState?: {
    energy?: 'LOW' | 'MEDIUM' | 'HIGH';
    temporaryConstraints?: string[];
  };
  preference?: string[];
};

async function recommendToday(tripId: string, input: {
  intent?: string;
  dayIndex?: number;
  contextDelta?: ContextDelta;
}) {
  const res = await fetch(
    `/api/mobile/trips/${tripId}/planning/contextual-recommendations`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scenario: 'SAME_DAY_ACTIVITY',
        intent: input.intent,
        dayIndex: input.dayIndex,
        contextDelta: input.contextDelta,
      }),
    },
  );
  return res.json(); // { success, data: { observation, recommendation, alternatives, context } }
}

async function commitTodayPlan(
  tripId: string,
  body: {
    variant?: 'PRIMARY' | 'MOST_RELAXED' | 'MORE_EXPERIENCE';
    dayIndex?: number;
    title?: string;
    schedule?: Array<{
      type: string;
      startTime: string;
      endTime: string;
      title?: string;
      productId?: string;
    }>;
    forceConfirm?: boolean;
  },
  versions: { contextVersion: number; idempotencyKey: string },
) {
  const res = await fetch(
    `/api/mobile/trips/${tripId}/planning/contextual-recommendations/commit`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'If-Match': String(versions.contextVersion),
        'Idempotency-Key': versions.idempotencyKey,
      },
      body: JSON.stringify(body),
    },
  );
  return res.json();
}
```

---

## 8. 验收清单（前端）

- [ ] 「今日适合做什么」走 `contextual-recommendations`（或临时 `today-activities` / `?mode=same_day`），不是默认 `activities/recommendations`
- [ ] 响应校验 `apiKind === 'CONTEXTUAL_SAME_DAY'`（若走引导/迁移 GET）或存在 `recommendation.schedule`
- [ ] 至少传 `currentTime` + `currentLocation`（或城市/机场文案）+ 体力
- [ ] UI 展示 observation + 一条主方案时间轴 + ≤2 备选，而不是 10 张景点卡
- [ ] 备选带 `schedule` 时本地切换时间轴，不重调 recommend
- [ ] `gate=ALLOW` 可一键加入；`NEED_CONFIRM` 二次确认；`REJECT` 禁止写入
- [ ] Commit **始终回传当前选中**的 `schedule`（主方案或备选）；Mobile 带 `If-Match` / `Idempotency-Key`
- [ ] 改体力 / 返回时间 / 意图后再 recommend；仅换备选不 recommend
- [ ] 写入成功后刷新日程 / 消费 WS `plan` 变更

---

## 9. 和空间路线 Tab 的关系

- **空间路线**：看几何、搜 POI、插点 → [SPATIAL_ROUTE_API.md](../../mobile/SPATIAL_ROUTE_API.md)  
- **今日微规划**：利用接下来几小时 → 本文档  

两者都可能改 Active Plan，但入口与心智不同；今日方案写入后，空间 Tab 应随 `plan` 刷新。
