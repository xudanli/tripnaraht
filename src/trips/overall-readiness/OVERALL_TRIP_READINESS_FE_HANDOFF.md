# 整体准备度 · 前端改造清单（Handoff）

> **状态**: 后端可联调  
> **日期**: 2026-07-15  
> **原则**: FE **不改架构**，把「规划进度」主分数换成「整体准备度」卡片 + 准备报告页。  
> **复制类型**: `frontend-trip-detail-tab-api.types.ts` / `frontend-trip-detail-tab-api-client.ts` / `frontend-trip-list-api.types.ts`

---

## 0. 产品一句话

> 主界面不再显示「规划完成 80%」，而显示：**整体准备度 78% · 尚未就绪**

分数与是否就绪分离：有阻塞时显示「已阻塞」，即使分数很高。

---

## 1. 必改页面与字段映射

| UI 位置 | 旧字段（停用主展示） | 新字段 |
|---------|----------------------|--------|
| 行程详情 · 时间轴侧栏 / 顶部主卡 | `overview.planning.progressPercent` | `overview.overallReadiness` |
| 行程列表卡片进度 | `listSummary.progressPercent`（可留兼容） | 优先 `listSummary.readinessScore` + `readinessStateLabelZh` |
| 规划工作台顶栏「规划进度」 | 同 planning progress | 同 overallReadiness / 或深链报告 |

`planning` 对象**保留**，仅作内部 pipeline；**不要**再当用户主分数。

---

## 2. 接口

### 2.1 时间轴首屏（已有）

```http
GET /api/trips/:tripId/timeline-overview?preset=shell
```

`preset=shell` = `stats,readiness`  
`preset=full` 也含 `readiness`

响应关键：

```typescript
overallReadiness?: {
  score: number;                 // 78
  state: 'NEAR_READY' | ...;
  stateLabelZh: string;          // 「接近就绪」细粒度
  displayLabelZh: string;        // 首页主词：「尚未就绪」/「已准备好」/「已阻塞」
  headline: string;              // 「整体准备度 78% · 尚未就绪」
  evidenceConfidence: number;
  blockerCount: number;
  pendingConfirmationCount: number;
  whyNotReady?: string;          // 首要原因一句
  potentialScoreLift?: number;   // 处理优先项预计涨分
  dimensions: Array<{ code; labelZh; score }>; // 路线/住宿/交通/活动/成员
  topPriority?: { title; actionCode?; estimatedScoreLift? };
  reportDeepLink: string;        // → overall-readiness
}
```

### 2.2 准备报告详情（新）

```http
GET /api/trips/:tripId/overall-readiness          # 完整报告
GET /api/trips/:tripId/overall-readiness?view=card
```

Client：

```typescript
import { tripTimelineApi, tripOverallReadinessApi } from '@/api/trip-detail-tab-client';

const overview = await tripTimelineApi.getShellOverview(tripId);
const report = await tripOverallReadinessApi.getReport(tripId);
```

报告首页用 `report.homepage`：

| 字段 | 用途 |
|------|------|
| `headline` | 页头标题 |
| `whyNotReady[]` | 为什么还没好 |
| `mustHandleNow[]` | 必须现在处理（含 `estimatedScoreLift`） |
| `canHandleLater[]` | 可稍后 |
| `potentialScoreLift` | 「处理完预计 +N 分」 |
| `dimensionRows[]` | 五维概览表 |

详情区用 `dimensions.*.checks`、`blockers`、`evidence`。

---

## 3. UI 验收清单（DoD）

### A. 首页 / 时间轴卡片

- [ ] **不再**把圆形/大数字绑到 `planning.progressPercent`
- [ ] 展示 `headline` 或 `score` + `displayLabelZh`
- [ ] 展示 `blockerCount` / `pendingConfirmationCount`（如「1 个阻塞 · 3 个待确认」）
- [ ] 五维迷你条：`dimensions`（路线/住宿/交通/活动/成员）
- [ ] 「优先处理：」用 `topPriority.title`；可展示 `estimatedScoreLift`
- [ ] CTA「查看准备报告」→ `GET overall-readiness` 或路由到报告页
- [ ] `state === 'BLOCKED'` 时视觉强调阻塞，**不要**把 score 改成假低分

### B. 准备报告页

