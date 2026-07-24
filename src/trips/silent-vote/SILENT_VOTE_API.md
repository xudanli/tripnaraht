# Silent Vote 匿名投票接口（iOS 对接）

> 目标 UI：成员 Tab「Silent Vote」列表、方案对比发起投票、匿名选票 + 强度热力图、讨论提示  
> 产品名：**Silent Vote（静默投票）**；选票他人不可见，仅聚合结果公开  
> 实现：`TripSilentVoteController`（`src/trips/silent-vote/trip-silent-vote.controller.ts`）  
> Base：`/api/trips/:tripId/silent-votes`  
> 鉴权：`Authorization: Bearer <token>`（生产必填；非生产无 token 时回落 `anonymous-dev-user`）  
> 更新：2026-07-16

**不要与下列能力混淆：**

| 能力 | 路径 | 说明 |
|------|------|------|
| **Silent Vote（本文）** | `/api/trips/:tripId/silent-votes/*` | 行程内匿名方案/议题投票 |
| 协作聚合 BFF | `/api/trips/:tripId/collab-overview` | 含 `silentVotes` 摘要，不替代列表/详情 |
| 行程中环境事件投票 | `/api/trips/:tripId/in-trip/environment/events/:eventId/vote` | 内部写入 Silent Vote ballot，见 `IN_TRIP_EXECUTION_API.md` |
| Guardian 人格辩论 | 后端内部 | Agent 协商，不是人成员投票 |

---

## 1. iOS 推荐流程

```
① GET  .../collab-overview?include=votes   → 角标 openSilentVoteCount + 摘要列表
② GET  .../silent-votes                    → 完整列表（含聚合）
        ↓ 进入投票详情
③ GET  .../silent-votes/:voteId           → 详情 + 热力图 + discussionHints
④ GET  .../silent-votes/:voteId/ballot/mine → 回显我已选的选项 / 强度
        ↓ 成员投票（仅 status=open）
⑤ PUT  .../silent-votes/:voteId/ballot    → 提交或改票（upsert）
        ↓ 发起人 / Owner
⑥ POST .../silent-votes                   → 自定义议题创建
   或 POST .../from-compare               → 从方案对比拉起
⑦ POST .../:voteId/open                  → draft → open
⑧ POST .../:voteId/close                 → 锁定结果
```

| 场景 | 调用 |
|------|------|
| 成员 Tab 角标 / 摘要 | `GET .../collab-overview?include=votes` |
| 投票列表页 | `GET .../silent-votes` |
| 投票详情 / 热力图 | `GET .../silent-votes/:voteId` |
| 进入详情时回显自己的选择 | `GET .../:voteId/ballot/mine` |
| 选选项 + 拖强度滑杆提交 | `PUT .../:voteId/ballot` |
| 方案对比页「发起投票」 | `POST .../from-compare` |
| 自定义议题 | `POST .../silent-votes` |
| 开放 / 结束 | `POST .../:voteId/open` / `close` |

---

## 2. 接口一览（P0 for iOS）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/trips/:tripId/silent-votes` | 列表（含聚合） |
| GET | `/api/trips/:tripId/silent-votes/:voteId` | 详情 + 聚合 + 讨论提示 |
| GET | `/api/trips/:tripId/silent-votes/:voteId/ballot/mine` | 我的选票 |
| PUT | `/api/trips/:tripId/silent-votes/:voteId/ballot` | 提交 / 更新选票 |
| POST | `/api/trips/:tripId/silent-votes` | 创建投票 |
| POST | `/api/trips/:tripId/silent-votes/from-compare` | 从方案对比创建 |
| POST | `/api/trips/:tripId/silent-votes/:voteId/open` | 开放投票 |
| POST | `/api/trips/:tripId/silent-votes/:voteId/close` | 关闭并锁定 |

### 协作摘要（可选，成员 Tab 首屏）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/trips/:tripId/collab-overview?include=votes` | `openSilentVoteCount` + `silentVotes[]` 摘要 |

---

## 3. 通用约定

### 3.1 请求头

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### 3.2 响应信封

```typescript
{
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}
```

