# PDI-4 决策风格画像与摩擦预警 — 前端接口文档

> **Global prefix**：所有路径前缀为 `/api`（如 `GET /api/trips/:tripId/decision-profiling/onboarding`）  
> **响应格式**：`{ success: boolean, data?: T, error?: { code, message } }`  
> **鉴权**：生产环境 Bearer Token + 行程成员；开发环境 `NODE_ENV !== 'production'` 可用 `anonymous-dev-user`  
> **Swagger Tag**：`trip-decision-profiling`

---

## 后端部署前置（首次）

```bash
npx prisma db execute --schema prisma/schema.prisma \
  --file prisma/migrations/add_trip_decision_profiling.sql
npx prisma db execute --schema prisma/schema.prisma \
  --file prisma/migrations/add_decision_profiling_profile_reuse.sql
# 可选：从历史 quiz 快照回填 user_decision_profiling_profile
# npx prisma db execute --schema prisma/schema.prisma \
#   --file prisma/migrations/backfill_decision_profiling_profile.sql
npx prisma generate
```

未执行 migration 时，本模块接口会 **500**（表不存在）。

成员通过 `POST /api/trips/:tripId/collaborators` 加入后，后端会自动创建 `trip_decision_profiling_status` 记录，前端可在进入行程时拉 `onboarding` 判断是否弹出调查。

---

## 一、页面与接口映射

| UI 区域 | 主要接口 | 说明 |
|--------|---------|------|
| 成员加入后调查入口 / 进度条 | `GET .../onboarding` | 本人 + 团队完成率 |
| Robo-advisor 调查页（题库） | `GET .../quiz` | Travel Style 5 题 + Money DNA 5 题 |
| Travel Style 卡片（本人） | `GET/POST/PATCH .../my/travel-style` | 完整卡片，可微调备注 |
| Money DNA 雷达图（本人） | `GET/POST .../my/money-dna` | 四维度 0–1，仅本人可见 |
| 团队风格墙（脱敏） | `GET .../team/travel-style` | 仅标签 + 兼容提示 |
| 团队消费相似度（脱敏） | `GET .../team/money-dna` | 仅与当前用户的相似度 % |
| 摩擦预警仪表盘 | `GET .../friction-radar` | 矩阵 + 红色预警 + 兼容性评分 |
| 分摊机制共识 | `GET/POST .../split-consensus/*` | 推荐、模拟、选择、全员确认 |

**推荐用户流程**（总时长 5–8 分钟）：

```
onboarding → quiz（两段式 UI）→ POST travel-style → POST money-dna
  → friction-radar → split-consensus（simulate → select → confirm）
```

---

## 二、入职状态

### `GET /trips/:tripId/decision-profiling/onboarding`

**用途**：成员进入行程 / 规划工作台时，决定是否展示调查 Banner 或引导页。

**响应示例**：