- [ ] 页头：`homepage.headline` + `evidenceConfidence` + `expiredEvidenceCount`
- [ ] 区块顺序：为什么还没好 → 必须现在处理 → 可稍后 → 五维详情
- [ ] 推荐动作可点：映射 `actionCode` / `deepLink`  
  - `CONFIRM_RENTAL_INSURANCE` / `CONFIRM_VEHICLE` → 决策空间  
  - `OPEN_ACCOMMODATION_TAB` → 住宿 Tab  
  - `OPEN_DECISION_SPACE` → 决策队列  
  - `COMPLETE_TRAVEL_STYLE` / `COMPLETE_MONEY_DNA` → 决策画像  
  - `INVITE_MEMBER_CONFIRM` → 成员 Tab
- [ ] 证据列表可读：来源、时间、是否过期（`expiresAt`）

### C. 列表卡

- [ ] 有 `readinessScore` 时优先展示准备度，而不是旧 `progressPercent`
- [ ] `readinessScore == null`：降级旧进度或显示「—」（**禁止假 62%**）
- [ ] 状态文案用 `readinessStateLabelZh`（已是「尚未就绪」类主词）

### D. 决策 apply 后

- [ ] 车型/保险 resolve→apply 后，重新拉 `timeline-overview` 或 `overall-readiness`（后端已清缓存）
- [ ] 分数 / 待确认数应变化

---

## 4. 状态枚举（展示规则）

| `state` | `displayLabelZh`（主词） | `stateLabelZh`（细） |
|---------|--------------------------|----------------------|
| READY | 已准备好 | 已准备好 |
| BLOCKED | 已阻塞 | 已阻塞 |
| NEEDS_REVALIDATION | 需要重新验证 | 需要重新验证 |
| NEAR_READY / IN_PROGRESS / NOT_STARTED | **尚未就绪** | 接近就绪 / 准备中 / 尚未开始 |

卡片主文案用 **`displayLabelZh`**；报告页可同时展示细粒度。

---

## 5. actionCode → 路由建议

| actionCode | 建议跳转 |
|------------|----------|
| `CONFIRM_VEHICLE` | 决策空间 · 车型卡 |
| `CONFIRM_RENTAL_INSURANCE` | 决策空间 · 保险卡 |
| `OPEN_FEASIBILITY_REPORT` | 可执行证明 / Decision Checker |
| `OPEN_ACCOMMODATION_TAB` | 住宿 Tab |
| `BOOK_CORE_ACTIVITY` | 活动 Tab |
| `OPEN_DECISION_SPACE` | 决策空间队列 |
| `INVITE_MEMBER_CONFIRM` / `ASSIGN_MEMBER_ROLES` | 成员 Tab |
| `COMPLETE_TRAVEL_STYLE` / `COMPLETE_MONEY_DNA` | 决策画像 onboarding |

未知 `actionCode`：落到 `reportDeepLink` 或决策空间。

---

## 6. 建议改动文件（前端）

1. `TripDetailTimelineTab` / 侧栏规划进度组件 → Overall Readiness 卡  
2. `TripListCard` 进度字段  
3. 新建 `TripReadinessReportPage`（或 Drawer）消费 `getReport`  
4. 规划工作台顶栏若仍写「规划进度 xx%」一并替换  
5. 复制最新 `frontend-trip-detail-tab-api.*` 与 `frontend-trip-list-api.types.ts`

---

## 7. 后端相关文档

- 产品：`internal-docs/product/OVERALL_TRIP_READINESS.md`
- API：`src/trips/overall-readiness/OVERALL_TRIP_READINESS_API.md`
- Timeline：`src/trips/TIMELINE_OVERVIEW_API.md`
- 决策两壳联调：`src/decision-runtime/decision-cases/DECISION_CASE_BACKEND_HANDOFF.md`

---

## 8. 联调冒烟

```bash
# 壳层卡片
curl -s "$BASE/api/trips/$TRIP_ID/timeline-overview?preset=shell" | jq '.data.overallReadiness'

# 完整报告
curl -s "$BASE/api/trips/$TRIP_ID/overall-readiness" | jq '.data|{score,state,displayLabelZh,homepage}'
```

期望：有 `headline`、`dimensions` 长度 5、`homepage.mustHandleNow` 数组存在。