- 列表：`data` 为 `{ items: SilentVoteDetail[]; count: number }`
- 创建 / 详情 / open / close：`data` 直接为 `SilentVoteDetail`（创建 HTTP **201**）
- 提交选票：`data` 为 `SilentVoteBallot`
- 我的选票：`data` 为 `{ submitted: boolean; ballot?: SilentVoteBallot }`

### 3.3 权限

| 操作 | 谁可以 |
|------|--------|
| 列表 / 详情 / 投自己的票 / 看自己的票 | 行程成员（owner 或 collaborator） |
| 创建投票 | 行程成员 |
| `open` / `close` | **发起人** 或 **行程 owner** |

非成员 → `403`；投票不存在 → `404`。

### 3.4 状态机

```
draft ──open──► open ──close──► closed
                  ▲
                  └── autoOpen=true 创建时直接进入
```

| status | UI 建议 |
|--------|---------|
| `draft` | 仅发起人/Owner 可见「开放」；成员不可投 |
| `open` | 展示选票 UI；热力图可能因 k-匿名暂隐 |
| `closed` | 只读结果 + 讨论提示；不可再改票 |

`closed` 后再 `open` → `400`「已关闭的投票无法重新开放」。

---

## 4. 数据模型（Swift 可映射）

```typescript
type SilentVoteStatus = 'draft' | 'open' | 'closed';
type Intensity = 1 | 2 | 3 | 4 | 5; // 对最终采用该选项的在意程度

interface SilentVoteOption {
  id: string;
  label: string;
  planId?: string;       // 关联 planning plan
  summaryRef?: string;
}

interface SilentVoteBallot {
  optionId: string;
  intensity: Intensity;
  submittedAt: string;   // ISO8601
  updatedAt: string;
}

interface SilentVoteOptionDistribution {
  optionId: string;
  label: string;
  count: number;
  share: number;         // 0..1，相对已投票人数
}

interface SilentVoteIntensityHeatmapRow {
  optionId: string;
  label: string;
  buckets: { '1': number; '2': number; '3': number; '4': number; '5': number };
  meanIntensity: number;
  weightedScore: number; // count * meanIntensity，关票时可作排序依据
}

interface SilentVoteDiscussionHint {
  type: 'HIGH_INTENSITY_MINORITY';
  optionId: string;
  optionLabel: string;
  minorityShare: number;
  highIntensityCount: number;
  messageCN: string;     // 可直接展示
  severity: 'medium' | 'high';
}

interface SilentVoteAggregate {
  voteId: string;
  status: SilentVoteStatus;
  eligibleCount: number;      // 可投票成员数（含 owner）
  submittedCount: number;
  participationRate: number;  // submitted / eligible
  kAnonymityApplied: boolean; // true 时分布/热力图为 null
  optionDistribution: SilentVoteOptionDistribution[] | null;
  intensityHeatmap: SilentVoteIntensityHeatmapRow[] | null;
  overallIntensity: {
    mean: number;
    buckets: { '1': number; '2': number; '3': number; '4': number; '5': number };
  } | null;
  discussionHints: SilentVoteDiscussionHint[];
}

interface SilentVoteDetail {
  id: string;
  tripId: string;
  createdBy: string;
  title: string;
  question: string | null;
  status: SilentVoteStatus;
  options: SilentVoteOption[];
  closesAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  aggregate: SilentVoteAggregate;
  myBallotSubmitted: boolean; // 是否已投（不含选项内容，选项内容用 ballot/mine）
}
```

### k-匿名（前端必接）

当 `status === 'open'` 且 `0 < submittedCount < 3` 时：

- `kAnonymityApplied === true`
- `optionDistribution` / `intensityHeatmap` / `overallIntensity` 均为 `null`
- UI 应显示：已有 N 人投票，满 3 人后解锁热力图  
- 仍可展示 `submittedCount`、`participationRate`、`myBallotSubmitted`

`closed` 或票数 ≥ 3 后正常出图；关闭后可能带 `discussionHints`。

---

## 5. 接口详情

### 5.1 `GET /api/trips/:tripId/silent-votes`

列表，按 `createdAt` 降序。

