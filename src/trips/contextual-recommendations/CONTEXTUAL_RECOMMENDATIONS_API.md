# Contextual Same-Day Recommendations API

**ADR:** [ADR-009](./ADR-009-Contextual-Same-Day-Micro-Planning.md)  
**前端接入（该传什么、怎么接 UI）：** [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md)  
**TS Client：** [frontend-contextual-recommendations-api-client.ts](./dto/frontend-contextual-recommendations-api-client.ts)

情境化当天微规划：前端传 Context Delta，后端补齐权威上下文，返回可执行微行程方案（非景点卡片列表）。

## Endpoints

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/trips/:tripId/contextual-recommendations` | 主接口 |
| POST | `/api/mobile/trips/:tripId/planning/contextual-recommendations` | Mobile 正式别名 |
| GET | `/api/mobile/trips/:tripId/planning/today-activities` | 引导 GET（query → Context Delta） |
| GET | `/api/mobile/trips/:tripId/planning/activities/recommendations?mode=same_day` | 旧入口迁移别名 |

**鉴权:** Bearer JWT（非 production 可匿名 dev user）

默认 `GET .../activities/recommendations`（无 `mode=same_day`）仍是 attraction-explore 景点卡片，**勿混用**。  
落地日夹具：`fixtures/iceland-arrival-day.fixture.ts`。

## Request

```json
{
  "scenario": "SAME_DAY_ACTIVITY",
  "intent": "今晚安排一个适合全家的轻松活动",
  "contextDelta": {
    "currentLocation": { "lat": 63.985, "lng": -22.605, "label": "Keflavik Airport" },
    "currentTime": "2026-07-16T16:20:00+00:00",
    "availableUntil": "21:00",
    "desiredReturnTime": "21:00",
    "tripPhase": "ARRIVAL_DAY",
    "desiredIntensity": "LIGHT",
    "teamState": {
      "energy": "LOW",
      "temporaryConstraints": ["MOTION_SICKNESS", "刚完成长途飞行"]
    },
    "preference": ["吃饭", "简单逛逛", "早点回酒店"]
  }
}
```

| 字段 | 来源 | 说明 |
|------|------|------|
| `scenario` | 前端 | 目前仅 `SAME_DAY_ACTIVITY` |
| `intent` | 前端 | 自然语言意图 → 规则（可选 LLM）编译为 Context Delta |
| `contextDelta.*` | 前端现场 | 显式字段覆盖编译结果 |
| `dayIndex` | 前端可选 | 1-based 焦点日；默认按日历/阶段推断 |
| `useLlmIntent` | 前端可选 | 规则命中不足时 LLM 精炼（默认 false） |
| 酒店 / 家庭 / 明日早发 / Active Plan / 天气 hazard | 后端 | 由 `tripId` 组装 |

## 规划分支

| tripPhase | 策略 |
|-----------|------|
| `ARRIVAL_DAY` | 落地日模板：入住 → 晚餐 → 可选短距散步 |
| `IN_TRIP` / `DEPARTURE_DAY` | 剩余时间窗 + 今晚住宿锚点本地微规划 |
| 其他 | 低决策成本 fallback（酒店周边） |

意图编译命中示例：「我们刚落地，一家人都比较累…九点前回酒店」→ `ARRIVAL_DAY` + `LOW` + `LIGHT` + `21:00`。

## Response

```json
{
  "success": true,
  "data": {
    "scenario": "SAME_DAY_ACTIVITY",
    "observation": {
      "summary": "团队刚抵达冰岛，整体体力偏低，明早需要早出发。",
      "facts": ["今天是落地日", "酒店已确认（雷克雅未克）", "团队当前体力偏低"]
    },
    "recommendation": {
      "title": "先入住，再安排轻松晚餐和海滨散步",
      "reasonCodes": [
        "ARRIVAL_DAY",
        "LOW_TEAM_ENERGY",
        "EARLY_DEPARTURE_TOMORROW",
        "NO_RESERVATION_REQUIRED",
        "LOW_DETOUR",
        "HOTEL_CONFIRMED"
      ],
      "score": 92,
      "schedule": [
        { "type": "HOTEL_CHECK_IN", "startTime": "18:15", "endTime": "18:45", "title": "办理入住、放置行李" },
        { "type": "DINING", "startTime": "19:00", "endTime": "20:00", "title": "酒店附近晚餐" },
        {
          "type": "LIGHT_ACTIVITY",
          "startTime": "20:10",
          "endTime": "20:30",
          "title": "太阳航海者 / 海滨短暂停留",
          "productId": "poi_sun_voyager"
        }
      ],
      "impact": {
        "additionalDrivingMinutes": 4,
        "walkingMinutes": 25,
        "estimatedCost": 12000,
        "currency": "ISK",
        "tomorrowPlanImpact": "NONE"
      },
      "gate": "ALLOW"
    },
    "alternatives": [
      { "title": "晚餐后直接休息", "character": "MOST_RELAXED" },
      { "title": "状态良好时增加哈帕与海滨散步", "character": "MORE_EXPERIENCE" }
    ],
    "context": {
      "tripPhase": "ARRIVAL_DAY",
      "focusDayIndex": 1,
      "hotelCity": "雷克雅未克",
      "energy": "LOW",
      "sources": { "fromDelta": ["..."], "fromBackend": ["..."] }
    }
  }
}
```

## Commit（加入今天行程）

| Method | Path |
|--------|------|
| POST | `/api/trips/:tripId/contextual-recommendations/commit` |
| POST | `/api/mobile/trips/:tripId/planning/contextual-recommendations/commit` |

Mobile 写路径需：

- `If-Match: <contextVersion>`
- `Idempotency-Key: <uuid>`

```json
{
  "variant": "PRIMARY",
  "dayIndex": 1,
  "title": "先入住，再安排轻松晚餐和海滨散步",
  "schedule": [
    { "type": "HOTEL_CHECK_IN", "startTime": "18:15", "endTime": "18:45", "title": "办理入住" },
    { "type": "DINING", "startTime": "19:00", "endTime": "20:00", "title": "附近晚餐" },
    {
      "type": "LIGHT_ACTIVITY",
      "startTime": "20:10",
      "endTime": "20:30",
      "title": "太阳航海者",
      "productId": "poi_sun_voyager"
    }
  ]
}
```

也可只传 `variant`（`PRIMARY` / `MOST_RELAXED` / `MORE_EXPERIENCE`）+ 可选 `contextDelta`，由服务端重算后再写入。优先回传 `schedule` 避免漂移。

写入规则：

- 写入前跑可行性校验；`gate=REJECT` 拒绝；`NEED_CONFIRM` 需 `forceConfirm: true`
- `TRANSFER` 不落库
- 当日已有住宿项时跳过 `HOTEL_CHECK_IN`
- `productId` 尽量解析为 Place；解析不到则仅写 note / placeName
- 成功后 bump `contextVersion` / `planVersion`，WS `changedSections: ['plan']`

## 可行性门禁（Constraint layer）

推荐与 commit 共用轻量约束引擎（非完整 OR-Tools）：

| 类型 | 示例 |
|------|------|
| HARD | 时段重叠、晚于返回截止、开始已过期、高负载 POI、风雨户外、低体力过量步行、晕车长驾驶 |
| SOFT | 明日早发前偏晚、低体力中等步行、有儿童+低体力户外 |

HARD 会尝试修复（去掉户外轻活动并收敛到返回时间）；仍失败则 `gate=REJECT`。  
响应 `recommendation.feasibility` 含 `repaired` / `violations`。

## MVP 范围

- 冰岛 / 雷市住宿 **ARRIVAL_DAY** 规则模板
- **IN_TRIP / DEPARTURE_DAY** 本地剩余时间窗微规划
- 意图：规则编译 + 可选 LLM 精炼（`useLlmIntent`）
- 硬拒绝：教会山、蓝湖远绕、长徒步等高负载选项
- World State `weather.hazard` → 倾向轻松方案（`WEATHER_ADVERSE`）
- **可行性校验 + 自动修复 + commit 门禁**
- **交通 ETA**：当前位置→酒店（冰岛启发式；`useLiveRoutes=true` 或 `CONTEXTUAL_SAME_DAY_LIVE_ROUTES=1` 走实时路线，失败回退）
- **本地候选召回**：酒店附近餐厅 / 轻活动（Place 库），写入 schedule.placeId
- **酒店锚点**：优先焦点日住宿；若无则向前回溯连住入住项（`PRIOR_OVERNIGHT`）；缺失时 `HOTEL_ANCHOR_MISSING` + `gate=NEED_CONFIRM`
- **轻量组合求解**（`enumeration_v1`）：模板 × 本地候选枚举 → 效用分 → feasibility → 选 1 主方案 + ≤2 带 `schedule` 的备选；`reasonCodes` 含 `COMBINATION_SOLVER`
- 默认 1 主方案 + ≤2 备选 + **commit 写路径**
- TS Client：`dto/frontend-contextual-recommendations-api-client.ts`
- 尚不接：完整 OR-Tools（本求解器已覆盖当天微规划组合可执行性）

## Pipeline（当前）

```
Context Delta ⊕ Canonical Snapshot（含 World State 天气）
  → Retriever（ETA + Place 候选）
  → Combination solver（enumeration_v1）
  → Feasibility（硬/软约束 + 修复）
  → Ranking（gate × score）
  → Narrative（observation + reasonCodes）
  → Commit（用户确认写入 Active Plan）
```