```json
{
  "success": true,
  "data": {
    "tripId": "trip-1",
    "userId": "user-a",
    "travelStyleCompleted": false,
    "moneyDnaCompleted": false,
    "quizCompleted": false,
    "teamCompletionRate": 40,
    "reuse": {
      "eligible": true,
      "quizVersion": "ts-md-v1",
      "profileQuizVersion": "ts-md-v1",
      "lastCompletedAt": "2026-05-10T08:00:00.000Z",
      "lastCompletedTripLabel": "冰岛环岛 · 5月",
      "preview": {
        "travelStyleLabel": "理性探索者",
        "moneyDnaSummary": "体验倾向偏高 · 消费节奏均衡",
        "confidence": { "travelStyle": 0.72, "moneyDna": 0.68 }
      },
      "blockedReason": null
    }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `travelStyleCompleted` | boolean | F4.1 是否已提交 |
| `moneyDnaCompleted` | boolean | F4.2 是否已提交 |
| `quizCompleted` | boolean | 两者均完成 |
| `teamCompletionRate` | number | 团队完成率 0–100（验收指标 ≥95%） |
| `reuse` | object? | 跨行程沿用资格（旧客户端可忽略） |
| `reuse.eligible` | boolean | 是否可一键沿用 |
| `reuse.blockedReason` | string? | `no_profile` \| `quiz_version_mismatch` \| `profile_stale` \| `inferred_only` |

**前端逻辑建议**：

- `reuse?.eligible` → 展示「沿用上次画像」入口（需 `VITE_FEATURE_DECISION_PROFILING_REUSE=1`）
- `!quizCompleted` → 展示调查入口（可分段：先 Travel Style，再 Money DNA）
- `teamCompletionRate < 95` → 团队页展示「还有 N 人未完成」提醒
- 全员 `quizCompleted` 后再默认展开 Friction Radar

### `POST /trips/:tripId/decision-profiling/my/reuse-profile`

**用途**：用户显式一键沿用上次正式完成的 Travel Style + Money DNA（P0 两段一起）。

**请求体**：

```json
{
  "sections": ["travel_style", "money_dna"],
  "userNote": "可选备注"
}
```

**成功响应**：`{ onboarding, travelStyle, moneyDna }`，卡片 `source` 为 `reused` / `reused_edited`。

**错误码**：`REUSE_NOT_ELIGIBLE` | `SECTION_ALREADY_COMPLETED` | `FORBIDDEN` | `NOT_FOUND`

---

## 三、调查题库（F4.1 + F4.2）

### `GET /trips/:tripId/decision-profiling/quiz`

**注意**：`tripId` 仅作路由占位，题库与用户无关，可缓存。

**响应示例**：

```json
{
  "success": true,
  "data": {
    "quizVersion": "ts-md-v1",
    "travelStyleQuestions": [
      {
        "id": "ts_q1",
        "section": "travel_style",
        "prompt": "你在冰岛的第3天，原定去冰川徒步，但天气预报说有70%概率看到北极光。你会：",
        "options": [
          { "id": "a", "label": "坚持原计划（冰川徒步已经预订了）", "scores": {} },
          { "id": "b", "label": "立刻改为追极光（机会难得）", "scores": {} },
          { "id": "c", "label": "查一下能否两个都安排", "scores": {} },
          { "id": "d", "label": "问问大家的想法再决定", "scores": {} }
        ]
      }
    ],
    "moneyDnaQuestions": [
      {
        "id": "md_q1",
        "section": "money_dna",
        "prompt": "你理想中的一天旅行预算（不含住宿和大交通）大约是：",
        "options": [
          { "id": "a", "label": "1000元以内，体验为主", "scores": {} },
          { "id": "b", "label": "2000元左右，舒适重要", "scores": {} },
          { "id": "c", "label": "不设上限，难得出来", "scores": {} },
          { "id": "d", "label": "看具体项目，值得就多花", "scores": {} }
        ]
      }
    ],
    "estimatedMinutes": { "min": 5, "max": 8 }
  }
}
```

**UI 要点**：

- **不要**把 `options[].scores` 展示给用户（计分权重，后端专用）
- 采用情境化单选题，一题一屏或卡片滑动均可
- `section` 用于分段进度条：`travel_style`（约 3 分钟）→ `money_dna`（约 2–5 分钟）

---

## 四、Travel Style 卡片（F4.1）

### `POST /trips/:tripId/decision-profiling/my/travel-style`

提交 Travel Style 段答案。

**请求体**：

```json
{
  "answers": [
    { "questionId": "ts_q1", "optionId": "c" },
    { "questionId": "ts_q2", "optionId": "b" }
  ],
  "userNote": "AI说的不完全对，我觉得我更偏向务实但愿意偶尔即兴"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `answers` | 是 | 每题 `{ questionId, optionId }`；建议 5 题全答 |
| `userNote` | 否 | 用户微调备注；有值时 `source` 为 `quiz_edited` |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "userId": "user-a",
    "styleType": "FLEXIBLE_OPTIMIZER",
    "styleLabel": "灵活优化者",
    "coreDrivers": ["多方案并行", "折中优化", "资源最大化"],
    "teamRole": "方案设计师 — 擅长「两个都要」",
    "compatibilityHints": ["与多数风格兼容", "选项过多时需团队限时收敛"],
    "userNote": "…",
    "confidence": 0.72,
    "completedAt": "2026-06-18T10:00:00.000Z",
    "source": "quiz"
  }
}
```

**6 种 `styleType` 枚举**：

| 值 | 中文标签 |
|----|---------|
| `RATIONAL_EXPLORER` | 理性探索者 |
| `EXPERIENCE_SEEKER` | 体验追求者 |
| `HARMONY_COORDINATOR` | 和谐协调者 |
| `SPONTANEOUS_ADVENTURER` | 即兴冒险家 |
| `PRAGMATIC_PLANNER` | 务实规划者 |
| `FLEXIBLE_OPTIMIZER` | 灵活优化者 |

### `GET /trips/:tripId/decision-profiling/my/travel-style`

获取本人完整卡片；未完成时 `data` 为 `null`。

### `PATCH /trips/:tripId/decision-profiling/my/travel-style`

仅更新用户备注（需先 POST 完成调查）。

```json
{ "userNote": "我觉得我更偏向协调者角色" }
```

### `GET /trips/:tripId/decision-profiling/team/travel-style`

**脱敏团队视图** — 不返回 `coreDrivers` 详细分数，仅：

```json
{
  "success": true,
  "data": [
    {
      "userId": "user-a",
      "displayName": "莎莎",
      "styleLabel": "灵活优化者",
      "compatibilityHints": ["与多数风格兼容", "选项过多时需团队限时收敛"]
    }
  ]
}
```

---

## 五、Money DNA 卡片（F4.2）

### `POST /trips/:tripId/decision-profiling/my/money-dna`

**请求体**：同 Travel Style，`answers` 使用 `md_q*` 题目。

**响应示例**：

```json
{
  "success": true,
  "data": {
    "userId": "user-a",
    "vector": {
      "experienceTendency": 0.75,
      "qualityTendency": 0.35,
      "timeValueTendency": 0.25,
      "socialScarcityTendency": 0.6
    },
    "budgetRangeMin": 600,
    "budgetRangeMax": 2000,
    "consumptionPace": "balanced",
    "confidence": 0.68,
    "completedAt": "2026-06-18T10:05:00.000Z"
  }
}
```

**雷达图绑定**（仅本人页）：

| 轴 | 字段 | 展示 |
|----|------|------|
| 体验倾向 | `vector.experienceTendency` | 0–100% |
| 品质倾向 | `vector.qualityTendency` | 0–100% |
| 时间价值倾向 | `vector.timeValueTendency` | 0–100% |
| 社交稀缺性倾向 | `vector.socialScarcityTendency` | 0–100% |

`consumptionPace`：`planned` | `spontaneous` | `balanced` — 可用于「提前规划 vs 即兴消费」标签。

### `GET /trips/:tripId/decision-profiling/my/money-dna`

本人完整数据；未完成时 `data` 为 `null`。

### `GET /trips/:tripId/decision-profiling/team/money-dna`

**脱敏**：不返回向量，仅返回与**当前登录用户**的余弦相似度：

```json
{
  "success": true,
  "data": [
    {
      "userId": "user-b",
      "displayName": "王五",
      "styleSimilarityPct": 62
    }
  ]
}
```

> 当前用户本人不会出现在列表中。若 viewer 未完成 Money DNA，相似度为 0。

---

## 六、摩擦预警仪表盘（F4.3）

### `GET /trips/:tripId/decision-profiling/friction-radar`

**前置**：至少 2 名成员完成 `quizCompleted` 后矩阵才有意义；不足时 `frictionMatrix` 可能为空数组。

**响应示例**：

```json
{
  "success": true,
  "data": {
    "tripId": "trip-1",
    "completionRate": 67,
    "completedCount": 2,
    "memberCount": 3,
    "frictionMatrix": [
      {
        "memberAId": "user-a",
        "memberBId": "user-b",
        "memberAName": "莎莎",
        "memberBName": "王五",
        "overallLevel": "red",
        "cells": [
          {
            "domain": "accommodation",
            "level": "red",
            "score": 0.58,
            "reason": "一方更在意酒店品质，另一方更在意独特体验"
          }
        ]
      }
    ],
    "highRiskAlerts": [
      {
        "id": "user-a:user-b:accommodation",
        "domain": "accommodation",
        "domainLabel": "住宿",
        "level": "red",
        "memberAName": "莎莎",
        "memberBName": "王五",
        "summary": "在住宿方面，莎莎与王五存在显著差异。…",
        "recommendedStrategy": "建议采用混搭方案——城市段满足品质需求…"
      }
    ],
    "compatibility": {
      "budgetOverlapPct": 45,
      "styleSimilarityPct": 62,
      "paceSyncPct": 65,
      "overallScore": 57,
      "band": "needs_negotiation",
      "bandLabel": "需要协商"
    },
    "computedAt": "2026-06-18T10:10:00.000Z"
  }
}
```

### 摩擦矩阵 UI

**8 个 `domain` 枚举**（行/列标题）：

| domain | 中文 |
|--------|------|
| `accommodation` | 住宿 |
| `dining` | 餐饮 |
| `activities` | 活动体验 |
| `transportation` | 交通 |
| `pace` | 行程节奏 |
| `budget` | 预算心理 |
| `planning_style` | 规划方式 |
| `group_decision` | 集体决策 |

**颜色映射**：

| `level` | 颜色 | 含义 |
|---------|------|------|
| `green` | 绿 | 低摩擦 |
| `yellow` | 黄 | 需关注 |
| `red` | 红 | 高风险，展示 `highRiskAlerts` 卡片 |

矩阵为**成员两两组合**（非 N×N 方阵 UI 时，可用列表 + 展开 8 域热力条）。

### 消费兼容性评分

| `band` | `bandLabel` | `overallScore` |
|--------|-------------|----------------|
| `high` | 高度兼容 | ≥ 70 |
| `needs_negotiation` | 需要协商 | 40 – 69 |
| `high_risk` | 高风险，建议深度对齐 | < 40 |

三维度子分：`budgetOverlapPct`、`styleSimilarityPct`、`paceSyncPct`（均可做副标题进度条）。

---

## 七、分摊机制共识（F4.4）

### `GET /trips/:tripId/decision-profiling/split-consensus`

```json
{
  "success": true,
  "data": {
    "tripId": "trip-1",
    "recommendedMode": "split_aa",
    "options": [
      {
        "mode": "split_aa",
        "label": "AA制（即时了结）",
        "description": "每笔消费当场均分，账目清晰。",
        "fitScore": 78,
        "rationale": "适合消费风格相近、关系平等的团队。"
      },
      {
        "mode": "hybrid",
        "label": "混合模式",
        "description": "大交通自理 + 酒店 AA + 餐饮轮流。",
        "fitScore": 65,
        "rationale": "适合复杂团队…",
        "hybridBreakdown": {
          "transportation": "proportional",
          "accommodation": "split_aa",
          "dining": "rotating_treat",
          "activities": "split_aa"
        }
      }
    ],
    "simulation": null,
    "selectedMode": null,
    "confirmations": [
      { "userId": "user-a", "displayName": "莎莎", "confirmedAt": null },
      { "userId": "user-b", "displayName": "王五", "confirmedAt": null }
    ],
    "lockedAt": null,
    "lockedMode": null,
    "allConfirmed": false
  }
}
```

**`mode` 枚举**：

| 值 | 标签 |
|----|------|
| `split_aa` | AA制（即时了结） |
| `rotating_treat` | 轮流请客（人情互惠） |
| `proportional` | 按比例分摊 |
| `hybrid` | 混合模式 |

### `POST /trips/:tripId/decision-profiling/split-consensus/simulate`

输入预估总花费，返回各模式下每人支出分布（用于可视化柱状图/饼图）。

```json
{ "totalEstimate": 50000, "currency": "CNY" }
```

响应中 `data.simulation`：

```json
{
  "totalEstimate": 50000,
  "currency": "CNY",
  "byMode": {
    "split_aa": {
      "members": [
        { "userId": "user-a", "displayName": "莎莎", "estimatedSpend": 25000 },
        { "userId": "user-b", "displayName": "王五", "estimatedSpend": 25000 }
      ],
      "note": "所有共享支出均分"
    },
    "rotating_treat": { "members": [...], "note": "…" },
    "proportional": { "members": [...], "note": "…" },
    "hybrid": { "members": [...], "note": "…" }
  }
}
```

**UI 建议**：用户调整 `totalEstimate` 滑块时 debounce 调用 simulate，切换 `mode` tab 展示对应 `byMode[mode].members`。

### `POST /trips/:tripId/decision-profiling/split-consensus/select`

```json
{ "mode": "hybrid" }
```

已锁定（`lockedAt != null`）时返回 **400**。

### `POST /trips/:tripId/decision-profiling/split-consensus/confirm`

当前用户确认所选方案。需先 `select`。

```json
{}
```

- 每位成员各调一次；`confirmations[].confirmedAt` 更新为 ISO 时间
- **全员确认**后：`allConfirmed: true`，`lockedAt` / `lockedMode` 写入，并同步到 **Travel Wallet**（`trip_wallet_rules`），行中自动按锁定规则分摊

**锁定 → Wallet 映射**：

| `lockedMode` | `trip_wallet_rules.mode` | 备注 |
|--------------|--------------------------|------|
| `split_aa` | `split_aa` | `splitBase` = 成员数 |
| `hybrid` | `by_category` | `categoryRules` 与 `options[].hybridBreakdown` 对齐 |
| `rotating_treat` / `proportional` | `custom` | 无 1:1 钱包 mode |

锁定后 `PUT .../budget/wallet/rule` 返回 **400** `SPLIT_CONSENSUS_LOCKED`。

`GET .../budget/profile?include=wallet` 返回 `wallet.paymentRule`（含 `mode`、`splitBase`、`members`、`categoryRules`）。

**前端状态机**：

```
未选择 → select → 已选择待确认 → confirm（每人）→ allConfirmed → 只读展示 lockedMode
```

---

## 八、错误码

| HTTP | `error.code` | 场景 |
|------|--------------|------|
| 401 | `UNAUTHORIZED` | 未登录 |
| 403 | `FORBIDDEN` | 非行程成员 |
| 400 | `BAD_REQUEST` | 未选分摊方案就 confirm；已锁定仍 select |
| 400 | `SPLIT_CONSENSUS_LOCKED` | 共识锁定后修改 `PUT .../budget/wallet/rule` |
| 404 | `NOT_FOUND` | 行程不存在 |
| 500 | `INTERNAL_ERROR` | 含 DB 表未迁移 |

---

## 九、TypeScript 类型（可直接复制到前端）

```typescript
type DecisionStyleType =
  | 'RATIONAL_EXPLORER'
  | 'EXPERIENCE_SEEKER'
  | 'HARMONY_COORDINATOR'
  | 'SPONTANEOUS_ADVENTURER'
  | 'PRAGMATIC_PLANNER'
  | 'FLEXIBLE_OPTIMIZER';

