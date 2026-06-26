# Group Pulse + Split Orchestrator — 前端接口文档（M10）

> **Global prefix**：`/api`  
> **响应格式**：`{ success: boolean, data?: T, error?: { code, message } }`  
> **鉴权**：生产 Bearer Token + 行程成员；开发环境 `anonymous-dev-user`  
> **Swagger Tag**：`trip-in-trip-pulse` / `trip-in-trip-split`  
> **前置**：`IN_TRIP_EXECUTION_ENABLED=true` + 行程 `TRAVELING` + M10 migration

```bash
npx prisma db execute --schema prisma/schema.prisma \
  --file prisma/migrations/add_in_trip_group_pulse_split.sql
npx prisma generate
```

---

## 一、页面与接口映射

### Group Pulse（`/in-trip/pulse`）

| UI | 接口 | 说明 |
|----|------|------|
| 每日 Mood Check | `POST .../pulse/mood-check` | score 1–5 |
| 节点微反馈 | `POST .../pulse/micro-feedback` | 轻量 1–5 |
| 运动数据同步 | `POST .../pulse/signals/motion` | 步数/速度 |
| 我的五维状态 | `GET .../pulse/my-state` | 体力/情绪/消费/社交/决策疲劳 |
| 团队温度计 | `GET .../pulse/team-thermometer` | 组织者可见成员卡片 |
| 干预卡片 | `GET .../pulse/interventions` | L1–L3 保护性建议 |
| 确认干预 | `POST .../pulse/interventions/:id/ack` | acknowledge / dismiss |

### Split Orchestrator（`/in-trip/split`）

| UI | 接口 | 说明 |
|----|------|------|
| 生成分组方案 | `POST .../split/propose` | 摩擦 pair 默认分组 |
| Session 列表 | `GET .../split/sessions` | 历史 + 活跃 |
| Session 详情 | `GET .../split/sessions/:id` | 路线 + 共享节点 |
| 确认执行 | `POST .../split/sessions/:id/execute` | 组织者 |
| 体验分享 | `POST .../split/sessions/:id/share` | 分组见闻 |
| 汇合更新 | `PATCH .../split/sessions/:id/reunion` | en_route / arrived / completed |
| 位置心跳 | `POST .../split/sessions/:id/location` | 拆队期间（存 session JSON） |

### Today 联动

| 字段 | 来源 |
|------|------|
| `teamThermometer` | `GET /in-trip/today` → `source: group_pulse` |
| `pendingCards.interventions` | 待处理干预数量 |
| `quickActions` 含 `mood_check` | 跳转 Mood Check |

---

## 二、Group Pulse 接口

### `POST /trips/:tripId/in-trip/pulse/mood-check`

