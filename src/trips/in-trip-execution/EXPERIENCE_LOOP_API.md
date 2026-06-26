# Experience Loop — 前端接口文档（M11）

> **路径前缀**：`/api/trips/:tripId/in-trip/experience`  
> **Swagger Tag**：`trip-in-trip-experience`  
> **前置**：`IN_TRIP_EXECUTION_ENABLED=true` + M11 migration

```bash
npx prisma db execute --schema prisma/schema.prisma \
  --file prisma/migrations/add_in_trip_experience_loop.sql
npx prisma generate
```

---

## 一、接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/pending` | 待完成微调查触发器 |
| `POST` | `/pulses` | 提交微调查 |
| `GET` | `/pulses` | 历史分页 |
| `GET` | `/weight-adjustments` | 推荐权重变更 |
| `POST` | `/weight-adjustments/read` | 标记已读 |
| `GET` | `/post-trip-summary` | 行后总结（`COMPLETED`） |

**Today 联动**：`pendingCards.experiencePulses` = `GET /pending` 条数

---

## 二、微调查触发器 `GET /pending`

**权限**：`TRAVELING` + 行程成员

| `triggerType` | 触发条件 |
|---------------|----------|
| `post_activity` | 当日体验类消费 ≥ ¥200 且未反馈 |
| `post_decision` | 24h 内环境 resolve / split 执行 / 再平衡 accept |
| `daily_review` | 当地时间 18:00–21:00 且今日未提交 |
| `split_party` | 分组汇合后 2h 内 |
| `last_day` | 行程最后一天 |

**响应示例**：

```json
{
  "success": true,
  "data": [
    {
      "triggerType": "daily_review",
      "triggerKey": "daily_review:day=3",
      "title": "今日回顾",
      "prompt": "今天整体体验如何？花 30 秒帮我们校准明日推荐",
      "priority": 2
    }
  ]
}
```

---

## 三、提交微调查 `POST /pulses`

```json
{
  "triggerType": "daily_review",
  "expectationConfirmation": 4,
  "emotionalValueScore": 5,
  "senseOfControl": 4,
  "spendWorthIt": 4,
  "teamAtmosphere": 5,
  "freeText": "冰川徒步超预期"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `triggerType` | enum | 必填，与 pending 一致 |
| `activityName` | string | `post_activity` 时建议填写 |
| `expectationConfirmation` 等 | 1–5 | 可选整数 |
| `freeText` | string | 可选 |

**响应**：`ExperiencePulseSummary`，含 `emotionPolarity`（-1..+1 自动计算）

---

## 四、历史 `GET /pulses?limit=30&offset=0`

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 12,
    "limit": 30,
    "offset": 0
  }
}
```

---

## 五、推荐权重 `GET /weight-adjustments`

权重写入 `trip.metadata.inTripRecommendationWeights`，历史在 `inTripWeightAdjustmentHistory`。

```json
{
  "success": true,
  "data": {
    "current": {
      "activityIntensityDelta": 0.2,
      "diningQualityDelta": 0.1,
      "museumDensityDelta": -0.05,
      "bufferDayInserted": false,
      "explanationZh": "体验反馈积极，明日可提高活动强度",
      "appliedAt": "2026-07-03T22:00:00.000Z"
    },
    "history": [
      {
        "appliedAt": "2026-07-03T22:00:00.000Z",
        "patch": { "activityIntensityDelta": 0.2, "diningQualityDelta": 0.1, "museumDensityDelta": -0.05, "explanationZh": "...", "appliedAt": "..." },
        "unread": true
      }
    ]
  }
}
```

**Cron**：每日 22:00 UTC 对 `TRAVELING` 行程跑 `adjustNightly()`（`IN_TRIP_EXPERIENCE_LOOP_ENABLED`）

---

## 六、行后总结 `GET /post-trip-summary`

**权限**：行程成员 + `status = COMPLETED`

首次调用触发生成并缓存至 `trip.metadata.postTripSummary`；`TRAVELING → COMPLETED` 时后端也会异步预生成。

```json
{
  "success": true,
  "data": {
    "tripId": "trip-1",
    "generatedAt": "2026-07-10T10:00:00.000Z",
    "experienceHighlights": [
      {
        "activityName": "冰川徒步",
        "emotionalValueScore": 5,
        "memberId": "u1",
        "quote": "超预期"
      }
    ],
    "spendingReview": {
      "totalSpentCny": 28500,
      "budgetTotal": 30000,
      "usagePercent": 95,
      "topCategory": "experience",
      "currency": "CNY"
    },
    "teamReview": {
      "averageScore": 0.68,
      "levelTrend": [
        { "dayNumber": 1, "level": "green", "score": 0.8 }
      ]
    },
    "profileCalibrations": [
      {
        "userId": "u1",
        "calibrated": true,
        "dominantPersona": "experience",
        "note": "已根据本次行程消费与反馈更新 Money DNA"
      }
    ]
  }
}
```

---

## 七、TypeScript 封装

```typescript
const exp = (tripId: string) => `/api/trips/${tripId}/in-trip/experience`;

export const experienceLoopApi = {
  getPending: (tripId: string) => fetch(`${exp(tripId)}/pending`),
  submitPulse: (tripId: string, body: Record<string, unknown>) =>
    fetch(`${exp(tripId)}/pulses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  listPulses: (tripId: string) => fetch(`${exp(tripId)}/pulses`),
  getWeightAdjustments: (tripId: string) => fetch(`${exp(tripId)}/weight-adjustments`),
  getPostTripSummary: (tripId: string) => fetch(`${exp(tripId)}/post-trip-summary`),
};
```

---

## 八、相关文档

- 行中总览：[`IN_TRIP_EXECUTION_API.md`](./IN_TRIP_EXECUTION_API.md)
- Group Pulse：[`GROUP_PULSE_SPLIT_API.md`](./GROUP_PULSE_SPLIT_API.md)
- 技术设计：[`IN_TRIP_EXECUTION_TECH_DESIGN.md`](./IN_TRIP_EXECUTION_TECH_DESIGN.md) §10