type FrictionDomain =
  | 'accommodation' | 'dining' | 'activities' | 'transportation'
  | 'pace' | 'budget' | 'planning_style' | 'group_decision';

type FrictionLevel = 'green' | 'yellow' | 'red';

type SplitMechanismMode =
  | 'split_aa' | 'rotating_treat' | 'proportional' | 'hybrid';

type CompatibilityBand = 'high' | 'needs_negotiation' | 'high_risk';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface QuizAnswer { questionId: string; optionId: string }

interface OnboardingStatus {
  tripId: string;
  userId: string;
  travelStyleCompleted: boolean;
  moneyDnaCompleted: boolean;
  quizCompleted: boolean;
  teamCompletionRate: number;
}

interface TravelStyleCard {
  userId: string;
  styleType: DecisionStyleType;
  styleLabel: string;
  coreDrivers: string[];
  teamRole: string;
  compatibilityHints: string[];
  userNote?: string;
  confidence: number;
  completedAt: string;
  source: 'quiz' | 'quiz_edited';
}

interface MoneyDnaCard {
  userId: string;
  vector: {
    experienceTendency: number;
    qualityTendency: number;
    timeValueTendency: number;
    socialScarcityTendency: number;
  };
  budgetRangeMin?: number;
  budgetRangeMax?: number;
  consumptionPace: 'planned' | 'spontaneous' | 'balanced';
  confidence: number;
  completedAt: string;
}
```

---

## 十、快速联调（curl）

```bash
TRIP_ID="your-trip-id"
BASE="http://localhost:3000/api/trips/${TRIP_ID}/decision-profiling"
TOKEN="Bearer <jwt>"