```json
{ "score": 4, "source": "mood_check" }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `score` | 1–5 | 必填 |
| `source` | string | 默认 `mood_check` |

**响应**：`MemberStateVector`（五维状态 + `computedAt`）

---

### `POST /trips/:tripId/in-trip/pulse/micro-feedback`

```json
{ "score": 3, "context": "冰川徒步后", "activityId": "item-1" }
```

---

### `POST /trips/:tripId/in-trip/pulse/signals/motion`

```json
{ "steps": 8500, "avgSpeed": 1.2, "restMinutes": 30 }
```

---

### `GET /trips/:tripId/in-trip/pulse/my-state`

**响应示例**：

```json
{
  "success": true,
  "data": {
    "tripId": "trip-1",
    "userId": "u1",
    "dayNumber": 3,
    "physicalLevel": "normal",
    "emotionalLevel": "stable",
    "spendingLevel": "normal",
    "socialLevel": "harmonious",
    "decisionFatigue": "normal",
    "confidenceScore": 0.75,
    "signals": { "moodScore": 4 },
    "computedAt": "2026-07-03T08:00:00.000Z"
  }
}
```

**五维枚举**：

| 维度 | 值 |
|------|-----|
| `physicalLevel` | energetic / normal / fatigued / exhausted |
| `emotionalLevel` | joyful / stable / low / irritable |
| `spendingLevel` | surplus / normal / tight / overspent |
| `socialLevel` | harmonious / normal / subtle / tense |
| `decisionFatigue` | fresh / normal / fatigued / depleted |

---

### `GET /trips/:tripId/in-trip/pulse/team-thermometer`

**权限**：全员可调；`memberCards` 仅含 level 枚举；`visible=true` 时组织者可见详情。

```json
{
  "success": true,
  "data": {
    "tripId": "trip-1",
    "dayNumber": 3,
    "level": "yellow",
    "score": 0.62,
    "factors": [{ "key": "emotional", "message": "团队情绪均值 62%", "weight": 0.4 }],
    "memberCards": [
      { "userId": "u1", "displayName": "小明", "level": "green" }
    ],
    "visible": true,
    "computedAt": "2026-07-03T09:00:00.000Z"
  }
}
```

**温度计色带**：green ≥0.75 · yellow ≥0.55 · orange ≥0.35 · red &lt;0.35

---

### `GET /trips/:tripId/in-trip/pulse/interventions`

```json
{
  "success": true,
  "data": [
    {
      "id": "iv-1",
      "level": 2,
      "ruleId": "TEAM_ORANGE",
      "framing": "positive",
      "messageZh": "团队温度计偏高，建议放慢节奏并增加共识环节",
      "actions": [
        { "id": "slow_pace", "label": "降低今日强度", "actionType": "pace_reduce" }
      ],
      "status": "pending",
      "privateChannelAvailable": true,
      "createdAt": "2026-07-03T10:00:00.000Z"
    }
  ]
}
```

---

### `POST /trips/:tripId/in-trip/pulse/interventions/:interventionId/ack`

```json
{ "action": "acknowledge" }
```

| `action` | 说明 |
|----------|------|
| `acknowledge` | 已知晓 |
| `dismiss` | 暂不处理 |

---

## 三、Split Orchestrator 接口

### `POST /trips/:tripId/in-trip/split/propose`

```json
{ "triggerReason": "manual_propose", "forceSolo": false }
```

**逻辑**：
- 读取锚点摩擦矩阵，高摩擦 pair 分到不同组
- 每组 ≥2 人（除非 `forceSolo: true`）
- 自动生成 1 个 `meal` + 1 个 `meeting_point` 共享节点
- 文案正向，不出现「拆队」

**响应 `SplitPartySessionDetail`**：

```json
{
  "id": "sess-1",
  "status": "proposed",
  "groupCount": 2,
  "groups": [
    {
      "groupId": "group-a",
      "label": "探索 A 组",
      "memberIds": ["u1", "u2"],
      "route": [{ "id": "item-1", "title": "冰川徒步", "type": "ACTIVITY" }],
      "staminaFit": "high"
    }
  ],
  "sharedNodes": [
    { "nodeId": "n1", "type": "meal", "title": "晚餐汇合", "time": "18:00", "participantScope": "all" }
  ],
  "costRouting": { "defaultRule": "group_aa", "sharedNodeRule": "full_trip_aa" }
}
```

---

### `GET /trips/:tripId/in-trip/split/sessions`

返回 `SplitPartySessionSummary[]`（含 `groupCount`、`sharedNodeCount`）。

---

### `POST /trips/:tripId/in-trip/split/sessions/:sessionId/execute`

**权限**：OWNER / EDITOR。将 session 置为 `active`，旧 active session 标记 `reunited`。

---

### `POST /trips/:tripId/in-trip/split/sessions/:sessionId/share`

```json
{ "groupId": "group-a", "text": "A组发现了隐藏瀑布" }
```

---

### `PATCH /trips/:tripId/in-trip/split/sessions/:sessionId/reunion`

```json
{ "status": "arrived", "meetingPoint": "停车场 B" }
```

`status: completed` 时 session 变为 `reunited`。

---

### `POST /trips/:tripId/in-trip/split/sessions/:sessionId/location`

```json
{ "groupId": "group-a", "lat": 64.15, "lng": -21.95 }
```

仅 `status=active` 的 session；位置写入 `groups[].lastLocation`（Phase 1 不落 Redis）。

---

## 四、与 Money Brain 联动

活跃 `split` session 存在时，`POST /money/transactions` 自动路由分摊：

| 场景 | `splitAmongUserIds` |
|------|---------------------|
| 付款人在某分组内 | 该组 `memberIds` |
| 共享节点消费 | 全团成员 |
| 无活跃 session | 请求体原值 |

`transaction.splitGroupId` 写入对应 `groupId`。

---

## 五、推荐 API 封装

```typescript
const pulse = (tripId: string) => `/api/trips/${tripId}/in-trip/pulse`;
const split = (tripId: string) => `/api/trips/${tripId}/in-trip/split`;

export const groupPulseApi = {
  moodCheck: (tripId: string, score: number) =>
    fetch(`${pulse(tripId)}/mood-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score }),
    }),
  myState: (tripId: string) => fetch(`${pulse(tripId)}/my-state`),
  teamThermometer: (tripId: string) => fetch(`${pulse(tripId)}/team-thermometer`),
  interventions: (tripId: string) => fetch(`${pulse(tripId)}/interventions`),
};

export const splitApi = {
  propose: (tripId: string, body?: { triggerReason?: string }) =>
    fetch(`${split(tripId)}/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
  listSessions: (tripId: string) => fetch(`${split(tripId)}/sessions`),
  execute: (tripId: string, sessionId: string) =>
    fetch(`${split(tripId)}/sessions/${sessionId}/execute`, { method: 'POST' }),
};
```

---

## 六、相关文档

- 行中总览：[`IN_TRIP_EXECUTION_API.md`](./IN_TRIP_EXECUTION_API.md)
- Money Brain：[`MONEY_BRAIN_API.md`](./MONEY_BRAIN_API.md)
- 技术设计：[`IN_TRIP_EXECUTION_TECH_DESIGN.md`](./IN_TRIP_EXECUTION_TECH_DESIGN.md) §7、§9