**响应示例：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "sv-uuid",
        "tripId": "trip-uuid",
        "createdBy": "user-1",
        "title": "酒店怎么选？",
        "question": "更在意哪一类？",
        "status": "open",
        "options": [
          { "id": "opt-1", "label": "市中心精品", "planId": "plan-1" },
          { "id": "opt-2", "label": "郊外温泉", "planId": "plan-2" }
        ],
        "closesAt": null,
        "closedAt": null,
        "createdAt": "2026-07-16T02:00:00.000Z",
        "updatedAt": "2026-07-16T02:00:00.000Z",
        "aggregate": {
          "voteId": "sv-uuid",
          "status": "open",
          "eligibleCount": 4,
          "submittedCount": 2,
          "participationRate": 0.5,
          "kAnonymityApplied": true,
          "optionDistribution": null,
          "intensityHeatmap": null,
          "overallIntensity": null,
          "discussionHints": []
        },
        "myBallotSubmitted": true
      }
    ],
    "count": 1
  }
}
```

---

### 5.2 `GET /api/trips/:tripId/silent-votes/:voteId`

与列表单项同结构；进入详情页拉最新聚合。

票数 ≥ 3 且已解锁时，`aggregate` 示例：

```json
{
  "kAnonymityApplied": false,
  "optionDistribution": [
    { "optionId": "opt-1", "label": "市中心精品", "count": 2, "share": 0.5 },
    { "optionId": "opt-2", "label": "郊外温泉", "count": 2, "share": 0.5 }
  ],
  "intensityHeatmap": [
    {
      "optionId": "opt-1",
      "label": "市中心精品",
      "buckets": { "1": 0, "2": 0, "3": 1, "4": 1, "5": 0 },
      "meanIntensity": 3.5,
      "weightedScore": 7
    },
    {
      "optionId": "opt-2",
      "label": "郊外温泉",
      "buckets": { "1": 0, "2": 0, "3": 0, "4": 0, "5": 2 },
      "meanIntensity": 5,
      "weightedScore": 10
    }
  ],
  "overallIntensity": {
    "mean": 4.25,
    "buckets": { "1": 0, "2": 0, "3": 1, "4": 1, "5": 2 }
  },
  "discussionHints": []
}
```

关闭后若出现高强度少数派：

```json
{
  "discussionHints": [
    {
      "type": "HIGH_INTENSITY_MINORITY",
      "optionId": "opt-2",
      "optionLabel": "郊外温泉",
      "minorityShare": 0.25,
      "highIntensityCount": 2,
      "messageCN": "「郊外温泉」得票较少（25%），但有 2 位成员对此选择非常在意，建议进一步讨论。",
      "severity": "high"
    }
  ]
}
```

---

### 5.3 `GET /api/trips/:tripId/silent-votes/:voteId/ballot/mine`

**未投：**

```json
{ "success": true, "data": { "submitted": false } }
```

**已投：**

```json
{
  "success": true,
  "data": {
    "submitted": true,
    "ballot": {
      "optionId": "opt-1",
      "intensity": 4,
      "submittedAt": "2026-07-16T02:10:00.000Z",
      "updatedAt": "2026-07-16T02:15:00.000Z"
    }
  }
}
```

他人选票永不返回。

---

### 5.4 `PUT /api/trips/:tripId/silent-votes/:voteId/ballot`

提交或更新（按 `voteId + userId` upsert）。

**请求体：**

```json
{
  "optionId": "opt-1",
  "intensity": 4
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `optionId` | string | 是 | 必须在该 vote 的 `options[].id` 中 |
| `intensity` | int | 是 | 1–5；超出范围服务端会 clamp |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "optionId": "opt-1",
    "intensity": 4,
    "submittedAt": "2026-07-16T02:10:00.000Z",
    "updatedAt": "2026-07-16T02:15:00.000Z"
  }
}
```

**常见错误：**

| 条件 | HTTP | 消息 |
|------|------|------|
| `status !== open` | 400 | 投票未开放，无法提交选票 |
| 已过 `closesAt` | 400 | 投票已截止 |
| `optionId` 无效 | 400 | 无效选项 … |

投完后建议再 `GET` 详情刷新聚合（勿假设 PUT 会返回热力图）。

---

### 5.5 `POST /api/trips/:tripId/silent-votes`

自定义议题。HTTP **201**。

```json
{
  "title": "明天早餐怎么解决？",
  "question": "可选备注问题",
  "options": [
    { "label": "酒店早餐" },
    { "id": "opt-custom-cafe", "label": "附近咖啡店", "planId": "plan-x" }
  ],
  "autoOpen": true
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | 是 | ≤200 |
| `question` | 否 | ≤1000 |
| `options` | 是 | ≥2；`id` 可省略（服务端生成 `opt-1`…） |
| `autoOpen` | 否 | 默认 `false` → `draft`；`true` → 直接 `open` |

---

### 5.6 `POST /api/trips/:tripId/silent-votes/from-compare`

从方案对比页一键发起。默认 `autoOpen: true`，标题默认「方案选择」。

```json
{
  "planIds": ["plan-uuid-a", "plan-uuid-b"],
  "title": "两套行程选哪个？",
  "question": "综合节奏与预算",
  "autoOpen": true
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `planIds` | 是 | ≥2，须属于该行程 |
| `title` / `question` | 否 | |
| `autoOpen` | 否 | 默认 `true` |

选项自动生成：`id = opt-{planId前8位}`，`label` 取方案 `nameCN` / `name`，否则「方案 A/B…」。

方案缺失 → `404`。

---

### 5.7 `POST /api/trips/:tripId/silent-votes/:voteId/open`

`draft` → `open`。已 `closed` → `400`。非发起人/owner → `403`。

响应：`SilentVoteDetail`。

---

### 5.8 `POST /api/trips/:tripId/silent-votes/:voteId/close`

锁定结果，写入 `closedAt`。已关闭则幂等返回详情。

关票后：

- 禁止再 `PUT ballot`
- 聚合热力图照常展示（票数 ≥ 1）
- 可能出现 `discussionHints`，建议用 Banner / 卡片展示 `messageCN`

---

## 6. 协作 BFF 摘要字段

`GET /api/trips/:tripId/collab-overview?include=votes`

```typescript
{
  openSilentVoteCount: number; // status === 'open' 的数量
  silentVotes: Array<{
    id: string;
    title: string;
    status: string;
    closesAt?: string | null;
  }>;
}
```

角标用 `openSilentVoteCount`；点进列表仍走本文 `GET .../silent-votes`。

---

## 7. iOS UI 映射建议

| UI 元素 | 字段 |
|---------|------|
| 列表标题 | `title` |
| 副文案 | `question` |
| 状态 Chip | `status` |
| 参与进度条 | `aggregate.participationRate` + `submittedCount` / `eligibleCount` |
| 「已投」小勾 | `myBallotSubmitted` |
| 选项按钮 | `options[]`；选中态来自 `ballot/mine` |
| 强度滑杆 1–5 | `intensity`；文案可用「不太在意」…「非常在意」 |
| 柱状/热力 | `aggregate.intensityHeatmap`；`kAnonymityApplied` 时用占位 |
| 得票占比 | `optionDistribution[].share` |
| 关票排序 | 按 `weightedScore` 降序作为「倾向结果」 |
| 讨论提示 Banner | `discussionHints[].messageCN` + `severity` |
| 开放 / 结束按钮 | 仅当当前用户 == `createdBy` 或行程 owner |

### 强度文案建议（可选）

| intensity | 文案 |
|-----------|------|
| 1 | 不太在意 |
| 2 | 略有偏好 |
| 3 | 有倾向 |
| 4 | 比较在意 |
| 5 | 非常在意 |

---

## 8. 错误速查

| HTTP | 场景 |
|------|------|
| 401 | 未登录（生产） |
| 403 | 非成员；或非发起人/owner 操作 open/close |
| 404 | trip / vote / compare 中的 plan 不存在 |
| 400 | 未 open 却投票；已截止；无效 optionId；closed 后再 open |
| 201 | 创建成功 |
| 200 | 其余成功 |

业务异常多数走 Nest 标准异常 message；其余也可能包在 `success: false` + `error.code = INTERNAL_ERROR`。

---

## 9. 关联文档

- [COLLAB_OVERVIEW_API.md](../COLLAB_OVERVIEW_API.md) — 成员 Tab 摘要
- [IN_TRIP_EXECUTION_API.md](../in-trip-execution/IN_TRIP_EXECUTION_API.md) — 环境事件投票（同强度语义）
- [TRIP_WISH_API.md](../wishlist/TRIP_WISH_API.md) — 愿望单（非投票）