# 1. 入职状态
curl -s -H "Authorization: $TOKEN" "$BASE/onboarding" | jq .

# 2. 拉题库
curl -s -H "Authorization: $TOKEN" "$BASE/quiz" | jq '.data.estimatedMinutes'

# 3. 提交 Travel Style（示例：全选 c）
curl -s -X POST -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"answers":[
    {"questionId":"ts_q1","optionId":"c"},
    {"questionId":"ts_q2","optionId":"c"},
    {"questionId":"ts_q3","optionId":"c"},
    {"questionId":"ts_q4","optionId":"c"},
    {"questionId":"ts_q5","optionId":"c"}
  ]}' "$BASE/my/travel-style" | jq '.data.styleLabel'

# 4. 提交 Money DNA
curl -s -X POST -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"answers":[
    {"questionId":"md_q1","optionId":"b"},
    {"questionId":"md_q2","optionId":"a"},
    {"questionId":"md_q3","optionId":"b"},
    {"questionId":"md_q4","optionId":"b"},
    {"questionId":"md_q5","optionId":"a"}
  ]}' "$BASE/my/money-dna" | jq '.data.vector'

# 5. 摩擦雷达
curl -s -H "Authorization: $TOKEN" "$BASE/friction-radar" | jq '.data.compatibility'

# 6. 分摊模拟 + 选择 + 确认
curl -s -X POST -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"totalEstimate":50000,"currency":"CNY"}' "$BASE/split-consensus/simulate" | jq '.data.simulation.byMode.split_aa'

curl -s -X POST -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"mode":"split_aa"}' "$BASE/split-consensus/select" | jq '.data.selectedMode'

curl -s -X POST -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{}' "$BASE/split-consensus/confirm" | jq '.data.allConfirmed'
```

---

## 十一、与其他模块的关系

| 模块 | 关系 |
|------|------|
| **Process Fairness (F3)** | 摩擦预警可引导用户进入 `preference-rounds` 结构化协商；两者互补，接口独立 |
| **Domain Influence** | 领域认领/权重与决策风格无直接 API 耦合；可在 UI 上并置展示 |
| **Travel Wallet (L3)** | `split-consensus` 全员锁定后写入 `trip_wallet_rules`；行中账本走 `/trips/:tripId/budget-os/wallet` |
| **Money DNA（反馈派生）** | `GET /users/me/money-dna` 为历史行程反馈计算；**本模块 Quiz** 为行前轻量调查，数据源不同 |

---

## 十二、Agent 自动发起调查（`route_and_run`）

**已实现**。成员加入行程后，在其下一次 `route_and_run` 且 Gate 通过时，编排器会自动检测调查完成状态并下发跳转提示（与 F3 `process_fairness` 同级，先于 PLAN 阶段）。

**响应路径**：`result.payload.decision_profiling`（或 `result.decision_profiling`）

**触发条件**：

| 条件 | 行为 |
|------|------|
| 当前用户 `quizCompleted === false` | `triggered: true`，附带 Agent 开场白 + 前端跳转 |
| 当前用户已完成调查 | `triggered: false`，`skippedReason: quiz_already_completed` |
| 非行程成员 | 跳过 |

**响应示例**：

```json
{
  "result": {
    "status": "OK",
    "payload": {
      "decision_profiling": {
        "triggered": true,
        "tripId": "trip-1",
        "userId": "user-b",
        "onboarding": {
          "travelStyleCompleted": false,
          "moneyDnaCompleted": false,
          "quizCompleted": false,
          "teamCompletionRate": 33
        },
        "memberCount": 3,
        "nextStep": "travel_style",
        "promptKind": "first_prompt",
        "agentIntroZh": "欢迎加入这次团队旅行！在正式敲定行程前，我想邀请你完成一次轻量「旅行风格」小调查…",
        "clientNavigation": {
          "route": "decision_profiling_quiz",
          "tripId": "trip-1",
          "step": "travel_style"
        }
      }
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `nextStep` | `travel_style` → `money_dna` → `overview`（两段都完成后不再触发） |
| `promptKind` | `first_prompt` 首次邀请；`reminder` 段间提醒 |
| `agentIntroZh` | 已追加到 Agent 叙述 `user_friendly_summary`，可直接展示或用作 Banner 文案 |
| `clientNavigation.route` | 固定 `decision_profiling_quiz` — 前端路由至调查页 |
| `clientNavigation.step` | 调查页应打开的子步骤 |

**前端处理建议**：

1. 解析 `payload.decision_profiling.triggered === true`
2. 展示 `agentIntroZh`（聊天气泡或顶部 Banner）
3. 提供 CTA 按钮，导航至 `clientNavigation` 对应调查页
4. 调查页根据 `step` 定位到 Travel Style 或 Money DNA 段
5. 与 `process_fairness` 可同时出现：优先展示调查 CTA（行前 onboarding），再展示结构化协商入口

**快速自查（Network）**：

| 场景 | 预期 |
|------|------|
| 新成员加入后首次 `route_and_run` | `decision_profiling.triggered: true`，`nextStep: travel_style` |
| 完成 Travel Style 后再次对话 | `nextStep: money_dna`，`promptKind: reminder` |
| 两段均完成后 | 无 `decision_profiling` 或 `skippedReason: quiz_already_completed` |

---

## 十三、尚未实现（前端预留）

以下验收能力**暂无 API**，后续迭代会补充：

- 摩擦预警卡片反馈：`POST .../friction-radar/alerts/:alertId/feedback`（准确性 / 有用性评分）
- 行前分摊确认 deadline 提醒

前端可先本地记录 UX 反馈，待接口上线后对接。
